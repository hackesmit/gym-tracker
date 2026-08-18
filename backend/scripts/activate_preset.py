"""Import a preset program by share code for a user and make it their active program.

Talks to the HTTP API (no DB access needed), so it works against prod or a
local server. Idempotent: if the user already owns a copy of the preset (same
name and source file as the shared source), that copy is activated instead
of importing again.

Usage:
    GYM_API=https://gym-tracker-api-bold-violet-7582.fly.dev/api \\
    GYM_USER=hackesmit GYM_PASSWORD='...' \\
        python -m scripts.activate_preset MINMAX5

Prints the resulting active program as JSON. Exit 0 on success.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request


def _call(base: str, path: str, method: str = "GET", token: str | None = None, body: dict | None = None) -> dict | list:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode() or "null")
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:500]
        raise SystemExit(f"{method} {path} -> HTTP {e.code}: {detail}")


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print(__doc__)
        return 2
    code = argv[0].strip().upper()
    base = os.environ.get("GYM_API", "http://localhost:8000/api").rstrip("/")
    user = os.environ.get("GYM_USER")
    password = os.environ.get("GYM_PASSWORD")
    if not user or not password:
        raise SystemExit("GYM_USER and GYM_PASSWORD env vars are required")

    token = _call(base, "/auth/login", "POST", body={"username": user, "password": password})["access_token"]
    source = _call(base, f"/programs/shared/{code}", token=token)
    mine = _call(base, "/programs", token=token)["programs"]

    # An imported copy keeps the source's name and source_file; a custom
    # program that merely shares the name has source_file None.
    existing = next(
        (p for p in mine if p["name"] == source["name"] and p.get("source_file") == source.get("source_file")),
        None,
    )
    if existing:
        program_id = existing["id"]
        print(f"reusing existing copy #{program_id} of {source['name']!r}", file=sys.stderr)
        _call(base, f"/program/{program_id}/activate", "POST", token=token)
    else:
        created = _call(base, "/programs/import-shared", "POST", token=token, body={"code": code, "activate": True})
        program_id = created["id"]
        print(f"imported {created['exercises_copied']} exercises as program #{program_id}", file=sys.stderr)

    after = _call(base, "/programs", token=token)["programs"]
    active = [p for p in after if p["status"] == "active"]
    ok = len(active) == 1 and active[0]["id"] == program_id
    print(json.dumps({"active": active, "ok": ok}, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
