"""Tests for program sharing endpoints."""

from datetime import date

from app.auth import get_current_user, hash_password
from app.database import get_db
from app.main import app
from app.models import Program, ProgramExercise, User


def _make_program(db, user_id: int, name: str = "Shared Plan") -> Program:
    program = Program(
        user_id=user_id,
        name=name,
        frequency=3,
        start_date=date.today(),
        status="active",
        total_weeks=4,
    )
    db.add(program)
    db.flush()
    # Two weeks, three sessions each so the clone has something to copy
    for week in (1, 2):
        for s_idx, session_name in enumerate(("PUSH", "PULL", "LEGS"), start=1):
            for e_idx, ex in enumerate(("BENCH PRESS", "BARBELL ROW", "BACK SQUAT"), start=1):
                db.add(ProgramExercise(
                    program_id=program.id,
                    week=week,
                    session_name=session_name,
                    session_order_in_week=s_idx,
                    exercise_order=e_idx,
                    exercise_name_canonical=ex,
                    exercise_name_raw=ex,
                    warm_up_sets="0",
                    working_sets=3,
                    prescribed_reps="5-8",
                    prescribed_rpe="8",
                    rest_period="2MIN",
                    substitution_1=None,
                    substitution_2=None,
                    notes=None,
                    is_superset=False,
                    superset_group=None,
                ))
    db.commit()
    db.refresh(program)
    return program


def test_share_code_enable_and_preview(client, db):
    owner = db.query(User).first()
    program = _make_program(db, owner.id)

    r = client.post(f"/api/program/{program.id}/share")
    assert r.status_code == 200, r.text
    code = r.json()["share_code"]
    assert code and len(code) >= 6

    # Calling again is idempotent — same code returned
    r2 = client.post(f"/api/program/{program.id}/share")
    assert r2.json()["share_code"] == code

    # Preview returns metadata without importing
    prev = client.get(f"/api/programs/shared/{code.lower()}")  # case-insensitive
    assert prev.status_code == 200
    body = prev.json()
    assert body["name"] == "Shared Plan"
    assert body["frequency"] == 3
    assert body["total_exercises"] == 2 * 3 * 3  # 2 weeks * 3 sessions * 3 ex
    assert sorted(body["sessions_week1"]) == ["LEGS", "PULL", "PUSH"]


def test_share_code_import_creates_copy(client, db):
    owner = db.query(User).first()
    program = _make_program(db, owner.id, name="Donor")

    # Generate the share code as owner
    code = client.post(f"/api/program/{program.id}/share").json()["share_code"]

    # Create a second user and switch the client's identity to them
    importer = User(
        name="importer",
        username="importer",
        password_hash=hash_password("password"),
    )
    db.add(importer)
    db.commit()
    db.refresh(importer)

    # Reassign the current-user dependency to the importer
    def _importer():
        return importer

    app.dependency_overrides[get_current_user] = _importer
    try:
        # Owner cannot import their own program
        def _owner():
            return owner
        app.dependency_overrides[get_current_user] = _owner
        r_self = client.post("/api/programs/import-shared", json={"code": code})
        assert r_self.status_code == 400

        app.dependency_overrides[get_current_user] = _importer

        # Invalid code is rejected
        r_bad = client.post("/api/programs/import-shared", json={"code": "NOPE0000"})
        assert r_bad.status_code == 404

        # Successful import creates a new program for the importer
        r = client.post(
            "/api/programs/import-shared",
            json={"code": code, "rename": "My Copy"},
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["name"] == "My Copy"
        assert body["frequency"] == 3
        assert body["exercises_copied"] == 2 * 3 * 3
        new_id = body["id"]
        assert new_id != program.id

        new_program = db.get(Program, new_id)
        assert new_program.user_id == importer.id
        assert new_program.status == "active"
        assert new_program.share_code is None

        # Original program still owned by owner, unchanged
        src = db.get(Program, program.id)
        assert src.user_id == owner.id
    finally:
        # Restore default override so other tests see the seeded user
        app.dependency_overrides[get_current_user] = lambda: db.query(User).first()


def test_share_code_revoke_invalidates_imports(client, db):
    owner = db.query(User).first()
    program = _make_program(db, owner.id)
    code = client.post(f"/api/program/{program.id}/share").json()["share_code"]

    # Revoke
    r = client.delete(f"/api/program/{program.id}/share")
    assert r.status_code == 200
    assert r.json()["share_enabled"] is False

    # Preview should now 404
    prev = client.get(f"/api/programs/shared/{code}")
    assert prev.status_code == 404


def test_import_program_demotes_previous_active(client, db):
    # Create an existing active program via the custom-program endpoint
    r1 = client.post("/api/programs/custom", json={
        "name": "Old Active",
        "total_weeks": 4,
        "activate": True,
        "sessions": [
            {"name": "FULL", "exercises": [
                {"name": "BENCH PRESS", "working_sets": 3, "prescribed_reps": "5"},
            ]},
        ],
    })
    assert r1.status_code == 201
    old_id = r1.json()["id"]

    # Import a shared program → should demote "Old Active" to paused
    owner = db.query(User).first()
    donor = _make_program(db, owner.id, name="Donor")
    code = client.post(f"/api/program/{donor.id}/share").json()["share_code"]

    importer = User(name="importer2", username="importer2", password_hash=hash_password("pw"))
    db.add(importer); db.commit(); db.refresh(importer)

    # Give the importer an active program via the custom endpoint, then import-shared
    def _imp():
        return importer
    app.dependency_overrides[get_current_user] = _imp
    try:
        r_custom = client.post("/api/programs/custom", json={
            "name": "Imp Active",
            "total_weeks": 4,
            "activate": True,
            "sessions": [
                {"name": "FULL", "exercises": [
                    {"name": "BENCH PRESS", "working_sets": 3, "prescribed_reps": "5"},
                ]},
            ],
        })
        imp_active_id = r_custom.json()["id"]

        r_import = client.post("/api/programs/import-shared", json={"code": code})
        assert r_import.status_code == 201
        new_id = r_import.json()["id"]

        # Only the newly imported program should be active
        programs = client.get("/api/programs").json()["programs"]
        statuses = {p["id"]: p["status"] for p in programs}
        assert statuses[new_id] == "active"
        assert statuses[imp_active_id] == "paused"
    finally:
        app.dependency_overrides[get_current_user] = lambda: db.query(User).first()

    # Old owner's "Old Active" is untouched (they're a different user)
    owner_programs = client.get("/api/programs").json()["programs"]
    assert any(p["id"] == old_id and p["status"] == "active" for p in owner_programs)
