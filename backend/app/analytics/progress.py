"""e1RM calculation and exercise progress tracking analytics."""

from collections import defaultdict
from datetime import date, timedelta

import numpy as np
from scipy.optimize import curve_fit
from sqlalchemy.orm import Session

from ..models import ProgramExercise, WorkoutLog


# ---------------------------------------------------------------------------
# e1RM Calculation
# ---------------------------------------------------------------------------

def calculate_e1rm(weight: float, reps: int) -> float:
    """Estimated 1-rep max using Epley formula. Returns 0 if reps < 1."""
    if reps < 1 or weight <= 0:
        return 0.0
    if reps == 1:
        return weight
    return weight * (1 + reps / 30)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _fetch_exercise_history(
    db: Session, exercise_name: str, user_id: int,
) -> list[dict]:
    """Query all logged sets for an exercise (by canonical name).

    Returns a list of dicts with keys: date, load_kg, reps_completed.
    """
    rows = (
        db.query(
            WorkoutLog.date,
            WorkoutLog.load_kg,
            WorkoutLog.reps_completed,
        )
        .join(ProgramExercise, WorkoutLog.program_exercise_id == ProgramExercise.id)
        .filter(
            ProgramExercise.exercise_name_canonical == exercise_name,
            WorkoutLog.user_id == user_id,
        )
        .order_by(WorkoutLog.date)
        .all()
    )
    return [
        {"date": r.date, "load_kg": r.load_kg, "reps_completed": r.reps_completed}
        for r in rows
    ]


def _best_per_date(history: list[dict]) -> list[dict]:
    """Group sets by date and keep the best e1RM per date.

    Returns sorted list of dicts:
        date, best_e1rm, best_load, best_reps
    """
    by_date: dict[date, list[dict]] = defaultdict(list)
    for row in history:
        by_date[row["date"]].append(row)

    result = []
    for d in sorted(by_date):
        best_e1rm = 0.0
        best_load = 0.0
        best_reps = 0
        for s in by_date[d]:
            e1rm = calculate_e1rm(s["load_kg"], s["reps_completed"])
            if e1rm > best_e1rm:
                best_e1rm = e1rm
                best_load = s["load_kg"]
                best_reps = s["reps_completed"]
        result.append({
            "date": str(d),
            "best_e1rm": round(best_e1rm, 2),
            "best_load": best_load,
            "best_reps": best_reps,
        })
    return result


def _log_func(x: np.ndarray, a: float, b: float) -> np.ndarray:
    """Logarithmic model: e1RM = a * ln(weeks + 1) + b."""
    return a * np.log(x + 1) + b


def _fit_trend(data_points: list[dict]) -> tuple[dict | None, dict | None, list[str]]:
    """Fit linear and logarithmic models, pick the best.

    Returns (trend_dict, projections_dict, flags).
    All three are None/empty when < 4 data points.
    """
    if len(data_points) < 4:
        return None, None, []

    first_date = date.fromisoformat(data_points[0]["date"])
    days = np.array([
        (date.fromisoformat(dp["date"]) - first_date).days
        for dp in data_points
    ], dtype=float)
    e1rms = np.array([dp["best_e1rm"] for dp in data_points], dtype=float)

    # --- Linear regression ---
    lin_coeffs = np.polyfit(days, e1rms, 1)  # slope, intercept
    lin_slope = lin_coeffs[0]  # kg per day
    lin_pred = np.polyval(lin_coeffs, days)
    ss_res_lin = float(np.sum((e1rms - lin_pred) ** 2))
    ss_tot = float(np.sum((e1rms - np.mean(e1rms)) ** 2))
    r2_lin = 1.0 - ss_res_lin / ss_tot if ss_tot > 0 else 0.0

    # --- Logarithmic regression ---
    weeks = days / 7.0
    try:
        popt, _ = curve_fit(_log_func, weeks, e1rms, p0=[1.0, e1rms[0]], maxfev=5000)
        log_pred = _log_func(weeks, *popt)
        ss_res_log = float(np.sum((e1rms - log_pred) ** 2))
        r2_log = 1.0 - ss_res_log / ss_tot if ss_tot > 0 else 0.0
    except (RuntimeError, ValueError):
        r2_log = -1.0  # mark as failed
        popt = None

    # --- Choose the better model ---
    use_log = popt is not None and r2_log > r2_lin

    if use_log:
        model_name = "logarithmic"
        r_squared = round(r2_log, 4)
        last_week = weeks[-1]
        current_e1rm = float(_log_func(np.array([last_week]), *popt)[0])
        proj_4 = float(_log_func(np.array([last_week + 4]), *popt)[0])
        proj_8 = float(_log_func(np.array([last_week + 8]), *popt)[0])
        proj_12 = float(_log_func(np.array([last_week + 12]), *popt)[0])
        # Approximate rate: gain over the next 1 week at current position
        next_wk = float(_log_func(np.array([last_week + 1]), *popt)[0])
        rate_kg_week = next_wk - current_e1rm
    else:
        model_name = "linear"
        r_squared = round(r2_lin, 4)
        rate_kg_week = lin_slope * 7.0  # kg per week
        last_day = days[-1]
        current_e1rm = float(np.polyval(lin_coeffs, last_day))
        proj_4 = float(np.polyval(lin_coeffs, last_day + 28))
        proj_8 = float(np.polyval(lin_coeffs, last_day + 56))
        proj_12 = float(np.polyval(lin_coeffs, last_day + 84))

    rate_pct_week = (rate_kg_week / current_e1rm * 100) if current_e1rm > 0 else 0.0

    trend = {
        "model": model_name,
        "r_squared": r_squared,
        "rate_kg_per_week": round(rate_kg_week, 3),
        "rate_pct_per_week": round(rate_pct_week, 3),
    }
    projections = {
        "4_weeks": round(proj_4, 2),
        "8_weeks": round(proj_8, 2),
        "12_weeks": round(proj_12, 2),
    }

    # --- Flags ---
    flags: list[str] = []
    total_weeks = days[-1] / 7.0
    if total_weeks > 12 and rate_pct_week > 2.0:
        flags.append("unrealistic")
    # Stall detection: < 0.5 % gain over the last 4 weeks
    four_wk_ago = date.fromisoformat(data_points[-1]["date"]) - timedelta(weeks=4)
    recent = [dp for dp in data_points if date.fromisoformat(dp["date"]) >= four_wk_ago]
    if len(recent) >= 2:
        oldest_recent = recent[0]["best_e1rm"]
        newest_recent = recent[-1]["best_e1rm"]
        if oldest_recent > 0:
            pct_change = (newest_recent - oldest_recent) / oldest_recent * 100
            if pct_change < 0.5:
                flags.append("stalled")

    return trend, projections, flags


def _compute_prs(
    history: list[dict], data_points: list[dict],
) -> dict:
    """Compute all-time, recent-4-week, and per-rep PRs."""
    # All-time best e1RM
    all_time_e1rm = 0.0
    for dp in data_points:
        if dp["best_e1rm"] > all_time_e1rm:
            all_time_e1rm = dp["best_e1rm"]

    # Recent 4-week best e1RM
    cutoff = date.today() - timedelta(weeks=4)
    recent_e1rm = 0.0
    for dp in data_points:
        if date.fromisoformat(dp["date"]) >= cutoff:
            if dp["best_e1rm"] > recent_e1rm:
                recent_e1rm = dp["best_e1rm"]

    is_recent_pr = recent_e1rm >= all_time_e1rm and all_time_e1rm > 0

    # Per-rep PRs: best weight lifted at each rep count
    per_rep: dict[int, float] = {}
    for row in history:
        reps = row["reps_completed"]
        load = row["load_kg"]
        if reps not in per_rep or load > per_rep[reps]:
            per_rep[reps] = load

    return {
        "all_time_e1rm": round(all_time_e1rm, 2),
        "recent_4wk_e1rm": round(recent_e1rm, 2),
        "is_recent_pr": is_recent_pr,
        "per_rep_prs": dict(sorted(per_rep.items())),
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_exercise_progress(
    db: Session, exercise_name: str, user_id: int = 1,
) -> dict:
    """Returns progress data for a single exercise.

    Includes data points (best e1RM per date), trend analysis with
    linear/logarithmic regression, 4/8/12-week projections, stall and
    unrealistic-rate flags, and PR records.
    """
    history = _fetch_exercise_history(db, exercise_name, user_id)
    data_points = _best_per_date(history)
    trend, projections, flags = _fit_trend(data_points)
    prs = _compute_prs(history, data_points)

    result: dict = {
        "exercise_name": exercise_name,
        "data_points": data_points,
        "trend": trend,
        "projections": projections,
        "flags": flags,
        "prs": prs,
    }
    return result
