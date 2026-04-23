"""Medals API."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..medal_engine import ICON_KEY_BY_METRIC
from ..models import Medal, MedalCurrentHolder, User

router = APIRouter(prefix="/api/medals", tags=["medals"])


def _held_days(updated_at) -> int | None:
    if not updated_at:
        return None
    try:
        ref = updated_at if updated_at.tzinfo else updated_at.replace(tzinfo=timezone.utc)
        return max(0, (datetime.now(timezone.utc) - ref).days)
    except Exception:
        return None


def _serialize_medal(m: Medal, holder: MedalCurrentHolder | None, user: User | None) -> dict:
    return {
        "id": m.id,
        "name": m.name,
        "metric_type": m.metric_type,
        "icon": ICON_KEY_BY_METRIC.get(m.metric_type),
        "category": m.category,
        "unit": m.unit,
        "higher_is_better": m.higher_is_better,
        "holder": None if not holder else {
            "user_id": holder.user_id,
            "username": user.username if user else None,
            "value": holder.value,
            "updated_at": holder.updated_at.isoformat() if holder.updated_at else None,
            "held_days": _held_days(holder.updated_at),
        },
    }


@router.get("")
def list_medals(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    medals = db.query(Medal).all()
    holders = {h.medal_id: h for h in db.query(MedalCurrentHolder).all()}
    user_map = {u.id: u for u in db.query(User).all()}
    return [
        _serialize_medal(m, holders.get(m.id), user_map.get(holders[m.id].user_id) if holders.get(m.id) else None)
        for m in medals
    ]


@router.get("/my")
def my_medals(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    held = (
        db.query(MedalCurrentHolder, Medal)
        .join(Medal, Medal.id == MedalCurrentHolder.medal_id)
        .filter(MedalCurrentHolder.user_id == current_user.id)
        .all()
    )
    return [
        {
            "medal_id": m.id,
            "name": m.name,
            "metric_type": m.metric_type,
            "icon": ICON_KEY_BY_METRIC.get(m.metric_type),
            "category": m.category,
            "value": h.value,
            "unit": m.unit,
            "updated_at": h.updated_at.isoformat() if h.updated_at else None,
            "held_days": _held_days(h.updated_at),
        }
        for (h, m) in held
    ]
