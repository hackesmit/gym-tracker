# Rank Engine — Exercise Coverage Brief

> **Why this document exists**
> 
> The Gym Tracker rank engine only counts a very narrow set of barbell compounds when
> calculating muscle ranks. Users running hypertrophy programs (e.g. Jeff Nippard's
> Essentials, which ships as a preset) see most muscle groups frozen at **Copper V /
> 0 ELO** even after months of hard training, because none of the hypertrophy staples
> (DB presses, machines, cables, rows, pulldowns, curls, pushdowns, leg press, hack
> squat, lunges, etc.) are in the rank engine's whitelist.
> 
> This brief lists every exercise currently in the catalog + Nippard presets,
> annotated with the rank engine's current treatment (specificity multiplier, or
> **unmarked** if ignored). We're asking for suggested specificity values for the
> unmarked exercises so typical hypertrophy programs can rank properly.

---

## How the rank engine scores a muscle group

1. Collect all logged sets in the last **90 days** for the exercises in that group's
   whitelist (table below).
2. For each set, compute Epley 1-rep-max:
   `e1RM = load_kg × (1 + reps / 30)`. Reps > 10 are rejected; 1 rep returns the load.
3. Multiply by the exercise's **specificity multiplier** (0.00–1.00). Primary barbell
   lifts are 1.00; variants are discounted. `0.80` means a 100 kg lift counts as 80 kg
   of "chest 1RM equivalent".
4. Divide by bodyweight to get the group's **ratio** metric (e.g. chest = bench ÷ BW).
   Back and arms use "added load ÷ BW" for weighted pullups/dips.
5. Compare the best ratio across all qualifying lifts against the tier thresholds
   (below). Each tier is subdivided into 5 equal slots V→I. Continuous ELO is
   0–3100 per muscle, aggregate 0–18,600 across the 6 MVP groups
   (chest / back / shoulders / quads / hamstrings / arms).
6. Manual 1RM entries in Settings (bench / squat / deadlift / ohp) are first-class
   and max'd against logged data. Pullup-added / dip-added manual keys exist but are
   not surfaced in the Settings UI.

**Guardrails:**

- Ratio > 5× bodyweight → dropped as an outlier.
- Bodyweight must be in `[30 kg, 300 kg]` or the group returns Copper V.
- Reps > 10 → Epley is unreliable, rejected.
- Exact **uppercase string match** against `exercise_name_canonical`. No fuzzy match,
  no substring match — `INCLINE DB CHEST PRESS` is a different row from
  `INCLINE DB PRESS` unless both are whitelisted.

## Tier thresholds (ratio = best lift ÷ bodyweight, unless noted)

Ordered **Copper → Bronze → Silver → Gold → Platinum → Diamond → Champion**.
Each tier is the minimum ratio required to enter it. Copper is the floor (anything
below Bronze).

### `chest` — bench_press_1rm_over_bodyweight

| Tier | Min ratio |
|---|---|
| Bronze | 0.5 |
| Silver | 0.75 |
| Gold | 1.0 |
| Platinum | 1.25 |
| Diamond | 1.75 |
| Champion | 2.0 |

### `quads` — back_squat_1rm_over_bodyweight

| Tier | Min ratio |
|---|---|
| Bronze | 0.75 |
| Silver | 1.25 |
| Gold | 1.75 |
| Platinum | 2.0 |
| Diamond | 2.5 |
| Champion | 3.0 |

### `hamstrings` — deadlift_1rm_over_bodyweight

| Tier | Min ratio |
|---|---|
| Bronze | 1.0 |
| Silver | 1.5 |
| Gold | 2.0 |
| Platinum | 2.25 |
| Diamond | 2.75 |
| Champion | 3.25 |

### `shoulders` — overhead_press_1rm_over_bodyweight

| Tier | Min ratio |
|---|---|
| Bronze | 0.35 |
| Silver | 0.5 |
| Gold | 0.75 |
| Platinum | 0.9 |
| Diamond | 1.1 |
| Champion | 1.25 |

### `back` — weighted_pullup_added_over_bodyweight

| Tier | Min ratio |
|---|---|
| Bronze | 0.0 |
| Silver | 0.25 |
| Gold | 0.5 |
| Platinum | 0.75 |
| Diamond | 1.25 |
| Champion | 1.5 |

### `arms` — weighted_dip_added_over_bodyweight

| Tier | Min ratio |
|---|---|
| Bronze | 0.0 |
| Silver | 0.25 |
| Gold | 0.5 |
| Platinum | 0.75 |
| Diamond | 1.25 |
| Champion | 1.5 |

## Current exercise whitelist (what the engine accepts today)

### Chest

| Exercise | Specificity |
|---|---|
| BARBELL BENCH PRESS | `1.00` |
| BENCH PRESS | `1.00` |
| CLOSE-GRIP BENCH PRESS | `0.95` |
| FLAT BARBELL BENCH PRESS | `1.00` |
| INCLINE BARBELL BENCH PRESS | `0.90` |
| INCLINE BARBELL PRESS | `0.90` |
| PAUSED BENCH PRESS | `1.00` |

### Quads

| Exercise | Specificity |
|---|---|
| BACK SQUAT | `1.00` |
| BARBELL BACK SQUAT | `1.00` |
| FRONT SQUAT | `0.88` |
| PAUSED BACK SQUAT | `1.00` |
| SAFETY BAR SQUAT | `0.95` |

### Hamstrings

| Exercise | Specificity |
|---|---|
| CONVENTIONAL DEADLIFT | `1.00` |
| DEADLIFT | `1.00` |
| PAUSED DEADLIFT | `1.00` |
| ROMANIAN DEADLIFT | `0.85` |
| SUMO DEADLIFT | `1.00` |
| TRAP BAR DEADLIFT | `0.95` |

### Shoulders

| Exercise | Specificity |
|---|---|
| BARBELL OVERHEAD PRESS | `1.00` |
| MILITARY PRESS | `1.00` |
| OVERHEAD PRESS | `1.00` |
| SEATED BARBELL OHP | `1.00` |
| STANDING BARBELL OHP | `1.00` |
| STRICT PRESS | `1.00` |

### Back (pullups only — rows and pulldowns are ignored)

**Weighted pullups** (ratio = added load ÷ BW, same threshold table as `back`):

- `WEIGHTED CHIN UP`
- `WEIGHTED CHIN-UP`
- `WEIGHTED CHINUP`
- `WEIGHTED PULL UP`
- `WEIGHTED PULL-UP`
- `WEIGHTED PULLUP`
- `WEIGHTED PULLUPS`

**Bodyweight pullups** (used only if no weighted pullup data; uses the rep-count
fallback thresholds shown above):

- `2-GRIP PULLUP`
- `CHIN UP`
- `CHIN-UP`
- `CHINUP`
- `NEUTRAL GRIP PULLUP`
- `NEUTRAL-GRIP PULLUP`
- `PULL UP`
- `PULL-UP`
- `PULLUP`

### Arms (dips + close-grip bench only — curls and pushdowns are ignored)

**Weighted dips** (ratio = added load ÷ BW):

- `WEIGHTED DIP`
- `WEIGHTED DIP (BACK OFF)`
- `WEIGHTED DIP (HEAVY)`
- `WEIGHTED DIPS`

**Bodyweight dips** (rep-count fallback):

- `BODYWEIGHT DIP`
- `BODYWEIGHT DIPS`
- `DIP`
- `DIPS`
- `PARALLEL BAR DIP`

**Close-grip bench** (low-confidence proxy for arms 1RM; ratio = load ÷ BW):

- `CLOSE GRIP BENCH PRESS`
- `CLOSE-GRIP BENCH PRESS`
- `CLOSEGRIP BENCH PRESS`

## Every exercise in the catalog + Nippard presets, grouped by primary muscle

**Column meaning:**

- **Current treatment** — how the rank engine handles this exercise today.
  `chest 0.90` means it contributes to the `chest` rank with 90% specificity.
  `back (WEIGHTED_PULLUP set)` means it's in the weighted-pullup set, not a multiplier.
  **unmarked** means the rank engine ignores this exercise entirely.
- **Suggested specificity** — please fill this in. Use `0.00` to leave unmarked
  (if the exercise is too isolation / too unreliable a 1RM proxy). Values between
  0.30 and 1.00 are expected for compound / machine movements.

Suggested calibration anchors:

- **1.00** — primary barbell compound for the group (what the thresholds were written against).
- **0.85–0.95** — close barbell variant (paused, front squat, Romanian DL, incline bench).
- **0.70–0.85** — heavy DB / smith-machine / hack-squat / seated-DB variants.
- **0.50–0.70** — machine / cable compound with a fixed path (leg press, chest press machine, lat pulldown).
- **0.30–0.50** — partial-ROM or highly-stabilised movements (split squats, step-ups, lunges).
- **0.00 / unmarked** — isolation (curls, lateral raises, tricep pressdowns, calf raises) or
  where 1RM doesn't map cleanly to compound strength (flyes, pec deck).

### Chest

| Exercise | Current treatment | Suggested specificity |
|---|---|---|
| `BODYWEIGHT DIP` | arms (`BODYWEIGHT_DIP` set) |  |
| `CABLE CHEST FLY` | — **unmarked** |  |
| `CABLE CHEST PRESS` | — **unmarked** |  |
| `CABLE CHEST PRESS PUSHUPS` | — **unmarked** |  |
| `CLOSE-GRIP PUSH UP` | — **unmarked** |  |
| `FLAT DB PRESS (GET OFF)` | — **unmarked** |  |
| `FLAT DB PRESS (HEAVY)` | — **unmarked** |  |
| `INCLINE DB CHEST PRESS` | — **unmarked** |  |
| `INCLINE DB PRESS` | — **unmarked** |  |
| `INCLINE DUMBBELL PRESS` | — **unmarked** |  |
| `INCLINE MACHINE PRESS` | — **unmarked** |  |
| `INCLINE SMITH MACHINE PRESS` | — **unmarked** |  |
| `MACHINE CHEST FLY` | — **unmarked** |  |
| `MACHINE CHEST PRESS (BACK OFF)` | — **unmarked** |  |
| `MACHINE CHEST PRESS (HEAVY)` | — **unmarked** |  |
| `MACHINE PRESS` | — **unmarked** |  |
| `MACHINE PRESS (BACK OFF)` | — **unmarked** |  |
| `PEC DECK` | — **unmarked** |  |
| `PUSHUPS` | — **unmarked** |  |
| `SLIGHT INCLINE DB PRESS (BACK OFF)` | — **unmarked** |  |
| `SLIGHT INCLINE DB PRESS (HEAVY)` | — **unmarked** |  |
| `SMITH MACHINE CHEST PRESS` | — **unmarked** |  |
| `WEIGHTED DIP (BACK OFF)` | arms (`WEIGHTED_DIP` set) |  |
| `WEIGHTED DIP (HEAVY)` | arms (`WEIGHTED_DIP` set) |  |

### Back

| Exercise | Current treatment | Suggested specificity |
|---|---|---|
| `1-ARM HALF KNEELING LAT PULLDOWN` | — **unmarked** |  |
| `2-GRIP LAT PULLDOWN` | — **unmarked** |  |
| `2-GRIP PULLUP` | back (`BODYWEIGHT_PULLUP` set) |  |
| `2-GRIP PULLUP (ASSISTED)` | — **unmarked** |  |
| `HELMS DB ROW` | — **unmarked** |  |
| `INCLINE CHEST-SUPPORTED DB ROW` | — **unmarked** |  |
| `LAT PULLDOWN` | — **unmarked** |  |
| `MACHINE PULLDOWN` | — **unmarked** |  |
| `MEADOWS ROW` | — **unmarked** |  |
| `NEUTRAL GRIP LAT PULLDOWN` | — **unmarked** |  |
| `PENDLAY ROW` | — **unmarked** |  |
| `SEATED CABLE ROW` | — **unmarked** |  |
| `SINGLE-ARM DB ROW` | — **unmarked** |  |
| `T-BAR ROW` | — **unmarked** |  |
| `WEIGHTED PULLUP` | back (`WEIGHTED_PULLUP` set) |  |

### Shoulders

| Exercise | Current treatment | Suggested specificity |
|---|---|---|
| `BENT-OVER REVERSE DB FLYE` | — **unmarked** |  |
| `CABLE LATERAL RAISE` | — **unmarked** |  |
| `CABLE SHOULDER PRESS` | — **unmarked** |  |
| `DB LATERAL RAISE` | — **unmarked** |  |
| `MACHINE LATERAL RAISE` | — **unmarked** |  |
| `REVERSE CABLE FLY` | — **unmarked** |  |
| `REVERSE PEC DECK` | — **unmarked** |  |
| `ROPE FACEPULL` | — **unmarked** |  |
| `SEATED DB SHOULDER PRESS` | — **unmarked** |  |
| `STANDING DB ARNOLD PRESS` | — **unmarked** |  |
| `STANDING DB LATERAL RAISE` | — **unmarked** |  |

### Quads

| Exercise | Current treatment | Suggested specificity |
|---|---|---|
| `BW WALKING LUNGES` | — **unmarked** |  |
| `CLOSE STANCE HACK SQUAT` | — **unmarked** |  |
| `DB BULGARIAN SPLIT SQUAT` | — **unmarked** |  |
| `DB STEP UP` | — **unmarked** |  |
| `DB WALKING LUNGE` | — **unmarked** |  |
| `GOBLET SQUAT` | — **unmarked** |  |
| `HACK SQUAT (BACK OFF)` | — **unmarked** |  |
| `HACK SQUAT (HEAVY)` | — **unmarked** |  |
| `LEG EXTENSION` | — **unmarked** |  |
| `LEG PRESS` | — **unmarked** |  |
| `LEG PRESS (BACK OFF)` | — **unmarked** |  |
| `LEG PRESS (HEAVY)` | — **unmarked** |  |
| `LEG PRESS(HEAVY)` | — **unmarked** |  |
| `MACHINE SQUAT (BACK OFF)` | — **unmarked** |  |
| `MACHINE SQUAT (HEAVY)` | — **unmarked** |  |
| `NARROW STANCE SMITH SQUAT` | — **unmarked** |  |
| `SINGLE-LEG LEG PRESS (BACK OFF)` | — **unmarked** |  |
| `SINGLE-LEG LEG PRESS (HEAVY)` | — **unmarked** |  |
| `SMITH MACHINE SQUAT (BACK OFF)` | — **unmarked** |  |
| `SMITH MACHINE SQUAT (HEAVY)` | — **unmarked** |  |
| `WALKING LUNGES` | — **unmarked** |  |

### Hamstrings

| Exercise | Current treatment | Suggested specificity |
|---|---|---|
| `45-DEGREE BACK EXTENSION` | — **unmarked** |  |
| `45-DEGREE HYPEREXTENSION` | — **unmarked** |  |
| `DB ROMANIAN DEADLIFT` | — **unmarked** |  |
| `GLUTE-HAM RAISE` | — **unmarked** |  |
| `LYING LEG CURL` | — **unmarked** |  |
| `NORDIC HAM CURL` | — **unmarked** |  |
| `ROMANIAN DEADLIFT` | hamstrings `0.85` |  |
| `SEATED HAMSTRING CURL` | — **unmarked** |  |
| `SEATED LEG CURL` | — **unmarked** |  |

### Biceps (part of the `arms` rank)

| Exercise | Current treatment | Suggested specificity |
|---|---|---|
| `BAYESIAN CABLE CURL` | — **unmarked** |  |
| `CABLE EZ CURL` | — **unmarked** |  |
| `DB BICEP CURL` | — **unmarked** |  |
| `DB INCLINE CURL` | — **unmarked** |  |
| `DB SPIDER CURL` | — **unmarked** |  |
| `EZ BAR CURL` | — **unmarked** |  |
| `EZ BAR PREACHER CURL` | — **unmarked** |  |
| `INVERSE ZOTTMAN CURL` | — **unmarked** |  |
| `MACHINE BICEP CURL` | — **unmarked** |  |
| `MACHINE CURL` | — **unmarked** |  |
| `REVERSE GRIP EZ BAR CURL` | — **unmarked** |  |
| `SPIDER CURL` | — **unmarked** |  |

### Triceps (part of the `arms` rank)

| Exercise | Current treatment | Suggested specificity |
|---|---|---|
| `CABLE TRICEPS KICKBACK` | — **unmarked** |  |
| `DB FRENCH PRESS` | — **unmarked** |  |
| `DB SKULL CRUSHER` | — **unmarked** |  |
| `DB TRICEPS KICKBACK` | — **unmarked** |  |
| `EZ BAR FRENCH PRESS` | — **unmarked** |  |
| `EZ BAR SKULL CRUSHER` | — **unmarked** |  |
| `MACHINE TRICEPS EXTENSION` | — **unmarked** |  |
| `OVERHEAD CABLE TRICEPS EXTENSIONS` | — **unmarked** |  |
| `SMITH MACHINE JM PRESS` | — **unmarked** |  |
| `TRICEP PRESSDOWN` | — **unmarked** |  |
| `TRICEPS PRESSDOWN` | — **unmarked** |  |

### Abs (not ranked — included for completeness)

_Not included in the MVP rank engine. Listed for completeness only._

| Exercise | Current treatment | Suggested specificity |
|---|---|---|
| `CABLE CRUNCH` | — **unmarked** |  |
| `HANGING LEG RAISE` | — **unmarked** |  |
| `LEG RAISES` | — **unmarked** |  |
| `MACHINE CRUNCH` | — **unmarked** |  |
| `PLATE-WEIGHTED CRUNCH` | — **unmarked** |  |
| `ROMAN CHAIR CRUNCH` | — **unmarked** |  |
| `TWO-ARMS TWO-LEGS DEAD BUG` | — **unmarked** |  |

### Calves (not ranked — included for completeness)

_Not included in the MVP rank engine. Listed for completeness only._

| Exercise | Current treatment | Suggested specificity |
|---|---|---|
| `LEG PRESS TOE PRESS` | — **unmarked** |  |
| `SEATED CALF RAISE` | — **unmarked** |  |
| `STANDING CALF RAISE` | — **unmarked** |  |

---

## Special questions for back & arms

### Back
Today only weighted pullups (load ÷ BW) and bodyweight pullup reps count for back.
Rows and pulldowns are completely ignored. We want to add a new `BACK_ROWS_PULLDOWNS`
pathway with its own specificity so that a strong rower ranks. **Please propose:**

- Should rows/pulldowns use the **same tier thresholds** as pullups (added-load / BW)?
  The numeric range is different — a 1RM barbell row is typically ~0.8–1.5× BW,
  whereas a weighted pullup adds 0.25–1.25× BW on top of BW.
- If not, what threshold table do you propose? (Copper / Bronze / … / Champion values
  for row 1RM ÷ BW.)
- Specificity for each row/pulldown variant (LAT PULLDOWN, SEATED CABLE ROW, T-BAR ROW, …).

### Arms
Today only weighted dips (load ÷ BW), bodyweight dip reps, and close-grip bench
(as a tricep-biased proxy) count. Curls and pushdowns are excluded because they're
isolation. We could optionally add heavy tricep compounds (JM press, skull crusher).
**Please propose:**

- Should skull crushers / JM presses count at all? If yes, what specificity?
- For biceps specifically — is there any compound movement you'd accept, or stay
  isolation-only?

## Output format we need back

Fill in the **Suggested specificity** column above. For unmarked exercises you'd
keep unmarked, write `0.00`. For the Back-rows and Arms questions, a short paragraph
each is fine.
