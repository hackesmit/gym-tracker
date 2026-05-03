"""Verify every catalog entry's primary muscle group is mapped or excluded.

Acceptance criterion from the 2026-05-02 muscle-rank coverage audit spec:
every catalog entry whose `muscle_group_primary` is in MVP_GROUPS must
either appear in an EXERCISE_MAP / isolation / compound map for its
group, or be named in CATALOG_AUDIT with a non-empty reason.
"""

from app.muscle_rank_config import (
    ABS_BODYWEIGHT_FALLBACK,
    ABS_WEIGHTED_CRUNCHES,
    ARMS_BODYWEIGHT_DIPS,
    ARMS_CLOSE_GRIP_BENCH,
    ARMS_CURL_ISOLATION,
    ARMS_TRICEP_COMPOUND,
    ARMS_TRICEP_ISOLATION,
    ARMS_WEIGHTED_DIPS,
    BACK_BODYWEIGHT_PULLUPS,
    BACK_ROWS_PULLDOWNS,
    BACK_WEIGHTED_PULLUPS,
    CATALOG_AUDIT,
    CHEST_FLY_ISOLATION,
    EXERCISE_MAP,
    HAMSTRINGS_COMPOUND_PROXY,
    HAMSTRINGS_LEG_CURL_ISOLATION,
    MVP_GROUPS,
    QUADS_LEG_EXTENSION_ISOLATION,
    SHOULDERS_LATERAL_ISOLATION,
)
from app.seed_catalog import EXERCISE_CATALOG


def _all_mapped_canonical_names() -> set[str]:
    """Union of every canonical name the rank engine actually reads."""
    out: set[str] = set()
    for group_map in EXERCISE_MAP.values():
        out |= set(group_map.keys())
    out |= ABS_BODYWEIGHT_FALLBACK
    out |= set(ABS_WEIGHTED_CRUNCHES.keys())
    out |= ARMS_BODYWEIGHT_DIPS
    out |= ARMS_CLOSE_GRIP_BENCH
    out |= set(ARMS_CURL_ISOLATION.keys())
    out |= set(ARMS_TRICEP_COMPOUND.keys())
    out |= set(ARMS_TRICEP_ISOLATION.keys())
    out |= ARMS_WEIGHTED_DIPS
    out |= BACK_BODYWEIGHT_PULLUPS
    out |= set(BACK_ROWS_PULLDOWNS.keys())
    out |= BACK_WEIGHTED_PULLUPS
    out |= set(CHEST_FLY_ISOLATION.keys())
    out |= set(HAMSTRINGS_COMPOUND_PROXY.keys())
    out |= set(HAMSTRINGS_LEG_CURL_ISOLATION.keys())
    out |= set(QUADS_LEG_EXTENSION_ISOLATION.keys())
    out |= set(SHOULDERS_LATERAL_ISOLATION.keys())
    return {n.upper() for n in out}


def test_every_mvp_catalog_entry_is_mapped_or_excluded():
    """Each catalog entry whose primary muscle is in MVP_GROUPS must be
    accounted for — either in a pathway map OR in CATALOG_AUDIT as excluded.
    """
    mapped = _all_mapped_canonical_names()
    excluded_with_reason = {
        name.upper(): reason
        for name, reason in CATALOG_AUDIT.items()
    }

    missing = []
    for entry in EXERCISE_CATALOG:
        primary = entry.get("muscle_group_primary")
        if primary not in MVP_GROUPS:
            continue
        canonical = entry["canonical_name"].upper()
        if canonical in mapped:
            continue
        if canonical in excluded_with_reason:
            assert excluded_with_reason[canonical], (
                f"{canonical} is in CATALOG_AUDIT but its reason is empty"
            )
            continue
        missing.append(canonical)

    assert not missing, (
        f"{len(missing)} catalog entries with primary muscle in MVP_GROUPS "
        f"have no rank pathway and no CATALOG_AUDIT exclusion: {sorted(missing)}"
    )
