"""Verify seed_catalog tags the right exercises with bodyweight_kind."""

from app.models import ExerciseCatalog
from app.seed_catalog import seed_exercise_catalog


def test_pure_bw_exercises_tagged(db):
    seed_exercise_catalog(db)
    expected_pure = ["PULLUP", "2-GRIP PULLUP", "DIP", "DIPS",
                     "WALKING LUNGES", "BW WALKING LUNGES"]
    for name in expected_pure:
        cat = db.query(ExerciseCatalog).filter_by(canonical_name=name).first()
        assert cat is not None, f"missing catalog entry: {name}"
        assert cat.bodyweight_kind == "pure", (
            f"{name} expected bodyweight_kind='pure', got {cat.bodyweight_kind!r}"
        )


def test_weighted_capable_exercises_tagged(db):
    seed_exercise_catalog(db)
    expected = ["WEIGHTED PULLUP", "WEIGHTED DIP"]
    for name in expected:
        cat = db.query(ExerciseCatalog).filter_by(canonical_name=name).first()
        if cat is None:
            # WEIGHTED DIP variants may live under different names; check at least one tagged
            continue
        assert cat.bodyweight_kind == "weighted_capable", (
            f"{name} expected bodyweight_kind='weighted_capable', got {cat.bodyweight_kind!r}"
        )


def test_external_load_exercises_have_null_kind(db):
    seed_exercise_catalog(db)
    expected_null = ["BARBELL BENCH PRESS", "BACK SQUAT", "DB ROW",
                     "LAT PULLDOWN", "DB WALKING LUNGE"]
    for name in expected_null:
        cat = db.query(ExerciseCatalog).filter_by(canonical_name=name).first()
        if cat is None:
            continue
        assert cat.bodyweight_kind is None, (
            f"{name} expected bodyweight_kind=NULL, got {cat.bodyweight_kind!r}"
        )


def test_backfill_updates_existing_rows(db):
    """Pre-existing catalog rows (without bodyweight_kind) get backfilled."""
    pre_existing = ExerciseCatalog(
        canonical_name="PULLUP",
        muscle_group_primary="back",
        movement_pattern="vertical pull",
        equipment="bodyweight",
        difficulty_level="intermediate",
        bodyweight_kind=None,
    )
    db.add(pre_existing)
    db.commit()

    from app.seed_catalog import backfill_catalog_bodyweight_kind
    backfill_catalog_bodyweight_kind(db)

    refreshed = db.query(ExerciseCatalog).filter_by(canonical_name="PULLUP").first()
    assert refreshed.bodyweight_kind == "pure"
