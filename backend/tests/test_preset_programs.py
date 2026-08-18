"""Preset Essentials programs seeded at startup and importable by code."""

from app.auth import get_current_user, hash_password
from app.main import app
from app.models import Program, ProgramExercise, User
from app.seed_presets import PRESETS, seed_preset_programs


def test_seed_presets_is_idempotent(db):
    seed_preset_programs(db)
    codes = [spec["share_code"] for spec in PRESETS]
    first = {p.share_code: p.id for p in db.query(Program).filter(Program.share_code.in_(codes)).all()}
    assert set(first.keys()) == set(codes)

    seed_preset_programs(db)  # second call shouldn't duplicate
    second = {p.share_code: p.id for p in db.query(Program).filter(Program.share_code.in_(codes)).all()}
    assert first == second


def test_seed_presets_adds_missing_codes_to_existing_install(db):
    """A deployed DB that already has the four Essentials presets picks up
    MINMAX5 on the next startup without touching the existing rows."""
    from app import seed_presets as sp

    original = sp.PRESETS
    sp.PRESETS = [spec for spec in original if spec["share_code"] != "MINMAX5"]
    try:
        seed_preset_programs(db)
    finally:
        sp.PRESETS = original
    assert db.query(Program).filter(Program.share_code == "MINMAX5").first() is None
    before = {p.share_code: p.id for p in db.query(Program).all()}

    seed_preset_programs(db)
    mm = db.query(Program).filter(Program.share_code == "MINMAX5").first()
    assert mm is not None
    after = {p.share_code: p.id for p in db.query(Program).all()}
    for code, pid in before.items():
        assert after[code] == pid


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


def test_minmax_preset_shape(db):
    seed_preset_programs(db)
    prog = db.query(Program).filter(Program.share_code == "MINMAX5").first()
    assert prog is not None
    assert prog.frequency == 5
    assert prog.total_weeks == 12
    assert prog.name == "The Min-Max Program (5x/week)"
    assert prog.status == "paused"
    rows = db.query(ProgramExercise).filter(ProgramExercise.program_id == prog.id).all()
    assert len(rows) == 420
    for w in range(1, 13):
        assert len({r.session_name for r in rows if r.week == w}) == 5
    # program structure only: RPE strings, no personal loads anywhere
    assert all(r.working_sets in (1, 2) for r in rows)
    assert {r.prescribed_rpe for r in rows} <= {"7-8", "8-9", "9-10", "9", "10", ""}


def test_minmax_preset_exercises_are_all_in_catalog(db):
    """Every Min-Max canonical name must be a catalog row so volume/recovery
    analytics and the swap picker recognise it."""
    from app.seed_catalog import EXERCISE_CATALOG

    seed_preset_programs(db)
    prog = db.query(Program).filter(Program.share_code == "MINMAX5").first()
    names = {r.exercise_name_canonical for r in db.query(ProgramExercise).filter(ProgramExercise.program_id == prog.id)}
    catalog = {e["canonical_name"] for e in EXERCISE_CATALOG}
    assert names <= catalog, sorted(names - catalog)


def test_minmax_preset_importable_and_activates(client, db):
    seed_preset_programs(db)
    importer = User(name="mm", username="mm", password_hash=hash_password("pw"))
    db.add(importer)
    db.commit()
    db.refresh(importer)
    app.dependency_overrides[get_current_user] = lambda: importer
    try:
        r = client.post("/api/programs/import-shared", json={"code": "MINMAX5", "activate": True})
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["frequency"] == 5
        assert body["exercises_copied"] == 420
        assert body["status"] == "active"
        mine = db.query(Program).filter(Program.user_id == importer.id).all()
        assert len(mine) == 1 and mine[0].status == "active" and mine[0].share_code is None
    finally:
        app.dependency_overrides.pop(get_current_user, None)
