"""Per-user isolation tests: user A must not see user B's data."""

from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.auth import get_current_user, hash_password
from app.database import get_db
from app.main import app
from app.models import CardioLog, Program, ProgramExercise, User, WorkoutLog


def _make_user(db, username):
    u = User(username=username, name=username, password_hash=hash_password("pw"))
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def test_isolation_programs_logs_cardio(db):
    # Seed two users
    a = db.query(User).first()  # pre-seeded 'testuser'
    b = _make_user(db, "userB")

    # User A: program + a workout log + cardio
    prog_a = Program(user_id=a.id, name="A-prog", frequency=3, start_date=date(2026, 1, 1))
    db.add(prog_a); db.commit()
    pe_a = ProgramExercise(
        program_id=prog_a.id, week=1, session_name="X", session_order_in_week=1,
        exercise_order=1, exercise_name_canonical="A-EX", exercise_name_raw="A-EX",
        working_sets=3, prescribed_reps="8",
    )
    db.add(pe_a); db.commit()
    db.add(WorkoutLog(
        user_id=a.id, program_exercise_id=pe_a.id, date=date(2026, 1, 2),
        set_number=1, load_kg=50.0, reps_completed=5,
    ))
    db.add(CardioLog(user_id=a.id, date=date(2026, 1, 3), modality="run", duration_minutes=30, distance_km=5))
    db.commit()

    # User B: their own
    prog_b = Program(user_id=b.id, name="B-prog", frequency=3, start_date=date(2026, 1, 1))
    db.add(prog_b); db.commit()
    db.add(CardioLog(user_id=b.id, date=date(2026, 1, 3), modality="bike", duration_minutes=45, distance_km=15))
    db.commit()

    # Now impersonate B: override get_current_user to return B
    def _as_b():
        return b
    def _db_override():
        yield db

    app.dependency_overrides[get_db] = _db_override
    app.dependency_overrides[get_current_user] = _as_b
    try:
        with TestClient(app) as c:
            # B should only see their own program
            res = c.get("/api/programs")
            assert res.status_code == 200
            names = [p["name"] for p in res.json()["programs"]]
            assert "B-prog" in names
            assert "A-prog" not in names

            # B should not read A's program detail
            res = c.get(f"/api/program/{prog_a.id}/schedule")
            assert res.status_code == 404

            # Logs list: B has no workout logs
            res = c.get("/api/logs")
            assert res.status_code == 200
            assert res.json() == []

            # Cardio: only bike
            res = c.get("/api/cardio/logs")
            assert res.status_code == 200
            modalities = {c["modality"] for c in res.json()}
            assert modalities == {"bike"}
    finally:
        app.dependency_overrides.clear()
