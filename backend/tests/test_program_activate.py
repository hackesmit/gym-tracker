"""Tests for the one-active-invariant activate endpoint."""

from datetime import date

from app.models import Program, User


def _prog(db, user_id, name, status):
    p = Program(user_id=user_id, name=name, frequency=3,
                start_date=date.today(), status=status, total_weeks=4)
    db.add(p)
    db.flush()
    return p


def test_activate_pauses_other_active(client, db):
    user = db.query(User).first()
    a = _prog(db, user.id, "A", "active")
    b = _prog(db, user.id, "B", "paused")
    db.commit()

    r = client.post(f"/api/program/{b.id}/activate")
    assert r.status_code == 200, r.text

    db.refresh(a)
    db.refresh(b)
    assert b.status == "active"
    assert a.status == "paused"


def test_activate_already_active_noop(client, db):
    user = db.query(User).first()
    a = _prog(db, user.id, "A", "active")
    db.commit()
    r = client.post(f"/api/program/{a.id}/activate")
    assert r.status_code == 200
    db.refresh(a)
    assert a.status == "active"


def test_activate_other_users_program_404(client, db):
    user = db.query(User).first()
    other = User(name="o", username="other3", password_hash="x")
    db.add(other)
    db.flush()
    p = _prog(db, other.id, "X", "paused")
    db.commit()
    r = client.post(f"/api/program/{p.id}/activate")
    assert r.status_code == 404
