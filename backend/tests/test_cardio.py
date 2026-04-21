"""CRUD round-trip for cardio."""


def test_cardio_crud(client, db):
    # Create
    res = client.post("/api/cardio/log", json={
        "date": "2026-04-01", "modality": "run",
        "duration_minutes": 30, "distance_km": 5.0,
    })
    assert res.status_code == 201, res.text
    cid = res.json()["id"]

    # List
    res = client.get("/api/cardio/logs")
    assert res.status_code == 200
    assert len(res.json()) == 1

    # Patch
    res = client.patch(f"/api/cardio/log/{cid}", json={"distance_km": 6.0})
    assert res.status_code == 200
    assert res.json()["distance_km"] == 6.0

    # Summary
    res = client.get("/api/cardio/summary")
    assert res.status_code == 200
    body = res.json()
    assert "weekly" in body and "pbs" in body

    # Delete
    res = client.delete(f"/api/cardio/log/{cid}")
    assert res.status_code == 200

    res = client.get("/api/cardio/logs")
    assert res.json() == []


def test_cardio_validation_rejects_impossible_pace(client, db):
    # pace < 2 min/km not allowed
    res = client.post("/api/cardio/log", json={
        "date": "2026-04-01", "modality": "run",
        "duration_minutes": 5, "distance_km": 10.0,
    })
    assert res.status_code == 400


def test_cardio_validation_rejects_zero_duration(client, db):
    res = client.post("/api/cardio/log", json={
        "date": "2026-04-01", "modality": "bike",
        "duration_minutes": 0,
    })
    assert res.status_code == 422
