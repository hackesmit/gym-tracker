"""Tests for workout logging endpoints."""

from datetime import date

from app.models import Program, ProgramExercise, User, WorkoutLog


def _seed_program(db):
    """Insert a minimal program with exercises for testing."""
    from app.models import Program, ProgramExercise

    program = Program(
        user_id=1, name="Test Program", frequency=4,
        status="active", start_date=date(2026, 1, 1), total_weeks=4,
        source_file="test.xlsx",
    )
    db.add(program)
    db.flush()

    exercises = []
    for i, name in enumerate(["BENCH PRESS", "SQUAT", "DEADLIFT"], 1):
        pe = ProgramExercise(
            program_id=program.id, week=1, session_name="TEST",
            exercise_order=i, exercise_name_raw=name,
            exercise_name_canonical=name, working_sets=3,
            prescribed_reps="8-10", prescribed_rpe="8-9",
            session_order_in_week=1,
        )
        db.add(pe)
        exercises.append(pe)
    db.commit()
    return program, exercises


def test_log_bulk_session_success(client, db):
    program, exercises = _seed_program(db)
    payload = {
        "program_id": program.id,
        "week": 1,
        "session_name": "TEST",
        "date": "2026-01-15",
        "sets": [
            {"program_exercise_id": exercises[0].id, "set_number": 1,
             "load_kg": 80.0, "reps_completed": 8},
            {"program_exercise_id": exercises[1].id, "set_number": 1,
             "load_kg": 100.0, "reps_completed": 5},
        ],
    }
    resp = client.post("/api/log/bulk", json=payload)
    assert resp.status_code == 201
    body = resp.json()
    assert body["sets_logged"] == 2
    assert body["exercises_covered"] == 2
    assert body["session_log_id"] > 0


def test_log_bulk_relog_replaces(client, db):
    program, exercises = _seed_program(db)
    payload = {
        "program_id": program.id, "week": 1, "session_name": "TEST",
        "date": "2026-01-15",
        "sets": [{"program_exercise_id": exercises[0].id, "set_number": 1,
                  "load_kg": 80.0, "reps_completed": 8}],
    }
    resp1 = client.post("/api/log/bulk", json=payload)
    assert resp1.status_code == 201
    id1 = resp1.json()["session_log_id"]

    payload["sets"][0]["load_kg"] = 85.0
    resp2 = client.post("/api/log/bulk", json=payload)
    assert resp2.status_code == 201
    id2 = resp2.json()["session_log_id"]
    assert id2 != id1


def test_log_invalid_exercise_id(client, db):
    _seed_program(db)
    payload = {
        "program_id": 1, "week": 1, "session_name": "TEST",
        "date": "2026-01-15",
        "sets": [{"program_exercise_id": 9999, "set_number": 1,
                  "load_kg": 50.0, "reps_completed": 8}],
    }
    resp = client.post("/api/log/bulk", json=payload)
    assert resp.status_code == 404


def test_log_validation_rejects_negative_weight(client, db):
    program, exercises = _seed_program(db)
    payload = {
        "program_id": program.id, "week": 1, "session_name": "TEST",
        "date": "2026-01-15",
        "sets": [{"program_exercise_id": exercises[0].id, "set_number": 1,
                  "load_kg": -10.0, "reps_completed": 8}],
    }
    resp = client.post("/api/log/bulk", json=payload)
    assert resp.status_code == 422


def test_undo_session(client, db):
    program, exercises = _seed_program(db)
    payload = {
        "program_id": program.id, "week": 1, "session_name": "TEST",
        "date": "2026-01-15",
        "sets": [{"program_exercise_id": exercises[0].id, "set_number": 1,
                  "load_kg": 80.0, "reps_completed": 8}],
    }
    resp = client.post("/api/log/bulk", json=payload)
    session_id = resp.json()["session_log_id"]
    resp2 = client.delete(f"/api/log/session/{session_id}")
    assert resp2.status_code == 200
    assert resp2.json()["undone"] is True


def test_bulk_log_round_trips_added_load_kg(db, client):
    """Bulk log endpoint accepts and persists added_load_kg = 0 for pure BW."""
    user = db.query(User).first()
    p = Program(user_id=user.id, name="P", frequency=3, start_date=date.today())
    db.add(p); db.flush()
    pe = ProgramExercise(
        program_id=p.id, week=1, session_name="A", session_order_in_week=1,
        exercise_order=1, exercise_name_raw="PUSHUP", exercise_name_canonical="PUSHUP",
        prescribed_reps="15", working_sets=3,
    )
    db.add(pe); db.commit()
    payload = {
        "program_id": p.id, "week": 1, "session_name": "A",
        "date": str(date.today()),
        "sets": [{
            "program_exercise_id": pe.id, "set_number": 1,
            "load_kg": 80.0, "reps_completed": 15,
            "added_load_kg": 0,
        }],
    }
    r = client.post("/api/log/bulk", json=payload)
    assert r.status_code == 201, r.text
    log = db.query(WorkoutLog).filter_by(program_exercise_id=pe.id).first()
    assert log.added_load_kg == 0
    assert log.load_kg == 80.0


def test_bulk_log_omitted_added_load_kg_stays_null(db, client):
    """Backwards-compat: payload without added_load_kg => NULL."""
    user = db.query(User).first()
    p = Program(user_id=user.id, name="P2", frequency=3, start_date=date.today())
    db.add(p); db.flush()
    pe = ProgramExercise(
        program_id=p.id, week=1, session_name="B", session_order_in_week=1,
        exercise_order=1, exercise_name_raw="BENCH", exercise_name_canonical="BENCH",
        prescribed_reps="5", working_sets=3,
    )
    db.add(pe); db.commit()
    payload = {
        "program_id": p.id, "week": 1, "session_name": "B",
        "date": str(date.today()),
        "sets": [{
            "program_exercise_id": pe.id, "set_number": 1,
            "load_kg": 100.0, "reps_completed": 5,
        }],
    }
    r = client.post("/api/log/bulk", json=payload)
    assert r.status_code == 201, r.text
    log = db.query(WorkoutLog).filter_by(program_exercise_id=pe.id).first()
    assert log.added_load_kg is None


def test_single_log_round_trips_added_load_kg(db, client):
    """Single-set endpoint round-trips added_load_kg too."""
    user = db.query(User).first()
    p = Program(user_id=user.id, name="P3", frequency=3, start_date=date.today())
    db.add(p); db.flush()
    pe = ProgramExercise(
        program_id=p.id, week=1, session_name="C", session_order_in_week=1,
        exercise_order=1, exercise_name_raw="WP", exercise_name_canonical="WP",
        prescribed_reps="5", working_sets=3,
    )
    db.add(pe); db.commit()
    payload = {
        "program_exercise_id": pe.id, "date": str(date.today()),
        "set_number": 1, "load_kg": 105.0, "reps_completed": 5,
        "added_load_kg": 25.0,
    }
    r = client.post("/api/log", json=payload)
    assert r.status_code == 201, r.text
    log = db.query(WorkoutLog).filter_by(program_exercise_id=pe.id).first()
    assert log.added_load_kg == 25.0
    assert log.load_kg == 105.0
