"""Authentication utilities: bcrypt hashing, JWT issuing, FastAPI deps."""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import bcrypt
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from .database import get_db
from .models import User

JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-me-please")
JWT_ALGORITHM = "HS256"
DEFAULT_EXPIRY_DAYS = 7
REMEMBER_EXPIRY_DAYS = 30

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def hash_password(password: str) -> str:
    pw = password.encode("utf-8")[:72]
    return bcrypt.hashpw(pw, bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        pw = password.encode("utf-8")[:72]
        return bcrypt.checkpw(pw, password_hash.encode("utf-8"))
    except Exception:
        return False


def create_access_token(sub: str | int, remember: bool = False) -> str:
    days = REMEMBER_EXPIRY_DAYS if remember else DEFAULT_EXPIRY_DAYS
    payload = {
        "sub": str(sub),
        "exp": datetime.now(timezone.utc) + timedelta(days=days),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])


def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = decode_token(token)
        sub = payload.get("sub")
        if sub is None:
            raise JWTError("no sub")
        user_id = int(sub)
    except (JWTError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return user
