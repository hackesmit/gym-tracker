"""Tests for multi-room chat feature (O3 in docs/known-bugs.md)."""

import pytest


def test_chat_default_room_is_general(client, db):
    resp = client.post("/api/chat", json={"content": "hello"})
    assert resp.status_code in (200, 201)
    assert resp.json()["room"] == "general"


def test_chat_explicit_general_room(client, db):
    resp = client.post("/api/chat", json={"content": "hello explicit", "room": "general"})
    assert resp.status_code in (200, 201)
    assert resp.json()["room"] == "general"


def test_chat_filters_by_room(client, db):
    client.post("/api/chat", json={"content": "in general"})
    client.post("/api/chat", json={"content": "in lifts", "room": "lifts"})

    general = client.get("/api/chat?room=general").json()
    lifts = client.get("/api/chat?room=lifts").json()

    assert any(m["content"] == "in general" for m in general["messages"])
    assert any(m["content"] == "in lifts" for m in lifts["messages"])
    assert not any(m["content"] == "in lifts" for m in general["messages"])


def test_chat_rooms_lists_with_activity(client, db):
    client.post("/api/chat", json={"content": "hi"})
    client.post("/api/chat", json={"content": "first lift", "room": "lifts"})

    rooms = client.get("/api/chat/rooms").json()
    names = {r["name"] for r in rooms["rooms"]}
    assert "general" in names
    assert "lifts" in names


def test_chat_rooms_general_always_first(client, db):
    """general is always the first room regardless of activity order."""
    # Post to lifts first
    client.post("/api/chat", json={"content": "lift msg", "room": "lifts"})
    client.post("/api/chat", json={"content": "general msg"})

    rooms = client.get("/api/chat/rooms").json()["rooms"]
    assert rooms[0]["name"] == "general"


def test_chat_rooms_has_message_count_and_preview(client, db):
    client.post("/api/chat", json={"content": "first"})
    client.post("/api/chat", json={"content": "second"})

    rooms = client.get("/api/chat/rooms").json()["rooms"]
    general = next(r for r in rooms if r["name"] == "general")
    assert general["message_count"] == 2
    assert general["last_message_preview"] == "second"
    assert general["last_message_at"] is not None


def test_chat_room_messages_isolated(client, db):
    """Messages in room A should not appear when fetching room B."""
    client.post("/api/chat", json={"content": "room-a-msg", "room": "room-a"})
    client.post("/api/chat", json={"content": "room-b-msg", "room": "room-b"})

    a_msgs = client.get("/api/chat?room=room-a").json()["messages"]
    b_msgs = client.get("/api/chat?room=room-b").json()["messages"]

    assert len(a_msgs) == 1 and a_msgs[0]["content"] == "room-a-msg"
    assert len(b_msgs) == 1 and b_msgs[0]["content"] == "room-b-msg"


def test_chat_after_id_respects_room(client, db):
    """after_id polling should still filter by room."""
    r1 = client.post("/api/chat", json={"content": "msg1"}).json()
    client.post("/api/chat", json={"content": "lifts-msg", "room": "lifts"})
    r3 = client.post("/api/chat", json={"content": "msg2"}).json()

    after_first = client.get(f"/api/chat?room=general&after_id={r1['id']}").json()
    contents = [m["content"] for m in after_first["messages"]]
    assert "msg2" in contents
    assert "lifts-msg" not in contents
