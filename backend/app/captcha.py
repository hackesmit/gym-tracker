"""Stateless word-problem CAPTCHA used to gate username changes.

The challenge is an HMAC-signed JWT carrying the correct answer plus an
expiry, so the frontend doesn't need a server-side session to verify it.
"""

from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone
from typing import Callable

from jose import JWTError, jwt

from .auth import JWT_ALGORITHM, JWT_SECRET

CHALLENGE_TTL_SECONDS = 10 * 60  # 10 minutes is plenty to type an answer


def _template_watermelons() -> tuple[str, int]:
    bought = random.randint(8, 18)
    gave = random.randint(2, 5)
    bought_more = random.randint(3, 9)
    answer = bought - gave + bought_more
    problem = (
        f"Sally bought {bought} watermelons, gave {gave} to her brother, "
        f"then bought {bought_more} more. How many does she have now?"
    )
    return problem, answer


def _template_apples_boxes() -> tuple[str, int]:
    boxes = random.randint(3, 7)
    per_box = random.randint(6, 12)
    eaten = random.randint(2, 6)
    answer = boxes * per_box - eaten
    problem = (
        f"Sally has {boxes} boxes with {per_box} apples each. "
        f"She eats {eaten}. How many apples are left?"
    )
    return problem, answer


def _template_train_miles() -> tuple[str, int]:
    speed = random.choice([20, 30, 40, 50, 60])
    hours = random.randint(2, 5)
    stop = random.randint(5, 15)
    answer = speed * hours - stop
    problem = (
        f"A train travels at {speed} mph for {hours} hours, then backs up "
        f"{stop} miles. How many miles from where it started?"
    )
    return problem, answer


def _template_bakery() -> tuple[str, int]:
    trays = random.randint(4, 8)
    per_tray = random.randint(6, 12)
    sold = random.randint(10, 30)
    answer = trays * per_tray - sold
    problem = (
        f"A bakery makes {trays} trays of {per_tray} cookies. "
        f"They sell {sold}. How many cookies are left?"
    )
    return problem, answer


def _template_book_pages() -> tuple[str, int]:
    days = random.randint(4, 8)
    per_day = random.randint(15, 30)
    skipped = random.randint(1, 3)
    answer = (days - skipped) * per_day
    problem = (
        f"Sally plans to read {per_day} pages per day for {days} days, "
        f"but skips {skipped} days. How many pages total?"
    )
    return problem, answer


_TEMPLATES: list[Callable[[], tuple[str, int]]] = [
    _template_watermelons,
    _template_apples_boxes,
    _template_train_miles,
    _template_bakery,
    _template_book_pages,
]


def generate_challenge() -> tuple[str, str]:
    """Return (problem_text, signed_challenge_token)."""
    problem, answer = random.choice(_TEMPLATES)()
    payload = {
        "ans": int(answer),
        "exp": datetime.now(timezone.utc) + timedelta(seconds=CHALLENGE_TTL_SECONDS),
        "iat": datetime.now(timezone.utc),
        "kind": "username_captcha",
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return problem, token


def verify_challenge(token: str, answer_str: str) -> bool:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        return False
    if payload.get("kind") != "username_captcha":
        return False
    try:
        return int(answer_str.strip()) == int(payload["ans"])
    except (ValueError, TypeError, KeyError):
        return False
