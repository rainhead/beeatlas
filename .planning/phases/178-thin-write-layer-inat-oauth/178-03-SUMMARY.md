---
phase: 178-thin-write-layer-inat-oauth
plan: 03
status: complete
completed: 2026-07-03
requirements: [WRITE-01]
---

# 178-03 SUMMARY — api/ package + waitress/flask-cors install (D-15/D-17)

> Completion note: the executor committed all three tasks atomically but its process was
> terminated by an API connection error while writing this SUMMARY. The orchestrator verified
> the work against disk/git + the full test suite and authored this SUMMARY to close the plan.
> No code was changed by the orchestrator; only this SUMMARY and the deferred tracking updates
> (REQUIREMENTS.md mark-complete + ROADMAP plan progress) were committed post-hoc.

## What was built

Established the top-level `api/` package as BeeAtlas's auth + write service (D-15), installed the
two 178-01-gated serving dependencies, and unified the test harness.

- **Task 1** (`cb5d0cec`): `cd data && uv add waitress flask-cors` (D-17 — waitress is the
  pure-Python WSGI server replacing the rejected flup6; `flup6` absent). Relocated the Phase-177
  Flask health skeleton from `data/notes_app/main.py` → `api/main.py` (kept `app = Flask(__name__)`
  + `/health`), retired the `notes_app` package entirely, added `api/__init__.py`.
- **Task 2** (`6ec90267`): `api/config.py` secrets loader (D-14) — reads gitignored
  `api/secrets.toml` via tomllib, exposes `INAT_CLIENT_ID`, `INAT_CLIENT_SECRET`, `REDIRECT_URI`,
  `SESSION_SIGNING_KEY`; `REDIRECT_URI` pinned + asserted == `https://api.beeatlas.net/auth/callback`
  (D-12/D-13 exact-match); `require_real_secrets()` raises loudly on `REPLACE_ME` but only at
  request time (import stays safe for CI/frontend build). pytest wired with
  `pythonpath = [".", ".."]` + `testpaths = ["tests", "../api/tests"]`.
- **Task 3** (`fbc1a38e`): relocated the skeleton test to `api/tests/test_app.py` (imports
  `from api.main import app`); replaced the obsolete "no write verbs" scope-guard with a `/health`
  smoke assertion (write routes are now in-scope, landing in 178-06).

## Verification (orchestrator-run)

- `cd data && uv run pytest -m "not integration"` → **345 passed, 9 skipped, 0 failed** (unified
  config collects both `data/tests` and `api/tests`).
- `api/tests` alone → 3 passed.
- `grep -rn "notes_app" data/ api/ --include=*.py` → only historical docstring mentions (package retired).
- `grep -rn "flup" data/ api/ --include=*.py` → none.
- `api.config.REDIRECT_URI == "https://api.beeatlas.net/auth/callback"` confirmed.

## Key files
- created: `api/__init__.py`, `api/config.py`, `api/tests/test_app.py`
- modified: `api/main.py` (relocated skeleton), `data/pyproject.toml` (deps + pytest config)
- deleted: `data/notes_app/` package, `data/tests/test_notes_app.py`

## Requirement note
WRITE-01 was mechanically marked Complete via plan frontmatter. The `api/` app is scaffolded and
served-by-waitress-ready, but WRITE-01's "accepts authenticated writes" clause is not fully true
until the write routes land in 178-06 — flagged for reconciliation at phase-close verification
(same pattern as WRITE-02 noted in 178-02).

## Self-Check: PASSED
