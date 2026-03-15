"""
Parser for Jeff Nippard program spreadsheets (.xlsx).

Reads structured workout sheets and returns a flat list of exercise dicts
suitable for database insertion.
"""

from __future__ import annotations

import datetime
import re
from pathlib import Path
from typing import Any

import openpyxl

# ---------------------------------------------------------------------------
# Normalization map: raw (uppercased, stripped) -> canonical name
# ---------------------------------------------------------------------------
NORMALIZATION_MAP: dict[str, str] = {
    "HAVK SQUAT (HEAVY)": "HACK SQUAT (HEAVY)",
    "HAVK SQUAT (BACK OFF)": "HACK SQUAT (BACK OFF)",
    "MACHINECRUNCH": "MACHINE CRUNCH",
    "INCLINE DUMBBEL PRESS": "INCLINE DUMBBELL PRESS",
    "INCLINE DUMBELL PRESS": "INCLINE DUMBBELL PRESS",
    "MACHINE LATTERAL RAISES": "MACHINE LATERAL RAISE",
    "LEG PRESS(HEAVY)": "LEG PRESS (HEAVY)",
    "LYING LEG CURLS": "LYING LEG CURL",
    "CABLE RUNCH": "CABLE CRUNCH",
    "TRICEP PRESSDOWN": "TRICEPS PRESSDOWN",
    "SEATED CALF EXTENSION": "SEATED CALF RAISE",
    "MACHINE PRESS (BACKOFF)": "MACHINE PRESS (BACK OFF)",
    "45\u00b0 BACK EXTENSION": "45-DEGREE BACK EXTENSION",
    "45' HYPEREXTENSION": "45-DEGREE HYPEREXTENSION",
}

# Regex for superset prefix, e.g. "A1: EZ BAR CURL" or "B2: CABLE CRUNCH"
_SUPERSET_RE = re.compile(r"^([A-Z])(\d):\s*(.+)$", re.IGNORECASE)

# Regex for WEEK header in column 0
_WEEK_RE = re.compile(r"^WEEK\s+(\d+)$", re.IGNORECASE)

# Known session names (used for validation, not detection)
_KNOWN_SESSIONS = {
    "UPPER BODY",
    "LOWER BODY",
    "FULL BODY",
    "FULL BODY A",
    "FULL BODY B",
    "PUSH",
    "PULL",
    "LEGS",
}


def _safe_str(value: Any) -> str | None:
    """Convert a cell value to a cleaned string, or None if empty."""
    if value is None:
        return None
    if isinstance(value, datetime.datetime):
        # Handle Excel misinterpreting rep ranges like "12-15" as dates.
        # datetime(2024, 12, 15) -> "12-15"
        return f"{value.month}-{value.day}"
    s = str(value).strip()
    return s if s else None


def _safe_int(value: Any) -> int:
    """Convert a cell value to int, defaulting to 0 for None/empty."""
    if value is None:
        return 0
    if isinstance(value, (int, float)):
        return int(value)
    s = str(value).strip()
    if not s:
        return 0
    try:
        return int(float(s))
    except (ValueError, TypeError):
        return 0


def _normalize_exercise(raw_name: str) -> tuple[str, bool, str | None]:
    """
    Normalize an exercise name.

    Returns:
        (canonical_name, is_superset, superset_group)
    """
    name = raw_name.strip()
    name = re.sub(r"\s+", " ", name)  # collapse whitespace

    # Check for superset prefix
    is_superset = False
    superset_group: str | None = None
    m = _SUPERSET_RE.match(name)
    if m:
        superset_group = m.group(1)  # e.g. "A"
        is_superset = True
        name = m.group(3).strip()

    # Apply normalization map
    upper = name.upper()
    if upper in NORMALIZATION_MAP:
        name = NORMALIZATION_MAP[upper]
    else:
        name = upper

    return name, is_superset, superset_group


def parse_program(file_path: str | Path, sheet_name: str) -> list[dict]:
    """
    Parse a workout program from a single sheet of the xlsx file.

    Args:
        file_path: Path to the .xlsx file.
        sheet_name: Name of the sheet to parse (e.g. "4x Week").

    Returns:
        List of exercise dicts with the schema described in the module docstring.
    """
    wb = openpyxl.load_workbook(str(file_path), data_only=True)
    ws = wb[sheet_name]

    exercises: list[dict] = []
    current_week: int = 0
    current_session: str | None = None
    session_order: int = 0  # 1-based within each week
    exercise_order: int = 0  # 1-based within each session

    for row in ws.iter_rows(min_row=1, max_row=ws.max_row, values_only=True):
        # Pad row to at least 11 columns
        cells = list(row) + [None] * max(0, 11 - len(row))

        col0 = _safe_str(cells[0])
        col1 = _safe_str(cells[1])

        # --- Skip empty rows ---
        if col0 is None and col1 is None:
            continue

        # --- Skip title row ---
        if col0 and "ESSENTIALS" in col0.upper():
            continue

        # --- Skip SUGGESTED rest day rows ---
        if col0 and "SUGGESTED" in col0.upper():
            continue

        # --- Week header row: "WEEK N" in col0, "EXERCISE" in col1 ---
        if col0:
            week_match = _WEEK_RE.match(col0.strip())
            if week_match:
                new_week = int(week_match.group(1))
                if new_week != current_week:
                    current_week = new_week
                    session_order = 0  # reset for new week
                # Skip header rows (col1 == "EXERCISE")
                if col1 and col1.upper() == "EXERCISE":
                    continue

        # --- Session header row: col0 has session name ---
        if col0:
            session_candidate = col0.strip().upper()
            # Check if col0 looks like a session name (not a WEEK header)
            if not _WEEK_RE.match(session_candidate) and "SUGGESTED" not in session_candidate:
                current_session = session_candidate
                session_order += 1
                exercise_order = 0
                # If col1 is present, fall through to process it as an exercise
                # If col1 is None (empty session like PUSH week 5), just continue
                if not col1:
                    continue

        # --- Exercise row: col1 has exercise name ---
        if col1 and col1.upper() != "EXERCISE":
            exercise_order += 1
            raw_name = col1.strip()
            canonical, is_superset, superset_group = _normalize_exercise(raw_name)

            warm_up = _safe_str(cells[2])
            working_sets = _safe_int(cells[3])
            reps = _safe_str(cells[4])
            # cells[5] is LOAD -- SKIP
            rpe = _safe_str(cells[6])
            rest = _safe_str(cells[7])
            sub1 = _safe_str(cells[8])
            sub2 = _safe_str(cells[9])
            notes = _safe_str(cells[10])

            exercises.append(
                {
                    "week": current_week,
                    "session_name": current_session or "UNKNOWN",
                    "session_order_in_week": session_order,
                    "exercise_order": exercise_order,
                    "exercise_name_raw": raw_name,
                    "exercise_name_canonical": canonical,
                    "warm_up_sets": warm_up if warm_up else "0",
                    "working_sets": working_sets,
                    "prescribed_reps": reps or "",
                    "prescribed_rpe": rpe or "",
                    "rest_period": rest or "",
                    "substitution_1": sub1,
                    "substitution_2": sub2,
                    "notes": notes,
                    "is_superset": is_superset,
                    "superset_group": superset_group,
                }
            )

    wb.close()
    return exercises


# ---------------------------------------------------------------------------
# CLI test harness
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import json
    import sys

    xlsx_path = (
        sys.argv[1]
        if len(sys.argv) > 1
        else r"Jeff Nippard - The Essentials  2.xlsx"
    )

    sheets = ["2x Week", "3x Week", "4x Week", "5x Week"]
    all_canonical: set[str] = set()

    for sheet in sheets:
        results = parse_program(xlsx_path, sheet)
        print(f"\n{'='*60}")
        print(f"Sheet: {sheet}")
        print(f"  Total exercises parsed: {len(results)}")

        sessions_by_week: dict[int, list[str]] = {}
        for ex in results:
            w = ex["week"]
            s = ex["session_name"]
            if w not in sessions_by_week:
                sessions_by_week[w] = []
            if s not in sessions_by_week[w]:
                sessions_by_week[w].append(s)
            all_canonical.add(ex["exercise_name_canonical"])

        print(f"  Weeks: {sorted(sessions_by_week.keys())}")
        for w in sorted(sessions_by_week.keys()):
            print(f"    Week {w}: {sessions_by_week[w]}")

        # Check for LOAD leakage -- verify no exercise has a 'load' key
        for ex in results:
            if "load" in ex:
                print(f"  ERROR: LOAD found in exercise: {ex}")

        # Check duplicates within week+session+exercise_order
        seen: set[tuple] = set()
        for ex in results:
            key = (ex["week"], ex["session_name"], ex["session_order_in_week"], ex["exercise_order"])
            if key in seen:
                print(f"  DUPLICATE: week={ex['week']} session={ex['session_name']} "
                      f"order={ex['session_order_in_week']} ex_order={ex['exercise_order']} "
                      f"name={ex['exercise_name_canonical']}")
            seen.add(key)

        # Print supersets
        supersets = [ex for ex in results if ex["is_superset"]]
        print(f"  Supersets: {len(supersets)}")
        for ss in supersets[:5]:
            print(f"    Week {ss['week']} {ss['session_name']}: "
                  f"group={ss['superset_group']} raw={ss['exercise_name_raw']}")

    print(f"\n{'='*60}")
    print(f"All unique canonical exercise names ({len(all_canonical)}):")
    for name in sorted(all_canonical):
        print(f"  {name}")
