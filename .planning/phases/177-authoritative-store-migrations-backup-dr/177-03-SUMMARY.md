---
phase: 177
plan: "03"
subsystem: notes-store
tags: [sqlalchemy, sqlite, wal, orm, schema, authoritative-store]
dependency_graph:
  requires: [177-01]
  provides: [notes_store.models, notes_store.db, STORE-01-tests]
  affects: [177-04, 177-05, 177-06, 177-07, 179-harvest]
tech_stack:
  added: [sqlalchemy>=2.0.51]
  patterns: [DeclarativeBase mapped-class ORM, event.listens_for WAL pragma hook]
key_files:
  created:
    - data/notes_store/models.py
    - data/notes_store/db.py
    - data/tests/test_notes_store_schema.py
  modified: []
decisions:
  - "canonical_name is index=True, NOT unique=True (D-06: multiple author notes per species)"
  - "status default='approved' chosen over None/null so every row is immediately queryable (D-08)"
  - "synchronous=NORMAL chosen over FULL for performance with no durability regression at this scale"
  - "make_engine(db_path=None) takes Optional[str|Path] to ease test isolation without monkeypatching module-level constant"
metrics:
  duration: "~15 minutes"
  completed: "2026-07-03"
  tasks_completed: 3
  files_created: 3
---

# Phase 177 Plan 03: Notes Store Schema + Engine Factory Summary

**One-liner:** SQLAlchemy 2.0 `Note` + `NoteRevision` ORM models with WAL-mode engine factory — moderation/attribution columns from day one, multi-note per species enforced at schema level.

## What Was Built

### data/notes_store/models.py
SQLAlchemy 2.0 `DeclarativeBase` models for the two authoritative tables:

- `Note` (`notes` table): `id`, `canonical_name` (indexed, NOT unique per D-06), `author_id`, `body`, `status` (default `approved`), `created_at`, `updated_at`. Bidirectional relationship to revisions.
- `NoteRevision` (`note_revisions` table): `id`, `note_id` (FK→notes.id), `body`, `editor_id`, `revised_at`, `action` (`create`/`edit`/`remove`). Append-only soft-delete/edit ledger.

Module docstring declares the forward-only authoritative store intent and explicitly calls out that no `roles` table is present (D-07).

### data/notes_store/db.py
`NOTES_DB_PATH` module constant (reads `NOTES_DB_PATH` env var, defaults to `/opt/beeatlas-store/notes.db`) and `make_engine(db_path=None)` factory. Registers a `event.listens_for(engine, "connect")` hook that fires three PRAGMAs on every connection: `journal_mode=WAL`, `foreign_keys=ON`, `synchronous=NORMAL`. No DB opened at import time.

### data/tests/test_notes_store_schema.py
Four fast-tier pytest tests (no `@pytest.mark.integration`):

| Test | Covers |
|------|--------|
| `test_schema_notes` | STORE-01: both tables created with expected columns |
| `test_multiple_notes_per_species` | D-06: two rows with same canonical_name both persist |
| `test_wal_mode` | D-16: journal_mode=wal and foreign_keys=1 on every connection |
| `test_status_default` | D-08: status defaults to 'approved' |

## Verification

```
cd data && uv run pytest tests/test_notes_store_schema.py -x -q
# 4 passed in 0.62s

cd data && uv run pytest -m "not integration" -q
# 321 passed, 9 skipped, 60 deselected in 10.27s
```

Full regression suite: no regressions.

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

No new network endpoints, auth paths, or file access patterns introduced. `NOTES_DB_PATH` default (`/opt/beeatlas-store/notes.db`) correctly places the store outside `EXPORT_DIR`/`DB_PATH`/git (T-177-02 mitigation partial). WAL pragmas set here enable the Phase-179 consistent-snapshot backup (T-177-05 mitigation enabling).

## Self-Check: PASSED

- [x] `data/notes_store/models.py` exists (63 lines, `class Note` + `class NoteRevision`)
- [x] `data/notes_store/db.py` exists (46 lines, `def make_engine`)
- [x] `data/tests/test_notes_store_schema.py` exists (188 lines, 4 test functions)
- [x] Commit `95d2cfd2` — feat(177-03): ORM models
- [x] Commit `892de37d` — feat(177-03): WAL engine factory
- [x] Commit `565c66df` — test(177-03): schema tests
