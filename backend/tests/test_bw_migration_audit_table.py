"""Schema test for the new audit + migration_log tables."""

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import BwMigrationAudit, MigrationLog, User


def test_bw_migration_audit_round_trip(db):
    user = db.query(User).first()
    row = BwMigrationAudit(
        log_id=42,
        user_id=user.id,
        exercise_name="WEIGHTED PULLUP",
        old_load_kg=70.3,
        new_load_kg=70.0,
        new_added_load_kg=0.0,
        reason="aragorn_correction",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    assert row.id is not None
    assert row.created_at is not None
    assert row.reason == "aragorn_correction"


def test_migration_log_unique_name(db):
    db.add(MigrationLog(name="bw_input_2026_04"))
    db.commit()
    db.add(MigrationLog(name="bw_input_2026_04"))
    with pytest.raises(IntegrityError):
        db.commit()
