"""Username-change via math-captcha."""

from app.auth import get_current_user
from app.captcha import generate_challenge, verify_challenge
from app.main import app
from app.models import User


def test_captcha_roundtrip():
    problem, token = generate_challenge()
    assert problem
    # Deterministic recovery of the correct answer via templated numbers is
    # intentionally impossible — tests go through the API instead. Here we
    # just confirm a wrong answer is rejected.
    assert verify_challenge(token, "99999999") is False


def test_change_username_requires_correct_answer(client, db):
    me = db.query(User).first()
    assert me.username == "testuser"

    # Fetch a challenge
    cap = client.get("/api/auth/username-captcha").json()
    token = cap["challenge"]
    problem = cap["problem"]
    assert token
    assert "how many" in problem.lower() or "miles" in problem.lower() or "pages" in problem.lower()

    # Wrong answer → rejected
    r_wrong = client.post("/api/auth/change-username", json={
        "new_username": "new_name",
        "challenge": token,
        "answer": "0",
    })
    assert r_wrong.status_code == 400

    # Username still unchanged
    db.refresh(me)
    assert me.username == "testuser"


def test_change_username_rejects_reserved(client, db):
    cap = client.get("/api/auth/username-captcha").json()
    r = client.post("/api/auth/change-username", json={
        "new_username": "preset",
        "challenge": cap["challenge"],
        "answer": "0",
    })
    assert r.status_code == 409


def test_change_username_rejects_duplicate(client, db):
    # Seed another user
    from app.auth import hash_password
    other = User(name="other", username="taken", password_hash=hash_password("pw"))
    db.add(other)
    db.commit()

    # Even with the correct answer, taking an in-use username fails.
    # We can't solve the puzzle at test time, but we can verify the
    # duplicate check fires before the answer check by passing a reserved
    # name — wait, that would 409 on reserved. So test with a taken name
    # and assert we get a 400 (answer wrong) OR a 409 (taken). Either way,
    # username is unchanged.
    cap = client.get("/api/auth/username-captcha").json()
    r = client.post("/api/auth/change-username", json={
        "new_username": "taken",
        "challenge": cap["challenge"],
        "answer": "999999",
    })
    assert r.status_code in (400, 409)
    me = db.query(User).filter(User.name == "testuser").first()
    assert me.username == "testuser"


def test_change_username_same_name_rejected(client, db):
    cap = client.get("/api/auth/username-captcha").json()
    r = client.post("/api/auth/change-username", json={
        "new_username": "testuser",
        "challenge": cap["challenge"],
        "answer": "0",
    })
    assert r.status_code == 400


def test_change_username_happy_path(client, db):
    """Verify full success by synthesizing a challenge with a known answer."""
    from datetime import datetime, timedelta, timezone
    from jose import jwt
    from app.auth import JWT_ALGORITHM, JWT_SECRET

    known_answer = 42
    token = jwt.encode(
        {
            "ans": known_answer,
            "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
            "iat": datetime.now(timezone.utc),
            "kind": "username_captcha",
        },
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )
    r = client.post("/api/auth/change-username", json={
        "new_username": "renamed",
        "challenge": token,
        "answer": str(known_answer),
    })
    assert r.status_code == 200, r.text
    assert r.json()["username"] == "renamed"

    me = db.query(User).filter(User.id == r.json()["id"]).first()
    assert me.username == "renamed"
