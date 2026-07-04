---
phase: 178-thin-write-layer-inat-oauth
plan: 02
subsystem: database
tags: [sqlalchemy, alembic, sqlite, identity, migrations]

# Dependency graph
requires:
  - phase: 177-authoritative-store-migrations-backup-dr
    provides: notes_store package (Base, Note/NoteRevision models, forward-only Alembic env with render_as_batch=True, 0001_initial_schema migration, test helper pattern in test_notes_migrations.py)
provides:
  - "users table in the authoritative notes store (BeeAtlas-internal integer id as durable authorship key, D-07/D-08)"
  - "unique inat_login index for allowlist-keyed authorization (D-09)"
  - "forward-only migration 0002 chained to 0001"
affects: [178-05, 179]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Forward-only Alembic migrations: downgrade() raises NotImplementedError (Pitfall 4 guard), matching 0001's convention"
    - "Store-side identity: internal integer id is the durable key; external identity (iNat login/numeric id) is a mutable property, not the key"

key-files:
  created:
    - data/notes_store/migrations/versions/0002_add_users_table.py
    - data/tests/test_notes_users.py
  modified:
    - data/notes_store/models.py
    - data/tests/test_notes_migrations.py

key-decisions:
  - "test_notes_migrations.py::test_migration_applies now upgrades to revision \"0001\" explicitly instead of \"head\" — head advanced to 0002 in this plan, and the test's purpose is to verify the 0001 migration in isolation, not the current chain tip"

patterns-established: []

requirements-completed: [WRITE-02]

# Metrics
duration: ~15min
completed: 2026-07-04
---

# Phase 178 Plan 02: Users Table Migration Summary

**Added a `users` table to the authoritative notes store via forward-only Alembic migration 0002 — BeeAtlas mints its own internal integer id as the durable authorship key, with iNat login (unique, allowlist-keyed) and iNat numeric id stored as mutable properties.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-04T03:26:00Z (approx.)
- **Completed:** 2026-07-04T03:40:45Z
- **Tasks:** 2 completed
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- `User(Base)` ORM model added to `data/notes_store/models.py`: internal `id` PK, `inat_user_id`, unique `inat_login`, `created_at`/`updated_at`.
- Migration `0002_add_users_table.py` chained to `0001` via `down_revision = "0001"`; creates `users` + unique index `ix_users_inat_login`; `downgrade()` raises `NotImplementedError` matching the 0001 forward-only guard.
- Three new fast-tier tests in `data/tests/test_notes_users.py` covering migration-apply-and-chain, `inat_login` uniqueness enforcement, and downgrade-raises.
- `notes` / `note_revisions` DDL untouched — verified no changes leaked into those tables.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the User model + forward-only migration 0002** - `82eca225` (feat)
2. **Task 2: Store-side test — migration applies, chains, and refuses downgrade** - `23c28802` (test, includes an in-scope fix to a sibling test)

**Plan metadata:** committed after this summary.

## Files Created/Modified
- `data/notes_store/models.py` - added `class User(Base)` (internal id, inat_user_id, unique inat_login, timestamps)
- `data/notes_store/migrations/versions/0002_add_users_table.py` - forward-only migration creating `users` + `ix_users_inat_login`
- `data/tests/test_notes_users.py` - migration-applies, login-unique, no-downgrade tests
- `data/tests/test_notes_migrations.py` - `test_migration_applies` now targets revision `"0001"` explicitly (see Deviations)

## Decisions Made
- None beyond what the plan specified — the User model and migration exactly match the plan's `<behavior>`/`<action>` spec (D-07/D-08/D-09 from `178-CONTEXT.md`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `test_notes_migrations.py::test_migration_applies` broken by advancing head**
- **Found during:** Task 2 (running the full fast-tier suite to check for regressions)
- **Issue:** The pre-existing test upgraded to `"head"` and asserted `alembic_version.version_num == "0001"`. Adding migration `0002` in this plan advances `head` to `0002`, so the assertion failed.
- **Fix:** Changed `command.upgrade(cfg, "head")` to `command.upgrade(cfg, "0001")` in that test — its actual intent is to verify the `0001` migration in isolation, not "whatever the current head is." Updated the docstring to explain why `"0001"` is targeted explicitly.
- **Files modified:** `data/tests/test_notes_migrations.py`
- **Verification:** `cd data && uv run pytest tests/test_notes_migrations.py tests/test_notes_users.py -v` — 6/6 pass. Full fast-tier suite (`uv run pytest -m "not integration"`) — 345 passed, 9 skipped, 0 failed.
- **Committed in:** `23c28802` (part of Task 2 commit)

## Known Stubs

None — this plan's artifacts (model + migration + tests) are fully wired; no placeholder data or empty-value stubs introduced.

## Threat Flags

None — both threats in this plan's `<threat_model>` (T-178-01 tampering via unrecoverable schema change, T-178-02 duplicate-identity spoofing) are mitigated exactly as specified (forward-only migration, unique `inat_login` index) with no new unmitigated surface introduced.

## Verification

`cd data && uv run pytest tests/test_notes_users.py -x` → 3 passed.
Full fast-tier suite: `cd data && uv run pytest -m "not integration"` → 345 passed, 9 skipped, 0 failed.
`notes` / `note_revisions` DDL confirmed unchanged (diff review of `0002_add_users_table.py` touches only the new `users` table).

## Self-Check: PASSED

- FOUND: data/notes_store/migrations/versions/0002_add_users_table.py
- FOUND: data/tests/test_notes_users.py
- FOUND: commit 82eca225
- FOUND: commit 23c28802
