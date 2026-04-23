"""Fixed-threshold muscle-group rank engine.

Ranks are computed from real strength anchors — the best valid lift in the
last 90 days per muscle group, divided by bodyweight — and mapped against
the fixed global thresholds in `muscle_rank_config.py`.

This module intentionally replaces the old percentile/self-normalised
engine.  Ranks must stay comparable across users, so:
  * No percentile ranking.
  * No dynamic recalibration from the active user population.
  * Volume/frequency are NOT inputs to the displayed rank (they remain
    available for analytics dashboards).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy.orm import Session

from .models import (
    BodyMetric,
    MuscleScore,
    ProgramExercise,
    User,
    WorkoutLog,
)
from .muscle_rank_config import (
    ARMS_BODYWEIGHT_DIPS,
    ARMS_CLOSE_GRIP_BENCH,
    ARMS_CURL_ISOLATION,
    ARMS_TRICEP_COMPOUND,
    ARMS_TRICEP_ISOLATION,
    ARMS_WEIGHTED_DIPS,
    BACK_BODYWEIGHT_PULLUPS,
    BACK_ROWS_PULLDOWNS,
    BACK_WEIGHTED_PULLUPS,
    CHAMPION_POINTS,
    CURL_THRESHOLDS,
    EXERCISE_MAP,
    HYBRID_WEIGHTS,
    LATERAL_THRESHOLDS,
    LOOKBACK_DAYS,
    MANUAL_1RM_KEY,
    MAX_BODYWEIGHT_KG,
    MAX_RATIO_CAP,
    MAX_REPS_FOR_E1RM,
    MIN_BODYWEIGHT_KG,
    MUSCLE_RANK_THRESHOLDS,
    MVP_GROUPS,
    RANK_ORDER,
    SHOULDERS_LATERAL_ISOLATION,
    TRICEP_ISOLATION_THRESHOLDS,
    continuous_score,
    elo_to_ratio,
    max_rank,
    rank_from_reps,
    rank_from_threshold,
    rank_score,
    subdivided_rank,
    subdivision_label,
    tier_index,
    tier_sub_from_elo,
)

__all__ = [
    "MVP_GROUPS",
    "RANK_ORDER",
    "recompute_for_user",
    "recompute_all",
    "aggregate_elo",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _epley_e1rm(load_kg: float, reps: int) -> float:
    """Epley e1RM.  Rejected if reps > MAX_REPS_FOR_E1RM or non-positive."""
    if load_kg is None or reps is None:
        return 0.0
    if load_kg <= 0 or reps <= 0:
        return 0.0
    if reps > MAX_REPS_FOR_E1RM:
        return 0.0
    if reps == 1:
        return float(load_kg)
    return float(load_kg) * (1.0 + reps / 30.0)


def _resolve_bodyweight(db: Session, user: User) -> float | None:
    bw = user.bodyweight_kg
    if not bw or bw <= 0:
        latest = (
            db.query(BodyMetric)
            .filter(BodyMetric.user_id == user.id)
            .order_by(BodyMetric.date.desc())
            .first()
        )
        if latest and latest.bodyweight_kg and latest.bodyweight_kg > 0:
            bw = latest.bodyweight_kg
    if not bw:
        return None
    bw = float(bw)
    if bw < MIN_BODYWEIGHT_KG or bw > MAX_BODYWEIGHT_KG:
        return None
    return bw


def _parse_manual_value(entry) -> float:
    if isinstance(entry, (int, float)):
        return float(entry)
    if isinstance(entry, dict):
        val = entry.get("value_kg", 0)
        try:
            return float(val or 0)
        except (TypeError, ValueError):
            return 0.0
    return 0.0


def _score_from_ratio(ratio: float, thresholds: dict[str, float]) -> float:
    """Normalize ratio to 0..100 using the Champion cutoff as 100."""
    champ = thresholds.get("Champion", 1.0)
    if champ <= 0:
        return 0.0
    return max(0.0, min(100.0, (float(ratio) / champ) * 100.0))


@dataclass
class _Result:
    ratio: float         # metric value in whatever unit the group's threshold expects
    tier: str
    source: str          # canonical name / description of best lift used


# ---------------------------------------------------------------------------
# Per-group resolvers
# ---------------------------------------------------------------------------

def _best_barbell_ratio(
    db: Session,
    user_id: int,
    group: str,
    bw_kg: float,
    cutoff: date,
) -> _Result:
    """Chest / quads / hamstrings / shoulders — e1RM / BW."""
    exercises = EXERCISE_MAP.get(group) or {}
    thresholds = MUSCLE_RANK_THRESHOLDS[group]["thresholds"]

    rows = []
    if exercises:
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
                WorkoutLog.date >= cutoff,
                WorkoutLog.reps_completed > 0,
                WorkoutLog.reps_completed <= MAX_REPS_FOR_E1RM,
                WorkoutLog.load_kg > 0,
                ProgramExercise.exercise_name_canonical.in_(list(exercises.keys())),
            )
            .all()
        )

    best_ratio = 0.0
    best_source: str | None = None
    for name, load, reps, _d in rows:
        spec = exercises.get(name, 0.0)
        if spec <= 0:
            continue
        e1rm = _epley_e1rm(load, reps)
        if e1rm <= 0:
            continue
        ratio = (e1rm * spec) / bw_kg
        if ratio > MAX_RATIO_CAP:
            continue
        if ratio > best_ratio:
            best_ratio = ratio
            best_source = f"logged:{name}"

    # Manual 1RM fallback.
    manual_key = MANUAL_1RM_KEY.get(group)
    if manual_key:
        user = db.get(User, user_id)
        manual_map = (user.manual_1rm or {}) if user else {}
        entry = manual_map.get(manual_key)
        if entry is not None:
            val = _parse_manual_value(entry)
            if val > 0:
                ratio = val / bw_kg
                if ratio <= MAX_RATIO_CAP and ratio > best_ratio:
                    best_ratio = ratio
                    best_source = f"manual:{manual_key}"

    if best_ratio <= 0 or best_source is None:
        return _Result(0.0, "Copper", "no_data")
    return _Result(best_ratio, rank_from_threshold(best_ratio, thresholds), best_source)


def _best_weighted_calisthenic(
    db: Session,
    user_id: int,
    group: str,
    bw_kg: float,
    cutoff: date,
    weighted: set[str],
    bodyweight: set[str],
    close_grip_fallback: set[str] | None,
    manual_added_key: str | None,
    compound_map: dict[str, float] | None = None,
) -> _Result:
    """Back / arms — added-load-over-bodyweight ratio with fallbacks.

    Priority per the config spec:
      1. Weighted pullup / weighted dip (primary, no specificity discount)
      2. Close-grip bench proxy (arms only; shifted by -1.0 × BW to align
         with the added-load scale)
      3. Row / pulldown or tricep-compound pathway (`compound_map` — each
         entry contributes ratio = spec × e1rm / BW, max against the above)
      4. Bodyweight pullup/dip rep-count fallback (back only)
    """
    thresholds = MUSCLE_RANK_THRESHOLDS[group]["thresholds"]
    fallback_rep_thresholds = MUSCLE_RANK_THRESHOLDS[group].get("fallback_reps")

    compound_map = compound_map or {}
    candidate_names = list(
        weighted
        | bodyweight
        | (close_grip_fallback or set())
        | set(compound_map.keys())
    )
    rows = []
    if candidate_names:
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
                WorkoutLog.date >= cutoff,
                WorkoutLog.reps_completed > 0,
                ProgramExercise.exercise_name_canonical.in_(candidate_names),
            )
            .all()
        )

    best_added_ratio = -1.0         # added load / BW  (float)
    best_weighted_source: str | None = None
    best_rep_count = 0
    best_rep_source: str | None = None
    saw_bodyweight = False

    for name, load, reps, _d in rows:
        if reps is None or reps <= 0:
            continue

        if name in weighted and load is not None and load > 0:
            if reps > MAX_REPS_FOR_E1RM:
                continue
            e1rm = _epley_e1rm(load, reps)
            if e1rm <= 0:
                continue
            ratio = e1rm / bw_kg
            if ratio > MAX_RATIO_CAP:
                continue
            if ratio > best_added_ratio:
                best_added_ratio = ratio
                best_weighted_source = f"logged:{name}"

        elif name in bodyweight:
            saw_bodyweight = True
            # Bodyweight pullup/dip => 0 kg added. Keep as floor.
            if best_added_ratio < 0:
                best_added_ratio = 0.0
                best_weighted_source = f"logged:{name}"
            # Rep-count fallback ranking (only populated when the group
            # provides `fallback_reps`, i.e. back).
            if reps > best_rep_count:
                best_rep_count = reps
                best_rep_source = f"logged_reps:{name}"

        elif close_grip_fallback and name in close_grip_fallback and load is not None and load > 0:
            # Close-grip bench as an arms proxy. Shift by 1.0 to align with
            # the +added-BW scale (bench 1.0×BW ≈ bodyweight dip baseline).
            if reps > MAX_REPS_FOR_E1RM:
                continue
            e1rm = _epley_e1rm(load, reps)
            if e1rm <= 0:
                continue
            shifted = (e1rm / bw_kg) - 1.0
            if shifted > MAX_RATIO_CAP:
                continue
            if shifted > best_added_ratio:
                best_added_ratio = shifted
                best_weighted_source = f"proxy_close_grip_bench:{name}"

        elif name in compound_map and load is not None and load > 0:
            # Row / pulldown (back) or skull-crusher / JM press (arms).
            # ratio = spec × e1rm / BW, compared directly to the group's
            # added-load thresholds. Specificity encodes transferability
            # plus the DB per-hand × 2 convention where relevant.
            spec = compound_map[name]
            if spec <= 0:
                continue
            if reps > MAX_REPS_FOR_E1RM:
                continue
            e1rm = _epley_e1rm(load, reps)
            if e1rm <= 0:
                continue
            ratio = (e1rm * spec) / bw_kg
            if ratio > MAX_RATIO_CAP:
                continue
            if ratio > best_added_ratio:
                best_added_ratio = ratio
                best_weighted_source = f"compound:{name}"

    # Manual added-load 1RM (e.g. user types "pullup": +40 kg).
    if manual_added_key:
        user = db.get(User, user_id)
        manual_map = (user.manual_1rm or {}) if user else {}
        entry = manual_map.get(manual_added_key)
        if entry is not None:
            val = _parse_manual_value(entry)
            if val > 0:
                ratio = val / bw_kg
                if ratio <= MAX_RATIO_CAP and ratio > best_added_ratio:
                    best_added_ratio = ratio
                    best_weighted_source = f"manual:{manual_added_key}"

    weighted_tier: str | None = None
    if best_added_ratio >= 0 and best_weighted_source is not None:
        weighted_tier = rank_from_threshold(best_added_ratio, thresholds)

    rep_tier: str | None = None
    if fallback_rep_thresholds and best_rep_count > 0:
        rep_tier = rank_from_reps(best_rep_count, fallback_rep_thresholds)

    if weighted_tier is None and rep_tier is None:
        return _Result(0.0, "Copper", "no_data")

    final_tier = max_rank(weighted_tier or "Copper", rep_tier or "Copper")

    # Report the ratio of whichever path produced the winning tier.
    wt = tier_index(weighted_tier or "Copper")
    rt = tier_index(rep_tier or "Copper")
    if wt >= rt and best_weighted_source is not None:
        return _Result(max(best_added_ratio, 0.0), final_tier, best_weighted_source)
    return _Result(float(best_rep_count), final_tier, best_rep_source or "bodyweight_reps")


def _weighted_avg_present(components: list[tuple[float, float]]) -> float:
    """Weighted average of (weight, elo) pairs, ignoring missing pathways.

    A pathway with elo <= 0 is treated as "no data" and its weight is NOT
    applied. Remaining pathways' weights are implicitly renormalized by
    dividing by their sum. This matches the user's spec: isolation is
    supplementary to the compound anchor — a lifter who does only
    compound work should still rank on compound strength, not be punished
    for skipping isolation. Symmetric for a pure-isolation lifter.
    """
    total_w = 0.0
    weighted = 0.0
    for weight, elo in components:
        if elo > 0 and weight > 0:
            total_w += weight
            weighted += weight * elo
    return weighted / total_w if total_w > 0 else 0.0


def _best_isolation_ratio(
    db: Session,
    user_id: int,
    bw_kg: float,
    cutoff: date,
    exercise_specs: dict[str, float],
) -> tuple[float, str | None]:
    """Best `e1rm × spec / BW` across a dict of {canonical_name: spec}.

    Returns (ratio, source) with ratio=0.0 and source=None when no valid log exists.
    """
    if not exercise_specs:
        return (0.0, None)
    rows = (
        db.query(
            ProgramExercise.exercise_name_canonical,
            WorkoutLog.load_kg,
            WorkoutLog.reps_completed,
        )
        .join(WorkoutLog, WorkoutLog.program_exercise_id == ProgramExercise.id)
        .filter(
            WorkoutLog.user_id == user_id,
            WorkoutLog.date >= cutoff,
            WorkoutLog.reps_completed > 0,
            WorkoutLog.reps_completed <= MAX_REPS_FOR_E1RM,
            WorkoutLog.load_kg > 0,
            ProgramExercise.exercise_name_canonical.in_(list(exercise_specs.keys())),
        )
        .all()
    )
    best_ratio = 0.0
    best_source: str | None = None
    for name, load, reps in rows:
        spec = exercise_specs.get(name, 0.0)
        if spec <= 0:
            continue
        e1rm = _epley_e1rm(load, reps)
        if e1rm <= 0:
            continue
        ratio = (e1rm * spec) / bw_kg
        if ratio > MAX_RATIO_CAP:
            continue
        if ratio > best_ratio:
            best_ratio = ratio
            best_source = f"logged:{name}"
    return (best_ratio, best_source)


def _compute_arms_hybrid(
    db: Session,
    user_id: int,
    bw_kg: float,
    cutoff: date,
    *,
    chest_ratio: float,
    shoulders_press_ratio: float,
    back_ratio: float,
) -> tuple[_Result, dict]:
    """Hybrid arms = 0.5 × biceps + 0.5 × triceps in ELO space.

    biceps  = 0.7 × back_elo + 0.3 × curl_elo
    triceps = 0.7 × max(chest, shoulder_press)_elo + 0.3 × direct_tricep_elo
    direct_tricep_elo = max(anchor_tricep_elo, tricep_isolation_elo)

    Anchor tricep = existing dips / close-grip / heavy compound pathway.
    Returns (result, breakdown) — breakdown is exposed for debugging and
    potential UI surfacing.
    """
    arms_thresholds = MUSCLE_RANK_THRESHOLDS["arms"]["thresholds"]
    chest_thresholds = MUSCLE_RANK_THRESHOLDS["chest"]["thresholds"]
    shoulders_thresholds = MUSCLE_RANK_THRESHOLDS["shoulders"]["thresholds"]
    back_thresholds = MUSCLE_RANK_THRESHOLDS["back"]["thresholds"]

    # Existing anchor pathway (dips + close-grip + heavy tricep compound)
    anchor = _best_weighted_calisthenic(
        db, user_id, "arms", bw_kg, cutoff,
        weighted=ARMS_WEIGHTED_DIPS,
        bodyweight=ARMS_BODYWEIGHT_DIPS,
        close_grip_fallback=ARMS_CLOSE_GRIP_BENCH,
        manual_added_key=MANUAL_1RM_KEY.get("arms_added"),
        compound_map=ARMS_TRICEP_COMPOUND,
    )

    curl_ratio, curl_source = _best_isolation_ratio(
        db, user_id, bw_kg, cutoff, ARMS_CURL_ISOLATION,
    )
    tricep_iso_ratio, tricep_iso_source = _best_isolation_ratio(
        db, user_id, bw_kg, cutoff, ARMS_TRICEP_ISOLATION,
    )

    # Project each pathway into ELO space using its calibrated thresholds.
    chest_elo = continuous_score(chest_ratio, chest_thresholds) if chest_ratio > 0 else 0.0
    shoulders_press_elo = (
        continuous_score(shoulders_press_ratio, shoulders_thresholds)
        if shoulders_press_ratio > 0 else 0.0
    )
    back_elo = continuous_score(back_ratio, back_thresholds) if back_ratio > 0 else 0.0
    curl_elo = continuous_score(curl_ratio, CURL_THRESHOLDS) if curl_ratio > 0 else 0.0
    anchor_tricep_elo = (
        continuous_score(anchor.ratio, arms_thresholds) if anchor.ratio > 0 else 0.0
    )
    tricep_iso_elo = (
        continuous_score(tricep_iso_ratio, TRICEP_ISOLATION_THRESHOLDS)
        if tricep_iso_ratio > 0 else 0.0
    )

    press_elo = max(chest_elo, shoulders_press_elo)
    direct_tricep_elo = max(anchor_tricep_elo, tricep_iso_elo)

    # Biceps and triceps each renormalize inside themselves: a pure-curl
    # lifter gets full biceps credit, a pure-dip lifter gets full triceps
    # credit. The arms-level blend then averages the two heads at 50/50
    # *without* renormalization — missing one head (e.g. pure bench and no
    # pull work) costs roughly half a tier, reflecting that biceps and
    # triceps are both parts of "arms".
    biceps_elo = _weighted_avg_present([(0.7, back_elo), (0.3, curl_elo)])
    triceps_elo = _weighted_avg_present([(0.7, press_elo), (0.3, direct_tricep_elo)])
    arms_elo = 0.5 * biceps_elo + 0.5 * triceps_elo

    # No usable data anywhere → Copper V / no_data. Matches the caller's
    # snap-to-Copper-on-zero contract in `recompute_for_user`.
    if arms_elo <= 0:
        return (_Result(0.0, "Copper", "no_data"), {
            "back_elo": 0.0, "curl_elo": 0.0, "press_elo": 0.0,
            "direct_tricep_elo": 0.0, "arms_elo": 0.0,
        })

    tier, _sub = tier_sub_from_elo(arms_elo)
    # Reverse-map to an equivalent arms-threshold ratio so the Profile
    # progress bar computation lines up with the blended tier.
    pseudo_ratio = elo_to_ratio(arms_elo, arms_thresholds)

    # Pick the richest source label we can — weight each pathway's ELO by
    # its full-arms contribution (0.5 × within-head-weight) so the dominant
    # contributor to the blended rank wins the label.
    contributions = [
        ("back",          0.5 * 0.7 * back_elo),
        ("curl",          0.5 * 0.3 * curl_elo),
        ("press",         0.5 * 0.7 * press_elo),
        ("direct_tricep", 0.5 * 0.3 * direct_tricep_elo),
    ]
    contributions.sort(key=lambda t: t[1], reverse=True)
    top = contributions[0][0]
    label_map = {
        "back":          "hybrid:back-anchor",
        "curl":          f"hybrid:curl:{curl_source or 'n/a'}",
        "press":         "hybrid:press-anchor",
        "direct_tricep": anchor.source if anchor_tricep_elo >= tricep_iso_elo else (tricep_iso_source or "hybrid:tricep-iso"),
    }
    source = label_map.get(top, "hybrid")

    breakdown = {
        "back_elo":         round(back_elo, 1),
        "curl_elo":         round(curl_elo, 1),
        "press_elo":        round(press_elo, 1),
        "direct_tricep_elo": round(direct_tricep_elo, 1),
        "biceps_elo":       round(biceps_elo, 1),
        "triceps_elo":      round(triceps_elo, 1),
        "arms_elo":         round(arms_elo, 1),
    }
    return (_Result(pseudo_ratio, tier, source), breakdown)


def _compute_shoulders_hybrid(
    db: Session,
    user_id: int,
    bw_kg: float,
    cutoff: date,
    *,
    press_result: _Result,
) -> tuple[_Result, dict]:
    """Hybrid shoulders = 0.7 × press + 0.3 × lateral isolation."""
    shoulders_thresholds = MUSCLE_RANK_THRESHOLDS["shoulders"]["thresholds"]

    lateral_ratio, lateral_source = _best_isolation_ratio(
        db, user_id, bw_kg, cutoff, SHOULDERS_LATERAL_ISOLATION,
    )

    press_elo = (
        continuous_score(press_result.ratio, shoulders_thresholds)
        if press_result.ratio > 0 else 0.0
    )
    lateral_elo = (
        continuous_score(lateral_ratio, LATERAL_THRESHOLDS)
        if lateral_ratio > 0 else 0.0
    )

    w = HYBRID_WEIGHTS["shoulders"]
    shoulders_elo = _weighted_avg_present([
        (w["press"],   press_elo),
        (w["lateral"], lateral_elo),
    ])

    if shoulders_elo <= 0:
        return (_Result(0.0, "Copper", "no_data"), {
            "press_elo": 0.0, "lateral_elo": 0.0, "shoulders_elo": 0.0,
        })

    tier, _sub = tier_sub_from_elo(shoulders_elo)
    pseudo_ratio = elo_to_ratio(shoulders_elo, shoulders_thresholds)
    source = press_result.source if press_elo >= lateral_elo else (lateral_source or "hybrid:lateral")
    breakdown = {
        "press_elo":     round(press_elo, 1),
        "lateral_elo":   round(lateral_elo, 1),
        "shoulders_elo": round(shoulders_elo, 1),
    }
    return (_Result(pseudo_ratio, tier, f"hybrid:{source}" if not source.startswith("hybrid:") else source), breakdown)


def _compute_group(
    db: Session, user_id: int, group: str, bw_kg: float, cutoff: date,
) -> _Result:
    if group == "back":
        return _best_weighted_calisthenic(
            db, user_id, "back", bw_kg, cutoff,
            weighted=BACK_WEIGHTED_PULLUPS,
            bodyweight=BACK_BODYWEIGHT_PULLUPS,
            close_grip_fallback=None,
            manual_added_key=MANUAL_1RM_KEY.get("back_added"),
            compound_map=BACK_ROWS_PULLDOWNS,
        )
    if group == "arms" or group == "shoulders":
        # These use hybrid scoring and are handled in `recompute_for_user`
        # because they depend on the other groups' ratios.
        return _Result(0.0, "Copper", "hybrid_placeholder")
    return _best_barbell_ratio(db, user_id, group, bw_kg, cutoff)


# ---------------------------------------------------------------------------
# Public entry points
# ---------------------------------------------------------------------------

def recompute_for_user(db: Session, user_id: int) -> dict[str, dict]:
    """Recompute & persist fixed-threshold muscle ranks for a single user.

    Returns `{group: {"score", "rank", "sub_index", "sub_label",
                       "rank_index", "elo", "ratio", "source"}}`.
    """
    user = db.get(User, user_id)
    if user is None:
        return {}

    bw = _resolve_bodyweight(db, user)
    today = date.today()
    cutoff = today - timedelta(days=LOOKBACK_DAYS)

    existing = {
        ms.muscle_group: ms
        for ms in db.query(MuscleScore).filter(MuscleScore.user_id == user_id).all()
    }

    # Pass 1: compute single-pathway anchors (chest, quads, hamstrings, back,
    # shoulder-press). Arms and shoulders need these to blend isolation work.
    anchor_results: dict[str, _Result] = {}
    if bw is not None:
        for anchor_group in ("chest", "quads", "hamstrings", "back"):
            anchor_results[anchor_group] = _compute_group(db, user_id, anchor_group, bw, cutoff)
        # shoulder-press is the raw OHP/DB-press pathway, sourced from
        # EXERCISE_MAP["shoulders"] — it's the input to the shoulders hybrid.
        anchor_results["shoulders_press"] = _best_barbell_ratio(
            db, user_id, "shoulders", bw, cutoff,
        )

    out: dict[str, dict] = {}
    for group in MVP_GROUPS:
        if bw is None:
            result = _Result(0.0, "Copper", "missing_bodyweight")
        elif group == "arms":
            result, _breakdown = _compute_arms_hybrid(
                db, user_id, bw, cutoff,
                chest_ratio=anchor_results["chest"].ratio,
                shoulders_press_ratio=anchor_results["shoulders_press"].ratio,
                back_ratio=anchor_results["back"].ratio,
            )
        elif group == "shoulders":
            result, _breakdown = _compute_shoulders_hybrid(
                db, user_id, bw, cutoff,
                press_result=anchor_results["shoulders_press"],
            )
        elif group in anchor_results:
            result = anchor_results[group]
        else:
            result = _compute_group(db, user_id, group, bw, cutoff)

        thresholds = MUSCLE_RANK_THRESHOLDS[group]["thresholds"]
        # Back/arms have Bronze floor = 0.00, so a zero-ratio "no data"
        # result would falsely subdivide into Bronze. Snap to Copper V
        # whenever the resolver explicitly reported no usable data.
        if result.source in ("no_data", "missing_bodyweight") or result.ratio <= 0:
            tier, sub_idx = "Copper", 0
        else:
            tier, sub_idx = subdivided_rank(result.ratio, thresholds)
        # `_compute_group` may return a tier derived from a rep-count fallback
        # (back). Keep that tier if it wins, and align the subdivision with
        # whatever wins.
        if tier_index(result.tier) > tier_index(tier):
            tier = result.tier
            sub_idx = 0
        score = _score_from_ratio(result.ratio, thresholds)
        elo = continuous_score(result.ratio, thresholds) if result.ratio > 0 else 0.0
        # Snap ELO to the tier's discrete base if the rep-count fallback
        # pushed us into a higher tier than the ratio alone would support.
        min_elo_for_tier = (rank_score(tier, sub_idx) - 1) * 100
        if elo < min_elo_for_tier:
            elo = float(min_elo_for_tier)

        ms = existing.get(group)
        if ms is None:
            ms = MuscleScore(
                user_id=user_id,
                muscle_group=group,
                score_v=0.0,
                score_i=float(result.ratio),
                score_f=0.0,
                score=score,
                rank=tier,
                sub_index=sub_idx,
                elo=elo,
            )
            db.add(ms)
        else:
            ms.score_v = 0.0
            ms.score_i = float(result.ratio)
            ms.score_f = 0.0
            ms.score = score
            ms.rank = tier
            ms.sub_index = sub_idx
            ms.elo = elo

        out[group] = {
            "score": round(score, 2),
            "rank": tier,
            "sub_index": sub_idx,
            "sub_label": subdivision_label(sub_idx),
            "rank_index": rank_score(tier, sub_idx),
            "elo": round(elo, 1),
            "ratio": round(float(result.ratio), 3),
            "source": result.source,
        }

    db.commit()
    return out


def aggregate_elo(ranks: dict[str, dict]) -> dict:
    """Aggregate ELO across all muscle groups.

    Accepts the dict returned by `recompute_for_user`. Returns total ELO
    (sum), mean per-muscle, theoretical max, and the dominant tier (the
    median tier across groups — gives the user a one-word summary).
    """
    values = [float(v.get("elo") or 0.0) for v in ranks.values() if v]
    if not values:
        return {"total": 0.0, "mean": 0.0, "max": 0, "dominant_tier": "Copper"}
    total = sum(values)
    mean = total / len(values)
    theoretical_max = len(values) * CHAMPION_POINTS
    # Dominant tier: take the rank that's closest to the mean ELO.
    from .muscle_rank_config import SUBDIVISION_COUNT
    sub_count = SUBDIVISION_COUNT
    bucket = int(mean // 100)                 # 0..30
    if bucket >= 6 * sub_count:
        dominant = "Champion"
    else:
        dominant = RANK_ORDER[bucket // sub_count]
    return {
        "total": round(total, 1),
        "mean": round(mean, 1),
        "max": theoretical_max,
        "dominant_tier": dominant,
    }


def recompute_all(db: Session) -> None:
    for u in db.query(User).all():
        recompute_for_user(db, u.id)
