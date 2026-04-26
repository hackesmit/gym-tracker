"""One-shot migration: backfill load_kg/added_load_kg on bodyweight-class
WorkoutLog rows. Audits every change into bw_migration_audit. Idempotent —
the audit table itself is the dedup signal (never re-touch a log_id that
already has an audit row from a previous run).

Exported entry points:
    run_bw_migration(db)               — run the migration
    rerun_bw_migration_for_user(db, user_id) — admin re-run for a single user
                                         after they backfill bodyweight
"""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from .models import (
    BodyMetric,
    BwMigrationAudit,
    ExerciseCatalog,
    ProgramExercise,
    User,
    WorkoutLog,
)

ARAGORN_BAND_LOW = 0.85
ARAGORN_BAND_HIGH = 1.15


def _bw_at_log_date(
    db: Session, user_id: int, current_bw: float | None, log_date: date,
) -> float | None:
    """Resolve user's BW as of `log_date`. Latest BodyMetric on or before
    the log date wins; fall back to user.bodyweight_kg if none."""
    latest = (
        db.query(BodyMetric)
        .filter(BodyMetric.user_id == user_id, BodyMetric.date <= log_date)
        .order_by(BodyMetric.date.desc())
        .first()
    )
    if latest and latest.bodyweight_kg and latest.bodyweight_kg > 0:
        return float(latest.bodyweight_kg)
    if current_bw and current_bw > 0:
        return float(current_bw)
    return None


def _process_log(
    log: WorkoutLog, kind: str, user_bw: float | None,
) -> tuple[str, float | None, float | None] | None:
    """Decide what to do with one log. Returns (reason, new_load_kg,
    new_added_load_kg) or None if the log should be skipped entirely
    (no audit row)."""
    if user_bw is None:
        return ("no_bw_skipped", None, None)

    old_load = float(log.load_kg or 0.0)

    if kind == "pure":
        if old_load <= 0:
            return ("pure_bw_backfilled", user_bw, 0.0)
        # Pre-existing nonzero load — likely vested pushup. Leave alone.
        return ("pure_with_nonzero_load_skipped", None, None)

    if kind == "weighted_capable":
        if old_load <= 0:
            return ("weighted_capable_zero_load", user_bw, 0.0)
        if ARAGORN_BAND_LOW * user_bw <= old_load <= ARAGORN_BAND_HIGH * user_bw:
            return ("aragorn_correction", user_bw, 0.0)
        return ("weighted_capable_added_promoted", user_bw + old_load, old_load)

    return None  # external load — no action


def run_bw_migration(db: Session, *, only_user_id: int | None = None) -> dict:
    """Audit + backfill all bodyweight-class WorkoutLogs.

    Idempotent: skips logs that already have a BwMigrationAudit row from a
    prior run. `only_user_id` scopes the run to a single user (admin re-run).

    Returns a summary dict with per-reason counts.
    """
    kind_by_canonical: dict[str, str] = {}
    for cat in (
        db.query(ExerciseCatalog)
        .filter(ExerciseCatalog.bodyweight_kind.isnot(None))
        .all()
    ):
        kind_by_canonical[cat.canonical_name] = cat.bodyweight_kind

    if not kind_by_canonical:
        return {"touched": 0}

    audit_q = db.query(BwMigrationAudit.log_id)
    if only_user_id is not None:
        audit_q = audit_q.filter(BwMigrationAudit.user_id == only_user_id)
    already_audited = {row.log_id for row in audit_q.all()}

    q = (
        db.query(WorkoutLog, ProgramExercise.exercise_name_canonical)
        .join(ProgramExercise, WorkoutLog.program_exercise_id == ProgramExercise.id)
        .filter(
            ProgramExercise.exercise_name_canonical.in_(list(kind_by_canonical.keys()))
        )
    )
    if only_user_id is not None:
        q = q.filter(WorkoutLog.user_id == only_user_id)

    summary: dict[str, int] = {"touched": 0}
    user_bw_cache: dict[tuple[int, date], float | None] = {}

    for log, canonical in q.all():
        if log.id in already_audited:
            continue
        kind = kind_by_canonical.get(canonical)
        if kind is None:
            continue

        cache_key = (log.user_id, log.date)
        if cache_key not in user_bw_cache:
            u = db.get(User, log.user_id)
            user_bw_cache[cache_key] = _bw_at_log_date(
                db, log.user_id, u.bodyweight_kg if u else None, log.date,
            )
        user_bw = user_bw_cache[cache_key]

        outcome = _process_log(log, kind, user_bw)
        if outcome is None:
            continue
        reason, new_load_kg, new_added_kg = outcome

        old_load = float(log.load_kg or 0.0)
        if new_load_kg is not None:
            log.load_kg = new_load_kg
        if new_added_kg is not None:
            log.added_load_kg = new_added_kg

        db.add(BwMigrationAudit(
            log_id=log.id,
            user_id=log.user_id,
            exercise_name=canonical,
            old_load_kg=old_load,
            new_load_kg=new_load_kg,
            new_added_load_kg=new_added_kg,
            reason=reason,
        ))
        summary["touched"] += 1
        summary[reason] = summary.get(reason, 0) + 1

    db.commit()
    return summary


def rerun_bw_migration_for_user(db: Session, user_id: int) -> dict:
    """Admin re-run: re-process this user's logs, picking up any newly
    set bodyweight. Skips logs that were already audited (so it's safe to
    call multiple times)."""
    return run_bw_migration(db, only_user_id=user_id)
