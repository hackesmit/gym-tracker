# Dead-Code Audit Follow-Up — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Apply the remaining Phase 2 dead-code audit candidates that were too risky or wide-surface to bundle into the 2026-05-18 session. Each candidate is paired with explicit verification steps so an executor can confidently delete or rename.

**Origin:** Phase 2 of `docs/superpowers/plans/2026-05-18-todays-bugfixes.md`. Six parallel Explore agents enumerated unreferenced exports across backend and frontend; the safest subset (14 exports in `frontend/src/api/client.js`) was applied in commit `08e046c`. This plan captures everything else.

**Sequencing:** Tasks are independent. Apply in any order, one commit per task. Run the full test suite (`pytest -q` + `npm test -- --run`) between tasks.

---

## File Map

| File | Change | Why |
|---|---|---|
| `frontend/src/components/AchievementToast.jsx` | Verify + maybe delete | Audit flagged whole file as orphaned; CLAUDE.md mentions it — verify before removing |
| `frontend/src/components/BodyMap.jsx` | Verify + maybe delete | Audit flagged orphaned; CLAUDE.md "Profile → BodyMap" suggests it's used |
| `frontend/src/components/LotrIcons.jsx` | Modify | 16 unused icon exports + 1 alias; surgical removal |
| `frontend/src/components/RealmBorder.jsx` | Modify | 3 unused divider exports |
| `frontend/src/components/RestTimer.jsx` | Modify | Unused `RestTimerBar` named export |
| `frontend/src/i18n.js` | Modify | 3 unused `settings.knownOneRM.*` keys |
| `backend/app/parser.py` | Modify | `NORMALIZATION_MAP`, `_KNOWN_SESSIONS` orphans |
| `backend/app/medal_engine.py` | Modify | `ICON_KEY_BY_METRIC` dict, `_medal_by_metric` helper |
| `backend/app/auth.py` | Modify | Rename `DEFAULT_EXPIRY_DAYS` / `REMEMBER_EXPIRY_DAYS` to `_`-prefixed; verify `verify_password` / `oauth2_scheme` |
| `backend/app/routers/analytics.py` | Modify | Drop unused `suggest_next_session` import |
| `backend/app/routers/auth.py` | Decide | `admin_user_rank_trace` — admin diagnostic, keep or remove? |
| `backend/app/routers/ranks.py` | Decide | `POST /api/ranks/recompute` — redundant with auto-recompute on read |

---

## Task 1: BodyMap.jsx — verify before deleting

**Files:**
- Possibly delete: `frontend/src/components/BodyMap.jsx`

CLAUDE.md states: "Profile.jsx — Self profile: BodyMap, medals, PRs" and "BodyMap.jsx — SVG body with per-muscle rank coloring". The audit agent reported zero references, which contradicts CLAUDE.md.

- [ ] **Step 1: Independent grep — definition exports and JSX usage**

```bash
cd /mnt/c/Users/danie/downloads/gym\ tracker
grep -rn "BodyMap\b" frontend/src/ 2>/dev/null
grep -rn "from.*BodyMap\|import.*BodyMap" frontend/src/ 2>/dev/null
grep -rn "<BodyMap" frontend/src/ 2>/dev/null
```

- [ ] **Step 2: Decide**
  - **If grep finds importers/JSX usage:** the audit agent was wrong. Update this task to "no action; CLAUDE.md is correct" and skip.
  - **If grep confirms zero references:** CLAUDE.md is stale. Delete the file AND update CLAUDE.md to remove the BodyMap line from `components/` and from the Profile.jsx description.

- [ ] **Step 3: If deleting:**
```bash
rm "frontend/src/components/BodyMap.jsx"
```
Update CLAUDE.md:
- Remove the line `│   │   │   ├── BodyMap.jsx            # SVG body with per-muscle rank coloring`
- Edit the Profile.jsx description from `Self profile: BodyMap, medals, PRs (hub sub-tab /profile/me)` to `Self profile: medals, PRs (hub sub-tab /profile/me)`

- [ ] **Step 4: Run frontend tests**
```bash
cd frontend && npm test -- --run
```
Expected: 54 pass (no test imports BodyMap).

- [ ] **Step 5: Commit (only if deleted)**
```bash
git add -A
git commit -m "chore: remove orphaned BodyMap.jsx (audit confirmed zero references)"
```

---

## Task 2: AchievementToast.jsx — verify before deleting

Same shape as Task 1.

- [ ] **Step 1: Grep**
```bash
grep -rn "AchievementToast\b" frontend/src/ 2>/dev/null
```

- [ ] **Step 2 onward:** same as Task 1, against `AchievementToast.jsx`. If deleting, also remove the corresponding line from CLAUDE.md's `components/` listing.

---

## Task 3: LotrIcons.jsx — remove 16 unused icons + CompassMap alias

The audit agent listed these icons as having zero references across the codebase:
`WhiteTree, Hammer, Barbell, MithrilVest, Crown, StarOfFeanor, DoorsOfDurin, MountainPass, RangersBoot, Banner, LevelUp, Hourglass, WeightStack, Fellowship, Beacon, Lembas` plus the `CompassMap` alias.

- [ ] **Step 1: Re-verify each icon name individually**
```bash
cd /mnt/c/Users/danie/downloads/gym\ tracker
for name in WhiteTree Hammer Barbell MithrilVest Crown StarOfFeanor DoorsOfDurin MountainPass RangersBoot Banner LevelUp Hourglass WeightStack Fellowship Beacon Lembas CompassMap; do
  echo "=== $name ==="
  grep -rn "\\b$name\\b" frontend/src/ 2>/dev/null | grep -v "frontend/src/components/LotrIcons.jsx"
done
```

For each name that returns lines, REMOVE it from the deletion list.

Watch-out: `Crown` and `Banner` and `Beacon` and `Hourglass` are also common Lucide icon names — make sure the matches are about THIS file, not a Lucide import elsewhere.

- [ ] **Step 2: Read `LotrIcons.jsx`** — note which icons are referenced by surviving CLAUDE.md "11 heraldic SVG icons" copy.

- [ ] **Step 3: Remove verified-dead icon exports** from `LotrIcons.jsx`. Each is typically `export function X({...}) { return <svg>...</svg>; }`. Delete cleanly.

- [ ] **Step 4: Run frontend tests + manual visual check**
```bash
cd frontend && npm test -- --run
```
If any visual page used a removed icon by accident, the page won't crash — React renders `undefined` as nothing. Manual smoke: load `/` and `/profile` and scan for missing icons.

- [ ] **Step 5: Update CLAUDE.md** — if the count is no longer 11 (or the listed icons in CLAUDE.md include any removed names), update the doc.

- [ ] **Step 6: Commit**
```bash
git add frontend/src/components/LotrIcons.jsx CLAUDE.md
git commit -m "chore: remove unused LotrIcons exports (audit follow-up)"
```

---

## Task 4: RealmBorder.jsx dividers + RestTimer RestTimerBar

Two small, file-local cleanups.

- [ ] **Step 1: Re-verify**
```bash
cd /mnt/c/Users/danie/downloads/gym\ tracker
for name in GondorDivider ElvenDivider DwarvenDivider RestTimerBar; do
  echo "=== $name ==="
  grep -rn "\\b$name\\b" frontend/src/ 2>/dev/null | grep -v "frontend/src/components/"
done
```

- [ ] **Step 2: Remove verified-dead exports** from `RealmBorder.jsx` and `RestTimer.jsx`.

- [ ] **Step 3: Tests + commit**
```bash
cd frontend && npm test -- --run
git add -A
git commit -m "chore: remove unused RealmBorder dividers + RestTimerBar export"
```

---

## Task 5: i18n.js — remove 3 unused settings.knownOneRM keys

The audit found these keys defined in `settings.knownOneRM` but never referenced via `t('settings.knownOneRM.X')`:

```
settings.knownOneRM.bicepsCurl
settings.knownOneRM.dip
settings.knownOneRM.cableCrunch
```

- [ ] **Step 1: Re-verify with broader greps**
```bash
cd /mnt/c/Users/danie/downloads/gym\ tracker
for k in bicepsCurl dip cableCrunch; do
  echo "=== knownOneRM.$k ==="
  grep -rn "knownOneRM\\.$k\|knownOneRM\\.'$k'\|\"knownOneRM\\.$k\"" frontend/src/ 2>/dev/null
done
```

- [ ] **Step 2: Remove the three keys from both `en` and `es` blocks of `STRINGS`** in `frontend/src/i18n.js`. Match indentation exactly.

- [ ] **Step 3: Tests + commit**
```bash
cd frontend && npm test -- --run
git add frontend/src/i18n.js
git commit -m "chore(i18n): remove unused settings.knownOneRM keys"
```

---

## Task 6: parser.py — NORMALIZATION_MAP + _KNOWN_SESSIONS

- [ ] **Step 1: Re-verify**
```bash
cd /mnt/c/Users/danie/downloads/gym\ tracker
grep -rn "NORMALIZATION_MAP\|_KNOWN_SESSIONS" backend/ frontend/ 2>/dev/null
```

If either name is referenced outside `parser.py` itself, drop it from the deletion list.

- [ ] **Step 2: Remove both from `backend/app/parser.py`** along with any leftover comments referring to them.

- [ ] **Step 3: Tests + commit**
```bash
cd backend && pytest -q tests/test_isolation.py tests/test_workout_log_schema.py
git add backend/app/parser.py
git commit -m "chore(parser): remove unused NORMALIZATION_MAP + _KNOWN_SESSIONS"
```

---

## Task 7: medal_engine.py — ICON_KEY_BY_METRIC + _medal_by_metric

- [ ] **Step 1: Re-verify**
```bash
cd /mnt/c/Users/danie/downloads/gym\ tracker
grep -rn "ICON_KEY_BY_METRIC\|_medal_by_metric" backend/ frontend/ 2>/dev/null
```

- [ ] **Step 2: Read `backend/app/medal_engine.py`** and locate both. Remove the dict and the helper function.

- [ ] **Step 3: Run medal tests**
```bash
cd backend && pytest -q tests/test_medals.py tests/test_medal_leaderboard.py
```

- [ ] **Step 4: Commit**
```bash
git add backend/app/medal_engine.py
git commit -m "chore(medals): remove unused ICON_KEY_BY_METRIC + _medal_by_metric"
```

---

## Task 8: auth.py — rename expiry constants, verify other candidates

- [ ] **Step 1: Verify `verify_password` is dead**
```bash
cd /mnt/c/Users/danie/downloads/gym\ tracker
grep -rn "verify_password" backend/ 2>/dev/null
```

If the only matches are the definition in `auth.py` and re-exports in `routers/auth.py`, the function is dead. If `routers/auth.py` actually calls it (e.g. inside `login`), KEEP it.

- [ ] **Step 2: Verify `oauth2_scheme`**

This is almost certainly a FastAPI structural dependency. Check:
```bash
grep -rn "oauth2_scheme" backend/ 2>/dev/null
```

If it's only defined and never used, you can drop it. If `get_current_user` references it (it usually does), KEEP it.

- [ ] **Step 3: Rename internal constants**

`DEFAULT_EXPIRY_DAYS` and `REMEMBER_EXPIRY_DAYS` are used only inside `auth.py`. Rename to `_DEFAULT_EXPIRY_DAYS` and `_REMEMBER_EXPIRY_DAYS` to signal module-private. Don't delete — they're load-bearing for `create_access_token`.

- [ ] **Step 4: Tests + commit**
```bash
cd backend && pytest -q tests/test_auth.py tests/test_username_captcha.py
git add backend/app/auth.py
git commit -m "chore(auth): mark expiry-day constants module-private"
```

---

## Task 9: routers/analytics.py — drop unused `suggest_next_session` import

The audit on `backend/app/analytics/` clarified that `suggest_next_session` IS called internally by `get_overload_plan`, but the import in `routers/analytics.py` is unused.

- [ ] **Step 1: Confirm**
```bash
cd /mnt/c/Users/danie/downloads/gym\ tracker
grep -n "suggest_next_session" backend/app/routers/analytics.py
```

- [ ] **Step 2: Remove the import line** from `backend/app/routers/analytics.py`. The function stays in `analytics/overload.py` — only the dead import goes.

- [ ] **Step 3: Tests + commit**
```bash
cd backend && pytest -q tests/test_analytics.py
git add backend/app/routers/analytics.py
git commit -m "chore(analytics): drop unused suggest_next_session import"
```

---

## Task 10 (optional, requires user decision): admin endpoints

Two endpoints flagged by the routers audit are admin/ops diagnostics:

- `GET /api/auth/admin/user-rank-trace/{user_id_or_name}` — 114-line back-rank diagnostic, used only via curl.
- `POST /api/ranks/recompute` — redundant with the auto-recompute that `GET /api/ranks` already performs.

These are working features the UI doesn't call. **Do not remove without explicit user consent** — they're operational tools the human admin may use directly.

- [ ] **Step 1: Ask the user**: "I found two admin endpoints with zero UI callers and zero test coverage. Keep them as ops tools, or remove because the auto-recompute on read makes the manual POST redundant?"

- [ ] **Step 2: Based on the answer**, either annotate the endpoints with a `# ops-only — no UI caller, kept as diagnostic tool` comment, or delete them.

---

## Self-review checklist

- [x] Every audit-flagged candidate is either applied in commit `08e046c`, listed as a task here, or explicitly defended as load-bearing (SQLAlchemy model imports for table registration, FastAPI structural deps, etc.).
- [x] Each task has its own re-verification grep before any deletion — the audit results were a starting point, not a final verdict.
- [x] Whole-file deletes (BodyMap, AchievementToast) include a CLAUDE.md update step in case the doc had stale references.
- [x] Tasks are independent and can be cherry-picked.
- [x] No task touches code that the previous tasks in the main 2026-05-18 plan are still actively modifying.
