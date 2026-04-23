"""Fixed global muscle-group rank thresholds.

Ranks are based on deterministic strength-per-bodyweight anchors and are
directly comparable across users. Do NOT introduce percentile ranking or
self-normalisation here — the point of this module is that Champion is a
real, earned tier, not the top of the current user population.

All threshold logic lives in THIS file. Callers must not inline their own
tier mappings; they must go through `rank_from_threshold`,
`rank_from_reps`, `subdivided_rank`, `rank_score`, `continuous_score`, or
the `MUSCLE_RANK_THRESHOLDS` table.

2026-04-22 rewrite: dropped the `Emerald` intermediate tier to match the
external 7-tier badge system. Each tier is now subdivided into 5 equal
intervals (V → I) between its floor and the next tier's floor. Champion
is a single elite rank (no subdivisions).
"""

from __future__ import annotations

# MVP muscle groups ranked by the engine. Other groups (glutes, calves,
# abs, forearms, traps) are reported in analytics but are not currently
# assigned a rank.
MVP_GROUPS = ["chest", "back", "shoulders", "quads", "hamstrings", "arms"]

# Tier order, ascending. Copper is the implicit floor for any user that
# lacks sufficient valid data to earn Bronze.
RANK_ORDER = [
    "Copper",
    "Bronze",
    "Silver",
    "Gold",
    "Platinum",
    "Diamond",
    "Champion",
]

# Subdivisions inside each non-Champion tier. Order is V (weakest) → I
# (strongest). `sub_index` is the 0-based index within the tier, so
# Copper V = (Copper, 0) and Diamond I = (Diamond, 4). Champion is always
# (Champion, 0) — it is a single undivided elite rank.
SUBDIVISIONS = ["V", "IV", "III", "II", "I"]
SUBDIVISION_COUNT = 5

# Per-group rank thresholds.  Each tier value is the MINIMUM metric value
# required to earn that tier.  Anything below the Bronze cutoff collapses
# to Copper.
MUSCLE_RANK_THRESHOLDS: dict[str, dict] = {
    "chest": {
        "metric": "bench_press_1rm_over_bodyweight",
        "thresholds": {
            "Bronze":   0.50,
            "Silver":   0.75,
            "Gold":     1.00,
            "Platinum": 1.25,
            "Diamond":  1.75,
            "Champion": 2.00,
        },
    },
    "quads": {
        "metric": "back_squat_1rm_over_bodyweight",
        "thresholds": {
            "Bronze":   0.75,
            "Silver":   1.25,
            "Gold":     1.75,
            "Platinum": 2.00,
            "Diamond":  2.50,
            "Champion": 3.00,
        },
    },
    "hamstrings": {
        "metric": "deadlift_1rm_over_bodyweight",
        "thresholds": {
            "Bronze":   1.00,
            "Silver":   1.50,
            "Gold":     2.00,
            "Platinum": 2.25,
            "Diamond":  2.75,
            "Champion": 3.25,
        },
    },
    "shoulders": {
        "metric": "overhead_press_1rm_over_bodyweight",
        "thresholds": {
            "Bronze":   0.35,
            "Silver":   0.50,
            "Gold":     0.75,
            "Platinum": 0.90,
            "Diamond":  1.10,
            "Champion": 1.25,
        },
    },
    # Back — weighted pullup ADDED-load / bodyweight. Bronze = bodyweight
    # pullup (added = 0 kg). `fallback_reps` is the rep-count ranking for
    # users with only bodyweight pullup logs.
    "back": {
        "metric": "weighted_pullup_added_over_bodyweight",
        "thresholds": {
            "Bronze":   0.00,
            "Silver":   0.25,
            "Gold":     0.50,
            "Platinum": 0.75,
            "Diamond":  1.25,
            "Champion": 1.50,
        },
        "fallback_reps": {
            "Bronze":   1,
            "Silver":   4,
            "Gold":     7,
            "Platinum": 11,
            "Diamond":  21,
            "Champion": 30,
        },
    },
    # Arms — weighted dip ADDED-load / bodyweight.
    "arms": {
        "metric": "weighted_dip_added_over_bodyweight",
        "thresholds": {
            "Bronze":   0.00,
            "Silver":   0.25,
            "Gold":     0.50,
            "Platinum": 0.75,
            "Diamond":  1.25,
            "Champion": 1.50,
        },
    },
}

# Canonical exercise names that qualify for each group's primary metric.
# The value is a specificity multiplier (discounts non-primary variants
# before they contribute to the ratio). Only these exercises are eligible
# — everything else in the catalog is ignored by the rank engine even if
# its muscle_group_primary matches.
EXERCISE_MAP: dict[str, dict[str, float]] = {
    "chest": {
        "BARBELL BENCH PRESS":       1.00,
        "BENCH PRESS":               1.00,
        "FLAT BARBELL BENCH PRESS":  1.00,
        "PAUSED BENCH PRESS":        1.00,
        "CLOSE-GRIP BENCH PRESS":    0.95,
        "INCLINE BARBELL PRESS":     0.90,
        "INCLINE BARBELL BENCH PRESS": 0.90,
    },
    "quads": {
        "BARBELL BACK SQUAT":  1.00,
        "BACK SQUAT":          1.00,
        "PAUSED BACK SQUAT":   1.00,
        "FRONT SQUAT":         0.88,
        "SAFETY BAR SQUAT":    0.95,
    },
    "hamstrings": {
        "CONVENTIONAL DEADLIFT":  1.00,
        "DEADLIFT":               1.00,
        "SUMO DEADLIFT":          1.00,
        "TRAP BAR DEADLIFT":      0.95,
        "PAUSED DEADLIFT":        1.00,
        "ROMANIAN DEADLIFT":      0.85,
    },
    "shoulders": {
        "OVERHEAD PRESS":         1.00,
        "STRICT PRESS":           1.00,
        "BARBELL OVERHEAD PRESS": 1.00,
        "STANDING BARBELL OHP":   1.00,
        "SEATED BARBELL OHP":     1.00,
        "MILITARY PRESS":         1.00,
    },
}

# Back pullup catalogs.
BACK_WEIGHTED_PULLUPS: set[str] = {
    "WEIGHTED PULLUP",
    "WEIGHTED PULL-UP",
    "WEIGHTED PULL UP",
    "WEIGHTED PULLUPS",
    "WEIGHTED CHIN-UP",
    "WEIGHTED CHINUP",
    "WEIGHTED CHIN UP",
}
BACK_BODYWEIGHT_PULLUPS: set[str] = {
    "PULLUP",
    "PULL-UP",
    "PULL UP",
    "2-GRIP PULLUP",
    "CHIN-UP",
    "CHIN UP",
    "CHINUP",
    "NEUTRAL-GRIP PULLUP",
    "NEUTRAL GRIP PULLUP",
}

# Arms dip + close-grip bench catalogs.
ARMS_WEIGHTED_DIPS: set[str] = {
    "WEIGHTED DIP",
    "WEIGHTED DIPS",
    "WEIGHTED DIP (HEAVY)",
    "WEIGHTED DIP (BACK OFF)",
}
ARMS_BODYWEIGHT_DIPS: set[str] = {
    "BODYWEIGHT DIP",
    "BODYWEIGHT DIPS",
    "DIP",
    "DIPS",
    "PARALLEL BAR DIP",
}
ARMS_CLOSE_GRIP_BENCH: set[str] = {
    "CLOSE-GRIP BENCH PRESS",
    "CLOSE GRIP BENCH PRESS",
    "CLOSEGRIP BENCH PRESS",
}

# Manual 1RM keys on `User.manual_1rm` per group. The existing schema uses
# category keys {bench, squat, deadlift, ohp, row}. Pullup/dip are optional
# extensions — treated as ADDED load in kg (same unit as logged weighted
# pullups/dips) if the user enters them.
MANUAL_1RM_KEY: dict[str, str] = {
    "chest":          "bench",
    "quads":          "squat",
    "hamstrings":     "deadlift",
    "shoulders":      "ohp",
    # Back/arms added-load 1RMs (optional manual entry).
    "back_added":     "pullup",
    "arms_added":     "dip",
}

# Hygiene / outlier guards.
LOOKBACK_DAYS       = 90      # best valid lift in last 90 days
MAX_REPS_FOR_E1RM   = 10      # Epley becomes unreliable beyond this
MIN_BODYWEIGHT_KG   = 30.0
MAX_BODYWEIGHT_KG   = 300.0
MAX_RATIO_CAP       = 5.0     # sanity ceiling; suspicious values are dropped

# Continuous ELO point system. Each of the 30 non-Champion subdivisions is
# worth 100 base points, Champion adds a 100-point bonus. Per-muscle ELO
# therefore ranges 0..3100, and the aggregate across MVP_GROUPS is
# 0..18,600.
POINTS_PER_SUBDIVISION = 100
CHAMPION_POINTS        = 3000 + POINTS_PER_SUBDIVISION   # 3100


def rank_from_threshold(value: float, thresholds: dict[str, float]) -> str:
    """Map a numeric `value` to a tier using the fixed threshold dict.

    `thresholds` maps tier → minimum value (ascending). Missing tiers are
    skipped. Values below the lowest defined tier collapse to Copper.
    """
    best = "Copper"
    for tier in RANK_ORDER:
        if tier == "Copper":
            continue
        cutoff = thresholds.get(tier)
        if cutoff is None:
            continue
        if value >= cutoff:
            best = tier
    return best


def rank_from_reps(reps: int, rep_thresholds: dict[str, int]) -> str:
    best = "Copper"
    for tier in RANK_ORDER:
        if tier == "Copper":
            continue
        cutoff = rep_thresholds.get(tier)
        if cutoff is None:
            continue
        if reps >= cutoff:
            best = tier
    return best


def tier_index(tier: str) -> int:
    try:
        return RANK_ORDER.index(tier)
    except ValueError:
        return 0


def max_rank(*tiers: str) -> str:
    """Return the highest tier among `tiers`. Unknown/empty values become Copper."""
    best_idx = -1
    best_name = "Copper"
    for t in tiers:
        if not t:
            continue
        idx = tier_index(t)
        if idx > best_idx:
            best_idx = idx
            best_name = t
    return best_name


def _next_threshold(tier: str, thresholds: dict[str, float]) -> float | None:
    """Return the numeric floor of the tier immediately above `tier`."""
    if tier == "Champion":
        return None
    idx = RANK_ORDER.index(tier)
    for next_tier in RANK_ORDER[idx + 1:]:
        cutoff = thresholds.get(next_tier)
        if cutoff is not None:
            return float(cutoff)
    return None


def subdivided_rank(
    value: float, thresholds: dict[str, float]
) -> tuple[str, int]:
    """Return `(tier, sub_index)` with sub_index in [0, 4].

    Subdivisions partition each tier's numeric range into 5 equal slots.
    V is the bottom slot (just entered the tier), I is the top slot
    (about to promote). Champion is always (Champion, 0).

    Copper has no official "tier floor" — we use 0 as the floor and the
    Bronze cutoff as the ceiling so Copper still subdivides smoothly.
    """
    tier = rank_from_threshold(value, thresholds)
    if tier == "Champion":
        return (tier, 0)

    if tier == "Copper":
        floor = 0.0
        ceiling = thresholds.get("Bronze")
    else:
        floor = float(thresholds.get(tier, 0.0))
        ceiling = _next_threshold(tier, thresholds)

    if ceiling is None or ceiling <= floor:
        return (tier, 0)

    progress = max(0.0, min(1.0, (float(value) - floor) / (ceiling - floor)))
    # Nudge by a tiny epsilon so a value that lands exactly on a subdivision
    # boundary (e.g. 0.85 on a 0.05-step tier) doesn't slip back to the
    # previous slot due to FP rounding. Stays safely inside [0, 4].
    raw = progress * SUBDIVISION_COUNT + 1e-9
    sub_index = int(raw)
    return (tier, max(0, min(SUBDIVISION_COUNT - 1, sub_index)))


def subdivision_label(sub_index: int) -> str:
    """Map 0..4 → V..I. Any other value collapses to V."""
    if 0 <= sub_index < SUBDIVISION_COUNT:
        return SUBDIVISIONS[sub_index]
    return SUBDIVISIONS[0]


def rank_score(tier: str, sub_index: int) -> int:
    """Discrete rank index 1..31 (Copper V = 1 … Diamond I = 30, Champion = 31)."""
    if tier == "Champion":
        return 6 * SUBDIVISION_COUNT + 1   # 31
    ti = tier_index(tier)
    if ti <= 0:
        # Copper
        return max(1, min(SUBDIVISION_COUNT, sub_index + 1))
    # Bronze starts at 6, Silver 11, ..., Diamond 26
    base = ti * SUBDIVISION_COUNT + 1      # 6, 11, 16, 21, 26
    return base + max(0, min(SUBDIVISION_COUNT - 1, sub_index))


def continuous_score(
    value: float, thresholds: dict[str, float]
) -> float:
    """Continuous ELO-style score in [0, CHAMPION_POINTS] (0..3100).

    Equals `(rank_score - 1) * POINTS_PER_SUBDIVISION` plus linear
    progress inside the current subdivision, so the score ticks up
    smoothly as the user's ratio improves — no plateau between promotions.
    """
    tier, sub_index = subdivided_rank(value, thresholds)
    if tier == "Champion":
        return float(CHAMPION_POINTS)

    if tier == "Copper":
        floor = 0.0
        ceiling = thresholds.get("Bronze")
    else:
        floor = float(thresholds.get(tier, 0.0))
        ceiling = _next_threshold(tier, thresholds)
    if ceiling is None or ceiling <= floor:
        return 0.0

    tier_step = (ceiling - floor) / SUBDIVISION_COUNT
    sub_floor = floor + sub_index * tier_step
    within = max(0.0, min(1.0, (float(value) - sub_floor) / tier_step)) if tier_step > 0 else 0.0

    base_points = (rank_score(tier, sub_index) - 1) * POINTS_PER_SUBDIVISION
    return float(base_points + within * POINTS_PER_SUBDIVISION)
