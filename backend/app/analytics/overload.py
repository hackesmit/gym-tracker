"""Progressive overload suggestion algorithm using double progression (reps then load)."""

from __future__ import annotations

import math

from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..models import ExerciseCatalog, ProgramExercise, WorkoutLog


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def parse_range(range_str: str) -> tuple[float, float]:
    """Parse a range string into (low, high).

    Examples:
        "8-10"           → (8.0, 10.0)
        "10"             → (10.0, 10.0)
        "7.5-9"          → (7.5, 9.0)
        "10 (drop set)"  → (10.0, 10.0)
        "10-12 (drop set)" → (10.0, 12.0)
        "10,8"           → (8.0, 10.0)
        ""               → (0.0, 0.0)
    """
    if not range_str or not range_str.strip():
        return (0.0, 0.0)
    # Strip parenthetical annotations like "(drop set)"
    import re
    cleaned = re.sub(r'\([^)]*\)', '', range_str).strip()
    if not cleaned:
        return (0.0, 0.0)
    # Handle comma-separated values like "10,8" → treat as range (8, 10)
    if "," in cleaned:
        nums = []
        for p in cleaned.split(","):
            p = p.strip()
            if p:
                try:
                    nums.append(float(p))
                except ValueError:
                    continue
        if nums:
            return (min(nums), max(nums))
        return (0.0, 0.0)
    # Handle ranges like "8-10"
    if "-" in cleaned:
        parts = cleaned.split("-", maxsplit=1)
        try:
            return (float(parts[0].strip()), float(parts[1].strip()))
        except ValueError:
            return (0.0, 0.0)
    # Single value
    try:
        val = float(cleaned)
        return (val, val)
    except ValueError:
        return (0.0, 0.0)


def is_compound(db: Session, exercise_name: str) -> bool:
    """Check the exercise_catalog for the is_compound flag."""
    entry = (
        db.query(ExerciseCatalog)
        .filter(ExerciseCatalog.canonical_name == exercise_name)
        .first()
    )
    if entry is None:
        # Default: treat as isolation if not found (safer load increments).
        return False
    return entry.is_compound


def _round_to_nearest(value: float, step: float = 2.5) -> float:
    """Round *value* to the nearest multiple of *step*."""
    return round(round(value / step) * step, 2)


# ---------------------------------------------------------------------------
# Core suggestion logic
# ---------------------------------------------------------------------------

def suggest_next_session(db: Session, program_exercise_id: int) -> dict:
    """Suggest load/reps for the next session of a given program exercise.

    Uses double progression (reps-then-load):
    1. Fetch the ``ProgramExercise`` to get prescribed rep range & RPE target.
    2. Fetch the most recent ``WorkoutLog`` entries for that exercise.
    3. Compare actual RPE to the target RPE window and decide:
       - **RPE below target** → increase load (compound +2.5 %, isolation +1-2 reps first).
       - **RPE above target** → maintain or reduce load.
       - **RPE in range** → add a rep or micro-load when at the top of the rep range.
    """
    pe: ProgramExercise | None = (
        db.query(ProgramExercise)
        .filter(ProgramExercise.id == program_exercise_id)
        .first()
    )
    if pe is None:
        return {"error": f"ProgramExercise {program_exercise_id} not found"}

    # Most recent working sets (all sets from the latest logged date).
    latest_logs: list[WorkoutLog] = (
        db.query(WorkoutLog)
        .filter(WorkoutLog.program_exercise_id == program_exercise_id)
        .order_by(desc(WorkoutLog.date), desc(WorkoutLog.set_number))
        .limit(20)
        .all()
    )

    if not latest_logs:
        # No history — return prescribed defaults with no suggestion.
        return _no_history_response(pe)

    # Only keep logs from the most recent date.
    latest_date = latest_logs[0].date
    latest_logs = [lg for lg in latest_logs if lg.date == latest_date]

    # Aggregate last performance across sets.
    loads = [lg.load_kg for lg in latest_logs]
    reps = [lg.reps_completed for lg in latest_logs]
    rpes = [lg.rpe_actual for lg in latest_logs if lg.rpe_actual is not None]

    avg_load = sum(loads) / len(loads) if loads else 0.0
    avg_reps = sum(reps) / len(reps) if reps else 0
    avg_rpe = sum(rpes) / len(rpes) if rpes else None

    rep_low, rep_high = parse_range(pe.prescribed_reps)
    rpe_low, rpe_high = parse_range(pe.prescribed_rpe or "")

    compound = is_compound(db, pe.exercise_name_canonical)

    last_perf = {
        "load_kg": round(avg_load, 2),
        "reps": round(avg_reps),
        "rpe": round(avg_rpe, 1) if avg_rpe is not None else None,
    }
    prescribed = {
        "reps_range": pe.prescribed_reps,
        "rpe_range": pe.prescribed_rpe or "",
    }

    # --- Decision tree ---
    suggestion, suggested_load, suggested_reps, reasoning = _decide(
        avg_load=avg_load,
        avg_reps=round(avg_reps),
        avg_rpe=avg_rpe,
        rep_low=rep_low,
        rep_high=rep_high,
        rpe_low=rpe_low,
        rpe_high=rpe_high,
        compound=compound,
    )

    return {
        "program_exercise_id": pe.id,
        "exercise_name": pe.exercise_name_canonical,
        "last_performance": last_perf,
        "prescribed": prescribed,
        "suggestion": suggestion,
        "suggested_load_kg": suggested_load,
        "suggested_reps": suggested_reps,
        "reasoning": reasoning,
    }


def _decide(
    *,
    avg_load: float,
    avg_reps: int,
    avg_rpe: float | None,
    rep_low: float,
    rep_high: float,
    rpe_low: float,
    rpe_high: float,
    compound: bool,
) -> tuple[str, float, int, str]:
    """Return (suggestion, load_kg, reps, reasoning)."""

    # If no RPE data or no RPE target, default to add_rep.
    if avg_rpe is None or (rpe_low == 0.0 and rpe_high == 0.0):
        if avg_reps < rep_high:
            new_reps = avg_reps + 1
            return (
                "add_rep",
                round(avg_load, 2),
                new_reps,
                f"No RPE data available. Adding 1 rep ({avg_reps} → {new_reps}) at {avg_load} kg.",
            )
        # At top of rep range — bump load, drop to bottom.
        new_load = _increase_load(avg_load, compound)
        return (
            "increase_load",
            new_load,
            int(rep_low),
            (
                f"No RPE data but at top of rep range ({avg_reps}). "
                f"Increasing load {avg_load} → {new_load} kg, resetting reps to {int(rep_low)}."
            ),
        )

    # --- RPE below target: exercise felt too easy → increase load ---
    if avg_rpe < rpe_low:
        if compound:
            new_load = _increase_load(avg_load, compound=True)
            return (
                "increase_load",
                new_load,
                avg_reps,
                (
                    f"RPE {avg_rpe} is below target {rpe_low}-{rpe_high}. "
                    f"Compound lift — increasing load {avg_load} → {new_load} kg."
                ),
            )
        else:
            # Isolation: prefer adding reps first.
            if avg_reps < rep_high:
                bump = min(2, int(rep_high - avg_reps))
                new_reps = avg_reps + bump
                return (
                    "add_rep",
                    round(avg_load, 2),
                    new_reps,
                    (
                        f"RPE {avg_rpe} is below target {rpe_low}-{rpe_high}. "
                        f"Isolation exercise — adding {bump} rep(s) ({avg_reps} → {new_reps})."
                    ),
                )
            new_load = _increase_load(avg_load, compound=False)
            return (
                "increase_load",
                new_load,
                int(rep_low),
                (
                    f"RPE {avg_rpe} is below target {rpe_low}-{rpe_high}. "
                    f"At top of rep range — increasing load {avg_load} → {new_load} kg, "
                    f"resetting reps to {int(rep_low)}."
                ),
            )

    # --- RPE above target: exercise felt too hard → maintain or reduce ---
    if avg_rpe > rpe_high:
        if avg_rpe > rpe_high + 1:
            # Significantly over — reduce load.
            new_load = _decrease_load(avg_load, compound)
            return (
                "reduce_load",
                new_load,
                avg_reps,
                (
                    f"RPE {avg_rpe} significantly above target {rpe_low}-{rpe_high}. "
                    f"Reducing load {avg_load} → {new_load} kg."
                ),
            )
        # Slightly over — keep current prescription.
        return (
            "maintain",
            round(avg_load, 2),
            avg_reps,
            (
                f"RPE {avg_rpe} slightly above target {rpe_low}-{rpe_high}. "
                f"Maintaining {avg_load} kg × {avg_reps} reps — focus on execution."
            ),
        )

    # --- RPE in range: progress via double progression ---
    if avg_reps >= rep_high:
        # At top of rep range at target RPE → bump load, drop to bottom.
        new_load = _increase_load(avg_load, compound)
        return (
            "increase_load",
            new_load,
            int(rep_low),
            (
                f"RPE {avg_rpe} in target range and hit top of rep range ({avg_reps}). "
                f"Increasing load {avg_load} → {new_load} kg, resetting reps to {int(rep_low)}."
            ),
        )

    new_reps = avg_reps + 1
    return (
        "add_rep",
        round(avg_load, 2),
        new_reps,
        (
            f"RPE {avg_rpe} in target range {rpe_low}-{rpe_high}. "
            f"Adding 1 rep ({avg_reps} → {new_reps}) at {avg_load} kg."
        ),
    )


def _increase_load(current: float, compound: bool) -> float:
    """Calculate increased load.

    - Compound: +2.5 % rounded to nearest 2.5 kg (min +2.5 kg).
    - Isolation: +2.5 kg flat (small dumbbell jump).
    """
    if compound:
        bump = max(2.5, current * 0.025)
        return _round_to_nearest(current + bump, 2.5)
    return _round_to_nearest(current + 2.5, 2.5)


def _decrease_load(current: float, compound: bool) -> float:
    """Reduce load by ~5 % (compound) or 2.5 kg (isolation), min 0."""
    if compound:
        reduced = current * 0.95
        return max(0.0, _round_to_nearest(reduced, 2.5))
    return max(0.0, _round_to_nearest(current - 2.5, 2.5))


def _no_history_response(pe: ProgramExercise) -> dict:
    """Build a response when no workout logs exist yet."""
    rep_low, _ = parse_range(pe.prescribed_reps)
    return {
        "program_exercise_id": pe.id,
        "exercise_name": pe.exercise_name_canonical,
        "last_performance": None,
        "prescribed": {
            "reps_range": pe.prescribed_reps,
            "rpe_range": pe.prescribed_rpe or "",
        },
        "suggestion": "first_session",
        "suggested_load_kg": None,
        "suggested_reps": int(rep_low) if rep_low else None,
        "reasoning": "No previous logs — start with a conservative load at the bottom of the rep range.",
    }


# ---------------------------------------------------------------------------
# Full-session overload plan
# ---------------------------------------------------------------------------

def get_overload_plan(
    db: Session,
    program_id: int,
    week: int,
    session_name: str,
) -> dict:
    """Generate progressive overload suggestions for every exercise in a session."""
    exercises: list[ProgramExercise] = (
        db.query(ProgramExercise)
        .filter(
            ProgramExercise.program_id == program_id,
            ProgramExercise.week == week,
            ProgramExercise.session_name == session_name,
        )
        .order_by(ProgramExercise.exercise_order)
        .all()
    )

    suggestions = [suggest_next_session(db, pe.id) for pe in exercises]

    return {
        "program_id": program_id,
        "week": week,
        "session_name": session_name,
        "exercises": suggestions,
    }
