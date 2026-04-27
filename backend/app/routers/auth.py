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


@router.post("/admin/bw-migration-rollback")
def admin_bw_migration_rollback(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Revert every WorkoutLog touched by the BW migration to its old_load_kg.
    Clears the bw_migration_audit table AND the bw_input_2026_04 marker
    in migration_log on success, so the next backend restart will re-run
    the migration from scratch (typical use: rollback, fix a bug, redeploy).
    Recomputes all ranks. Admin-gated."""
    if (current_user.username or "").lower() not in ADMIN_USERNAMES:
        raise HTTPException(status_code=403, detail="Admin only.")

    from ..models import BwMigrationAudit, MigrationLog, WorkoutLog
    rows = db.query(BwMigrationAudit).all()
    reverted = 0
    for row in rows:
        log = db.get(WorkoutLog, row.log_id)
        if log is None:
            continue
        log.load_kg = row.old_load_kg
        log.added_load_kg = None
        reverted += 1
    db.query(BwMigrationAudit).delete()
    # Clear ALL related lifespan markers so the next deploy re-runs the
    # full chain (migration → cleanup → recompute) cleanly.
    for marker in (
        "bw_input_2026_04",
        "pure_load_kg_cleanup_2026_04",
        "bw_recompute_after_migration_2026_04",
    ):
        db.query(MigrationLog).filter_by(name=marker).delete()
    db.commit()

    try:
        from ..rank_engine import recompute_all
        recompute_all(db)
    except Exception:
        pass
    return {"reverted": reverted}


@router.post("/admin/bw-migration-rerun-for-user/{user_id}")
def admin_bw_migration_rerun_for_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Re-run the BW migration for one user (e.g. after they backfill BW).
    Idempotent — already-audited logs are skipped. Admin-gated."""
    if (current_user.username or "").lower() not in ADMIN_USERNAMES:
        raise HTTPException(status_code=403, detail="Admin only.")

    from ..bw_migration import rerun_bw_migration_for_user
    summary = rerun_bw_migration_for_user(db, user_id)

    try:
        from ..rank_engine import recompute_for_user
        recompute_for_user(db, user_id)
    except Exception:
        pass
    return summary


@router.get("/admin/user-rank-trace/{user_id_or_name}")
def admin_user_rank_trace(
    user_id_or_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Comprehensive back-rank diagnostic for one user. Returns:
      - User's resolved BW (live + latest BodyMetric)
      - The recompute_for_user output (rank + source per group)
      - All back-class WorkoutLogs in the last 90 days (canonical name,
        load_kg, added_load_kg, reps, date)
      - All bw_migration_audit rows for this user
      - Whether the recompute_all gate ran
      - Current MuscleScore.rank (pre-recompute) vs new (post-recompute)

    Accepts either user_id (integer) or username (string). Admin-gated.
    """
    if (current_user.username or "").lower() not in ADMIN_USERNAMES:
        raise HTTPException(status_code=403, detail="Admin only.")

    from datetime import date, timedelta
    from ..models import (
        BodyMetric, BwMigrationAudit, MigrationLog, MuscleScore,
        ProgramExercise, WorkoutLog,
    )
    from ..muscle_rank_config import (
        BACK_BODYWEIGHT_PULLUPS, BACK_ROWS_PULLDOWNS, BACK_WEIGHTED_PULLUPS,
        LOOKBACK_DAYS,
    )
    from ..rank_engine import recompute_for_user

    # Resolve target by id or username (username lookup is case-insensitive
    # since the live profile may show "Aragorn" while the row stores "aragorn"
    # or vice versa).
    from sqlalchemy import func
    target = None
    try:
        target = db.get(User, int(user_id_or_name))
    except (TypeError, ValueError):
        pass
    if target is None:
        target = (
            db.query(User)
            .filter(func.lower(User.username) == user_id_or_name.lower())
            .first()
        )
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # Snapshot current MuscleScore BEFORE recompute
    pre_rows = db.query(MuscleScore).filter(MuscleScore.user_id == target.id).all()
    pre_back = next((r for r in pre_rows if r.muscle_group == "back"), None)

    # Latest BodyMetric
    latest_bm = (
        db.query(BodyMetric)
        .filter(BodyMetric.user_id == target.id)
        .order_by(BodyMetric.date.desc())
        .first()
    )

    # All back-related canonicals
    back_canonicals = list(
        BACK_WEIGHTED_PULLUPS | BACK_BODYWEIGHT_PULLUPS | set(BACK_ROWS_PULLDOWNS.keys())
    )
    cutoff = date.today() - timedelta(days=LOOKBACK_DAYS)
    back_logs = (
        db.query(
            ProgramExercise.exercise_name_canonical,
            WorkoutLog.load_kg,
            WorkoutLog.added_load_kg,
            WorkoutLog.reps_completed,
            WorkoutLog.date,
            WorkoutLog.id,
        )
        .join(WorkoutLog, WorkoutLog.program_exercise_id == ProgramExercise.id)
        .filter(
            WorkoutLog.user_id == target.id,
            WorkoutLog.date >= cutoff,
            ProgramExercise.exercise_name_canonical.in_(back_canonicals),
        )
        .order_by(WorkoutLog.date.desc())
        .all()
    )

    # Audit rows for this user
    audit_rows = (
        db.query(BwMigrationAudit)
        .filter(BwMigrationAudit.user_id == target.id)
        .all()
    )

    # Did the recompute_all_ranks_once gate fire?
    recompute_marker = db.query(MigrationLog).filter_by(
        name="bw_recompute_after_migration_2026_04",
    ).first()
    migration_marker = db.query(MigrationLog).filter_by(
        name="bw_input_2026_04",
    ).first()

    # NOW recompute and capture the source per group
    new_ranks = recompute_for_user(db, target.id)

    return {
        "user_id": target.id,
        "username": target.username,
        "bodyweight_kg_live": target.bodyweight_kg,
        "latest_body_metric": (
            {"date": str(latest_bm.date), "bodyweight_kg": latest_bm.bodyweight_kg}
            if latest_bm else None
        ),
        "lifespan_markers": {
            "bw_input_2026_04": (
                str(migration_marker.ran_at) if migration_marker else None
            ),
            "bw_recompute_after_migration_2026_04": (
                str(recompute_marker.ran_at) if recompute_marker else None
            ),
        },
        "muscle_score_pre_recompute": (
            {
                "rank": pre_back.rank,
                "sub_index": pre_back.sub_index,
                "score": pre_back.score,
                "elo": pre_back.elo,
                "score_i_ratio": pre_back.score_i,
            }
            if pre_back else None
        ),
        "ranks_after_recompute": new_ranks,
        "back_logs_last_90_days": [
            {
                "log_id": r.id,
                "exercise": r.exercise_name_canonical,
                "load_kg": r.load_kg,
                "added_load_kg": r.added_load_kg,
                "reps": r.reps_completed,
                "date": str(r.date),
            }
            for r in back_logs
        ],
        "bw_migration_audit_rows": [
            {
                "log_id": a.log_id,
                "exercise_name": a.exercise_name,
                "old_load_kg": a.old_load_kg,
                "new_load_kg": a.new_load_kg,
                "new_added_load_kg": a.new_added_load_kg,
                "reason": a.reason,
            }
            for a in audit_rows
        ],
    }
