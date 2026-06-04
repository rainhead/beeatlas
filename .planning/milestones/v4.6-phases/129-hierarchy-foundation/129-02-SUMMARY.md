---
phase: 129-hierarchy-foundation
plan: 02
subsystem: pipeline
tags: [duckdb, sqlite, taxa, hierarchy, tdd, green]

# Dependency graph
requires:
  - "129-01: 9 RED hierarchy tests + fixtures"
provides:
  - "_build_taxon_hierarchy: seed+ancestry-expansion Anthophila load + bycatch pass"
  - "_assert_no_orphan_taxon_ids: hard-fail nightly gate (orphan + missing-parent)"
  - "generate_sqlite: injectable taxa_path/db_path kwargs"
  - "taxa table in occurrences.db: taxon_id PK, rank, name, lineage_path, is_anthophila"
affects: [129-03, 130]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DuckDB temp table assembly + single INSERT INTO out.taxa (no INSERT OR IGNORE — unsupported by DuckDB SQLite extension; WHERE NOT IN guard used instead)"
    - "stdlib sqlite3 CREATE TABLE before DuckDB ATTACH INSERT (to get NOT NULL DDL constraints)"
    - "Graceful checklist degradation: try/except around canonical_to_taxon_id join"
    - "QUALIFY ROW_NUMBER() OVER (PARTITION BY taxon_id) for DuckDB-side deduplication"

key-files:
  created: []
  modified:
    - data/sqlite_export.py

key-decisions:
  - "INSERT OR IGNORE replaced with INSERT INTO ... WHERE NOT IN guard — DuckDB's SQLite extension raises NotImplementedException on ON CONFLICT syntax (Rule 1 auto-fix)"
  - "taxa table pre-created via stdlib sqlite3 before DuckDB INSERT, to support NOT NULL DDL constraints that DuckDB cannot pass through ATTACH CREATE TABLE AS"
  - "Checklist seed arm degrades gracefully (try/except) when beeatlas.duckdb or checklist.parquet absent in test context"
  - "No-op fast-path when occurrences table has no taxon_id column (original test fixtures)"

# Metrics
duration: 25min
completed: 2026-06-02
---

# Phase 129 Plan 02: Hierarchy Implementation Summary

**Constrained taxa hierarchy build (seed + ancestry-expansion) in sqlite_export.py: all 9 Wave 0 RED tests turned GREEN, 14 total passing**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-06-02T18:00:00Z
- **Completed:** 2026-06-02T18:25:00Z
- **Tasks:** 2 (committed together — same file, sequential dependencies)
- **Files modified:** 1

## Accomplishments

- Added `_TAXA_PATH`, `DB_PATH`, `ANTHOPHILA_ID` module-level constants to `sqlite_export.py`
- Implemented `_build_taxon_hierarchy(con, dst_db, taxa_path, db_path)`:
  - PASS 1 (Anthophila, D-04 constrained): seeds from occurrence taxon_ids + checklist via `canonical_to_taxon_id`, expands to all ancestors via `unnest(string_split(ancestry, '/'))`, loads with `regexp_extract` lineage_path anchored at 630955
  - PASS 2 (bycatch): inserts every occurrence taxon_id not already in taxa with `is_anthophila=0`, `lineage_path NULL`, no active filter (Pitfall 5)
  - Creates `idx_taxa_lineage` and `idx_taxa_is_anthophila` indexes
- Implemented `_assert_no_orphan_taxon_ids(db_path)`:
  - Check 1: COUNT orphan occurrence taxon_ids; raises ValueError containing "orphan" if > 0
  - Check 2: parses all Anthophila lineage_path segments, checks each against taxa taxon_ids; raises ValueError containing "orphan / missing-parent" if any segment unresolved
- Updated `generate_sqlite` to accept `taxa_path: Path | None` and `db_path: str | None` (injectable for tests)
- Wired `_build_taxon_hierarchy` before `DETACH out` and `_assert_no_orphan_taxon_ids` before the geo_blob block
- All 9 Wave 0 hierarchy tests GREEN; 5 original occurrences tests still GREEN = 14 total

## Task Commits

1. **Tasks 1+2: _build_taxon_hierarchy + _assert_no_orphan_taxon_ids** - `1041c02`

## Files Created/Modified

- `/home/peter/dev/beeatlas/data/sqlite_export.py` — added 287 lines: module constants, `_build_taxon_hierarchy`, `_assert_no_orphan_taxon_ids`, updated `generate_sqlite` signature

## Decisions Made

- `INSERT OR IGNORE INTO out.taxa` replaced with `INSERT INTO out.taxa ... WHERE taxon_id NOT IN (SELECT taxon_id FROM out.taxa)` — DuckDB's SQLite extension raises `NotImplementedException` on `ON CONFLICT`/`INSERT OR IGNORE` syntax. The NOT IN guard is functionally equivalent (deduplication before insert).
- taxa table pre-created via stdlib `sqlite3.connect(dst_db)` before DuckDB opens the ATTACH connection — this allows the full DDL with NOT NULL constraints, which DuckDB's `CREATE TABLE AS SELECT` would strip.
- Graceful degradation: checklist seed arm wrapped in try/except — unit tests without beeatlas.duckdb or checklist.parquet proceed with only the occurrence-seeded arm.
- Fast-path: when `out.occurrences` has no `taxon_id` column (original test fixtures), taxa table is created empty with indexes and the function returns early.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] DuckDB SQLite extension does not support INSERT OR IGNORE**
- **Found during:** Task 1 first test run
- **Issue:** `_duckdb.NotImplementedException: Database type "sqlite" does not support MERGE INTO or ON CONFLICT` — the plan's prescribed `INSERT OR IGNORE INTO out.taxa` syntax is not implemented by DuckDB's SQLite extension
- **Fix:** Replaced `INSERT OR IGNORE INTO out.taxa SELECT ...` with `INSERT INTO out.taxa SELECT ... WHERE t.taxon_id NOT IN (SELECT taxon_id FROM out.taxa) QUALIFY ROW_NUMBER() OVER (PARTITION BY t.taxon_id ...) = 1`. Semantically identical: skip rows with taxon_id already present. Pre-created the taxa table via stdlib sqlite3 first (so NOT NULL DDL constraints are honored).
- **Files modified:** `data/sqlite_export.py`
- **Commit:** `1041c02`
- **Impact:** Plan acceptance criterion `grep -c "INSERT OR IGNORE INTO out.taxa"` returns 0 instead of >=2. All 14 tests pass; deduplication contract is satisfied.

## Known Stubs

None — taxa table is fully populated by the two-pass build; no placeholder values.

## Threat Flags

No new security surface introduced beyond what the plan's threat model covers (T-129-03 through T-129-07).

## Self-Check: PASSED

- `data/sqlite_export.py` exists and contains `def _build_taxon_hierarchy`, `def _assert_no_orphan_taxon_ids`, `taxa_path`, `regexp_extract.*630955`, `unnest(string_split(ancestry`
- commit `1041c02` exists in git log
- 14 tests pass: `cd data && uv run pytest tests/test_sqlite_export.py -q` → 14 passed
