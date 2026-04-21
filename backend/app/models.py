"""SQLAlchemy ORM models for the Gym Tracker application."""

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from .database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    username: Mapped[str | None] = mapped_column(String, unique=True, nullable=True, index=True)
    email: Mapped[str | None] = mapped_column(String, unique=True, nullable=True, index=True)
    password_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    bodyweight_kg: Mapped[float] = mapped_column(Float, nullable=True)
    height_cm: Mapped[float] = mapped_column(Float, nullable=True)
    sex: Mapped[str] = mapped_column(String, nullable=True)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    training_age_months: Mapped[int | None] = mapped_column(Integer, nullable=True)
    preferred_units: Mapped[str] = mapped_column(String, default="kg")
    manual_1rm: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )

    programs: Mapped[list["Program"]] = relationship(back_populates="user")
    workout_logs: Mapped[list["WorkoutLog"]] = relationship(back_populates="user")
    session_logs: Mapped[list["SessionLog"]] = relationship(back_populates="user")
    body_metrics: Mapped[list["BodyMetric"]] = relationship(back_populates="user")
    vacation_periods: Mapped[list["VacationPeriod"]] = relationship(back_populates="user")


class Program(Base):
    __tablename__ = "programs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    frequency: Mapped[int] = mapped_column(Integer, nullable=False)  # 2-5
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(
        String, default="active"
    )  # active/completed/paused/abandoned
    total_weeks: Mapped[int] = mapped_column(Integer, default=12)
    source_file: Mapped[str | None] = mapped_column(String, nullable=True)
    share_code: Mapped[str | None] = mapped_column(
        String, unique=True, nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="programs")
    exercises: Mapped[list["ProgramExercise"]] = relationship(
        back_populates="program"
    )
    session_logs: Mapped[list["SessionLog"]] = relationship(back_populates="program")
    progress: Mapped["ProgramProgress | None"] = relationship(
        back_populates="program", uselist=False
    )


class ProgramExercise(Base):
    __tablename__ = "program_exercises"
    __table_args__ = (
        UniqueConstraint(
            "program_id", "week", "session_name", "exercise_order",
            name="uq_program_exercise",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    program_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("programs.id"), nullable=False
    )
    week: Mapped[int] = mapped_column(Integer, nullable=False)
    session_name: Mapped[str] = mapped_column(String, nullable=False)
    session_order_in_week: Mapped[int] = mapped_column(Integer, nullable=False)
    exercise_order: Mapped[int] = mapped_column(Integer, nullable=False)
    exercise_name_canonical: Mapped[str] = mapped_column(String, nullable=False, index=True)
    exercise_name_raw: Mapped[str] = mapped_column(String, nullable=False)
    warm_up_sets: Mapped[str | None] = mapped_column(String, nullable=True)
    working_sets: Mapped[int] = mapped_column(Integer, nullable=False)
    prescribed_reps: Mapped[str] = mapped_column(String, nullable=False)
    prescribed_rpe: Mapped[str | None] = mapped_column(String, nullable=True)
    rest_period: Mapped[str | None] = mapped_column(String, nullable=True)
    substitution_1: Mapped[str | None] = mapped_column(String, nullable=True)
    substitution_2: Mapped[str | None] = mapped_column(String, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_superset: Mapped[bool] = mapped_column(Boolean, default=False)
    superset_group: Mapped[str | None] = mapped_column(String, nullable=True)

    program: Mapped["Program"] = relationship(back_populates="exercises")
    workout_logs: Mapped[list["WorkoutLog"]] = relationship(
        back_populates="program_exercise"
    )


class ExerciseCatalog(Base):
    __tablename__ = "exercise_catalog"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    canonical_name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    muscle_group_primary: Mapped[str] = mapped_column(String, nullable=False)
    muscle_groups_secondary: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    movement_pattern: Mapped[str] = mapped_column(String, nullable=False)
    equipment: Mapped[str] = mapped_column(String, nullable=False)
    is_compound: Mapped[bool] = mapped_column(Boolean, default=False)
    is_unilateral: Mapped[bool] = mapped_column(Boolean, default=False)
    difficulty_level: Mapped[str] = mapped_column(String, nullable=False)


class WorkoutLog(Base):
    __tablename__ = "workout_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False, index=True
    )
    program_exercise_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("program_exercises.id"), nullable=False
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    set_number: Mapped[int] = mapped_column(Integer, nullable=False)
    load_kg: Mapped[float] = mapped_column(Float, nullable=False)
    reps_completed: Mapped[int] = mapped_column(Integer, nullable=False)
    rpe_actual: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_bodyweight: Mapped[bool] = mapped_column(Boolean, default=False)
    is_dropset: Mapped[bool] = mapped_column(Boolean, default=False)
    dropset_load_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_true_1rm_attempt: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_successfully: Mapped[bool] = mapped_column(Boolean, default=True)
    session_log_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("session_logs.id", ondelete="CASCADE"), nullable=True
    )

    user: Mapped["User"] = relationship(back_populates="workout_logs")
    program_exercise: Mapped["ProgramExercise"] = relationship(
        back_populates="workout_logs"
    )
    session_log: Mapped["SessionLog | None"] = relationship()


class SessionLog(Base):
    __tablename__ = "session_logs"
    __table_args__ = (
        UniqueConstraint("program_id", "week", "session_name", name="uq_session_log"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    program_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("programs.id"), nullable=False, index=True
    )
    week: Mapped[int] = mapped_column(Integer, nullable=False)
    session_name: Mapped[str] = mapped_column(String, nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(
        String, nullable=False
    )  # completed/partial/skipped
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    session_rpe: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    user: Mapped["User"] = relationship(back_populates="session_logs")
    program: Mapped["Program"] = relationship(back_populates="session_logs")


class ProgramProgress(Base):
    __tablename__ = "program_progress"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    program_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("programs.id"), unique=True, nullable=False
    )
    current_week: Mapped[int] = mapped_column(Integer, nullable=False)
    current_session_index: Mapped[int] = mapped_column(Integer, nullable=False)
    total_sessions_completed: Mapped[int] = mapped_column(Integer, default=0)
    total_sessions_skipped: Mapped[int] = mapped_column(Integer, default=0)
    last_session_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    next_session_due: Mapped[date | None] = mapped_column(Date, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    program: Mapped["Program"] = relationship(back_populates="progress")


class BodyMetric(Base):
    __tablename__ = "body_metrics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    bodyweight_kg: Mapped[float] = mapped_column(Float, nullable=False)
    body_fat_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    sleep_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    stress_level: Mapped[int | None] = mapped_column(Integer, nullable=True)
    soreness_level: Mapped[int | None] = mapped_column(Integer, nullable=True)

    user: Mapped["User"] = relationship(back_populates="body_metrics")


class Achievement(Base):
    __tablename__ = "achievements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    type: Mapped[str] = mapped_column(
        String, nullable=False
    )  # weight_pr, e1rm_pr, rep_pr, volume_pr, streak, consistency, milestone, badge
    exercise_name: Mapped[str | None] = mapped_column(String, nullable=True)
    category: Mapped[str | None] = mapped_column(
        String, nullable=True
    )  # strength, consistency, volume (for badges)
    tier: Mapped[str | None] = mapped_column(
        String, nullable=True
    )  # novice, intermediate, advanced, elite
    value: Mapped[float] = mapped_column(Float, nullable=False)
    previous_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    extra: Mapped[dict | None] = mapped_column("metadata_json", JSON, nullable=True)
    session_log_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("session_logs.id", ondelete="SET NULL"), nullable=True
    )
    achieved_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )


class VacationPeriod(Base):
    __tablename__ = "vacation_periods"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False, index=True
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    reason: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="vacation_periods")


class CardioLog(Base):
    __tablename__ = "cardio_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False, index=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    modality: Mapped[str] = mapped_column(String, nullable=False)  # run, bike, swim, row, walk, other
    duration_minutes: Mapped[float] = mapped_column(Float, nullable=False)
    distance_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    elevation_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_hr: Mapped[int | None] = mapped_column(Integer, nullable=True)
    calories: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rpe: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class Friendship(Base):
    __tablename__ = "friendships"
    __table_args__ = (
        UniqueConstraint("requester_id", "addressee_id", name="uq_friendship_pair"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    requester_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    addressee_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")  # pending/accepted/declined
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class Medal(Base):
    __tablename__ = "medals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    metric_type: Mapped[str] = mapped_column(String, nullable=False)
    unit: Mapped[str] = mapped_column(String, nullable=False)
    higher_is_better: Mapped[bool] = mapped_column(Boolean, default=True)
    description: Mapped[str | None] = mapped_column(String, nullable=True)


class MedalRecord(Base):
    __tablename__ = "medal_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    medal_id: Mapped[int] = mapped_column(Integer, ForeignKey("medals.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    source_type: Mapped[str | None] = mapped_column(String, nullable=True)  # workout_log/cardio_log/session_log
    source_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    achieved_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class MedalCurrentHolder(Base):
    __tablename__ = "medal_current_holder"

    medal_id: Mapped[int] = mapped_column(Integer, ForeignKey("medals.id"), primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class MuscleScore(Base):
    __tablename__ = "muscle_scores"
    __table_args__ = (
        UniqueConstraint("user_id", "muscle_group", name="uq_muscle_score"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    muscle_group: Mapped[str] = mapped_column(String, nullable=False)
    score_v: Mapped[float] = mapped_column(Float, default=0.0)
    score_i: Mapped[float] = mapped_column(Float, default=0.0)
    score_f: Mapped[float] = mapped_column(Float, default=0.0)
    score: Mapped[float] = mapped_column(Float, default=0.0)
    rank: Mapped[str] = mapped_column(String, default="Copper")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class FeedEvent(Base):
    __tablename__ = "feed_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String, nullable=False)
    payload_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True, index=True
    )
    kind: Mapped[str] = mapped_column(String, nullable=False, default="user")
    content: Mapped[str] = mapped_column(Text, nullable=False)
    payload_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), index=True
    )

