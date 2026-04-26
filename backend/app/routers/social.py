"""Social feed + leaderboards."""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import CardioLog, FeedEvent, MedalCurrentHolder, MuscleScore, SessionLog, User, WorkoutLog
from .friends import get_friend_ids, _aggregate


def _build_profile(db: Session, user: User) -> dict:
    # Reuse the canonical rank serializer so the Compare view sees the
    # same shape as /api/ranks — including sub_index, sub_label, elo. The
    # old shape (`{group, rank, score}` only) silently defaulted every
    # sub-tier label to "V" on the frontend.
    from .ranks import _serialize as _serialize_ranks
    agg = _aggregate(db, user.id)
    ranks = _serialize_ranks(user.id, db)
    medals_owned = (
        db.query(func.count(MedalCurrentHolder.medal_id))
        .filter(MedalCurrentHolder.user_id == user.id)
        .scalar()
    ) or 0
    return {
        "user_id": user.id,
        "username": user.username,
        "name": user.name,
        "volume_30d": agg["volume_kg_30d"],
        "sessions_30d": agg["sessions_30d"],
        "cardio_km_30d": agg["cardio_km_30d"],
        "medals_owned": int(medals_owned),
        "muscle_ranks": ranks,
        "elo_total": sum(int(r.get("elo") or 0) for r in ranks),
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
