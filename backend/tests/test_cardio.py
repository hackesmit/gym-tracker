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


def _fastest_mile_holder(db):
    from app.models import Medal, MedalCurrentHolder
    return (
        db.query(MedalCurrentHolder)
        .join(Medal, Medal.id == MedalCurrentHolder.medal_id)
        .filter(Medal.metric_type == "cardio_fastest_mile")
        .first()
    )


def _seed_medals(db):
    # The lifespan runs against the prod engine, not the test fixture's
    # in-memory DB, so each medal-touching test seeds the catalog locally.
    from app.medal_engine import seed_medal_catalog
    seed_medal_catalog(db)


def test_fastest_mile_recomputes_after_delete(client, db):
    _seed_medals(db)
    # Aragorn's actual reported scenario: a fast run sets the medal, the
    # fast run is then deleted, and a slower run is logged. Pre-fix, the
    # medal stayed pinned at the deleted run's pace. Post-fix, it tracks
    # the slower (only remaining) run.
    fast = client.post("/api/cardio/log", json={
        "date": "2026-04-29", "modality": "run",
        "duration_minutes": 7 + 32 / 60, "distance_km": 2.0,
    })
    assert fast.status_code == 201, fast.text
    fast_id = fast.json()["id"]

    holder = _fastest_mile_holder(db)
    assert holder is not None
    assert abs(holder.value - (7 + 32 / 60) / 2.0) < 1e-6  # 3.766...

    res = client.delete(f"/api/cardio/log/{fast_id}")
    assert res.status_code == 200

    slow = client.post("/api/cardio/log", json={
        "date": "2026-04-30", "modality": "run",
        "duration_minutes": 13 + 53 / 60, "distance_km": 2.0,
    })
    assert slow.status_code == 201, slow.text

    db.expire_all()
    holder = _fastest_mile_holder(db)
    assert holder is not None
    # Should now be the slow run's pace (13:53/2 = ~6.94 min/km), NOT the
    # deleted fast run's 3.77 min/km.
    assert abs(holder.value - (13 + 53 / 60) / 2.0) < 1e-6


def test_fastest_mile_recomputes_after_patch(client, db):
    _seed_medals(db)
    # Aragorn typo: logs 7:32/2km, then edits to 13:53/2km. Pre-fix the
    # medal stayed at the typo'd pace; post-fix it follows the corrected row.
    res = client.post("/api/cardio/log", json={
        "date": "2026-04-29", "modality": "run",
        "duration_minutes": 7 + 32 / 60, "distance_km": 2.0,
    })
    assert res.status_code == 201, res.text
    log_id = res.json()["id"]

    holder = _fastest_mile_holder(db)
    assert abs(holder.value - (7 + 32 / 60) / 2.0) < 1e-6

    res = client.patch(f"/api/cardio/log/{log_id}", json={
        "duration_minutes": 13 + 53 / 60,
    })
    assert res.status_code == 200

    db.expire_all()
    holder = _fastest_mile_holder(db)
    assert abs(holder.value - (13 + 53 / 60) / 2.0) < 1e-6


def test_fastest_mile_clears_when_no_qualifying_logs_remain(client, db):
    _seed_medals(db)
    # Last run deleted → medal should have no current holder (or value 0).
    res = client.post("/api/cardio/log", json={
        "date": "2026-04-29", "modality": "run",
        "duration_minutes": 7 + 32 / 60, "distance_km": 2.0,
    })
    log_id = res.json()["id"]
    assert _fastest_mile_holder(db) is not None

    res = client.delete(f"/api/cardio/log/{log_id}")
    assert res.status_code == 200

    db.expire_all()
    assert _fastest_mile_holder(db) is None
