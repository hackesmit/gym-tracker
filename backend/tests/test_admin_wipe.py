"""Admin wipe endpoint: clears one user's data without touching others or the account."""

from datetime import date

from app.auth import get_current_user, hash_password
from app.main import app
from app.models import (
    Achievement,
    BodyMetric,
    CardioLog,
    ChatMessage,
    MuscleScore,
    Program,
    ProgramExercise,
    ProgramProgress,
    SessionLog,
    User,
    WorkoutLog,
)


def _seed_user_with_data(db, username: str) -> User:
    """Create a user + minimal fixtures across every wiped model."""
    user = User(name=username, username=username, password_hash=hash_password("pw"))
    db.add(user)
    db.flush()

    program = Program(
        user_id=user.id, name=f"{username}-prog", frequency=3,
        start_date=date.today(), status="active", total_weeks=4,
    )
    db.add(program)
    db.flush()

    pe = ProgramExercise(
        program_id=program.id, week=1, session_name="PUSH",
        session_order_in_week=1, exercise_order=1,
        exercise_name_canonical="BENCH PRESS", exercise_name_raw="BENCH PRESS",
        warm_up_sets="0", working_sets=3, prescribed_reps="5",
        prescribed_rpe="8", rest_period="2MIN",
        is_superset=False,
    )
    db.add(pe)
    db.add(ProgramProgress(program_id=program.id, current_week=1, current_session_index=1))
    db.flush()

    sl = SessionLog(
        user_id=user.id, program_id=program.id, week=1,
        session_name="PUSH", date=date.today(), status="completed",
    )
    db.add(sl)
    db.flush()
    db.add(WorkoutLog(
        user_id=user.id, program_exercise_id=pe.id, date=date.today(),
        set_number=1, load_kg=100.0, reps_completed=5, session_log_id=sl.id,
    ))
    db.add(Achievement(user_id=user.id, type="e1rm_pr", exercise_name="BENCH PRESS", value=110.0))
    db.add(MuscleScore(user_id=user.id, muscle_group="chest", score=50.0, rank="Gold"))
    db.add(BodyMetric(user_id=user.id, date=date.today(), bodyweight_kg=80.0))
    db.add(CardioLog(user_id=user.id, date=date.today(), modality="run", duration_minutes=30))
    db.add(ChatMessage(user_id=user.id, kind="user", content="hi"))
    db.commit()
    return user


def _login_as(user: User) -> None:
    app.dependency_overrides[get_current_user] = lambda: user


def test_admin_wipe_clears_target_but_preserves_account(client, db):
    admin = db.query(User).first()
    admin.username = "hackesmit"
    db.commit()

    target = _seed_user_with_data(db, "victim")
    keep = _seed_user_with_data(db, "bystander")

    _login_as(admin)
    try:
        r = client.post("/api/auth/admin-wipe-user", json={"target_username": "victim"})
        assert r.status_code == 200, r.text
        counts = r.json()["counts"]
        assert counts.get("workout_logs") == 1
        assert counts.get("achievements") == 1
        assert counts.get("programs") == 1
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    # Victim row still exists with username preserved
    v = db.query(User).filter(User.username == "victim").first()
    assert v is not None
    assert v.password_hash  # still set

    # All per-user rows gone for victim
    assert db.query(Program).filter(Program.user_id == target.id).count() == 0
    assert db.query(WorkoutLog).filter(WorkoutLog.user_id == target.id).count() == 0
    assert db.query(Achievement).filter(Achievement.user_id == target.id).count() == 0
    assert db.query(MuscleScore).filter(MuscleScore.user_id == target.id).count() == 0
    assert db.query(BodyMetric).filter(BodyMetric.user_id == target.id).count() == 0
    assert db.query(CardioLog).filter(CardioLog.user_id == target.id).count() == 0
    assert db.query(SessionLog).filter(SessionLog.user_id == target.id).count() == 0
    assert db.query(ChatMessage).filter(ChatMessage.user_id == target.id).count() == 0

    # Bystander untouched
    assert db.query(Program).filter(Program.user_id == keep.id).count() == 1
    assert db.query(WorkoutLog).filter(WorkoutLog.user_id == keep.id).count() == 1


def test_admin_wipe_rejects_non_admin(client, db):
    attacker = _seed_user_with_data(db, "attacker")
    victim = _seed_user_with_data(db, "victim2")

    _login_as(attacker)
    try:
        r = client.post("/api/auth/admin-wipe-user", json={"target_username": "victim2"})
        assert r.status_code == 403
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    # Victim's data intact
    assert db.query(WorkoutLog).filter(WorkoutLog.user_id == victim.id).count() == 1


def test_admin_wipe_refuses_admin_targets(client, db):
    admin = db.query(User).first()
    admin.username = "hackesmit"
    db.commit()

    other_admin = User(name="hackesmit2", username="hackesmit", password_hash=hash_password("pw"))
    # Can't insert two rows with the same unique username; test the refusal
    # path by pointing at the existing admin itself.

    _login_as(admin)
    try:
        r = client.post("/api/auth/admin-wipe-user", json={"target_username": "hackesmit"})
        assert r.status_code == 400
        assert "admin" in r.json()["detail"].lower()
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_admin_wipe_refuses_preset(client, db):
    admin = db.query(User).first()
    admin.username = "hackesmit"
    db.commit()

    preset = User(name="preset", username="preset", password_hash="!disabled!")
    db.add(preset)
    db.commit()

    _login_as(admin)
    try:
        r = client.post("/api/auth/admin-wipe-user", json={"target_username": "preset"})
        assert r.status_code == 400
    finally:
        app.dependency_overrides.pop(get_current_user, None)
