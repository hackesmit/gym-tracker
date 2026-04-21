"""Tests for auth endpoints."""

from datetime import datetime, timedelta

from app.auth import create_access_token, decode_token, hash_password
from app.models import User


def test_register_and_login(client, db):
    res = client.post("/api/auth/register", json={
        "username": "alice", "password": "secret123",
    })
    assert res.status_code == 201
    body = res.json()
    assert body["token_type"] == "bearer"
    assert body["user"]["username"] == "alice"
    assert "access_token" in body

    res = client.post("/api/auth/login", json={"username": "alice", "password": "secret123"})
    assert res.status_code == 200
    assert res.json()["access_token"]


def test_login_wrong_password(client, db):
    client.post("/api/auth/register", json={"username": "bob", "password": "secret123"})
    res = client.post("/api/auth/login", json={"username": "bob", "password": "nope"})
    assert res.status_code == 401


def test_me_endpoint(client, db):
    # client fixture auto-overrides get_current_user to first user (testuser)
    res = client.get("/api/auth/me")
    assert res.status_code == 200
    assert res.json()["username"] == "testuser"


def test_remember_me_longer_expiry():
    t_short = create_access_token(1, remember=False)
    t_long = create_access_token(1, remember=True)
    exp_short = decode_token(t_short)["exp"]
    exp_long = decode_token(t_long)["exp"]
    # Long expiry should be at least 3x short
    assert exp_long > exp_short + 10 * 86400


def test_password_hash_verify():
    from app.auth import verify_password
    h = hash_password("hello")
    assert verify_password("hello", h)
    assert not verify_password("world", h)
