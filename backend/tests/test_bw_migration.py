"""End-to-end migration tests for the 2026-04 BW input fix."""

from datetime import date, timedelta

import pytest

from app.bw_migration import run_bw_migration
from app.models import (
    BodyMetric,
    BwMigrationAudit,
    ExerciseCatalog,
    Program,
    ProgramExercise,
    User,
    WorkoutLog,
)
from app.seed_catalog import seed_exercise_catalog, backfill_catalog_bodyweight_kind


def _seed_catalog(db):
    seed_exercise_catalog(db)
    backfill_catalog_bodyweight_kind(db)


def _make_user(db, name, bw):
    u = User(name=name, username=name, password_hash="!", bodyweight_kg=bw)
    db.add(u)
    db.commit()
    return u


def _make_log(db, user, exercise_canonical, load_kg, reps=5, day_offset=0):
    program = Program(
        user_id=user.id, name=f"P-{exercise_canonical}",
        frequency=3, start_date=date.today(),
    )
    db.add(program)
    db.flush()
    pe = ProgramExercise(
        program_id=program.id, week=1, session_name="A",
        session_order_in_week=1, exercise_order=1,
        exercise_name_raw=exercise_canonical,
        exercise_name_canonical=exercise_canonical,
        prescribed_reps="3", working_sets=3,
    )
    db.add(pe)
    db.flush()
    log = WorkoutLog(
        user_id=user.id, program_exercise_id=pe.id,
        date=date.today() - timedelta(days=day_offset),
        set_number=1, load_kg=load_kg, reps_completed=reps,
    )
    db.add(log)
    db.commit()
    return log


def test_aragorn_correction(db):
    """Weighted pullup logged at user's bodyweight gets corrected to BW only."""
    _seed_catalog(db)
    aragorn = _make_user(db, "aragorn", bw=70.0)
    log = _make_log(db, aragorn, "WEIGHTED PULLUP", load_kg=70.3)

    run_bw_migration(db)

    db.refresh(log)
    assert log.added_load_kg == 0
    assert log.load_kg == pytest.approx(70.0)
    audit = db.query(BwMigrationAudit).filter_by(log_id=log.id).first()
    assert audit is not None
    assert audit.reason == "aragorn_correction"
    assert audit.old_load_kg == pytest.approx(70.3)


def test_legitimate_weighted_pullup_promoted(db):
    """Real +25 kg pullup gets load_kg = BW + 25, added_load_kg = 25."""
    _seed_catalog(db)
    legolas = _make_user(db, "legolas", bw=70.0)
    log = _make_log(db, legolas, "WEIGHTED PULLUP", load_kg=25.0)

    run_bw_migration(db)

    db.refresh(log)
    assert log.added_load_kg == pytest.approx(25.0)
    assert log.load_kg == pytest.approx(95.0)
    audit = db.query(BwMigrationAudit).filter_by(log_id=log.id).first()
    assert audit.reason == "weighted_capable_added_promoted"


def test_pure_bw_pushup_backfilled(db):
    """Pre-migration pushup with load=0 gets load_kg = BW."""
    _seed_catalog(db)
    gimli = _make_user(db, "gimli", bw=90.0)
    cat = ExerciseCatalog(
        canonical_name="PUSHUP",
        muscle_group_primary="chest",
        movement_pattern="horizontal push",
        equipment="bodyweight",
        difficulty_level="beginner",
        bodyweight_kind="pure",
    )
    db.add(cat)
    db.commit()
    log = _make_log(db, gimli, "PUSHUP", load_kg=0.0, reps=15)

    run_bw_migration(db)

    db.refresh(log)
    assert log.added_load_kg == 0
    assert log.load_kg == pytest.approx(90.0)
    audit = db.query(BwMigrationAudit).filter_by(log_id=log.id).first()
    assert audit.reason == "pure_bw_backfilled"


def test_no_bodyweight_user_skipped(db):
    """User without recorded BW gets logs flagged but untouched."""
    _seed_catalog(db)
    saruman = _make_user(db, "saruman", bw=None)
    log = _make_log(db, saruman, "WEIGHTED PULLUP", load_kg=50.0)

    run_bw_migration(db)

    db.refresh(log)
    assert log.load_kg == pytest.approx(50.0)
    assert log.added_load_kg is None
    audit = db.query(BwMigrationAudit).filter_by(log_id=log.id).first()
    assert audit.reason == "no_bw_skipped"


def test_pure_with_nonzero_load_skipped(db):
    """Pure exercise with pre-existing nonzero load is flagged, not overwritten."""
    _seed_catalog(db)
    user = _make_user(db, "vest_user", bw=80.0)
    cat = ExerciseCatalog(
        canonical_name="PUSHUP",
        muscle_group_primary="chest",
        movement_pattern="horizontal push",
        equipment="bodyweight",
        difficulty_level="beginner",
        bodyweight_kind="pure",
    )
    db.add(cat)
    db.commit()
    log = _make_log(db, user, "PUSHUP", load_kg=15.0)

    run_bw_migration(db)

    db.refresh(log)
    assert log.load_kg == pytest.approx(15.0)
    assert log.added_load_kg is None
    audit = db.query(BwMigrationAudit).filter_by(log_id=log.id).first()
    assert audit.reason == "pure_with_nonzero_load_skipped"


def test_weighted_capable_zero_load(db):
    """Weighted pullup logged with 0 load = bodyweight-only attempt."""
    _seed_catalog(db)
    user = _make_user(db, "test", bw=80.0)
    log = _make_log(db, user, "WEIGHTED PULLUP", load_kg=0.0)

    run_bw_migration(db)

    db.refresh(log)
    assert log.added_load_kg == 0
    assert log.load_kg == pytest.approx(80.0)
    audit = db.query(BwMigrationAudit).filter_by(log_id=log.id).first()
    assert audit.reason == "weighted_capable_zero_load"


def test_external_load_untouched(db):
    """Barbell bench press should not be touched by the migration."""
    _seed_catalog(db)
    user = _make_user(db, "test", bw=80.0)
    log = _make_log(db, user, "BARBELL BENCH PRESS", load_kg=100.0)

    run_bw_migration(db)

    db.refresh(log)
    assert log.load_kg == pytest.approx(100.0)
    assert log.added_load_kg is None
    audit = db.query(BwMigrationAudit).filter_by(log_id=log.id).first()
    assert audit is None


def test_migration_is_idempotent(db):
    """Running the migration twice doesn't double-mutate."""
    _seed_catalog(db)
    aragorn = _make_user(db, "aragorn", bw=70.0)
    log = _make_log(db, aragorn, "WEIGHTED PULLUP", load_kg=70.3)

    run_bw_migration(db)
    first_load = log.load_kg
    audit_count_first = db.query(BwMigrationAudit).count()

    run_bw_migration(db)
    db.refresh(log)
    assert log.load_kg == first_load
    assert db.query(BwMigrationAudit).count() == audit_count_first


def test_migration_uses_historical_bodymetric(db):
    """If a BodyMetric exists with date <= log.date, prefer it over user.bodyweight_kg."""
    _seed_catalog(db)
    user = _make_user(db, "yoyo", bw=85.0)
    log = _make_log(db, user, "WEIGHTED PULLUP", load_kg=75.5, day_offset=30)
    db.add(BodyMetric(
        user_id=user.id, date=date.today() - timedelta(days=35),
        bodyweight_kg=75.0,
    ))
    db.commit()

    run_bw_migration(db)

    db.refresh(log)
    audit = db.query(BwMigrationAudit).filter_by(log_id=log.id).first()
    assert audit.reason == "aragorn_correction"
    assert log.load_kg == pytest.approx(75.0)
