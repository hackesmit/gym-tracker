"""Tests for swap-by-program-exercise-id (de-linked sibling slots)."""

from datetime import date

from app.models import Program, ProgramExercise, User


def _make_program(db, user_id: int) -> Program:
    program = Program(
        user_id=user_id, name="Plan", frequency=3,
        start_date=date.today(), status="active", total_weeks=2,
    )
    db.add(program)
    db.flush()
    # Two weeks. Each "BACK" session has TWO slots with the SAME name.
    for week in (1, 2):
        for e_idx, ex in enumerate(("T BAR ROW", "T BAR ROW"), start=1):
            db.add(ProgramExercise(
                program_id=program.id, week=week, session_name="BACK",
                session_order_in_week=1, exercise_order=e_idx,
                exercise_name_canonical=ex, exercise_name_raw=ex,
                warm_up_sets="0", working_sets=3, prescribed_reps="8-10",
                prescribed_rpe="8", rest_period="2MIN",
            ))
    db.commit()
    db.refresh(program)
    return program


def test_swap_by_id_changes_only_that_row(client, db):
    user = db.query(User).first()
    program = _make_program(db, user.id)
    rows = (
        db.query(ProgramExercise)
        .filter(ProgramExercise.program_id == program.id,
                ProgramExercise.week == 1)
        .order_by(ProgramExercise.exercise_order)
        .all()
    )
    first, second = rows[0], rows[1]

    r = client.patch(
        f"/api/program/{program.id}/exercise/{first.id}/swap",
        json={"new_exercise_name": "SEATED CABLE ROW"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["pe_id"] == first.id

    db.refresh(first)
    db.refresh(second)
    # Only the tapped slot changed; sibling untouched.
    assert first.exercise_name_canonical == "SEATED CABLE ROW"
    assert second.exercise_name_canonical == "T BAR ROW"

    # Week 2 rows are untouched (this-week-only scope).
    wk2 = (
        db.query(ProgramExercise)
        .filter(ProgramExercise.program_id == program.id,
                ProgramExercise.week == 2)
        .all()
    )
    assert all(x.exercise_name_canonical == "T BAR ROW" for x in wk2)


def test_swap_bad_pe_id_404(client, db):
    user = db.query(User).first()
    program = _make_program(db, user.id)
    r = client.patch(
        f"/api/program/{program.id}/exercise/999999/swap",
        json={"new_exercise_name": "X"},
    )
    assert r.status_code == 404


def test_swap_pe_id_from_another_program_404(client, db):
    user = db.query(User).first()
    prog_a = _make_program(db, user.id)
    prog_b = _make_program(db, user.id)
    pe_in_b = (
        db.query(ProgramExercise)
        .filter(ProgramExercise.program_id == prog_b.id)
        .first()
    )
    # Use prog_a in the path but a pe_id that belongs to prog_b -> 404.
    r = client.patch(
        f"/api/program/{prog_a.id}/exercise/{pe_in_b.id}/swap",
        json={"new_exercise_name": "X"},
    )
    assert r.status_code == 404


def test_swap_other_users_program_404(client, db):
    user = db.query(User).first()
    program = _make_program(db, user.id)
    other = User(name="o", username="other", password_hash="x")
    db.add(other)
    db.flush()
    other_prog = _make_program(db, other.id)
    pe = (
        db.query(ProgramExercise)
        .filter(ProgramExercise.program_id == other_prog.id)
        .first()
    )
    # Current user (seeded) tries to swap a row in other's program.
    r = client.patch(
        f"/api/program/{other_prog.id}/exercise/{pe.id}/swap",
        json={"new_exercise_name": "X"},
    )
    assert r.status_code == 404
