"""Social feed + leaderboards."""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..medal_engine import ICON_KEY_BY_METRIC
from ..models import Achievement, CardioLog, FeedEvent, Medal, MedalCurrentHolder, MuscleScore, SessionLog, User, WorkoutLog
from ..rank_engine import aggregate_elo
from .friends import get_friend_ids, _aggregate


def _build_profile(db: Session, user: User) -> dict:
    # Reuse the canonical rank serializer so the Compare view sees the
    # same shape as /api/ranks — including sub_index, sub_label, elo. The
    # old shape (`{group, rank, score}` only) silently defaulted every
    # sub-tier label to "V" on the frontend.
    from .ranks import _serialize as _serialize_ranks, _compact_for_aggregate
    agg = _aggregate(db, user.id)
    ranks = _serialize_ranks(user.id, db)
    compact = _compact_for_aggregate(ranks)
    elo = aggregate_elo(compact)
    medals_owned = (
        db.query(func.count(MedalCurrentHolder.medal_id))
        .filter(MedalCurrentHolder.user_id == user.id)
        .scalar()
    ) or 0
    # Held medals as full list (mirrors /api/medals/my shape)
    held = (
        db.query(MedalCurrentHolder, Medal)
        .join(Medal, Medal.id == MedalCurrentHolder.medal_id)
        .filter(MedalCurrentHolder.user_id == user.id)
        .all()
    )
    medals_list = [
        {
            "medal_id": m.id,
            "name": m.name,
            "metric_type": m.metric_type,
            "icon": ICON_KEY_BY_METRIC.get(m.metric_type),
            "category": m.category,
            "value": h.value,
            "unit": m.unit,
            "updated_at": h.updated_at.isoformat() if h.updated_at else None,
        }
        for (h, m) in held
    ]
    # Recent PRs: last 5 e1rm_pr achievements
    prs = (
        db.query(Achievement)
        .filter(Achievement.user_id == user.id, Achievement.type == "e1rm_pr")
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
    return {
        "user_id": user.id,
        "username": user.username,
        "name": user.name,
        "volume_30d": agg["volume_kg_30d"],
        "sessions_30d": agg["sessions_30d"],
        "cardio_km_30d": agg["cardio_km_30d"],
        "medals_owned": int(medals_owned),
        "muscle_ranks": ranks,
        "elo": elo,
        "elo_total": int(elo.get("total") or 0),  # back-compat
        "medals": medals_list,
        "recent_prs": recent_prs,
    }

router = APIRouter(prefix="/api/social", tags=["social"])


@router.get("/feed")
def feed(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ids = [current_user.id] + get_friend_ids(db, current_user.id)
    events = (
        db.query(FeedEvent)
        .filter(FeedEvent.user_id.in_(ids))
        .order_by(FeedEvent.created_at.desc())
        .limit(50)
        .all()
    )
    user_map = {u.id: u for u in db.query(User).filter(User.id.in_(ids)).all()}
    return [
        {
            "id": e.id,
            "user_id": e.user_id,
            "username": user_map.get(e.user_id).username if user_map.get(e.user_id) else None,
            "event_type": e.event_type,
            "payload": e.payload_json,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in events
    ]


@router.get("/leaderboard")
def leaderboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ids = [current_user.id] + get_friend_ids(db, current_user.id)
    users = db.query(User).filter(User.id.in_(ids)).all()
    # Medal counts
    holdings = (
        db.query(MedalCurrentHolder.user_id, func.count(MedalCurrentHolder.medal_id))
        .filter(MedalCurrentHolder.user_id.in_(ids))
        .group_by(MedalCurrentHolder.user_id)
        .all()
    )
    medal_count = {uid: int(cnt) for uid, cnt in holdings}
    rows = []
    for u in users:
        agg = _aggregate(db, u.id)
        agg["user_id"] = u.id
        agg["username"] = u.username
        agg["medals_owned"] = medal_count.get(u.id, 0)
        rows.append(agg)
    return rows


@router.get("/compare/{user_id}")
def compare(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if user_id != current_user.id and user_id not in get_friend_ids(db, current_user.id):
        raise HTTPException(status_code=403, detail="Not friends")
    other = db.get(User, user_id)
    if not other:
        raise HTTPException(status_code=404, detail="User not found")
    me_profile = _build_profile(db, current_user)
    them_profile = _build_profile(db, other)
    return {
        "me": me_profile,
        "them": them_profile,
        "friend": them_profile,
    }
