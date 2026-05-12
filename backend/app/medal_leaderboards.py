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


# ---------------------------------------------------------------------------
# Strength derivatives
# ---------------------------------------------------------------------------

def _user_strength_components(db: Session, user: User) -> tuple[float, float, float, datetime | None]:
    """Return (bench, squat, deadlift, latest_achieved_at) for a user."""
    parts = []
    latest: datetime | None = None
    for cat in ("bench", "squat", "deadlift"):
        mv, mw = _manual_1rm_value(user, cat)
        lv, lw = _best_official_1rm_with_when(db, user.id, cat)
        if mv >= lv:
            v, w = mv, mw
        else:
            v, w = lv, lw
        parts.append(v)
        if w is not None and (latest is None or w > latest):
            latest = w
    return parts[0], parts[1], parts[2], latest


def _bodyweight_kg(db: Session, user: User) -> float:
    if user.bodyweight_kg and user.bodyweight_kg > 0:
        return float(user.bodyweight_kg)
    latest = (
        db.query(BodyMetric)
        .filter(BodyMetric.user_id == user.id)
        .order_by(BodyMetric.date.desc())
        .first()
    )
    if latest and latest.bodyweight_kg and latest.bodyweight_kg > 0:
        return float(latest.bodyweight_kg)
    return 0.0


def _leaderboard_pl_total(db: Session) -> list[Entry]:
    out: list[Entry] = []
    for user in _real_users(db):
        b, s, d, when = _user_strength_components(db, user)
        if min(b, s, d) <= 0:
            continue
        out.append(Entry(user_id=user.id, username=user.username, value=b + s + d, achieved_at=when))
    out.sort(key=lambda e: (-e.value, e.achieved_at or datetime.max))
    return out


def _leaderboard_relative(db: Session) -> list[Entry]:
    out: list[Entry] = []
    for user in _real_users(db):
        b, s, d, when = _user_strength_components(db, user)
        if min(b, s, d) <= 0:
            continue
        bw = _bodyweight_kg(db, user)
        if bw <= 0:
            continue
        out.append(Entry(user_id=user.id, username=user.username, value=(b + s + d) / bw, achieved_at=when))
    out.sort(key=lambda e: (-e.value, e.achieved_at or datetime.max))
    return out


_HANDLERS["strength_pl_total"] = _leaderboard_pl_total
_HANDLERS["strength_relative"] = _leaderboard_relative


# ---------------------------------------------------------------------------
# Cardio
# ---------------------------------------------------------------------------

def _leaderboard_longest(modality: str) -> Callable[[Session], list[Entry]]:
    def handler(db: Session) -> list[Entry]:
        out: list[Entry] = []
        for user in _real_users(db):
            row = (
                db.query(CardioLog.distance_km, CardioLog.date)
                .filter(
                    CardioLog.user_id == user.id,
                    CardioLog.modality == modality,
                    CardioLog.distance_km > 0,
                )
                .order_by(CardioLog.distance_km.desc())
                .first()
            )
            if row is None:
                continue
            dist, d = row
            when = datetime.combine(d, datetime.min.time()) if d else None
            out.append(Entry(user_id=user.id, username=user.username, value=float(dist), achieved_at=when))
        out.sort(key=lambda e: (-e.value, e.achieved_at or datetime.max))
        return out
    return handler


def _leaderboard_fastest(min_distance_km: float, scale_to_km: float | None) -> Callable[[Session], list[Entry]]:
    """Min pace metric.

    `min_distance_km` is the qualifying threshold (e.g. 1.6 for the mile).
    `scale_to_km` is the constant the pace is multiplied by to produce a
    total minutes value comparable across run lengths — None means "pace
    only" (Fastest Mile is stored as min/km in the engine).
    """
    def handler(db: Session) -> list[Entry]:
        out: list[Entry] = []
        for user in _real_users(db):
            rows = (
                db.query(CardioLog.distance_km, CardioLog.duration_minutes, CardioLog.date)
                .filter(
                    CardioLog.user_id == user.id,
                    CardioLog.modality == "run",
                    CardioLog.distance_km >= min_distance_km,
                    CardioLog.duration_minutes > 0,
                )
                .all()
            )
            best = None
            best_when = None
            for dist, dur, d in rows:
                if not dist or not dur:
                    continue
                pace = float(dur) / float(dist)
                value = pace * scale_to_km if scale_to_km is not None else pace
                if best is None or value < best:
                    best = value
                    best_when = datetime.combine(d, datetime.min.time()) if d else None
            if best is None:
                continue
            out.append(Entry(user_id=user.id, username=user.username, value=best, achieved_at=best_when))
        out.sort(key=lambda e: (e.value, e.achieved_at or datetime.max))
        return out
    return handler


_HANDLERS["cardio_longest:run"] = _leaderboard_longest("run")
_HANDLERS["cardio_longest:bike"] = _leaderboard_longest("bike")
_HANDLERS["cardio_longest:swim"] = _leaderboard_longest("swim")
_HANDLERS["cardio_fastest_mile"] = _leaderboard_fastest(1.6, None)
_HANDLERS["cardio_fastest_5k"] = _leaderboard_fastest(5.0, 5.0)
_HANDLERS["cardio_fastest_10k"] = _leaderboard_fastest(10.0, 10.0)
