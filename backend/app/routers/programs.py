"""Program CRUD and import endpoints."""

import os
import shutil
import tempfile
from datetime import date
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from sqlalchemy import func

from ..database import get_db
from ..models import Program, ProgramExercise, ProgramProgress, User, WorkoutLog
from ..parser import parse_program

router = APIRouter(prefix="/api", tags=["programs"])


class StatusUpdate(BaseModel):
    status: str


class ExerciseSwap(BaseModel):
    new_exercise_name: str

# Directory for uploaded spreadsheets
UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", tempfile.gettempdir())) / "uploads"

# Valid sheet names by frequency
FREQUENCY_SHEETS = {
    2: "2x Week",
    3: "3x Week",
    4: "4x Week",
    5: "5x Week",
}


def _get_or_create_default_user(db: Session) -> User:
    """Get the default user, creating one if none exists."""
    user = db.query(User).first()
    if not user:
        user = User(name="Default User", preferred_units="kg")
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


@router.post("/import-program")
def import_program(
    file: UploadFile = File(...),
    frequency: int = Form(...),
    program_name: str = Form("The Essentials"),
    db: Session = Depends(get_db),
):
    """
    Upload an .xlsx file, parse it, and store the program + exercises.

    - **file**: The .xlsx spreadsheet file
    - **frequency**: Training frequency (2, 3, 4, or 5 days per week)
    - **program_name**: Name for the program (default: "The Essentials")
    """
    # Validate frequency
    if frequency not in FREQUENCY_SHEETS:
        raise HTTPException(
            status_code=400,
            detail=f"Frequency must be one of {list(FREQUENCY_SHEETS.keys())}",
        )

    # Validate file type
    if not file.filename or not file.filename.endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="File must be an .xlsx spreadsheet")

    # Save uploaded file
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    file_path = UPLOAD_DIR / file.filename
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Parse the spreadsheet
    sheet_name = FREQUENCY_SHEETS[frequency]
    try:
        exercises = parse_program(str(file_path), sheet_name)
    except Exception as e:
        raise HTTPException(
            status_code=422,
            detail=f"Failed to parse spreadsheet: {e}",
        )

    if not exercises:
        raise HTTPException(
            status_code=422,
            detail=f"No exercises found in sheet '{sheet_name}'",
        )

    # Derive total_weeks from parsed data and validate
    max_week = max(ex["week"] for ex in exercises)
    total_weeks = max(max_week, 12)

    # Get or create default user
    user = _get_or_create_default_user(db)

    # Create the program
    program = Program(
        user_id=user.id,
        name=program_name,
        frequency=frequency,
        start_date=date.today(),
        status="active",
        total_weeks=total_weeks,
        source_file=file.filename,
    )
    db.add(program)
    db.flush()  # Get program.id

    # Insert all parsed exercises
    for ex in exercises:
        pe = ProgramExercise(
            program_id=program.id,
            week=ex["week"],
            session_name=ex["session_name"],
            session_order_in_week=ex["session_order_in_week"],
            exercise_order=ex["exercise_order"],
            exercise_name_canonical=ex["exercise_name_canonical"],
            exercise_name_raw=ex["exercise_name_raw"],
            warm_up_sets=ex["warm_up_sets"],
            working_sets=ex["working_sets"],
            prescribed_reps=ex["prescribed_reps"],
            prescribed_rpe=ex["prescribed_rpe"],
            rest_period=ex["rest_period"],
            substitution_1=ex["substitution_1"],
            substitution_2=ex["substitution_2"],
            notes=ex["notes"],
            is_superset=ex["is_superset"],
            superset_group=ex["superset_group"],
        )
        db.add(pe)

    # Create initial program progress tracker
    progress = ProgramProgress(
        program_id=program.id,
        current_week=1,
        current_session_index=1,
        total_sessions_completed=0,
        total_sessions_skipped=0,
    )
    db.add(progress)

    db.commit()
    db.refresh(program)

    # Count sessions per week for summary
    sessions_per_week = {}
    for ex in exercises:
        w = ex["week"]
        s = ex["session_name"]
        if w not in sessions_per_week:
            sessions_per_week[w] = set()
        sessions_per_week[w].add(s)

    total_sessions = sum(len(s) for s in sessions_per_week.values())

    return {
        "status": "success",
        "program_id": program.id,
        "program_name": program.name,
        "frequency": frequency,
        "sheet_parsed": sheet_name,
        "total_exercises": len(exercises),
        "total_weeks": 12,
        "total_sessions": total_sessions,
        "sessions_per_week": {
            k: list(v) for k, v in sorted(sessions_per_week.items())
        },
    }


@router.get("/programs")
def list_programs(db: Session = Depends(get_db)):
    """List all programs."""
    programs = db.query(Program).all()
    return {
        "programs": [
            {
                "id": p.id,
                "name": p.name,
                "frequency": p.frequency,
                "status": p.status,
                "start_date": str(p.start_date),
                "total_weeks": p.total_weeks,
                "source_file": p.source_file,
            }
            for p in programs
        ]
    }


@router.get("/program/{program_id}/schedule")
def get_program_schedule(program_id: int, db: Session = Depends(get_db)):
    """Get the full weekly schedule for a program."""
    program = db.query(Program).filter(Program.id == program_id).first()
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")

    exercises = (
        db.query(ProgramExercise)
        .filter(ProgramExercise.program_id == program_id)
        .order_by(
            ProgramExercise.week,
            ProgramExercise.session_order_in_week,
            ProgramExercise.exercise_order,
        )
        .all()
    )

    # Group by week -> session, using session_order_in_week to distinguish
    # sessions that share the same name (e.g. two "UPPER BODY" per week).
    schedule = {}
    _seen_sessions: dict[tuple, str] = {}  # (week, session_order) -> display_name
    for ex in exercises:
        week = ex.week
        if week not in schedule:
            schedule[week] = {}
        key = (week, ex.session_order_in_week)
        if key not in _seen_sessions:
            base = ex.session_name
            # Check if this session_name already used by a different session_order this week
            existing_names = {
                name for (w, _), name in _seen_sessions.items() if w == week
            }
            if base in existing_names:
                # Count how many times this base name has appeared
                count = sum(1 for n in existing_names if n == base or n.startswith(base + " "))
                display = f"{base} {chr(65 + count)}"  # A, B, C...
                # Also rename the first occurrence
                for k, v in _seen_sessions.items():
                    if k[0] == week and v == base:
                        old_name = v
                        new_name = f"{base} A"
                        _seen_sessions[k] = new_name
                        if old_name in schedule[week]:
                            schedule[week][new_name] = schedule[week].pop(old_name)
                        break
            else:
                display = base
            _seen_sessions[key] = display
        session = _seen_sessions[key]
        if session not in schedule[week]:
            schedule[week][session] = []
        schedule[week][session].append(
            {
                "id": ex.id,
                "exercise_order": ex.exercise_order,
                "exercise_name": ex.exercise_name_canonical,
                "warm_up_sets": ex.warm_up_sets,
                "working_sets": ex.working_sets,
                "prescribed_reps": ex.prescribed_reps,
                "prescribed_rpe": ex.prescribed_rpe,
                "rest_period": ex.rest_period,
                "substitution_1": ex.substitution_1,
                "substitution_2": ex.substitution_2,
                "notes": ex.notes,
                "is_superset": ex.is_superset,
                "superset_group": ex.superset_group,
            }
        )

    return {
        "program_id": program.id,
        "program_name": program.name,
        "frequency": program.frequency,
        "status": program.status,
        "schedule": schedule,
    }


@router.patch("/program/{program_id}/status")
def update_program_status(
    program_id: int, body: StatusUpdate, db: Session = Depends(get_db)
):
    """Update program status (active/paused/completed/abandoned)."""
    status = body.status
    valid_statuses = {"active", "paused", "completed", "abandoned"}
    if status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Status must be one of {valid_statuses}",
        )

    program = db.query(Program).filter(Program.id == program_id).first()
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")

    program.status = status
    if status == "completed":
        program.end_date = date.today()
    db.commit()

    return {"status": "updated", "program_id": program_id, "new_status": status}


@router.patch("/program/{program_id}/exercise/{old_name}")
def swap_exercise(
    program_id: int,
    old_name: str,
    body: ExerciseSwap,
    db: Session = Depends(get_db),
):
    """Swap an exercise name across all weeks of a program."""
    exercises = (
        db.query(ProgramExercise)
        .filter(
            ProgramExercise.program_id == program_id,
            ProgramExercise.exercise_name_canonical == old_name,
        )
        .all()
    )
    if not exercises:
        raise HTTPException(status_code=404, detail=f"Exercise '{old_name}' not found in program")

    for ex in exercises:
        ex.exercise_name_canonical = body.new_exercise_name
        ex.exercise_name_raw = body.new_exercise_name
    db.commit()

    return {
        "status": "swapped",
        "old_name": old_name,
        "new_name": body.new_exercise_name,
        "rows_updated": len(exercises),
    }


@router.post("/program/{program_id}/deduplicate")
def deduplicate_program(program_id: int, db: Session = Depends(get_db)):
    """Remove duplicate ProgramExercise rows and associated WorkoutLog entries.

    When multiple ProgramExercise rows share the same (program_id, week,
    session_name, exercise_order), keep the one with the lowest id and
    delete the rest along with their WorkoutLog entries.
    Also renames sessions with duplicate session_orders to "SESSION A/B".
    """
    program = db.query(Program).filter(Program.id == program_id).first()
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")

    all_exercises = (
        db.query(ProgramExercise)
        .filter(ProgramExercise.program_id == program_id)
        .order_by(ProgramExercise.week, ProgramExercise.session_order_in_week, ProgramExercise.id)
        .all()
    )

    # Step 1: Rename sessions that share the same name but have different
    # session_order_in_week values (e.g. two "UPPER BODY" → "UPPER BODY A/B")
    from collections import defaultdict
    week_name_orders: dict[int, dict[str, list[int]]] = defaultdict(lambda: defaultdict(list))
    for ex in all_exercises:
        orders = week_name_orders[ex.week][ex.session_name]
        if ex.session_order_in_week not in orders:
            orders.append(ex.session_order_in_week)

    rename_map: dict[tuple[int, str, int], str] = {}
    for week, names in week_name_orders.items():
        for name, orders in names.items():
            if len(orders) > 1:
                for idx, order in enumerate(sorted(orders)):
                    rename_map[(week, name, order)] = f"{name} {chr(65 + idx)}"

    renamed_count = 0
    for ex in all_exercises:
        key = (ex.week, ex.session_name, ex.session_order_in_week)
        if key in rename_map:
            ex.session_name = rename_map[key]
            renamed_count += 1

    # Step 2: Remove true duplicates (same program_id, week, session_name,
    # exercise_order) — keep lowest id.
    seen: dict[tuple, int] = {}
    dup_pe_ids: list[int] = []
    for ex in all_exercises:
        key = (ex.week, ex.session_name, ex.exercise_order)
        if key in seen:
            dup_pe_ids.append(ex.id)
        else:
            seen[key] = ex.id

    # Delete WorkoutLog entries referencing duplicate ProgramExercises
    deleted_logs = 0
    if dup_pe_ids:
        deleted_logs = (
            db.query(WorkoutLog)
            .filter(WorkoutLog.program_exercise_id.in_(dup_pe_ids))
            .delete(synchronize_session="fetch")
        )
        db.query(ProgramExercise).filter(
            ProgramExercise.id.in_(dup_pe_ids)
        ).delete(synchronize_session="fetch")

    # Step 3: Remove duplicate WorkoutLog entries (same program_exercise_id,
    # date, set_number). Keep the lowest id.
    pe_ids_in_program = {ex.id for ex in all_exercises}
    all_logs = (
        db.query(WorkoutLog)
        .filter(WorkoutLog.program_exercise_id.in_(pe_ids_in_program))
        .order_by(WorkoutLog.id)
        .all()
    )
    log_seen: dict[tuple, int] = {}
    dup_log_ids: list[int] = []
    for log in all_logs:
        key = (log.program_exercise_id, str(log.date), log.set_number)
        if key in log_seen:
            dup_log_ids.append(log.id)
        else:
            log_seen[key] = log.id

    deleted_dup_logs = 0
    if dup_log_ids:
        deleted_dup_logs = (
            db.query(WorkoutLog)
            .filter(WorkoutLog.id.in_(dup_log_ids))
            .delete(synchronize_session="fetch")
        )

    db.commit()

    return {
        "status": "deduplicated",
        "program_id": program_id,
        "sessions_renamed": renamed_count,
        "duplicate_exercises_removed": len(dup_pe_ids),
        "orphaned_logs_removed": deleted_logs,
        "duplicate_logs_removed": deleted_dup_logs,
    }
