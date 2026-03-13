"""Program tracker endpoints — progress, calendar, adherence."""

from collections import Counter
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    Program,
    ProgramExercise,
    ProgramProgress,
    SessionLog,
    WorkoutLog,
)

router = APIRouter(prefix="/api/tracker", tags=["tracker"])


# ---------------------------------------------------------------------------
# Pydantic request/response models
# ---------------------------------------------------------------------------

class SessionStatusRequest(BaseModel):
    week: int
    session_name: str
    status: str  # completed / partial / skipped
    date: date
    duration_minutes: Optional[int] = None
    session_rpe: Optional[float] = None
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_program_or_404(program_id: int, db: Session) -> Program:
    program = db.query(Program).filter(Program.id == program_id).first()
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    return program


def _distinct_sessions_by_week(
    db: Session, program_id: int
) -> dict[int, list[dict]]:
    """Return {week: [{session_name, session_order}]} from program_exercises."""
    rows = (
        db.query(
            ProgramExercise.week,
            ProgramExercise.session_name,
            ProgramExercise.session_order_in_week,
        )
        .filter(ProgramExercise.program_id == program_id)
        .distinct()
        .order_by(
            ProgramExercise.week,
            ProgramExercise.session_order_in_week,
        )
        .all()
    )
    result: dict[int, list[dict]] = {}
    for week, name, order in rows:
        result.setdefault(week, []).append(
            {"session_name": name, "session_order": order}
        )
    return result


def _session_logs_map(
    db: Session, program_id: int
) -> dict[tuple[int, str], SessionLog]:
    """Return {(week, session_name): SessionLog} for a program."""
    logs = (
        db.query(SessionLog)
        .filter(SessionLog.program_id == program_id)
        .all()
    )
    return {(log.week, log.session_name): log for log in logs}


def _compute_current_week(program: Program, today: date) -> int:
    """Compute the current week number (1-based, capped at total_weeks)."""
    if program.start_date > today:
        return 1
    elapsed_days = (today - program.start_date).days
    week = (elapsed_days // 7) + 1
    return min(week, program.total_weeks)


def _sets_logged_for_session(
    db: Session, program_id: int, week: int, session_name: str, log_date: date
) -> int:
    """Count workout_log rows for a specific session."""
    exercise_ids = [
        eid
        for (eid,) in db.query(ProgramExercise.id)
        .filter(
            ProgramExercise.program_id == program_id,
            ProgramExercise.week == week,
            ProgramExercise.session_name == session_name,
        )
        .all()
    ]
    if not exercise_ids:
        return 0
    return (
        db.query(func.count(WorkoutLog.id))
        .filter(
            WorkoutLog.program_exercise_id.in_(exercise_ids),
            WorkoutLog.date == log_date,
        )
        .scalar()
        or 0
    )


def _compute_streaks(
    sessions_by_week: dict[int, list[dict]],
    logs_map: dict[tuple[int, str], SessionLog],
    current_week: int,
) -> tuple[int, int]:
    """Return (current_streak, longest_streak) of consecutive completed sessions."""
    ordered: list[str] = []  # status list in chronological order
    for week_num in sorted(sessions_by_week.keys()):
        if week_num > current_week:
            break
        for sess in sessions_by_week[week_num]:
            key = (week_num, sess["session_name"])
            log = logs_map.get(key)
            if log:
                ordered.append(log.status)
            elif week_num < current_week:
                ordered.append("missed")
            # current week future sessions are not counted yet

    current_streak = 0
    longest_streak = 0
    streak = 0
    for s in ordered:
        if s == "completed":
            streak += 1
            longest_streak = max(longest_streak, streak)
        else:
            streak = 0
    # current streak = trailing run of completed
    current_streak = 0
    for s in reversed(ordered):
        if s == "completed":
            current_streak += 1
        else:
            break
    return current_streak, longest_streak


# ---------------------------------------------------------------------------
# GET /api/tracker/{program_id} — full tracker state
# ---------------------------------------------------------------------------

@router.get("/{program_id}")
def get_tracker(program_id: int, db: Session = Depends(get_db)):
    program = _get_program_or_404(program_id, db)
    today = date.today()
    current_week = _compute_current_week(program, today)

    sessions_by_week = _distinct_sessions_by_week(db, program_id)
    logs_map = _session_logs_map(db, program_id)

    total_sessions = sum(len(v) for v in sessions_by_week.values())

    # Build weeks payload and count statuses
    completed = 0
    skipped = 0
    missed = 0
    weeks_payload: dict[str, list[dict]] = {}

    for week_num in sorted(sessions_by_week.keys()):
        week_entries: list[dict] = []
        for sess in sessions_by_week[week_num]:
            key = (week_num, sess["session_name"])
            log = logs_map.get(key)
            if log:
                sets_logged = _sets_logged_for_session(
                    db, program_id, week_num, sess["session_name"], log.date
                )
                entry = {
                    "session_name": sess["session_name"],
                    "session_order": sess["session_order"],
                    "status": log.status,
                    "date": str(log.date),
                    "sets_logged": sets_logged,
                    "session_rpe": log.session_rpe,
                }
                if log.status == "completed":
                    completed += 1
                elif log.status == "skipped":
                    skipped += 1
            else:
                status = "missed" if week_num < current_week else "pending"
                if status == "missed":
                    missed += 1
                entry = {
                    "session_name": sess["session_name"],
                    "session_order": sess["session_order"],
                    "status": status,
                    "date": None,
                    "sets_logged": 0,
                    "session_rpe": None,
                }
            week_entries.append(entry)
        weeks_payload[str(week_num)] = week_entries

    # Expected sessions by now = all sessions in weeks 1..current_week
    expected = sum(
        len(sessions_by_week.get(w, []))
        for w in range(1, current_week + 1)
    )
    adherence_pct = round(completed / max(expected, 1) * 100, 1)

    current_streak, longest_streak = _compute_streaks(
        sessions_by_week, logs_map, current_week
    )

    # Determine next session
    next_session = None
    for week_num in range(current_week, program.total_weeks + 1):
        for sess in sessions_by_week.get(week_num, []):
            key = (week_num, sess["session_name"])
            if key not in logs_map:
                # Fetch exercises for this session
                exercises = (
                    db.query(ProgramExercise)
                    .filter(
                        ProgramExercise.program_id == program_id,
                        ProgramExercise.week == week_num,
                        ProgramExercise.session_name == sess["session_name"],
                    )
                    .order_by(ProgramExercise.exercise_order)
                    .all()
                )
                next_session = {
                    "week": week_num,
                    "session_name": sess["session_name"],
                    "exercises": [
                        {
                            "exercise_name": ex.exercise_name_canonical,
                            "working_sets": ex.working_sets,
                            "prescribed_reps": ex.prescribed_reps,
                            "prescribed_rpe": ex.prescribed_rpe,
                        }
                        for ex in exercises
                    ],
                }
                break
        if next_session:
            break

    return {
        "program_name": program.name,
        "frequency": program.frequency,
        "status": program.status,
        "total_weeks": program.total_weeks,
        "current_week": current_week,
        "total_sessions": total_sessions,
        "completed": completed,
        "skipped": skipped,
        "missed": missed,
        "adherence_pct": adherence_pct,
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "next_session": next_session,
        "weeks": weeks_payload,
    }


# ---------------------------------------------------------------------------
# GET /api/tracker/{program_id}/week/{week_num}
# ---------------------------------------------------------------------------

@router.get("/{program_id}/week/{week_num}")
def get_week_detail(
    program_id: int, week_num: int, db: Session = Depends(get_db)
):
    program = _get_program_or_404(program_id, db)
    if week_num < 1 or week_num > program.total_weeks:
        raise HTTPException(status_code=400, detail="Invalid week number")

    today = date.today()
    current_week = _compute_current_week(program, today)
    logs_map = _session_logs_map(db, program_id)

    # Get exercises grouped by session for this week
    exercises = (
        db.query(ProgramExercise)
        .filter(
            ProgramExercise.program_id == program_id,
            ProgramExercise.week == week_num,
        )
        .order_by(
            ProgramExercise.session_order_in_week,
            ProgramExercise.exercise_order,
        )
        .all()
    )

    # Group exercises by session_name (preserving order)
    session_map: dict[str, list[ProgramExercise]] = {}
    for ex in exercises:
        session_map.setdefault(ex.session_name, []).append(ex)

    sessions_payload: list[dict] = []
    for session_name, exs in session_map.items():
        key = (week_num, session_name)
        log = logs_map.get(key)

        if log:
            status = log.status
            session_date = str(log.date)
        elif week_num < current_week:
            status = "missed"
            session_date = None
        else:
            status = "pending"
            session_date = None

        exercise_list: list[dict] = []
        for ex in exs:
            # Fetch logged sets for this exercise
            logged_sets = (
                db.query(WorkoutLog)
                .filter(WorkoutLog.program_exercise_id == ex.id)
                .order_by(WorkoutLog.set_number)
                .all()
            )

            exercise_list.append(
                {
                    "exercise_name": ex.exercise_name_canonical,
                    "prescribed": {
                        "sets": ex.working_sets,
                        "reps": ex.prescribed_reps,
                        "rpe": ex.prescribed_rpe,
                    },
                    "logged": [
                        {
                            "set_number": wl.set_number,
                            "load_kg": wl.load_kg,
                            "reps": wl.reps_completed,
                            "rpe": wl.rpe_actual,
                        }
                        for wl in logged_sets
                    ],
                }
            )

        sessions_payload.append(
            {
                "session_name": session_name,
                "status": status,
                "date": session_date,
                "exercises": exercise_list,
            }
        )

    return {"week": week_num, "sessions": sessions_payload}


# ---------------------------------------------------------------------------
# POST /api/tracker/{program_id}/session
# ---------------------------------------------------------------------------

@router.post("/{program_id}/session")
def log_session(
    program_id: int,
    body: SessionStatusRequest,
    db: Session = Depends(get_db),
):
    program = _get_program_or_404(program_id, db)

    # Validate week
    if body.week < 1 or body.week > program.total_weeks:
        raise HTTPException(status_code=400, detail="Invalid week number")

    # Validate status
    valid = {"completed", "partial", "skipped"}
    if body.status not in valid:
        raise HTTPException(
            status_code=400, detail=f"Status must be one of {valid}"
        )

    # Validate session_name exists in program for that week
    exists = (
        db.query(ProgramExercise.id)
        .filter(
            ProgramExercise.program_id == program_id,
            ProgramExercise.week == body.week,
            ProgramExercise.session_name == body.session_name,
        )
        .first()
    )
    if not exists:
        raise HTTPException(
            status_code=404,
            detail=f"Session '{body.session_name}' not found in week {body.week}",
        )

    # Check for duplicate log
    dup = (
        db.query(SessionLog)
        .filter(
            SessionLog.program_id == program_id,
            SessionLog.week == body.week,
            SessionLog.session_name == body.session_name,
        )
        .first()
    )
    if dup:
        raise HTTPException(
            status_code=409,
            detail="Session already logged; delete or update the existing log",
        )

    # Create session log
    log = SessionLog(
        user_id=program.user_id,
        program_id=program_id,
        week=body.week,
        session_name=body.session_name,
        date=body.date,
        status=body.status,
        duration_minutes=body.duration_minutes,
        session_rpe=body.session_rpe,
        notes=body.notes,
    )
    db.add(log)

    # Update program progress
    progress = (
        db.query(ProgramProgress)
        .filter(ProgramProgress.program_id == program_id)
        .first()
    )
    if progress:
        if body.status == "completed":
            progress.total_sessions_completed += 1
        elif body.status == "skipped":
            progress.total_sessions_skipped += 1
        progress.last_session_date = body.date

        # Advance session index
        sessions_in_week = _distinct_sessions_by_week(db, program_id)
        week_sessions = sessions_in_week.get(body.week, [])
        current_idx = progress.current_session_index
        if current_idx < len(week_sessions):
            progress.current_session_index = current_idx + 1
        else:
            # Move to next week
            if body.week < program.total_weeks:
                progress.current_week = body.week + 1
                progress.current_session_index = 1
    else:
        # Create progress if missing
        progress = ProgramProgress(
            program_id=program_id,
            current_week=body.week,
            current_session_index=1,
            total_sessions_completed=1 if body.status == "completed" else 0,
            total_sessions_skipped=1 if body.status == "skipped" else 0,
            last_session_date=body.date,
        )
        db.add(progress)

    db.commit()
    db.refresh(log)

    return {
        "status": "logged",
        "session_log_id": log.id,
        "week": log.week,
        "session_name": log.session_name,
        "session_status": log.status,
        "date": str(log.date),
    }


# ---------------------------------------------------------------------------
# PATCH /api/tracker/{program_id}/advance
# ---------------------------------------------------------------------------

@router.patch("/{program_id}/advance")
def advance_session(program_id: int, db: Session = Depends(get_db)):
    program = _get_program_or_404(program_id, db)

    progress = (
        db.query(ProgramProgress)
        .filter(ProgramProgress.program_id == program_id)
        .first()
    )
    if not progress:
        raise HTTPException(status_code=404, detail="No progress record found")

    sessions_by_week = _distinct_sessions_by_week(db, program_id)
    week_sessions = sessions_by_week.get(progress.current_week, [])

    if progress.current_session_index < len(week_sessions):
        progress.current_session_index += 1
    else:
        if progress.current_week < program.total_weeks:
            progress.current_week += 1
            progress.current_session_index = 1
        else:
            raise HTTPException(
                status_code=400, detail="Already at the last session of the program"
            )

    db.commit()
    db.refresh(progress)

    return {
        "status": "advanced",
        "current_week": progress.current_week,
        "current_session_index": progress.current_session_index,
    }


# ---------------------------------------------------------------------------
# GET /api/tracker/{program_id}/calendar
# ---------------------------------------------------------------------------

@router.get("/{program_id}/calendar")
def get_calendar(program_id: int, db: Session = Depends(get_db)):
    program = _get_program_or_404(program_id, db)

    logs = (
        db.query(SessionLog)
        .filter(SessionLog.program_id == program_id)
        .order_by(SessionLog.date)
        .all()
    )

    calendar = [
        {
            "date": str(log.date),
            "week": log.week,
            "session_name": log.session_name,
            "status": log.status,
        }
        for log in logs
    ]

    program_end_projected = program.start_date + timedelta(
        weeks=program.total_weeks
    )

    return {
        "calendar": calendar,
        "program_start": str(program.start_date),
        "program_end_projected": str(program_end_projected),
    }


# ---------------------------------------------------------------------------
# GET /api/tracker/{program_id}/adherence
# ---------------------------------------------------------------------------

@router.get("/{program_id}/adherence")
def get_adherence(program_id: int, db: Session = Depends(get_db)):
    program = _get_program_or_404(program_id, db)
    today = date.today()
    current_week = _compute_current_week(program, today)

    sessions_by_week = _distinct_sessions_by_week(db, program_id)
    logs_map = _session_logs_map(db, program_id)

    total_prescribed = sum(
        len(sessions_by_week.get(w, []))
        for w in range(1, current_week + 1)
    )

    total_completed = 0
    total_skipped = 0
    total_missed = 0
    skip_counter: Counter[str] = Counter()

    for week_num in range(1, current_week + 1):
        for sess in sessions_by_week.get(week_num, []):
            key = (week_num, sess["session_name"])
            log = logs_map.get(key)
            if log:
                if log.status == "completed":
                    total_completed += 1
                elif log.status == "skipped":
                    total_skipped += 1
                    skip_counter[sess["session_name"]] += 1
            else:
                total_missed += 1

    completion_rate = round(
        total_completed / max(total_prescribed, 1) * 100, 1
    )

    current_streak, longest_streak = _compute_streaks(
        sessions_by_week, logs_map, current_week
    )

    # Sessions per week average (based on weeks that have started)
    weeks_started = max(current_week, 1)
    sessions_per_week_avg = round(total_completed / weeks_started, 1)

    most_skipped = (
        skip_counter.most_common(1)[0][0] if skip_counter else None
    )

    return {
        "completion_rate": completion_rate,
        "total_prescribed": total_prescribed,
        "total_completed": total_completed,
        "total_skipped": total_skipped,
        "total_missed": total_missed,
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "sessions_per_week_avg": sessions_per_week_avg,
        "most_skipped_session": most_skipped,
    }
