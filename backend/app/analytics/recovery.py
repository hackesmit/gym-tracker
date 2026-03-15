"""Recovery score analytics – per-muscle fatigue tracking and readiness scoring."""

from datetime import date, timedelta

from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session

from ..models import BodyMetric, ExerciseCatalog, ProgramExercise, User, WorkoutLog

# ---------------------------------------------------------------------------
# MRV thresholds (Maximum Recoverable Volume – weekly sets)
# Aligned with VOLUME_LANDMARKS in volume.py for consistency.
# ---------------------------------------------------------------------------
MRV_THRESHOLDS: dict[str, int] = {
    "chest": 25,
    "back": 25,
    "shoulders": 22,
    "quads": 22,
    "hamstrings": 20,
    "glutes": 20,
    "biceps": 20,
    "triceps": 20,
    "calves": 20,
    "abs": 18,
    "traps": 20,
    "forearms": 16,
}


# ---------------------------------------------------------------------------
# Pure calculation (no DB required)
# ---------------------------------------------------------------------------

def calculate_recovery_score(
    sleep_hours: float,
    soreness: int,
    stress: int,
    days_since_last_session_for_muscle_group: float,
) -> dict:
    """Compute a 0-100 recovery score from subjective + rest inputs.

    Components (max 100):
        sleep:    0-30  (based on fraction of 8h target)
        soreness: 0-25  (lower soreness = higher score; input 1-5)
        stress:   0-20  (lower stress = higher score; input 1-5)
        rest:     0-25  (more rest days = higher score, caps at 3 days)
    """
    # Clamp inputs to valid ranges to prevent scores exceeding component maximums
    sleep_hours = max(0.0, sleep_hours)
    soreness = max(1, min(5, soreness))
    stress = max(1, min(5, stress))
    days_since_last_session_for_muscle_group = max(0.0, days_since_last_session_for_muscle_group)

    sleep_score = min(sleep_hours / 8.0, 1.0) * 30
    soreness_score = (5 - soreness) / 4 * 25
    stress_score = (5 - stress) / 4 * 20
    rest_score = min(days_since_last_session_for_muscle_group / 3, 1.0) * 25
    total = sleep_score + soreness_score + stress_score + rest_score

    return {
        "total_score": round(total, 1),
        "components": {
            "sleep": round(sleep_score, 1),
            "soreness": round(soreness_score, 1),
            "stress": round(stress_score, 1),
            "rest": round(rest_score, 1),
        },
        "recommendation": _get_recommendation(total),
    }


def _get_recommendation(score: float) -> str:
    if score >= 80:
        return "Fully recovered. Attempt PRs or top-end RPE targets."
    if score >= 60:
        return "Adequately recovered. Train normally at prescribed RPE."
    if score >= 40:
        return (
            "Partially recovered. Consider reducing volume by 1 set per "
            "exercise or dropping RPE by 1."
        )
    return "Under-recovered. Consider active recovery or deload-intensity session."


# ---------------------------------------------------------------------------
# Fatigue status helper
# ---------------------------------------------------------------------------

def _fatigue_status(sets: int, mrv: int) -> str:
    """Classify fatigue based on percentage of MRV used."""
    if mrv <= 0:
        return "green"
    ratio = sets / mrv
    if ratio > 0.90:
        return "red"
    if ratio >= 0.70:
        return "yellow"
    return "green"


# ---------------------------------------------------------------------------
# Full recovery status (DB-backed)
# ---------------------------------------------------------------------------

def get_recovery_status(db: Session, user_id: int = 1) -> dict:
    """Build a complete recovery report for the user.

    1. Get latest body_metrics entry (sleep, stress, soreness).
    2. For each muscle group, count working sets logged in the last 7 days.
    3. Compare set counts to MRV thresholds.
    4. Calculate days since last session per muscle group.
    5. Compute overall recovery score and return per-muscle fatigue map.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise ValueError(f"User {user_id} not found")

    today = date.today()
    seven_days_ago = today - timedelta(days=7)

    # ---- Latest body metrics ------------------------------------------------
    latest_metric = (
        db.query(BodyMetric)
        .filter(BodyMetric.user_id == user_id)
        .order_by(BodyMetric.date.desc())
        .first()
    )

    sleep_hours = latest_metric.sleep_hours if latest_metric and latest_metric.sleep_hours else 7.0
    stress_level = latest_metric.stress_level if latest_metric and latest_metric.stress_level else 3
    soreness_level = latest_metric.soreness_level if latest_metric and latest_metric.soreness_level else 3
    bodyweight = (
        latest_metric.bodyweight_kg
        if latest_metric and latest_metric.bodyweight_kg
        else user.bodyweight_kg
    )

    latest_metrics_dict = {
        "date": str(latest_metric.date) if latest_metric else None,
        "bodyweight_kg": bodyweight,
        "sleep_hours": sleep_hours,
        "stress_level": stress_level,
        "soreness_level": soreness_level,
    }

    # ---- 7-day trends -------------------------------------------------------
    recent_metrics = (
        db.query(BodyMetric)
        .filter(
            BodyMetric.user_id == user_id,
            BodyMetric.date >= seven_days_ago,
        )
        .all()
    )

    if recent_metrics:
        sleep_vals = [m.sleep_hours for m in recent_metrics if m.sleep_hours is not None]
        soreness_vals = [m.soreness_level for m in recent_metrics if m.soreness_level is not None]
        stress_vals = [m.stress_level for m in recent_metrics if m.stress_level is not None]
        avg_sleep = round(sum(sleep_vals) / len(sleep_vals), 1) if sleep_vals else None
        avg_soreness = round(sum(soreness_vals) / len(soreness_vals), 1) if soreness_vals else None
        avg_stress = round(sum(stress_vals) / len(stress_vals), 1) if stress_vals else None
    else:
        avg_sleep = avg_soreness = avg_stress = None

    trend = {
        "avg_sleep_7d": avg_sleep,
        "avg_soreness_7d": avg_soreness,
        "avg_stress_7d": avg_stress,
    }

    # ---- Per-muscle-group fatigue -------------------------------------------
    # Get all workout logs from the last 7 days joined with exercise catalog
    # to determine which muscle group each set targeted.
    recent_logs = (
        db.query(
            ExerciseCatalog.muscle_group_primary,
            sa_func.count(WorkoutLog.id).label("set_count"),
            sa_func.max(WorkoutLog.date).label("last_date"),
        )
        .join(
            ProgramExercise,
            ProgramExercise.exercise_name_canonical == ExerciseCatalog.canonical_name,
        )
        .join(WorkoutLog, WorkoutLog.program_exercise_id == ProgramExercise.id)
        .filter(
            WorkoutLog.user_id == user_id,
            WorkoutLog.date >= seven_days_ago,
        )
        .group_by(ExerciseCatalog.muscle_group_primary)
        .all()
    )

    logged_muscles: dict[str, dict] = {}
    for muscle, set_count, last_date in recent_logs:
        muscle_lower = muscle.lower()
        days_since = (today - last_date).days if last_date else None
        logged_muscles[muscle_lower] = {
            "sets_last_7d": set_count,
            "last_date": last_date,
            "days_since_last": days_since,
        }

    muscle_fatigue: dict[str, dict] = {}
    # Use the overall minimum days_since for recovery score calculation
    min_days_since = float("inf")

    for muscle, mrv in MRV_THRESHOLDS.items():
        info = logged_muscles.get(muscle, {})
        sets = info.get("sets_last_7d", 0)
        days_since = info.get("days_since_last")
        if days_since is not None and days_since < min_days_since:
            min_days_since = days_since
        muscle_fatigue[muscle] = {
            "sets_last_7d": sets,
            "mrv": mrv,
            "status": _fatigue_status(sets, mrv),
            "days_since_last": days_since,
        }

    # Default rest days if no data
    if min_days_since == float("inf"):
        min_days_since = 3.0

    # ---- Overall recovery score ---------------------------------------------
    recovery = calculate_recovery_score(
        sleep_hours=sleep_hours,
        soreness=soreness_level,
        stress=stress_level,
        days_since_last_session_for_muscle_group=float(min_days_since),
    )

    return {
        "overall_score": recovery["total_score"],
        "recommendation": recovery["recommendation"],
        "components": recovery["components"],
        "muscle_fatigue": muscle_fatigue,
        "latest_metrics": latest_metrics_dict,
        "trend": trend,
    }
