"""Analytics API endpoints — progress, volume, strength standards, recovery, overload."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..analytics.deload import get_deload_check
from ..analytics.overload import get_overload_plan, suggest_next_session
from ..analytics.progress import get_exercise_progress
from ..analytics.recovery import get_recovery_status
from ..analytics.strength import get_strength_standards
from ..analytics.volume import get_muscle_balance, get_weekly_tonnage, get_weekly_volume
from ..database import get_db
from ..models import Achievement, ExerciseCatalog, ProgramExercise, User, WorkoutLog

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def _default_user_id(db: Session) -> int:
    """Return the first user's ID — mirrors logging._get_default_user."""
    user = db.query(User).first()
    return user.id if user else 1


@router.get("/progress/{exercise}")
def exercise_progress(
    exercise: str,
    db: Session = Depends(get_db),
):
    """Progress curve + projections for an exercise (by canonical name, partial match)."""
    # Find exact or best match
    catalog = (
        db.query(ExerciseCatalog)
        .filter(ExerciseCatalog.canonical_name.ilike(f"%{exercise}%"))
        .first()
    )
    exercise_name = catalog.canonical_name if catalog else exercise.upper()

    result = get_exercise_progress(db, exercise_name, user_id=_default_user_id(db))
    if not result["data_points"]:
        raise HTTPException(
            status_code=404,
            detail=f"No logged data found for exercise matching '{exercise}'",
        )
    return result


@router.get("/volume")
def volume_analytics(
    weeks_back: int = Query(8, ge=1, le=52),
    db: Session = Depends(get_db),
):
    """Weekly volume per muscle group over time with MEV/MAV/MRV reference."""
    return get_weekly_volume(db, user_id=_default_user_id(db), weeks_back=weeks_back)


@router.get("/muscle-balance")
def muscle_balance(
    weeks_back: int = Query(4, ge=1, le=52),
    db: Session = Depends(get_db),
):
    """Push:Pull and Quad:Ham ratios."""
    return get_muscle_balance(db, user_id=_default_user_id(db), weeks_back=weeks_back)


@router.get("/strength-standards")
def strength_standards(db: Session = Depends(get_db)):
    """Compare lifts to population-based strength percentiles."""
    try:
        return get_strength_standards(db, user_id=_default_user_id(db))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.get("/recovery")
def recovery_status(db: Session = Depends(get_db)):
    """Recovery status and per-muscle-group fatigue."""
    try:
        return get_recovery_status(db, user_id=_default_user_id(db))
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc) or "Log body metrics to get recovery insights.",
        )


@router.get("/overload-plan")
def overload_plan(
    program_id: int = Query(...),
    week: int = Query(...),
    session_name: str = Query(...),
    db: Session = Depends(get_db),
):
    """Next session's suggested loads/reps based on progressive overload."""
    plan = get_overload_plan(db, program_id, week, session_name)
    if not plan["exercises"]:
        raise HTTPException(
            status_code=404,
            detail=f"No exercises found for program {program_id}, week {week}, session '{session_name}'",
        )
    return plan


@router.get("/deload-check")
def deload_check(db: Session = Depends(get_db)):
    """Check whether a deload week is recommended based on stagnation and recovery."""
    return get_deload_check(db, user_id=_default_user_id(db))


@router.get("/exercise-catalog")
def exercise_catalog(db: Session = Depends(get_db)):
    """Return all exercises with their primary muscle group, equipment, and laterality."""
    rows = db.query(ExerciseCatalog).order_by(ExerciseCatalog.canonical_name).all()
    return [
        {
            "name": row.canonical_name,
            "muscle_group": row.muscle_group_primary,
            "equipment": row.equipment,
            "is_unilateral": row.is_unilateral,
        }
        for row in rows
    ]


@router.get("/tonnage")
def tonnage(
    weeks_back: int = Query(12, ge=1, le=52),
    db: Session = Depends(get_db),
):
    """Weekly tonnage (load_kg * reps) over time."""
    return get_weekly_tonnage(db, user_id=_default_user_id(db), weeks_back=weeks_back)


@router.get("/summary")
def dashboard_summary(db: Session = Depends(get_db)):
    """Dashboard summary stats."""
    uid = _default_user_id(db)

    # Total sets logged
    total_sets = db.query(WorkoutLog).filter(WorkoutLog.user_id == uid).count()

    # Total unique exercises logged
    exercise_ids = (
        db.query(WorkoutLog.program_exercise_id)
        .filter(WorkoutLog.user_id == uid)
        .distinct()
        .count()
    )

    # Recent PRs (exercises with new all-time best in last 4 weeks)
    # Collect unique exercise names that have been logged
    logged_exercises = (
        db.query(ProgramExercise.exercise_name_canonical)
        .join(WorkoutLog, WorkoutLog.program_exercise_id == ProgramExercise.id)
        .filter(WorkoutLog.user_id == uid)
        .distinct()
        .all()
    )

    recent_prs = []
    for (name,) in logged_exercises:
        progress = get_exercise_progress(db, name, user_id=uid)
        if progress["prs"] and progress["prs"]["is_recent_pr"]:
            recent_prs.append(
                {
                    "exercise": name,
                    "e1rm": progress["prs"]["all_time_e1rm"],
                }
            )

    # Recovery snapshot
    try:
        recovery = get_recovery_status(db, user_id=uid)
    except ValueError:
        recovery = {}

    return {
        "total_sets_logged": total_sets,
        "unique_exercises_logged": exercise_ids,
        "recent_prs": recent_prs,
        "recovery_score": recovery.get("overall_score"),
        "recovery_recommendation": recovery.get("recommendation", ""),
    }


@router.get("/achievements")
def list_achievements(
    type: Optional[str] = Query(None, description="Filter by achievement type"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """List all achievements for the default user."""
    uid = _default_user_id(db)
    query = db.query(Achievement).filter(Achievement.user_id == uid).order_by(Achievement.achieved_at.desc())
    if type:
        query = query.filter(Achievement.type == type)
    achievements = query.limit(limit).all()
    return [
        {
            "id": a.id,
            "type": a.type,
            "exercise_name": a.exercise_name,
            "category": a.category,
            "tier": a.tier,
            "value": a.value,
            "previous_value": a.previous_value,
            "metadata": a.extra,
            "achieved_at": a.achieved_at.isoformat() if a.achieved_at else None,
        }
        for a in achievements
    ]
