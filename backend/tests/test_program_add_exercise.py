"""Tests for adding an exercise to a session (week-only vs all-weeks)."""

from datetime import date

from app.models import Program, ProgramExercise, User


def _make_program(db, user_id: int) -> Program:
    program = Program(
        user_id=user_id, name="Plan", frequency=3,
        start_date=date.today(), status="active", total_weeks=3,
    )
    db.add(program)
    db.flush()
    for week in (1, 2, 3):
        for e_idx, ex in enumerate(("BENCH PRESS", "INCLINE DB PRESS"), start=1):
            db.add(ProgramExercise(
                program_id=program.id, week=week, session_name="PUSH",
                session_order_in_week=1, exercise_order=e_idx,
                exercise_name_canonical=ex, exercise_name_raw=ex,
                warm_up_sets="0", working_sets=3, prescribed_reps="8-10",
                prescribed_rpe="8", rest_period="2MIN",
            ))
    db.commit()
    db.refresh(program)
    return program


def test_add_exercise_week_scope_inserts_one_row(client, db):
    user = db.query(User).first()
    program = _make_program(db, user.id)
    r = client.post(
        f"/api/program/{program.id}/exercise",
        json={"week": 2, "session_name": "PUSH",
              "exercise_name": "CABLE FLY", "scope": "week"},
    )
    assert r.status_code == 201, r.text
    rows = (
        db.query(ProgramExercise)
        .filter(ProgramExercise.program_id == program.id,
                ProgramExercise.exercise_name_canonical == "CABLE FLY")
        .all()
    )
    assert len(rows) == 1
    assert rows[0].week == 2
    assert rows[0].session_name == "PUSH"
    assert rows[0].exercise_order == 3
    assert rows[0].session_order_in_week == 1


def test_add_exercise_all_weeks_inserts_per_week(client, db):
    user = db.query(User).first()
    program = _make_program(db, user.id)
    r = client.post(
        f"/api/program/{program.id}/exercise",
        json={"week": 2, "session_name": "PUSH",
              "exercise_name": "CABLE FLY", "scope": "all_weeks"},
    )
    assert r.status_code == 201, r.text
    rows = (
        db.query(ProgramExercise)
        .filter(ProgramExercise.program_id == program.id,
                ProgramExercise.exercise_name_canonical == "CABLE FLY")
        .all()
    )
    assert {x.week for x in rows} == {1, 2, 3}
    assert all(x.exercise_order == 3 for x in rows)


def test_add_exercise_other_users_program_404(client, db):
    user = db.query(User).first()
    other = User(name="o", username="other2", password_hash="x")
    db.add(other)
    db.flush()
    program = _make_program(db, other.id)
    r = client.post(
        f"/api/program/{program.id}/exercise",
        json={"week": 1, "session_name": "PUSH",
              "exercise_name": "CABLE FLY", "scope": "week"},
    )
    assert r.status_code == 404
