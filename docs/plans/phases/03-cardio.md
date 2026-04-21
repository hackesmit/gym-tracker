# Phase 3 — Cardio

## Goal
Track run / bike / swim / other cardio with standardized analytics.

## Done
- Model `CardioLog`: `id, user_id, date, modality, duration_minutes, distance_km, elevation_m, avg_hr, calories, rpe, notes, created_at, updated_at`.
- Router `/api/cardio`:
  - `POST /log`
  - `GET /logs` (filter by modality + date range)
  - `PATCH /log/{id}`
  - `DELETE /log/{id}`
  - `GET /summary` — weekly duration/distance, modality breakdown, 7d/30d/12w trends, PBs.
- Validation: rejects duration<=0, distance<0, impossible pace (<2 min/km for runs).
- Ownership enforced on PATCH/DELETE.
- Standardization: km, minutes, min/km canonical.
- Frontend: `pages/Cardio.jsx` — form, list (edit/delete), weekly summary + PB cards.
- Tests: `tests/test_cardio.py` (CRUD round-trip).

## Not done / follow-ups
- Swim `min/100m` pace exposure: summary returns canonical min/km; `100m` view can be derived client-side.
- No GPX/CSV import.
- No heart-rate zone analytics.
- No auto-matching of cardio to external devices/apps.
