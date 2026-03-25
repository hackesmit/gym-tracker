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
    exercise_name_canonical: Mapped[str] = mapped_column(String, nullable=False)
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
        Integer, ForeignKey("users.id"), nullable=False
    )
    program_exercise_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("program_exercises.id"), nullable=False
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    set_number: Mapped[int] = mapped_column(Integer, nullable=False)
    load_kg: Mapped[float] = mapped_column(Float, nullable=False)
    reps_completed: Mapped[int] = mapped_column(Integer, nullable=False)
    rpe_actual: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_bodyweight: Mapped[bool] = mapped_column(Boolean, default=False)
    is_dropset: Mapped[bool] = mapped_column(Boolean, default=False)
    dropset_load_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
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
        Integer, ForeignKey("programs.id"), nullable=False
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
