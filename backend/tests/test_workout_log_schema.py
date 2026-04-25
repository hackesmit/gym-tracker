"""Schema-level tests for the new added_load_kg column."""

from datetime import date

from app.models import (
    Program,
    ProgramExercise,
    User,
    WorkoutLog,
)


def _make_pe(db, user_id):
    """Helper: create a program + program_exercise so WorkoutLog FK is satisfied."""
    program = Program(user_id=user_id, name="P", frequency=3, start_date=date.today(), total_weeks=1)
    db.add(program)
    db.flush()
    pe = ProgramExercise(
        program_id=program.id, week=1, session_name="S", session_order_in_week=1,
        exercise_order=1, exercise_name_raw="X", exercise_name_canonical="X",
        working_sets=3, prescribed_reps="5",
    )
    db.add(pe)
    db.commit()
    return pe


def test_workout_log_added_load_kg_defaults_to_null(db):
    user = db.query(User).first()
    pe = _make_pe(db, user.id)
    log = WorkoutLog(
        user_id=user.id, program_exercise_id=pe.id,
        date=date.today(), set_number=1,
        load_kg=100.0, reps_completed=5,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    assert log.added_load_kg is None


def test_workout_log_added_load_kg_round_trip(db):
    user = db.query(User).first()
    pe = _make_pe(db, user.id)
    log = WorkoutLog(
        user_id=user.id, program_exercise_id=pe.id,
        date=date.today(), set_number=1,
        load_kg=105.0, reps_completed=5, added_load_kg=25.0,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    assert log.added_load_kg == 25.0
    assert log.load_kg == 105.0
