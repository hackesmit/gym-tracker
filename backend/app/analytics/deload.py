"""Deload detection analytics – identifies stagnation and recommends deload weeks."""

from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy.orm import Session

from ..models import BodyMetric, ProgramExercise, WorkoutLog
from .recovery import calculate_recovery_score


# ---------------------------------------------------------------------------
# e1RM (Epley formula)
# ---------------------------------------------------------------------------

def _e1rm(weight: float, reps: int) -> float:
    """Estimated 1-rep max using Epley formula."""
    if reps < 1 or weight <= 0:
        return 0.0
    if reps == 1:
        return weight
    return weight * (1 + reps / 30)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _best_e1rm_per_session(
    db: Session, exercise_name: str, user_id: int, since: date,
) -> list[dict]:
    """Return the best e1RM per workout date for a given exercise.

    Only considers dates on or after *since*.  Returns list of dicts sorted by
    date: [{"date": date, "best_e1rm": float}, ...]
    """
    rows = (
        db.query(WorkoutLog.date, WorkoutLog.load_kg, WorkoutLog.reps_completed)
        .join(ProgramExercise, WorkoutLog.program_exercise_id == ProgramExercise.id)
        .filter(
            ProgramExercise.exercise_name_canonical == exercise_name,
            WorkoutLog.user_id == user_id,
            WorkoutLog.date >= since,
        )
        .order_by(WorkoutLog.date)
        .all()
    )

    by_date: dict[date, float] = defaultdict(float)
    for r in rows:
        e1rm = _e1rm(r.load_kg, r.reps_completed)
        if e1rm > by_date[r.date]:
            by_date[r.date] = e1rm

    return [
        {"date": d, "best_e1rm": round(by_date[d], 2)}
        for d in sorted(by_date)
    ]


def _is_stagnated(sessions: list[dict], min_sessions: int = 3) -> bool:
    """Check if the last *min_sessions* sessions show < 0.5% improvement or regression.

    We look at the tail of the list.  If the best e1RM across those sessions
    has not improved by >= 0.5% relative to the first of the window, we flag
    stagnation.
    """
    if len(sessions) < min_sessions:
        return False

    window = sessions[-min_sessions:]
    first_e1rm = window[0]["best_e1rm"]
    if first_e1rm <= 0:
        return False

    # Check if ANY subsequent session improved by >= 0.5%
    for s in window[1:]:
        pct_change = (s["best_e1rm"] - first_e1rm) / first_e1rm * 100
        if pct_change >= 0.5:
            return False

    return True


def _avg_recovery_score(db: Session, user_id: int, days: int = 7) -> float | None:
    """Compute average recovery score from body_metrics over last N days.

    Uses the same formula as calculate_recovery_score in recovery.py
    (30/25/20/25 weighting) for consistency. Since we don't have per-muscle
    rest data here, we use a default of 1.5 days rest for the rest component.
    """
    cutoff = date.today() - timedelta(days=days)
    metrics = (
        db.query(BodyMetric)
        .filter(BodyMetric.user_id == user_id, BodyMetric.date >= cutoff)
        .all()
    )
    if not metrics:
        return None

    scores: list[float] = []
    for m in metrics:
        result = calculate_recovery_score(
            sleep_hours=m.sleep_hours or 7.0,
            soreness=m.soreness_level or 3,
            stress=m.stress_level or 3,
            days_since_last_session_for_muscle_group=1.5,  # reasonable default
        )
        scores.append(result["total_score"])

    return round(sum(scores) / len(scores), 1) if scores else None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_deload_check(db: Session, user_id: int = 1) -> dict:
    """Analyse recent training data and recommend a deload if warranted.

    Checks:
    1. e1RM stagnation/regression over last 3+ consecutive sessions per exercise
       (within the last 6 weeks).
    2. Average recovery score below 50 over the last 7 days.

    Returns a dict matching the endpoint response schema.
    """
    today = date.today()
    six_weeks_ago = today - timedelta(weeks=6)

    # --- Gather distinct exercises logged in the window ---------------------
    exercise_names = (
        db.query(ProgramExercise.exercise_name_canonical)
        .join(WorkoutLog, WorkoutLog.program_exercise_id == ProgramExercise.id)
        .filter(
            WorkoutLog.user_id == user_id,
            WorkoutLog.date >= six_weeks_ago,
        )
        .distinct()
        .all()
    )

    stagnated_exercises: list[str] = []
    reasons: list[str] = []

    for (name,) in exercise_names:
        sessions = _best_e1rm_per_session(db, name, user_id, since=six_weeks_ago)
        if len(sessions) < 4:
            continue  # not enough data to judge
        if _is_stagnated(sessions, min_sessions=3):
            stagnated_exercises.append(name)

    if stagnated_exercises:
        if len(stagnated_exercises) == 1:
            reasons.append(
                f"3+ weeks stagnation on {stagnated_exercises[0]}"
            )
        else:
            reasons.append(
                f"3+ weeks stagnation on {len(stagnated_exercises)} exercises "
                f"({', '.join(stagnated_exercises[:3])})"
            )

    # --- Recovery check -----------------------------------------------------
    avg_recovery = _avg_recovery_score(db, user_id, days=7)
    low_recovery = avg_recovery is not None and avg_recovery < 50
    if low_recovery:
        reasons.append(f"Average recovery score {avg_recovery}/100 over last 7 days")

    # --- Decision -----------------------------------------------------------
    deload_recommended = bool(stagnated_exercises) or low_recovery

    suggestion: str | None = None
    if deload_recommended:
        suggestion = (
            "Consider reducing volume by 40-50% and intensity by 10-15% for 1 week "
            "while maintaining movement patterns."
        )

    return {
        "deload_recommended": deload_recommended,
        "reasons": reasons,
        "stagnated_exercises": stagnated_exercises,
        "avg_recovery_score": avg_recovery,
        "weeks_since_last_deload": None,  # placeholder for future tracking
        "suggestion": suggestion,
    }
