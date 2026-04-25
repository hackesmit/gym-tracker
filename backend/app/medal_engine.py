"""Medal engine: king-of-the-hill medal checks.

Each medal has at most one current holder. Whoever posts the best value
for a metric takes the medal; when someone beats it, the holder flips
and a system chat message + feed event announces the transfer.

Entry points, called from the API layer:
- `check_strength_medals(db, log)`              — after a WorkoutLog insert
- `check_cardio_medals(db, log)`                — after a CardioLog insert
- `check_consistency_medals(db, session_log)`   — after a SessionLog insert
- `check_performance_medals(db, user_id)`       — after either of the above

The "Performance" category medals (biggest 1RM increase 30d, biggest
volume increase 30d, most improved lift) aren't single-log events —
they're recomputed deltas per user. The simple rule the app uses is:
whoever currently has the highest value wins. We recompute that value
for the acting user on every log insert and route it through
`_update_holder`, keeping the king-of-the-hill semantics intact.
"""

from datetime import date, datetime, timedelta
from typing import Iterable

from sqlalchemy import func
from sqlalchemy.orm import Session

from .models import (
    BodyMetric,
    CardioLog,
    ChatMessage,
    FeedEvent,
    Medal,
    MedalCurrentHolder,
    MedalRecord,
    ProgramExercise,
    SessionLog,
    User,
    WorkoutLog,
)

# ---------------------------------------------------------------------------
# Catalog
# ---------------------------------------------------------------------------
# Every medal MUST specify a category so the UI can color-code and filter.
# metric_type must be unique — the engine routes checks by it.
# higher_is_better defaults True; set False for time-based metrics.
# ---------------------------------------------------------------------------

MEDAL_CATALOG = [
    # Strength
    {"name": "Strongest Bench 1RM",     "metric_type": "strength_1rm:bench",              "unit": "kg",  "category": "strength"},
    {"name": "Strongest Squat 1RM",     "metric_type": "strength_1rm:squat",              "unit": "kg",  "category": "strength"},
    {"name": "Strongest Deadlift 1RM",  "metric_type": "strength_1rm:deadlift",           "unit": "kg",  "category": "strength"},
    {"name": "Strongest OHP 1RM",       "metric_type": "strength_1rm:ohp",                "unit": "kg",  "category": "strength"},
    {"name": "Powerlifting Total",      "metric_type": "strength_pl_total",               "unit": "kg",  "category": "strength"},
    {"name": "Best Relative Strength",  "metric_type": "strength_relative",               "unit": "xBW", "category": "strength"},
    # Endurance
    {"name": "Fastest Mile",            "metric_type": "cardio_fastest_mile",             "unit": "min/km", "category": "endurance", "higher_is_better": False},
    {"name": "Fastest 5K",              "metric_type": "cardio_fastest_5k",               "unit": "min",    "category": "endurance", "higher_is_better": False},
    {"name": "Fastest 10K",             "metric_type": "cardio_fastest_10k",              "unit": "min",    "category": "endurance", "higher_is_better": False},
    {"name": "Longest Run",             "metric_type": "cardio_longest:run",              "unit": "km",  "category": "endurance"},
    {"name": "Longest Ride",            "metric_type": "cardio_longest:bike",             "unit": "km",  "category": "endurance"},
    {"name": "Longest Swim",            "metric_type": "cardio_longest:swim",             "unit": "km",  "category": "endurance"},
    # Consistency
    {"name": "Longest Streak",          "metric_type": "consistency_longest_streak",      "unit": "days",      "category": "consistency"},
    {"name": "Most Sessions 30d",       "metric_type": "consistency_sessions_30d",        "unit": "sessions",  "category": "consistency"},
    {"name": "Most Sessions All-Time",  "metric_type": "consistency_sessions_all",        "unit": "sessions",  "category": "consistency"},
    {"name": "Highest Volume 30d",      "metric_type": "consistency_volume_30d",          "unit": "kg",        "category": "consistency"},
    {"name": "Perfect Week",            "metric_type": "consistency_perfect_weeks",       "unit": "weeks",     "category": "consistency"},
    # Performance
    {"name": "Biggest 1RM Increase 30d",    "metric_type": "performance_1rm_increase_30d",    "unit": "kg", "category": "performance"},
    {"name": "Biggest Volume Increase 30d", "metric_type": "performance_volume_increase_30d", "unit": "%",  "category": "performance"},
    {"name": "Most Improved Lift",          "metric_type": "performance_most_improved_pct",   "unit": "%",  "category": "performance"},
]


# metric_type → UI-friendly icon key that maps to the client-side glyph
# set. Kept here so a future DB migration can stamp the value onto the
# medals table if we decide to move icon resolution server-side.
ICON_KEY_BY_METRIC: dict[str, str] = {
    "strength_1rm:bench":              "bench",
    "strength_1rm:squat":              "squat",
    "strength_1rm:deadlift":           "deadlift",
    "strength_1rm:ohp":                "ohp",
    "strength_pl_total":               "total",
    "strength_relative":               "relative",
    "cardio_fastest_mile":             "mile",
    "cardio_fastest_5k":               "fk5",
    "cardio_fastest_10k":              "fk10",
    "cardio_longest:run":              "run",
    "cardio_longest:bike":             "ride",
    "cardio_longest:swim":             "swim",
    "consistency_longest_streak":      "streak",
    "consistency_sessions_30d":        "sess30",
    "consistency_sessions_all":        "sessAll",
    "consistency_volume_30d":          "vol30",
    "consistency_perfect_weeks":       "week",
    "performance_1rm_increase_30d":    "inc1rm",
    "performance_volume_increase_30d": "incVol",
    "performance_most_improved_pct":   "improved",
}


EXERCISE_TO_LIFT_CATEGORY = {
    "bench": ["bench press", "barbell bench", "paused bench", "close-grip bench", "close grip bench"],
    "squat": ["back squat", "barbell back squat", "paused squat", "front squat"],
    "deadlift": ["deadlift", "conventional deadlift", "sumo deadlift", "trap bar deadlift"],
    "ohp": ["overhead press", "strict press", "military press"],
}


def seed_medal_catalog(db: Session):
    """Idempotent seed of the medal catalog.

    Existing rows have their `category` backfilled if they were written
    before the column was added.
    """
    existing = {m.name: m for m in db.query(Medal).all()}
    for m in MEDAL_CATALOG:
        row = existing.get(m["name"])
        if row is None:
            db.add(Medal(
                name=m["name"],
                metric_type=m["metric_type"],
                unit=m["unit"],
                higher_is_better=m.get("higher_is_better", True),
                description=m.get("description"),
                category=m.get("category"),
            ))
        else:
            # Backfill category on pre-existing rows.
            if not row.category and m.get("category"):
                row.category = m["category"]
            if row.unit != m["unit"]:
                row.unit = m["unit"]
    db.commit()


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _classify_exercise(exercise_name: str) -> str | None:
    lower = exercise_name.lower()
    for cat, patterns in EXERCISE_TO_LIFT_CATEGORY.items():
        for p in patterns:
            if p in lower:
                return cat
    return None


def _update_holder(
    db: Session,
    medal: Medal,
    user_id: int,
    value: float,
    source_type: str,
    source_id: int | None,
):
    """If this value beats the current holder, update and emit a feed event."""
    holder = db.get(MedalCurrentHolder, medal.id)
    better = False
    prev_holder_id = None
    prev_value = None
    if holder is None:
        better = True
    else:
        prev_holder_id = holder.user_id
        prev_value = holder.value
        if medal.higher_is_better and value > holder.value:
            better = True
        if (not medal.higher_is_better) and value < holder.value:
            better = True
    if not better:
        return False

    # Write record
    db.add(MedalRecord(
        medal_id=medal.id, user_id=user_id, value=value,
        source_type=source_type, source_id=source_id,
    ))
    if holder is None:
        db.add(MedalCurrentHolder(medal_id=medal.id, user_id=user_id, value=value))
    else:
        holder.user_id = user_id
        holder.value = value
    # Emit feed event for medal_stolen (or medal_earned if no prior holder)
    event_type = "medal_stolen" if prev_holder_id and prev_holder_id != user_id else "medal_earned"
    db.add(FeedEvent(
        user_id=user_id,
        event_type=event_type,
        payload_json={
            "medal_id": medal.id,
            "medal_name": medal.name,
            "value": value,
            "unit": medal.unit,
            "previous_holder_id": prev_holder_id,
            "previous_value": prev_value,
        },
    ))
    # Emit a system chat message so everyone sees it in the global chat
    new_holder = db.get(User, user_id)
    new_name = new_holder.username if new_holder and new_holder.username else (new_holder.name if new_holder else "Someone")
    pretty_value = f"{value:g} {medal.unit}"
    if event_type == "medal_stolen" and prev_holder_id:
        prev_user = db.get(User, prev_holder_id)
        prev_name = (prev_user.username if prev_user and prev_user.username else (prev_user.name if prev_user else "the previous holder"))
        content = f"{new_name} dethroned {prev_name} for {medal.name} — {pretty_value}"
    else:
        content = f"{new_name} claimed {medal.name} — {pretty_value}"
    db.add(ChatMessage(
        user_id=None,
        kind="system",
        content=content,
        payload_json={
            "event": event_type,
            "medal_id": medal.id,
            "medal_name": medal.name,
            "value": value,
            "unit": medal.unit,
            "new_holder_id": user_id,
            "new_holder_name": new_name,
            "previous_holder_id": prev_holder_id,
        },
    ))
    db.commit()
    return True


def _medal_by_metric(db: Session, metric: str) -> Medal | None:
    return db.query(Medal).filter(Medal.metric_type == metric).first()


def _epley(load_kg: float, reps: int) -> float:
    if not load_kg or reps <= 0:
        return 0.0
    if reps == 1:
        return float(load_kg)
    return float(load_kg) * (1.0 + reps / 30.0)


def _best_official_1rm(db: Session, user_id: int, category: str) -> float:
    """Best true 1RM for a lift category from WorkoutLog (is_true_1rm_attempt + completed + reps=1)."""
    patterns = EXERCISE_TO_LIFT_CATEGORY.get(category) or []
    if not patterns:
        return 0.0
    rows = (
        db.query(ProgramExercise.exercise_name_canonical, WorkoutLog.load_kg)
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
    for name, load in rows:
        if not name:
            continue
        lower = name.lower()
        if any(p in lower for p in patterns):
            if load and load > best:
                best = float(load)
    return best


def _manual_1rm(user: User, key: str) -> float:
    m = user.manual_1rm or {}
    entry = m.get(key)
    if entry is None:
        return 0.0
    if isinstance(entry, (int, float)):
        return float(entry)
    if isinstance(entry, dict):
        try:
            return float(entry.get("value_kg") or 0)
        except (TypeError, ValueError):
            return 0.0
    return 0.0


def _bodyweight(db: Session, user: User) -> float:
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


def _best_estimated_1rm_in_window(
    db: Session, user_id: int, category: str, start: date, end: date
) -> float:
    """Epley e1RM from any WorkoutLog in the given date window — includes non-1RM attempts."""
    patterns = EXERCISE_TO_LIFT_CATEGORY.get(category) or []
    if not patterns:
        return 0.0
    rows = (
        db.query(
            ProgramExercise.exercise_name_canonical,
            WorkoutLog.load_kg,
            WorkoutLog.reps_completed,
        )
        .join(WorkoutLog, WorkoutLog.program_exercise_id == ProgramExercise.id)
        .filter(
            WorkoutLog.user_id == user_id,
            WorkoutLog.date >= start,
            WorkoutLog.date <= end,
            WorkoutLog.load_kg > 0,
            WorkoutLog.reps_completed > 0,
            WorkoutLog.reps_completed <= 10,
        )
        .all()
    )
    best = 0.0
    for name, load, reps in rows:
        if not name:
            continue
        lower = name.lower()
        if not any(p in lower for p in patterns):
            continue
        e1rm = _epley(load, reps)
        if e1rm > best:
            best = e1rm
    return best


# ---------------------------------------------------------------------------
# Strength
# ---------------------------------------------------------------------------

def check_strength_medals(db: Session, log: WorkoutLog):
    if not log.is_true_1rm_attempt or not log.completed_successfully or log.reps_completed != 1:
        return
    pe = db.get(ProgramExercise, log.program_exercise_id)
    if not pe:
        return
    cat = _classify_exercise(pe.exercise_name_canonical)
    if not cat:
        return
    metric = f"strength_1rm:{cat}"
    medal = _medal_by_metric(db, metric)
    if medal:
        _update_holder(db, medal, log.user_id, log.load_kg, "workout_log", log.id)
    # Rolling strength derivatives (PL total, relative strength).
    _recompute_strength_derivatives(db, log.user_id)
    # Performance medals (deltas) also depend on best lifts.
    check_performance_medals(db, log.user_id)


def _recompute_strength_derivatives(db: Session, user_id: int):
    """Recompute Powerlifting Total + Relative Strength for this user and route through _update_holder."""
    user = db.get(User, user_id)
    if not user:
        return
    bench = max(_best_official_1rm(db, user_id, "bench"), _manual_1rm(user, "bench"))
    squat = max(_best_official_1rm(db, user_id, "squat"), _manual_1rm(user, "squat"))
    dl    = max(_best_official_1rm(db, user_id, "deadlift"), _manual_1rm(user, "deadlift"))
    total = bench + squat + dl
    if total > 0:
        medal = _medal_by_metric(db, "strength_pl_total")
        if medal:
            _update_holder(db, medal, user_id, total, "derived", None)
    bw = _bodyweight(db, user)
    if total > 0 and bw > 0:
        ratio = total / bw
        medal = _medal_by_metric(db, "strength_relative")
        if medal:
            _update_holder(db, medal, user_id, ratio, "derived", None)


# ---------------------------------------------------------------------------
# Endurance / cardio
# ---------------------------------------------------------------------------

def check_cardio_medals(db: Session, log: CardioLog):
    if log.modality in ("run", "bike", "swim") and log.distance_km:
        metric = f"cardio_longest:{log.modality}"
        medal = _medal_by_metric(db, metric)
        if medal:
            _update_holder(db, medal, log.user_id, float(log.distance_km), "cardio_log", log.id)
    # Fastest-mile / 5K / 10K all derive from pace on a run >= the distance.
    if log.modality == "run" and log.distance_km and log.duration_minutes:
        duration = float(log.duration_minutes)
        distance = float(log.distance_km)
        # Fastest mile — pace min/km, lowest wins, requires at least 1.6 km.
        if distance >= 1.6:
            pace = duration / distance
            medal = _medal_by_metric(db, "cardio_fastest_mile")
            if medal:
                _update_holder(db, medal, log.user_id, pace, "cardio_log", log.id)
        # 5K time proper — run covers at least 5 km; value = total minutes,
        # scaled to a 5-km equivalent via pace so longer runs with faster
        # pace also count.
        if distance >= 5.0:
            time_5k = (duration / distance) * 5.0
            medal = _medal_by_metric(db, "cardio_fastest_5k")
            if medal:
                _update_holder(db, medal, log.user_id, time_5k, "cardio_log", log.id)
        if distance >= 10.0:
            time_10k = (duration / distance) * 10.0
            medal = _medal_by_metric(db, "cardio_fastest_10k")
            if medal:
                _update_holder(db, medal, log.user_id, time_10k, "cardio_log", log.id)


# ---------------------------------------------------------------------------
# Consistency
# ---------------------------------------------------------------------------

def check_consistency_medals(db: Session, session: SessionLog):
    user_id = session.user_id
    today = date.today()
    cutoff_30d = today - timedelta(days=30)

    # sessions_30d
    sessions_30d = (
        db.query(func.count(SessionLog.id))
        .filter(
            SessionLog.user_id == user_id,
            SessionLog.status == "completed",
            SessionLog.date >= cutoff_30d,
        )
        .scalar()
    ) or 0
    medal = _medal_by_metric(db, "consistency_sessions_30d")
    if medal:
        _update_holder(db, medal, user_id, float(sessions_30d), "session_log", session.id)

    # all-time sessions
    sessions_all = (
        db.query(func.count(SessionLog.id))
        .filter(
            SessionLog.user_id == user_id,
            SessionLog.status == "completed",
        )
        .scalar()
    ) or 0
    medal = _medal_by_metric(db, "consistency_sessions_all")
    if medal:
        _update_holder(db, medal, user_id, float(sessions_all), "session_log", session.id)

    # volume_30d
    volume = (
        db.query(func.coalesce(func.sum(WorkoutLog.load_kg * WorkoutLog.reps_completed), 0.0))
        .filter(WorkoutLog.user_id == user_id, WorkoutLog.date >= cutoff_30d)
        .scalar()
    ) or 0.0
    medal = _medal_by_metric(db, "consistency_volume_30d")
    if medal:
        _update_holder(db, medal, user_id, float(volume), "session_log", session.id)

    # Perfect weeks: count ISO weeks with >=3 completed sessions in the
    # last 6 months (a pragmatic proxy for "hit the plan").
    window_start = today - timedelta(days=180)
    rows = (
        db.query(SessionLog.date)
        .filter(
            SessionLog.user_id == user_id,
            SessionLog.status == "completed",
            SessionLog.date >= window_start,
        )
        .all()
    )
    week_counter: dict[tuple[int, int], int] = {}
    for (d,) in rows:
        iso_year, iso_week, _ = d.isocalendar()
        week_counter[(iso_year, iso_week)] = week_counter.get((iso_year, iso_week), 0) + 1
    perfect_weeks = sum(1 for v in week_counter.values() if v >= 3)
    medal = _medal_by_metric(db, "consistency_perfect_weeks")
    if medal and perfect_weeks > 0:
        _update_holder(db, medal, user_id, float(perfect_weeks), "session_log", session.id)

    # Performance medals also watch session inserts (delta metrics shift
    # when new workouts land).
    check_performance_medals(db, user_id)


def backfill_consistency_medals(db: Session) -> int:
    """Re-evaluate consistency medals for every user with completed sessions.

    Runs on startup. Needed because sessions logged before the medal system
    existed (or before the engine was wired into a user's flow) never fired
    the compare-and-swap, leaving session-count medals understated. The engine
    only ever raises the holder's value, so repeat invocations with the same
    data are no-ops.

    Returns the count of users processed.
    """
    user_ids = [
        row[0]
        for row in (
            db.query(SessionLog.user_id)
            .filter(SessionLog.status == "completed")
            .distinct()
            .all()
        )
    ]
    for user_id in user_ids:
        anchor = (
            db.query(SessionLog)
            .filter(
                SessionLog.user_id == user_id,
                SessionLog.status == "completed",
            )
            .order_by(SessionLog.date.desc(), SessionLog.id.desc())
            .first()
        )
        if anchor is None:
            continue
        try:
            check_consistency_medals(db, anchor)
        except Exception:
            db.rollback()
    return len(user_ids)


# ---------------------------------------------------------------------------
# Performance (rolling 30-day deltas)
# ---------------------------------------------------------------------------

def check_performance_medals(db: Session, user_id: int):
    today = date.today()
    last_start = today - timedelta(days=30)
    prior_start = today - timedelta(days=60)
    prior_end = last_start - timedelta(days=1)

    # Biggest 1RM increase (any lift) in the last 30d vs the prior 30d.
    best_delta_kg = 0.0
    best_delta_category: str | None = None
    for cat in EXERCISE_TO_LIFT_CATEGORY:
        last = _best_estimated_1rm_in_window(db, user_id, cat, last_start, today)
        prior = _best_estimated_1rm_in_window(db, user_id, cat, prior_start, prior_end)
        if last <= 0 or prior <= 0:
            continue
        delta = last - prior
        if delta > best_delta_kg:
            best_delta_kg = delta
            best_delta_category = cat

    if best_delta_kg > 0:
        medal = _medal_by_metric(db, "performance_1rm_increase_30d")
        if medal:
            _update_holder(db, medal, user_id, best_delta_kg, "derived", None)

        # Most Improved Lift — same logic but reported as a % gain.
        last = _best_estimated_1rm_in_window(db, user_id, best_delta_category, last_start, today)
        prior = _best_estimated_1rm_in_window(db, user_id, best_delta_category, prior_start, prior_end)
        if prior > 0:
            pct = (last - prior) / prior * 100.0
            medal = _medal_by_metric(db, "performance_most_improved_pct")
            if medal:
                _update_holder(db, medal, user_id, pct, "derived", None)

    # Biggest volume increase (%) — total tonnage last 30d vs prior 30d.
    vol_last = (
        db.query(func.coalesce(func.sum(WorkoutLog.load_kg * WorkoutLog.reps_completed), 0.0))
        .filter(
            WorkoutLog.user_id == user_id,
            WorkoutLog.date >= last_start,
            WorkoutLog.date <= today,
        )
        .scalar()
    ) or 0.0
    vol_prior = (
        db.query(func.coalesce(func.sum(WorkoutLog.load_kg * WorkoutLog.reps_completed), 0.0))
        .filter(
            WorkoutLog.user_id == user_id,
            WorkoutLog.date >= prior_start,
            WorkoutLog.date <= prior_end,
        )
        .scalar()
    ) or 0.0
    if vol_prior > 0 and vol_last > vol_prior:
        pct = (float(vol_last) - float(vol_prior)) / float(vol_prior) * 100.0
        medal = _medal_by_metric(db, "performance_volume_increase_30d")
        if medal:
            _update_holder(db, medal, user_id, pct, "derived", None)
