---
phase: 121-prebuilt-sqlite-load
plan: 01
subsystem: database
tags: [sqlite, duckdb, pipeline, parquet, nightly]

# Dependency graph
requires:
  - phase: 88-dbt-cutover
    provides: dbt-build step that produces occurrences.parquet in _DBT_SANDBOX
provides:
  - data/sqlite_export.py with generate_sqlite() that converts parquet to SQLite
  - generate-sqlite STEP in data/run.py pipeline (after dbt-build)
  - nightly.sh uploads occurrences.db content-hashed and publishes occurrences_db manifest key
affects:
  - 121-02 (worker cutover — Plan 02 fetches occurrences.db via manifest occurrences_db key)

# Tech tracking
tech-stack:
  added: [duckdb sqlite extension (ATTACH TYPE sqlite)]
  patterns:
    - Schema-derived SQLite export via CREATE TABLE ... AS SELECT * FROM read_parquet() — no hardcoded DDL
    - Same _DBT_SANDBOX/_EXPORT_DIR constants in sqlite_export.py mirror run.py for standalone invocation

key-files:
  created:
    - data/sqlite_export.py
    - data/tests/test_sqlite_export.py
  modified:
    - data/run.py
    - data/nightly.sh

key-decisions:
  - "Schema derived from parquet at export time — no hardcoded CREATE TABLE — so future column changes require no code edits"
  - "occurrences.db and occurrences.parquet share basename 'occurrences'; different extensions prevent filename collision after content-hashing"
  - "No --content-type override for .db upload — SQLite is octet-stream; CloudFront gzip fires at edge level independently of Content-Type"
  - "generate-sqlite placed immediately after dbt-build (before topology-postprocess) because dbt-build is what writes occurrences.parquet to _EXPORT_DIR"

patterns-established:
  - "TDD RED/GREEN: test file committed before implementation module"
  - "Pipeline step modules mirror run.py constants (_DBT_SANDBOX, _EXPORT_DIR) for standalone invocation"

requirements-completed: [PERF-01]

# Metrics
duration: 2min
completed: 2026-05-28
---

# Phase 121 Plan 01: sqlite_export Pipeline Step Summary

**DuckDB-to-SQLite parquet exporter wired into the nightly pipeline, producing occurrences.db uploaded content-hashed as the occurrences_db manifest key**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-28T02:12:55Z
- **Completed:** 2026-05-28T02:15:19Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Created `data/sqlite_export.py` with `generate_sqlite(src_parquet, dst_db)` that uses duckdb's sqlite extension to produce a SQLite file with schema derived entirely from the parquet (no hardcoded DDL)
- Wired `("generate-sqlite", generate_sqlite_export)` into `data/run.py` STEPS immediately after `("dbt-build", _run_dbt_build)`
- Extended `data/nightly.sh` to upload `occurrences.db` via `_upload_hashed` and emit `"occurrences_db"` in the manifest heredoc — Plan 02 worker cutover now has the artifact it needs

## Task Commits

Each task was committed atomically:

1. **Task 1: TDD RED** - `dda29ea` (test: add failing tests for generate_sqlite + main())
2. **Task 1: TDD GREEN** - `42cb0ee` (feat: implement generate_sqlite() + main() in sqlite_export.py)
3. **Task 2: Wire STEP** - `843a6a2` (feat: wire generate-sqlite step into data/run.py STEPS after dbt-build)
4. **Task 3: nightly.sh** - `4214843` (feat: upload occurrences.db and add occurrences_db key to manifest in nightly.sh)

## Files Created/Modified

- `data/sqlite_export.py` - `generate_sqlite(src_parquet, dst_db)` + `main()` standalone entry point
- `data/tests/test_sqlite_export.py` - 5 pytest tests covering table existence, row count, column parity, overwrite, and main() orchestration
- `data/run.py` - Added import + `("generate-sqlite", generate_sqlite_export)` STEP; updated module docstring
- `data/nightly.sh` - Added occurrences.db upload line and `"occurrences_db"` manifest key

## Decisions Made

- Schema derived from parquet at export time (`CREATE TABLE out.occurrences AS SELECT * FROM read_parquet(...)`) — no hardcoded `CREATE TABLE` — so future dbt column changes require no edits to sqlite_export.py
- Both artifacts use basename `"occurrences"` in `_upload_hashed`; different file extensions (`.parquet` vs `.db`) ensure the hashed filenames don't collide
- No `--content-type` override on the `.db` upload — SQLite binary is correctly served as `application/octet-stream`; CloudFront's edge-level gzip applies regardless of Content-Type (confirmed in spike FINDINGS.md)
- `generate-sqlite` step placed immediately after `dbt-build` (before `topology-postprocess`) because `dbt-build` is the step that writes `occurrences.parquet` to `_EXPORT_DIR`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `occurrences.db` will be produced by the next nightly pipeline run and published as `occurrences_db` in `manifest.json`
- Plan 02 (worker MemoryVFS cutover) can now proceed — it reads `occurrences_db` from the manifest to fetch and seed the VFS

---
*Phase: 121-prebuilt-sqlite-load*
*Completed: 2026-05-28*
