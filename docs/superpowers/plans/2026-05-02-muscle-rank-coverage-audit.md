# Muscle Rank Coverage Audit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every catalog exercise contribute to its primary muscle group's rank with research-calibrated thresholds; split arms into independent biceps/triceps groups; add abs as a ranked group.

**Architecture:** Extend the existing hybrid-pathway pattern (anchor + secondary in ELO space) symmetrically across all groups. Add new isolation-pathway threshold tables sourced from Strength Level percentiles. Introduce a `MAX_ISOLATION_ONLY_ELO = 2500` cap so pure-isolation lifters can reach Diamond at most. One-shot lifespan migration deletes legacy `arms` MuscleScore rows and recomputes against unbounded historical lookback so users get instant credit for old logs.

**Tech Stack:** FastAPI, SQLAlchemy, pytest (backend); React + Vite (frontend). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-02-muscle-rank-coverage-audit-design.md`

---

## File Structure

**Backend modify:**
- `backend/app/muscle_rank_config.py` — new threshold tables, isolation maps, `MAX_ISOLATION_ONLY_ELO`, `MVP_GROUPS` change, recalibrations, `MANUAL_1RM_KEY` extension, `CATALOG_AUDIT` table.
- `backend/app/rank_engine.py` — new per-group computers, `lookback_days_override` parameter, removal of `arms` special case.
- `backend/app/routers/ranks.py` — labels/metric maps, `_group_exercises` branches.
- `backend/app/main.py` — `split_arms_2026_05` lifespan migration block.
- `backend/tests/test_ranks.py` — update `arms` → `biceps`/`triceps` assertions; add new pathway tests.

**Backend create:**
- `backend/tests/test_catalog_audit.py` — completeness assertion (every catalog primary-group entry is mapped or excluded with reason).

**Frontend create:**
- `frontend/src/constants/muscleGroups.js` — shared `MUSCLE_LABELS` constant.

**Frontend modify:**
- `frontend/src/components/BodyMap.jsx` — biceps/triceps region split.
- `frontend/src/pages/Profile.jsx`, `UserProfile.jsx`, `Compare.jsx` — import shared labels.
- `frontend/src/pages/Settings.jsx` — manual 1RM rows for biceps_curl, dip, cable_crunch.
- `frontend/src/i18n.js` — en/es strings.

---

## Task 1 — Add new threshold tables and constants to `muscle_rank_config.py`

**Files:**
- Modify: `backend/app/muscle_rank_config.py`

- [ ] **Step 1: Open `muscle_rank_config.py` and add `MAX_ISOLATION_ONLY_ELO` constant near the existing hygiene/outlier constants (after `MAX_ADDED_RATIO_FOR_BACK_ARMS`).**

```python
# Pure-isolation cap. When a group's anchor pathway has no data (e.g. user
# only logs leg curls, never a deadlift), the secondary/isolation pathway's
# ELO is clipped to this floor before blending. Champion always requires
# anchor evidence — isolation alone tops out at Diamond V (ELO 2500).
# Exempt groups: shoulders (lateral cap is natural), back (uses max() of
# weighted/rep paths), abs (no clean anchor — weighted and rep are co-equal).
MAX_ISOLATION_ONLY_ELO = 2500
```

- [ ] **Step 2: Append five new threshold tables after the existing `LATERAL_THRESHOLDS` block (around line 419).**

```python
# 2026-05-02: Isolation pathway threshold tables for the rank coverage audit.
# All numbers sourced from strengthlevel.com percentile data for adult males
# at 80 kg BW reference. Mapping: Beginner→Bronze, Novice→Silver,
# Intermediate→Gold, mid-Advanced→Platinum, Advanced→Diamond, Elite→Champion.

LEG_CURL_THRESHOLDS: dict[str, float] = {
    "Bronze":   0.40,
    "Silver":   0.65,
    "Gold":     1.00,
    "Platinum": 1.30,
    "Diamond":  1.60,
    "Champion": 1.90,
}

LEG_EXTENSION_THRESHOLDS: dict[str, float] = {
    "Bronze":   0.50,
    "Silver":   0.80,
    "Gold":     1.25,
    "Platinum": 1.75,
    "Diamond":  2.10,
    "Champion": 2.40,
}

CHEST_FLY_THRESHOLDS: dict[str, float] = {
    "Bronze":   0.10,
    "Silver":   0.25,
    "Gold":     0.50,
    "Platinum": 0.85,
    "Diamond":  1.10,
    "Champion": 1.30,
}

ABS_WEIGHTED_THRESHOLDS: dict[str, float] = {
    "Bronze":   0.25,
    "Silver":   0.55,
    "Gold":     1.00,
    "Platinum": 1.50,
    "Diamond":  1.90,
    "Champion": 2.20,
}

ABS_FALLBACK_REPS: dict[str, int] = {
    "Bronze":   1,
    "Silver":   7,
    "Gold":     18,
    "Platinum": 28,
    "Diamond":  38,
    "Champion": 48,
}
```

- [ ] **Step 3: Replace the existing `TRICEP_ISOLATION_THRESHOLDS` block with the recalibrated raw-ratio version.**

Find the existing block:

```python
TRICEP_ISOLATION_THRESHOLDS: dict[str, float] = {
    "Bronze":   0.08,
    "Silver":   0.15,
    "Gold":     0.22,
    "Platinum": 0.30,
    "Diamond":  0.40,
    "Champion": 0.55,
}
```

Replace with:

```python
# 2026-05-02 recalibration. Old values (0.08→0.55) were spec-discounted; an
# Elite tricep pushdown landed only at Gold under the old combo of low
# threshold + 0.25 spec multiplier. New values are raw e1RM/BW ratios
# matching strengthlevel.com Beginner→Elite percentiles. Spec multipliers
# in `ARMS_TRICEP_ISOLATION` are now 1.0 (no discount).
TRICEP_ISOLATION_THRESHOLDS: dict[str, float] = {
    "Bronze":   0.30,
    "Silver":   0.50,
    "Gold":     0.75,
    "Platinum": 1.00,
    "Diamond":  1.20,
    "Champion": 1.40,
}
```

- [ ] **Step 4: Replace the `ARMS_TRICEP_ISOLATION` map's spec values with 1.0 across the board.**

Find the existing block (around line 382):

```python
ARMS_TRICEP_ISOLATION: dict[str, float] = {
    "TRICEPS PRESSDOWN":               0.25,
    "TRICEP PRESSDOWN":                0.25,
    "MACHINE TRICEPS EXTENSION":       0.35,
    "OVERHEAD CABLE TRICEPS EXTENSIONS": 0.25,
    "OVERHEAD CABLE TRICEP EXTENSION": 0.25,
    "DB TRICEPS KICKBACK":             0.35,
    "CABLE TRICEPS KICKBACK":          0.20,
}
```

Replace with:

```python
# 2026-05-02: spec multipliers all 1.0 — the new TRICEP_ISOLATION_THRESHOLDS
# table operates on raw e1RM/BW ratios.
ARMS_TRICEP_ISOLATION: dict[str, float] = {
    "TRICEPS PRESSDOWN":                 1.0,
    "TRICEP PRESSDOWN":                  1.0,
    "MACHINE TRICEPS EXTENSION":         1.0,
    "OVERHEAD CABLE TRICEPS EXTENSIONS": 1.0,
    "OVERHEAD CABLE TRICEP EXTENSION":   1.0,
    "DB TRICEPS KICKBACK":               1.0,
    "CABLE TRICEPS KICKBACK":            1.0,
}
```

- [ ] **Step 5: Tighten the back thresholds in `MUSCLE_RANK_THRESHOLDS["back"]`.**

Find:

```python
"back": {
    "metric": "weighted_pullup_added_over_bodyweight",
    "thresholds": {
        "Bronze":   0.00,
        "Silver":   0.25,
        "Gold":     0.50,
        "Platinum": 0.75,
        "Diamond":  1.25,
        "Champion": 1.50,
    },
```

Change Diamond and Champion only:

```python
"back": {
    "metric": "weighted_pullup_added_over_bodyweight",
    "thresholds": {
        "Bronze":   0.00,
        "Silver":   0.25,
        "Gold":     0.50,
        "Platinum": 0.75,
        "Diamond":  1.00,    # 2026-05-02: was 1.25; published Elite is +1.08 BW
        "Champion": 1.20,    # 2026-05-02: was 1.50; aligns with weighted-dip cap
    },
```

- [ ] **Step 6: Commit.**

```bash
cd "backend"
git add app/muscle_rank_config.py
git commit -m "feat(rank): add isolation thresholds + recalibrate tricep/back

Sourced from strengthlevel.com percentile data:
- LEG_CURL, LEG_EXTENSION, CHEST_FLY, ABS_WEIGHTED, ABS_FALLBACK_REPS tables
- TRICEP_ISOLATION_THRESHOLDS bumped to raw-ratio scale (was spec-discounted)
- ARMS_TRICEP_ISOLATION spec multipliers all 1.0
- back Diamond 1.25→1.00, Champion 1.50→1.20

MAX_ISOLATION_ONLY_ELO = 2500 added; pure-isolation lifters cap at Diamond.

Pure data-only commit. Engine wiring follows in subsequent commits."
```

---

## Task 2 — Add isolation/pathway maps to `muscle_rank_config.py`

**Files:**
- Modify: `backend/app/muscle_rank_config.py`

- [ ] **Step 1: Add new pathway maps after the threshold tables from Task 1.**

```python
# 2026-05-02: per-group isolation pathway maps for the rank coverage audit.
# Each entry maps a canonical exercise name to a specificity multiplier (raw
# e1RM input is multiplied by this before comparison against the group's
# isolation threshold table). DB variants use the per-hand × 2 convention
# already established in EXERCISE_MAP (a 30 kg per-hand DB fly contributes
# 60 kg system load).

HAMSTRINGS_LEG_CURL_ISOLATION: dict[str, float] = {
    "SEATED HAMSTRING CURL":  1.00,
    "SEATED LEG CURL":        1.00,
    "LYING LEG CURL":         1.00,
    "NORDIC HAM CURL":        1.20,    # bodyweight + eccentric — reads `load_kg=BW` post-migration
}

# Hyperextension / glute-ham raise — low-spec compound proxy that contributes
# to hamstrings via the leg-curl threshold table. They're hip-hinge bodyweight
# exercises; treat them as low-grade leg-curl-equivalent work.
HAMSTRINGS_COMPOUND_PROXY: dict[str, float] = {
    "GLUTE-HAM RAISE":          0.60,
    "45-DEGREE BACK EXTENSION": 0.40,
    "45-DEGREE HYPEREXTENSION": 0.40,
}

QUADS_LEG_EXTENSION_ISOLATION: dict[str, float] = {
    "LEG EXTENSION":           1.00,
    "SINGLE-LEG EXTENSION":    1.40,    # unilateral — per-leg load × 1.4 transferability
}

CHEST_FLY_ISOLATION: dict[str, float] = {
    # Cable / machine — face value
    "CABLE CHEST FLY":   1.00,
    "MACHINE CHEST FLY": 1.00,
    "PEC DECK":          1.00,
    # DB variant — per-hand × 2 (matches DB curl/lateral convention)
    "DB CHEST FLY":      2.00,
    "DB FLYE":           2.00,
}

# Abs — weighted crunch e1RM/BW pathway.
ABS_WEIGHTED_CRUNCHES: dict[str, float] = {
    "CABLE CRUNCH":          1.00,
    "MACHINE CRUNCH":        1.00,
    "ROMAN CHAIR CRUNCH":    0.80,    # bodyweight + plate; less precise loading
    "PLATE-WEIGHTED CRUNCH": 0.85,
}

# Abs — strict-form bodyweight rep fallback.
ABS_BODYWEIGHT_FALLBACK: set[str] = {
    "HANGING LEG RAISE",
    "LEG RAISES",
    "TWO-ARMS TWO-LEGS DEAD BUG",
}
```

- [ ] **Step 2: Update `MVP_GROUPS` to the 8-group list.**

Find:

```python
MVP_GROUPS = ["chest", "back", "shoulders", "quads", "hamstrings", "arms"]
```

Replace with:

```python
# 2026-05-02: arms split into biceps + triceps for weak-point visualization;
# abs added as a ranked group. Calves stays unranked (still in catalog for
# volume tracking but no rank engine reads it).
MVP_GROUPS = ["chest", "back", "shoulders", "quads", "hamstrings", "biceps", "triceps", "abs"]
```

- [ ] **Step 3: Replace the `"arms"` entry in `MUSCLE_RANK_THRESHOLDS` with `"biceps"`, `"triceps"`, and `"abs"`.**

Find the existing block (around line 116):

```python
# Arms — weighted dip ADDED-load / bodyweight.
"arms": {
    "metric": "weighted_dip_added_over_bodyweight",
    "thresholds": {
        "Bronze":   0.00,
        "Silver":   0.25,
        "Gold":     0.50,
        "Platinum": 0.75,
        "Diamond":  1.25,
        "Champion": 1.50,
    },
},
```

Replace with three entries:

```python
# Biceps — display table for the Profile progress bar reverse-mapping. Actual
# rank is determined by the blended ELO of (back ELO × 0.7 + curl ELO × 0.3).
"biceps": {
    "metric": "weighted_pullup_added_over_bodyweight_blended_with_curl_isolation",
    "thresholds": {
        "Bronze":   0.00,
        "Silver":   0.25,
        "Gold":     0.50,
        "Platinum": 0.75,
        "Diamond":  1.00,
        "Champion": 1.20,
    },
},
# Triceps — display table; actual rank = blended ELO of
# (max(chest, shoulder-press) ELO + dip-anchor ELO) × 0.7 + tricep_iso × 0.3.
"triceps": {
    "metric": "weighted_dip_added_over_bodyweight_blended_with_tricep_isolation",
    "thresholds": {
        "Bronze":   0.00,
        "Silver":   0.25,
        "Gold":     0.50,
        "Platinum": 0.75,
        "Diamond":  1.25,
        "Champion": 1.50,
    },
},
# Abs — display table; actual rank = best of weighted-crunch e1RM/BW path or
# bodyweight rep fallback (max() across paths, like back).
"abs": {
    "metric": "weighted_crunch_1rm_over_bodyweight_or_strict_rep_count",
    "thresholds": ABS_WEIGHTED_THRESHOLDS,
},
```

Note the `"abs"` entry references the `ABS_WEIGHTED_THRESHOLDS` constant defined in Task 1 — Python lets us point at the existing dict to avoid duplication.

- [ ] **Step 4: Update `MANUAL_1RM_KEY` to add the new group keys.**

Find:

```python
MANUAL_1RM_KEY: dict[str, str] = {
    "chest":          "bench",
    "quads":          "squat",
    "hamstrings":     "deadlift",
    "shoulders":      "ohp",
    # Back/arms added-load 1RMs (optional manual entry).
    "back_added":     "pullup",
    "arms_added":     "dip",
}
```

Replace with:

```python
MANUAL_1RM_KEY: dict[str, str] = {
    "chest":          "bench",
    "quads":          "squat",
    "hamstrings":     "deadlift",
    "shoulders":      "ohp",
    # Back/arms added-load 1RMs (optional manual entry).
    "back_added":     "pullup",
    "arms_added":     "dip",        # legacy alias — still read by triceps anchor
    # 2026-05-02 split — new keys for biceps/triceps/abs ranks. The triceps
    # anchor reads "arms_added" (above) for the dip 1RM and ALSO the new
    # "triceps_added" key below as a future-proof alias; resolver picks the
    # higher of the two.
    "triceps_added": "dip",
    "biceps":         "biceps_curl",
    "abs":            "cable_crunch",
}
```

- [ ] **Step 5: Commit.**

```bash
cd "backend"
git add app/muscle_rank_config.py
git commit -m "feat(rank): add isolation pathway maps + split MVP_GROUPS

- HAMSTRINGS_LEG_CURL_ISOLATION + HAMSTRINGS_COMPOUND_PROXY
- QUADS_LEG_EXTENSION_ISOLATION
- CHEST_FLY_ISOLATION
- ABS_WEIGHTED_CRUNCHES + ABS_BODYWEIGHT_FALLBACK
- MVP_GROUPS: arms → biceps + triceps + abs (now 8 groups)
- MUSCLE_RANK_THRESHOLDS: replace arms entry with biceps/triceps/abs
- MANUAL_1RM_KEY: add triceps_added/biceps/abs entries

Tests will fail until the engine catches up — that's the next commit."
```

---

## Task 3 — Update `test_ranks.py` for the new MVP_GROUPS list

**Files:**
- Modify: `backend/tests/test_ranks.py`

The previous commit broke existing tests because they reference `"arms"` keys. Fix them per the spec's Section "Tests" → "Update existing assertions."

- [ ] **Step 1: Run the existing test suite to confirm what's broken.**

```bash
cd backend
pytest tests/test_ranks.py -x --tb=short 2>&1 | head -60
```

Expected: KeyError or assertion failures referencing `"arms"`.

- [ ] **Step 2: Fix `test_standards_back_and_arms_have_qualifying_exercises` (line 55).**

Replace:

```python
def test_standards_back_and_arms_have_qualifying_exercises(db, client):
    """Back and arms pull their qualifying exercises from pathway-specific catalogs."""
    body = client.get("/api/ranks/standards").json()
    back = next(g for g in body["groups"] if g["key"] == "back")
    arms = next(g for g in body["groups"] if g["key"] == "arms")
    # Sanity — each group should have at least a handful of named lifts
    assert len(back["qualifying_exercises"]) >= 5
    assert len(arms["qualifying_exercises"]) >= 5
    # Spot-check: back should include a pullup variant; arms should include dips
    assert any("PULLUP" in e or "PULL-UP" in e or "PULL UP" in e for e in back["qualifying_exercises"])
    assert any("DIP" in e for e in arms["qualifying_exercises"])
```

With:

```python
def test_standards_back_biceps_triceps_have_qualifying_exercises(db, client):
    """Back, biceps, triceps pull their qualifying exercises from pathway-specific catalogs."""
    body = client.get("/api/ranks/standards").json()
    back = next(g for g in body["groups"] if g["key"] == "back")
    biceps = next(g for g in body["groups"] if g["key"] == "biceps")
    triceps = next(g for g in body["groups"] if g["key"] == "triceps")
    assert len(back["qualifying_exercises"]) >= 5
    assert len(biceps["qualifying_exercises"]) >= 5
    assert len(triceps["qualifying_exercises"]) >= 5
    assert any("PULLUP" in e or "PULL-UP" in e or "PULL UP" in e for e in back["qualifying_exercises"])
    assert any("CURL" in e for e in biceps["qualifying_exercises"])
    assert any("DIP" in e for e in triceps["qualifying_exercises"])
```

- [ ] **Step 3: Fix `test_standards_arms_includes_isolation_pools` (line 68).**

Replace:

```python
def test_standards_arms_includes_isolation_pools(db, client):
    """Arms qualifying exercises include curl + tricep isolation pools the engine actually scores."""
    body = client.get("/api/ranks/standards").json()
    arms = next(g for g in body["groups"] if g["key"] == "arms")
    exercises = arms["qualifying_exercises"]
    assert any("CURL" in e for e in exercises)
    assert any("PRESSDOWN" in e or "TRICEPS EXTENSION" in e or "TRICEP EXTENSION" in e or "KICKBACK" in e for e in exercises)
```

With:

```python
def test_standards_biceps_triceps_include_isolation_pools(db, client):
    """Biceps and triceps qualifying exercises include their respective isolation pools."""
    body = client.get("/api/ranks/standards").json()
    biceps = next(g for g in body["groups"] if g["key"] == "biceps")
    triceps = next(g for g in body["groups"] if g["key"] == "triceps")
    assert any("CURL" in e for e in biceps["qualifying_exercises"])
    assert any(
        "PRESSDOWN" in e or "TRICEPS EXTENSION" in e or "TRICEP EXTENSION" in e or "KICKBACK" in e
        for e in triceps["qualifying_exercises"]
    )
```

- [ ] **Step 4: Fix `test_bench_ratio_maps_to_expected_tier` (line 135).**

The test currently asserts `result["arms"]["rank"] == "Bronze"`. After the split, bench feeds the triceps anchor (via the chest/shoulder-press pathway in `_compute_triceps`) but not biceps. Update:

Find lines 138-152 and replace the docstring + final assertion:

```python
def test_bench_ratio_maps_to_expected_tier(db):
    """A ~1.17x bodyweight bench e1RM should land chest in Gold.

    Under the post-2026-05-02 split, bench transfers to triceps via the
    press anchor pathway (no curl/iso work), so triceps climbs to Bronze
    (~half of the press-only tier). Biceps stays Copper (no back work).
    Quads, hams, shoulders, back stay Copper — bench doesn't feed them.
    Abs stays Copper — bench doesn't feed it.
    """
    user = db.query(User).first()
    user.bodyweight_kg = 80.0
    db.commit()
    _seed_bench(db, user, load_kg=80, reps=5)
    result = recompute_for_user(db, user.id)
    assert result["chest"]["rank"] == "Gold"
    for g in ("quads", "hamstrings", "shoulders", "back", "biceps", "abs"):
        assert result[g]["rank"] == "Copper"
    assert result["triceps"]["rank"] == "Bronze"
```

- [ ] **Step 5: Fix `test_thresholds_match_spec` (line 155).**

Replace the `"arms"` assertion with biceps + triceps + abs equivalents and update back's tightened cap:

```python
def test_thresholds_match_spec():
    """Guardrail — regressions in the threshold table should fail loudly."""
    assert MUSCLE_RANK_THRESHOLDS["chest"]["thresholds"]["Champion"] == 2.00
    assert MUSCLE_RANK_THRESHOLDS["quads"]["thresholds"]["Champion"] == 3.00
    assert MUSCLE_RANK_THRESHOLDS["hamstrings"]["thresholds"]["Champion"] == 3.25
    assert MUSCLE_RANK_THRESHOLDS["shoulders"]["thresholds"]["Champion"] == 1.25
    # 2026-05-02: back tightened from 1.50 to 1.20 to match published Elite +1.08 BW
    assert MUSCLE_RANK_THRESHOLDS["back"]["thresholds"]["Champion"] == 1.20
    assert MUSCLE_RANK_THRESHOLDS["back"]["thresholds"]["Diamond"] == 1.00
    # Biceps display table = pullup-added scale tightened to match back
    assert MUSCLE_RANK_THRESHOLDS["biceps"]["thresholds"]["Champion"] == 1.20
    # Triceps display table = original arms scale (weighted-dip-added)
    assert MUSCLE_RANK_THRESHOLDS["triceps"]["thresholds"]["Champion"] == 1.50
    # Abs display table = weighted crunch e1RM/BW (research-calibrated)
    assert MUSCLE_RANK_THRESHOLDS["abs"]["thresholds"]["Champion"] == 2.20
```

- [ ] **Step 6: Walk through the rest of `test_ranks.py` and replace every `result["arms"]` lookup with the appropriate biceps or triceps lookup.**

Search the file:

```bash
cd backend
grep -n 'result\["arms"\]\|"arms"' tests/test_ranks.py
```

Decision rule for each occurrence:
- Seeded exercise is a curl variant, weighted pullup, bodyweight pullup, or row → assert against `result["biceps"]`.
- Seeded exercise is a dip, close-grip bench, skull crusher, JM press, or tricep isolation → assert against `result["triceps"]`.
- Seeded exercise is bench / incline bench / OHP / DB shoulder press (the press anchor for triceps) → assert against `result["triceps"]`.

**Worked example.** The existing test at line ~410 (`test_arms_dip_only_lifts_arms_off_copper` or similar — check actual name with the grep above):

```python
def test_arms_dip_only_lifts_arms_off_copper(db):
    user = db.query(User).first()
    user.bodyweight_kg = 80.0
    db.commit()
    _seed_exercise(db, user, "WEIGHTED DIP", "arms", load_kg=40, reps=1, day_offset=2)
    result = recompute_for_user(db, user.id)
    assert result["arms"]["rank"] == "Bronze"
    assert result["arms"]["elo"] > 500
```

Becomes:

```python
def test_dip_only_lifts_triceps_off_copper(db):
    user = db.query(User).first()
    user.bodyweight_kg = 80.0
    db.commit()
    _seed_exercise(db, user, "WEIGHTED DIP", "triceps", load_kg=40, reps=1, day_offset=2)
    result = recompute_for_user(db, user.id)
    assert result["triceps"]["rank"] in ("Bronze", "Silver")
    assert result["triceps"]["elo"] > 500
    assert result["biceps"]["rank"] == "Copper"   # no biceps work seeded
```

Apply the same shape to every remaining `result["arms"]` lookup.

- [ ] **Step 7: Run the suite and confirm only the *new* feature tests are failing (not the migrated-key tests).**

```bash
cd backend
pytest tests/test_ranks.py --tb=short 2>&1 | tail -40
```

Expected: existing tests pass except for any that reference unimplemented engine code (which the next tasks add).

- [ ] **Step 8: Commit.**

```bash
cd backend
git add tests/test_ranks.py
git commit -m "test(rank): migrate existing test_ranks.py for arms→biceps/triceps split

Existing assertions that read result['arms'] now route to biceps or
triceps depending on which pathway the seeded exercise feeds. Threshold
guardrails also extended to cover biceps/triceps/abs."
```

---

## Task 4 — Add `lookback_days_override` parameter to `recompute_for_user` / `recompute_all`

**Files:**
- Modify: `backend/app/rank_engine.py`
- Modify: `backend/tests/test_ranks.py`

- [ ] **Step 1: Write the failing test FIRST.**

Append to `backend/tests/test_ranks.py`:

```python
def test_recompute_with_lookback_override_includes_old_logs(db):
    """Migration override: passing lookback_days_override credits historical
    logs older than the standard 90-day window.
    """
    user = db.query(User).first()
    user.bodyweight_kg = 80.0
    db.commit()
    # Seed a bench 200 days ago — outside the default 90-day window.
    _seed_bench(db, user, load_kg=80, reps=5, day_offset=200)

    # Default: should NOT credit the old lift.
    default = recompute_for_user(db, user.id)
    assert default["chest"]["rank"] == "Copper"

    # Override: should credit it.
    override = recompute_for_user(db, user.id, lookback_days_override=9999)
    assert override["chest"]["rank"] == "Gold"

    # Subsequent default-call should drop back to Copper (rank persists in DB
    # but recompute overwrites it on next read).
    default2 = recompute_for_user(db, user.id)
    assert default2["chest"]["rank"] == "Copper"
```

- [ ] **Step 2: Run the test and verify it fails.**

```bash
cd backend
pytest tests/test_ranks.py::test_recompute_with_lookback_override_includes_old_logs -v
```

Expected: FAIL with `TypeError: recompute_for_user() got an unexpected keyword argument 'lookback_days_override'`.

- [ ] **Step 3: Implement the parameter.**

In `backend/app/rank_engine.py`, find `def recompute_for_user(db: Session, user_id: int) -> dict[str, dict]:` (around line 652) and update the signature + cutoff calculation:

```python
def recompute_for_user(
    db: Session,
    user_id: int,
    lookback_days_override: int | None = None,
) -> dict[str, dict]:
    """Recompute & persist fixed-threshold muscle ranks for a single user.

    Returns `{group: {"score", "rank", "sub_index", "sub_label",
                       "rank_index", "elo", "ratio", "source"}}`.

    `lookback_days_override` (default None → use `LOOKBACK_DAYS = 90`) lets
    the one-shot split_arms_2026_05 migration credit historical logs.
    """
    user = db.get(User, user_id)
    if user is None:
        return {}

    bw = _resolve_bodyweight(db, user)
    today = date.today()
    days = lookback_days_override if lookback_days_override is not None else LOOKBACK_DAYS
    cutoff = today - timedelta(days=days)
```

Then find `def recompute_all(db: Session) -> dict:` (around line 817) and update similarly:

```python
def recompute_all(
    db: Session,
    lookback_days_override: int | None = None,
) -> dict:
    """Recompute ranks for every user. Failures for a single user are
    swallowed so one bad user can't block the whole startup recompute.

    `lookback_days_override` is forwarded to `recompute_for_user`.
    """
    processed = 0
    failed: list[tuple[int, str]] = []
    for u in db.query(User).all():
        try:
            recompute_for_user(db, u.id, lookback_days_override=lookback_days_override)
            processed += 1
        except Exception as exc:
            failed.append((u.id, repr(exc)))
            print(
                f"recompute_all: user_id={u.id} username={u.username!r} "
                f"failed: {exc!r}",
                flush=True,
            )
    return {"processed": processed, "failed": failed}
```

- [ ] **Step 4: Run the new test.**

```bash
cd backend
pytest tests/test_ranks.py::test_recompute_with_lookback_override_includes_old_logs -v
```

Expected: PASS.

- [ ] **Step 5: Run the full rank suite to make sure nothing regressed.**

```bash
cd backend
pytest tests/test_ranks.py --tb=short
```

Expected: all previously-passing tests still pass.

- [ ] **Step 6: Commit.**

```bash
cd backend
git add app/rank_engine.py tests/test_ranks.py
git commit -m "feat(rank): add lookback_days_override for one-shot migration

Allows the upcoming split_arms_2026_05 migration to credit historical
WorkoutLog rows beyond the default 90-day window. Default behavior
unchanged — only the migration block passes a non-default value."
```

---

## Task 5 — Add `_compute_abs` for the new abs ranked group

**Files:**
- Modify: `backend/app/rank_engine.py`
- Modify: `backend/tests/test_ranks.py`

- [ ] **Step 1: Write the failing tests FIRST.**

Append to `backend/tests/test_ranks.py`:

```python
def test_abs_weighted_crunch_populates_abs_rank(db):
    """A ~Gold-tier cable crunch (1.0× BW e1RM) lands abs at Gold."""
    user = db.query(User).first()
    user.bodyweight_kg = 80.0
    db.commit()
    # 80 kg @ 1 rep = 1.0× BW e1RM = Gold floor on ABS_WEIGHTED_THRESHOLDS.
    _seed_exercise(db, user, "CABLE CRUNCH", "abs", load_kg=80, reps=1)
    result = recompute_for_user(db, user.id)
    assert result["abs"]["rank"] == "Gold"


def test_abs_rep_fallback_uses_hanging_leg_raise(db):
    """Hanging leg raises with 0 load fall back to rep-count tiers."""
    user = db.query(User).first()
    user.bodyweight_kg = 80.0
    db.commit()
    # 18 strict reps = Gold floor on ABS_FALLBACK_REPS.
    _seed_exercise(db, user, "HANGING LEG RAISE", "abs", load_kg=0, reps=18)
    result = recompute_for_user(db, user.id)
    assert result["abs"]["rank"] in ("Gold", "Platinum")  # size_bonus may bump


def test_abs_size_bonus_applies_to_rep_fallback(db):
    """A heavier athlete's reps count more (size_bonus = (BW/80)^0.5)."""
    light = db.query(User).first()
    light.bodyweight_kg = 60.0
    db.commit()
    _seed_exercise(db, light, "HANGING LEG RAISE", "abs", load_kg=0, reps=18)
    light_result = recompute_for_user(db, light.id)

    # New user @ 100 kg with same reps — should rank ≥ light user.
    from app.models import User as UserModel
    heavy = UserModel(username="heavy_test", password_hash="x", bodyweight_kg=100.0)
    db.add(heavy)
    db.commit()
    _seed_exercise(db, heavy, "HANGING LEG RAISE", "abs", load_kg=0, reps=18, day_offset=2)
    heavy_result = recompute_for_user(db, heavy.id)

    from app.muscle_rank_config import rank_score
    light_score = rank_score(light_result["abs"]["rank"], light_result["abs"]["sub_index"])
    heavy_score = rank_score(heavy_result["abs"]["rank"], heavy_result["abs"]["sub_index"])
    assert heavy_score >= light_score
```

- [ ] **Step 2: Run the tests and verify they fail.**

```bash
cd backend
pytest tests/test_ranks.py -k "abs" -v
```

Expected: tests FAIL because the engine doesn't yet have an `abs` resolver — `recompute_for_user` will probably return `{"abs": {"rank": "Copper", ...}}` since `abs` is in `MVP_GROUPS` but no compute path handles it.

- [ ] **Step 3: Add `_compute_abs` to `rank_engine.py`.**

Add this function after `_compute_shoulders_hybrid` (around line 627):

```python
def _compute_abs(
    db: Session,
    user_id: int,
    bw_kg: float,
    cutoff: date,
) -> _Result:
    """Abs rank — best of weighted crunch e1RM/BW or strict rep fallback.

    Mirrors the back rank's max(weighted_tier, rep_tier) pattern. Weighted
    pathway uses ABS_WEIGHTED_THRESHOLDS; rep fallback uses
    ABS_FALLBACK_REPS with size_bonus applied.
    """
    abs_thresholds = MUSCLE_RANK_THRESHOLDS["abs"]["thresholds"]

    weighted_pool = list(ABS_WEIGHTED_CRUNCHES.keys())
    rep_pool = list(ABS_BODYWEIGHT_FALLBACK)
    candidate_names = weighted_pool + rep_pool

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
            ProgramExercise.exercise_name_canonical.in_(candidate_names),
        )
        .all()
    ) if candidate_names else []

    best_weighted_ratio = 0.0
    best_weighted_source: str | None = None
    best_rep_count = 0
    best_rep_source: str | None = None

    for name, load, reps in rows:
        if name in ABS_WEIGHTED_CRUNCHES:
            spec = ABS_WEIGHTED_CRUNCHES[name]
            if load is None or load <= 0:
                continue
            if reps > MAX_REPS_FOR_E1RM:
                continue
            e1rm = _epley_e1rm(load, reps)
            if e1rm <= 0:
                continue
            ratio = (e1rm * spec) / bw_kg
            if ratio > MAX_RATIO_CAP:
                continue
            if ratio > best_weighted_ratio:
                best_weighted_ratio = ratio
                best_weighted_source = f"logged:{name}"
        elif name in ABS_BODYWEIGHT_FALLBACK:
            scaled = int(reps * size_bonus(bw_kg))
            if scaled > best_rep_count:
                best_rep_count = scaled
                best_rep_source = f"logged_reps:{name}(scaled)"

    weighted_tier = (
        rank_from_threshold(best_weighted_ratio, abs_thresholds)
        if best_weighted_ratio > 0 else None
    )
    rep_tier = (
        rank_from_reps(best_rep_count, ABS_FALLBACK_REPS)
        if best_rep_count > 0 else None
    )

    if weighted_tier is None and rep_tier is None:
        return _Result(0.0, "Copper", "no_data")

    final_tier = max_rank(weighted_tier or "Copper", rep_tier or "Copper")
    wt = tier_index(weighted_tier or "Copper")
    rt = tier_index(rep_tier or "Copper")
    if wt >= rt and best_weighted_source is not None:
        return _Result(best_weighted_ratio, final_tier, best_weighted_source)
    return _Result(float(best_rep_count), final_tier, best_rep_source or "bodyweight_reps")
```

- [ ] **Step 4: Update the imports at the top of `rank_engine.py` to include the new pathway maps.**

Find the existing import block (lines 29-67) and add:

```python
    ABS_BODYWEIGHT_FALLBACK,
    ABS_WEIGHTED_CRUNCHES,
    ABS_WEIGHTED_THRESHOLDS,
    ABS_FALLBACK_REPS,
```

(Insert alphabetically into the existing `from .muscle_rank_config import (...)` block.)

- [ ] **Step 5: Wire `_compute_abs` into `recompute_for_user`.**

Find the dispatch block in `recompute_for_user` (around line 685, the `for group in MVP_GROUPS:` loop). Add an `elif group == "abs":` branch:

```python
    for group in MVP_GROUPS:
        if bw is None:
            result = _Result(0.0, "Copper", "missing_bodyweight")
        elif group == "arms":
            # Will be removed in Task 6 once biceps/triceps replace it.
            result, _breakdown = _compute_arms_hybrid(...)
        elif group == "shoulders":
            result, _breakdown = _compute_shoulders_hybrid(...)
        elif group == "abs":
            result = _compute_abs(db, user_id, bw, cutoff)
        elif group in anchor_results:
            result = anchor_results[group]
        else:
            result = _compute_group(db, user_id, group, bw, cutoff)
```

(Note: `arms` branch will be replaced in Task 6, but for this task it stays so the engine doesn't crash trying to dispatch it. Without the arms branch the `for group in MVP_GROUPS` loop would skip arms — but arms isn't in MVP_GROUPS anymore after Task 2. So actually we can remove the arms branch now safely; verify the loop never sees `"arms"`.)

After re-checking: since Task 2 removed `"arms"` from `MVP_GROUPS`, the `elif group == "arms":` branch is dead code. Remove it now to simplify:

```python
    for group in MVP_GROUPS:
        if bw is None:
            result = _Result(0.0, "Copper", "missing_bodyweight")
        elif group == "shoulders":
            result, _breakdown = _compute_shoulders_hybrid(
                db, user_id, bw, cutoff,
                press_result=anchor_results["shoulders_press"],
            )
        elif group == "abs":
            result = _compute_abs(db, user_id, bw, cutoff)
        elif group in ("biceps", "triceps"):
            # Stub for Task 6 — temporarily Copper so the loop completes.
            result = _Result(0.0, "Copper", "stub_pending_task_6")
        elif group in anchor_results:
            result = anchor_results[group]
        else:
            result = _compute_group(db, user_id, group, bw, cutoff)
```

The biceps/triceps stub means tests for those groups will fail until Task 6, which is correct.

- [ ] **Step 6: Run the abs tests and verify they pass.**

```bash
cd backend
pytest tests/test_ranks.py -k "abs" -v
```

Expected: all three abs tests PASS.

- [ ] **Step 7: Commit.**

```bash
cd backend
git add app/rank_engine.py tests/test_ranks.py
git commit -m "feat(rank): add abs ranked group with weighted + rep fallback paths

_compute_abs mirrors the back rank's max(weighted_tier, rep_tier) shape.
Weighted crunch e1RM/BW (cable/machine/roman chair) is the primary path;
hanging leg raise / leg raise / dead bug rep counts fall back when no
weighted log exists, with size_bonus applied like the back rep fallback.

Biceps/triceps stubbed to Copper until Task 6 wires the split."
```

---

## Task 6 — Replace `_compute_arms_hybrid` with `_compute_biceps` and `_compute_triceps`

**Files:**
- Modify: `backend/app/rank_engine.py`
- Modify: `backend/tests/test_ranks.py`

- [ ] **Step 1: Write the failing tests FIRST.**

Append to `backend/tests/test_ranks.py`:

```python
def test_biceps_and_triceps_are_independent(db):
    """Strong dips with no curl/back work → high triceps, Copper biceps.
    The reverse seeding should produce the inverse pattern.
    """
    user_a = db.query(User).first()
    user_a.bodyweight_kg = 80.0
    db.commit()
    # Heavy weighted dip: +60 kg added @ 1 rep → ratio 0.75 = Platinum
    _seed_exercise(db, user_a, "WEIGHTED DIP", "arms", load_kg=140, reps=1, day_offset=1)
    # The seeded log uses load_kg=140 to represent BW (80) + plate (60).
    # Need to also set added_load_kg.
    last_log = db.query(WorkoutLog).filter_by(user_id=user_a.id).order_by(WorkoutLog.id.desc()).first()
    last_log.added_load_kg = 60.0
    db.commit()

    result = recompute_for_user(db, user_a.id)
    assert result["triceps"]["rank"] in ("Gold", "Platinum", "Diamond")
    assert result["biceps"]["rank"] == "Copper"


def test_pure_pullups_give_biceps_credit_via_back_anchor(db):
    """Heavy weighted pullups feed biceps via the back-ELO 0.7 weighting."""
    from app.models import User as UserModel
    user = UserModel(username="bicep_test", password_hash="x", bodyweight_kg=80.0)
    db.add(user)
    db.commit()
    # +40 kg weighted pullup @ 1 rep → ratio 0.50 = Gold V on back
    _seed_exercise(db, user, "WEIGHTED PULLUP", "back", load_kg=120, reps=1, day_offset=1)
    last_log = db.query(WorkoutLog).filter_by(user_id=user.id).order_by(WorkoutLog.id.desc()).first()
    last_log.added_load_kg = 40.0
    db.commit()

    result = recompute_for_user(db, user.id)
    assert result["back"]["rank"] in ("Gold", "Platinum")
    # Biceps = 0.7 × back_elo + 0.3 × curl_elo. Back at Gold (~ELO 1500) →
    # biceps ELO ~1050 = Bronze region (with no curl).
    assert result["biceps"]["rank"] in ("Bronze", "Silver")
    assert result["triceps"]["rank"] == "Copper"
```

- [ ] **Step 2: Run the tests and confirm they fail with the stub.**

```bash
cd backend
pytest tests/test_ranks.py -k "biceps or triceps" -v
```

Expected: FAIL — triceps and biceps return Copper because Task 5 left them stubbed.

- [ ] **Step 3: Replace `_compute_arms_hybrid` with two functions.**

In `backend/app/rank_engine.py`, find `_compute_arms_hybrid` (around line 468). Replace its entire body with:

```python
def _compute_biceps(
    db: Session,
    user_id: int,
    bw_kg: float,
    cutoff: date,
    *,
    back_ratio: float,
) -> tuple[_Result, dict]:
    """Biceps rank = 0.7 × back_elo + 0.3 × curl_elo (renormalized).

    Pure-isolation cap: when back_ratio == 0, the curl ELO is clipped to
    MAX_ISOLATION_ONLY_ELO before being used.
    """
    biceps_thresholds = MUSCLE_RANK_THRESHOLDS["biceps"]["thresholds"]
    back_thresholds = MUSCLE_RANK_THRESHOLDS["back"]["thresholds"]

    curl_ratio, curl_source = _best_isolation_ratio(
        db, user_id, bw_kg, cutoff, ARMS_CURL_ISOLATION,
    )

    back_elo = continuous_score(back_ratio, back_thresholds) if back_ratio > 0 else 0.0
    curl_elo = continuous_score(curl_ratio, CURL_THRESHOLDS) if curl_ratio > 0 else 0.0

    # Pure-isolation cap: if anchor (back) is missing, clip secondary (curl).
    if back_elo <= 0 and curl_elo > MAX_ISOLATION_ONLY_ELO:
        curl_elo = float(MAX_ISOLATION_ONLY_ELO)

    biceps_elo = _weighted_avg_present([(0.7, back_elo), (0.3, curl_elo)])

    if biceps_elo <= 0:
        return (_Result(0.0, "Copper", "no_data"), {
            "back_elo": 0.0, "curl_elo": 0.0, "biceps_elo": 0.0,
        })

    tier, _sub = tier_sub_from_elo(biceps_elo)
    pseudo_ratio = elo_to_ratio(biceps_elo, biceps_thresholds)
    source = "biceps:back-anchor" if back_elo >= curl_elo else (
        f"biceps:curl:{curl_source or 'n/a'}"
    )
    breakdown = {
        "back_elo":   round(back_elo, 1),
        "curl_elo":   round(curl_elo, 1),
        "biceps_elo": round(biceps_elo, 1),
    }
    return (_Result(pseudo_ratio, tier, source), breakdown)


def _compute_triceps(
    db: Session,
    user_id: int,
    bw_kg: float,
    cutoff: date,
    *,
    chest_ratio: float,
    shoulders_press_ratio: float,
) -> tuple[_Result, dict]:
    """Triceps rank = 0.7 × press_anchor_elo + 0.3 × tricep_iso_elo.

    press_anchor_elo = max(chest_elo, shoulder_press_elo, dip_anchor_elo)
    where dip_anchor pulls from the existing dips/close-grip/heavy-compound
    pathway. Pure-isolation cap applied to tricep_iso when anchor is missing.
    """
    triceps_thresholds = MUSCLE_RANK_THRESHOLDS["triceps"]["thresholds"]
    arms_thresholds_legacy = triceps_thresholds   # same shape
    chest_thresholds = MUSCLE_RANK_THRESHOLDS["chest"]["thresholds"]
    shoulders_thresholds = MUSCLE_RANK_THRESHOLDS["shoulders"]["thresholds"]

    # Existing dip anchor pathway (dips + close-grip + heavy tricep compound).
    anchor = _best_weighted_calisthenic(
        db, user_id, "triceps", bw_kg, cutoff,
        weighted=ARMS_WEIGHTED_DIPS,
        bodyweight=ARMS_BODYWEIGHT_DIPS,
        close_grip_fallback=ARMS_CLOSE_GRIP_BENCH,
        manual_added_key=MANUAL_1RM_KEY.get("triceps_added") or MANUAL_1RM_KEY.get("arms_added"),
        compound_map=ARMS_TRICEP_COMPOUND,
    )

    tricep_iso_ratio, tricep_iso_source = _best_isolation_ratio(
        db, user_id, bw_kg, cutoff, ARMS_TRICEP_ISOLATION,
    )

    chest_elo = continuous_score(chest_ratio, chest_thresholds) if chest_ratio > 0 else 0.0
    shoulders_press_elo = (
        continuous_score(shoulders_press_ratio, shoulders_thresholds)
        if shoulders_press_ratio > 0 else 0.0
    )
    anchor_elo = (
        continuous_score(anchor.ratio, arms_thresholds_legacy) if anchor.ratio > 0 else 0.0
    )
    tricep_iso_elo = (
        continuous_score(tricep_iso_ratio, TRICEP_ISOLATION_THRESHOLDS)
        if tricep_iso_ratio > 0 else 0.0
    )

    press_elo = max(chest_elo, shoulders_press_elo, anchor_elo)

    # Pure-isolation cap.
    if press_elo <= 0 and tricep_iso_elo > MAX_ISOLATION_ONLY_ELO:
        tricep_iso_elo = float(MAX_ISOLATION_ONLY_ELO)

    triceps_elo = _weighted_avg_present([(0.7, press_elo), (0.3, tricep_iso_elo)])

    if triceps_elo <= 0:
        return (_Result(0.0, "Copper", "no_data"), {
            "press_elo": 0.0, "tricep_iso_elo": 0.0, "triceps_elo": 0.0,
        })

    tier, _sub = tier_sub_from_elo(triceps_elo)
    pseudo_ratio = elo_to_ratio(triceps_elo, triceps_thresholds)
    source = "triceps:press-anchor" if press_elo >= tricep_iso_elo else (
        f"triceps:iso:{tricep_iso_source or 'n/a'}"
    )
    breakdown = {
        "chest_elo":      round(chest_elo, 1),
        "shoulders_elo":  round(shoulders_press_elo, 1),
        "anchor_elo":     round(anchor_elo, 1),
        "press_elo":      round(press_elo, 1),
        "tricep_iso_elo": round(tricep_iso_elo, 1),
        "triceps_elo":    round(triceps_elo, 1),
    }
    return (_Result(pseudo_ratio, tier, source), breakdown)
```

- [ ] **Step 4: Add `MAX_ISOLATION_ONLY_ELO` to the imports.**

In `rank_engine.py`'s import block:

```python
    MAX_ISOLATION_ONLY_ELO,
```

- [ ] **Step 5: Replace the biceps/triceps stub branches in `recompute_for_user`.**

Find the stub from Task 5:

```python
        elif group in ("biceps", "triceps"):
            # Stub for Task 6 — temporarily Copper so the loop completes.
            result = _Result(0.0, "Copper", "stub_pending_task_6")
```

Replace with:

```python
        elif group == "biceps":
            result, _breakdown = _compute_biceps(
                db, user_id, bw, cutoff,
                back_ratio=anchor_results["back"].ratio,
            )
        elif group == "triceps":
            result, _breakdown = _compute_triceps(
                db, user_id, bw, cutoff,
                chest_ratio=anchor_results["chest"].ratio,
                shoulders_press_ratio=anchor_results["shoulders_press"].ratio,
            )
```

- [ ] **Step 6: Delete the now-unused `_compute_arms_hybrid` function.**

Search for `def _compute_arms_hybrid(` and delete the entire function definition.

- [ ] **Step 7: Run the biceps/triceps tests.**

```bash
cd backend
pytest tests/test_ranks.py -k "biceps or triceps" -v
```

Expected: PASS.

- [ ] **Step 8: Run the full rank suite.**

```bash
cd backend
pytest tests/test_ranks.py --tb=short
```

Expected: every test passes.

- [ ] **Step 9: Commit.**

```bash
cd backend
git add app/rank_engine.py tests/test_ranks.py
git commit -m "feat(rank): split arms hybrid into _compute_biceps + _compute_triceps

biceps  = 0.7 × back_elo + 0.3 × curl_elo
triceps = 0.7 × press_anchor_elo + 0.3 × tricep_iso_elo
  press_anchor_elo = max(chest, shoulder_press, dip_anchor)

Pure-isolation cap (MAX_ISOLATION_ONLY_ELO = 2500) clips the secondary
pathway when the anchor is missing — Champion always requires anchor
evidence.

_compute_arms_hybrid removed."
```

---

## Task 7 — Add `_compute_hamstrings_hybrid` (deadlift + leg curl)

**Files:**
- Modify: `backend/app/rank_engine.py`
- Modify: `backend/tests/test_ranks.py`

- [ ] **Step 1: Write the failing tests FIRST.**

Append to `tests/test_ranks.py`:

```python
def test_hamstring_leg_curl_populates_hamstring_rank(db):
    """A Gold-tier seated leg curl (1.0× BW e1RM) without any deadlift work
    moves hamstrings off Copper.
    """
    from app.models import User as UserModel
    user = UserModel(username="ham_test", password_hash="x", bodyweight_kg=80.0)
    db.add(user)
    db.commit()
    # 80 kg @ 1 rep = 1.0× BW = Gold V on LEG_CURL_THRESHOLDS (ELO 1500)
    _seed_exercise(db, user, "SEATED LEG CURL", "hamstrings", load_kg=80, reps=1)
    result = recompute_for_user(db, user.id)
    # Anchor ELO = 0; iso ELO = 1500; clipped to 1500 (under 2500 cap).
    # Renormalized weighted_avg: only iso pathway has weight → biceps_elo = 1500
    # → Gold V hamstrings.
    assert result["hamstrings"]["rank"] in ("Silver", "Gold")


def test_pure_hamstring_isolation_cannot_reach_champion(db):
    """A Champion-grade leg curl with no deadlift work caps at Diamond."""
    from app.models import User as UserModel
    user = UserModel(username="ham_iso_max", password_hash="x", bodyweight_kg=80.0)
    db.add(user)
    db.commit()
    # 152 kg @ 1 rep = 1.90× BW = Champion floor on LEG_CURL_THRESHOLDS
    _seed_exercise(db, user, "SEATED LEG CURL", "hamstrings", load_kg=152, reps=1)
    result = recompute_for_user(db, user.id)
    assert result["hamstrings"]["rank"] in ("Diamond",)


def test_deadlift_plus_leg_curl_blends_in_elo_space(db):
    """A Gold deadlift + Gold leg curl should land near Gold hamstrings, not
    artificially below either pathway alone (verifies blend math).
    """
    from app.models import User as UserModel
    user = UserModel(username="ham_combo", password_hash="x", bodyweight_kg=80.0)
    db.add(user)
    db.commit()
    # Gold floor for hamstrings anchor = 2.0× BW deadlift = 160 kg
    _seed_exercise(db, user, "DEADLIFT", "hamstrings", load_kg=160, reps=1, day_offset=1)
    # Gold floor for leg curl = 1.0× BW = 80 kg
    _seed_exercise(db, user, "SEATED LEG CURL", "hamstrings", load_kg=80, reps=1, day_offset=2)
    result = recompute_for_user(db, user.id)
    assert result["hamstrings"]["rank"] in ("Gold", "Platinum")
```

- [ ] **Step 2: Run the tests and verify they fail.**

```bash
cd backend
pytest tests/test_ranks.py -k "hamstring" -v
```

Expected: existing barbell pathway works for the third test, but the leg-curl-only tests stay at Copper.

- [ ] **Step 3: Add a generic helper `_compute_barbell_with_isolation_hybrid` to `rank_engine.py`.**

This helper consolidates the logic for hamstrings/quads/chest. Add after `_compute_shoulders_hybrid`:

```python
def _compute_barbell_with_isolation_hybrid(
    db: Session,
    user_id: int,
    group: str,
    bw_kg: float,
    cutoff: date,
    *,
    isolation_map: dict[str, float],
    isolation_thresholds: dict[str, float],
    secondary_weight: float,
    compound_proxy_map: dict[str, float] | None = None,
) -> tuple[_Result, dict]:
    """Barbell anchor + isolation secondary, blended in ELO space.

    Used by hamstrings (deadlift + leg curl), quads (squat + leg extension),
    chest (bench + fly). Pure-isolation cap applies when the anchor is missing.

    `compound_proxy_map` is an optional second isolation source — for
    hamstrings it carries hyperextensions/glute-ham raises (low-spec
    compound work) against the same isolation threshold table.
    """
    anchor = _best_barbell_ratio(db, user_id, group, bw_kg, cutoff)
    anchor_thresholds = MUSCLE_RANK_THRESHOLDS[group]["thresholds"]

    iso_ratio, iso_source = _best_isolation_ratio(
        db, user_id, bw_kg, cutoff, isolation_map,
    )

    proxy_ratio = 0.0
    proxy_source: str | None = None
    if compound_proxy_map:
        proxy_ratio, proxy_source = _best_isolation_ratio(
            db, user_id, bw_kg, cutoff, compound_proxy_map,
        )

    # Take the higher of iso or compound proxy against the iso threshold table
    if proxy_ratio > iso_ratio:
        iso_ratio = proxy_ratio
        iso_source = proxy_source

    anchor_elo = continuous_score(anchor.ratio, anchor_thresholds) if anchor.ratio > 0 else 0.0
    iso_elo = continuous_score(iso_ratio, isolation_thresholds) if iso_ratio > 0 else 0.0

    # Pure-isolation cap.
    if anchor_elo <= 0 and iso_elo > MAX_ISOLATION_ONLY_ELO:
        iso_elo = float(MAX_ISOLATION_ONLY_ELO)

    blended_elo = _weighted_avg_present([
        (1.0 - secondary_weight, anchor_elo),
        (secondary_weight,        iso_elo),
    ])

    if blended_elo <= 0:
        return (_Result(0.0, "Copper", "no_data"), {
            "anchor_elo": 0.0, "iso_elo": 0.0, "blended_elo": 0.0,
        })

    tier, _sub = tier_sub_from_elo(blended_elo)
    pseudo_ratio = elo_to_ratio(blended_elo, anchor_thresholds)
    source = anchor.source if anchor_elo >= iso_elo else (iso_source or f"hybrid:{group}-iso")
    breakdown = {
        "anchor_elo":  round(anchor_elo, 1),
        "iso_elo":     round(iso_elo, 1),
        "blended_elo": round(blended_elo, 1),
    }
    return (_Result(pseudo_ratio, tier, source), breakdown)
```

- [ ] **Step 4: Add the new isolation pathway maps to imports.**

In `rank_engine.py`'s import block, add:

```python
    HAMSTRINGS_LEG_CURL_ISOLATION,
    HAMSTRINGS_COMPOUND_PROXY,
    LEG_CURL_THRESHOLDS,
```

- [ ] **Step 5: Wire hamstrings into `recompute_for_user`.**

Find the dispatch loop and add a `hamstrings` branch BEFORE the generic `anchor_results[group]` fallback:

```python
        elif group == "hamstrings":
            result, _breakdown = _compute_barbell_with_isolation_hybrid(
                db, user_id, "hamstrings", bw, cutoff,
                isolation_map=HAMSTRINGS_LEG_CURL_ISOLATION,
                isolation_thresholds=LEG_CURL_THRESHOLDS,
                secondary_weight=0.20,
                compound_proxy_map=HAMSTRINGS_COMPOUND_PROXY,
            )
```

This branch supersedes the generic `anchor_results["hamstrings"]` fallback that was used before.

- [ ] **Step 6: Run the hamstring tests.**

```bash
cd backend
pytest tests/test_ranks.py -k "hamstring" -v
```

Expected: all PASS.

- [ ] **Step 7: Commit.**

```bash
cd backend
git add app/rank_engine.py tests/test_ranks.py
git commit -m "feat(rank): hamstrings hybrid (deadlift + leg curl + hyperext proxy)

Generic _compute_barbell_with_isolation_hybrid helper consolidates the
anchor+iso pattern. Hamstrings is the first consumer:
- 0.80 anchor (deadlift variants) + 0.20 secondary (leg curl)
- HAMSTRINGS_COMPOUND_PROXY (glute-ham, back extensions) feeds the
  iso pathway at low spec
- Pure-isolation cap (MAX_ISOLATION_ONLY_ELO) prevents leg-curl-only
  Champion claims

Closes the user-reported bug: 'sitting/lying hamstring curls don't
update hamstring rank'."
```

---

## Task 8 — Wire quads (leg extension) and chest (fly) hybrids

**Files:**
- Modify: `backend/app/rank_engine.py`
- Modify: `backend/tests/test_ranks.py`

Same shape as Task 7, just two more consumers of the helper.

- [ ] **Step 1: Write the failing tests FIRST.**

Append to `tests/test_ranks.py`:

```python
def test_quad_leg_extension_populates_quad_rank(db):
    """A Gold-tier leg extension (1.25× BW) without squats moves quads off Copper."""
    from app.models import User as UserModel
    user = UserModel(username="quad_iso", password_hash="x", bodyweight_kg=80.0)
    db.add(user)
    db.commit()
    _seed_exercise(db, user, "LEG EXTENSION", "quads", load_kg=100, reps=1)  # 1.25 BW
    result = recompute_for_user(db, user.id)
    assert result["quads"]["rank"] in ("Silver", "Gold")


def test_chest_fly_populates_chest_rank(db):
    """A Gold-tier cable fly (0.50× BW) without bench moves chest off Copper."""
    from app.models import User as UserModel
    user = UserModel(username="chest_iso", password_hash="x", bodyweight_kg=80.0)
    db.add(user)
    db.commit()
    _seed_exercise(db, user, "CABLE CHEST FLY", "chest", load_kg=40, reps=1)  # 0.50 BW
    result = recompute_for_user(db, user.id)
    assert result["chest"]["rank"] in ("Silver", "Gold")


def test_pure_isolation_caps_at_diamond_for_quads_and_chest(db):
    """Champion-grade isolation alone caps at Diamond for both quads and chest."""
    from app.models import User as UserModel
    user_q = UserModel(username="quad_max_iso", password_hash="x", bodyweight_kg=80.0)
    db.add(user_q)
    db.commit()
    _seed_exercise(db, user_q, "LEG EXTENSION", "quads", load_kg=192, reps=1)  # 2.40 BW = Champion
    result_q = recompute_for_user(db, user_q.id)
    assert result_q["quads"]["rank"] == "Diamond"

    user_c = UserModel(username="chest_max_iso", password_hash="x", bodyweight_kg=80.0)
    db.add(user_c)
    db.commit()
    _seed_exercise(db, user_c, "CABLE CHEST FLY", "chest", load_kg=104, reps=1)  # 1.30 BW = Champion
    result_c = recompute_for_user(db, user_c.id)
    assert result_c["chest"]["rank"] == "Diamond"
```

- [ ] **Step 2: Run the tests and verify they fail.**

```bash
cd backend
pytest tests/test_ranks.py -k "quad_leg_extension or chest_fly or pure_isolation_caps" -v
```

Expected: FAIL — quads and chest still use the barbell-only `_best_barbell_ratio` path.

- [ ] **Step 3: Add quad and chest pathway maps to imports.**

In `rank_engine.py`:

```python
    CHEST_FLY_ISOLATION,
    CHEST_FLY_THRESHOLDS,
    LEG_EXTENSION_THRESHOLDS,
    QUADS_LEG_EXTENSION_ISOLATION,
```

- [ ] **Step 4: Wire quads + chest into `recompute_for_user` after the hamstrings branch.**

```python
        elif group == "quads":
            result, _breakdown = _compute_barbell_with_isolation_hybrid(
                db, user_id, "quads", bw, cutoff,
                isolation_map=QUADS_LEG_EXTENSION_ISOLATION,
                isolation_thresholds=LEG_EXTENSION_THRESHOLDS,
                secondary_weight=0.15,
            )
        elif group == "chest":
            result, _breakdown = _compute_barbell_with_isolation_hybrid(
                db, user_id, "chest", bw, cutoff,
                isolation_map=CHEST_FLY_ISOLATION,
                isolation_thresholds=CHEST_FLY_THRESHOLDS,
                secondary_weight=0.15,
            )
```

- [ ] **Step 5: Run the new tests.**

```bash
cd backend
pytest tests/test_ranks.py -k "quad_leg_extension or chest_fly or pure_isolation_caps" -v
```

Expected: PASS.

- [ ] **Step 6: Run the full rank suite.**

```bash
cd backend
pytest tests/test_ranks.py --tb=short
```

Expected: all green.

- [ ] **Step 7: Commit.**

```bash
cd backend
git add app/rank_engine.py tests/test_ranks.py
git commit -m "feat(rank): quads + chest hybrids (leg extension / cable fly)

quads: 0.85 squat anchor + 0.15 leg extension iso
chest: 0.85 bench anchor + 0.15 fly iso

Pure-isolation cap consistently clips both at Diamond."
```

---

## Task 9 — Update `routers/ranks.py` for the new groups

**Files:**
- Modify: `backend/app/routers/ranks.py`
- Modify: `backend/tests/test_ranks.py` (sanity check on the standards endpoint)

- [ ] **Step 1: Update `_GROUP_LABELS` and `_METRIC_HUMAN`.**

Find the existing maps (around lines 35-51) and replace:

```python
_GROUP_LABELS = {
    "chest": "Chest",
    "back": "Back",
    "shoulders": "Shoulders",
    "quads": "Quads",
    "hamstrings": "Hamstrings",
    "biceps": "Biceps",
    "triceps": "Triceps",
    "abs": "Abs",
}

_METRIC_HUMAN = {
    "bench_press_1rm_over_bodyweight":       "Barbell bench 1RM ÷ bodyweight",
    "back_squat_1rm_over_bodyweight":        "Back squat 1RM ÷ bodyweight",
    "deadlift_1rm_over_bodyweight":          "Deadlift 1RM ÷ bodyweight",
    "overhead_press_1rm_over_bodyweight":    "Strict press 1RM ÷ bodyweight",
    "weighted_pullup_added_over_bodyweight": "Weighted pull-up added load ÷ bodyweight",
    "weighted_dip_added_over_bodyweight":    "Weighted dip added load ÷ bodyweight",
    "weighted_pullup_added_over_bodyweight_blended_with_curl_isolation":
        "Pull-up & row strength blended with curl isolation",
    "weighted_dip_added_over_bodyweight_blended_with_tricep_isolation":
        "Dip / press strength blended with triceps isolation",
    "weighted_crunch_1rm_over_bodyweight_or_strict_rep_count":
        "Weighted crunch 1RM ÷ bodyweight, or strict-form rep count",
}
```

- [ ] **Step 2: Update `_group_exercises`.**

Find the function (around line 57) and replace:

```python
def _group_exercises(group: str) -> list[str]:
    pool: set[str] = set(EXERCISE_MAP.get(group, {}).keys())
    if group == "back":
        pool |= BACK_WEIGHTED_PULLUPS
        pool |= BACK_BODYWEIGHT_PULLUPS
        pool |= set(BACK_ROWS_PULLDOWNS.keys())
    elif group == "biceps":
        pool |= BACK_WEIGHTED_PULLUPS
        pool |= BACK_BODYWEIGHT_PULLUPS
        pool |= set(BACK_ROWS_PULLDOWNS.keys())
        pool |= set(ARMS_CURL_ISOLATION.keys())
    elif group == "triceps":
        pool |= ARMS_WEIGHTED_DIPS
        pool |= ARMS_BODYWEIGHT_DIPS
        pool |= ARMS_CLOSE_GRIP_BENCH
        pool |= set(ARMS_TRICEP_COMPOUND.keys())
        pool |= set(ARMS_TRICEP_ISOLATION.keys())
    elif group == "shoulders":
        pool |= set(SHOULDERS_LATERAL_ISOLATION.keys())
    elif group == "hamstrings":
        pool |= set(HAMSTRINGS_LEG_CURL_ISOLATION.keys())
        pool |= set(HAMSTRINGS_COMPOUND_PROXY.keys())
    elif group == "quads":
        pool |= set(QUADS_LEG_EXTENSION_ISOLATION.keys())
    elif group == "chest":
        pool |= set(CHEST_FLY_ISOLATION.keys())
    elif group == "abs":
        pool |= set(ABS_WEIGHTED_CRUNCHES.keys())
        pool |= ABS_BODYWEIGHT_FALLBACK
    return sorted(pool)
```

- [ ] **Step 3: Update the imports at the top of `routers/ranks.py`.**

Find the existing `from ..muscle_rank_config import (...)` block and add:

```python
    ABS_BODYWEIGHT_FALLBACK,
    ABS_WEIGHTED_CRUNCHES,
    CHEST_FLY_ISOLATION,
    HAMSTRINGS_COMPOUND_PROXY,
    HAMSTRINGS_LEG_CURL_ISOLATION,
    QUADS_LEG_EXTENSION_ISOLATION,
```

- [ ] **Step 4: Run the rank suite to make sure the standards endpoint still works.**

```bash
cd backend
pytest tests/test_ranks.py -k "standards" -v
```

Expected: PASS — the existing standards tests adapted in Task 3 should now have full data behind them.

- [ ] **Step 5: Commit.**

```bash
cd backend
git add app/routers/ranks.py
git commit -m "feat(rank): wire new groups + isolation pools into /api/ranks/standards"
```

---

## Task 10 — Add the `split_arms_2026_05` lifespan migration

**Files:**
- Modify: `backend/app/main.py`
- Modify: `backend/tests/test_ranks.py`

- [ ] **Step 1: Write the failing tests FIRST.**

Append to `tests/test_ranks.py`:

```python
def test_split_arms_migration_deletes_arms_rows_and_recomputes(db):
    """Migration deletes legacy 'arms' MuscleScore rows and recomputes ranks
    from each user's full WorkoutLog history.
    """
    from app.main import _run_split_arms_migration_once
    from app.models import MigrationLog, MuscleScore, User as UserModel

    user = db.query(UserModel).first()
    user.bodyweight_kg = 80.0
    db.add(MuscleScore(
        user_id=user.id, muscle_group="arms", score_v=0.0, score_i=1.5,
        score_f=0.0, score=80.0, rank="Diamond", sub_index=2, elo=2700.0,
    ))
    db.commit()
    assert db.query(MuscleScore).filter_by(muscle_group="arms").count() == 1

    # Seed an old leg curl outside the 90-day window — migration should credit it
    _seed_exercise(db, user, "SEATED LEG CURL", "hamstrings", load_kg=80, reps=1, day_offset=200)

    _run_split_arms_migration_once(db)

    assert db.query(MuscleScore).filter_by(muscle_group="arms").count() == 0
    assert db.query(MigrationLog).filter_by(name="split_arms_2026_05").one() is not None

    # Hamstring rank should reflect the historical leg curl despite the
    # default 90-day cutoff (migration uses unbounded lookback).
    hams_row = db.query(MuscleScore).filter_by(
        user_id=user.id, muscle_group="hamstrings",
    ).first()
    assert hams_row is not None
    assert hams_row.rank in ("Silver", "Gold")


def test_split_arms_migration_is_idempotent(db):
    """Running the migration twice produces no duplicate rows and a no-op
    second run."""
    from app.main import _run_split_arms_migration_once
    from app.models import MigrationLog

    _run_split_arms_migration_once(db)
    _run_split_arms_migration_once(db)

    rows = db.query(MigrationLog).filter_by(name="split_arms_2026_05").all()
    assert len(rows) == 1
```

- [ ] **Step 2: Run the tests and verify they fail.**

```bash
cd backend
pytest tests/test_ranks.py -k "split_arms" -v
```

Expected: FAIL — `_run_split_arms_migration_once` doesn't exist yet.

- [ ] **Step 3: Add the migration function to `backend/app/main.py`.**

Add this function after `_recompute_all_ranks_once` (around line 199):

```python
def _run_split_arms_migration_once(db):
    """One-shot: drop legacy 'arms' MuscleScore rows and recompute every
    user's ranks against the new 8-group layout (biceps, triceps, abs).

    Uses an unbounded lookback so users get instant credit for historical
    leg curl / leg extension / fly / crunch logs that were silently
    ignored by the old engine.

    Gated by a `migration_log` row named 'split_arms_2026_05'. Subsequent
    deploys are no-ops.
    """
    from .models import MigrationLog, MuscleScore
    from .rank_engine import recompute_all

    name = "split_arms_2026_05"
    if db.query(MigrationLog).filter_by(name=name).first() is not None:
        return

    deleted = db.query(MuscleScore).filter(MuscleScore.muscle_group == "arms").delete(
        synchronize_session=False,
    )
    db.commit()

    summary = recompute_all(db, lookback_days_override=9999)

    db.add(MigrationLog(name=name))
    db.commit()

    print(
        f"split_arms migration: deleted {deleted} legacy arms rows; "
        f"recomputed {summary['processed']} users with unbounded lookback. "
        f"Failed: {len(summary['failed'])}.",
        flush=True,
    )
```

- [ ] **Step 4: Wire it into the lifespan startup.**

Find the lifespan startup block where the existing migrations are called (look for `_run_bw_migration_once(db)` or similar invocations). Add the new call AFTER the existing migrations:

```python
        _run_split_arms_migration_once(db)
```

(Use the same pattern as the existing migration invocations — same `try/except` wrapping if any.)

- [ ] **Step 5: Run the migration tests.**

```bash
cd backend
pytest tests/test_ranks.py -k "split_arms" -v
```

Expected: PASS.

- [ ] **Step 6: Run the full backend suite.**

```bash
cd backend
pytest -q 2>&1 | tail -20
```

Expected: prior pass count holds (see CLAUDE.md "Testing" — current state is "152 pass, 1 pre-existing unrelated failure"). New test count rises by ~20.

- [ ] **Step 7: Commit.**

```bash
cd backend
git add app/main.py tests/test_ranks.py
git commit -m "feat(rank): split_arms_2026_05 lifespan migration

One-shot migration deletes legacy 'arms' MuscleScore rows and recomputes
every user's ranks against the new 8-group layout. Uses unbounded
lookback so historical leg curl / fly / crunch logs credit the new
groups on first deploy.

Idempotent — gated by migration_log row, subsequent deploys are no-ops."
```

---

## Task 11 — Append `CATALOG_AUDIT` table + completeness test

**Files:**
- Modify: `backend/app/muscle_rank_config.py`
- Create: `backend/tests/test_catalog_audit.py`

- [ ] **Step 1: Write the failing test FIRST.**

Create `backend/tests/test_catalog_audit.py`:

```python
"""Verify every catalog entry's primary muscle group is mapped or excluded.

Acceptance criterion from the 2026-05-02 muscle-rank coverage audit spec:
every catalog entry whose `muscle_group_primary` is in MVP_GROUPS must
either appear in an EXERCISE_MAP / isolation / compound map for its
group, or be named in CATALOG_AUDIT with disposition 'excluded' and a
non-empty reason.
"""

import pytest

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
```

- [ ] **Step 2: Run the test and verify it fails.**

```bash
cd backend
pytest tests/test_catalog_audit.py -v
```

Expected: FAIL — `CATALOG_AUDIT` doesn't exist yet, AND probably several catalog entries are unmapped.

- [ ] **Step 3: Confirm the actual list of unmapped entries by running the test once more after stubbing `CATALOG_AUDIT`.**

Add to `muscle_rank_config.py` (at the bottom of the file):

```python
# 2026-05-02: explicit exclusions — catalog entries whose primary muscle is
# in MVP_GROUPS but which the engine intentionally does NOT count toward
# any rank. Each entry MUST have a non-empty reason. Asserted by
# tests/test_catalog_audit.py::test_every_mvp_catalog_entry_is_mapped_or_excluded.
CATALOG_AUDIT: dict[str, str] = {
    # populated below after running the audit test
}
```

- [ ] **Step 4: Run the audit test, capture the missing list, and populate `CATALOG_AUDIT`.**

```bash
cd backend
pytest tests/test_catalog_audit.py -v 2>&1 | grep "have no rank pathway" | head -1
```

This will print the exact missing list. For each name, decide either:
- Add it to the appropriate pathway map (preferred when it's a real anchor / isolation lift), OR
- Add it to `CATALOG_AUDIT` with a clear reason (preferred when it's redundant with an existing entry, or a low-signal lift).

Likely candidates for `CATALOG_AUDIT` exclusions:

```python
CATALOG_AUDIT: dict[str, str] = {
    # Quads — already covered by the squat anchor at lower spec
    "WALKING LUNGES":           "redundant with squat anchor (already in EXERCISE_MAP['quads'] at 0.45)",
    # Hamstrings — bodyweight rep work without a clean strength anchor
    "TWO-ARMS TWO-LEGS DEAD BUG": "abs isolation — added to ABS_BODYWEIGHT_FALLBACK instead",
    # Add other entries surfaced by the audit test here.
}
```

(The actual list depends on what the test surfaces. Iterate: run test → add to map or audit → re-run.)

- [ ] **Step 5: Once the audit test passes, run it once more to confirm.**

```bash
cd backend
pytest tests/test_catalog_audit.py -v
```

Expected: PASS.

- [ ] **Step 6: Run the full backend suite.**

```bash
cd backend
pytest -q 2>&1 | tail -10
```

Expected: all-green except the pre-existing `test_log_bulk_relog_replaces` failure.

- [ ] **Step 7: Commit.**

```bash
cd backend
git add app/muscle_rank_config.py tests/test_catalog_audit.py
git commit -m "feat(rank): catalog audit completeness — every MVP entry is mapped or excluded

CATALOG_AUDIT table records explicit exclusions with reasons.
test_catalog_audit.py asserts no catalog entry tagged with an MVP
primary group is silently dropped by the engine."
```

---

## Task 12 — Recalibration sanity tests (tricep pushdown + back tightening)

**Files:**
- Modify: `backend/tests/test_ranks.py`

- [ ] **Step 1: Write the tests.**

Append to `tests/test_ranks.py`:

```python
def test_tricep_pushdown_recalibration_lands_at_champion(db):
    """An Elite-grade pushdown (1.40 BW) hits Champion on the iso pathway."""
    from app.models import User as UserModel
    from app.muscle_rank_config import TRICEP_ISOLATION_THRESHOLDS, ARMS_TRICEP_ISOLATION

    user = UserModel(username="tri_iso_max", password_hash="x", bodyweight_kg=80.0)
    db.add(user)
    db.commit()
    # 112 kg @ 1 rep = 1.40× BW = Champion floor on TRICEP_ISOLATION_THRESHOLDS
    _seed_exercise(db, user, "TRICEPS PRESSDOWN", "triceps", load_kg=112, reps=1)
    result = recompute_for_user(db, user.id)

    # Blended triceps: press anchor = 0; iso ELO = Champion (3000+) capped at
    # MAX_ISOLATION_ONLY_ELO (2500) → renormalized → tier_sub_from_elo(2500) = Diamond V
    assert result["triceps"]["rank"] == "Diamond"

    # Verify the ARMS_TRICEP_ISOLATION spec is now 1.0 (no discount)
    assert all(spec == 1.0 for spec in ARMS_TRICEP_ISOLATION.values())

    # Verify the threshold table is the recalibrated raw-ratio scale
    assert TRICEP_ISOLATION_THRESHOLDS["Champion"] == 1.40


def test_weighted_pullup_ceiling_tightening(db):
    """+1.20 BW lands at Champion exactly; +1.05 BW lands at Diamond."""
    from app.models import User as UserModel

    user_champ = UserModel(username="back_champ", password_hash="x", bodyweight_kg=80.0)
    db.add(user_champ)
    db.commit()
    # 80 kg BW + 96 kg added = 176 kg total at 1 rep → added 1.20× BW = Champion floor
    _seed_exercise(db, user_champ, "WEIGHTED PULLUP", "back", load_kg=176, reps=1)
    last_log = db.query(WorkoutLog).filter_by(user_id=user_champ.id).order_by(WorkoutLog.id.desc()).first()
    last_log.added_load_kg = 96.0
    db.commit()
    result_c = recompute_for_user(db, user_champ.id)
    assert result_c["back"]["rank"] == "Champion"

    user_dia = UserModel(username="back_dia", password_hash="x", bodyweight_kg=80.0)
    db.add(user_dia)
    db.commit()
    # 80 kg BW + 84 kg added = 164 kg total → added 1.05× BW = Diamond range
    _seed_exercise(db, user_dia, "WEIGHTED PULLUP", "back", load_kg=164, reps=1)
    last_log_d = db.query(WorkoutLog).filter_by(user_id=user_dia.id).order_by(WorkoutLog.id.desc()).first()
    last_log_d.added_load_kg = 84.0
    db.commit()
    result_d = recompute_for_user(db, user_dia.id)
    assert result_d["back"]["rank"] == "Diamond"
```

- [ ] **Step 2: Run the tests.**

```bash
cd backend
pytest tests/test_ranks.py -k "recalibration or weighted_pullup_ceiling" -v
```

Expected: PASS (the recalibrations are already in place from Tasks 1-2).

- [ ] **Step 3: Commit.**

```bash
cd backend
git add tests/test_ranks.py
git commit -m "test(rank): regression coverage for tricep iso + back ceiling recalibrations"
```

---

## Task 13 — Frontend: shared `MUSCLE_LABELS` constant

**Files:**
- Create: `frontend/src/constants/muscleGroups.js`
- Modify: `frontend/src/pages/Profile.jsx`
- Modify: `frontend/src/pages/UserProfile.jsx`
- Modify: `frontend/src/pages/Compare.jsx`

- [ ] **Step 1: Create the shared constants file.**

Create `frontend/src/constants/muscleGroups.js`:

```javascript
// Display labels for the 8 ranked muscle groups. Source of truth — every
// page that renders a rank card or label imports from here.
export const MUSCLE_LABELS = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  biceps: 'Biceps',
  triceps: 'Triceps',
  abs: 'Abs',
};
```

- [ ] **Step 2: Update `Profile.jsx`.**

Find the inline `MUSCLE_LABELS` constant (around line 16) and replace it with an import. Add at the top:

```javascript
import { MUSCLE_LABELS } from '../constants/muscleGroups';
```

Delete the inline constant block:

```javascript
const MUSCLE_LABELS = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  arms: 'Arms',
};
```

- [ ] **Step 3: Update `UserProfile.jsx`.**

Same shape: add the import, delete the inline block. The current inline block is around `UserProfile.jsx:11-19` (verify exact lines with `grep`).

- [ ] **Step 4: Update `Compare.jsx`.**

Same shape (current inline block around `Compare.jsx:11-13`).

- [ ] **Step 5: Run the frontend test suite to make sure nothing breaks.**

```bash
cd frontend
npm test -- --run 2>&1 | tail -10
```

Expected: prior pass count holds.

- [ ] **Step 6: Visually verify by starting the dev server.**

```bash
cd frontend
npm run dev
```

Open `http://localhost:5173/profile` (or `5173/profile/me` depending on routing) and confirm the rank cards show 8 entries with the new biceps/triceps/abs labels. Stop the dev server (Ctrl-C) before continuing.

- [ ] **Step 7: Commit.**

```bash
cd frontend
git add src/constants/muscleGroups.js src/pages/Profile.jsx src/pages/UserProfile.jsx src/pages/Compare.jsx
git commit -m "refactor(frontend): extract MUSCLE_LABELS to shared constant

Adds biceps / triceps / abs labels; removes legacy 'arms' entry.
Profile, UserProfile, Compare now import from a single source."
```

---

## Task 14 — Frontend: `BodyMap.jsx` biceps/triceps split

**Files:**
- Modify: `frontend/src/components/BodyMap.jsx`

- [ ] **Step 1: Update the front upper-arm regions (around lines 168-175).**

Find:

```jsx
{/* Arms (biceps area) */}
<ellipse
  cx="62" cy="80" rx="10" ry="20"
  {...regionProps('arms', 'Arms')}
/>
<ellipse
  cx="138" cy="80" rx="10" ry="20"
  {...regionProps('arms', 'Arms')}
/>
```

Replace with:

```jsx
{/* Biceps — front upper arm */}
<ellipse
  cx="62" cy="80" rx="10" ry="20"
  {...regionProps('biceps', 'Biceps')}
/>
<ellipse
  cx="138" cy="80" rx="10" ry="20"
  {...regionProps('biceps', 'Biceps')}
/>
```

- [ ] **Step 2: Update the back upper-arm regions (around lines 222-224).**

Find:

```jsx
{/* Arms (triceps) */}
<ellipse cx="62" cy="95" rx="10" ry="22" {...regionProps('arms', 'Arms')} />
<ellipse cx="138" cy="95" rx="10" ry="22" {...regionProps('arms', 'Arms')} />
```

Replace with:

```jsx
{/* Triceps — back upper arm */}
<ellipse cx="62" cy="95" rx="10" ry="22" {...regionProps('triceps', 'Triceps')} />
<ellipse cx="138" cy="95" rx="10" ry="22" {...regionProps('triceps', 'Triceps')} />
```

- [ ] **Step 3: Confirm the abs region (around lines 161-165) is unchanged — it already references `'abs'` and will light up automatically once the rank engine populates abs.**

- [ ] **Step 4: Visually verify in the dev server.**

```bash
cd frontend
npm run dev
```

Navigate to a profile with rank data. Confirm:
- Front of body shows biceps regions tinted by the user's biceps tier color.
- Back of body shows triceps regions tinted by the user's triceps tier color.
- Abs region tinted by the user's abs tier color.

Stop the dev server before continuing.

- [ ] **Step 5: Commit.**

```bash
cd frontend
git add src/components/BodyMap.jsx
git commit -m "feat(frontend): split BodyMap arms region into biceps + triceps"
```

---

## Task 15 — Frontend: Settings → Manual 1RM panel

**Files:**
- Modify: `frontend/src/pages/Settings.jsx`

- [ ] **Step 1: Locate the existing Manual 1RM panel.**

```bash
cd frontend
grep -n "manual_1rm\|biceps_curl\|cable_crunch\|tricep_dip" src/pages/Settings.jsx | head -10
```

Open the file and find the section that renders the four primary 1RM input rows (bench, squat, deadlift, ohp).

- [ ] **Step 2: Add a divider and three new input rows below the four primary lifts.**

Add new rows for:
- `biceps_curl` — labeled "Standing barbell curl 1RM"
- `dip` — labeled "Weighted dip 1RM (added load)" — note this key already exists for the legacy "arms_added" pathway; the new triceps rank reads it too
- `cable_crunch` — labeled "Cable crunch 1RM"

Each row should follow the exact pattern of the existing primary rows: an input bound to `formData.manual_1rm[key].value_kg` with a unit label, plus an optional "tested on" date input bound to `formData.manual_1rm[key].tested_at`.

If the existing rows are abstracted into a `<ManualRmRow lift={...} />` component, just add three more `<ManualRmRow />` invocations. If they're inline JSX, copy the pattern verbatim.

Add a divider element (visual `<hr>` or styled spacer) between the four primary lifts and the three new accessory lifts.

- [ ] **Step 3: Test the save path.**

```bash
cd frontend
npm run dev
```

In the browser:
1. Navigate to `/settings`.
2. Enter `35` into the new "Standing barbell curl 1RM" input.
3. Click save / submit (whatever the existing flow uses).
4. Reload the page; confirm the value persisted.
5. Navigate to `/profile`; confirm the biceps rank reflects the manual entry.

Stop the dev server before continuing.

- [ ] **Step 4: Commit.**

```bash
cd frontend
git add src/pages/Settings.jsx
git commit -m "feat(frontend): add biceps_curl / dip / cable_crunch rows to Manual 1RM panel"
```

---

## Task 16 — Frontend: i18n strings

**Files:**
- Modify: `frontend/src/i18n.js`

- [ ] **Step 1: Add the new strings.**

Open `frontend/src/i18n.js`. Locate the existing `en` and `es` string tables. Add:

```javascript
// In the `en` table:
biceps: 'Biceps',
triceps: 'Triceps',
abs: 'Abs',
manual1rmBicepsCurl: 'Standing barbell curl 1RM',
manual1rmDip: 'Weighted dip 1RM (added load)',
manual1rmCableCrunch: 'Cable crunch 1RM',

// In the `es` table:
biceps: 'Bíceps',
triceps: 'Tríceps',
abs: 'Abdominales',
manual1rmBicepsCurl: 'Curl con barra de pie 1RM',
manual1rmDip: 'Fondos lastrados 1RM (carga añadida)',
manual1rmCableCrunch: 'Crunch en polea 1RM',
```

If your existing labels in Settings.jsx (Task 15) use the i18n helper, swap the hard-coded English strings for `t('manual1rmBicepsCurl')` etc. now.

- [ ] **Step 2: Test by toggling language in the dev server.**

```bash
cd frontend
npm run dev
```

In the browser, switch to Spanish via the language toggle. Verify the biceps/triceps/abs labels render in Spanish on Profile and Settings.

- [ ] **Step 3: Commit.**

```bash
cd frontend
git add src/i18n.js
git commit -m "i18n: add en/es strings for biceps, triceps, abs + manual 1RM rows"
```

---

## Task 17 — Final verification + CLAUDE.md update

**Files:**
- Modify: `CLAUDE.md` (root project)
- Modify: `docs/known-bugs.md`

- [ ] **Step 1: Run the full backend suite.**

```bash
cd backend
pytest -q 2>&1 | tail -10
```

Expected: previous pass count + new tests, with the same pre-existing `test_log_bulk_relog_replaces` failure (unrelated).

- [ ] **Step 2: Run the full frontend suite.**

```bash
cd frontend
npm test -- --run 2>&1 | tail -10
```

Expected: previous pass count holds.

- [ ] **Step 3: Run the manual smoke checklist from the spec.**

Start both servers:

```bash
./start-dev.ps1
```

In the browser:
- Log a fresh seated leg curl set → check Profile shows hamstrings ELO increased.
- Log a fresh leg extension set → check quads ELO increased.
- Log a fresh cable fly set → check chest ELO increased.
- Log a fresh cable crunch set → check abs rank appears (was hidden) and updates.
- Log only hanging leg raises → check abs rank populates from rep fallback.
- Look at the body map → confirm biceps and triceps regions are separately tinted.
- Settings → Manual 1RM → enter values for biceps_curl, dip, cable_crunch → save → check Profile reflects them.
- Existing user with only barbell logs → confirm chest/quads/hamstrings ranks are roughly the same as before (anchor weight is 0.80–0.85; any change should be at most one sub-tier).

- [ ] **Step 4: Update `CLAUDE.md`'s "Muscle rank engine" section.**

Find the "Muscle rank engine (2026-04-21 rewrite)" section. Append a new dated entry under the existing dated list:

```markdown
- 2026-05-02: Coverage audit — split arms into independent biceps + triceps
  ranks; added abs as the 8th MVP group; new isolation pathways for
  hamstrings (leg curl + glute-ham proxy), quads (leg extension), and
  chest (fly). Threshold tables sourced from strengthlevel.com percentile
  data. `MAX_ISOLATION_ONLY_ELO = 2500` cap means pure-isolation lifters
  reach Diamond at most. Back Diamond/Champion thresholds tightened
  (1.25→1.00, 1.50→1.20) to match published Elite +1.08 BW. Tricep
  isolation thresholds bumped to raw-ratio scale (`ARMS_TRICEP_ISOLATION`
  spec multipliers all 1.0). One-shot `split_arms_2026_05` lifespan
  migration deletes legacy `arms` MuscleScore rows and recomputes against
  unbounded historical lookback. CATALOG_AUDIT table in
  `muscle_rank_config.py` documents every catalog exclusion with a reason.
```

Also update `MVP_GROUPS` line near the top of the section to read 8 groups.

- [ ] **Step 5: Update `docs/known-bugs.md`.**

Add a new entry near the top of the resolved-bugs list:

```markdown
NN. ~~Logging hamstring curls / leg extensions / chest flies / ab work didn't move the corresponding rank~~ — fixed 2026-05-02. Spec at `docs/superpowers/specs/2026-05-02-muscle-rank-coverage-audit-design.md`. New isolation pathways added for every previously-uncovered group; arms split into biceps + triceps; abs added as a ranked group.
```

- [ ] **Step 6: Commit the docs.**

```bash
cd "/mnt/c/users/danie/downloads/gym tracker"
git add CLAUDE.md docs/known-bugs.md
git commit -m "docs: muscle rank coverage audit shipped (2026-05-02)"
```

- [ ] **Step 7: Print the deploy command for the user.**

The user deploys Fly.io manually. Print this for them to copy-paste:

```
cd backend
flyctl deploy --app gym-tracker-api-bold-violet-7582
```

Vercel will auto-deploy the frontend changes on the next push to master.

---

## Self-Review Checklist

After completing all tasks, verify against the spec:

- [x] Spec § "Group structure" — Tasks 2 (`MVP_GROUPS` change), 3 (test fixes).
- [x] Spec § "Per-group pathway template" — Tasks 5 (abs), 6 (biceps/triceps), 7 (hamstrings), 8 (quads + chest).
- [x] Spec § "Threshold tables (research-backed)" — Tasks 1 (constants), 2 (display tables for biceps/triceps/abs).
- [x] Spec § "Existing-table recalibrations" — Task 1 (tricep iso, back tightening, ARMS_TRICEP_ISOLATION specs).
- [x] Spec § "Pure-isolation cap" — Task 1 (constant), Tasks 6 + 7 + 8 (cap applied in `_compute_*_hybrid`).
- [x] Spec § "Catalog audit process" — Task 11 (`CATALOG_AUDIT` + completeness test).
- [x] Spec § "Migration" — Task 4 (`lookback_days_override`), Task 10 (`split_arms_2026_05` block).
- [x] Spec § "Manual 1RM extension" — Task 1/2 (`MANUAL_1RM_KEY` rows), Task 15 (Settings UI).
- [x] Spec § "Backend code shape" — Tasks 1, 2, 4-10 (config + engine + router + main).
- [x] Spec § "Frontend changes" — Tasks 13 (labels), 14 (BodyMap), 15 (Settings), 16 (i18n).
- [x] Spec § "Tests" — Tests 1-12 covered across Tasks 4, 5, 6, 7, 8, 10, 11, 12.
- [x] Spec § "Manual smoke checklist" — Task 17 step 3.
