"""Regressions for the 2026-08-17 cross-vendor codebase review (bead gt-fmr):
case-insensitive username uniqueness, one-active via PATCH status, unique
custom session names, bulk sets bound to program+week, bulk status literal."""

from datetime import date

from app.auth import hash_password
from app.models import Program, ProgramExercise, User


def _prog(db, user_id, name, status="active", weeks=2):
    p = Program(user_id=user_id, name=name, frequency=2, start_date=date.today(), status=status, total_weeks=weeks)
    db.add(p)
    db.flush()
    return p


def _pe(db, program_id, week, session, order=1, name="PEC DECK"):
    pe = ProgramExercise(
        program_id=program_id, week=week, session_name=session, session_order_in_week=1,
        exercise_order=order, exercise_name_canonical=name, exercise_name_raw=name,
        warm_up_sets="0", working_sets=2, prescribed_reps="8-10", prescribed_rpe="9",
    )
    db.add(pe)
    db.flush()
    return pe


def test_register_rejects_case_variant_of_existing_username(client, db):
    r = client.post("/api/auth/register", json={"username": "TestUser", "password": "pw123456"})
    assert r.status_code == 409, r.text
    r = client.post("/api/auth/register", json={"username": "Hackesmit", "password": "pw123456"})
    assert r.status_code == 409, r.text  # admin name reserved case-insensitively


def test_status_active_pauses_other_active(client, db):
    user = db.query(User).first()
    a = _prog(db, user.id, "A", "active")
    b = _prog(db, user.id, "B", "completed")
    b.end_date = date.today()
    db.commit()
    r = client.patch(f"/api/program/{b.id}/status", json={"status": "active"})
    assert r.status_code == 200, r.text
    db.refresh(a)
    db.refresh(b)
    assert (a.status, b.status, b.end_date) == ("paused", "active", None)


def test_custom_program_rejects_duplicate_session_names(client):
    r = client.post("/api/programs/custom", json={
        "name": "Dup", "total_weeks": 1,
        "sessions": [
            {"name": "Upper", "exercises": [{"name": "Bench"}]},
            {"name": "upper ", "exercises": [{"name": "Row"}]},
        ],
    })
    assert r.status_code == 400
    assert "unique" in r.json()["detail"]


def test_bulk_log_rejects_exercise_from_other_week_or_program(client, db):
    user = db.query(User).first()
    p1 = _prog(db, user.id, "P1")
    p2 = _prog(db, user.id, "P2", "paused")
    pe_w1 = _pe(db, p1.id, 1, "DAY 1")
    pe_w2 = _pe(db, p1.id, 2, "DAY 1")
    pe_p2 = _pe(db, p2.id, 1, "DAY 1")
    db.commit()

    def post(pe_id):
        return client.post("/api/log/bulk", json={
            "program_id": p1.id, "week": 1, "session_name": "DAY 1", "date": "2026-08-17",
            "sets": [{"program_exercise_id": pe_id, "set_number": 1, "load_kg": 50, "reps_completed": 8}],
        })

    assert post(pe_w2.id).status_code == 400
    assert post(pe_p2.id).status_code == 400
    ok = post(pe_w1.id)
    assert ok.status_code == 201, ok.text


def test_bulk_log_rejects_unknown_session_status(client, db):
    user = db.query(User).first()
    p1 = _prog(db, user.id, "P1")
    pe = _pe(db, p1.id, 1, "DAY 1")
    db.commit()
    r = client.post("/api/log/bulk", json={
        "program_id": p1.id, "week": 1, "session_name": "DAY 1", "date": "2026-08-17",
        "session_status": "done",
        "sets": [{"program_exercise_id": pe.id, "set_number": 1, "load_kg": 50, "reps_completed": 8}],
    })
    assert r.status_code == 400
