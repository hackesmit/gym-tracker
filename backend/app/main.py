"""FastAPI application entry point for Gym Tracker API."""

import os
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from .auth import hash_password
from .database import Base, SessionLocal, engine
from .medal_engine import backfill_consistency_medals, seed_medal_catalog
from .models import User
from .routers import (
    analytics,
    auth,
    cardio,
    chat,
    dashboard,
    friends,
    logging,
    medals,
    programs,
    ranks,
    social,
    tracker,
    vacation,
)
from .seed_catalog import backfill_catalog_bodyweight_kind, seed_exercise_catalog
from .seed_presets import seed_preset_programs


def _run_migrations(db):
    """Add columns that create_all() skips on existing tables.

    create_all() only creates new tables — it never ALTERs existing ones.
    This function adds any missing columns so the ORM model matches the DB.
    Safe to run repeatedly (IF NOT EXISTS / inspect-before-add).
    """
    inspector = inspect(engine)
    is_sqlite = str(engine.url).startswith("sqlite")

    def _ensure_column(table, column, col_type, nullable=True, default=None, fk=None):
        existing = {c["name"] for c in inspector.get_columns(table)}
        if column in existing:
            return
        if is_sqlite:
            # SQLite doesn't support IF NOT EXISTS on ADD COLUMN, but we
            # already checked via inspector.
            stmt = f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"
            if default is not None:
                stmt += f" DEFAULT {default}"
            db.execute(text(stmt))
        else:
            stmt = f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {col_type}"
            if default is not None:
                stmt += f" DEFAULT {default}"
            db.execute(text(stmt))
        db.commit()

    # workout_logs: session_log_id added after initial table creation
    _ensure_column("workout_logs", "session_log_id", "INTEGER", nullable=True)
    _ensure_column("workout_logs", "is_bodyweight", "BOOLEAN", default="false")
    _ensure_column("workout_logs", "is_dropset", "BOOLEAN", default="false")
    _ensure_column("workout_logs", "dropset_load_kg", "FLOAT", nullable=True)
    _ensure_column("workout_logs", "added_load_kg", "FLOAT", nullable=True)
    _ensure_column("workout_logs", "is_true_1rm_attempt", "BOOLEAN", default="false")
    _ensure_column("workout_logs", "completed_successfully", "BOOLEAN", default="true")

    # exercise_catalog: bodyweight_kind drives the new Logger input layout
    # (pure / weighted_capable / NULL). Backfill values are set in
    # seed_catalog.py and a one-shot UPDATE function — see Task 6.
    _ensure_column("exercise_catalog", "bodyweight_kind", "VARCHAR")

    # programs: share_code for cross-user program sharing
    _ensure_column("programs", "share_code", "VARCHAR")
    try:
        db.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_programs_share_code "
            "ON programs (share_code)"
        ))
        db.commit()
    except Exception:
        db.rollback()

    # users: new auth fields
    _ensure_column("users", "username", "VARCHAR")
    _ensure_column("users", "email", "VARCHAR")
    _ensure_column("users", "password_hash", "VARCHAR")
    _ensure_column("users", "last_login_at", "TIMESTAMP")
    _ensure_column("users", "manual_1rm", "JSON" if not is_sqlite else "TEXT")

    # muscle_scores: 2026-04-22 ladder rewrite — subdivision index + continuous
    # ELO score columns. Default 0 so existing rows are valid until the next
    # recompute_for_user call overwrites them.
    _ensure_column("muscle_scores", "sub_index", "INTEGER", default="0")
    _ensure_column("muscle_scores", "elo", "FLOAT", default="0")

    # medals: category column added when the catalog expanded from 11 to 21
    # medals (adding Endurance 5K/10K, Strength PL Total / Relative, Most
    # Sessions All-Time, Perfect Week, and the Performance trio).
    _ensure_column("medals", "category", "VARCHAR")

    # Compound indexes for dashboard / analytics performance
    index_stmts = [
        "CREATE INDEX IF NOT EXISTS idx_workout_logs_user_date ON workout_logs (user_id, date)",
        "CREATE INDEX IF NOT EXISTS idx_session_logs_user_date ON session_logs (user_id, date)",
        "CREATE INDEX IF NOT EXISTS idx_body_metrics_user_date ON body_metrics (user_id, date)",
        "CREATE INDEX IF NOT EXISTS idx_cardio_logs_user_date ON cardio_logs (user_id, date)",
        "CREATE INDEX IF NOT EXISTS idx_achievements_user ON achievements (user_id)",
        "CREATE INDEX IF NOT EXISTS idx_feed_events_user_created ON feed_events (user_id, created_at)",
    ]
    if not is_sqlite:
        index_stmts += [
            "CREATE INDEX IF NOT EXISTS ix_workout_logs_user_id ON workout_logs (user_id)",
            "CREATE INDEX IF NOT EXISTS ix_workout_logs_date ON workout_logs (date)",
            "CREATE INDEX IF NOT EXISTS ix_program_exercises_canonical ON program_exercises (exercise_name_canonical)",
            "CREATE INDEX IF NOT EXISTS ix_session_logs_program_id ON session_logs (program_id)",
        ]
    for stmt in index_stmts:
        try:
            db.execute(text(stmt))
        except Exception:
            pass
    db.commit()


def _run_bw_migration_once(db):
    """Run the BW input migration exactly once across deploys.

    Gated by a row in `migration_log`. The migration body itself is also
    idempotent (skips audited log_ids), so this gate is belt-and-suspenders
    plus avoids the per-row scan on every cold start.
    """
    from .bw_migration import run_bw_migration
    from .models import MigrationLog

    name = "bw_input_2026_04"
    existing = db.query(MigrationLog).filter_by(name=name).first()
    if existing is not None:
        return
    summary = run_bw_migration(db)
    db.add(MigrationLog(name=name))
    db.commit()
    print(
        f"BW migration: touched {summary.get('touched', 0)} logs. "
        f"Aragorn corrections: {summary.get('aragorn_correction', 0)}. "
        f"Pure-BW backfills: {summary.get('pure_bw_backfilled', 0)}. "
        f"No-BW-skipped: {summary.get('no_bw_skipped', 0)}.",
        flush=True,
    )


def _run_pure_load_cleanup_once(db):
    """One-shot: zero out load_kg on residual pure-BW WorkoutLog rows.
    Gated by its own migration_log row. Reversible via the existing
    rollback endpoint (rollback walks bw_migration_audit and restores
    every old_load_kg).
    """
    from .bw_migration import run_pure_load_kg_cleanup
    from .models import MigrationLog

    name = "pure_load_kg_cleanup_2026_04"
    if db.query(MigrationLog).filter_by(name=name).first() is not None:
        return
    summary = run_pure_load_kg_cleanup(db)
    db.add(MigrationLog(name=name))
    db.commit()
    print(
        f"BW migration: zeroed load_kg on {summary.get('touched', 0)} pure-BW logs.",
        flush=True,
    )


def _recompute_all_ranks_once(db):
    """One-shot rank recompute after the BW migration's data corrections.

    The BW migration mutates WorkoutLog rows but does NOT refresh MuscleScore.
    Without this, users who haven't logged in since the deploy keep their
    pre-migration rank (e.g. Aragorn stays Champion until he opens the app).

    Gated separately so it runs exactly once after the migration ships,
    independently of subsequent migration retries.
    """
    from .models import MigrationLog
    from .rank_engine import recompute_all

    name = "bw_recompute_after_migration_2026_04"
    if db.query(MigrationLog).filter_by(name=name).first() is not None:
        return
    summary = recompute_all(db)
    db.add(MigrationLog(name=name))
    db.commit()
    print(
        f"BW migration: recomputed ranks for {summary['processed']} users. "
        f"Failed: {len(summary['failed'])}.",
        flush=True,
    )
    for uid, err in summary["failed"]:
        print(f"  recompute_all failure: user_id={uid} {err}", flush=True)


def _backfill_default_user(db):
    """Ensure a user named 'hackesmit' exists with a password set.

    - If a user exists but has no password_hash (pre-auth data), upgrade it.
    - Otherwise if no user at all, create hackesmit/password.
    """
    user = db.query(User).first()
    if user:
        if not user.password_hash:
            # Upgrade the existing single user in place
            user.username = user.username or "hackesmit"
            user.password_hash = hash_password("password")
            if not user.name:
                user.name = "hackesmit"
            db.commit()
    else:
        u = User(
            username="hackesmit",
            name="hackesmit",
            password_hash=hash_password("password"),
            preferred_units="kg",
        )
        db.add(u)
        db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create all database tables on startup and seed exercise catalog."""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        _run_migrations(db)
        seed_exercise_catalog(db)
        backfill_catalog_bodyweight_kind(db)
        seed_medal_catalog(db)
        _backfill_default_user(db)
        _run_bw_migration_once(db)
        _run_pure_load_cleanup_once(db)
        _recompute_all_ranks_once(db)
        seed_preset_programs(db)
        backfill_consistency_medals(db)
    finally:
        db.close()
    yield


app = FastAPI(title="Gym Tracker API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("ALLOWED_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(programs.router)
app.include_router(logging.router)
app.include_router(tracker.router)
app.include_router(tracker.workout_router)
app.include_router(analytics.router)
app.include_router(vacation.router)
app.include_router(cardio.router)
app.include_router(friends.router)
app.include_router(medals.router)
app.include_router(ranks.router)
app.include_router(social.router)
app.include_router(dashboard.router)
app.include_router(chat.router)


@app.get("/")
def root():
    return {"status": "ok", "message": "Gym Tracker API"}
