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
    # 2026-04-22: coverage expansion. DB values encode per-hand load
    # convention: spec = 2 × transferability. Machine values reflect
    # reduced stabilization demand — a 150 kg heavy machine press ≈
    # 0.65 × 150 = ~98 kg effective barbell bench equivalent.
    "chest": {
        "BARBELL BENCH PRESS":             1.00,
        "BENCH PRESS":                     1.00,
        "FLAT BARBELL BENCH PRESS":        1.00,
        "PAUSED BENCH PRESS":              1.00,
        "CLOSE-GRIP BENCH PRESS":          0.95,
        "INCLINE BARBELL PRESS":           0.90,
        "INCLINE BARBELL BENCH PRESS":     0.90,
        # Dumbbell variants (per-hand load × 2 × transferability)
        "FLAT DB PRESS (HEAVY)":           1.60,
        "FLAT DB PRESS (GET OFF)":         1.50,
        "INCLINE DB PRESS":                1.45,
        "INCLINE DB CHEST PRESS":          1.45,
        "INCLINE DUMBBELL PRESS":          1.45,
        "SLIGHT INCLINE DB PRESS (HEAVY)": 1.55,
        "SLIGHT INCLINE DB PRESS (BACK OFF)": 1.45,
        # Smith machine (guided barbell — retains bar, some stability loss)
        "SMITH MACHINE CHEST PRESS":       0.85,
        "INCLINE SMITH MACHINE PRESS":     0.80,
        # Selectorized / plate-loaded machine press
        "INCLINE MACHINE PRESS":           0.70,
        "MACHINE CHEST PRESS (HEAVY)":     0.65,
        "MACHINE CHEST PRESS (BACK OFF)":  0.60,
        "MACHINE PRESS":                   0.65,
        "MACHINE PRESS (BACK OFF)":        0.60,
        # Cable press
        "CABLE CHEST PRESS":               0.50,
    },
    "quads": {
        "BARBELL BACK SQUAT":             1.00,
        "BACK SQUAT":                     1.00,
        "PAUSED BACK SQUAT":              1.00,
        "FRONT SQUAT":                    0.88,
        "SAFETY BAR SQUAT":               0.95,
        # Smith-machine squat (guided barbell)
        "SMITH MACHINE SQUAT (HEAVY)":    0.85,
        "SMITH MACHINE SQUAT (BACK OFF)": 0.80,
        "NARROW STANCE SMITH SQUAT":      0.80,
        # Hack / machine squat
        "HACK SQUAT (HEAVY)":             0.70,
        "HACK SQUAT (BACK OFF)":          0.65,
        "CLOSE STANCE HACK SQUAT":        0.70,
        "MACHINE SQUAT (HEAVY)":          0.70,
        "MACHINE SQUAT (BACK OFF)":       0.65,
        # Leg press (high load, limited ROM, sled-supported)
        "LEG PRESS (HEAVY)":              0.40,
        "LEG PRESS":                      0.40,
        "LEG PRESS (BACK OFF)":           0.35,
        "SINGLE-LEG LEG PRESS (HEAVY)":   0.60,
        "SINGLE-LEG LEG PRESS (BACK OFF)": 0.55,
        # Unilateral loaded movements
        "DB BULGARIAN SPLIT SQUAT":       0.60,
        "DB WALKING LUNGE":               0.55,
        "WALKING LUNGES":                 0.45,
        "DB STEP UP":                     0.50,
        "GOBLET SQUAT":                   0.40,
    },
    "hamstrings": {
        "CONVENTIONAL DEADLIFT":  1.00,
        "DEADLIFT":               1.00,
        "SUMO DEADLIFT":          1.00,
        "TRAP BAR DEADLIFT":      0.95,
        "PAUSED DEADLIFT":        1.00,
        "ROMANIAN DEADLIFT":      0.85,
        # DB Romanian deadlift (per-hand × 2 × 0.85)
        "DB ROMANIAN DEADLIFT":   1.70,
    },
    "shoulders": {
        "OVERHEAD PRESS":             1.00,
        "STRICT PRESS":               1.00,
        "BARBELL OVERHEAD PRESS":     1.00,
        "STANDING BARBELL OHP":       1.00,
        "SEATED BARBELL OHP":         1.00,
        "MILITARY PRESS":             1.00,
        # Dumbbell press (per-hand × 2 × transferability)
        "SEATED DB SHOULDER PRESS":   1.20,
        "STANDING DB SHOULDER PRESS": 1.30,
        "DB SHOULDER PRESS":          1.30,
        "STANDING DB ARNOLD PRESS":   1.20,
        # Cable / machine shoulder press
        "CABLE SHOULDER PRESS":       0.50,
        "MACHINE SHOULDER PRESS":     0.65,
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

# 2026-04-22: row / pulldown pathway for the back rank. Ratio contributed =
# (e1rm × spec) / BW, taken against the same tier thresholds as weighted
# pullups. Specificity encodes how much a strong row/pulldown implies a
# strong weighted-pullup — a barbell row at 0.50 lets a 100 kg × BW 80 row
# contribute ratio 0.625 (Gold II), which is realistic: a strong rower is
# not yet a Diamond-tier pullup athlete. DB row values bake in the
# per-hand × 2 convention (spec 1.00 = 2 × 0.50 transferability).
BACK_ROWS_PULLDOWNS: dict[str, float] = {
    # Barbell rows (two-handed, free)
    "BARBELL ROW":                      0.50,
    "BENT-OVER BARBELL ROW":            0.50,
    "BENT OVER BARBELL ROW":            0.50,
    "PENDLAY ROW":                      0.50,
    # T-bar and machine rows
    "T-BAR ROW":                        0.45,
    "MEADOWS ROW":                      0.40,
    "SEATED CABLE ROW":                 0.40,
    # DB rows (per-hand convention)
    "HELMS DB ROW":                     1.00,
    "INCLINE CHEST-SUPPORTED DB ROW":   1.00,
    "SINGLE-ARM DB ROW":                1.00,
    "DB ROW":                           1.00,
    # Lat pulldowns (machine-supported; body-weight-equivalent loads)
    "LAT PULLDOWN":                     0.35,
    "NEUTRAL GRIP LAT PULLDOWN":        0.35,
    "2-GRIP LAT PULLDOWN":              0.35,
    "MACHINE PULLDOWN":                 0.30,
    "1-ARM HALF KNEELING LAT PULLDOWN": 0.50,
}

# 2026-04-22: compound tricep pathway for the arms rank. Skull crushers,
# JM press and DB variants — isolation curls and pushdowns stay excluded
# (a strong pushdown doesn't imply a strong weighted dip). Ratio = spec ×
# e1rm / BW, against the same arms thresholds as weighted dips. Caps out
# around Silver / low Gold from isolation work alone; Diamond / Champion
# still require weighted dips or heavy close-grip bench.
ARMS_TRICEP_COMPOUND: dict[str, float] = {
    "EZ BAR SKULL CRUSHER":   0.45,
    "SKULL CRUSHER":          0.45,
    "DB SKULL CRUSHER":       0.55,
    "DB FRENCH PRESS":        0.40,
    "EZ BAR FRENCH PRESS":    0.35,
    "SMITH MACHINE JM PRESS": 0.55,
}

# 2026-04-23: hybrid arms/shoulders scoring.
#
#   arms      = 0.5 × biceps  + 0.5 × triceps
#   biceps    = 0.7 × back_elo + 0.3 × curl_elo
#   triceps   = 0.7 × max(chest, shoulder-press)_elo + 0.3 × tricep_elo
#   shoulders = 0.7 × shoulder-press_elo + 0.3 × lateral_elo
#
# `tricep_elo` combines the existing weighted-dip / close-grip / heavy
# compound pathway with low-signal isolation (pushdowns, extensions,
# kickbacks) — the max across those against ARMS_THRESHOLDS is used.
# Blend happens in ELO space so each component keeps its own calibrated
# threshold table; ELOs are averaged then reverse-mapped back to a tier.
HYBRID_WEIGHTS: dict[str, dict[str, float]] = {
    "arms": {
        "biceps_pull":    0.35,    # 0.5 × 0.7
        "biceps_curl":    0.15,    # 0.5 × 0.3
        "triceps_press":  0.35,
        "triceps_direct": 0.15,
    },
    "shoulders": {
        "press":   0.70,
        "lateral": 0.30,
    },
}

# Biceps curl isolation pool. DB variants bake in the per-hand × 2 ×
# transferability convention. Cable / machine are heavily discounted —
# stack calibration varies too much to treat them on par with free
# weights.  A pure curler maxes out around Platinum / low Diamond on the
# biceps pathway — top tiers still require pull-up / row strength.
ARMS_CURL_ISOLATION: dict[str, float] = {
    # Barbell-class
    "BARBELL CURL":           1.00,
    "BB CURL":                1.00,
    "STANDING BB CURL":       1.00,
    "EZ BAR CURL":            0.95,
    "REVERSE GRIP EZ BAR CURL": 0.85,
    "EZ BAR PREACHER CURL":   0.90,
    "PREACHER CURL":          0.90,
    "SPIDER CURL":            0.90,     # assumed barbell/EZ
    # Dumbbell-class (per-hand × 2 × transferability)
    "DB BICEP CURL":          1.60,
    "DB CURL":                1.60,
    "DB INCLINE CURL":        1.40,
    "DB SPIDER CURL":         1.40,
    "DB PREACHER CURL":       1.40,
    "HAMMER CURL":            1.60,
    "DB HAMMER CURL":         1.60,
    "ZOTTMAN CURL":           1.40,
    "INVERSE ZOTTMAN CURL":   1.40,
    # Cable (stack calibration varies — heavy discount)
    "BAYESIAN CABLE CURL":    0.50,
    "CABLE EZ CURL":          0.50,
    "CABLE CURL":             0.50,
    # Machine
    "MACHINE CURL":           0.60,
    "MACHINE BICEP CURL":     0.60,
}

CURL_THRESHOLDS: dict[str, float] = {
    "Bronze":   0.30,    # ~24 kg BB curl / 7.5 kg DB per-hand @ 80 kg BW
    "Silver":   0.45,    # ~36 kg BB / 11 kg DB
    "Gold":     0.65,    # ~52 kg BB / 16 kg DB
    "Platinum": 0.85,    # ~68 kg BB / 21 kg DB
    "Diamond":  1.05,    # ~84 kg BB / 26 kg DB
    "Champion": 1.25,    # ~100 kg BB / 31 kg DB (exceptional)
}

# Tricep isolation pool — low-signal lifts that supplement the
# ARMS_TRICEP_COMPOUND pathway. Pushdowns/extensions cap out Platinum on
# their own; dips or heavy skull crushers remain required for Diamond+.
ARMS_TRICEP_ISOLATION: dict[str, float] = {
    "TRICEPS PRESSDOWN":               0.25,
    "TRICEP PRESSDOWN":                0.25,
    "MACHINE TRICEPS EXTENSION":       0.35,
    "OVERHEAD CABLE TRICEPS EXTENSIONS": 0.25,
    "OVERHEAD CABLE TRICEP EXTENSION": 0.25,
    "DB TRICEPS KICKBACK":             0.35,
    "CABLE TRICEPS KICKBACK":          0.20,
}

TRICEP_ISOLATION_THRESHOLDS: dict[str, float] = {
    "Bronze":   0.08,
    "Silver":   0.15,
    "Gold":     0.22,
    "Platinum": 0.30,
    "Diamond":  0.40,
    "Champion": 0.55,
}

# Shoulder lateral-raise isolation. Lateral raises use the DB per-hand ×
# 2 convention — a 20 kg per-hand lateral at 80 kg BW produces ratio 0.4
# (Gold). Cable/machine discounted.
SHOULDERS_LATERAL_ISOLATION: dict[str, float] = {
    "DB LATERAL RAISE":          1.60,
    "STANDING DB LATERAL RAISE": 1.60,
    "SEATED DB LATERAL RAISE":   1.50,
    "CABLE LATERAL RAISE":       0.50,
    "MACHINE LATERAL RAISE":     0.60,
}

LATERAL_THRESHOLDS: dict[str, float] = {
    "Bronze":   0.10,    # ~5 kg per-hand @ 80 kg BW
    "Silver":   0.20,    # ~10 kg per-hand
    "Gold":     0.35,    # ~17.5 kg per-hand
    "Platinum": 0.50,    # ~25 kg per-hand
    "Diamond":  0.65,    # ~32.5 kg per-hand
    "Champion": 0.85,    # ~42.5 kg per-hand (exceptional)
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


def tier_sub_from_elo(elo: float) -> tuple[str, int]:
    """Inverse of `rank_score`: project a continuous ELO onto (tier, sub_index).

    Each non-Champion tier occupies 500 points (5 subs × 100). Champion is
    anything ≥ 3000 (3000–3100 range). Values below 0 collapse to Copper V.
    """
    if elo >= 3000:
        return ("Champion", 0)
    if elo <= 0:
        return ("Copper", 0)
    tier_idx = int(elo // 500)
    if tier_idx >= len(RANK_ORDER) - 1:
        return ("Champion", 0)
    tier = RANK_ORDER[tier_idx]
    within = int((elo - tier_idx * 500) // 100)
    return (tier, max(0, min(SUBDIVISION_COUNT - 1, within)))


def elo_to_ratio(elo: float, thresholds: dict[str, float]) -> float:
    """Reverse-map an ELO back into a ratio for a given threshold table.

    The Profile progress bar computes sub-tier progress from `ratio` vs
    thresholds, so hybrid rankings need a ratio that lands at the same
    sub-tier as the blended ELO. Linear interpolation inside each tier.
    """
    if elo <= 0:
        return 0.0
    tier, sub_index = tier_sub_from_elo(elo)
    if tier == "Champion":
        return float(thresholds.get("Champion", 1.0))
    if tier == "Copper":
        floor = 0.0
        ceiling = thresholds.get("Bronze")
    else:
        floor = float(thresholds.get(tier, 0.0))
        ceiling = _next_threshold(tier, thresholds)
    if ceiling is None or ceiling <= floor:
        return float(floor)
    tier_step = (ceiling - floor) / SUBDIVISION_COUNT
    sub_floor = floor + sub_index * tier_step
    # Elo progress inside the subdivision (0..1)
    within_elo = elo - ((rank_score(tier, sub_index) - 1) * POINTS_PER_SUBDIVISION)
    within_frac = max(0.0, min(1.0, within_elo / POINTS_PER_SUBDIVISION))
    return float(sub_floor + within_frac * tier_step)


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
