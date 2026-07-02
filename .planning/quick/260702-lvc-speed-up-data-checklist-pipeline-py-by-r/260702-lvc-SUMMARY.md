---
phase: quick-260702-lvc
plan: 01
subsystem: data-pipeline
tags: [duckdb, pyarrow, performance, data-pipeline]
dependency_graph:
  requires: []
  provides: [fast-checklist-bulk-insert]
  affects: [data/checklist_pipeline.py, data/tests/test_checklist_pipeline.py]
tech_stack:
  added: []
  patterns: [pyarrow-arrow-registration-bulk-insert, duckdb-update-from-arrow-view]
key_files:
  created: []
  modified:
    - data/checklist_pipeline.py
    - data/tests/test_checklist_pipeline.py
decisions:
  - "Used pa.table + con.register + INSERT..SELECT for the 4 INSERT sites; UPDATE..FROM for the occurrences canonical_name site; pyarrow was already a direct dependency (no new dep added)"
metrics:
  duration: "~10 minutes"
  completed: "2026-07-02"
  tasks_completed: 2
  files_modified: 2
---

# Phase quick-260702-lvc Plan 01: Speed Up checklist_pipeline.py Bulk Inserts Summary

**One-liner:** Replace all 5 row-by-row `executemany` call sites in `checklist_pipeline.py` with pyarrow-backed bulk operations (4 `INSERT..SELECT` + 1 `UPDATE..FROM`), achieving a 257x speedup on the 50k-row checklist_records_full insert.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add _bulk_insert helper; replace 4 INSERT executemany sites | a9d7ce0a | data/checklist_pipeline.py |
| 2 | Convert UPDATE executemany to set-based UPDATE...FROM + new test | 2763a3bb | data/checklist_pipeline.py, data/tests/test_checklist_pipeline.py |

## What Was Done

### Task 1

Added `import pyarrow as pa` and a module-level `_bulk_insert(con, table, columns, records)` helper that:
1. Returns immediately on empty records (no-op, matching `executemany([])`)
2. Transposes `records: list[tuple]` to columnar form via `zip(*records)`
3. Builds a `pa.table(...)` with named columns matching the target DDL
4. Registers it as `_bulk_arrow` on the connection, runs `INSERT INTO T (cols) SELECT cols FROM _bulk_arrow`, then unregisters in a `finally` block (idempotency guard)

Replaced 4 INSERT executemany call sites: `checklist_data.checklist_records` (4 cols), `checklist_data.checklist_records_full` (14 cols), `checklist_data.species` (11 cols), `checklist_data.species_counties` (2 cols).

### Task 2

Replaced the row-by-row `executemany` UPDATE in `_update_occurrences_canonical_name` with a single `UPDATE ecdysis_data.occurrences AS o SET canonical_name = m.canonical_name FROM _canon_map AS m WHERE o.scientific_name = m.scientific_name`, using the same Arrow registration pattern. Semantics are identical: one row per DISTINCT scientific_name in `_canon_map`, NULL/empty rows do not join and keep `canonical_name` unchanged.

Added `test_update_occurrences_canonical_name_maps_distinct_names` — a self-contained fast-tier test that exercises the UPDATE with real rows (trinomial fold, authority stripping, duplicate rows, NULL preservation) without touching the module-scoped `checklist_sample_db` fixture.

## Benchmark Results

Throwaway 50,000-row micro-benchmark (14-column `checklist_records_full` schema, mix of int/float/str/None):

| Path | Time | Rows |
|------|------|------|
| `executemany` | 45.109s | 50,000 |
| Arrow bulk (`_bulk_insert`) | 0.175s | 50,000 |
| **Speedup** | **257.6x** | — |

Arrow path well under the 2s threshold. The `checklist_sample_db` fixture (previously ~4s on the 8-row sample) now completes in ~1.2s; the nightly 50k-row `checklist_records_full` insert will drop from minutes to sub-second.

## Verification

- `grep -n "con\.executemany" data/checklist_pipeline.py` — **0 call sites** (2 docstring mentions only)
- Fast-tier `tests/test_checklist_pipeline.py`: **39 passed, 3 skipped** (was 38; new UPDATE test added)
- Full fast-tier `uv run pytest -m "not integration"`: **317 passed, 9 skipped** (no collateral)
- Both runs green with and without `pytest-randomly`

## Deviations from Plan

None — plan executed exactly as written. DDL, CSV parsing, canonical_name mapping, coord_flag/date_quality logic, and all print lines left untouched. No new dependency added.

## Known Stubs

None.

## Threat Flags

None — this is a pure internal performance change to a data pipeline helper. No network surface, auth paths, or schema changes at trust boundaries.

## Self-Check: PASSED

- `data/checklist_pipeline.py` modified: confirmed
- `data/tests/test_checklist_pipeline.py` modified: confirmed
- Commits a9d7ce0a and 2763a3bb: confirmed in git log
