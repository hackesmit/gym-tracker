"""Workout logging and body metrics endpoints."""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import (
    BodyMetric,
    ProgramExercise,
    ProgramProgress,
    SessionLog,
    User,
    WorkoutLog,
)

router = APIRouter(tags=["logging"])

# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class SetLogRequest(BaseModel):
    program_exercise_id: int
    date: date
    set_number: int
    load_kg: float
    reps_completed: int
    rpe_actual: Optional[float] = None
    notes: Optional[str] = None
    is_bodyweight: bool = False
    is_dropset: bool = False
    dropset_load_kg: Optional[float] = None


class SetLogResponse(BaseModel):
    id: int
    user_id: int
    program_exercise_id: int
    date: date
    set_number: int
    load_kg: float
    reps_completed: int
    rpe_actual: Optional[float]
    notes: Optional[str]
    is_bodyweight: bool
    is_dropset: bool
    dropset_load_kg: Optional[float]

    model_config = {"from_attributes": True}


class BulkSetItem(BaseModel):
    program_exercise_id: int
    set_number: int
    load_kg: float
    reps_completed: int
    rpe_actual: Optional[float] = None
    is_bodyweight: bool = False
    is_dropset: bool = False
    dropset_load_kg: Optional[float] = None
    notes: Optional[str] = None


class BulkLogRequest(BaseModel):
    program_id: int
    week: int
    session_name: str
    date: date
    session_status: str = "completed"
    duration_minutes: Optional[int] = None
    session_rpe: Optional[float] = None
    session_notes: Optional[str] = None
    sets: list[BulkSetItem]


class PRInfo(BaseModel):
    exercise: str
    new_e1rm: float
    previous_e1rm: float | None


class BulkLogResponse(BaseModel):
    session_log_id: int
    sets_logged: int
    exercises_covered: int
    prs: list[PRInfo] = []


class WorkoutLogOut(BaseModel):
    id: int
    user_id: int
    program_exercise_id: int
    date: date
    set_number: int
    load_kg: float
    reps_completed: int
    rpe_actual: Optional[float]
    notes: Optional[str]
    is_bodyweight: bool
    is_dropset: bool
    dropset_load_kg: Optional[float]
    exercise_name: Optional[str] = None

    model_config = {"from_attributes": True}


class BodyMetricRequest(BaseModel):
    date: date
    bodyweight_kg: float
    body_fat_pct: Optional[float] = None
    sleep_hours: Optional[float] = None
    stress_level: Optional[int] = None
    soreness_level: Optional[int] = None


class BodyMetricResponse(BaseModel):
    id: int
    user_id: int
    date: date
    bodyweight_kg: float
    body_fat_pct: Optional[float]
    sleep_hours: Optional[float]
    stress_level: Optional[int]
    soreness_level: Optional[int]

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_default_user(db: Session) -> User:
    """Return the first user in the database or raise 404."""
    user = db.query(User).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No user found. Create a user first.",
        )
    return user


# ---------------------------------------------------------------------------
# Workout set logging
# ---------------------------------------------------------------------------


@router.post(
    "/api/log",
    response_model=SetLogResponse,
    status_code=status.HTTP_201_CREATED,
)
def log_single_set(payload: SetLogRequest, db: Session = Depends(get_db)):
    """Log a single set for an exercise."""
    user = _get_default_user(db)

    # Validate program_exercise_id exists
    pe = db.get(ProgramExercise, payload.program_exercise_id)
    if not pe:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ProgramExercise {payload.program_exercise_id} not found.",
        )

    log = WorkoutLog(
        user_id=user.id,
        program_exercise_id=payload.program_exercise_id,
        date=payload.date,
        set_number=payload.set_number,
        load_kg=payload.load_kg,
        reps_completed=payload.reps_completed,
        rpe_actual=payload.rpe_actual,
        notes=payload.notes,
        is_bodyweight=payload.is_bodyweight,
        is_dropset=payload.is_dropset,
        dropset_load_kg=payload.dropset_load_kg,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


@router.post(
    "/api/log/bulk",
    response_model=BulkLogResponse,
    status_code=status.HTTP_201_CREATED,
)
def log_bulk_session(payload: BulkLogRequest, db: Session = Depends(get_db)):
    """Log an entire workout session at once."""
    user = _get_default_user(db)

    # Validate all program_exercise_ids up-front
    pe_ids = {s.program_exercise_id for s in payload.sets}
    existing = {
        row.id
        for row in db.query(ProgramExercise.id)
        .filter(ProgramExercise.id.in_(pe_ids))
        .all()
    }
    missing = pe_ids - existing
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ProgramExercise ids not found: {sorted(missing)}",
        )

    # Create session log
    session_log = SessionLog(
        user_id=user.id,
        program_id=payload.program_id,
        week=payload.week,
        session_name=payload.session_name,
        date=payload.date,
        status=payload.session_status,
        duration_minutes=payload.duration_minutes,
        session_rpe=payload.session_rpe,
        notes=payload.session_notes,
    )
    db.add(session_log)
    db.flush()  # get session_log.id before committing

    # Create workout log entries
    for s in payload.sets:
        log = WorkoutLog(
            user_id=user.id,
            program_exercise_id=s.program_exercise_id,
            date=payload.date,
            set_number=s.set_number,
            load_kg=s.load_kg,
            reps_completed=s.reps_completed,
            rpe_actual=s.rpe_actual,
            notes=s.notes,
            is_bodyweight=s.is_bodyweight,
            is_dropset=s.is_dropset,
            dropset_load_kg=s.dropset_load_kg,
        )
        db.add(log)

    # Update program progress
    progress = (
        db.query(ProgramProgress)
        .filter(ProgramProgress.program_id == payload.program_id)
        .first()
    )
    if progress:
        progress.total_sessions_completed += 1
        progress.last_session_date = payload.date
    else:
        # Create progress row if it doesn't exist yet
        progress = ProgramProgress(
            program_id=payload.program_id,
            current_week=payload.week,
            current_session_index=1,
            total_sessions_completed=1,
            last_session_date=payload.date,
        )
        db.add(progress)

    db.commit()

    # ------------------------------------------------------------------
    # PR detection: compare each exercise's best e1RM in this session
    # against all previous logs for the same canonical exercise name.
    # Epley formula: e1rm = weight * (1 + reps / 30)
    # ------------------------------------------------------------------
    prs: list[PRInfo] = []

    # Build a map of pe_id -> canonical exercise name for this session
    pe_rows = (
        db.query(ProgramExercise)
        .filter(ProgramExercise.id.in_(pe_ids))
        .all()
    )
    pe_name_map = {pe.id: pe.exercise_name_canonical for pe in pe_rows}

    # Compute best e1RM per exercise in *this* session
    session_best: dict[str, float] = {}
    for s in payload.sets:
        name = pe_name_map.get(s.program_exercise_id)
        if not name or s.load_kg <= 0 or s.reps_completed <= 0:
            continue
        e1rm = round(s.load_kg * (1 + s.reps_completed / 30), 2)
        if name not in session_best or e1rm > session_best[name]:
            session_best[name] = e1rm

    # For each exercise, find the previous all-time best e1RM
    for exercise_name, new_e1rm in session_best.items():
        # Get all pe_ids across ALL programs that share this canonical name
        all_pe_ids = [
            row.id
            for row in db.query(ProgramExercise.id)
            .filter(ProgramExercise.exercise_name_canonical == exercise_name)
            .all()
        ]
        # Query all previous workout logs for these pe_ids (excluding today's session date)
        prev_logs = (
            db.query(WorkoutLog.load_kg, WorkoutLog.reps_completed)
            .filter(
                WorkoutLog.program_exercise_id.in_(all_pe_ids),
                WorkoutLog.date < payload.date,
                WorkoutLog.load_kg > 0,
                WorkoutLog.reps_completed > 0,
            )
            .all()
        )
        prev_best = 0.0
        for log in prev_logs:
            e1rm = round(log.load_kg * (1 + log.reps_completed / 30), 2)
            if e1rm > prev_best:
                prev_best = e1rm

        if new_e1rm > prev_best and prev_best > 0:
            prs.append(PRInfo(
                exercise=exercise_name,
                new_e1rm=round(new_e1rm, 1),
                previous_e1rm=round(prev_best, 1),
            ))
        elif prev_best <= 0:
            # First time logging this exercise — it's a PR by default
            prs.append(PRInfo(
                exercise=exercise_name,
                new_e1rm=round(new_e1rm, 1),
                previous_e1rm=None,
            ))

    return BulkLogResponse(
        session_log_id=session_log.id,
        sets_logged=len(payload.sets),
        exercises_covered=len(pe_ids),
        prs=prs,
    )


@router.get("/api/logs", response_model=list[WorkoutLogOut])
def list_logs(
    exercise: Optional[str] = Query(None, description="Partial canonical name match"),
    program_id: Optional[int] = Query(None),
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
):
    """Query logged data with optional filters."""
    query = db.query(WorkoutLog).options(
        joinedload(WorkoutLog.program_exercise)
    )

    if exercise:
        query = query.join(ProgramExercise).filter(
            ProgramExercise.exercise_name_canonical.ilike(f"%{exercise}%")
        )

    if program_id is not None:
        # Join only if not already joined for exercise filter
        if exercise is None:
            query = query.join(ProgramExercise)
        query = query.filter(ProgramExercise.program_id == program_id)

    if from_date is not None:
        query = query.filter(WorkoutLog.date >= from_date)

    if to_date is not None:
        query = query.filter(WorkoutLog.date <= to_date)

    logs = query.order_by(WorkoutLog.date.desc(), WorkoutLog.id).all()

    results = []
    for log in logs:
        out = WorkoutLogOut.model_validate(log)
        if log.program_exercise:
            out.exercise_name = log.program_exercise.exercise_name_canonical
        results.append(out)

    return results


# ---------------------------------------------------------------------------
# Body metrics
# ---------------------------------------------------------------------------


@router.post(
    "/api/body-metrics",
    response_model=BodyMetricResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_body_metric(payload: BodyMetricRequest, db: Session = Depends(get_db)):
    """Log body metrics for a given date."""
    user = _get_default_user(db)

    metric = BodyMetric(
        user_id=user.id,
        date=payload.date,
        bodyweight_kg=payload.bodyweight_kg,
        body_fat_pct=payload.body_fat_pct,
        sleep_hours=payload.sleep_hours,
        stress_level=payload.stress_level,
        soreness_level=payload.soreness_level,
    )
    db.add(metric)
    db.commit()
    db.refresh(metric)
    return metric


@router.get("/api/body-metrics/history", response_model=list[BodyMetricResponse])
def body_metrics_history(
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
):
    """Get body metrics over time with optional date range filters."""
    query = db.query(BodyMetric)

    if from_date is not None:
        query = query.filter(BodyMetric.date >= from_date)
    if to_date is not None:
        query = query.filter(BodyMetric.date <= to_date)

    return query.order_by(BodyMetric.date.desc()).all()


# ---- Manual 1RM endpoints ---------------------------------------------------

VALID_1RM_CATEGORIES = {"squat", "deadlift", "bench", "ohp", "row"}


class Manual1RMEntry(BaseModel):
    value_kg: float = Field(..., gt=0)
    tested_at: date | None = Field(None, description="Date the 1RM was tested (null = unknown)")


class Manual1RMPayload(BaseModel):
    lifts: dict[str, Manual1RMEntry | None] = Field(
        ..., description="Map of lift category to 1RM entry (null to clear)"
    )


@router.patch("/api/manual-1rm")
def update_manual_1rm(payload: Manual1RMPayload, db: Session = Depends(get_db)):
    """Set or update manual 1RM values for strength standards."""
    user = _get_default_user(db)
    current = user.manual_1rm or {}
    for category, entry in payload.lifts.items():
        if category not in VALID_1RM_CATEGORIES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid lift category '{category}'. Must be one of {VALID_1RM_CATEGORIES}",
            )
        if entry is None:
            current.pop(category, None)
        else:
            current[category] = {
                "value_kg": round(entry.value_kg, 1),
                "tested_at": entry.tested_at.isoformat() if entry.tested_at else None,
            }
    user.manual_1rm = current
    db.commit()
    return {"manual_1rm": user.manual_1rm}


@router.get("/api/manual-1rm")
def get_manual_1rm(db: Session = Depends(get_db)):
    """Get current manual 1RM values."""
    user = _get_default_user(db)
    return {"manual_1rm": user.manual_1rm or {}}
