"""Strength standards v2 — honest estimation with confidence scoring.

No machine-to-barbell conversions.  Only same-family barbell lifts (and
a handful of clearly-labelled low-confidence proxies) contribute to each
category.  Every result carries a confidence score derived from exercise
specificity, rep range, and recency.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from statistics import median

from sqlalchemy.orm import Session

from ..models import BodyMetric, ProgramExercise, User, WorkoutLog

# ---------------------------------------------------------------------------
# Strength standards as ratio of bodyweight
# ---------------------------------------------------------------------------
STRENGTH_STANDARDS_MALE: dict[str, dict[str, float]] = {
    "squat": {
        "beginner": 0.75, "novice": 1.25, "intermediate": 1.50,
        "advanced": 2.00, "elite": 2.50,
    },
    "deadlift": {
        "beginner": 1.00, "novice": 1.50, "intermediate": 1.75,
        "advanced": 2.25, "elite": 3.00,
    },
    "bench": {
        "beginner": 0.50, "novice": 0.75, "intermediate": 1.00,
        "advanced": 1.25, "elite": 1.50,
    },
    "ohp": {
        "beginner": 0.35, "novice": 0.50, "intermediate": 0.65,
        "advanced": 0.85, "elite": 1.00,
    },
    "row": {
        "beginner": 0.50, "novice": 0.75, "intermediate": 1.00,
        "advanced": 1.25, "elite": 1.50,
    },
}

STRENGTH_STANDARDS_FEMALE: dict[str, dict[str, float]] = {
    lift: {tier: ratio * 0.65 for tier, ratio in tiers.items()}
    for lift, tiers in STRENGTH_STANDARDS_MALE.items()
}

# ---------------------------------------------------------------------------
# Category → qualifying exercises with specificity tiers
# ---------------------------------------------------------------------------
# primary      = 1.0  — the gold-standard barbell lift or identical variant
# close_variant = 0.85 — same movement family, minor variation
# low_confidence = 0.65 — acceptable proxy, clearly not the same lift

SPECIFICITY_SCORES: dict[str, float] = {
    "primary": 1.0,
    "close_variant": 0.85,
    "low_confidence": 0.65,
}

CATEGORY_EXERCISES: dict[str, dict[str, str]] = {
    "squat": {
        "BARBELL BACK SQUAT": "primary",
        "BACK SQUAT": "primary",
        "PAUSED BACK SQUAT": "close_variant",
        "FRONT SQUAT": "close_variant",
        "SAFETY BAR SQUAT": "close_variant",
    },
    "deadlift": {
        "CONVENTIONAL DEADLIFT": "primary",
        "DEADLIFT": "primary",
        "SUMO DEADLIFT": "primary",
        "TRAP BAR DEADLIFT": "close_variant",
        "PAUSED DEADLIFT": "close_variant",
        "ROMANIAN DEADLIFT": "low_confidence",
    },
    "bench": {
        "BARBELL BENCH PRESS": "primary",
        "BENCH PRESS": "primary",
        "FLAT BARBELL BENCH PRESS": "primary",
        "PAUSED BENCH PRESS": "close_variant",
        "CLOSE-GRIP BENCH PRESS": "close_variant",
        "INCLINE BARBELL PRESS": "low_confidence",
        "INCLINE BARBELL BENCH PRESS": "low_confidence",
    },
    "ohp": {
        "OVERHEAD PRESS": "primary",
        "STRICT PRESS": "primary",
        "BARBELL OVERHEAD PRESS": "primary",
        "STANDING BARBELL OHP": "primary",
        "SEATED BARBELL OHP": "close_variant",
        "MILITARY PRESS": "close_variant",
        "SEATED DB SHOULDER PRESS": "low_confidence",
    },
    "row": {
        "BARBELL ROW": "primary",
        "BENT-OVER BARBELL ROW": "primary",
        "PENDLAY ROW": "primary",
        "T-BAR ROW": "close_variant",
        "SEATED CABLE ROW": "low_confidence",
        "INCLINE CHEST-SUPPORTED DB ROW": "low_confidence",
    },
}

CATEGORIES = list(CATEGORY_EXERCISES.keys())

# ---------------------------------------------------------------------------
# Confidence scoring
# ---------------------------------------------------------------------------

@dataclass
class Confidence:
    specificity: float
    rep_range: float
    recency: float

    @property
    def final(self) -> float:
        return round(self.specificity * self.rep_range * self.recency, 4)

    @property
    def label(self) -> str:
        f = self.final
        if f >= 0.8:
            return "high"
        if f >= 0.5:
            return "moderate"
        if f >= 0.3:
            return "low"
        return "very_low"

    def to_dict(self) -> dict:
        return {
            "specificity": self.specificity,
            "rep_range": self.rep_range,
            "recency": self.recency,
            "final": self.final,
            "label": self.label,
        }


def _rep_factor(reps: int) -> float:
    """Confidence factor from rep count.  >10 reps = rejected."""
    if reps <= 0:
        return 0.0
    if reps <= 3:
        return 1.0
    if reps <= 6:
        return 0.9
    if reps <= 8:
        return 0.75
    if reps <= 10:
        return 0.6
    return 0.0  # >10 reps: too inaccurate


def _recency_factor(set_date: date, today: date | None = None) -> float:
    today = today or date.today()
    weeks = (today - set_date).days / 7
    if weeks < 2:
        return 1.0
    if weeks < 4:
        return 0.9
    if weeks < 8:
        return 0.75
    if weeks < 12:
        return 0.6
    return 0.4


# ---------------------------------------------------------------------------
# Candidate scoring
# ---------------------------------------------------------------------------

@dataclass
class Candidate:
    e1rm_kg: float
    source_type: str          # "logged" | "manual"
    source_exercise: str      # canonical name or "manual_1rm"
    confidence: Confidence
    set_date: date | None
    reps: int | None          # None for manual

    @property
    def is_stale(self) -> bool:
        if self.set_date is None:
            return True
        return (date.today() - self.set_date).days > 84  # >12 weeks


def _select_best(
    logged: list[Candidate],
    manual: Candidate | None,
) -> Candidate | None:
    """Pick best score for a single category.

    Manual is first-class — it only loses to logged if logged is BOTH
    newer AND higher confidence.
    """
    valid = [c for c in logged if c.confidence.final > 0]
    best_logged = max(valid, key=lambda c: (c.e1rm_kg, c.confidence.final), default=None)

    if best_logged is None and manual is None:
        return None
    if best_logged is None:
        return manual
    if manual is None:
        return best_logged

    # Both exist — manual wins unless logged is newer AND more confident
    logged_newer = (
        best_logged.set_date is not None
        and (manual.set_date is None or best_logged.set_date > manual.set_date)
    )
    logged_more_confident = best_logged.confidence.final > manual.confidence.final

    if logged_newer and logged_more_confident:
        return best_logged
    return manual


# ---------------------------------------------------------------------------
# Tier / percentile helpers (unchanged from v1)
# ---------------------------------------------------------------------------

_TIER_PERCENTILES: list[tuple[str, float]] = [
    ("beginner", 20.0),
    ("novice", 40.0),
    ("intermediate", 60.0),
    ("advanced", 80.0),
    ("elite", 95.0),
]


def _estimate_e1rm(weight: float, reps: int) -> float:
    """Epley formula: e1RM = weight * (1 + reps / 30)."""
    if reps <= 0:
        return 0.0
    if reps == 1:
        return weight
    return weight * (1 + reps / 30)


def _classify(ratio: float, standards: dict[str, float]) -> str:
    classification = "below beginner"
    for tier in ("beginner", "novice", "intermediate", "advanced", "elite"):
        if ratio >= standards[tier]:
            classification = tier
        else:
            break
    return classification


def _estimate_percentile(ratio: float, standards: dict[str, float]) -> float:
    tiers = _TIER_PERCENTILES
    if ratio < standards[tiers[0][0]]:
        beginner_ratio = standards[tiers[0][0]]
        if beginner_ratio <= 0:
            return 0.0
        return max(0.0, (ratio / beginner_ratio) * tiers[0][1])

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

    return min(99.0, tiers[-1][1] + (ratio - standards["elite"]) * 10)


# ---------------------------------------------------------------------------
# DOTS score (official IPF formula — unchanged)
# ---------------------------------------------------------------------------

_DOTS_MALE_COEFFS = [-307.75076, 24.0900756, -0.1918759221, 0.0007391293, -0.000001093]
_DOTS_FEMALE_COEFFS = [-57.96288, 13.6175032, -0.1126655495, 0.0005158568, -0.0000010706]
_DOTS_CLASSIFICATIONS = [
    ("Elite", 500), ("Master", 400), ("Class I", 350),
    ("Class II", 300), ("Class III", 250), ("Untrained", 0),
]


def compute_dots_score(total_kg: float, bodyweight_kg: float, is_male: bool = True) -> dict:
    if bodyweight_kg <= 0 or total_kg <= 0:
        return {"score": 0.0, "classification": "Untrained"}
    coeffs = _DOTS_MALE_COEFFS if is_male else _DOTS_FEMALE_COEFFS
    a, b, c, d, e = coeffs
    bw = bodyweight_kg
    denom = a + b * bw + c * bw**2 + d * bw**3 + e * bw**4
    if denom <= 0:
        return {"score": 0.0, "classification": "Untrained"}
    score = round(500.0 / denom * total_kg, 2)
    classification = "Untrained"
    for label, threshold in _DOTS_CLASSIFICATIONS:
        if score >= threshold:
            classification = label
            break
    return {"score": score, "classification": classification}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def _resolve_bodyweight(db: Session, user: User) -> float:
    bw = user.bodyweight_kg
    if bw is None or bw <= 0:
        latest = (
            db.query(BodyMetric)
            .filter(BodyMetric.user_id == user.id)
            .order_by(BodyMetric.date.desc())
            .first()
        )
        if latest:
            bw = latest.bodyweight_kg
    if bw is None or bw <= 0:
        raise ValueError("User bodyweight is not set; cannot compute strength ratios")
    return bw


def _parse_manual_entry(entry) -> tuple[float, date | None]:
    """Handle both old format (bare float) and new format ({value_kg, tested_at})."""
    if isinstance(entry, (int, float)):
        return float(entry), None
    if isinstance(entry, dict):
        val = entry.get("value_kg", 0)
        tested_str = entry.get("tested_at")
        tested = date.fromisoformat(tested_str) if tested_str else None
        return float(val), tested
    return 0.0, None


def get_strength_standards(db: Session, user_id: int) -> dict:
    """Compare user lifts to population benchmarks with confidence scoring."""
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise ValueError(f"User {user_id} not found")

    bodyweight = _resolve_bodyweight(db, user)
    sex = (user.sex or "male").lower()
    standards = STRENGTH_STANDARDS_FEMALE if sex == "female" else STRENGTH_STANDARDS_MALE
    today = date.today()

    # Reverse lookup: exercise name → (category, specificity tier)
    exercise_lookup: dict[str, tuple[str, str]] = {}
    for cat, exercises in CATEGORY_EXERCISES.items():
        for ex_name, tier in exercises.items():
            exercise_lookup[ex_name] = (cat, tier)

    qualifying_names = list(exercise_lookup.keys())

    # Query logged sets for qualifying exercises only, reps ≤ 10
    rows = (
        db.query(
            ProgramExercise.exercise_name_canonical,
            WorkoutLog.load_kg,
            WorkoutLog.reps_completed,
            WorkoutLog.date,
        )
        .join(WorkoutLog, WorkoutLog.program_exercise_id == ProgramExercise.id)
        .filter(
            WorkoutLog.user_id == user_id,
            ProgramExercise.exercise_name_canonical.in_(qualifying_names),
            WorkoutLog.reps_completed <= 10,
        )
        .all()
    )

    # Build logged candidates per category
    logged_by_cat: dict[str, list[Candidate]] = {c: [] for c in CATEGORIES}
    for ex_name, load_kg, reps, set_date in rows:
        if load_kg is None or reps is None or load_kg <= 0 or reps <= 0:
            continue
        cat, tier = exercise_lookup[ex_name]
        e1rm = _estimate_e1rm(load_kg, reps)
        conf = Confidence(
            specificity=SPECIFICITY_SCORES[tier],
            rep_range=_rep_factor(reps),
            recency=_recency_factor(set_date, today),
        )
        if conf.final > 0:
            logged_by_cat[cat].append(Candidate(
                e1rm_kg=e1rm,
                source_type="logged",
                source_exercise=ex_name,
                confidence=conf,
                set_date=set_date,
                reps=reps,
            ))

    # Build manual candidates
    manual_data = user.manual_1rm or {}
    manual_by_cat: dict[str, Candidate | None] = {}
    for cat in CATEGORIES:
        entry = manual_data.get(cat)
        if entry is None:
            manual_by_cat[cat] = None
            continue
        value_kg, tested_at = _parse_manual_entry(entry)
        if value_kg <= 0:
            manual_by_cat[cat] = None
            continue
        rec = _recency_factor(tested_at, today) if tested_at else 0.4
        manual_by_cat[cat] = Candidate(
            e1rm_kg=value_kg,
            source_type="manual",
            source_exercise="manual_1rm",
            confidence=Confidence(specificity=1.0, rep_range=1.0, recency=rec),
            set_date=tested_at,
            reps=None,
        )

    # Select best per category
    lifts: dict[str, dict | None] = {}
    classifications: list[str] = []
    categories_missing: list[str] = []
    best_per_cat: dict[str, float] = {}  # for DOTS

    for cat in CATEGORIES:
        best = _select_best(logged_by_cat[cat], manual_by_cat[cat])
        if best is None:
            lifts[cat] = None
            categories_missing.append(cat)
            continue

        ratio = best.e1rm_kg / bodyweight
        classification = _classify(ratio, standards[cat])
        percentile = _estimate_percentile(ratio, standards[cat])
        classifications.append(classification)
        best_per_cat[cat] = best.e1rm_kg

        lifts[cat] = {
            "e1rm_kg": round(best.e1rm_kg, 1),
            "ratio": round(ratio, 2),
            "classification": classification,
            "percentile_estimate": round(percentile),
            "source_type": best.source_type,
            "source_exercise": best.source_exercise,
            "confidence": best.confidence.to_dict(),
            "is_stale": best.is_stale,
            "set_date": best.set_date.isoformat() if best.set_date else None,
            "reps": best.reps,
        }

    # Overall classification = median tier
    tier_order = ["below beginner", "beginner", "novice", "intermediate", "advanced", "elite"]
    overall = None
    if classifications:
        indices = [tier_order.index(c) for c in classifications if c in tier_order]
        if indices:
            overall = tier_order[int(median(indices))]

    # DOTS score (squat + bench + deadlift)
    dots_result = None
    pl_lifts = ["squat", "bench", "deadlift"]
    pl_e1rms = {l: best_per_cat[l] for l in pl_lifts if l in best_per_cat}
    if len(pl_e1rms) >= 2:
        total_kg = sum(pl_e1rms.values())
        dots_result = compute_dots_score(total_kg, bodyweight, is_male=sex != "female")
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
        "categories_missing": categories_missing,
    }
