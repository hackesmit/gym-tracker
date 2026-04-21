"""Fixed-threshold rank engine tests."""

from datetime import date, timedelta

from app.models import ExerciseCatalog, Program, ProgramExercise, User, WorkoutLog
from app.muscle_rank_config import MUSCLE_RANK_THRESHOLDS, RANK_ORDER
from app.rank_engine import MVP_GROUPS, recompute_for_user


VALID_RANKS = set(RANK_ORDER)


def _seed_bench(db, user, load_kg: float, reps: int, day_offset: int = 1):
    """Seed one bench-press workout log."""
    # Catalog + program + program_exercise boilerplate
    if not db.query(ExerciseCatalog).filter_by(canonical_name="BENCH PRESS").first():
        db.add(ExerciseCatalog(
            canonical_name="BENCH PRESS", muscle_group_primary="chest",
            movement_pattern="horizontal push", equipment="barbell",
            difficulty_level="intermediate",
        ))
    p = Program(user_id=user.id, name="p", frequency=3, start_date=date(2026, 1, 1))
    db.add(p)
    db.commit()
    pe = ProgramExercise(
        program_id=p.id, week=1, session_name="X", session_order_in_week=1,
        exercise_order=1, exercise_name_canonical="BENCH PRESS", exercise_name_raw="BENCH PRESS",
        working_sets=3, prescribed_reps="5",
    )
    db.add(pe)
    db.commit()
    db.add(WorkoutLog(
        user_id=user.id, program_exercise_id=pe.id,
        date=date.today() - timedelta(days=day_offset), set_number=1,
        load_kg=load_kg, reps_completed=reps,
    ))
    db.commit()
    return pe


def test_returns_all_mvp_groups(db):
    user = db.query(User).first()
    user.bodyweight_kg = 80.0
    db.commit()

    result = recompute_for_user(db, user.id)
    assert set(result.keys()) == set(MVP_GROUPS)
    for v in result.values():
        assert v["rank"] in VALID_RANKS
        assert 0 <= v["score"] <= 100


def test_missing_bodyweight_defaults_to_copper(db):
    """Without a bodyweight we cannot compute ratios — everything is Copper."""
    user = db.query(User).first()
    # No bodyweight on purpose.
    _seed_bench(db, user, load_kg=100, reps=5)
    result = recompute_for_user(db, user.id)
    for g in MVP_GROUPS:
        assert result[g]["rank"] == "Copper"


def test_bench_ratio_maps_to_expected_tier(db):
    """A ~1.17x bodyweight bench e1RM should land in Gold."""
    user = db.query(User).first()
    user.bodyweight_kg = 80.0
    db.commit()
    _seed_bench(db, user, load_kg=80, reps=5)  # e1rm ≈ 93.3 kg → 1.17x BW
    result = recompute_for_user(db, user.id)
    assert result["chest"]["rank"] == "Gold"
    # Chest has no logging in arms/quads/etc — all Copper.
    for g in ("quads", "hamstrings", "shoulders", "back", "arms"):
        assert result[g]["rank"] == "Copper"


def test_thresholds_match_spec():
    """Guardrail — regressions in the threshold table should fail loudly."""
    assert MUSCLE_RANK_THRESHOLDS["chest"]["thresholds"]["Champion"] == 2.00
    assert MUSCLE_RANK_THRESHOLDS["quads"]["thresholds"]["Champion"] == 3.00
    assert MUSCLE_RANK_THRESHOLDS["hamstrings"]["thresholds"]["Champion"] == 3.25
    assert MUSCLE_RANK_THRESHOLDS["shoulders"]["thresholds"]["Champion"] == 1.25
    assert MUSCLE_RANK_THRESHOLDS["back"]["thresholds"]["Champion"] == 1.50
    assert MUSCLE_RANK_THRESHOLDS["arms"]["thresholds"]["Champion"] == 1.50


def test_weak_lift_maps_below_bronze_to_copper(db):
    """Bench at 0.3x BW should be Copper, not Bronze."""
    user = db.query(User).first()
    user.bodyweight_kg = 100.0
    db.commit()
    _seed_bench(db, user, load_kg=25, reps=5)  # e1rm ≈ 29 kg → 0.29x BW
    result = recompute_for_user(db, user.id)
    assert result["chest"]["rank"] == "Copper"


def test_outlier_ratio_is_rejected(db):
    """A 6x-BW bench must be dropped as a data hygiene outlier."""
    user = db.query(User).first()
    user.bodyweight_kg = 80.0
    db.commit()
    _seed_bench(db, user, load_kg=500, reps=1)  # 6.25x BW — impossible
    result = recompute_for_user(db, user.id)
    assert result["chest"]["rank"] == "Copper"
