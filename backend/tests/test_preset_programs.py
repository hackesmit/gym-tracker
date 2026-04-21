"""Preset Essentials programs seeded at startup and importable by code."""

from app.auth import get_current_user, hash_password
from app.main import app
from app.models import Program, ProgramExercise, User
from app.seed_presets import PRESETS, seed_preset_programs


def test_seed_presets_is_idempotent(db):
    seed_preset_programs(db)
    first = {p.share_code: p.id for p in db.query(Program).filter(Program.share_code.like("NIPPARD%")).all()}
    assert set(first.keys()) == {spec["share_code"] for spec in PRESETS}

    seed_preset_programs(db)  # second call shouldn't duplicate
    second = {p.share_code: p.id for p in db.query(Program).filter(Program.share_code.like("NIPPARD%")).all()}
    assert first == second


def test_each_preset_has_exercises(db):
    seed_preset_programs(db)
    for spec in PRESETS:
        prog = db.query(Program).filter(Program.share_code == spec["share_code"]).first()
        assert prog is not None, spec["share_code"]
        assert prog.frequency == spec["freq"]
        ex_count = db.query(ProgramExercise).filter(ProgramExercise.program_id == prog.id).count()
        assert ex_count > 0, f"{spec['share_code']} has no exercises"


def test_preset_importable_by_share_code(client, db):
    seed_preset_programs(db)

    importer = User(name="imp", username="imp", password_hash=hash_password("pw"))
    db.add(importer)
    db.commit()
    db.refresh(importer)
    app.dependency_overrides[get_current_user] = lambda: importer
    try:
        r = client.post("/api/programs/import-shared", json={"code": "NIPPARD3"})
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["frequency"] == 3
        assert body["exercises_copied"] > 0
    finally:
        app.dependency_overrides.pop(get_current_user, None)
