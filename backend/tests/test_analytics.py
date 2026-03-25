"""Tests for analytics calculations."""

from app.analytics.overload import parse_range, _increase_load, _decrease_load


def test_parse_range_standard():
    assert parse_range("8-10") == (8.0, 10.0)

def test_parse_range_single():
    assert parse_range("10") == (10.0, 10.0)

def test_parse_range_with_annotation():
    assert parse_range("10-12 (dropset)") == (10.0, 12.0)

def test_parse_range_empty():
    assert parse_range("") == (0.0, 0.0)
    assert parse_range(None) == (0.0, 0.0)

def test_parse_range_comma():
    assert parse_range("10,8") == (8.0, 10.0)

def test_increase_load_compound():
    result = _increase_load(100.0, compound=True)
    assert result == 102.5

def test_increase_load_isolation():
    result = _increase_load(20.0, compound=False)
    assert result == 22.5

def test_decrease_load_compound():
    result = _decrease_load(100.0, compound=True)
    assert result == 95.0

def test_decrease_load_isolation():
    result = _decrease_load(20.0, compound=False)
    assert result == 17.5

def test_decrease_load_floor():
    result = _decrease_load(2.0, compound=False)
    assert result == 0.0
