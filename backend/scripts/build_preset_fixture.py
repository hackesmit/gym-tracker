"""Build a preset fixture JSON from a Jeff Nippard program spreadsheet.

Usage:
    python -m scripts.build_preset_fixture <program.xlsx> <frequency> <out.json> \
        [--name "Program Name"] [--source-name "clean-file-name.xlsx"]

Example (the shipped Min-Max preset):
    python -m scripts.build_preset_fixture 2726Min-Max_Program_5x.xlsx 5 \
        app/fixtures/minmax_5x.json --source-name Min-Max_Program_5x.xlsx

The fixture carries program structure only (exercises, sets, rep ranges,
RPE, rest, substitutions, notes). Per-set load / reps tracking cells in the
sheet are the owner's personal log and are never exported.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.parser import parse_workbook  # noqa: E402


def build_fixture(
    xlsx: str | Path, frequency: int, name: str | None = None, source_name: str | None = None
) -> dict:
    parsed = parse_workbook(xlsx, frequency)
    exercises = parsed["exercises"]
    if not exercises:
        raise SystemExit(f"no exercises parsed from {xlsx} sheet {parsed['sheet_name']}")
    freq = parsed["detected_frequency"] or frequency
    title = name or parsed["title"] or "Program"
    forbidden = {"load", "load_kg", "reps_completed"}
    for ex in exercises:
        leaked = forbidden & set(ex)
        if leaked:
            raise SystemExit(f"refusing to export personal log fields {leaked}")
    return {
        "name": f"{title} ({freq}x/week)",
        "frequency": freq,
        "total_weeks": max(max(ex["week"] for ex in exercises), 12),
        "source_file": source_name or Path(xlsx).name,
        "exercises": exercises,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("xlsx")
    ap.add_argument("frequency", type=int)
    ap.add_argument("out")
    ap.add_argument("--name", default=None)
    ap.add_argument("--source-name", default=None, help="value for source_file (default: the xlsx file name)")
    args = ap.parse_args(argv)
    fixture = build_fixture(args.xlsx, args.frequency, args.name, args.source_name)
    Path(args.out).write_text(json.dumps(fixture, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {args.out}: {len(fixture['exercises'])} exercises, {fixture['frequency']}x/week")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
