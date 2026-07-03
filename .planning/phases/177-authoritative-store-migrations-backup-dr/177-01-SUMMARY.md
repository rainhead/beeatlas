---
phase: 177
plan: "01"
subsystem: data-pipeline
tags: [dependencies, migrations, backup, requirements]
dependency_graph:
  requires: []
  provides: [alembic, sqlalchemy, fastapi, uvicorn, notes_store, notes_app]
  affects: [data/pyproject.toml, data/uv.lock, .planning/REQUIREMENTS.md]
tech_stack:
  added: [alembic>=1.18.5, sqlalchemy>=2.0.51,<3, fastapi>=0.139.0, uvicorn>=0.49.0]
  patterns: [uv-managed Python venv, Python package markers]
key_files:
  created:
    - data/notes_store/__init__.py
    - data/notes_app/__init__.py
  modified:
    - data/pyproject.toml
    - data/uv.lock
    - .planning/REQUIREMENTS.md
decisions:
  - "Use snapshot-based backup (SQLite online-backup API) not native PITR; Litestream deferred (D-11)"
  - "FastAPI chosen as web framework (D-02)"
metrics:
  duration: "~14 minutes"
  completed: "2026-07-03"
  tasks_completed: 2
  files_changed: 5
---

# Phase 177 Plan 01: Phase Foundation — Dependencies, Package Markers, STORE-03 Relax Summary

**One-liner:** Add alembic/sqlalchemy/fastapi/uvicorn to the data venv, create notes_store and notes_app package stubs, and relax REQUIREMENTS.md STORE-03 to snapshot-based backup with Litestream deferred.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Package legitimacy verification (human gate, pre-approved) | — | (no code) |
| 2 | Add dependencies and create package markers | 692a64d5 | data/pyproject.toml, data/uv.lock, data/notes_store/__init__.py, data/notes_app/__init__.py |
| 3 | Relax REQUIREMENTS.md STORE-03 wording (D-11) | 0493261e | .planning/REQUIREMENTS.md |

## What Was Built

**Task 2 — Dependencies + package stubs:**
- Added four entries to `data/pyproject.toml` dependencies: `alembic>=1.18.5`, `sqlalchemy>=2.0.51,<3`, `fastapi>=0.139.0`, `uvicorn>=0.49.0`.
- `uv sync` installed 9 packages (the four plus transitive deps: starlette, anyio, h11, mako, annotated-doc). Lock file refreshed.
- Created `data/notes_store/__init__.py` — package marker for the authoritative store schema/engine/migrations package.
- Created `data/notes_app/__init__.py` — package marker for the maderas-hosted FastAPI service package.

**Task 3 — STORE-03 requirement wording:**
- Replaced "native point-in-time recovery plus an independent periodic logical dump" with snapshot-based gate: consistent snapshots via SQLite online-backup API to an IAM-isolated versioned S3 bucket, test-restore demonstrated before any public write, Litestream/continuous-PITR explicitly deferred to a later phase.

## Verification Results

- `uv run python -c "import alembic, sqlalchemy, fastapi, uvicorn, notes_store, notes_app"` — exits 0
- `grep -c -E '^\s*"(alembic|sqlalchemy|fastapi|uvicorn)' data/pyproject.toml` — returns 4
- STORE-03 grep: "consistent snapshot" present, "Litestream" present, "native point-in-time recovery" absent
- `uv run pytest -m "not integration" -q` — 317 passed, 9 skipped, no regressions

## Deviations from Plan

None — plan executed exactly as written. Task 1 was pre-approved by the operator before this execution session began.

## Known Stubs

`data/notes_store/__init__.py` and `data/notes_app/__init__.py` are intentional stubs — package markers only with one-line docstrings. Later plans (177-02 through 177-07) will populate the schema, migrations, seed script, and app. These stubs are load-bearing as importable package roots and are not expected to contain further code at this stage.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced in this plan.

## Self-Check: PASSED

- `data/pyproject.toml` — found, contains 4 new dep entries
- `data/notes_store/__init__.py` — found
- `data/notes_app/__init__.py` — found
- `.planning/REQUIREMENTS.md` STORE-03 updated — verified by grep
- Commit 692a64d5 — exists (task 2)
- Commit 0493261e — exists (task 3)
