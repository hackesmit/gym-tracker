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
