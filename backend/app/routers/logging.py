"""Workout logging endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db

router = APIRouter(prefix="/api/logging", tags=["logging"])


@router.get("/")
def list_logs(db: Session = Depends(get_db)):
    """List workout logs."""
    return {"logs": []}
