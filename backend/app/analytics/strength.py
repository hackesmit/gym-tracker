"""Strength standards comparison – compare user e1RM to population benchmarks."""

from statistics import median

from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session

from ..models import BodyMetric, ExerciseCatalog, ProgramExercise, User, WorkoutLog

# ---------------------------------------------------------------------------
# Strength standards as ratio of bodyweight (males)
# ---------------------------------------------------------------------------
STRENGTH_STANDARDS_MALE: dict[str, dict[str, float]] = {
    "squat": {
        "beginner": 0.75,
        "novice": 1.25,
        "intermediate": 1.50,
        "advanced": 2.00,
        "elite": 2.50,
    },
    "deadlift": {
        "beginner": 1.00,
        "novice": 1.50,
        "intermediate": 1.75,
        "advanced": 2.25,
        "elite": 3.00,
    },
    "bench": {
        "beginner": 0.50,
        "novice": 0.75,
        "intermediate": 1.00,
        "advanced": 1.25,
        "elite": 1.50,
    },
    "ohp": {
        "beginner": 0.35,
        "novice": 0.50,
        "intermediate": 0.65,
        "advanced": 0.85,
        "elite": 1.00,
    },
    "row": {
        "beginner": 0.50,
        "novice": 0.75,
        "intermediate": 1.00,
        "advanced": 1.25,
        "elite": 1.50,
    },
}

STRENGTH_STANDARDS_FEMALE: dict[str, dict[str, float]] = {
    lift: {tier: ratio * 0.65 for tier, ratio in tiers.items()}
    for lift, tiers in STRENGTH_STANDARDS_MALE.items()
}

# ---------------------------------------------------------------------------
# Exercise-to-standard mapping (proxy exercises)
# ---------------------------------------------------------------------------
LIFT_PROXIES: dict[str, list[str]] = {
    "squat": [
        "HACK SQUAT (HEAVY)",
        "MACHINE SQUAT",
        "LEG PRESS (HEAVY)",
        "SMITH MACHINE SQUAT",
    ],
    "deadlift": [
        "ROMANIAN DEADLIFT",
        "DB ROMANIAN DEADLIFT",
    ],
    "bench": [
        "FLAT DB PRESS (HEAVY)",
        "INCLINE DB PRESS",
        "MACHINE CHEST PRESS",
    ],
    "ohp": [
        "SEATED DB SHOULDER PRESS",
        "CABLE SHOULDER PRESS",
        "STANDING DB ARNOLD PRESS",
    ],
    "row": [
        "T-BAR ROW",
        "SEATED CABLE ROW",
        "PENDLAY ROW",
        "HELMS DB ROW",
    ],
}

# Dumbbell exercises require a conversion factor to approximate barbell e1RM.
# per-dumbbell weight * 2 * factor = barbell-equivalent e1RM
DB_TO_BARBELL_FACTOR: float = 0.83

# Exercises that are dumbbell-based (need the DB conversion)
_DB_EXERCISES: set[str] = {
    "FLAT DB PRESS (HEAVY)",
    "INCLINE DB PRESS",
    "SEATED DB SHOULDER PRESS",
    "STANDING DB ARNOLD PRESS",
    "DB ROMANIAN DEADLIFT",
    "HELMS DB ROW",
}

# Machine/cable exercises: e1RM is multiplied by this factor to approximate
# the free-weight barbell equivalent.  Only stability/balance differences —
# the prime movers do similar work, so discounts are small.
#
# Calibrated against: hack squat 260×4 ≈ barbell squat 225×5 → ratio ~0.89
_MACHINE_FACTORS: dict[str, float] = {
    "HACK SQUAT (HEAVY)": 0.89,       # fixed path, no bar balance
    "MACHINE SQUAT": 0.87,             # guided track, less core
    "LEG PRESS (HEAVY)": 0.65,         # very different load angle, people press ~1.5× squat
    "SMITH MACHINE SQUAT": 0.92,       # nearly identical to barbell
    "MACHINE CHEST PRESS": 0.90,       # fixed path, no stabilization
    "CABLE SHOULDER PRESS": 0.85,      # cable resistance curve differs
    "SEATED CABLE ROW": 0.90,          # similar to barbell row effort
}

# Tier → approximate percentile mapping for interpolation
_TIER_PERCENTILES: list[tuple[str, float]] = [
    ("beginner", 20.0),
    ("novice", 40.0),
    ("intermediate", 60.0),
    ("advanced", 80.0),
    ("elite", 95.0),
]

# ---------------------------------------------------------------------------
# DOTS score coefficients (official IPF formula)
# ---------------------------------------------------------------------------
_DOTS_MALE_COEFFS: list[float] = [
    -307.75076, 24.0900756, -0.1918759221, 0.0007391293, -0.000001093,
]
_DOTS_FEMALE_COEFFS: list[float] = [
    -57.96288, 13.6175032, -0.1126655495, 0.0005158568, -0.0000010706,
]

# DOTS classification thresholds (approximate, based on competition data)
_DOTS_CLASSIFICATIONS: list[tuple[str, float]] = [
    ("Elite", 500),
    ("Master", 400),
    ("Class I", 350),
    ("Class II", 300),
    ("Class III", 250),
    ("Untrained", 0),
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def compute_dots_score(total_kg: float, bodyweight_kg: float, is_male: bool = True) -> dict:
    """Compute DOTS score given a powerlifting total and bodyweight.

    DOTS = 500 / (a + b*bw + c*bw^2 + d*bw^3 + e*bw^4) * total
    """
    if bodyweight_kg <= 0 or total_kg <= 0:
        return {"score": 0.0, "classification": "Untrained"}

    coeffs = _DOTS_MALE_COEFFS if is_male else _DOTS_FEMALE_COEFFS
    a, b, c, d, e = coeffs
    bw = bodyweight_kg
    denominator = a + b * bw + c * bw**2 + d * bw**3 + e * bw**4

    if denominator <= 0:
        return {"score": 0.0, "classification": "Untrained"}

    score = round(500.0 / denominator * total_kg, 2)

    # Classify
    classification = "Untrained"
    for label, threshold in _DOTS_CLASSIFICATIONS:
        if score >= threshold:
            classification = label
            break

    return {"score": score, "classification": classification}


def _estimate_e1rm(weight: float, reps: int) -> float:
    """Epley formula: e1RM = weight * (1 + reps / 30)."""
    if reps <= 0:
        return 0.0
    if reps == 1:
        return weight
    return weight * (1 + reps / 30)


def _classify(ratio: float, standards: dict[str, float]) -> str:
    """Return the highest tier the ratio meets or exceeds."""
    classification = "below beginner"
    for tier in ("beginner", "novice", "intermediate", "advanced", "elite"):
        if ratio >= standards[tier]:
            classification = tier
        else:
            break
    return classification


def _estimate_percentile(ratio: float, standards: dict[str, float]) -> float:
    """Linearly interpolate a percentile estimate from the tier thresholds."""
    tiers = _TIER_PERCENTILES
    # Below beginner
    if ratio < standards[tiers[0][0]]:
        # Scale 0-20 linearly from 0 to beginner threshold
        beginner_ratio = standards[tiers[0][0]]
        if beginner_ratio <= 0:
            return 0.0
        return max(0.0, (ratio / beginner_ratio) * tiers[0][1])

    # Walk through tiers
    for i in range(len(tiers) - 1):
        lower_tier, lower_pct = tiers[i]
        upper_tier, upper_pct = tiers[i + 1]
        lower_ratio = standards[lower_tier]
        upper_ratio = standards[upper_tier]
        if ratio < upper_ratio:
            span = upper_ratio - lower_ratio
            if span <= 0:
                return lower_pct
            frac = (ratio - lower_ratio) / span
            return lower_pct + frac * (upper_pct - lower_pct)

    # Above elite
    return min(99.0, tiers[-1][1] + (ratio - standards["elite"]) * 10)


def _is_db_exercise(name: str) -> bool:
    return name in _DB_EXERCISES


def _note_for_exercise(name: str) -> str | None:
    """Return a caveat note for machine/DB proxy exercises."""
    lower = name.lower()
    if name in _MACHINE_FACTORS:
        pct = round(_MACHINE_FACTORS[name] * 100)
        return f"Estimated from machine ({pct}% conversion to barbell)"
    if _is_db_exercise(name):
        return f"DB-to-barbell conversion applied (factor={DB_TO_BARBELL_FACTOR})"
    return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_strength_standards(db: Session, user_id: int = 1) -> dict:
    """Compare user's best lifts to population-based strength standards.

    Steps:
    1. Get user bodyweight and sex.
    2. For each standard lift category, find the best estimated 1RM from proxy
       exercises in the user's workout logs.
    3. For DB exercises, apply the barbell conversion factor.
    4. Calculate ratio = e1RM / bodyweight.
    5. Determine classification tier and estimate percentile.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise ValueError(f"User {user_id} not found")

    bodyweight = user.bodyweight_kg
    if bodyweight is None or bodyweight <= 0:
        # Fall back to the most recent body metric entry
        latest_metric = (
            db.query(BodyMetric)
            .filter(BodyMetric.user_id == user_id)
            .order_by(BodyMetric.date.desc())
            .first()
        )
        if latest_metric:
            bodyweight = latest_metric.bodyweight_kg
    if bodyweight is None or bodyweight <= 0:
        raise ValueError("User bodyweight is not set; cannot compute strength ratios")

    sex = (user.sex or "male").lower()
    standards = STRENGTH_STANDARDS_FEMALE if sex == "female" else STRENGTH_STANDARDS_MALE

    # Build reverse map: canonical exercise name → standard lift category
    exercise_to_category: dict[str, str] = {}
    for category, proxies in LIFT_PROXIES.items():
        for ex in proxies:
            exercise_to_category[ex] = category

    proxy_names = list(exercise_to_category.keys())

    # Query best set (highest e1RM potential) per proxy exercise
    rows = (
        db.query(
            ProgramExercise.exercise_name_canonical,
            WorkoutLog.load_kg,
            WorkoutLog.reps_completed,
        )
        .join(WorkoutLog, WorkoutLog.program_exercise_id == ProgramExercise.id)
        .filter(
            WorkoutLog.user_id == user_id,
            ProgramExercise.exercise_name_canonical.in_(proxy_names),
        )
        .all()
    )

    # Compute best e1RM per category
    best_per_category: dict[str, tuple[float, str]] = {}  # category → (e1rm, exercise)
    for exercise_name, load_kg, reps in rows:
        if load_kg is None or reps is None or load_kg <= 0:
            continue
        e1rm = _estimate_e1rm(load_kg, reps)
        if _is_db_exercise(exercise_name):
            e1rm = load_kg * 2 * DB_TO_BARBELL_FACTOR * (1 + reps / 30) if reps > 1 else load_kg * 2 * DB_TO_BARBELL_FACTOR
        elif exercise_name in _MACHINE_FACTORS:
            e1rm *= _MACHINE_FACTORS[exercise_name]
        category = exercise_to_category.get(exercise_name)
        if category is None:
            continue
        current_best, _ = best_per_category.get(category, (0.0, ""))
        if e1rm > current_best:
            best_per_category[category] = (e1rm, exercise_name)

    # Merge manual 1RM entries (use as floor — logged data overrides if higher)
    manual_1rm = user.manual_1rm or {}
    for category, value in manual_1rm.items():
        if value is None or value <= 0:
            continue
        current_best, _ = best_per_category.get(category, (0.0, ""))
        if value > current_best:
            best_per_category[category] = (value, "manual entry")

    lifts: dict[str, dict] = {}
    classifications: list[str] = []

    tier_order = ["below beginner", "beginner", "novice", "intermediate", "advanced", "elite"]

    for category in LIFT_PROXIES:
        if category in best_per_category:
            e1rm, proxy_exercise = best_per_category[category]
            ratio = e1rm / bodyweight
            classification = _classify(ratio, standards[category])
            percentile = _estimate_percentile(ratio, standards[category])
            lifts[category] = {
                "best_e1rm": round(e1rm, 1),
                "ratio": round(ratio, 2),
                "classification": classification,
                "percentile_estimate": round(percentile),
                "proxy_exercise": proxy_exercise,
                "note": _note_for_exercise(proxy_exercise),
            }
            classifications.append(classification)
        else:
            lifts[category] = {
                "best_e1rm": None,
                "ratio": None,
                "classification": None,
                "percentile_estimate": None,
                "proxy_exercise": None,
                "note": "No logged sets found for proxy exercises",
            }

    # Overall classification = median tier
    if classifications:
        indices = [tier_order.index(c) for c in classifications if c in tier_order]
        median_idx = int(median(indices))
        overall = tier_order[median_idx]
    else:
        overall = None

    # Compute DOTS score from estimated powerlifting total (squat + bench + deadlift)
    dots_result = None
    pl_lifts = ["squat", "bench", "deadlift"]
    pl_e1rms = {lift: best_per_category[lift][0] for lift in pl_lifts if lift in best_per_category}
    if len(pl_e1rms) >= 2:
        # If all three available use them; if only two, still compute a partial estimate
        total_kg = sum(pl_e1rms.values())
        is_male = sex != "female"
        dots_result = compute_dots_score(total_kg, bodyweight, is_male=is_male)
        dots_result["total_kg"] = round(total_kg, 1)
        dots_result["lifts_included"] = list(pl_e1rms.keys())
        if len(pl_e1rms) < 3:
            missing = [l for l in pl_lifts if l not in pl_e1rms]
            dots_result["note"] = f"Partial total — missing: {', '.join(missing)}"

    return {
        "bodyweight_kg": bodyweight,
        "sex": sex,
        "lifts": lifts,
        "overall_classification": overall,
        "dots": dots_result,
    }
