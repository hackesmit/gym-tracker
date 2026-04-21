"""Friend system: request/accept/decline/remove/list."""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, or_, and_
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import CardioLog, Friendship, SessionLog, User, WorkoutLog

router = APIRouter(prefix="/api/friends", tags=["friends"])


class FriendRequest(BaseModel):
    username_or_id: str


def get_friend_ids(db: Session, user_id: int) -> list[int]:
    rows = (
        db.query(Friendship)
        .filter(
            Friendship.status == "accepted",
            or_(Friendship.requester_id == user_id, Friendship.addressee_id == user_id),
        )
        .all()
    )
    ids = []
    for f in rows:
        ids.append(f.addressee_id if f.requester_id == user_id else f.requester_id)
    return ids


def _aggregate(db: Session, user_id: int) -> dict:
    today = date.today()
    cutoff_30d = today - timedelta(days=30)
    volume_30d = (
        db.query(func.coalesce(func.sum(WorkoutLog.load_kg * WorkoutLog.reps_completed), 0.0))
        .filter(WorkoutLog.user_id == user_id, WorkoutLog.date >= cutoff_30d)
        .scalar()
    ) or 0.0
    sessions_30d = (
        db.query(func.count(SessionLog.id))
        .filter(
            SessionLog.user_id == user_id,
            SessionLog.date >= cutoff_30d,
            SessionLog.status == "completed",
        )
        .scalar()
    ) or 0
    cardio_km_30d = (
        db.query(func.coalesce(func.sum(CardioLog.distance_km), 0.0))
        .filter(CardioLog.user_id == user_id, CardioLog.date >= cutoff_30d)
        .scalar()
    ) or 0.0
    return {
        "volume_kg_30d": round(float(volume_30d), 1),
        "sessions_30d": int(sessions_30d),
        "cardio_km_30d": round(float(cardio_km_30d), 2),
    }


@router.post("/request", status_code=201)
def send_request(
    body: FriendRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    target = None
    if body.username_or_id.isdigit():
        target = db.get(User, int(body.username_or_id))
    if not target:
        target = db.query(User).filter(User.username == body.username_or_id).first()
    if not target or (target.username or "").lower() == "preset":
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot friend yourself")

    # Check for existing friendship in either direction
    existing = (
        db.query(Friendship)
        .filter(
            or_(
                and_(Friendship.requester_id == current_user.id, Friendship.addressee_id == target.id),
                and_(Friendship.requester_id == target.id, Friendship.addressee_id == current_user.id),
            )
        )
        .first()
    )
    if existing:
        if existing.status == "accepted":
            raise HTTPException(status_code=409, detail="Already friends")
        if existing.status == "pending":
            raise HTTPException(status_code=409, detail="Request already pending")
        # declined: allow re-request by flipping to pending
        existing.status = "pending"
        existing.requester_id = current_user.id
        existing.addressee_id = target.id
        db.commit()
        return {"id": existing.id, "status": existing.status}

    fs = Friendship(requester_id=current_user.id, addressee_id=target.id, status="pending")
    db.add(fs)
    db.commit()
    db.refresh(fs)
    return {"id": fs.id, "status": fs.status}


@router.post("/accept/{friendship_id}")
def accept(
    friendship_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fs = db.get(Friendship, friendship_id)
    if not fs or fs.addressee_id != current_user.id:
        raise HTTPException(status_code=404, detail="Request not found")
    if fs.status != "pending":
        raise HTTPException(status_code=400, detail="Not pending")
    fs.status = "accepted"
    db.commit()
    return {"id": fs.id, "status": fs.status}


@router.post("/decline/{friendship_id}")
def decline(
    friendship_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fs = db.get(Friendship, friendship_id)
    if not fs or fs.addressee_id != current_user.id:
        raise HTTPException(status_code=404, detail="Request not found")
    fs.status = "declined"
    db.commit()
    return {"id": fs.id, "status": fs.status}


@router.delete("/{id_value}")
def remove(
    id_value: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Accept either friendship_id or the other user's id (whichever matches first)
    fs = db.get(Friendship, id_value)
    if not fs or (fs.requester_id != current_user.id and fs.addressee_id != current_user.id):
        fs = (
            db.query(Friendship)
            .filter(
                or_(
                    and_(Friendship.requester_id == current_user.id, Friendship.addressee_id == id_value),
                    and_(Friendship.requester_id == id_value, Friendship.addressee_id == current_user.id),
                )
            )
            .first()
        )
    if not fs:
        raise HTTPException(status_code=404, detail="Friendship not found")
    db.delete(fs)
    db.commit()
    return {"deleted": True}


@router.get("")
def list_friends(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    friend_ids = get_friend_ids(db, current_user.id)
    friends = db.query(User).filter(User.id.in_(friend_ids)).all() if friend_ids else []
    # Pending incoming/outgoing
    incoming = (
        db.query(Friendship)
        .filter(Friendship.addressee_id == current_user.id, Friendship.status == "pending")
        .all()
    )
    outgoing = (
        db.query(Friendship)
        .filter(Friendship.requester_id == current_user.id, Friendship.status == "pending")
        .all()
    )

    return {
        "friends": [
            {
                "id": f.id,
                "username": f.username,
                "name": f.name,
                "aggregates": _aggregate(db, f.id),
            }
            for f in friends
        ],
        "incoming": [
            {"friendship_id": r.id, "from_user_id": r.requester_id}
            for r in incoming
        ],
        "outgoing": [
            {"friendship_id": r.id, "to_user_id": r.addressee_id}
            for r in outgoing
        ],
    }
