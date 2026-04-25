"""Regression tests for the manual 1RM PATCH endpoint.

Covers the SQLAlchemy JSON-column mutation bug: an existing dict on
`User.manual_1rm` must continue to accept partial updates on subsequent
PATCHes without silent no-ops.
"""

from app.models import User


def test_patch_first_time_persists(client, db):
    res = client.patch(
        "/api/manual-1rm",
        json={
            "lifts": {
                "bench": {"value_kg": 100.0, "tested_at": "2026-04-01"},
            }
        },
    )
    assert res.status_code == 200
    user = db.query(User).first()
    assert user.manual_1rm["bench"]["value_kg"] == 100.0
    assert user.manual_1rm["bench"]["tested_at"] == "2026-04-01"


def test_patch_adds_second_category_without_dropping_first(client, db):
    """Regression: before the flag_modified fix, the second PATCH was a silent no-op
    because SQLAlchemy didn't detect the in-place mutation of the existing dict."""
    client.patch(
        "/api/manual-1rm",
        json={"lifts": {"bench": {"value_kg": 100.0, "tested_at": "2026-04-01"}}},
    )
    res = client.patch(
        "/api/manual-1rm",
        json={"lifts": {"squat": {"value_kg": 140.0, "tested_at": "2026-04-10"}}},
    )
    assert res.status_code == 200

    # Round-trip through a GET to ensure the write landed in the DB, not only
    # in the response body.
    got = client.get("/api/manual-1rm").json()["manual_1rm"]
    assert got["bench"]["value_kg"] == 100.0
    assert got["squat"]["value_kg"] == 140.0
    assert got["squat"]["tested_at"] == "2026-04-10"


def test_patch_update_existing_category(client, db):
    client.patch(
        "/api/manual-1rm",
        json={"lifts": {"bench": {"value_kg": 100.0, "tested_at": "2026-04-01"}}},
    )
    client.patch(
        "/api/manual-1rm",
        json={"lifts": {"bench": {"value_kg": 110.0, "tested_at": "2026-04-15"}}},
    )
    got = client.get("/api/manual-1rm").json()["manual_1rm"]
    assert got["bench"]["value_kg"] == 110.0
    assert got["bench"]["tested_at"] == "2026-04-15"


def test_patch_null_clears_category(client, db):
    client.patch(
        "/api/manual-1rm",
        json={
            "lifts": {
                "bench": {"value_kg": 100.0, "tested_at": "2026-04-01"},
                "squat": {"value_kg": 140.0, "tested_at": "2026-04-10"},
            }
        },
    )
    res = client.patch("/api/manual-1rm", json={"lifts": {"bench": None}})
    assert res.status_code == 200
    got = client.get("/api/manual-1rm").json()["manual_1rm"]
    assert "bench" not in got
    assert got["squat"]["value_kg"] == 140.0
