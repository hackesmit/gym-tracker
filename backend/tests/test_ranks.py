"""Rank engine produces valid ranks."""

from datetime import date, timedelta

from app.models import ExerciseCatalog, Program, ProgramExercise, User, WorkoutLog
from app.rank_engine import MVP_GROUPS, RANK_BINS, recompute_for_user


VALID_RANKS = {name for _, _, name in RANK_BINS}


def test_recompute_produces_valid_ranks(db):
    user = db.query(User).first()
    # Seed a catalog entry for BENCH with primary=chest
    db.add(ExerciseCatalog(
        canonical_name="BENCH", muscle_group_primary="chest",
        movement_pattern="press", equipment="barbell", difficulty_level="intermediate",
    ))
    db.commit()

    p = Program(user_id=user.id, name="p", frequency=3, start_date=date(2026, 1, 1))
    db.add(p); db.commit()
    pe = ProgramExercise(
        program_id=p.id, week=1, session_name="X", session_order_in_week=1,
        exercise_order=1, exercise_name_canonical="BENCH", exercise_name_raw="BENCH",
        working_sets=3, prescribed_reps="8",
    )
    db.add(pe); db.commit()

    today = date.today()
    for day_offset, load in [(1, 80), (3, 85), (5, 90)]:
        db.add(WorkoutLog(
            user_id=user.id, program_exercise_id=pe.id,
            date=today - timedelta(days=day_offset), set_number=1,
            load_kg=load, reps_completed=5,
        ))
    db.commit()

    result = recompute_for_user(db, user.id)
    # Should contain all MVP groups
    assert set(result.keys()) == set(MVP_GROUPS)
    for g, v in result.items():
        assert v["rank"] in VALID_RANKS
        assert 0 <= v["score"] <= 100
