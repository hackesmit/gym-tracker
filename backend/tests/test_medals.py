"""Medal engine: official 1RM attempt takes holder; estimated doesn't."""

from datetime import date, timedelta

from app.auth import hash_password
from app.medal_engine import (
    backfill_consistency_medals,
    check_strength_medals,
    seed_medal_catalog,
)
from app.models import (
    Medal,
    MedalCurrentHolder,
    Program,
    ProgramExercise,
    SessionLog,
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


def test_backfill_picks_up_pre_medal_system_sessions(db):
    """Regression guard: hackesmit had 9 completed SessionLog rows from
    before the medal system existed, while paper had 2 that went through
    the Logger. Paper held the medal at 2 because hackesmit's backlog
    never fired `check_consistency_medals`. The startup backfill must
    pick up the pre-existing rows and flip the holder.
    """
    seed_medal_catalog(db)

    hackesmit = db.query(User).filter(User.username == "testuser").first()
    paper = User(name="paper", username="paper", password_hash=hash_password("x"))
    db.add(paper); db.commit()

    prog_h = Program(user_id=hackesmit.id, name="h", frequency=3, start_date=date(2026, 1, 1))
    prog_p = Program(user_id=paper.id, name="p", frequency=3, start_date=date(2026, 1, 1))
    db.add_all([prog_h, prog_p]); db.commit()

    base = date(2026, 3, 20)
    for i in range(9):
        db.add(SessionLog(
            user_id=hackesmit.id, program_id=prog_h.id,
            week=1, session_name=f"S{i}", date=base + timedelta(days=i * 3),
            status="completed",
        ))
    for i in range(2):
        db.add(SessionLog(
            user_id=paper.id, program_id=prog_p.id,
            week=1, session_name=f"S{i}", date=base + timedelta(days=i * 3),
            status="completed",
        ))
    db.commit()

    # Simulate paper being the only user the engine has ever seen: fire
    # the engine once with paper's latest session. Paper takes the medal at 2.
    from app.medal_engine import check_consistency_medals
    paper_latest = (
        db.query(SessionLog)
        .filter(SessionLog.user_id == paper.id)
        .order_by(SessionLog.date.desc()).first()
    )
    check_consistency_medals(db, paper_latest)

    holder = db.query(MedalCurrentHolder).join(Medal).filter(
        Medal.metric_type == "consistency_sessions_all"
    ).first()
    assert holder is not None
    assert holder.user_id == paper.id
    assert holder.value == 2.0

    # Now backfill: hackesmit's 9 pre-existing sessions should flip the medal.
    processed = backfill_consistency_medals(db)
    assert processed == 2

    holder = db.query(MedalCurrentHolder).join(Medal).filter(
        Medal.metric_type == "consistency_sessions_all"
    ).first()
    assert holder.user_id == hackesmit.id
    assert holder.value == 9.0
