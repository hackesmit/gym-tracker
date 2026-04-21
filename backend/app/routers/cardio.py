"""Cardio logging endpoints."""

from collections import defaultdict
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import CardioLog, User

router = APIRouter(prefix="/api/cardio", tags=["cardio"])

VALID_MODALITIES = {"run", "bike", "swim", "row", "walk", "other"}


class CardioCreate(BaseModel):
    date: date
    modality: str
    duration_minutes: float = Field(..., gt=0)
    distance_km: Optional[float] = Field(None, ge=0)
    elevation_m: Optional[float] = None
    avg_hr: Optional[int] = Field(None, ge=20, le=250)
    calories: Optional[int] = Field(None, ge=0)
    rpe: Optional[float] = Field(None, ge=1, le=10)
    notes: Optional[str] = None


class CardioUpdate(BaseModel):
    date: Optional[date] = None
    modality: Optional[str] = None
    duration_minutes: Optional[float] = Field(None, gt=0)
    distance_km: Optional[float] = Field(None, ge=0)
    elevation_m: Optional[float] = None
    avg_hr: Optional[int] = Field(None, ge=20, le=250)
    calories: Optional[int] = Field(None, ge=0)
    rpe: Optional[float] = Field(None, ge=1, le=10)
    notes: Optional[str] = None


class CardioOut(BaseModel):
    id: int
    user_id: int
    date: date
    modality: str
    duration_minutes: float
    distance_km: Optional[float] = None
    elevation_m: Optional[float] = None
    avg_hr: Optional[int] = None
    calories: Optional[int] = None
    rpe: Optional[float] = None
    notes: Optional[str] = None

    model_config = {"from_attributes": True}


def _validate(payload_dict: dict):
    modality = payload_dict.get("modality")
    if modality is not None and modality not in VALID_MODALITIES:
        raise HTTPException(
            status_code=400,
            detail=f"modality must be one of {sorted(VALID_MODALITIES)}",
        )
    duration = payload_dict.get("duration_minutes")
    distance = payload_dict.get("distance_km")
    if duration is not None and duration <= 0:
        raise HTTPException(status_code=400, detail="duration_minutes must be > 0")
    if distance is not None and distance < 0:
        raise HTTPException(status_code=400, detail="distance_km must be >= 0")
    # Impossible pace check for runs — reject pace < 2 min/km
    if modality == "run" and distance and duration:
        pace = duration / distance
        if pace < 2.0:
            raise HTTPException(
                status_code=400,
                detail="Impossible running pace (<2 min/km).",
            )


@router.post("/log", response_model=CardioOut, status_code=201)
def create_cardio(
    payload: CardioCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _validate(payload.model_dump())
    log = CardioLog(user_id=current_user.id, **payload.model_dump())
    db.add(log)
    db.commit()
    db.refresh(log)
    # Kick off medal checks (best-effort)
    try:
        from ..medal_engine import check_cardio_medals
        check_cardio_medals(db, log)
    except Exception:
        pass
    return log


@router.get("/logs", response_model=list[CardioOut])
def list_cardio(
    modality: Optional[str] = Query(None),
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(CardioLog).filter(CardioLog.user_id == current_user.id)
    if modality:
        q = q.filter(CardioLog.modality == modality)
    if from_date:
        q = q.filter(CardioLog.date >= from_date)
    if to_date:
        q = q.filter(CardioLog.date <= to_date)
    return q.order_by(CardioLog.date.desc(), CardioLog.id.desc()).all()


@router.patch("/log/{cardio_id}", response_model=CardioOut)
def update_cardio(
    cardio_id: int,
    payload: CardioUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    log = db.query(CardioLog).filter(
        CardioLog.id == cardio_id, CardioLog.user_id == current_user.id
    ).first()
    if not log:
        raise HTTPException(status_code=404, detail="Cardio log not found")
    update_data = payload.model_dump(exclude_unset=True)
    merged = {
        "modality": update_data.get("modality", log.modality),
        "duration_minutes": update_data.get("duration_minutes", log.duration_minutes),
        "distance_km": update_data.get("distance_km", log.distance_km),
    }
    _validate(merged)
    for k, v in update_data.items():
        setattr(log, k, v)
    db.commit()
    db.refresh(log)
    return log


@router.delete("/log/{cardio_id}")
def delete_cardio(
    cardio_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    log = db.query(CardioLog).filter(
        CardioLog.id == cardio_id, CardioLog.user_id == current_user.id
    ).first()
    if not log:
        raise HTTPException(status_code=404, detail="Cardio log not found")
    db.delete(log)
    db.commit()
    return {"deleted": True}


@router.get("/summary")
def cardio_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = date.today()
    cutoff_12w = today - timedelta(weeks=12)
    logs = (
        db.query(CardioLog)
        .filter(CardioLog.user_id == current_user.id, CardioLog.date >= cutoff_12w)
        .all()
    )

    # Weekly rollup (by ISO week within last 12 weeks)
    weekly: dict[str, dict] = defaultdict(lambda: {"duration_minutes": 0.0, "distance_km": 0.0, "count": 0})
    for log in logs:
        iso_y, iso_w, _ = log.date.isocalendar()
        key = f"{iso_y}-W{iso_w:02d}"
        weekly[key]["duration_minutes"] += log.duration_minutes or 0
        weekly[key]["distance_km"] += log.distance_km or 0
        weekly[key]["count"] += 1

    # Modality breakdown
    modalities: dict[str, dict] = defaultdict(lambda: {"duration_minutes": 0.0, "distance_km": 0.0, "count": 0})
    for log in logs:
        m = modalities[log.modality]
        m["duration_minutes"] += log.duration_minutes or 0
        m["distance_km"] += log.distance_km or 0
        m["count"] += 1

    def window_stats(days: int):
        cutoff = today - timedelta(days=days)
        subset = [log for log in logs if log.date >= cutoff]
        return {
            "duration_minutes": round(sum(l.duration_minutes or 0 for l in subset), 1),
            "distance_km": round(sum(l.distance_km or 0 for l in subset), 2),
            "count": len(subset),
        }

    # PBs: longest_run / longest_ride / longest_swim (by distance), fastest mile from runs
    all_user_logs = (
        db.query(CardioLog)
        .filter(CardioLog.user_id == current_user.id)
        .all()
    )
    longest_run = max(
        (l for l in all_user_logs if l.modality == "run" and l.distance_km),
        key=lambda l: l.distance_km,
        default=None,
    )
    longest_ride = max(
        (l for l in all_user_logs if l.modality == "bike" and l.distance_km),
        key=lambda l: l.distance_km,
        default=None,
    )
    longest_swim = max(
        (l for l in all_user_logs if l.modality == "swim" and l.distance_km),
        key=lambda l: l.distance_km,
        default=None,
    )
    # Fastest mile: runs with distance >= 1.6km, min pace (min/km)
    mile_runs = [
        l for l in all_user_logs
        if l.modality == "run" and l.distance_km and l.distance_km >= 1.6 and l.duration_minutes
    ]
    fastest_pace = None
    if mile_runs:
        best = min(mile_runs, key=lambda l: l.duration_minutes / l.distance_km)
        fastest_pace = {
            "id": best.id,
            "date": str(best.date),
            "pace_min_per_km": round(best.duration_minutes / best.distance_km, 2),
            "distance_km": best.distance_km,
        }

    def _as_dict(l):
        if l is None:
            return None
        return {
            "id": l.id, "date": str(l.date), "distance_km": l.distance_km,
            "duration_minutes": l.duration_minutes,
        }

    last_7 = window_stats(7)
    return {
        "week": last_7,
        "weekly": dict(sorted(weekly.items())),
        "modalities": dict(modalities),
        "trends": {
            "7d": last_7,
            "30d": window_stats(30),
            "12w": window_stats(84),
        },
        "pbs": {
            "longest_run": _as_dict(longest_run),
            "longest_ride": _as_dict(longest_ride),
            "longest_swim": _as_dict(longest_swim),
            "fastest_mile": fastest_pace,
        },
    }
