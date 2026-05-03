"""Fixed-threshold rank engine tests."""

import pytest
from datetime import date, timedelta

from app.models import ExerciseCatalog, Program, ProgramExercise, User, WorkoutLog
from app.muscle_rank_config import (
    CHAMPION_POINTS,
    MAX_ADDED_RATIO_FOR_BACK_ARMS,
    MUSCLE_RANK_THRESHOLDS,
    RANK_ORDER,
    SIZE_BONUS_REFERENCE_KG,
    SUBDIVISION_COUNT,
    continuous_score,
    rank_score,
    size_bonus,
    subdivided_rank,
    subdivision_label,
)
from app.rank_engine import MVP_GROUPS, aggregate_elo, recompute_for_user


# ---------------------------------------------------------------------------
# GET /api/ranks/standards — reference endpoint
# ---------------------------------------------------------------------------

def test_standards_returns_all_mvp_groups(db, client):
    """GET /api/ranks/standards returns all 8 MVP groups with metric + thresholds."""
    response = client.get("/api/ranks/standards")
    assert response.status_code == 200
    body = response.json()
    group_keys = {g["key"] for g in body["groups"]}
    assert group_keys == set(MVP_GROUPS)
    for g in body["groups"]:
        assert g.get("label")
        assert g.get("metric")
        assert isinstance(g.get("qualifying_exercises"), list)
        assert isinstance(g.get("thresholds"), dict)


def test_standards_tier_order_matches_rank_order(db, client):
    """Tiers are returned in ascending Copper→Champion order with subdivision count."""
    body = client.get("/api/ranks/standards").json()
    assert body["tiers"] == RANK_ORDER
    assert body["subdivisions_per_tier"] == SUBDIVISION_COUNT


def test_standards_chest_thresholds_match_config(db, client):
    """Chest thresholds in the payload match the config file byte-for-byte."""
    body = client.get("/api/ranks/standards").json()
    chest = next(g for g in body["groups"] if g["key"] == "chest")
    assert chest["thresholds"] == MUSCLE_RANK_THRESHOLDS["chest"]["thresholds"]


@pytest.mark.xfail(reason="Biceps/triceps qualifying_exercises populated in Task 9 (routers/ranks.py wiring)", strict=True)
def test_standards_back_biceps_triceps_have_qualifying_exercises(db, client):
    """Back, biceps, triceps pull their qualifying exercises from pathway-specific catalogs."""
    body = client.get("/api/ranks/standards").json()
    back = next(g for g in body["groups"] if g["key"] == "back")
    biceps = next(g for g in body["groups"] if g["key"] == "biceps")
    triceps = next(g for g in body["groups"] if g["key"] == "triceps")
    assert len(back["qualifying_exercises"]) >= 5
    assert len(biceps["qualifying_exercises"]) >= 5
    assert len(triceps["qualifying_exercises"]) >= 5
    assert any("PULLUP" in e or "PULL-UP" in e or "PULL UP" in e for e in back["qualifying_exercises"])
    assert any("CURL" in e for e in biceps["qualifying_exercises"])
    assert any("DIP" in e for e in triceps["qualifying_exercises"])


@pytest.mark.xfail(reason="Biceps/triceps qualifying_exercises populated in Task 9 (routers/ranks.py wiring)", strict=True)
def test_standards_biceps_triceps_include_isolation_pools(db, client):
    """Biceps and triceps qualifying exercises include their respective isolation pools."""
    body = client.get("/api/ranks/standards").json()
    biceps = next(g for g in body["groups"] if g["key"] == "biceps")
    triceps = next(g for g in body["groups"] if g["key"] == "triceps")
    assert any("CURL" in e for e in biceps["qualifying_exercises"])
    assert any(
        "PRESSDOWN" in e or "TRICEPS EXTENSION" in e or "TRICEP EXTENSION" in e or "KICKBACK" in e
        for e in triceps["qualifying_exercises"]
    )


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
    """A ~1.17x bodyweight bench e1RM should land chest in Gold.

    Bench feeds chest directly. Quads/hams/shoulders/back/biceps/abs all
    stay Copper — none of them consume chest. Triceps coverage is asserted
    separately in test_bench_lifts_triceps_via_press_anchor (xfail until
    Task 6 wires the press-anchor pathway).
    """
    user = db.query(User).first()
    user.bodyweight_kg = 80.0
    db.commit()
    _seed_bench(db, user, load_kg=80, reps=5)  # e1rm ≈ 93.3 kg → 1.17x BW
    result = recompute_for_user(db, user.id)
    assert result["chest"]["rank"] == "Gold"
    for g in ("quads", "hamstrings", "shoulders", "back", "biceps", "abs"):
        assert result[g]["rank"] == "Copper"


def test_bench_lifts_triceps_via_press_anchor(db):
    """Bench feeds triceps via the press anchor at the same ELO as chest.

    Under the Task 6 split, chest_elo is fed directly into triceps as
    press_elo (no halving — arms is no longer a single blended group).
    A Gold chest gives a Gold triceps result.
    """
    user = db.query(User).first()
    user.bodyweight_kg = 80.0
    db.commit()
    _seed_bench(db, user, load_kg=80, reps=5)
    result = recompute_for_user(db, user.id)
    # chest ratio ~1.17x → Gold; triceps inherits the same press ELO → Gold
    assert result["triceps"]["rank"] == "Gold"
    assert result["triceps"]["elo"] > 0


def test_thresholds_match_spec():
    """Guardrail — regressions in the threshold table should fail loudly."""
    assert MUSCLE_RANK_THRESHOLDS["chest"]["thresholds"]["Champion"] == 2.00
    assert MUSCLE_RANK_THRESHOLDS["quads"]["thresholds"]["Champion"] == 3.00
    assert MUSCLE_RANK_THRESHOLDS["hamstrings"]["thresholds"]["Champion"] == 3.25
    assert MUSCLE_RANK_THRESHOLDS["shoulders"]["thresholds"]["Champion"] == 1.25
    # 2026-05-02: back tightened from 1.50 to 1.20 to match published Elite +1.08 BW
    assert MUSCLE_RANK_THRESHOLDS["back"]["thresholds"]["Champion"] == 1.20
    assert MUSCLE_RANK_THRESHOLDS["back"]["thresholds"]["Diamond"] == 1.00
    # Biceps display table = pullup-added scale tightened to match back
    assert MUSCLE_RANK_THRESHOLDS["biceps"]["thresholds"]["Champion"] == 1.20
    # Triceps display table = original arms scale (weighted-dip-added)
    assert MUSCLE_RANK_THRESHOLDS["triceps"]["thresholds"]["Champion"] == 1.50
    # Abs display table = weighted crunch e1RM/BW (research-calibrated)
    assert MUSCLE_RANK_THRESHOLDS["abs"]["thresholds"]["Champion"] == 2.20


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

def _seed_exercise(
    db, user, canonical: str, muscle: str, load_kg: float, reps: int,
    day_offset: int = 1, added_load_kg: float | None = None,
):
    """Seed one program + workout log for an arbitrary canonical exercise.

    `added_load_kg` mirrors WorkoutLog.added_load_kg — set it for weighted-
    calisthenic exercises (weighted pullups, weighted dips) so the rank
    engine reads the plate-only load rather than falling back to
    `load_kg - bodyweight` (which can go negative when load_kg < BW).
    """
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
        load_kg=load_kg, reps_completed=reps, added_load_kg=added_load_kg,
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


def test_dip_only_lifts_triceps_off_copper(db):
    """Weighted dip alone (the canonical triceps anchor) lifts triceps off
    Copper; biceps stays Copper since no pull/curl work was seeded.

    `added_load_kg=40` is set so the engine reads the plate load directly —
    without it the fallback `load_kg - bw` goes negative and the dip is
    mis-classified as bodyweight-only.
    """
    user = db.query(User).first()
    user.bodyweight_kg = 80.0
    db.commit()
    _seed_exercise(db, user, "WEIGHTED DIP", "triceps", load_kg=120, reps=1,
                   day_offset=2, added_load_kg=40)
    result = recompute_for_user(db, user.id)
    assert result["triceps"]["rank"] in ("Bronze", "Silver", "Gold")
    assert result["triceps"]["elo"] > 500
    assert result["biceps"]["rank"] == "Copper"


def test_skull_crusher_ranks_triceps(db):
    """EZ-bar skull crusher 50 kg → direct_tricep pathway at Silver.

    Under the post-2026-05-02 split, direct tricep isolation feeds the
    triceps group directly. The skull crusher at Silver tier should lift
    triceps off Copper. Biceps is unaffected by tricep isolation work.
    """
    user = db.query(User).first()
    user.bodyweight_kg = 80.0
    db.commit()
    _seed_exercise(db, user, "EZ BAR SKULL CRUSHER", "triceps", load_kg=50, reps=1)
    result = recompute_for_user(db, user.id)
    assert result["triceps"]["rank"] in ("Bronze", "Silver")
    assert result["triceps"]["elo"] > 500
    assert result["biceps"]["rank"] == "Copper"   # no biceps work seeded


def test_isolation_curl_contributes_to_biceps(db):
    """2026-05-02: Under the split, curls feed the biceps group directly.

    A solid DB curl alone (25 kg/hand × 5 reps → e1rm 29.2 × spec 1.60 /
    BW 80 ≈ 0.584 — Silver tier on CURL_THRESHOLDS) should lift biceps off
    Copper. Triceps is unaffected by curl work.
    """
    user = db.query(User).first()
    user.bodyweight_kg = 80.0
    db.commit()
    _seed_exercise(db, user, "DB BICEP CURL", "biceps", load_kg=25, reps=5)
    result = recompute_for_user(db, user.id)
    assert result["biceps"]["rank"] in ("Bronze", "Silver")
    assert result["biceps"]["elo"] > 500
    assert result["triceps"]["rank"] == "Copper"   # no triceps work seeded


def test_pure_press_ranks_triceps_via_press_transfer(db):
    """OHP-only lifter gets triceps credit via the press anchor pathway."""
    user = db.query(User).first()
    user.bodyweight_kg = 80.0
    db.commit()
    _seed_exercise(db, user, "OVERHEAD PRESS", "shoulders", load_kg=50, reps=1)
    result = recompute_for_user(db, user.id)
    # Shoulder OHP anchor → Silver-ish, triceps picks up press transfer.
    assert result["shoulders"]["rank"] in ("Silver", "Gold")
    assert result["triceps"]["rank"] in ("Bronze", "Silver")
    assert result["triceps"]["elo"] > 500
    assert result["biceps"]["rank"] == "Copper"   # no curl/pullup work seeded


def test_lateral_raise_lifts_shoulders_off_copper(db):
    """Lateral raises alone (no pressing) should now register on shoulders."""
    user = db.query(User).first()
    user.bodyweight_kg = 80.0
    db.commit()
    # 15 kg per-hand × 5 reps → e1rm 17.5 × spec 1.60 / 80 = 0.35 → Gold V.
    _seed_exercise(db, user, "DB LATERAL RAISE", "shoulders", load_kg=15, reps=5)
    result = recompute_for_user(db, user.id)
    assert result["shoulders"]["rank"] != "Copper"
    assert result["shoulders"]["elo"] > 500


def test_mixed_arms_training_beats_single_pathway(db):
    """Post-split: a lifter with curls + dips + rows + press beats a
    lifter with only dips at the same per-exercise tier.

    `added_load_kg` is set on weighted calisthenic logs so the engine
    reads plate load directly (post-migration semantics).
    """
    # Lifter A: pure dips (40 kg plate, BW=80 → total bar load 120 kg)
    user_a = db.query(User).first()
    user_a.bodyweight_kg = 80.0
    db.commit()
    _seed_exercise(db, user_a, "WEIGHTED DIP", "triceps", load_kg=120, reps=1,
                   day_offset=2, added_load_kg=40)
    result_a = recompute_for_user(db, user_a.id)

    # Lifter B: dips + pull-ups + bench + curls (all similar strength tier)
    user_b = User(
        username="mixed", name="Mixed", password_hash="x",
        bodyweight_kg=80.0,
    )
    db.add(user_b)
    db.commit()
    _seed_exercise(db, user_b, "WEIGHTED DIP", "triceps", load_kg=120, reps=1,
                   day_offset=3, added_load_kg=40)
    _seed_exercise(db, user_b, "WEIGHTED PULLUP", "back", load_kg=120, reps=1,
                   day_offset=4, added_load_kg=40)
    _seed_exercise(db, user_b, "BENCH PRESS", "chest", load_kg=100, reps=1, day_offset=5)
    _seed_exercise(db, user_b, "BARBELL CURL", "biceps", load_kg=50, reps=1, day_offset=6)
    result_b = recompute_for_user(db, user_b.id)
    # Biceps + triceps together should beat triceps-only.
    assert result_b["triceps"]["elo"] >= result_a["triceps"]["elo"]
    assert result_b["biceps"]["elo"] > result_a["biceps"]["elo"]


# ---------------------------------------------------------------------------
# size_bonus + MAX_ADDED_RATIO_FOR_BACK_ARMS
# ---------------------------------------------------------------------------


def test_size_bonus_at_reference_weight_is_one():
    assert size_bonus(SIZE_BONUS_REFERENCE_KG) == 1.0


def test_size_bonus_heavier_lifter_gets_boost():
    assert size_bonus(100) == pytest.approx(1.118, abs=0.005)
    assert size_bonus(120) == pytest.approx(1.225, abs=0.005)


def test_size_bonus_lighter_lifter_gets_reduction():
    assert size_bonus(60) == pytest.approx(0.866, abs=0.005)
    assert size_bonus(50) == pytest.approx(0.791, abs=0.005)


def test_size_bonus_handles_invalid_input():
    # Non-positive bw collapses to a 1 kg floor — no division-by-zero.
    assert size_bonus(0) > 0
    assert size_bonus(-10) > 0


def test_max_added_ratio_for_back_arms_is_capped_at_2():
    assert MAX_ADDED_RATIO_FOR_BACK_ARMS == 2.0


# ---------------------------------------------------------------------------
# rank_engine reads added_load_kg + applies size_bonus + guard
# ---------------------------------------------------------------------------

from datetime import date as _date_module_date

from app.models import Program, ProgramExercise, WorkoutLog
from app.rank_engine import recompute_for_user
from app.seed_catalog import seed_exercise_catalog, backfill_catalog_bodyweight_kind


def _setup_pullup_log(db, user, *, load_kg, added_load_kg, reps=5):
    program = Program(user_id=user.id, name="X", frequency=3, start_date=_date_module_date.today())
    db.add(program); db.flush()
    pe = ProgramExercise(
        program_id=program.id, week=1, session_name="A", session_order_in_week=1,
        exercise_order=1, exercise_name_raw="WEIGHTED PULLUP",
        exercise_name_canonical="WEIGHTED PULLUP",
        prescribed_reps="5", working_sets=3,
    )
    db.add(pe); db.flush()
    log = WorkoutLog(
        user_id=user.id, program_exercise_id=pe.id, date=_date_module_date.today(),
        set_number=1, load_kg=load_kg, reps_completed=reps,
        added_load_kg=added_load_kg,
    )
    db.add(log); db.commit()
    return log


def test_rank_engine_reads_added_load_kg_directly(db):
    """When added_load_kg is set on the row, engine uses it (not load_kg - bw)."""
    seed_exercise_catalog(db); backfill_catalog_bodyweight_kind(db)
    user = db.query(User).first()
    user.bodyweight_kg = 80.0
    db.commit()
    _setup_pullup_log(db, user, load_kg=105.0, added_load_kg=25.0)

    ranks = recompute_for_user(db, user.id)

    # Ratio = (25/80) * size_bonus(80) = 0.3125 * 1.0 = 0.3125 → Silver tier
    back = ranks["back"]
    assert back["rank"] in {"Silver", "Gold"}, back


def test_rank_engine_drops_implausible_added_load(db):
    """A log with added_load_kg = 3 * BW must be dropped silently (cap = 2.0 ratio)."""
    seed_exercise_catalog(db); backfill_catalog_bodyweight_kind(db)
    user = db.query(User).first()
    user.bodyweight_kg = 80.0
    db.commit()
    _setup_pullup_log(db, user, load_kg=320.0, added_load_kg=240.0, reps=1)

    ranks = recompute_for_user(db, user.id)

    # Should NOT be Champion — guard drops the candidate, falls back to Copper
    assert ranks["back"]["rank"] == "Copper"


def test_size_bonus_helps_heavy_lifter(db):
    """Heavy 100kg lifter and light 60kg lifter both add 25kg pullup —
    heavier athlete's ratio is higher than no-bonus baseline; lighter is lower."""
    seed_exercise_catalog(db); backfill_catalog_bodyweight_kind(db)
    heavy = User(name="heavy", username="heavy", password_hash="!", bodyweight_kg=100.0)
    light = User(name="light", username="light", password_hash="!", bodyweight_kg=60.0)
    db.add_all([heavy, light])
    db.commit()
    # Use reps=1 so Epley e1rm == added_load_kg exactly → clean arithmetic.
    _setup_pullup_log(db, heavy, load_kg=125.0, added_load_kg=25.0, reps=1)
    _setup_pullup_log(db, light, load_kg=85.0, added_load_kg=25.0, reps=1)

    h_ranks = recompute_for_user(db, heavy.id)
    l_ranks = recompute_for_user(db, light.id)

    # Heavy: 25/100 * (100/80)^0.5 = 0.25 * 1.118 = 0.2795
    # Light: 25/60  * (60/80)^0.5  = 0.4167 * 0.866 = 0.361
    # Heavy ratio > 0.25 (no-bonus baseline, i.e. 25/100 with no size_bonus)
    assert h_ranks["back"]["ratio"] > 0.25
    # Light ratio < 0.4167 (no-bonus baseline, i.e. 25/60 with no size_bonus)
    assert l_ranks["back"]["ratio"] < 0.4167


def _setup_bw_pullup_log(db, user, *, reps):
    """Setup a 2-GRIP PULLUP (bodyweight) log with N reps."""
    program = Program(user_id=user.id, name="X", frequency=3, start_date=_date_module_date.today())
    db.add(program); db.flush()
    pe = ProgramExercise(
        program_id=program.id, week=1, session_name="A", session_order_in_week=1,
        exercise_order=1, exercise_name_raw="2-GRIP PULLUP",
        exercise_name_canonical="2-GRIP PULLUP",
        prescribed_reps=str(reps), working_sets=3,
    )
    db.add(pe); db.flush()
    log = WorkoutLog(
        user_id=user.id, program_exercise_id=pe.id, date=_date_module_date.today(),
        set_number=1, load_kg=0.0, reps_completed=reps,
    )
    db.add(log); db.commit()
    return log


def test_rep_fallback_does_not_inflate_to_champion(db):
    """Regression: 8 reps of BW pullup must produce Gold V, not Champion.

    The bug: _best_weighted_calisthenic returned _Result(ratio=8.0, tier=Gold,
    source='logged_reps:...') and recompute_for_user passed 8.0 to
    subdivided_rank against ratio thresholds (Champion floor = 1.5),
    silently shooting the rank to Champion."""
    seed_exercise_catalog(db); backfill_catalog_bodyweight_kind(db)
    user = db.query(User).first()
    user.bodyweight_kg = 90.0
    db.commit()
    _setup_bw_pullup_log(db, user, reps=8)

    ranks = recompute_for_user(db, user.id)
    back = ranks["back"]

    # 8 reps × size_bonus(90) = int(8 × 1.061) = 8 → Gold tier (Gold=7 reps).
    assert back["rank"] == "Gold", (
        f"Expected Gold (8 reps), got {back['rank']} {back['sub_label']} "
        f"(ratio={back['ratio']}, source={back['source']})"
    )
    # ELO must reflect Gold's discrete base, not the inflated Champion=3100.
    assert back["elo"] < 3000, f"Expected ELO < Champion (3000), got {back['elo']}"


def test_rep_fallback_30_reps_legitimately_champion(db):
    """30+ scaled BW pullup reps SHOULD be Champion (rep fallback table)."""
    seed_exercise_catalog(db); backfill_catalog_bodyweight_kind(db)
    user = db.query(User).first()
    user.bodyweight_kg = 80.0     # size_bonus = 1.0
    db.commit()
    _setup_bw_pullup_log(db, user, reps=30)

    ranks = recompute_for_user(db, user.id)
    assert ranks["back"]["rank"] == "Champion"


def test_manual_pullup_1rm_capped_at_added_ratio_2(db):
    """Manual pullup 1RM that would imply ratio > 2.0 must be silently dropped.

    Previously the manual path skipped both size_bonus and the tighter
    MAX_ADDED_RATIO_FOR_BACK_ARMS=2.0 cap; only MAX_RATIO_CAP=5.0 applied.
    Without this guard a single Settings entry could grant Champion."""
    seed_exercise_catalog(db); backfill_catalog_bodyweight_kind(db)
    user = db.query(User).first()
    user.bodyweight_kg = 80.0
    user.manual_1rm = {"pullup": {"value_kg": 200.0, "tested_at": "2026-04-01"}}
    db.commit()
    # No logged back work — manual is the only candidate.

    ranks = recompute_for_user(db, user.id)
    # 200/80 * size_bonus(80) = 2.5 > 2.0 → dropped.
    # No other candidates → Copper.
    assert ranks["back"]["rank"] == "Copper", (
        f"Expected Copper (manual dropped), got {ranks['back']['rank']} "
        f"source={ranks['back']['source']}"
    )


def test_recompute_with_lookback_override_includes_old_logs(db):
    """Migration override: passing lookback_days_override credits historical
    logs older than the standard 90-day window.
    """
    user = db.query(User).first()
    user.bodyweight_kg = 80.0
    db.commit()
    # Seed a bench 200 days ago — outside the default 90-day window.
    _seed_bench(db, user, load_kg=80, reps=5, day_offset=200)

    # Default: should NOT credit the old lift.
    default = recompute_for_user(db, user.id)
    assert default["chest"]["rank"] == "Copper"

    # Override: should credit it.
    override = recompute_for_user(db, user.id, lookback_days_override=9999)
    assert override["chest"]["rank"] == "Gold"

    # Subsequent default-call should drop back to Copper (rank persists in DB
    # but recompute overwrites it on next read).
    default2 = recompute_for_user(db, user.id)
    assert default2["chest"]["rank"] == "Copper"


def test_abs_weighted_crunch_populates_abs_rank(db):
    """A ~Gold-tier cable crunch (1.0× BW e1RM) lands abs at Gold."""
    user = db.query(User).first()
    user.bodyweight_kg = 80.0
    db.commit()
    # 80 kg @ 1 rep = 1.0× BW e1RM = Gold floor on ABS_WEIGHTED_THRESHOLDS.
    _seed_exercise(db, user, "CABLE CRUNCH", "abs", load_kg=80, reps=1)
    result = recompute_for_user(db, user.id)
    assert result["abs"]["rank"] == "Gold"


def test_abs_rep_fallback_uses_hanging_leg_raise(db):
    """Hanging leg raises with 0 load fall back to rep-count tiers."""
    user = db.query(User).first()
    user.bodyweight_kg = 80.0
    db.commit()
    # 18 strict reps = Gold floor on ABS_FALLBACK_REPS.
    _seed_exercise(db, user, "HANGING LEG RAISE", "abs", load_kg=0, reps=18)
    result = recompute_for_user(db, user.id)
    assert result["abs"]["rank"] in ("Gold", "Platinum")  # size_bonus may bump


def test_abs_size_bonus_applies_to_rep_fallback(db):
    """A heavier athlete's reps count more (size_bonus = (BW/80)^0.5)."""
    light = db.query(User).first()
    light.bodyweight_kg = 60.0
    db.commit()
    _seed_exercise(db, light, "HANGING LEG RAISE", "abs", load_kg=0, reps=18)
    light_result = recompute_for_user(db, light.id)

    # New user @ 100 kg with same reps — should rank ≥ light user.
    heavy = User(name="heavy_test", username="heavy_test", password_hash="x", bodyweight_kg=100.0)
    db.add(heavy)
    db.commit()
    _seed_exercise(db, heavy, "HANGING LEG RAISE", "abs", load_kg=0, reps=18, day_offset=2)
    heavy_result = recompute_for_user(db, heavy.id)

    light_score = rank_score(light_result["abs"]["rank"], light_result["abs"]["sub_index"])
    heavy_score = rank_score(heavy_result["abs"]["rank"], heavy_result["abs"]["sub_index"])
    assert heavy_score >= light_score


# ---------------------------------------------------------------------------
# Task 7: hamstrings hybrid (deadlift + leg curl + hyperext proxy)
# ---------------------------------------------------------------------------

def test_hamstring_leg_curl_populates_hamstring_rank(db):
    """A Gold-tier seated leg curl (1.0× BW e1RM) without any deadlift work
    moves hamstrings off Copper. This is the user-reported bug fix.
    """
    user = User(username="ham_test", password_hash="x", name="ham_test", bodyweight_kg=80.0)
    db.add(user)
    db.commit()
    # 80 kg @ 1 rep = 1.0× BW = Gold V on LEG_CURL_THRESHOLDS (ELO 1500)
    _seed_exercise(db, user, "SEATED LEG CURL", "hamstrings", load_kg=80, reps=1)
    result = recompute_for_user(db, user.id)
    # Anchor ELO = 0; iso ELO = 1500; clipped to 1500 (under 2500 cap).
    # Renormalized via _weighted_avg_present: only iso pathway has weight → blended_elo = 1500
    # → Gold V hamstrings.
    assert result["hamstrings"]["rank"] in ("Silver", "Gold")
    assert result["hamstrings"]["elo"] > 500


def test_pure_hamstring_isolation_cannot_reach_champion(db):
    """A Champion-grade leg curl with no deadlift work caps at Diamond V."""
    user = User(username="ham_iso_max", password_hash="x", name="ham_iso_max", bodyweight_kg=80.0)
    db.add(user)
    db.commit()
    # 152 kg @ 1 rep = 1.90× BW = Champion floor on LEG_CURL_THRESHOLDS
    _seed_exercise(db, user, "SEATED LEG CURL", "hamstrings", load_kg=152, reps=1)
    result = recompute_for_user(db, user.id)
    # iso ELO would be CHAMPION_POINTS=3100, capped to MAX_ISOLATION_ONLY_ELO=2500 → Diamond V.
    assert result["hamstrings"]["rank"] == "Diamond"


def test_deadlift_plus_leg_curl_blends_in_elo_space(db):
    """A Gold deadlift + Gold leg curl should land at Gold or above hamstrings,
    confirming the blend math (0.8 × Gold_DL + 0.2 × Gold_LC = ~Gold)."""
    user = User(username="ham_combo", password_hash="x", name="ham_combo", bodyweight_kg=80.0)
    db.add(user)
    db.commit()
    # Gold floor for hamstrings anchor = 2.0× BW deadlift = 160 kg
    _seed_exercise(db, user, "DEADLIFT", "hamstrings", load_kg=160, reps=1, day_offset=1)
    # Gold floor for leg curl = 1.0× BW = 80 kg
    _seed_exercise(db, user, "SEATED LEG CURL", "hamstrings", load_kg=80, reps=1, day_offset=2)
    result = recompute_for_user(db, user.id)
    assert result["hamstrings"]["rank"] in ("Gold", "Platinum")


def test_hyperextension_compound_proxy_feeds_hamstring_rank(db):
    """A 45-DEGREE BACK EXTENSION at moderate load (compound_proxy spec 0.40)
    contributes to hamstrings via the leg curl threshold table.
    """
    user = User(username="ham_proxy", password_hash="x", name="ham_proxy", bodyweight_kg=80.0)
    db.add(user)
    db.commit()
    # 100 kg @ 1 rep × 0.40 spec / 80 BW = 0.50 ratio → Silver V on LEG_CURL_THRESHOLDS.
    _seed_exercise(db, user, "45-DEGREE BACK EXTENSION", "hamstrings", load_kg=100, reps=1)
    result = recompute_for_user(db, user.id)
    # Iso pathway via compound proxy yields Silver-ish, blended with no anchor = Silver-ish hamstrings.
    assert result["hamstrings"]["rank"] in ("Bronze", "Silver", "Gold")
    assert result["hamstrings"]["elo"] > 500


# ---------------------------------------------------------------------------
# Task 8: quads + chest hybrids (leg extension / cable fly)
# ---------------------------------------------------------------------------

def test_quad_leg_extension_populates_quad_rank(db):
    """A Gold-tier leg extension (1.25× BW) without squats moves quads off Copper."""
    user = User(username="quad_iso", password_hash="x", name="quad_iso", bodyweight_kg=80.0)
    db.add(user)
    db.commit()
    # 100 kg @ 1 rep = 1.25× BW = Gold V on LEG_EXTENSION_THRESHOLDS.
    _seed_exercise(db, user, "LEG EXTENSION", "quads", load_kg=100, reps=1)
    result = recompute_for_user(db, user.id)
    assert result["quads"]["rank"] in ("Silver", "Gold")
    assert result["quads"]["elo"] > 500


def test_chest_fly_populates_chest_rank(db):
    """A Gold-tier cable fly (0.50× BW) without bench moves chest off Copper."""
    user = User(username="chest_iso", password_hash="x", name="chest_iso", bodyweight_kg=80.0)
    db.add(user)
    db.commit()
    # 40 kg @ 1 rep = 0.50× BW = Gold V on CHEST_FLY_THRESHOLDS.
    _seed_exercise(db, user, "CABLE CHEST FLY", "chest", load_kg=40, reps=1)
    result = recompute_for_user(db, user.id)
    assert result["chest"]["rank"] in ("Silver", "Gold")
    assert result["chest"]["elo"] > 500


def test_pure_isolation_caps_at_diamond_for_quads_and_chest(db):
    """Champion-grade isolation alone caps at Diamond for both quads and chest."""
    user_q = User(username="quad_max_iso", password_hash="x", name="quad_max_iso", bodyweight_kg=80.0)
    db.add(user_q)
    db.commit()
    # 192 kg leg extension @ 1 rep = 2.40× BW = Champion floor on LEG_EXTENSION_THRESHOLDS.
    _seed_exercise(db, user_q, "LEG EXTENSION", "quads", load_kg=192, reps=1)
    result_q = recompute_for_user(db, user_q.id)
    assert result_q["quads"]["rank"] == "Diamond"

    user_c = User(username="chest_max_iso", password_hash="x", name="chest_max_iso", bodyweight_kg=80.0)
    db.add(user_c)
    db.commit()
    # 104 kg cable fly @ 1 rep = 1.30× BW = Champion floor on CHEST_FLY_THRESHOLDS.
    _seed_exercise(db, user_c, "CABLE CHEST FLY", "chest", load_kg=104, reps=1)
    result_c = recompute_for_user(db, user_c.id)
    assert result_c["chest"]["rank"] == "Diamond"


def test_db_chest_fly_uses_per_hand_times_two_convention(db):
    """DB CHEST FLY spec is 2.00 (per-hand × 2 convention). 25 kg per-hand
    should produce ratio = 25 × 2.00 / 80 = 0.625 → Gold V on CHEST_FLY_THRESHOLDS.
    """
    user = User(username="db_fly_test", password_hash="x", name="db_fly_test", bodyweight_kg=80.0)
    db.add(user)
    db.commit()
    _seed_exercise(db, user, "DB CHEST FLY", "chest", load_kg=25, reps=1)
    result = recompute_for_user(db, user.id)
    # Iso ELO at 0.625 lands above Gold V floor (0.50) → Gold tier.
    assert result["chest"]["rank"] in ("Silver", "Gold")
