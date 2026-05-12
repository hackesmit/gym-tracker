"""Tests for the per-medal leaderboard module + endpoint."""

import pytest
from datetime import date, timedelta

from app.medal_leaderboards import leaderboard_for, Entry
from app.medal_engine import seed_medal_catalog
from app.models import (
    User, Program, ProgramExercise, WorkoutLog, SessionLog,
    CardioLog, BodyMetric, Medal, MedalCurrentHolder,
)
from app.auth import hash_password


def test_leaderboard_for_unknown_metric_raises(db):
    with pytest.raises(ValueError):
        leaderboard_for(db, "not_a_metric")


def _mk_user(db, username: str, manual_1rm=None, bw_kg=None) -> User:
    u = User(
        name=username,
        username=username,
        password_hash=hash_password("x"),
        manual_1rm=manual_1rm,
        bodyweight_kg=bw_kg,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _mk_program(db, user_id: int) -> Program:
    p = Program(
        user_id=user_id,
        name="P",
        total_weeks=1,
        frequency=3,
        status="active",
        start_date=date.today(),
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def _mk_exercise(db, program_id: int, canonical: str) -> ProgramExercise:
    pe = ProgramExercise(
        program_id=program_id,
        week=1,
        session_name="A",
        session_order_in_week=1,
        exercise_order=1,
        exercise_name_canonical=canonical,
        exercise_name_raw=canonical,
        working_sets=1,
        prescribed_reps="1",
    )
    db.add(pe)
    db.commit()
    db.refresh(pe)
    return pe


def _mk_log_1rm(db, user_id: int, pe_id: int, load_kg: float, when: date | None = None):
    log = WorkoutLog(
        user_id=user_id,
        program_exercise_id=pe_id,
        date=when or date.today(),
        set_number=1,
        load_kg=load_kg,
        reps_completed=1,
        is_true_1rm_attempt=True,
        completed_successfully=True,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def test_strength_bench_orders_descending_excludes_users_without_value(db):
    seed_medal_catalog(db)
    a = _mk_user(db, "alice", manual_1rm={"bench": {"value_kg": 100.0, "tested_at": "2026-01-01"}})
    b = _mk_user(db, "bob", manual_1rm={"bench": {"value_kg": 120.0, "tested_at": "2026-01-01"}})
    _ = _mk_user(db, "carol")  # no bench data

    rows = leaderboard_for(db, "strength_1rm:bench")
    usernames = [e.username for e in rows]
    values = [e.value for e in rows]

    assert usernames == ["bob", "alice"]
    assert values == [120.0, 100.0]


def test_strength_bench_manual_first_class_beats_old_logged(db):
    seed_medal_catalog(db)
    a = _mk_user(db, "alice")  # will have a logged 1RM
    p = _mk_program(db, a.id)
    pe = _mk_exercise(db, p.id, "Barbell Bench Press")
    _mk_log_1rm(db, a.id, pe.id, load_kg=100.0)

    b = _mk_user(db, "bob", manual_1rm={"bench": {"value_kg": 120.0, "tested_at": "2026-01-01"}})

    rows = leaderboard_for(db, "strength_1rm:bench")
    assert [e.username for e in rows] == ["bob", "alice"]


def test_strength_logged_only_counts_true_1rm_attempts(db):
    """A 5-rep bench at 100kg must not appear (engine never awards it)."""
    seed_medal_catalog(db)
    a = _mk_user(db, "alice")
    p = _mk_program(db, a.id)
    pe = _mk_exercise(db, p.id, "Barbell Bench Press")
    log = WorkoutLog(
        user_id=a.id,
        program_exercise_id=pe.id,
        date=date.today(),
        set_number=1,
        load_kg=100.0,
        reps_completed=5,
        is_true_1rm_attempt=False,
        completed_successfully=True,
    )
    db.add(log)
    db.commit()

    rows = leaderboard_for(db, "strength_1rm:bench")
    assert rows == []


def test_strength_pl_total_omits_users_missing_a_lift(db):
    seed_medal_catalog(db)
    full = _mk_user(db, "full", manual_1rm={
        "bench": {"value_kg": 100.0, "tested_at": "2026-01-01"},
        "squat": {"value_kg": 150.0, "tested_at": "2026-01-01"},
        "deadlift": {"value_kg": 180.0, "tested_at": "2026-01-01"},
    })
    partial = _mk_user(db, "partial", manual_1rm={
        "bench": {"value_kg": 100.0, "tested_at": "2026-01-01"},
        "squat": {"value_kg": 150.0, "tested_at": "2026-01-01"},
    })

    rows = leaderboard_for(db, "strength_pl_total")
    assert [e.username for e in rows] == ["full"]
    assert rows[0].value == 430.0


def test_strength_relative_omits_users_without_bodyweight(db):
    seed_medal_catalog(db)
    full = _mk_user(db, "full", bw_kg=80.0, manual_1rm={
        "bench": {"value_kg": 100.0, "tested_at": "2026-01-01"},
        "squat": {"value_kg": 150.0, "tested_at": "2026-01-01"},
        "deadlift": {"value_kg": 200.0, "tested_at": "2026-01-01"},
    })
    no_bw = _mk_user(db, "no_bw", manual_1rm={
        "bench": {"value_kg": 100.0, "tested_at": "2026-01-01"},
        "squat": {"value_kg": 150.0, "tested_at": "2026-01-01"},
        "deadlift": {"value_kg": 200.0, "tested_at": "2026-01-01"},
    })

    rows = leaderboard_for(db, "strength_relative")
    assert [e.username for e in rows] == ["full"]
    assert rows[0].value == pytest.approx(450.0 / 80.0)


def _mk_cardio(db, user_id: int, modality: str, distance_km: float, duration_min: float, when: date | None = None):
    log = CardioLog(
        user_id=user_id,
        modality=modality,
        distance_km=distance_km,
        duration_minutes=duration_min,
        date=when or date.today(),
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def test_cardio_longest_run_orders_descending(db):
    seed_medal_catalog(db)
    a = _mk_user(db, "alice")
    b = _mk_user(db, "bob")
    _mk_cardio(db, a.id, "run", distance_km=5.0, duration_min=30.0)
    _mk_cardio(db, a.id, "run", distance_km=10.0, duration_min=70.0)
    _mk_cardio(db, b.id, "run", distance_km=8.0, duration_min=50.0)

    rows = leaderboard_for(db, "cardio_longest:run")
    assert [e.username for e in rows] == ["alice", "bob"]
    assert rows[0].value == 10.0


def test_cardio_fastest_mile_orders_ascending(db):
    seed_medal_catalog(db)
    a = _mk_user(db, "alice")
    b = _mk_user(db, "bob")
    _mk_cardio(db, a.id, "run", distance_km=5.0, duration_min=30.0)  # 6 min/km
    _mk_cardio(db, b.id, "run", distance_km=5.0, duration_min=25.0)  # 5 min/km

    rows = leaderboard_for(db, "cardio_fastest_mile")
    assert [e.username for e in rows] == ["bob", "alice"]
    assert rows[0].value == pytest.approx(5.0)


def test_cardio_preset_user_excluded(db):
    seed_medal_catalog(db)
    preset = _mk_user(db, "preset")
    a = _mk_user(db, "alice")
    _mk_cardio(db, preset.id, "run", distance_km=100.0, duration_min=600.0)
    _mk_cardio(db, a.id, "run", distance_km=10.0, duration_min=60.0)

    rows = leaderboard_for(db, "cardio_longest:run")
    assert [e.username for e in rows] == ["alice"]


def _mk_session(db, user_id: int, program_id: int, when: date, name: str = "A"):
    s = SessionLog(
        user_id=user_id,
        program_id=program_id,
        week=1,
        session_name=name,
        date=when,
        status="completed",
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def test_consistency_sessions_30d_counts_recent(db):
    seed_medal_catalog(db)
    a = _mk_user(db, "alice")
    pa = _mk_program(db, a.id)
    today = date.today()
    for i, name in enumerate(["A", "B", "C"]):
        _mk_session(db, a.id, pa.id, today - timedelta(days=i), name=name)

    b = _mk_user(db, "bob")
    pb = _mk_program(db, b.id)
    _mk_session(db, b.id, pb.id, today, name="A")
    _mk_session(db, b.id, pb.id, today - timedelta(days=60), name="B")  # too old

    rows = leaderboard_for(db, "consistency_sessions_30d")
    assert [(e.username, int(e.value)) for e in rows] == [("alice", 3), ("bob", 1)]


def test_consistency_volume_30d_uses_added_load_for_bw_lifts(db):
    seed_medal_catalog(db)
    a = _mk_user(db, "alice")
    p = _mk_program(db, a.id)
    pe = _mk_exercise(db, p.id, "Weighted Pullup")
    log = WorkoutLog(
        user_id=a.id,
        program_exercise_id=pe.id,
        date=date.today(),
        set_number=1,
        load_kg=80.0,      # bw 80 + 20kg plate
        added_load_kg=20.0,
        reps_completed=5,
    )
    db.add(log)
    db.commit()

    rows = leaderboard_for(db, "consistency_volume_30d")
    # 20 (plate) * 5 reps = 100, not 80*5=400.
    assert rows[0].username == "alice"
    assert rows[0].value == pytest.approx(100.0)


def test_consistency_longest_streak_counts_consecutive_weeks(db):
    seed_medal_catalog(db)
    a = _mk_user(db, "alice")
    p = _mk_program(db, a.id)
    today = date.today()
    # 4 consecutive weeks of training, then a 1-week gap, then 1 more week.
    for weeks_ago in (5, 4, 3, 2, 0):
        _mk_session(db, a.id, p.id, today - timedelta(weeks=weeks_ago), name=f"w{weeks_ago}")
    rows = leaderboard_for(db, "consistency_longest_streak")
    assert rows[0].username == "alice"
    assert int(rows[0].value) == 4


def test_performance_1rm_increase_30d_orders_by_delta(db):
    seed_medal_catalog(db)
    a = _mk_user(db, "alice")
    p = _mk_program(db, a.id)
    pe = _mk_exercise(db, p.id, "Barbell Bench Press")
    today = date.today()
    # Last 30d: 110kg x1; Prior 30d: 100kg x1 → delta 10kg.
    log_recent = WorkoutLog(
        user_id=a.id, program_exercise_id=pe.id,
        date=today - timedelta(days=5),
        set_number=1, load_kg=110.0, reps_completed=1,
    )
    log_prior = WorkoutLog(
        user_id=a.id, program_exercise_id=pe.id,
        date=today - timedelta(days=45),
        set_number=1, load_kg=100.0, reps_completed=1,
    )
    db.add_all([log_recent, log_prior])
    db.commit()

    rows = leaderboard_for(db, "performance_1rm_increase_30d")
    assert rows[0].username == "alice"
    assert rows[0].value == pytest.approx(10.0)


def test_endpoint_returns_404_for_unknown_medal(client):
    resp = client.get("/api/medals/9999/leaderboard")
    assert resp.status_code == 404


def test_endpoint_returns_entries_sorted(client, db):
    seed_medal_catalog(db)
    _mk_user(db, "alice", manual_1rm={"bench": {"value_kg": 100.0, "tested_at": "2026-01-01"}})
    _mk_user(db, "bob", manual_1rm={"bench": {"value_kg": 120.0, "tested_at": "2026-01-01"}})
    medal = db.query(Medal).filter(Medal.metric_type == "strength_1rm:bench").first()

    resp = client.get(f"/api/medals/{medal.id}/leaderboard")
    assert resp.status_code == 200
    body = resp.json()
    assert body["medal"]["metric_type"] == "strength_1rm:bench"
    assert [e["username"] for e in body["entries"]] == ["bob", "alice"]
    assert body["entries"][0]["value"] == 120.0


def test_leader_matches_current_holder_for_strength(client, db):
    """Invariant: when MedalCurrentHolder exists, the top of the leaderboard equals it."""
    seed_medal_catalog(db)
    _mk_user(db, "alice", manual_1rm={"bench": {"value_kg": 100.0, "tested_at": "2026-01-01"}})
    _mk_user(db, "bob", manual_1rm={"bench": {"value_kg": 130.0, "tested_at": "2026-01-01"}})
    medal = db.query(Medal).filter(Medal.metric_type == "strength_1rm:bench").first()
    # Simulate the engine running — write a MedalCurrentHolder row directly.
    bob = db.query(User).filter(User.username == "bob").first()
    db.add(MedalCurrentHolder(medal_id=medal.id, user_id=bob.id, value=130.0))
    db.commit()

    resp = client.get(f"/api/medals/{medal.id}/leaderboard")
    body = resp.json()
    top = body["entries"][0]
    holder = db.get(MedalCurrentHolder, medal.id)
    assert top["user_id"] == holder.user_id
    assert top["value"] == holder.value
