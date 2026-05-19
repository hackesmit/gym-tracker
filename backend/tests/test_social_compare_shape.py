"""Verify /api/social/compare returns the rich profile shape that
frontend/src/pages/UserProfile.jsx needs."""

from app.models import Achievement, Medal, MedalCurrentHolder, User
from datetime import date


def test_compare_self_returns_rich_profile_shape(client, db):
    """Comparing self against self exercises all the new fields without
    needing a friendship fixture."""
    me = db.query(User).first()
    resp = client.get(f"/api/social/compare/{me.id}")
    assert resp.status_code == 200, resp.text
    body = resp.json()

    # Top-level shape
    assert "me" in body and "them" in body and "friend" in body

    for slot in ("me", "them", "friend"):
        prof = body[slot]
        # Identity
        assert prof["user_id"] == me.id
        assert prof["username"] == me.username
        # Rich rank shape
        assert "muscle_ranks" in prof and isinstance(prof["muscle_ranks"], list)
        # ELO dict shape — was the missing piece causing 0 total + undefined dominant tier
        assert isinstance(prof["elo"], dict)
        for k in ("total", "mean", "max", "dominant_tier"):
            assert k in prof["elo"], f"elo.{k} missing"
        # Medals list
        assert isinstance(prof["medals"], list)
        # Recent PRs list
        assert isinstance(prof["recent_prs"], list)
