"""Seed curated preset programs every user can import.

Creates a system-owned `preset` user (password disabled) and four copies of
Jeff Nippard's "The Essentials" — 2x, 3x, 4x, 5x per week — each pinned to a
stable human-readable share code so the existing share-import flow can clone
them into any user's account.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from sqlalchemy.orm import Session

from .models import Program, ProgramExercise, ProgramProgress, User

FIXTURES_DIR = Path(__file__).parent / "fixtures"

PRESET_USERNAME = "preset"
PRESET_DISPLAY_NAME = "The Essentials"

PRESETS = [
    {"freq": 2, "share_code": "NIPPARD2", "fixture": "nippard_2x.json"},
    {"freq": 3, "share_code": "NIPPARD3", "fixture": "nippard_3x.json"},
    {"freq": 4, "share_code": "NIPPARD4", "fixture": "nippard_4x.json"},
    {"freq": 5, "share_code": "NIPPARD5", "fixture": "nippard_5x.json"},
]


def _get_or_create_preset_user(db: Session) -> User:
    u = db.query(User).filter(User.username == PRESET_USERNAME).first()
    if u:
        return u
    # Password hash is set to a sentinel that can't verify any input (bcrypt
    # rejects non-matching hashes) so this account can never be logged into.
    u = User(
        username=PRESET_USERNAME,
        name=PRESET_DISPLAY_NAME,
        password_hash="!disabled!",
        preferred_units="kg",
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _insert_fixture(db: Session, owner_id: int, share_code: str, fixture: dict) -> Program:
    program = Program(
        user_id=owner_id,
        name=fixture["name"],
        frequency=fixture["frequency"],
        start_date=date.today(),
        status="paused",  # presets aren't anyone's active program
        total_weeks=fixture["total_weeks"],
        source_file=fixture.get("source_file"),
        share_code=share_code,
    )
    db.add(program)
    db.flush()

    for ex in fixture["exercises"]:
        db.add(ProgramExercise(
            program_id=program.id,
            week=ex["week"],
            session_name=ex["session_name"],
            session_order_in_week=ex["session_order_in_week"],
            exercise_order=ex["exercise_order"],
            exercise_name_canonical=ex["exercise_name_canonical"],
            exercise_name_raw=ex["exercise_name_raw"],
            warm_up_sets=ex["warm_up_sets"],
            working_sets=ex["working_sets"],
            prescribed_reps=ex["prescribed_reps"],
            prescribed_rpe=ex["prescribed_rpe"],
            rest_period=ex["rest_period"],
            substitution_1=ex["substitution_1"],
            substitution_2=ex["substitution_2"],
            notes=ex["notes"],
            is_superset=ex["is_superset"],
            superset_group=ex["superset_group"],
        ))

    db.add(ProgramProgress(
        program_id=program.id,
        current_week=1,
        current_session_index=1,
        total_sessions_completed=0,
        total_sessions_skipped=0,
    ))
    db.commit()
    db.refresh(program)
    return program


def seed_preset_programs(db: Session) -> None:
    """Create/refresh the four preset Essentials programs. Idempotent."""
    preset_user = _get_or_create_preset_user(db)
    for spec in PRESETS:
        existing = db.query(Program).filter(Program.share_code == spec["share_code"]).first()
        if existing:
            continue
        fixture_path = FIXTURES_DIR / spec["fixture"]
        if not fixture_path.exists():
            continue
        fixture = json.loads(fixture_path.read_text())
        _insert_fixture(db, preset_user.id, spec["share_code"], fixture)
