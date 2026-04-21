"""Medal engine: official 1RM attempt takes holder; estimated doesn't."""

from datetime import date

from app.medal_engine import check_strength_medals, seed_medal_catalog
from app.models import (
    Medal,
    MedalCurrentHolder,
    Program,
    ProgramExercise,
    User,
    WorkoutLog,
)


def _seed_bench(db, user):
    p = Program(user_id=user.id, name="p", frequency=3, start_date=date(2026, 1, 1))
    db.add(p); db.commit()
    pe = ProgramExercise(
        program_id=p.id, week=1, session_name="X", session_order_in_week=1,
        exercise_order=1, exercise_name_canonical="BENCH PRESS",
        exercise_name_raw="BENCH PRESS", working_sets=1, prescribed_reps="1",
    )
    db.add(pe); db.commit()
    return pe


def test_true_1rm_takes_medal(db):
    seed_medal_catalog(db)
    user = db.query(User).first()
    pe = _seed_bench(db, user)

    # Official attempt: true 1RM, reps=1, completed, 100kg
    log = WorkoutLog(
        user_id=user.id, program_exercise_id=pe.id, date=date(2026, 3, 1),
        set_number=1, load_kg=100.0, reps_completed=1,
        is_true_1rm_attempt=True, completed_successfully=True,
    )
    db.add(log); db.commit(); db.refresh(log)
    check_strength_medals(db, log)

    holder = db.query(MedalCurrentHolder).join(Medal).filter(
        Medal.metric_type == "strength_1rm:bench"
    ).first()
    assert holder is not None
    assert holder.user_id == user.id
    assert holder.value == 100.0


def test_estimated_does_not_take_medal(db):
    seed_medal_catalog(db)
    user = db.query(User).first()
    pe = _seed_bench(db, user)

    # Non-official: is_true_1rm_attempt=False
    log = WorkoutLog(
        user_id=user.id, program_exercise_id=pe.id, date=date(2026, 3, 1),
        set_number=1, load_kg=200.0, reps_completed=1,
        is_true_1rm_attempt=False, completed_successfully=True,
    )
    db.add(log); db.commit(); db.refresh(log)
    check_strength_medals(db, log)

    holder = db.query(MedalCurrentHolder).join(Medal).filter(
        Medal.metric_type == "strength_1rm:bench"
    ).first()
    assert holder is None


def test_failed_attempt_does_not_take_medal(db):
    seed_medal_catalog(db)
    user = db.query(User).first()
    pe = _seed_bench(db, user)

    log = WorkoutLog(
        user_id=user.id, program_exercise_id=pe.id, date=date(2026, 3, 1),
        set_number=1, load_kg=200.0, reps_completed=1,
        is_true_1rm_attempt=True, completed_successfully=False,
    )
    db.add(log); db.commit(); db.refresh(log)
    check_strength_medals(db, log)

    holder = db.query(MedalCurrentHolder).join(Medal).filter(
        Medal.metric_type == "strength_1rm:bench"
    ).first()
    assert holder is None
