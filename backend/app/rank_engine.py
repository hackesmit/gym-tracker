"""Muscle-group rank engine: 30d rolling V/I/F → score → Rainbow Six tier."""

from collections import defaultdict
from datetime import date, timedelta
from typing import Iterable

from sqlalchemy import func
from sqlalchemy.orm import Session

from .models import ExerciseCatalog, MuscleScore, ProgramExercise, User, WorkoutLog

MVP_GROUPS = ["chest", "back", "shoulders", "quads", "hamstrings", "arms"]

# Map catalog primary muscle -> MVP group. Unknowns are ignored.
CATALOG_TO_MVP = {
    "chest": "chest",
    "back": "back",
    "lats": "back",
    "upper_back": "back",
    "shoulders": "shoulders",
    "front_delts": "shoulders",
    "side_delts": "shoulders",
    "rear_delts": "shoulders",
    "quads": "quads",
    "hamstrings": "hamstrings",
    "biceps": "arms",
    "triceps": "arms",
}

# Rank thresholds (percentile bins)
RANK_BINS = [
    (0, 10, "Copper"),
    (10, 25, "Bronze"),
    (25, 40, "Silver"),
    (40, 60, "Gold"),
    (60, 75, "Platinum"),
    (75, 85, "Emerald"),
    (85, 95, "Diamond"),
    (95, 101, "Champion"),
]


def _rank_from_percentile(pct: float) -> str:
    for lo, hi, name in RANK_BINS:
        if lo <= pct < hi:
            return name
    return "Champion"


def _mvp_group(primary: str | None) -> str | None:
    if not primary:
        return None
    return CATALOG_TO_MVP.get(primary.lower())


def _compute_scores_for_user(db: Session, user_id: int) -> dict[str, dict]:
    """Return {group: {V, I, F, score}} with raw V not normalized (normalization is global)."""
    today = date.today()
    cutoff = today - timedelta(days=30)

    # Pull 30d logs + catalog info
    rows = (
        db.query(WorkoutLog, ProgramExercise, ExerciseCatalog)
        .join(ProgramExercise, WorkoutLog.program_exercise_id == ProgramExercise.id)
        .outerjoin(ExerciseCatalog, ExerciseCatalog.canonical_name == ProgramExercise.exercise_name_canonical)
        .filter(WorkoutLog.user_id == user_id, WorkoutLog.date >= cutoff)
        .all()
    )

    # Bodyweight for Intensity normalization
    user = db.get(User, user_id)
    bw = user.bodyweight_kg if user and user.bodyweight_kg else 75.0

    volumes = defaultdict(float)
    top_sets = defaultdict(float)
    session_dates = defaultdict(set)
    for log, pe, cat in rows:
        group = _mvp_group(cat.muscle_group_primary if cat else None)
        if not group:
            continue
        volumes[group] += (log.load_kg or 0) * (log.reps_completed or 0)
        top_sets[group] = max(top_sets[group], log.load_kg or 0)
        session_dates[group].add(log.date)

    result = {}
    for g in MVP_GROUPS:
        V_raw = volumes.get(g, 0.0)
        I = min(1.0, (top_sets.get(g, 0.0) / bw) if bw else 0.0)
        F = min(1.0, len(session_dates.get(g, set())) / 12.0)
        result[g] = {"V_raw": V_raw, "I": I, "F": F}
    return result


def recompute_for_user(db: Session, user_id: int) -> dict[str, dict]:
    """Recompute + persist the user's ranks. Normalizes V against all active users."""
    # Compute raw scores for every user (cheap: MVP groups only, 30d window)
    user_ids = [u.id for u in db.query(User).all()]
    all_raw: dict[int, dict] = {}
    for uid in user_ids:
        all_raw[uid] = _compute_scores_for_user(db, uid)

    # Normalize V per group across users
    max_v = {g: 0.0 for g in MVP_GROUPS}
    for uid, groups in all_raw.items():
        for g, vals in groups.items():
            if vals["V_raw"] > max_v[g]:
                max_v[g] = vals["V_raw"]

    # Compute normalized scores
    scored: dict[int, dict] = {}
    for uid, groups in all_raw.items():
        scored[uid] = {}
        for g, vals in groups.items():
            V = (vals["V_raw"] / max_v[g]) if max_v[g] > 0 else 0.0
            V = max(0.0, min(1.0, V))
            I = max(0.0, min(1.0, vals["I"]))
            F = max(0.0, min(1.0, vals["F"]))
            score = 100.0 * (0.6 * V + 0.3 * I + 0.1 * F)
            scored[uid][g] = {"V": V, "I": I, "F": F, "score": score}

    # Determine per-group percentile ranks
    target_ranks: dict[str, dict] = {}  # per user
    single_user_mode = len(user_ids) <= 1
    for g in MVP_GROUPS:
        values = sorted([(uid, scored[uid][g]["score"]) for uid in user_ids], key=lambda x: x[1])
        n = len(values)
        for i, (uid, s) in enumerate(values):
            if single_user_mode:
                # Absolute thresholds
                bins = [(0, 10), (10, 25), (25, 40), (40, 60), (60, 75), (75, 85), (85, 95), (95, 101)]
                for lo, hi in bins:
                    if lo <= s < hi:
                        rank = _rank_from_percentile(lo)
                        break
                else:
                    rank = "Champion"
            else:
                # Percentile position (rank below / n * 100)
                pct = (i / max(n - 1, 1)) * 100 if n > 1 else 50.0
                rank = _rank_from_percentile(pct)
            target_ranks.setdefault(uid, {})[g] = rank

    # Persist for the target user (only this user to keep writes bounded)
    existing = {
        ms.muscle_group: ms
        for ms in db.query(MuscleScore).filter(MuscleScore.user_id == user_id).all()
    }
    out = {}
    for g in MVP_GROUPS:
        vals = scored[user_id][g]
        rank = target_ranks[user_id][g]
        ms = existing.get(g)
        if ms is None:
            ms = MuscleScore(
                user_id=user_id, muscle_group=g,
                score_v=vals["V"], score_i=vals["I"], score_f=vals["F"],
                score=vals["score"], rank=rank,
            )
            db.add(ms)
        else:
            ms.score_v = vals["V"]
            ms.score_i = vals["I"]
            ms.score_f = vals["F"]
            ms.score = vals["score"]
            ms.rank = rank
        out[g] = {"score": vals["score"], "rank": rank}
    db.commit()
    return out


def recompute_all(db: Session):
    for u in db.query(User).all():
        recompute_for_user(db, u.id)
