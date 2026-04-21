"""Muscle rank endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import MuscleScore, User
from ..muscle_rank_config import MUSCLE_RANK_THRESHOLDS
from ..rank_engine import MVP_GROUPS, recompute_for_user
from .friends import get_friend_ids

router = APIRouter(prefix="/api/ranks", tags=["ranks"])


def _serialize(user_id: int, db: Session) -> list[dict]:
    rows = db.query(MuscleScore).filter(MuscleScore.user_id == user_id).all()
    out = []
    for r in rows:
        cfg = MUSCLE_RANK_THRESHOLDS.get(r.muscle_group, {})
        out.append({
            "muscle_group": r.muscle_group,
            "score": round(r.score, 2),
            "rank": r.rank,
            "ratio": round(r.score_i, 3),
            "metric": cfg.get("metric"),
            "thresholds": cfg.get("thresholds"),
        })
    return out


@router.get("")
def my_ranks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = _serialize(current_user.id, db)
    if not rows:
        # Initial compute
        recompute_for_user(db, current_user.id)
        rows = _serialize(current_user.id, db)
    return {"groups": rows}


@router.post("/recompute")
def recompute(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = recompute_for_user(db, current_user.id)
    return {"updated": True, "groups": result}


@router.get("/compare/{user_id}")
def compare(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if user_id != current_user.id and user_id not in get_friend_ids(db, current_user.id):
        raise HTTPException(status_code=403, detail="Not friends")
    return {
        "me": _serialize(current_user.id, db),
        "them": _serialize(user_id, db),
    }
