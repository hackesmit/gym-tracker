"""Authentication endpoints: register, login, me."""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from ..auth import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from ..database import get_db
from ..models import User

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterPayload(BaseModel):
    username: str = Field(..., min_length=2, max_length=40)
    password: str = Field(..., min_length=4, max_length=128)
    email: Optional[str] = None
    name: Optional[str] = None


class LoginPayload(BaseModel):
    username: str
    password: str
    remember: bool = False


class UserOut(BaseModel):
    id: int
    username: Optional[str] = None
    email: Optional[str] = None
    name: str
    preferred_units: str
    bodyweight_kg: Optional[float] = None

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


RESERVED_USERNAMES = {"preset", "system", "admin"}


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(payload: RegisterPayload, db: Session = Depends(get_db)):
    if payload.username.lower() in RESERVED_USERNAMES:
        raise HTTPException(status_code=409, detail="Username already taken")
    existing = db.query(User).filter(User.username == payload.username).first()
    if existing:
        raise HTTPException(status_code=409, detail="Username already taken")
    if payload.email:
        if db.query(User).filter(User.email == payload.email).first():
            raise HTTPException(status_code=409, detail="Email already in use")
    user = User(
        username=payload.username,
        email=payload.email,
        name=payload.name or payload.username,
        password_hash=hash_password(payload.password),
        preferred_units="kg",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(user.id, remember=False)
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginPayload, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == payload.username).first()
    if not user or not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    user.last_login_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    token = create_access_token(user.id, remember=payload.remember)
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


class ChangeUsernamePayload(BaseModel):
    new_username: str = Field(..., min_length=2, max_length=40)
    challenge: str
    answer: str


@router.get("/username-captcha")
def username_captcha(current_user: User = Depends(get_current_user)):
    from ..captcha import generate_challenge
    problem, challenge = generate_challenge()
    return {"problem": problem, "challenge": challenge}


@router.post("/change-username", response_model=UserOut)
def change_username(
    payload: ChangeUsernamePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from ..captcha import verify_challenge

    new_username = payload.new_username.strip()
    if not new_username or new_username == current_user.username:
        raise HTTPException(status_code=400, detail="Username unchanged")
    if new_username.lower() in RESERVED_USERNAMES:
        raise HTTPException(status_code=409, detail="Username already taken")
    if not verify_challenge(payload.challenge, payload.answer):
        raise HTTPException(status_code=400, detail="Incorrect answer — try a new problem")
    if db.query(User).filter(User.username == new_username, User.id != current_user.id).first():
        raise HTTPException(status_code=409, detail="Username already taken")
    current_user.username = new_username
    db.commit()
    db.refresh(current_user)
    return current_user


class UpdateMePayload(BaseModel):
    username: Optional[str] = Field(None, min_length=2, max_length=40)
    name: Optional[str] = None
    email: Optional[str] = None


@router.patch("/me", response_model=UserOut)
def update_me(
    payload: UpdateMePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if payload.username and payload.username != current_user.username:
        if db.query(User).filter(User.username == payload.username, User.id != current_user.id).first():
            raise HTTPException(status_code=409, detail="Username already taken")
        current_user.username = payload.username
    if payload.name is not None:
        current_user.name = payload.name
    if payload.email is not None:
        if payload.email and db.query(User).filter(User.email == payload.email, User.id != current_user.id).first():
            raise HTTPException(status_code=409, detail="Email already in use")
        current_user.email = payload.email or None
    db.commit()
    db.refresh(current_user)
    return current_user


class AdminResetPayload(BaseModel):
    target_username: str
    new_password: str = Field(..., min_length=4, max_length=128)


ADMIN_USERNAMES = {"hackesmit"}


@router.post("/admin-reset")
def admin_reset(
    payload: AdminResetPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reset another user's password. Restricted to admin usernames."""
    if (current_user.username or "").lower() not in ADMIN_USERNAMES:
        raise HTTPException(status_code=403, detail="Admin only")
    target = db.query(User).filter(User.username == payload.target_username).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    target.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"ok": True, "username": target.username}


class WipeUserPayload(BaseModel):
    target_username: str


@router.get("/admin-users")
def admin_list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin-only: list all users (id, username, name) for ops tooling."""
    if (current_user.username or "").lower() not in ADMIN_USERNAMES:
        raise HTTPException(status_code=403, detail="Admin only")
    rows = db.query(User).order_by(User.id).all()
    return {
        "users": [
            {"id": u.id, "username": u.username, "name": u.name}
            for u in rows
        ]
    }


@router.post("/admin-wipe-user")
def admin_wipe_user(
    payload: WipeUserPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reset a target user's per-user data without deleting their account.

    Admin-only. Preserves the User row + username/password so they can still
    log in. Wipes: programs (+ children), all logs, achievements, medals held,
    body metrics, cardio, vacations, feed, ranks, friendships, and any chat
    messages they authored. Refuses to touch admin usernames or the preset
    system user.
    """
    if (current_user.username or "").lower() not in ADMIN_USERNAMES:
        raise HTTPException(status_code=403, detail="Admin only")

    from sqlalchemy import or_

    from ..models import (
        Achievement,
        BodyMetric,
        CardioLog,
        ChatMessage,
        FeedEvent,
        Friendship,
        MedalCurrentHolder,
        MedalRecord,
        MuscleScore,
        Program,
        ProgramExercise,
        ProgramProgress,
        SessionLog,
        VacationPeriod,
        WorkoutLog,
    )

    target = db.query(User).filter(User.username == payload.target_username).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if (target.username or "").lower() in ADMIN_USERNAMES:
        raise HTTPException(status_code=400, detail="Refusing to wipe an admin")
    if (target.username or "").lower() == "preset":
        raise HTTPException(status_code=400, detail="Refusing to wipe preset owner")

    program_ids = [p.id for p in db.query(Program.id).filter(Program.user_id == target.id).all()]

    counts: dict[str, int] = {}

    def _delete(model, *filters, label: str) -> None:
        n = db.query(model).filter(*filters).delete(synchronize_session=False)
        if n:
            counts[label] = n

    _delete(WorkoutLog, WorkoutLog.user_id == target.id, label="workout_logs")
    _delete(SessionLog, SessionLog.user_id == target.id, label="session_logs")
    _delete(Achievement, Achievement.user_id == target.id, label="achievements")
    _delete(MuscleScore, MuscleScore.user_id == target.id, label="muscle_scores")
    _delete(BodyMetric, BodyMetric.user_id == target.id, label="body_metrics")
    _delete(CardioLog, CardioLog.user_id == target.id, label="cardio_logs")
    _delete(VacationPeriod, VacationPeriod.user_id == target.id, label="vacation_periods")
    _delete(FeedEvent, FeedEvent.user_id == target.id, label="feed_events")
    _delete(ChatMessage, ChatMessage.user_id == target.id, label="chat_messages")
    _delete(MedalRecord, MedalRecord.user_id == target.id, label="medal_records")
    _delete(MedalCurrentHolder, MedalCurrentHolder.user_id == target.id, label="medal_holders")
    _delete(
        Friendship,
        or_(Friendship.requester_id == target.id, Friendship.addressee_id == target.id),
        label="friendships",
    )

    if program_ids:
        _delete(ProgramProgress, ProgramProgress.program_id.in_(program_ids), label="program_progress")
        _delete(ProgramExercise, ProgramExercise.program_id.in_(program_ids), label="program_exercises")
        _delete(Program, Program.id.in_(program_ids), label="programs")

    # Clear optional user-profile-ish fields that are "per-user data" rather
    # than identity. Keep username + password so they can still log in.
    target.bodyweight_kg = None
    target.height_cm = None
    target.sex = None
    target.birth_date = None
    target.training_age_months = None
    target.manual_1rm = None

    db.commit()
    return {"wiped": target.username, "counts": counts}


class AbsorbPayload(BaseModel):
    source_username: str
    source_password: str


@router.post("/absorb")
def absorb(
    payload: AbsorbPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reassign all data owned by (source_username, source_password) to current user.

    Use case: you registered a fresh account but want your older hackesmit data.
    Verifies source credentials, moves all user_id references, deletes the source user.
    """
    from sqlalchemy import update

    from ..models import (
        BodyMetric,
        CardioLog,
        FeedEvent,
        Friendship,
        MedalCurrentHolder,
        MedalRecord,
        MuscleScore,
        Program,
        SessionLog,
        VacationPeriod,
        WorkoutLog,
    )

    src = db.query(User).filter(User.username == payload.source_username).first()
    if not src or not src.password_hash or not verify_password(payload.source_password, src.password_hash):
        raise HTTPException(status_code=401, detail="Invalid source credentials")
    if src.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot absorb yourself")

    moved = {}
    for model, label in [
        (Program, "programs"),
        (WorkoutLog, "workout_logs"),
        (SessionLog, "session_logs"),
        (CardioLog, "cardio_logs"),
        (BodyMetric, "body_metrics"),
        (MuscleScore, "muscle_scores"),
        (VacationPeriod, "vacation_periods"),
        (FeedEvent, "feed_events"),
        (MedalRecord, "medal_records"),
        (MedalCurrentHolder, "medal_current_holders"),
    ]:
        q = db.query(model).filter(model.user_id == src.id)
        count = q.count()
        if count:
            q.update({model.user_id: current_user.id}, synchronize_session=False)
            moved[label] = count

    # Friendships: clean up duplicates with current user, otherwise reassign
    friendships = db.query(Friendship).filter(
        (Friendship.requester_id == src.id) | (Friendship.addressee_id == src.id)
    ).all()
    for f in friendships:
        if f.requester_id == current_user.id or f.addressee_id == current_user.id:
            db.delete(f)
            continue
        if f.requester_id == src.id:
            f.requester_id = current_user.id
        if f.addressee_id == src.id:
            f.addressee_id = current_user.id

    db.delete(src)
    db.commit()
    return {"absorbed": payload.source_username, "moved": moved}
