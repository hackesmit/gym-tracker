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
        current, longest = _compute_streaks(logs, 4, [])
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
        current, longest = _compute_streaks(logs, 4, [])
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
        current, longest = _compute_streaks(logs, 4, [])
        assert current == 0
        assert longest == 1

    def test_partial_status_does_not_count(self):
        logs = self._make_logs_map_with_dates([
            (1, "S1", "2026-03-30", "completed"),
            (1, "S2", "2026-03-31", "completed"),
            (1, "S3", "2026-04-01", "completed"),
            (1, "S4", "2026-04-02", "partial"),
        ])
        current, longest = _compute_streaks(logs, 4, [])
        assert current == 0
        assert longest == 0

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
        current, longest = _compute_streaks(logs, 4, vacations)
        assert current == 2
        assert longest == 2
