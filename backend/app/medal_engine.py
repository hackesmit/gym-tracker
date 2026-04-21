"""Medal engine: king-of-the-hill medal checks.

Call check_strength_medals on WorkoutLog insert/update,
check_cardio_medals on CardioLog, check_consistency_medals on SessionLog.
"""

from datetime import date, datetime, timedelta
from typing import Iterable

from sqlalchemy import func
from sqlalchemy.orm import Session

from .models import (
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

# Catalog of medals seeded on startup.
# metric_type values used by the engine to route checks.
MEDAL_CATALOG = [
    # Strength (require is_true_1rm_attempt + completed + reps==1)
    {"name": "Strongest Bench 1RM", "metric_type": "strength_1rm:bench", "unit": "kg"},
    {"name": "Strongest Squat 1RM", "metric_type": "strength_1rm:squat", "unit": "kg"},
    {"name": "Strongest Deadlift 1RM", "metric_type": "strength_1rm:deadlift", "unit": "kg"},
    {"name": "Strongest OHP 1RM", "metric_type": "strength_1rm:ohp", "unit": "kg"},
    # Cardio
    {"name": "Longest Run", "metric_type": "cardio_longest:run", "unit": "km"},
    {"name": "Longest Ride", "metric_type": "cardio_longest:bike", "unit": "km"},
    {"name": "Longest Swim", "metric_type": "cardio_longest:swim", "unit": "km"},
    {"name": "Fastest Mile", "metric_type": "cardio_fastest_mile", "unit": "min/km", "higher_is_better": False},
    # Consistency
    {"name": "Longest Streak", "metric_type": "consistency_longest_streak", "unit": "weeks"},
    {"name": "Most Sessions 30d", "metric_type": "consistency_sessions_30d", "unit": "sessions"},
    {"name": "Highest Volume 30d", "metric_type": "consistency_volume_30d", "unit": "kg"},
]


EXERCISE_TO_LIFT_CATEGORY = {
    "bench": ["bench press", "barbell bench", "paused bench", "close-grip bench", "close grip bench"],
    "squat": ["back squat", "barbell back squat", "paused squat", "front squat"],
    "deadlift": ["deadlift", "conventional deadlift", "sumo deadlift", "trap bar deadlift"],
    "ohp": ["overhead press", "strict press", "military press"],
}


def seed_medal_catalog(db: Session):
    """Idempotent seed of medal catalog."""
    existing = {m.name for m in db.query(Medal).all()}
    for m in MEDAL_CATALOG:
        if m["name"] in existing:
            continue
        db.add(Medal(
            name=m["name"],
            metric_type=m["metric_type"],
            unit=m["unit"],
            higher_is_better=m.get("higher_is_better", True),
            description=m.get("description"),
        ))
    db.commit()


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
    medal = db.query(Medal).filter(Medal.metric_type == metric).first()
    if not medal:
        return
    _update_holder(db, medal, log.user_id, log.load_kg, "workout_log", log.id)


def check_cardio_medals(db: Session, log: CardioLog):
    if log.modality in ("run", "bike", "swim") and log.distance_km:
        metric = f"cardio_longest:{log.modality}"
        medal = db.query(Medal).filter(Medal.metric_type == metric).first()
        if medal:
            _update_holder(db, medal, log.user_id, float(log.distance_km), "cardio_log", log.id)
    # Fastest mile from run
    if log.modality == "run" and log.distance_km and log.distance_km >= 1.6 and log.duration_minutes:
        pace = log.duration_minutes / log.distance_km
        medal = db.query(Medal).filter(Medal.metric_type == "cardio_fastest_mile").first()
        if medal:
            _update_holder(db, medal, log.user_id, pace, "cardio_log", log.id)


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
    medal = db.query(Medal).filter(Medal.metric_type == "consistency_sessions_30d").first()
    if medal:
        _update_holder(db, medal, user_id, float(sessions_30d), "session_log", session.id)

    # volume_30d
    volume = (
        db.query(func.coalesce(func.sum(WorkoutLog.load_kg * WorkoutLog.reps_completed), 0.0))
        .filter(WorkoutLog.user_id == user_id, WorkoutLog.date >= cutoff_30d)
        .scalar()
    ) or 0.0
    medal = db.query(Medal).filter(Medal.metric_type == "consistency_volume_30d").first()
    if medal:
        _update_holder(db, medal, user_id, float(volume), "session_log", session.id)
