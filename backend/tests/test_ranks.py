"""Fixed-threshold rank engine tests."""

from datetime import date, timedelta

from app.models import ExerciseCatalog, Program, ProgramExercise, User, WorkoutLog
from app.muscle_rank_config import (
    CHAMPION_POINTS,
    MUSCLE_RANK_THRESHOLDS,
    RANK_ORDER,
    SUBDIVISION_COUNT,
    continuous_score,
    rank_score,
    subdivided_rank,
    subdivision_label,
)
from app.rank_engine import MVP_GROUPS, aggregate_elo, recompute_for_user


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
        assert 0 <= v["sub_index"] < SUBDIVISION_COUNT
        assert v["sub_label"] in ("V", "IV", "III", "II", "I")
        assert 1 <= v["rank_index"] <= 31
        assert 0 <= v["elo"] <= CHAMPION_POINTS


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


def test_rank_ladder_has_no_emerald():
    """2026-04-22: ladder rewrite dropped Emerald to match badge system."""
    assert "Emerald" not in RANK_ORDER
    assert RANK_ORDER == [
        "Copper", "Bronze", "Silver", "Gold", "Platinum", "Diamond", "Champion",
    ]
    for group_cfg in MUSCLE_RANK_THRESHOLDS.values():
        assert "Emerald" not in group_cfg["thresholds"]


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


# ---------------------------------------------------------------------------
# Subdivision + ELO unit tests (pure functions, no DB)
# ---------------------------------------------------------------------------

CHEST_THRESHOLDS = MUSCLE_RANK_THRESHOLDS["chest"]["thresholds"]


def test_subdivisions_split_tier_into_five_equal_steps():
    """Silver spans 0.75..1.00 for chest → 5 slots of 0.05."""
    # Exact subdivision floors
    assert subdivided_rank(0.75, CHEST_THRESHOLDS) == ("Silver", 0)   # Silver V
    assert subdivided_rank(0.80, CHEST_THRESHOLDS) == ("Silver", 1)   # Silver IV
    assert subdivided_rank(0.85, CHEST_THRESHOLDS) == ("Silver", 2)   # Silver III
    assert subdivided_rank(0.90, CHEST_THRESHOLDS) == ("Silver", 3)   # Silver II
    assert subdivided_rank(0.95, CHEST_THRESHOLDS) == ("Silver", 4)   # Silver I
    # Next tier floor promotes out of Silver
    assert subdivided_rank(1.00, CHEST_THRESHOLDS) == ("Gold", 0)


def test_champion_has_no_subdivision():
    assert subdivided_rank(2.00, CHEST_THRESHOLDS) == ("Champion", 0)
    assert subdivided_rank(2.50, CHEST_THRESHOLDS) == ("Champion", 0)


def test_rank_score_spans_1_to_31():
    assert rank_score("Copper", 0) == 1
    assert rank_score("Copper", 4) == 5
    assert rank_score("Bronze", 0) == 6
    assert rank_score("Silver", 2) == 13   # Silver III
    assert rank_score("Gold", 0) == 16
    assert rank_score("Platinum", 4) == 25
    assert rank_score("Diamond", 4) == 30
    assert rank_score("Champion", 0) == 31


def test_subdivision_labels_map_v_to_i():
    assert subdivision_label(0) == "V"
    assert subdivision_label(4) == "I"


def test_continuous_score_is_monotonic_and_bounded():
    """ELO must rise smoothly across the whole chest curve."""
    samples = [0.0, 0.25, 0.5, 0.76, 1.0, 1.25, 1.5, 1.75, 2.0, 3.0]
    scores = [continuous_score(s, CHEST_THRESHOLDS) for s in samples]
    assert all(scores[i] <= scores[i + 1] for i in range(len(scores) - 1))
    assert all(0 <= s <= CHAMPION_POINTS for s in scores)
    # Champion floor gives the max.
    assert continuous_score(3.0, CHEST_THRESHOLDS) == CHAMPION_POINTS


def test_continuous_score_interpolates_within_subdivision():
    """A value midway through Silver III should sit midway through its 100pt band."""
    # Silver III floor = 0.85, Silver II floor = 0.90 → mid = 0.875
    score = continuous_score(0.875, CHEST_THRESHOLDS)
    silver_iii_base = (rank_score("Silver", 2) - 1) * 100   # 1200
    # Half way through the 100-point band.
    assert abs(score - (silver_iii_base + 50)) < 0.5


def test_aggregate_elo_sums_all_muscles(db):
    user = db.query(User).first()
    user.bodyweight_kg = 80.0
    db.commit()
    _seed_bench(db, user, load_kg=80, reps=5)   # chest → Gold
    ranks = recompute_for_user(db, user.id)
    agg = aggregate_elo(ranks)
    assert agg["total"] == round(sum(v["elo"] for v in ranks.values()), 1)
    assert agg["mean"] > 0
    assert agg["max"] == len(MVP_GROUPS) * CHAMPION_POINTS
    assert agg["dominant_tier"] in VALID_RANKS


# ---------------------------------------------------------------------------
# 2026-04-22: coverage expansion — DB / machine / cable / row / pulldown
# variants now contribute to rank. Assert they move users off Copper V.
# ---------------------------------------------------------------------------

def _seed_exercise(db, user, canonical: str, muscle: str, load_kg: float, reps: int, day_offset: int = 1):
    """Seed one program + workout log for an arbitrary canonical exercise."""
    if not db.query(ExerciseCatalog).filter_by(canonical_name=canonical).first():
        db.add(ExerciseCatalog(
            canonical_name=canonical, muscle_group_primary=muscle,
            movement_pattern="compound", equipment="mixed",
            difficulty_level="intermediate",
        ))
    p = Program(user_id=user.id, name=f"p-{canonical}", frequency=3, start_date=date(2026, 1, 1))
    db.add(p)
    db.commit()
    pe = ProgramExercise(
        program_id=p.id, week=1, session_name="X", session_order_in_week=1,
        exercise_order=1, exercise_name_canonical=canonical, exercise_name_raw=canonical,
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


def test_db_bench_lifts_chest_off_copper(db):
    """Heavy DB bench (per-hand × 2 convention) should rank chest."""
    user = db.query(User).first()
    user.bodyweight_kg = 80.0
    db.commit()
    # 30 kg per-hand × 1 rep, spec 1.60 → ratio 0.60 → Bronze
    _seed_exercise(db, user, "FLAT DB PRESS (HEAVY)", "chest", load_kg=30, reps=1)
    result = recompute_for_user(db, user.id)
    assert result["chest"]["rank"] == "Bronze"
    assert result["chest"]["elo"] > 500
    # Ladder sanity: must be on a subdivision within Bronze, not Copper V.
    assert result["chest"]["sub_label"] in ("V", "IV", "III", "II", "I")


def test_machine_chest_press_contributes(db):
    """Selectorized machine press at typical loads reaches Gold."""
    user = db.query(User).first()
    user.bodyweight_kg = 80.0
    db.commit()
    # 150 kg × 1 rep, spec 0.65 → ratio 1.22 → Gold
    _seed_exercise(db, user, "MACHINE CHEST PRESS (HEAVY)", "chest", load_kg=150, reps=1)
    result = recompute_for_user(db, user.id)
    assert result["chest"]["rank"] == "Gold"


def test_leg_press_lifts_quads_off_copper(db):
    """Leg press with strong loads should climb into Bronze+."""
    user = db.query(User).first()
    user.bodyweight_kg = 80.0
    db.commit()
    # 200 kg × 1 rep, spec 0.40 → ratio 1.00 → Silver (quads Silver floor = 1.25)
    # Actually 1.00 is Bronze (floor 0.75). Verify.
    _seed_exercise(db, user, "LEG PRESS", "quads", load_kg=200, reps=1)
    result = recompute_for_user(db, user.id)
    assert result["quads"]["rank"] == "Bronze"


def test_hack_squat_ranks_quads(db):
    """Hack squat spec 0.70 — a 200 kg hack on 80 kg BW = 1.75 → Gold."""
    user = db.query(User).first()
    user.bodyweight_kg = 80.0
    db.commit()
    _seed_exercise(db, user, "HACK SQUAT (HEAVY)", "quads", load_kg=200, reps=1)
    result = recompute_for_user(db, user.id)
    assert result["quads"]["rank"] == "Gold"


def test_db_shoulder_press_ranks_shoulders(db):
    """Seated DB press 25 kg/hand × spec 1.20 / BW 80 → 0.375 → Bronze
    (Silver floor is 0.50, so 25 kg/hand lands mid-Bronze — realistic for
    an intermediate lifter)."""
    user = db.query(User).first()
    user.bodyweight_kg = 80.0
    db.commit()
    _seed_exercise(db, user, "SEATED DB SHOULDER PRESS", "shoulders", load_kg=25, reps=1)
    result = recompute_for_user(db, user.id)
    assert result["shoulders"]["rank"] == "Bronze"
    assert result["shoulders"]["elo"] > 0


def test_stronger_db_shoulder_press_reaches_silver(db):
    """Standing DB press 34 kg/hand × spec 1.30 / BW 80 → 0.55 → Silver."""
    user = db.query(User).first()
    user.bodyweight_kg = 80.0
    db.commit()
    _seed_exercise(db, user, "STANDING DB SHOULDER PRESS", "shoulders", load_kg=34, reps=1)
    result = recompute_for_user(db, user.id)
    assert result["shoulders"]["rank"] == "Silver"


def test_barbell_row_ranks_back(db):
    """BB row at 120 kg × spec 0.50 / BW 80 → 0.75 → Platinum V."""
    user = db.query(User).first()
    user.bodyweight_kg = 80.0
    db.commit()
    _seed_exercise(db, user, "BARBELL ROW", "back", load_kg=120, reps=1)
    result = recompute_for_user(db, user.id)
    assert result["back"]["rank"] == "Platinum"


def test_lat_pulldown_ranks_back(db):
    """Lat pulldown 100 kg × spec 0.35 / BW 80 → 0.4375 → Silver."""
    user = db.query(User).first()
    user.bodyweight_kg = 80.0
    db.commit()
    _seed_exercise(db, user, "LAT PULLDOWN", "back", load_kg=100, reps=1)
    result = recompute_for_user(db, user.id)
    assert result["back"]["rank"] == "Silver"


def test_db_row_ranks_back(db):
    """Single-arm DB row 40 kg × spec 1.00 / BW 80 → 0.50 → Gold V."""
    user = db.query(User).first()
    user.bodyweight_kg = 80.0
    db.commit()
    _seed_exercise(db, user, "SINGLE-ARM DB ROW", "back", load_kg=40, reps=1)
    result = recompute_for_user(db, user.id)
    assert result["back"]["rank"] == "Gold"


def test_skull_crusher_ranks_arms(db):
    """EZ-bar skull crusher 50 kg × spec 0.45 / BW 80 → 0.28 → Silver V."""
    user = db.query(User).first()
    user.bodyweight_kg = 80.0
    db.commit()
    _seed_exercise(db, user, "EZ BAR SKULL CRUSHER", "triceps", load_kg=50, reps=1)
    result = recompute_for_user(db, user.id)
    assert result["arms"]["rank"] == "Silver"


def test_isolation_curl_does_not_rank_arms(db):
    """DB bicep curl is NOT in any map — user should stay Copper V."""
    user = db.query(User).first()
    user.bodyweight_kg = 80.0
    db.commit()
    _seed_exercise(db, user, "DB BICEP CURL", "biceps", load_kg=25, reps=5)
    result = recompute_for_user(db, user.id)
    assert result["arms"]["rank"] == "Copper"
    assert result["arms"]["sub_index"] == 0   # Copper V, no data
