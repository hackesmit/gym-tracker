# Phase 1 — Auth + User Isolation

## Goal
JWT-authenticated multi-user platform with strict per-user data isolation.

## Done
- `backend/app/auth.py` — bcrypt hashing (direct bcrypt, not passlib — see Incidents), JWT (HS256), `create_access_token(sub, remember)` (7d / 30d), `get_current_user` FastAPI dep.
- `backend/app/routers/auth.py`:
  - `POST /api/auth/register`
  - `POST /api/auth/login` (updates `last_login_at`)
  - `GET /api/auth/me`
- User model gained: `username unique`, `email unique nullable`, `password_hash`, `last_login_at`.
- All 4 single-user fallbacks removed:
  - `logging.py._get_default_user()`
  - `programs.py._get_or_create_default_user()`
  - `analytics.py._default_user_id()`
  - `vacation.py._default_user()`
- Every private route now takes `current_user: User = Depends(get_current_user)` and filters all queries by `current_user.id`.
- Backfill: `_backfill_default_user()` in lifespan creates or upgrades a user to `username=hackesmit`, `password=password`. Idempotent.
- Frontend: `AuthContext` with `remember_me` (localStorage vs sessionStorage), `ProtectedRoute`, Login + Register pages, auto-logout on 401.
- Tests: `tests/test_auth.py`, `tests/test_isolation.py`.

## Incidents
- `passlib 1.7.4` silently broke on `bcrypt 5.0.0` (Python 3.14). Symptom: every login returned `Invalid credentials` even with a correctly seeded user. Cause: passlib reads `bcrypt.__about__.__version__` which was removed in bcrypt 5, then silently hashes/verifies incorrectly.
- Fix: replaced passlib with direct `bcrypt.hashpw`/`bcrypt.checkpw` in `auth.py`. Updated `requirements.txt` to drop passlib and pin `bcrypt>=4.0.0`. Re-seeded stored hash.

## Not done / follow-ups
- No login rate-limiting (spec called for optional). Skipped for MVP.
- Token revocation (logout is client-side only — token stays valid until expiry).
- Email verification flow.
- Password reset flow.
