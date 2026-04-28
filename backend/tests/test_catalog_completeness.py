"""Regression test: every exercise name referenced by the muscle rank engine
must exist as a canonical row in the EXERCISE_CATALOG seed list. Otherwise
users can't pick the exercise from the swap modal / custom program builder
even though the rank engine is ready to score it.
"""

from app.muscle_rank_config import (
    EXERCISE_MAP,
    BACK_WEIGHTED_PULLUPS,
    BACK_BODYWEIGHT_PULLUPS,
    ARMS_WEIGHTED_DIPS,
    ARMS_BODYWEIGHT_DIPS,
    ARMS_CLOSE_GRIP_BENCH,
    BACK_ROWS_PULLDOWNS,
)
from app.seed_catalog import EXERCISE_CATALOG


CATALOG_NAMES = {entry["canonical_name"] for entry in EXERCISE_CATALOG}

# Names referenced by the rank engine that we *intentionally* don't catalog
# (e.g. third-party alias forms users may type in but don't pick from a list).
# Add to this set with a comment explaining why before exempting anything.
EXPECTED_MISSING: set[str] = {
    # Pull-up alias variants — the canonical form is "PULLUP" / "WEIGHTED PULLUP".
    "PULL-UP", "PULL UP", "PULLUPS",
    "WEIGHTED PULL-UP", "WEIGHTED PULL UP", "WEIGHTED PULLUPS",
    "WEIGHTED CHIN-UP", "WEIGHTED CHINUP", "WEIGHTED CHIN UP",
    "CHIN-UP", "CHIN UP", "CHINUP",
    "NEUTRAL-GRIP PULLUP", "NEUTRAL GRIP PULLUP",
    # Dip alias variants — canonical is "DIP" / "DIPS" / "WEIGHTED DIP".
    "BODYWEIGHT DIPS", "PARALLEL BAR DIP",
    "WEIGHTED DIPS",
    # Row alias variants
    "DB ROW",
    # "BENT OVER BARBELL ROW" is a non-hyphenated alias of the catalog-seeded
    # "BENT-OVER BARBELL ROW" (same exercise, same spec 0.50 in BACK_ROWS_PULLDOWNS).
    "BENT OVER BARBELL ROW",
    # Close-grip bench aliases
    "CLOSE GRIP BENCH PRESS", "CLOSEGRIP BENCH PRESS",
    # Lat pulldown aliases (catalog has only LAT PULLDOWN, not the variants)
    "NEUTRAL GRIP LAT PULLDOWN", "2-GRIP LAT PULLDOWN",
    "MACHINE PULLDOWN", "1-ARM HALF KNEELING LAT PULLDOWN",
    # Catalog now has SEATED, STANDING, and the generic DB SHOULDER PRESS;
    # MACHINE SHOULDER PRESS is still alias-only.
    "MACHINE SHOULDER PRESS",
    # "FLAT BARBELL BENCH PRESS" is a non-standard alias of "BARBELL BENCH PRESS"
    # (same spec 1.00); the canonical form is already seeded in the catalog.
    "FLAT BARBELL BENCH PRESS",
    # Squat / OHP aliases that are real but already exist as DB equivalents
    # (no exemption — see EXERCISE_MAP keys listed in catalog above)
}


def _all_referenced_names() -> set[str]:
    names: set[str] = set()
    for group, exercises in EXERCISE_MAP.items():
        names.update(exercises.keys())
    names.update(BACK_WEIGHTED_PULLUPS)
    names.update(BACK_BODYWEIGHT_PULLUPS)
    names.update(ARMS_WEIGHTED_DIPS)
    names.update(ARMS_BODYWEIGHT_DIPS)
    names.update(ARMS_CLOSE_GRIP_BENCH)
    names.update(BACK_ROWS_PULLDOWNS.keys())
    return names


def test_every_rank_engine_exercise_is_in_catalog():
    """If the rank engine knows how to score an exercise, the user must be
    able to pick it from the catalog (otherwise the score is unreachable)."""
    referenced = _all_referenced_names()
    missing = referenced - CATALOG_NAMES - EXPECTED_MISSING
    assert not missing, (
        f"Rank engine references exercises that aren't in EXERCISE_CATALOG: "
        f"{sorted(missing)}. Either add them to seed_catalog.py or, if they're "
        f"intentional alias-only lookups, add to EXPECTED_MISSING with a comment."
    )


def test_foundational_barbell_lifts_present():
    """Explicit guard for the foundational barbell lifts — these are what users
    expect to find in the picker."""
    required = [
        "BARBELL BACK SQUAT", "BACK SQUAT", "FRONT SQUAT",
        "BARBELL BENCH PRESS", "BENCH PRESS",
        "CONVENTIONAL DEADLIFT", "DEADLIFT", "SUMO DEADLIFT", "TRAP BAR DEADLIFT",
        "OVERHEAD PRESS", "STRICT PRESS",
        "BARBELL ROW", "BENT-OVER BARBELL ROW",
    ]
    missing = [n for n in required if n not in CATALOG_NAMES]
    assert not missing, f"Foundational barbell lifts missing from catalog: {missing}"
