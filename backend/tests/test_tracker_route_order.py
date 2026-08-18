"""Static tracker paths must not be shadowed by the /{program_id} parameter."""


def test_calendar_overview_is_reachable(client):
    r = client.get("/api/tracker/calendar-overview?days=30")
    assert r.status_code == 200, r.text
    body = r.json()
    assert "days" in body and isinstance(body["days"], list)


def test_program_id_routes_still_resolve(client):
    r = client.get("/api/tracker/999999")
    assert r.status_code == 404
