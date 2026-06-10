"""Regression tests for /api/auth/absorb.

The endpoint reassigns user-owned rows from a source account to the caller,
then deletes the source. Without explicit handling for Achievement and
ChatMessage rows the FK delete trips with IntegrityError and the entire
absorb rolls back — silently breaking the documented "claim my hackesmit
data" flow for any user who has earned a PR or sent a chat.
"""

from app.auth import hash_password
from app.models import Achievement, ChatMessage, Friendship, User


def _make_source(db, username="srcuser", password="srcpass"):
    src = User(
        name="source",
        username=username,
        password_hash=hash_password(password),
    )
    db.add(src)
    db.commit()
    return src


def test_absorb_with_achievements_does_not_trip_fk(client, db):
    """Source had a PR — absorb must move the achievement row, not orphan it."""
    src = _make_source(db)
    db.add(Achievement(
        user_id=src.id,
        type="e1rm_pr",
        exercise_name="BARBELL BENCH PRESS",
        value=120.0,
    ))
    db.commit()

    r = client.post("/api/auth/absorb", json={
        "source_username": "srcuser",
        "source_password": "srcpass",
    })
    assert r.status_code == 200, r.text
    assert r.json()["moved"].get("achievements") == 1

    # Source user is gone, achievement now owned by absorber.
    assert db.query(User).filter(User.username == "srcuser").first() is None
    me = db.query(User).filter(User.username == "testuser").first()
    achs = db.query(Achievement).filter(Achievement.user_id == me.id).all()
    assert len(achs) == 1
    assert achs[0].exercise_name == "BARBELL BENCH PRESS"


def test_absorb_with_chat_messages_does_not_trip_fk(client, db):
    """Source had chat history — absorb must move the chat rows, not orphan them."""
    src = _make_source(db)
    db.add(ChatMessage(
        user_id=src.id,
        kind="user",
        content="hello world",
    ))
    db.commit()

    r = client.post("/api/auth/absorb", json={
        "source_username": "srcuser",
        "source_password": "srcpass",
    })
    assert r.status_code == 200, r.text
    assert r.json()["moved"].get("chat_messages") == 1
    assert db.query(User).filter(User.username == "srcuser").first() is None


def test_absorb_drops_friendship_that_would_duplicate(client, db):
    """Source and absorber are both friends with the same third user — the
    reassignment must drop the source's row instead of tripping the
    (requester_id, addressee_id) unique constraint and rolling back."""
    src = _make_source(db)
    third = User(name="third", username="third", password_hash=hash_password("x"))
    db.add(third)
    db.commit()

    me = db.query(User).filter(User.username == "testuser").first()
    db.add(Friendship(requester_id=me.id, addressee_id=third.id, status="accepted"))
    db.add(Friendship(requester_id=src.id, addressee_id=third.id, status="accepted"))
    db.commit()

    r = client.post("/api/auth/absorb", json={
        "source_username": "srcuser",
        "source_password": "srcpass",
    })
    assert r.status_code == 200, r.text
    assert db.query(User).filter(User.username == "srcuser").first() is None

    # Exactly one friendship remains between me and the third user.
    remaining = db.query(Friendship).all()
    assert len(remaining) == 1
    assert {remaining[0].requester_id, remaining[0].addressee_id} == {me.id, third.id}
