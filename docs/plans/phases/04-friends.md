# Phase 4 — Friend System

## Goal
Pairwise connections + safe aggregate comparison.

## Done
- Model `Friendship(id, requester_id, addressee_id, status[pending|accepted|declined], created_at, updated_at)` with unique `(requester_id, addressee_id)`.
- Router `/api/friends`:
  - `POST /request` {username}
  - `POST /accept/{id}`
  - `POST /decline/{id}`
  - `DELETE /{id}`
  - `GET /` — returns accepted friends with aggregate metrics (volume_30d, sessions_30d, medals_owned).
- Helper `get_friend_ids(user_id)` used by leaderboards / feed.
- Frontend: `pages/Friends.jsx` — accepted list, incoming requests (Accept/Decline), outgoing pending (grayed), add-by-username.
- Comparison stays aggregate-only. Raw logs / notes remain private.

## Not done / follow-ups
- No blocked-users list.
- No notification system for incoming requests (user must visit Friends page).
- No friend activity feed filter (feed already merges friends, but can't filter to a single friend).
