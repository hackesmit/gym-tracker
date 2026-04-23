"""Muscle rank endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import MuscleScore, User
from ..muscle_rank_config import (
    EXERCISE_MAP,
    MUSCLE_RANK_THRESHOLDS,
    RANK_ORDER,
    SUBDIVISION_COUNT,
    continuous_score,
    rank_score,
    subdivided_rank,
    subdivision_label,
)
from ..rank_engine import MVP_GROUPS, aggregate_elo, recompute_for_user
from .friends import get_friend_ids

router = APIRouter(prefix="/api/ranks", tags=["ranks"])


_GROUP_LABELS = {
    "chest": "Chest",
    "back": "Back",
    "shoulders": "Shoulders",
    "quads": "Quads",
    "hamstrings": "Hamstrings",
    "arms": "Arms",
}

_METRIC_HUMAN = {
    "bench_press_1rm_over_bodyweight":       "Barbell bench 1RM ÷ bodyweight",
    "back_squat_1rm_over_bodyweight":        "Back squat 1RM ÷ bodyweight",
    "deadlift_1rm_over_bodyweight":          "Deadlift 1RM ÷ bodyweight",
    "overhead_press_1rm_over_bodyweight":    "Strict press 1RM ÷ bodyweight",
    "weighted_pullup_added_over_bodyweight": "Weighted pull-up added load ÷ bodyweight",
    "weighted_dip_added_over_bodyweight":    "Weighted dip added load ÷ bodyweight",
}


@router.get("/standards")
def standards(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the full rank-standards reference for the profile page."""
    groups = []
    for key in MVP_GROUPS:
        cfg = MUSCLE_RANK_THRESHOLDS.get(key, {})
        metric_key = cfg.get("metric") or ""
        groups.append({
            "key": key,
            "label": _GROUP_LABELS.get(key, key.title()),
            "metric": _METRIC_HUMAN.get(metric_key, metric_key),
            "qualifying_exercises": sorted(EXERCISE_MAP.get(key, {}).keys()),
            "thresholds": cfg.get("thresholds", {}),
        })
    return {
        "tiers": list(RANK_ORDER),
        "subdivisions_per_tier": SUBDIVISION_COUNT,
        "groups": groups,
    }


def _serialize(user_id: int, db: Session) -> list[dict]:
    """Serialize persisted MuscleScore rows into the ranks API shape."""
    rows = db.query(MuscleScore).filter(MuscleScore.user_id == user_id).all()
    out = []
    for r in rows:
        cfg = MUSCLE_RANK_THRESHOLDS.get(r.muscle_group, {})
        thresholds = cfg.get("thresholds", {}) or {}
        sub_idx = r.sub_index or 0
        # Derive elo on the fly if the row was written before the column
        # existed or the background recompute hasn't run yet.
        elo = r.elo if r.elo is not None else continuous_score(r.score_i, thresholds)
        # If the persisted (rank, sub_index) disagree with what the ratio
        # implies — because ranks are recomputed lazily on write — prefer
        # the persisted pair. Consumers see a consistent snapshot.
        out.append({
            "muscle_group": r.muscle_group,
            "score": round(r.score, 2),
            "rank": r.rank,
            "sub_index": sub_idx,
            "sub_label": subdivision_label(sub_idx),
            "rank_index": rank_score(r.rank, sub_idx),
            "elo": round(float(elo), 1),
            "ratio": round(r.score_i, 3),
            "metric": cfg.get("metric"),
            "thresholds": thresholds,
        })
    return out


def _compact_for_aggregate(rows: list[dict]) -> dict[str, dict]:
    return {r["muscle_group"]: r for r in rows}


@router.get("")
def my_ranks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Always recompute on read: stored rows can be stale across engine
    # revisions (e.g. the 2026-04-21 threshold rewrite left pre-existing
    # percentile-era rows frozen at Champion). The engine is cheap.
    recompute_for_user(db, current_user.id)
    rows = _serialize(current_user.id, db)
    return {
        "groups": rows,
        "elo": aggregate_elo(_compact_for_aggregate(rows)),
    }


@router.post("/recompute")
def recompute(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = recompute_for_user(db, current_user.id)
    return {"updated": True, "groups": result, "elo": aggregate_elo(result)}


@router.get("/compare/{user_id}")
def compare(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if user_id != current_user.id and user_id not in get_friend_ids(db, current_user.id):
        raise HTTPException(status_code=403, detail="Not friends")
    me_rows = _serialize(current_user.id, db)
    them_rows = _serialize(user_id, db)
    return {
        "me": me_rows,
        "them": them_rows,
        "me_elo": aggregate_elo(_compact_for_aggregate(me_rows)),
        "them_elo": aggregate_elo(_compact_for_aggregate(them_rows)),
    }
