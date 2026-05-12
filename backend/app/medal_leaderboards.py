"""Per-medal leaderboards — compute every user's current value for a metric.

The medal engine flips `MedalCurrentHolder` only on improvements. This module
answers a different question — *all users*, not just the leader — so it
computes values on demand. Categorization rules are imported from
`medal_engine` so the top row here always matches `MedalCurrentHolder`.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Callable

from sqlalchemy import func
from sqlalchemy.orm import Session

from .medal_engine import (
    EXERCISE_TO_LIFT_CATEGORY,
    _epley,
)
from .models import (
    BodyMetric,
    CardioLog,
    ProgramExercise,
    SessionLog,
    User,
    WorkoutLog,
)


@dataclass(frozen=True)
class Entry:
    user_id: int
    username: str
    value: float
    achieved_at: datetime | None


def _real_users(db: Session) -> list[User]:
    """All users except the synthetic `preset` account."""
    return db.query(User).filter(User.username != "preset").all()


# Dispatch table populated by per-family modules below.
_HANDLERS: dict[str, Callable[[Session], list[Entry]]] = {}


def leaderboard_for(db: Session, metric_type: str) -> list[Entry]:
    """Return the sorted leaderboard for a metric.

    Sort order is metric-dependent — handlers sort their own output before
    returning so the dispatch layer stays metric-agnostic.

    Raises ValueError for unknown metrics.
    """
    handler = _HANDLERS.get(metric_type)
    if handler is None:
        raise ValueError(f"Unknown metric_type: {metric_type!r}")
    return handler(db)
