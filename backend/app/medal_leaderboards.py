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


# ---------------------------------------------------------------------------
# Strength single-lift metrics
# ---------------------------------------------------------------------------

def _manual_1rm_value(user: User, key: str) -> tuple[float, datetime | None]:
    """Return (value_kg, tested_at) from User.manual_1rm — supports legacy float format."""
    m = user.manual_1rm or {}
    entry = m.get(key)
    if entry is None:
        return 0.0, None
    if isinstance(entry, (int, float)):
        return float(entry), None
    if isinstance(entry, dict):
        try:
            val = float(entry.get("value_kg") or 0.0)
        except (TypeError, ValueError):
            return 0.0, None
        tested_raw = entry.get("tested_at")
        tested = None
        if isinstance(tested_raw, str):
            try:
                tested = datetime.fromisoformat(tested_raw)
            except ValueError:
                tested = None
        return val, tested
    return 0.0, None


def _best_official_1rm_with_when(
    db: Session, user_id: int, category: str
) -> tuple[float, datetime | None]:
    """Mirror of `_best_official_1rm` in medal_engine, but also returns the log timestamp."""
    patterns = EXERCISE_TO_LIFT_CATEGORY.get(category) or []
    if not patterns:
        return 0.0, None
    rows = (
        db.query(
            ProgramExercise.exercise_name_canonical,
            WorkoutLog.load_kg,
            WorkoutLog.date,
        )
        .join(WorkoutLog, WorkoutLog.program_exercise_id == ProgramExercise.id)
        .filter(
            WorkoutLog.user_id == user_id,
            WorkoutLog.is_true_1rm_attempt.is_(True),
            WorkoutLog.completed_successfully.is_(True),
            WorkoutLog.reps_completed == 1,
            WorkoutLog.load_kg > 0,
        )
        .all()
    )
    best = 0.0
    best_when: datetime | None = None
    for name, load, d in rows:
        if not name or not load:
            continue
        lower = name.lower()
        if not any(p in lower for p in patterns):
            continue
        if load > best:
            best = float(load)
            best_when = datetime.combine(d, datetime.min.time()) if d else None
    return best, best_when


def _strength_single_lift(category: str) -> Callable[[Session], list[Entry]]:
    def handler(db: Session) -> list[Entry]:
        out: list[Entry] = []
        for user in _real_users(db):
            manual_val, manual_when = _manual_1rm_value(user, category)
            logged_val, logged_when = _best_official_1rm_with_when(db, user.id, category)
            if manual_val >= logged_val:
                value, when = manual_val, manual_when
            else:
                value, when = logged_val, logged_when
            if value <= 0:
                continue
            out.append(Entry(user_id=user.id, username=user.username, value=value, achieved_at=when))
        out.sort(key=lambda e: (-e.value, e.achieved_at or datetime.max))
        return out
    return handler


for _cat in ("bench", "squat", "deadlift", "ohp"):
    _HANDLERS[f"strength_1rm:{_cat}"] = _strength_single_lift(_cat)
