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
