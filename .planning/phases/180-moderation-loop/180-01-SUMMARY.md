---
phase: 180-moderation-loop
plan: 01
subsystem: database
tags: [alembic, sqlalchemy, sqlite, migration, moderation]

# Dependency graph
requires:
  - phase: 177-authoritative-store-migrations-backup-dr
    provides: forward-only Alembic migration convention (render_as_batch=True, downgrade() raises NotImplementedError)
  - phase: 179-notes-feature-harvest-build-time-bake
    provides: notes/note_revisions schema (migration 0003, body_html + author_id FK)
provides:
  - "note_revisions.reason nullable Text column (ORM + migration 0004)"
  - "schema substrate for curator takedown/restore reason capture (D-09), consumed by Plan 02"
affects: [180-02-curator-authz-routes, 180-05-operator-migration-apply]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-step nullable column addition via one batch_alter_table.add_column (no three-step backfill dance) when the column is nullable forever"

key-files:
  created:
    - data/notes_store/migrations/versions/0004_add_note_revision_reason.py
  modified:
    - data/notes_store/models.py
    - data/tests/test_notes_migrations.py

key-decisions:
  - "reason is nullable forever (D-09) — a single batch_alter_table.add_column(nullable=True) is sufficient; no backfill, no later NOT NULL tightening (contrast with migration 0003's three-step body_html dance)"
  - "downgrade() raises NotImplementedError, mirroring 0001/0003 — the authoritative store has no upstream to rebuild from"

patterns-established:
  - "Single-step nullable-forever column addition pattern (vs. 0003's three-step add->backfill->tighten pattern used only when a column becomes eventually-NOT-NULL on a populated table)"

requirements-completed: [MOD-02, MOD-03]

# Metrics
duration: 6min
completed: 2026-07-05
---

# Phase 180 Plan 01: Migration 0004 (note_revisions.reason) Summary

**Added a nullable `reason` Text column to `note_revisions` via forward-only Alembic migration 0004, giving the curator takedown/restore routes (Plan 02) a place to record an optional free-text reason.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-05T01:16:00Z
- **Completed:** 2026-07-05T01:22:33Z
- **Tasks:** 2 completed
- **Files modified:** 3

## Accomplishments
- `NoteRevision.reason: Mapped[str | None]` added to the ORM model, nullable Text
- Alembic migration 0004 (`down_revision = "0003"`) adds the column via a single `batch_alter_table` block — no backfill, no NOT NULL tightening
- Two new tests (`test_migration_0004_adds_reason_nullable`, `test_no_downgrade_0004`) added following the RED→GREEN TDD cycle, mirroring the existing 0003 test shape
- Full `data/` fast-tier suite (`uv run pytest -m "not integration"`) stays green: 476 passed, 9 skipped

## Task Commits

Each task was committed atomically:

1. **Task 1: Failing migration-0004 test (RED)** - `a22f2d5a` (test)
2. **Task 2: Add reason column to model + migration 0004 (GREEN)** - `79f49be7` (feat)

**Plan metadata:** (this commit, pending)

## Files Created/Modified
- `data/notes_store/migrations/versions/0004_add_note_revision_reason.py` - New Alembic revision 0004; adds nullable `reason` Text column to `note_revisions`; forward-only (`downgrade()` raises `NotImplementedError`)
- `data/notes_store/models.py` - `NoteRevision.reason: Mapped[str | None]` (nullable Text); updated `action` inline comment to list `'takedown'`/`'restore'` and the class docstring's action-values list
- `data/tests/test_notes_migrations.py` - Added `test_migration_0004_adds_reason_nullable` (seeds a DB at 0003, upgrades to 0004, asserts `PRAGMA table_info` shows `reason` as nullable, inserts a row without a reason) and `test_no_downgrade_0004`

## Decisions Made
- Followed RESEARCH.md's Pitfall 3 guidance exactly: unlike migration 0003 (which needed a three-step add→backfill→tighten-NOT-NULL dance because `body_html` became eventually-NOT-NULL on a populated table), `reason` is nullable forever per D-09, so a single `batch_alter_table.add_column(nullable=True)` suffices — no backfill, no later `alter_column`.
- `downgrade()` raises `NotImplementedError` per the established 177 forward-only convention (Pitfall 4/T-177-01) — the live maderas SQLite store has no upstream to rebuild from.

## Deviations from Plan

None - plan executed exactly as written.

## Authentication Gates Encountered

None - this plan touches only local schema/ORM/test code; no auth-gated resources.

## Issues Encountered

None.

## Verification Results

- `cd data && uv run pytest tests/test_notes_migrations.py -x` — 7 passed (5 pre-existing + 2 new)
- `cd data && uv run pytest -m "not integration"` — 476 passed, 9 skipped (full fast-tier regression, no breakage)
- Source assertions confirmed: migration file contains exactly one `batch_alter_table` block, zero `alter_column` calls, `revision = "0004"`, `down_revision = "0003"`; `NoteRevision.reason` is `Mapped[str | None]` with `nullable=True`

## Next Steps

- Plan 02 (curator authz + takedown/restore routes) consumes this `reason` column when appending `note_revisions` rows.
- Plan 05 (operator-executed) applies `alembic upgrade head` on the live maderas SQLite store — not part of this plan (this plan is local/dev-writable and verifiable only).

## Self-Check: PASSED

- FOUND: data/notes_store/migrations/versions/0004_add_note_revision_reason.py
- FOUND: data/notes_store/models.py (reason field present)
- FOUND: data/tests/test_notes_migrations.py (two new tests present)
- FOUND commit a22f2d5a (test RED)
- FOUND commit 79f49be7 (feat GREEN)
