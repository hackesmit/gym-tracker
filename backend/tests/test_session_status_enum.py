"""Tests for SessionLog.status enum enforcement and the normalize migration.

Covers:
- Endpoint rejects invalid status with 400.
- Migration sweeps rows with invalid status to 'completed'.
- Migration is idempotent (MigrationLog gate works).
"""

from datetime import date

import pytest
from sqlalchemy import text

from app.main import _normalize_session_status_once
from app.models import MigrationLog, Program, ProgramExercise, SessionLog, User


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_program(db):
    """Create a minimal program owned by the seeded user."""
    user = db.query(User).first()
    prog = Program(
        user_id=user.id,
        name="Status Test Program",
        total_weeks=2,
        frequency=3,
        start_date=date.today(),
    )
    db.add(prog)
    db.commit()
    db.refresh(prog)
    return prog


def _make_session_exercise(db, program):
    """Create a single program exercise so the endpoint can find session 'A'."""
    pe = ProgramExercise(
        program_id=program.id,
        week=1,
        session_name="A",
        session_order_in_week=1,
        exercise_order=1,
        exercise_name_raw="Bench Press",
        exercise_name_canonical="BENCH PRESS",
        working_sets=3,
        prescribed_reps="5",
    )
    db.add(pe)
    db.commit()
    return pe


# ---------------------------------------------------------------------------
# Endpoint tests
# ---------------------------------------------------------------------------

def test_session_status_rejects_invalid_value(client, db):
    """POST /tracker/{id}/session must refuse a non-enum status with 400."""
    prog = _make_program(db)
    _make_session_exercise(db, prog)

    resp = client.post(
        f"/api/tracker/{prog.id}/session",
        json={
            "week": 1,
            "session_name": "A",
            "status": "bogus",
            "date": str(date.today()),
        },
    )
    assert resp.status_code in (400, 422), f"Expected 400/422, got {resp.status_code}: {resp.text}"


@pytest.mark.parametrize("status", ["completed", "partial", "skipped"])
def test_session_status_accepts_valid_values(client, db, status):
    """POST /tracker/{id}/session accepts each valid status value."""
    prog = _make_program(db)
    _make_session_exercise(db, prog)

    resp = client.post(
        f"/api/tracker/{prog.id}/session",
        json={
            "week": 1,
            "session_name": "A",
            "status": status,
            "date": str(date.today()),
        },
    )
    assert resp.status_code == 200, f"Expected 200 for status={status!r}: {resp.text}"
    assert resp.json()["session_status"] == status


# ---------------------------------------------------------------------------
# Migration tests
# ---------------------------------------------------------------------------

def test_normalize_session_status_migration(db):
    """Migration sweeps non-enum status values to 'completed'."""
    prog = _make_program(db)

    # Insert a row with a bogus status bypassing the ORM enum via raw SQL
    db.execute(
        text(
            "INSERT INTO session_logs "
            "(user_id, program_id, week, session_name, status, date) "
            "VALUES (:uid, :pid, 1, 'A', 'wishywashy', :d)"
        ),
        {"uid": db.query(User).first().id, "pid": prog.id, "d": str(date.today())},
    )
    db.commit()

    _normalize_session_status_once(db)

    sl = db.query(SessionLog).filter_by(program_id=prog.id).first()
    assert sl is not None
    assert sl.status == "completed"


def test_normalize_session_status_leaves_valid_rows_untouched(db):
    """Migration must not alter rows that already have a valid status."""
    prog = _make_program(db)
    user = db.query(User).first()

    for i, status in enumerate(["completed", "partial", "skipped"]):
        db.execute(
            text(
                "INSERT INTO session_logs "
                "(user_id, program_id, week, session_name, status, date) "
                "VALUES (:uid, :pid, :w, 'A', :s, :d)"
            ),
            {
                "uid": user.id,
                "pid": prog.id,
                "w": i + 1,
                "s": status,
                "d": str(date.today()),
            },
        )
    db.commit()

    _normalize_session_status_once(db)

    rows = db.query(SessionLog).filter_by(program_id=prog.id).order_by(SessionLog.week).all()
    assert [r.status for r in rows] == ["completed", "partial", "skipped"]


def test_normalize_session_status_migration_idempotent(db):
    """MigrationLog gate prevents the migration from running twice."""
    prog = _make_program(db)

    db.execute(
        text(
            "INSERT INTO session_logs "
            "(user_id, program_id, week, session_name, status, date) "
            "VALUES (:uid, :pid, 1, 'A', 'garbage', :d)"
        ),
        {"uid": db.query(User).first().id, "pid": prog.id, "d": str(date.today())},
    )
    db.commit()

    # First run: should normalize the row.
    _normalize_session_status_once(db)

    # Verify it ran exactly once.
    assert (
        db.query(MigrationLog).filter_by(name="normalize_session_status_2026_05").count() == 1
    )

    # Manually reset the row back to a bad value via raw SQL to verify the
    # MigrationLog gate fires on the second call.
    db.execute(
        text("UPDATE session_logs SET status = 'garbage' WHERE program_id = :pid"),
        {"pid": prog.id},
    )
    db.commit()

    # Second run: gated by MigrationLog → no-op.
    _normalize_session_status_once(db)

    # The second call was a no-op, so the raw status is still 'garbage'.
    row = db.execute(
        text("SELECT status FROM session_logs WHERE program_id = :pid"),
        {"pid": prog.id},
    ).fetchone()
    assert row[0] == "garbage", (
        "Second run should be gated by MigrationLog and not touch the row"
    )
    # Still exactly one MigrationLog row (not two).
    assert (
        db.query(MigrationLog).filter_by(name="normalize_session_status_2026_05").count() == 1
    )
