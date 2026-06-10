"""Ownership (IDOR) regression tests for the logging endpoints.

Before the 2026-06 fix, /api/log and /api/log/bulk never verified that the
program / program_exercise ids belonged to the caller. Worst case: the bulk
relog-replace path let any authenticated user delete another user's
SessionLog, WorkoutLogs, and Achievements by posting that user's program_id.
"""

from datetime import date

from app.models import Program, ProgramExercise, SessionLog, User, WorkoutLog


def _seed_other_user_program(db):
    """Create a second user with a program, exercise, session, and one set."""
    other = User(name="victim", username="victim", password_hash="x")
    db.add(other)
    db.flush()

    program = Program(
        user_id=other.id, name="Victim Program", frequency=3,
        status="active", start_date=date(2026, 1, 1), total_weeks=4,
    )
    db.add(program)
    db.flush()

    pe = ProgramExercise(
        program_id=program.id, week=1, session_name="DAY 1",
        exercise_order=1, exercise_name_raw="BENCH PRESS",
        exercise_name_canonical="BENCH PRESS", working_sets=3,
        prescribed_reps="8-10", session_order_in_week=1,
    )
    db.add(pe)
    db.flush()

    session_log = SessionLog(
        user_id=other.id, program_id=program.id, week=1,
        session_name="DAY 1", date=date(2026, 1, 5), status="completed",
    )
    db.add(session_log)
    db.flush()

    log = WorkoutLog(
        user_id=other.id, program_exercise_id=pe.id, date=date(2026, 1, 5),
        set_number=1, load_kg=100.0, reps_completed=5,
        session_log_id=session_log.id,
    )
    db.add(log)
    db.commit()
    return other, program, pe, session_log


def test_single_log_rejects_foreign_program_exercise(client, db):
    _, _, pe, _ = _seed_other_user_program(db)
    resp = client.post("/api/log", json={
        "program_exercise_id": pe.id,
        "date": "2026-01-10",
        "set_number": 1,
        "load_kg": 60.0,
        "reps_completed": 8,
    })
    assert resp.status_code == 404


def test_bulk_log_rejects_foreign_program(client, db):
    """Posting another user's program_id must 404 and must NOT touch their
    existing session via the relog-replace path."""
    other, program, pe, session_log = _seed_other_user_program(db)
    resp = client.post("/api/log/bulk", json={
        "program_id": program.id,
        "week": 1,
        "session_name": "DAY 1",
        "date": "2026-01-10",
        "sets": [
            {"program_exercise_id": pe.id, "set_number": 1,
             "load_kg": 1.0, "reps_completed": 1},
        ],
    })
    assert resp.status_code == 404

    # Victim's session and workout log are untouched
    assert db.query(SessionLog).filter_by(id=session_log.id).first() is not None
    assert (
        db.query(WorkoutLog)
        .filter(WorkoutLog.session_log_id == session_log.id)
        .count()
        == 1
    )


def test_bulk_log_rejects_foreign_program_exercise(client, db):
    """Own program_id but a set referencing another user's exercise → 404."""
    _, _, foreign_pe, _ = _seed_other_user_program(db)

    me = db.query(User).filter_by(username="testuser").first()
    my_program = Program(
        user_id=me.id, name="Mine", frequency=3,
        status="active", start_date=date(2026, 1, 1), total_weeks=4,
    )
    db.add(my_program)
    db.commit()

    resp = client.post("/api/log/bulk", json={
        "program_id": my_program.id,
        "week": 1,
        "session_name": "DAY 1",
        "date": "2026-01-10",
        "sets": [
            {"program_exercise_id": foreign_pe.id, "set_number": 1,
             "load_kg": 1.0, "reps_completed": 1},
        ],
    })
    assert resp.status_code == 404


def test_custom_program_canonical_name_is_uppercase(client, db):
    """Custom-built programs must store UPPERCASE canonical names like every
    other write path (parser, swap, add-exercise) so catalog lookups and the
    rank engine recognize the exercises."""
    resp = client.post("/api/programs/custom", json={
        "name": "My Plan",
        "total_weeks": 1,
        "sessions": [
            {"name": "Day 1", "exercises": [{"name": "bench press"}]},
        ],
    })
    assert resp.status_code == 201
    pe = (
        db.query(ProgramExercise)
        .filter(ProgramExercise.program_id == resp.json()["id"])
        .first()
    )
    assert pe.exercise_name_canonical == "BENCH PRESS"
    assert pe.exercise_name_raw == "bench press"
    assert pe.warm_up_sets == "0"
