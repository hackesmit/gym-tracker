"""Tests for completion-based week progression."""

from app.routers.tracker import _compute_current_week


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
