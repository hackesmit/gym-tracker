"""Admin endpoints for BW migration rollback + per-user rerun."""

from datetime import date

import pytest

from app.bw_migration import run_bw_migration
from app.models import (
    BwMigrationAudit,
    Program,
    ProgramExercise,
    User,
    WorkoutLog,
)
from app.seed_catalog import seed_exercise_catalog, backfill_catalog_bodyweight_kind


def _make_pullup_log(db, user, load_kg):
    p = Program(user_id=user.id, name="P", frequency=3, start_date=date.today())
    db.add(p); db.flush()
    pe = ProgramExercise(
        program_id=p.id, week=1, session_name="A", session_order_in_week=1,
        exercise_order=1, exercise_name_raw="WEIGHTED PULLUP",
        exercise_name_canonical="WEIGHTED PULLUP",
        prescribed_reps="5", working_sets=3,
    )
    db.add(pe); db.flush()
    log = WorkoutLog(
        user_id=user.id, program_exercise_id=pe.id, date=date.today(),
        set_number=1, load_kg=load_kg, reps_completed=5,
    )
    db.add(log); db.commit()
    return log


def _make_admin_user(db):
    """Replace the seeded user with hackesmit so admin checks pass."""
    user = db.query(User).first()
    user.username = "hackesmit"
    user.name = "hackesmit"
    user.bodyweight_kg = 70.0
    db.commit()
    return user


def test_rollback_endpoint_reverts_changes(db, client):
    from app.models import MigrationLog
    seed_exercise_catalog(db); backfill_catalog_bodyweight_kind(db)
    admin = _make_admin_user(db)
    log = _make_pullup_log(db, admin, load_kg=70.3)

    run_bw_migration(db)
    # Simulate the lifespan gate having marked the migration done
    db.add(MigrationLog(name="bw_input_2026_04"))
    db.commit()
    db.refresh(log)
    assert log.added_load_kg == 0
    assert log.load_kg == pytest.approx(70.0)

    r = client.post("/api/auth/admin/bw-migration-rollback")
    assert r.status_code == 200, r.text

    db.refresh(log)
    assert log.load_kg == pytest.approx(70.3)
    assert log.added_load_kg is None
    assert db.query(BwMigrationAudit).count() == 0
    # Marker is cleared so the next backend restart will re-run the migration
    assert db.query(MigrationLog).filter_by(name="bw_input_2026_04").first() is None


def test_rollback_requires_admin(db, client):
    """Non-admin users get 403."""
    seed_exercise_catalog(db); backfill_catalog_bodyweight_kind(db)
    user = db.query(User).first()
    user.username = "testuser"
    db.commit()
    r = client.post("/api/auth/admin/bw-migration-rollback")
    assert r.status_code == 403


def test_rerun_for_user_processes_only_target(db, client):
    seed_exercise_catalog(db); backfill_catalog_bodyweight_kind(db)
    admin = _make_admin_user(db)
    other = User(name="other", username="other", password_hash="!", bodyweight_kg=70.0)
    db.add(other); db.commit()

    # Initial migration on `other`'s log
    other_log = _make_pullup_log(db, other, load_kg=70.0)
    run_bw_migration(db)

    # New log added AFTER initial migration
    new_log = _make_pullup_log(db, other, load_kg=25.0)

    r = client.post(f"/api/auth/admin/bw-migration-rerun-for-user/{other.id}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["touched"] >= 1
    db.refresh(new_log)
    assert new_log.added_load_kg == 25.0


def test_rerun_for_user_requires_admin(db, client):
    user = db.query(User).first()
    user.username = "testuser"
    db.commit()
    r = client.post("/api/auth/admin/bw-migration-rerun-for-user/1")
    assert r.status_code == 403
