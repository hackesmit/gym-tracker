"""Consolidated dashboard endpoint."""

from collections import defaultdict
from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import (
    Achievement,
    FeedEvent,
    MedalCurrentHolder,
    Medal,
    MuscleScore,
    Program,
    ProgramExercise,
    SessionLog,
    User,
    WorkoutLog,
)

router = APIRouter(prefix="/api", tags=["dashboard"])


@router.get("/dashboard")
def get_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    uid = current_user.id
    today = date.today()
    cutoff_12w = today - timedelta(weeks=12)
    week_start = today - timedelta(days=today.weekday())

    # Today's quest: next uncompleted session in active program
    today_quest = None
    active = (
        db.query(Program)
        .filter(Program.user_id == uid, Program.status == "active")
        .order_by(Program.created_at.desc())
        .first()
    )
    if active:
        logs_map = {
            (sl.week, sl.session_name): sl
            for sl in db.query(SessionLog).filter(SessionLog.program_id == active.id).all()
        }
        # Find first session missing a completed/skipped log
        sessions = (
            db.query(
                ProgramExercise.week,
                ProgramExercise.session_name,
                ProgramExercise.session_order_in_week,
            )
            .filter(ProgramExercise.program_id == active.id)
            .distinct()
            .order_by(
                ProgramExercise.week,
                ProgramExercise.session_order_in_week,
            )
            .all()
        )
        for week, name, _ in sessions:
            key = (week, name)
            log = logs_map.get(key)
            if not log or log.status not in ("completed", "skipped"):
                today_quest = {
                    "program_id": active.id,
                    "program_name": active.name,
                    "week": week,
                    "session_name": name,
                }
                break

    # Week stats
    week_sessions = (
        db.query(func.count(SessionLog.id))
        .filter(
            SessionLog.user_id == uid,
            SessionLog.date >= week_start,
            SessionLog.status == "completed",
        )
        .scalar()
    ) or 0
    week_volume = (
        db.query(func.coalesce(func.sum(WorkoutLog.load_kg * WorkoutLog.reps_completed), 0.0))
        .filter(WorkoutLog.user_id == uid, WorkoutLog.date >= week_start)
        .scalar()
    ) or 0.0

    # Streak: consecutive days with any completed session (simple version)
    recent_dates = (
        db.query(SessionLog.date)
        .filter(
            SessionLog.user_id == uid,
            SessionLog.status == "completed",
            SessionLog.date >= cutoff_12w,
        )
        .distinct()
        .all()
    )
    dates_set = {d for (d,) in recent_dates}
    streak_days = 0
    cursor = today
    while cursor in dates_set:
        streak_days += 1
        cursor = cursor - timedelta(days=1)

    # Recent PRs: last 5 e1rm PR achievements
    prs = (
        db.query(Achievement)
        .filter(Achievement.user_id == uid, Achievement.type == "e1rm_pr")
        .order_by(Achievement.achieved_at.desc())
        .limit(5)
        .all()
    )
    recent_prs = [
        {
            "exercise": a.exercise_name,
            "e1rm": a.value,
            "previous": a.previous_value,
            "at": a.achieved_at.isoformat() if a.achieved_at else None,
        }
        for a in prs
    ]

    # Medal summary
    owned = (
        db.query(MedalCurrentHolder, Medal)
        .join(Medal, Medal.id == MedalCurrentHolder.medal_id)
        .filter(MedalCurrentHolder.user_id == uid)
        .all()
    )
    medal_summary = {
        "owned_count": len(owned),
        "top_medals": [
            {"name": m.name, "value": h.value, "unit": m.unit}
            for (h, m) in owned[:5]
        ],
    }

    # Muscle ranks — recompute first so engine-revision staleness never
    # leaks through (see ranks.py for the same guard).
    try:
        from ..rank_engine import recompute_for_user
        recompute_for_user(db, uid)
    except Exception:
        pass
    ranks = db.query(MuscleScore).filter(MuscleScore.user_id == uid).all()
    muscle_ranks = [
        {"group": r.muscle_group, "rank": r.rank, "score": round(r.score, 1)}
        for r in ranks
    ]

    # Feed
    friend_ids = []
    try:
        from .friends import get_friend_ids
        friend_ids = get_friend_ids(db, uid)
    except Exception:
        pass
    feed_ids = [uid] + friend_ids
    feed_rows = (
        db.query(FeedEvent)
        .filter(FeedEvent.user_id.in_(feed_ids))
        .order_by(FeedEvent.created_at.desc())
        .limit(10)
        .all()
    )
    feed = [
        {
            "id": e.id,
            "user_id": e.user_id,
            "event_type": e.event_type,
            "payload": e.payload_json,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in feed_rows
    ]

    return {
        "today_quest": today_quest,
        "week_stats": {
            "sessions": int(week_sessions),
            "volume_kg": round(float(week_volume), 1),
            "streak_days": streak_days,
        },
        "recent_prs": recent_prs,
        "medal_summary": medal_summary,
        "muscle_ranks": muscle_ranks,
        "feed": feed,
    }
