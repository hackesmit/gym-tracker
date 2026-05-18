"""Round-trip test for the 2026-05-18 untag-BW data fix migration.

Verifies that WorkoutLog rows belonging to the three untagged canonical
exercises have their plate-only semantics collapsed back to external-load
semantics, and that the migration is idempotent.
"""

import pytest

from app.main import _untag_bw_data_fix_once
from app.models import (
    MigrationLog, Program, ProgramExercise, UntagBwAudit, User, WorkoutLog,
)


@pytest.fixture
def program_with_untagged_logs(db):
    from datetime import date

    user = db.query(User).first()
    prog = Program(
        user_id=user.id,
        name="Test",
        total_weeks=1,
        frequency=1,
        start_date=date.today(),
    )
    db.add(prog)
    db.commit()
    db.refresh(prog)

    pe_crunch = ProgramExercise(
        program_id=prog.id,
        week=1,
        session_name="A",
        session_order_in_week=1,
        exercise_order=1,
        exercise_name_raw="Plate Weighted Crunch",
        exercise_name_canonical="PLATE-WEIGHTED CRUNCH",
        working_sets=3,
        prescribed_reps="10",
    )
    pe_lunge = ProgramExercise(
        program_id=prog.id,
        week=1,
        session_name="A",
        session_order_in_week=1,
        exercise_order=2,
        exercise_name_raw="Walking Lunges",
        exercise_name_canonical="WALKING LUNGES",
        working_sets=2,
        prescribed_reps="20",
    )
    pe_raise = ProgramExercise(
        program_id=prog.id,
        week=1,
        session_name="A",
        session_order_in_week=1,
        exercise_order=3,
        exercise_name_raw="Leg Raises",
        exercise_name_canonical="LEG RAISES",
        working_sets=2,
        prescribed_reps="15",
    )
    db.add_all([pe_crunch, pe_lunge, pe_raise])
    db.commit()
    db.refresh(pe_crunch)
    db.refresh(pe_lunge)
    db.refresh(pe_raise)

    # PLATE-WEIGHTED CRUNCH — weighted_capable era: load=BW+plate, added=plate
    wl1 = WorkoutLog(
        user_id=user.id, program_exercise_id=pe_crunch.id, set_number=1,
        load_kg=85.0, added_load_kg=10.0, reps_completed=10,
        date=date.today(),
    )
    # WALKING LUNGES — pure era: load=BW, added=0
    wl2 = WorkoutLog(
        user_id=user.id, program_exercise_id=pe_lunge.id, set_number=1,
        load_kg=75.0, added_load_kg=0.0, reps_completed=20,
        date=date.today(),
    )
    # LEG RAISES — pure era: load=BW, added=0
    wl3 = WorkoutLog(
        user_id=user.id, program_exercise_id=pe_raise.id, set_number=1,
        load_kg=75.0, added_load_kg=0.0, reps_completed=15,
        date=date.today(),
    )
    db.add_all([wl1, wl2, wl3])
    db.commit()
    return wl1.id, wl2.id, wl3.id


def test_migration_collapses_weighted_capable(db, program_with_untagged_logs):
    crunch_id, _, _ = program_with_untagged_logs
    _untag_bw_data_fix_once(db)
    wl = db.query(WorkoutLog).filter_by(id=crunch_id).first()
    assert wl.load_kg == 10.0     # was 85 (BW+plate); collapses to plate only
    assert wl.added_load_kg is None


def test_migration_collapses_pure_to_zero_load(db, program_with_untagged_logs):
    _, lunge_id, raise_id = program_with_untagged_logs
    _untag_bw_data_fix_once(db)
    for wid in (lunge_id, raise_id):
        wl = db.query(WorkoutLog).filter_by(id=wid).first()
        assert wl.load_kg == 0.0
        assert wl.added_load_kg is None


def test_migration_writes_audit_rows(db, program_with_untagged_logs):
    crunch_id, lunge_id, raise_id = program_with_untagged_logs
    _untag_bw_data_fix_once(db)
    audits = db.query(UntagBwAudit).order_by(UntagBwAudit.id).all()
    assert len(audits) == 3
    crunch_audit = next(a for a in audits if a.log_id == crunch_id)
    assert crunch_audit.before_load_kg == 85.0
    assert crunch_audit.before_added_load_kg == 10.0
    assert crunch_audit.after_load_kg == 10.0
    assert crunch_audit.reason == "weighted_capable_collapsed"


def test_migration_is_idempotent(db, program_with_untagged_logs):
    _untag_bw_data_fix_once(db)
    first_count = db.query(UntagBwAudit).count()
    _untag_bw_data_fix_once(db)
    second_count = db.query(UntagBwAudit).count()
    assert first_count == second_count == 3
    assert db.query(MigrationLog).filter_by(name="untag_bw_2026_05").count() == 1


def test_migration_ignores_external_lifts(db):
    """A WorkoutLog on a non-untagged exercise must be untouched."""
    from datetime import date

    user = db.query(User).first()
    prog = Program(
        user_id=user.id,
        name="X",
        total_weeks=1,
        frequency=1,
        start_date=date.today(),
    )
    db.add(prog)
    db.commit()
    db.refresh(prog)
    pe = ProgramExercise(
        program_id=prog.id, week=1, session_name="A",
        session_order_in_week=1, exercise_order=1,
        exercise_name_raw="Bench Press",
        exercise_name_canonical="BENCH PRESS",
        working_sets=3, prescribed_reps="5",
    )
    db.add(pe)
    db.commit()
    db.refresh(pe)
    wl = WorkoutLog(
        user_id=user.id, program_exercise_id=pe.id, set_number=1,
        load_kg=100.0, added_load_kg=None, reps_completed=5,
        date=date.today(),
    )
    db.add(wl)
    db.commit()

    _untag_bw_data_fix_once(db)

    wl = db.query(WorkoutLog).filter_by(id=wl.id).first()
    assert wl.load_kg == 100.0
    assert wl.added_load_kg is None
    assert db.query(UntagBwAudit).filter_by(log_id=wl.id).first() is None
