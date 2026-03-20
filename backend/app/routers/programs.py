"""Program CRUD and import endpoints."""

import os
import shutil
import tempfile
from datetime import date
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Program, ProgramExercise, ProgramProgress, User
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

    # Get or create default user
    user = _get_or_create_default_user(db)

    # Create the program
    program = Program(
        user_id=user.id,
        name=program_name,
        frequency=frequency,
        start_date=date.today(),
        status="active",
        total_weeks=12,
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

    # Group by week -> session
    schedule = {}
    for ex in exercises:
        week = ex.week
        if week not in schedule:
            schedule[week] = {}
        session = ex.session_name
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
