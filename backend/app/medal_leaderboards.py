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


# ---------------------------------------------------------------------------
# Consistency
# ---------------------------------------------------------------------------

def _leaderboard_sessions(window_days: int | None) -> Callable[[Session], list[Entry]]:
    def handler(db: Session) -> list[Entry]:
        out: list[Entry] = []
        today = date.today()
        cutoff = today - timedelta(days=window_days) if window_days else None
        for user in _real_users(db):
            q = (
                db.query(func.count(SessionLog.id), func.max(SessionLog.date))
                .filter(
                    SessionLog.user_id == user.id,
                    SessionLog.status == "completed",
                )
            )
            if cutoff is not None:
                q = q.filter(SessionLog.date >= cutoff)
            count, last_d = q.one()
            count = int(count or 0)
            if count <= 0:
                continue
            when = datetime.combine(last_d, datetime.min.time()) if last_d else None
            out.append(Entry(user_id=user.id, username=user.username, value=float(count), achieved_at=when))
        out.sort(key=lambda e: (-e.value, e.achieved_at or datetime.max))
        return out
    return handler


def _leaderboard_volume_30d(db: Session) -> list[Entry]:
    today = date.today()
    cutoff = today - timedelta(days=30)
    out: list[Entry] = []
    for user in _real_users(db):
        vol = (
            db.query(
                func.coalesce(
                    func.sum(
                        func.coalesce(WorkoutLog.added_load_kg, WorkoutLog.load_kg) * WorkoutLog.reps_completed
                    ),
                    0.0,
                )
            )
            .filter(WorkoutLog.user_id == user.id, WorkoutLog.date >= cutoff)
            .scalar()
        ) or 0.0
        vol = float(vol)
        if vol <= 0:
            continue
        last_d = (
            db.query(func.max(WorkoutLog.date))
            .filter(WorkoutLog.user_id == user.id, WorkoutLog.date >= cutoff)
            .scalar()
        )
        when = datetime.combine(last_d, datetime.min.time()) if last_d else None
        out.append(Entry(user_id=user.id, username=user.username, value=vol, achieved_at=when))
    out.sort(key=lambda e: (-e.value, e.achieved_at or datetime.max))
    return out


def _leaderboard_perfect_weeks(db: Session) -> list[Entry]:
    today = date.today()
    window_start = today - timedelta(days=180)
    out: list[Entry] = []
    for user in _real_users(db):
        rows = (
            db.query(SessionLog.date)
            .filter(
                SessionLog.user_id == user.id,
                SessionLog.status == "completed",
                SessionLog.date >= window_start,
            )
            .all()
        )
        week_counter: dict[tuple[int, int], int] = {}
        latest: date | None = None
        for (d,) in rows:
            y, w, _ = d.isocalendar()
            week_counter[(y, w)] = week_counter.get((y, w), 0) + 1
            if latest is None or d > latest:
                latest = d
        perfect = sum(1 for v in week_counter.values() if v >= 3)
        if perfect <= 0:
            continue
        when = datetime.combine(latest, datetime.min.time()) if latest else None
        out.append(Entry(user_id=user.id, username=user.username, value=float(perfect), achieved_at=when))
    out.sort(key=lambda e: (-e.value, e.achieved_at or datetime.max))
    return out


_HANDLERS["consistency_sessions_30d"] = _leaderboard_sessions(30)
_HANDLERS["consistency_sessions_all"] = _leaderboard_sessions(None)
_HANDLERS["consistency_volume_30d"] = _leaderboard_volume_30d
_HANDLERS["consistency_perfect_weeks"] = _leaderboard_perfect_weeks


def _leaderboard_longest_streak(db: Session) -> list[Entry]:
    out: list[Entry] = []
    for user in _real_users(db):
        rows = (
            db.query(SessionLog.date)
            .filter(
                SessionLog.user_id == user.id,
                SessionLog.status == "completed",
            )
            .all()
        )
        if not rows:
            continue
        weeks = sorted({(d.isocalendar()[0], d.isocalendar()[1]) for (d,) in rows})
        if not weeks:
            continue

        def _next_week(yw: tuple[int, int]) -> tuple[int, int]:
            y, w = yw
            monday = date.fromisocalendar(y, w, 1) + timedelta(days=7)
            ny, nw, _ = monday.isocalendar()
            return (ny, nw)

        best = 1
        run = 1
        for i in range(1, len(weeks)):
            if weeks[i] == _next_week(weeks[i - 1]):
                run += 1
                best = max(best, run)
            else:
                run = 1
        latest = max(d for (d,) in rows)
        out.append(Entry(user_id=user.id, username=user.username, value=float(best),
                         achieved_at=datetime.combine(latest, datetime.min.time())))
    out.sort(key=lambda e: (-e.value, e.achieved_at or datetime.max))
    return out


_HANDLERS["consistency_longest_streak"] = _leaderboard_longest_streak


# ---------------------------------------------------------------------------
# Performance (rolling 30d deltas)
# ---------------------------------------------------------------------------

from .medal_engine import _best_estimated_1rm_in_window  # noqa: E402


def _performance_user_metrics(db: Session, user_id: int) -> dict[str, float]:
    """Recompute the 3 performance metrics for one user. Returns {metric: value} for nonzero values only."""
    today = date.today()
    last_start = today - timedelta(days=30)
    prior_start = today - timedelta(days=60)
    prior_end = last_start - timedelta(days=1)

    best_delta_kg = 0.0
    best_pct = 0.0
    for cat in EXERCISE_TO_LIFT_CATEGORY:
        last = _best_estimated_1rm_in_window(db, user_id, cat, last_start, today)
        prior = _best_estimated_1rm_in_window(db, user_id, cat, prior_start, prior_end)
        if last <= 0 or prior <= 0:
            continue
        delta = last - prior
        if delta > best_delta_kg:
            best_delta_kg = delta
            best_pct = (last - prior) / prior * 100.0

    out: dict[str, float] = {}
    if best_delta_kg > 0:
        out["performance_1rm_increase_30d"] = best_delta_kg
        out["performance_most_improved_pct"] = best_pct

    vol_last = (
        db.query(func.coalesce(func.sum(func.coalesce(WorkoutLog.added_load_kg, WorkoutLog.load_kg) * WorkoutLog.reps_completed), 0.0))
        .filter(WorkoutLog.user_id == user_id, WorkoutLog.date >= last_start, WorkoutLog.date <= today)
        .scalar()
    ) or 0.0
    vol_prior = (
        db.query(func.coalesce(func.sum(func.coalesce(WorkoutLog.added_load_kg, WorkoutLog.load_kg) * WorkoutLog.reps_completed), 0.0))
        .filter(WorkoutLog.user_id == user_id, WorkoutLog.date >= prior_start, WorkoutLog.date <= prior_end)
        .scalar()
    ) or 0.0
    if vol_prior > 0 and vol_last > vol_prior:
        out["performance_volume_increase_30d"] = (float(vol_last) - float(vol_prior)) / float(vol_prior) * 100.0
    return out


def _leaderboard_performance(metric: str) -> Callable[[Session], list[Entry]]:
    def handler(db: Session) -> list[Entry]:
        out: list[Entry] = []
        for user in _real_users(db):
            metrics = _performance_user_metrics(db, user.id)
            v = metrics.get(metric, 0.0)
            if v <= 0:
                continue
            out.append(Entry(user_id=user.id, username=user.username, value=v, achieved_at=None))
        out.sort(key=lambda e: -e.value)
        return out
    return handler


_HANDLERS["performance_1rm_increase_30d"] = _leaderboard_performance("performance_1rm_increase_30d")
_HANDLERS["performance_volume_increase_30d"] = _leaderboard_performance("performance_volume_increase_30d")
_HANDLERS["performance_most_improved_pct"] = _leaderboard_performance("performance_most_improved_pct")
