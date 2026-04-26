"""The migration must run exactly once across multiple lifespan invocations."""

from datetime import date

from app.main import _run_bw_migration_once
from app.models import (
    BwMigrationAudit,
    MigrationLog,
    Program,
    ProgramExercise,
    User,
    WorkoutLog,
)
from app.seed_catalog import seed_exercise_catalog, backfill_catalog_bodyweight_kind


MIGRATION_NAME = "bw_input_2026_04"


def test_first_run_inserts_marker_row(db):
    seed_exercise_catalog(db)
    backfill_catalog_bodyweight_kind(db)
    assert db.query(MigrationLog).filter_by(name=MIGRATION_NAME).first() is None
    _run_bw_migration_once(db)
    assert db.query(MigrationLog).filter_by(name=MIGRATION_NAME).first() is not None


def test_second_run_is_no_op(db):
    seed_exercise_catalog(db)
    backfill_catalog_bodyweight_kind(db)
    user = User(name="t", username="t", password_hash="!", bodyweight_kg=70)
    db.add(user)
    db.commit()
    program = Program(user_id=user.id, name="P", frequency=3, start_date=date.today())
    db.add(program)
    db.flush()
    pe = ProgramExercise(
        program_id=program.id, week=1, session_name="A", session_order_in_week=1,
        exercise_order=1,
        exercise_name_raw="WEIGHTED PULLUP", exercise_name_canonical="WEIGHTED PULLUP",
        prescribed_reps="3", working_sets=3,
    )
    db.add(pe)
    db.flush()
    log = WorkoutLog(
        user_id=user.id, program_exercise_id=pe.id, date=date.today(),
        set_number=1, load_kg=25.0, reps_completed=5,
    )
    db.add(log)
    db.commit()

    _run_bw_migration_once(db)
    audit_after_first = db.query(BwMigrationAudit).count()

    _run_bw_migration_once(db)
    assert db.query(BwMigrationAudit).count() == audit_after_first
