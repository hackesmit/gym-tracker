"""Medals API."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import Medal, MedalCurrentHolder, User

router = APIRouter(prefix="/api/medals", tags=["medals"])


@router.get("")
def list_medals(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    medals = db.query(Medal).all()
    holders = {h.medal_id: h for h in db.query(MedalCurrentHolder).all()}
    user_map = {u.id: u for u in db.query(User).all()}
    out = []
    for m in medals:
        h = holders.get(m.id)
        holder_user = user_map.get(h.user_id) if h else None
        out.append({
            "id": m.id,
            "name": m.name,
            "metric_type": m.metric_type,
            "unit": m.unit,
            "higher_is_better": m.higher_is_better,
            "holder": None if not h else {
                "user_id": h.user_id,
                "username": holder_user.username if holder_user else None,
                "value": h.value,
                "updated_at": h.updated_at.isoformat() if h.updated_at else None,
            },
        })
    return out


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
            "value": h.value,
            "unit": m.unit,
            "updated_at": h.updated_at.isoformat() if h.updated_at else None,
        }
        for (h, m) in held
    ]
