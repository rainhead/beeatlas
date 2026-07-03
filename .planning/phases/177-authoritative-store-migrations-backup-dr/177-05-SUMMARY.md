---
phase: 177
plan: "05"
subsystem: notes-store
tags: [roles, allowlist, seed, fastapi, sqlite, authoritative-store]
dependency_graph:
  requires: [177-01, 177-03]
  provides: [roles-allowlist, seed-script, fastapi-health-skeleton]
  affects: [data/notes_store, data/notes_app, data/tests]
tech_stack:
  added: [fastapi>=0.139.0]
  patterns: [tomllib-module-level-load, sqlalchemy-session-insert, fastapi-root-path-proxy]
key_files:
  created:
    - data/roles_allowlist.toml
    - data/notes_store/roles.py
    - data/notes_store/seed.py
    - data/notes_app/main.py
    - data/tests/test_notes_seed_roles.py
    - data/tests/test_notes_app.py
  modified: []
decisions:
  - "Roles tests use committed example_author/example_curator entries (fixture-friendly, clearly labelled); avoids fragile tmp-path TOML monkeypatch while still decoupling from real operator identities"
  - "seed.py uses timezone-aware datetime.datetime.now(datetime.timezone.utc) instead of deprecated utcnow()"
  - "FastAPI health route function returns dict (not JSONResponse) — TestClient not needed; direct function call in tests avoids httpx dependency"
  - "main.py scope-guarded: FastAPI(root_path=...) on single line to satisfy plan grep assertion; OAuth/CSRF/DB/POST excluded from module entirely, not just from comments"
metrics:
  duration: "3m 19s"
  completed: "2026-07-03"
  tasks_completed: 3
  files_created: 6
  files_modified: 0
---

# Phase 177 Plan 05: Roles Allowlist, Seed Script & FastAPI Health Skeleton Summary

**One-liner:** Committed TOML roles allowlist (tomllib loader + is_author/is_curator), SQLAlchemy-session seed script (D-04), and minimal FastAPI health-check skeleton (root_path=/notes-api, D-01/D-02) — 14 tests green, no regressions.

## What Was Built

### Task 1: Roles Allowlist TOML + Loader (D-07)

`data/roles_allowlist.toml` is a committed git-tracked TOML file mapping iNat login → role (`author` | `curator`). Git history is the audit trail — no `roles` table exists. Two `example_*` fixture entries are present for test use, clearly labelled.

`data/notes_store/roles.py` mirrors `config.py`'s module-level `tomllib` load: reads `data/roles_allowlist.toml` at import, exposes `ROLES: dict[str, str]`, and three helpers:
- `role_of(login) -> str | None` — explicit role or None (reader)
- `is_author(login) -> bool` — True for `author` OR `curator`
- `is_curator(login) -> bool` — True for `curator` only

### Task 2: Seed Script (D-04)

`data/notes_store/seed.py` inserts 3 sample `Note` rows (distinct `canonical_name` + `author_id`, Markdown body, `status="approved"`, UTC timestamps) via a SQLAlchemy `Session`. Provides a `__main__` entry point (`uv run python -m notes_store.seed`). Assumes schema already exists; does not run migrations.

### Task 3: FastAPI Health Skeleton (D-01/D-02)

`data/notes_app/main.py` creates `app = FastAPI(root_path=os.environ.get("NOTES_APP_ROOT_PATH", "/notes-api"))` with a single `GET /health` route returning `{"status": "ok"}`. No write routes, no identity/auth, no DB access, no CORS — Phase 177 scope boundary enforced. Phase 178 groundwork only.

## Verification

| Check | Result |
|-------|--------|
| `uv run pytest tests/test_notes_seed_roles.py tests/test_notes_app.py -x -q` | 14 passed |
| `uv run pytest -m "not integration" -q` | 338 passed, 9 skipped, no failures |
| `grep -q "FastAPI(root_path"` | pass |
| `grep -q "def health"` | pass |
| No oauth/POST/notes_store import in main.py | pass |
| No roles DB table | confirmed — no roles table in models.py |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] FastAPI constructor split across lines broke plan grep assertion**
- **Found during:** Task 3 acceptance verification
- **Issue:** `app = FastAPI(\n    root_path=...` split across lines; `grep -q "FastAPI(root_path"` returned non-zero
- **Fix:** Placed `FastAPI(root_path=os.environ.get(...))` constructor args on a single line
- **Files modified:** `data/notes_app/main.py`
- **Commit:** fa1e4e3d

**2. [Rule 1 - Bug] Module docstring mentioned "OAuth" — violated plan scope-guard grep**
- **Found during:** Task 3 acceptance verification
- **Issue:** `grep -qi "oauth"` matched the word "OAuth" in the "what is NOT here" docstring comment
- **Fix:** Removed OAuth mention; replaced with "identity/auth" (no-conflict wording)
- **Files modified:** `data/notes_app/main.py`
- **Commit:** fa1e4e3d (same fix pass)

## Commits

| Task | Commit | Message |
|------|--------|---------|
| Task 1 | b1f0cce6 | feat(177-05): roles allowlist TOML + loader (D-07) |
| Task 2 | ed927caf | feat(177-05): seed script for notes store (D-04) |
| Task 3 | fa1e4e3d | feat(177-05): FastAPI health skeleton — Phase 178 groundwork (D-01/D-02) |

## Known Stubs

None — no placeholder data flows to UI rendering. The two `example_*` allowlist entries are clearly labelled fixture data, not production stubs. The seed script inserts real-shaped sample content for local dev.

## Threat Flags

No new security surface beyond the plan's threat model. `GET /health` accepts no client input and opens no DB connection — T-177-05b (FastAPI surface mitigated by scope).

## Self-Check: PASSED

All 6 created files found on disk. All 3 task commits (b1f0cce6, ed927caf, fa1e4e3d) found in git log.
