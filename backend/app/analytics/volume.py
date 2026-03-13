"""Weekly volume analytics and muscle-balance ratios."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy import and_
from sqlalchemy.orm import Session

from ..models import ExerciseCatalog, ProgramExercise, WorkoutLog

# ---------------------------------------------------------------------------
# Evidence-based volume landmarks (weekly working sets per muscle group)
#   MEV  = Minimum Effective Volume
#   MAV  = Maximum Adaptive Volume (low–high)
#   MRV  = Maximum Recoverable Volume
# ---------------------------------------------------------------------------

VOLUME_LANDMARKS: dict[str, dict[str, int]] = {
    "chest":      {"mev": 8,  "mav_low": 12, "mav_high": 20, "mrv": 25},
    "back":       {"mev": 8,  "mav_low": 12, "mav_high": 20, "mrv": 25},
    "shoulders":  {"mev": 6,  "mav_low": 10, "mav_high": 18, "mrv": 22},
    "quads":      {"mev": 8,  "mav_low": 12, "mav_high": 18, "mrv": 22},
    "hamstrings": {"mev": 6,  "mav_low": 10, "mav_high": 16, "mrv": 20},
    "glutes":     {"mev": 4,  "mav_low": 8,  "mav_high": 16, "mrv": 20},
    "biceps":     {"mev": 6,  "mav_low": 10, "mav_high": 16, "mrv": 20},
    "triceps":    {"mev": 6,  "mav_low": 10, "mav_high": 16, "mrv": 20},
    "calves":     {"mev": 6,  "mav_low": 10, "mav_high": 16, "mrv": 20},
    "abs":        {"mev": 4,  "mav_low": 8,  "mav_high": 14, "mrv": 18},
    "forearms":   {"mev": 4,  "mav_low": 6,  "mav_high": 12, "mrv": 16},
}

# Secondary-muscle set weighting (each set counts as half a set for secondary muscles).
_SECONDARY_WEIGHT = 0.5

# Push/pull muscle group mappings.
_PUSH_MUSCLES = {"chest", "shoulders", "triceps"}
_PULL_MUSCLES = {"back", "biceps"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _status_for_sets(sets: float, landmarks: dict[str, int]) -> str:
    """Classify a weekly set count against the volume landmarks."""
    if sets < landmarks["mev"]:
        return "below_mev"
    if sets < landmarks["mav_low"]:
        return "maintenance"
    if sets <= landmarks["mav_high"]:
        return "optimal"
    if sets <= landmarks["mrv"]:
        return "high"
    return "above_mrv"


def _monday_of(d: date) -> date:
    """Return the Monday (ISO weekday 1) of the week containing *d*."""
    return d - timedelta(days=d.weekday())


def _build_catalog_lookup(db: Session) -> dict[str, ExerciseCatalog]:
    """Build a canonical_name → ExerciseCatalog dict for fast lookup."""
    rows = db.query(ExerciseCatalog).all()
    return {row.canonical_name: row for row in rows}


# ---------------------------------------------------------------------------
# Weekly volume per muscle group
# ---------------------------------------------------------------------------

def get_weekly_volume(
    db: Session,
    user_id: int = 1,
    weeks_back: int = 8,
) -> dict:
    """Calculate weekly working sets per muscle group over the last *weeks_back* weeks.

    Each ``WorkoutLog`` row counts as **1 set** towards the exercise's primary
    muscle group and **0.5 sets** towards each secondary muscle group (as listed
    in ``exercise_catalog``).

    Returns per-week breakdowns, the reference volume landmarks, and flags for
    any muscle groups outside the adaptive range.
    """
    today = date.today()
    cutoff = _monday_of(today) - timedelta(weeks=weeks_back - 1)

    # Fetch all logs in range, joining to ProgramExercise for the canonical name.
    logs: list[tuple[WorkoutLog, ProgramExercise]] = (
        db.query(WorkoutLog, ProgramExercise)
        .join(ProgramExercise, WorkoutLog.program_exercise_id == ProgramExercise.id)
        .filter(
            WorkoutLog.user_id == user_id,
            WorkoutLog.date >= cutoff,
        )
        .all()
    )

    catalog = _build_catalog_lookup(db)

    # Accumulate sets: {week_start_str: {muscle: float}}
    weekly: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))

    for wl, pe in logs:
        week_start = _monday_of(wl.date).isoformat()
        entry = catalog.get(pe.exercise_name_canonical)
        if entry is None:
            continue

        primary = entry.muscle_group_primary.lower()
        weekly[week_start][primary] += 1.0

        secondaries = entry.muscle_groups_secondary or []
        for sec in secondaries:
            weekly[week_start][sec.lower()] += _SECONDARY_WEIGHT

    # Build ordered list of weeks.
    week_starts = sorted(weekly.keys())

    weeks_out: list[dict] = []
    all_flags: list[dict] = []

    for ws in week_starts:
        muscle_data: dict[str, dict] = {}
        for mg, landmarks in VOLUME_LANDMARKS.items():
            sets = round(weekly[ws].get(mg, 0.0), 1)
            status = _status_for_sets(sets, landmarks)
            muscle_data[mg] = {"sets": sets, "status": status}

            if status == "below_mev":
                all_flags.append({
                    "week_start": ws,
                    "muscle_group": mg,
                    "issue": "below_mev",
                    "sets": sets,
                    "threshold": landmarks["mev"],
                })
            elif status == "above_mrv":
                all_flags.append({
                    "week_start": ws,
                    "muscle_group": mg,
                    "issue": "above_mrv",
                    "sets": sets,
                    "threshold": landmarks["mrv"],
                })

        weeks_out.append({"week_start": ws, "muscle_groups": muscle_data})

    return {
        "weeks": weeks_out,
        "volume_landmarks": VOLUME_LANDMARKS,
        "flags": all_flags,
    }


# ---------------------------------------------------------------------------
# Muscle balance ratios
# ---------------------------------------------------------------------------

def get_muscle_balance(
    db: Session,
    user_id: int = 1,
    weeks_back: int = 4,
) -> dict:
    """Calculate push:pull and quad:hamstring ratios over the last *weeks_back* weeks.

    Push muscles = chest + shoulders + triceps.
    Pull muscles = back + biceps.

    Target ratios:
    - push:pull ≈ 1.0
    - hamstring:quad ≈ 0.6–0.8
    """
    today = date.today()
    cutoff = _monday_of(today) - timedelta(weeks=weeks_back)

    logs: list[tuple[WorkoutLog, ProgramExercise]] = (
        db.query(WorkoutLog, ProgramExercise)
        .join(ProgramExercise, WorkoutLog.program_exercise_id == ProgramExercise.id)
        .filter(
            WorkoutLog.user_id == user_id,
            WorkoutLog.date >= cutoff,
        )
        .all()
    )

    catalog = _build_catalog_lookup(db)

    totals: dict[str, float] = defaultdict(float)

    for wl, pe in logs:
        entry = catalog.get(pe.exercise_name_canonical)
        if entry is None:
            continue

        primary = entry.muscle_group_primary.lower()
        totals[primary] += 1.0

        secondaries = entry.muscle_groups_secondary or []
        for sec in secondaries:
            totals[sec.lower()] += _SECONDARY_WEIGHT

    push_sets = sum(totals.get(m, 0.0) for m in _PUSH_MUSCLES)
    pull_sets = sum(totals.get(m, 0.0) for m in _PULL_MUSCLES)
    quad_sets = totals.get("quads", 0.0)
    ham_sets = totals.get("hamstrings", 0.0)

    push_pull_ratio = round(push_sets / pull_sets, 2) if pull_sets > 0 else 0.0
    quad_ham_ratio = round(ham_sets / quad_sets, 2) if quad_sets > 0 else 0.0

    # Assess push/pull balance.
    if push_pull_ratio == 0.0:
        pp_assessment = "insufficient_data"
    elif 0.8 <= push_pull_ratio <= 1.2:
        pp_assessment = "balanced"
    elif push_pull_ratio > 1.2:
        pp_assessment = "push_dominant"
    else:
        pp_assessment = "pull_dominant"

    # Assess quad/ham balance (target ham:quad 0.6–0.8).
    if quad_ham_ratio == 0.0:
        qh_assessment = "insufficient_data"
    elif 0.6 <= quad_ham_ratio <= 0.8:
        qh_assessment = "balanced"
    elif quad_ham_ratio < 0.6:
        qh_assessment = "quad_dominant"
    else:
        qh_assessment = "ham_dominant"

    return {
        "push_pull_ratio": push_pull_ratio,
        "quad_ham_ratio": quad_ham_ratio,
        "push_sets": round(push_sets, 1),
        "pull_sets": round(pull_sets, 1),
        "quad_sets": round(quad_sets, 1),
        "ham_sets": round(ham_sets, 1),
        "assessment": {
            "push_pull": pp_assessment,
            "quad_ham": qh_assessment,
        },
    }
