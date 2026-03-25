"""FastAPI application entry point for Gym Tracker API."""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from .database import Base, SessionLocal, engine
from .routers import analytics, logging, programs, tracker
from .seed_catalog import seed_exercise_catalog


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

    # --- One-time data fixes (idempotent) ---

    # Fix duplicate PUSH session_logs: delete duplicates keeping the one with lowest id
    if not is_sqlite:
        db.execute(text("""
            DELETE FROM session_logs
            WHERE id NOT IN (
                SELECT MIN(id) FROM session_logs
                GROUP BY program_id, week, session_name
            )
        """))
        db.commit()

    # Fix PUSH session date: 2026-03-24 → 2026-03-23 (was logged on wrong date)
    db.execute(text("""
        UPDATE session_logs SET date = '2026-03-23'
        WHERE session_name = 'PUSH' AND date = '2026-03-24' AND week = 1
    """))
    db.execute(text("""
        UPDATE workout_logs SET date = '2026-03-23'
        WHERE program_exercise_id IN (13,14,15,16,17) AND date = '2026-03-24'
    """))
    db.commit()

    # Fix weight precision: 117.9 → 117.93 (was 260 lbs truncated by .toFixed(1))
    db.execute(text("""
        UPDATE workout_logs SET load_kg = 117.93
        WHERE load_kg = 117.9 AND program_exercise_id = 10
    """))
    db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create all database tables on startup and seed exercise catalog."""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        _run_migrations(db)
        seed_exercise_catalog(db)
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

app.include_router(programs.router)
app.include_router(logging.router)
app.include_router(tracker.router)
app.include_router(tracker.workout_router)
app.include_router(analytics.router)


@app.get("/")
def root():
    return {"status": "ok", "message": "Gym Tracker API"}
