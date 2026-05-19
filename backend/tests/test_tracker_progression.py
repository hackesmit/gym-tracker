"""Tests for completion-based week progression."""

from datetime import date

from app.routers.tracker import _compute_current_week, _compute_streaks


class TestComputeCurrentWeek:
    """_compute_current_week returns the first week with uncompleted sessions."""

    def _make_sessions(self, weeks, sessions_per_week=4):
        result = {}
        for w in range(1, weeks + 1):
            result[w] = [
                {"session_name": f"Session {i+1}", "session_order": i + 1}
                for i in range(sessions_per_week)
            ]
        return result

    def _make_logs(self, completed_keys, status="completed"):
        class FakeLog:
            def __init__(self, s):
                self.status = s
        return {key: FakeLog(status) for key in completed_keys}

    def test_no_sessions_logged_returns_week_1(self):
        sessions = self._make_sessions(4)
        assert _compute_current_week(sessions, {}, 4) == 1

    def test_week_1_fully_completed_returns_week_2(self):
        sessions = self._make_sessions(4)
        logs = self._make_logs([
            (1, "Session 1"), (1, "Session 2"),
            (1, "Session 3"), (1, "Session 4"),
        ])
        assert _compute_current_week(sessions, logs, 4) == 2

    def test_week_1_partially_completed_stays_on_week_1(self):
        sessions = self._make_sessions(4)
        logs = self._make_logs([(1, "Session 1"), (1, "Session 2")])
        assert _compute_current_week(sessions, logs, 4) == 1

    def test_skipped_sessions_count_as_done(self):
        sessions = self._make_sessions(4)
        logs = self._make_logs([(1, "Session 1"), (1, "Session 2"), (1, "Session 3")])
        class FakeLog:
            def __init__(self):
                self.status = "skipped"
        logs[(1, "Session 4")] = FakeLog()
        assert _compute_current_week(sessions, logs, 4) == 2

    def test_all_weeks_completed_returns_last_week(self):
        sessions = self._make_sessions(2, sessions_per_week=2)
        logs = self._make_logs([
            (1, "Session 1"), (1, "Session 2"),
            (2, "Session 1"), (2, "Session 2"),
        ])
        assert _compute_current_week(sessions, logs, 2) == 2

    def test_gap_in_middle_returns_gap_week(self):
        sessions = self._make_sessions(4, sessions_per_week=2)
        logs = self._make_logs([
            (1, "Session 1"), (1, "Session 2"),
            (2, "Session 1"),
        ])
        assert _compute_current_week(sessions, logs, 4) == 2


class TestComputeStreaks:
    """_compute_streaks counts consecutive calendar weeks with full attendance."""

    def _make_logs_map_with_dates(self, entries):
        class FakeLog:
            def __init__(self, d, s):
                self.date = date.fromisoformat(d)
                self.status = s
        return {(w, n): FakeLog(d, s) for w, n, d, s in entries}

    def test_no_logs_returns_zero(self):
        current, longest = _compute_streaks({}, 4, [])
        assert current == 0
        assert longest == 0

    def test_one_full_week_returns_1(self):
        logs = self._make_logs_map_with_dates([
            (1, "S1", "2026-03-30", "completed"),
            (1, "S2", "2026-03-31", "completed"),
            (1, "S3", "2026-04-01", "completed"),
            (1, "S4", "2026-04-02", "completed"),
        ])
        # Pass today = last log date so the walk doesn't extend past the logged week.
        current, longest = _compute_streaks(logs, 4, [], today=date(2026, 4, 2))
        assert current == 1
        assert longest == 1

    def test_two_consecutive_full_weeks(self):
        logs = self._make_logs_map_with_dates([
            (1, "S1", "2026-03-30", "completed"),
            (1, "S2", "2026-03-31", "completed"),
            (1, "S3", "2026-04-01", "completed"),
            (1, "S4", "2026-04-02", "completed"),
            (2, "S1", "2026-04-06", "completed"),
            (2, "S2", "2026-04-07", "completed"),
            (2, "S3", "2026-04-08", "completed"),
            (2, "S4", "2026-04-09", "completed"),
        ])
        current, longest = _compute_streaks(logs, 4, [], today=date(2026, 4, 9))
        assert current == 2
        assert longest == 2

    def test_incomplete_week_breaks_streak(self):
        logs = self._make_logs_map_with_dates([
            (1, "S1", "2026-03-30", "completed"),
            (1, "S2", "2026-03-31", "completed"),
            (1, "S3", "2026-04-01", "completed"),
            (1, "S4", "2026-04-02", "completed"),
            (2, "S1", "2026-04-06", "completed"),
            (2, "S2", "2026-04-07", "completed"),
            (2, "S3", "2026-04-08", "completed"),
        ])
        # Pass a today one week ahead so the incomplete week is a past week (not
        # the in-progress current week) and correctly breaks the streak.
        current, longest = _compute_streaks(logs, 4, [], today=date(2026, 4, 14))
        assert current == 0
        assert longest == 1

    def test_partial_status_does_not_count(self):
        logs = self._make_logs_map_with_dates([
            (1, "S1", "2026-03-30", "completed"),
            (1, "S2", "2026-03-31", "completed"),
            (1, "S3", "2026-04-01", "completed"),
            (1, "S4", "2026-04-02", "partial"),
        ])
        current, longest = _compute_streaks(logs, 4, [], today=date(2026, 4, 6))
        assert current == 0
        assert longest == 0

    def test_current_streak_breaks_after_unlogged_weeks(self):
        """O8 regression: current_streak must drop to 0 when weeks pass with no logs.

        Setup: user completes one full week (4 sessions) in the week of 2026-03-30,
        then logs nothing for 4 more weeks.  When _compute_streaks is called with
        a *today* that is 4 weeks later, the streak should be 0, not 1.
        """
        logs = self._make_logs_map_with_dates([
            (1, "S1", "2026-03-30", "completed"),
            (1, "S2", "2026-03-31", "completed"),
            (1, "S3", "2026-04-01", "completed"),
            (1, "S4", "2026-04-02", "completed"),
        ])
        # Simulate calling the function 4 weeks later (2026-04-27 is a Monday,
        # i.e. the start of the 5th week after the last logged session).
        simulated_today = date.fromisoformat("2026-04-27")
        current, longest = _compute_streaks(logs, 4, [], today=simulated_today)
        assert current == 0, f"Expected 0 but got {current}: streak should break after gap"
        # Longest is still 1 (the one good week did happen historically).
        assert longest == 1

    def test_in_progress_week_does_not_count_before_frequency_met(self):
        """O8 / O7: the current in-progress week should not inflate the streak.

        The user has a perfect streak through last week. This week they have only
        logged 2 out of 4 required sessions so far. current_streak should equal
        the number of fully-completed prior weeks, not include the partial week.
        """
        # Week of 2026-03-30: fully completed (4 sessions)
        # Week of 2026-04-06: fully completed (4 sessions)
        # Week of 2026-04-13 (today = 2026-04-15, mid-week): only 2 sessions logged
        logs = self._make_logs_map_with_dates([
            (1, "S1", "2026-03-30", "completed"),
            (1, "S2", "2026-03-31", "completed"),
            (1, "S3", "2026-04-01", "completed"),
            (1, "S4", "2026-04-02", "completed"),
            (2, "S1", "2026-04-06", "completed"),
            (2, "S2", "2026-04-07", "completed"),
            (2, "S3", "2026-04-08", "completed"),
            (2, "S4", "2026-04-09", "completed"),
            (3, "S1", "2026-04-13", "completed"),
            (3, "S2", "2026-04-14", "completed"),
        ])
        simulated_today = date.fromisoformat("2026-04-15")  # mid-week, 2 of 4 done
        current, longest = _compute_streaks(logs, 4, [], today=simulated_today)
        assert current == 2, f"Expected 2 (completed weeks only) but got {current}"
        assert longest == 2

    def test_vacation_week_is_transparent(self):
        class FakeVacation:
            def __init__(self, s, e):
                self.start_date = date.fromisoformat(s)
                self.end_date = date.fromisoformat(e)

        vacations = [FakeVacation("2026-04-06", "2026-04-12")]

        logs = self._make_logs_map_with_dates([
            (1, "S1", "2026-03-30", "completed"),
            (1, "S2", "2026-03-31", "completed"),
            (1, "S3", "2026-04-01", "completed"),
            (1, "S4", "2026-04-02", "completed"),
            (3, "S1", "2026-04-13", "completed"),
            (3, "S2", "2026-04-14", "completed"),
            (3, "S3", "2026-04-15", "completed"),
            (3, "S4", "2026-04-16", "completed"),
        ])
        # today = last log date so the walk ends at the fully-completed week.
        current, longest = _compute_streaks(logs, 4, vacations, today=date(2026, 4, 16))
        assert current == 2
        assert longest == 2
