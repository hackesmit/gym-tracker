"""Tests for vacation period CRUD endpoints."""


class TestVacationCRUD:

    def test_list_empty(self, client, db):
        res = client.get("/api/vacation")
        assert res.status_code == 200
        assert res.json() == []

    def test_create_vacation(self, client, db):
        res = client.post("/api/vacation", json={
            "start_date": "2026-04-06",
            "reason": "Spring break",
        })
        assert res.status_code == 201
        body = res.json()
        assert body["start_date"] == "2026-04-06"
        assert body["end_date"] is None
        assert body["reason"] == "Spring break"
        assert "id" in body

    def test_create_vacation_with_end_date(self, client, db):
        res = client.post("/api/vacation", json={
            "start_date": "2026-04-06",
            "end_date": "2026-04-12",
        })
        assert res.status_code == 201
        assert res.json()["end_date"] == "2026-04-12"

    def test_end_vacation(self, client, db):
        res = client.post("/api/vacation", json={"start_date": "2026-04-06"})
        vid = res.json()["id"]
        res = client.put(f"/api/vacation/{vid}", json={"end_date": "2026-04-10"})
        assert res.status_code == 200
        assert res.json()["end_date"] == "2026-04-10"

    def test_delete_vacation(self, client, db):
        res = client.post("/api/vacation", json={"start_date": "2026-04-06"})
        vid = res.json()["id"]
        res = client.delete(f"/api/vacation/{vid}")
        assert res.status_code == 200
        res = client.get("/api/vacation")
        assert res.json() == []

    def test_list_returns_all(self, client, db):
        client.post("/api/vacation", json={"start_date": "2026-03-01", "end_date": "2026-03-07"})
        client.post("/api/vacation", json={"start_date": "2026-04-06"})
        res = client.get("/api/vacation")
        assert len(res.json()) == 2

    def test_active_vacation(self, client, db):
        res = client.get("/api/vacation/active")
        assert res.status_code == 404

        client.post("/api/vacation", json={"start_date": "2026-04-06"})
        res = client.get("/api/vacation/active")
        assert res.status_code == 200
        assert res.json()["end_date"] is None
