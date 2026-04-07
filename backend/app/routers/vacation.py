"""Vacation period CRUD endpoints."""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, VacationPeriod

router = APIRouter(prefix="/api/vacation", tags=["vacation"])


class VacationCreate(BaseModel):
    start_date: date
    end_date: Optional[date] = None
    reason: Optional[str] = None


class VacationUpdate(BaseModel):
    end_date: Optional[date] = None
    reason: Optional[str] = None


def _serialize(vp: VacationPeriod) -> dict:
    return {
        "id": vp.id,
        "start_date": str(vp.start_date),
        "end_date": str(vp.end_date) if vp.end_date else None,
        "reason": vp.reason,
        "created_at": str(vp.created_at) if vp.created_at else None,
    }


def _default_user(db: Session) -> User:
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No user found")
    return user


@router.get("")
def list_vacations(db: Session = Depends(get_db)):
    user = _default_user(db)
    periods = (
        db.query(VacationPeriod)
        .filter(VacationPeriod.user_id == user.id)
        .order_by(VacationPeriod.start_date)
        .all()
    )
    return [_serialize(vp) for vp in periods]


@router.get("/active")
def get_active_vacation(db: Session = Depends(get_db)):
    user = _default_user(db)
    vp = (
        db.query(VacationPeriod)
        .filter(
            VacationPeriod.user_id == user.id,
            VacationPeriod.end_date.is_(None),
        )
        .order_by(VacationPeriod.start_date.desc())
        .first()
    )
    if not vp:
        raise HTTPException(status_code=404, detail="No active vacation")
    return _serialize(vp)


@router.post("", status_code=201)
def create_vacation(body: VacationCreate, db: Session = Depends(get_db)):
    user = _default_user(db)
    vp = VacationPeriod(
        user_id=user.id,
        start_date=body.start_date,
        end_date=body.end_date,
        reason=body.reason,
    )
    db.add(vp)
    db.commit()
    db.refresh(vp)
    return _serialize(vp)


@router.put("/{vacation_id}")
def update_vacation(
    vacation_id: int, body: VacationUpdate, db: Session = Depends(get_db)
):
    vp = db.query(VacationPeriod).filter(VacationPeriod.id == vacation_id).first()
    if not vp:
        raise HTTPException(status_code=404, detail="Vacation period not found")
    if body.end_date is not None:
        vp.end_date = body.end_date
    if body.reason is not None:
        vp.reason = body.reason
    db.commit()
    db.refresh(vp)
    return _serialize(vp)


@router.delete("/{vacation_id}")
def delete_vacation(vacation_id: int, db: Session = Depends(get_db)):
    vp = db.query(VacationPeriod).filter(VacationPeriod.id == vacation_id).first()
    if not vp:
        raise HTTPException(status_code=404, detail="Vacation period not found")
    db.delete(vp)
    db.commit()
    return {"ok": True}
