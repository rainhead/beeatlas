---
phase: 01-pipeline
plan: 01
subsystem: pipeline
tags: [python, pandas, geopandas, pyarrow, parquet, ecdysis, argparse]

# Dependency graph
requires: []
provides:
  - CLI entry point `data/ecdysis/download.py --db <id>` for downloading Ecdysis zip archives
  - CLI entry point `data/ecdysis/occurrences.py <zip>` for converting zip to Parquet
  - `data/ecdysis.parquet` with all 11 PIPE-03 required columns, null-coord rows excluded
affects:
  - 02-infra (will deploy ecdysis.parquet to S3)
  - frontend (reads ecdysis.parquet via hyparquet)

# Tech tracking
tech-stack:
  added: [uv, pandas, geopandas, pyarrow]
  patterns:
    - "add_prefix('ecdysis_') applied by read_occurrences() before returning — downstream code must use prefixed column names"
    - "Write plain pd.DataFrame (not GeoDataFrame) to Parquet to avoid GeoParquet format that breaks hyparquet"
    - "Filter null coordinates using source columns (ecdysis_decimalLatitude.notna()) before column selection/rename"

key-files:
  created: []
  modified:
    - data/ecdysis/download.py
    - data/ecdysis/occurrences.py

key-decisions:
  - "Filter on ecdysis_decimalLatitude (prefixed name) not decimalLatitude — read_occurrences() calls add_prefix('ecdysis_') before returning"
  - "Cast GeoDataFrame to plain pd.DataFrame before to_parquet() to avoid GeoParquet format that breaks hyparquet"

patterns-established:
  - "Ecdysis column naming: all columns have ecdysis_ prefix after read_occurrences(); output Parquet uses clean names (latitude, longitude, scientificName, etc.)"

requirements-completed: [PIPE-01, PIPE-02, PIPE-03]

# Metrics
duration: 2min
completed: 2026-02-18
---

# Phase 1 Plan 01: Fix Ecdysis Pipeline Summary

**Ecdysis two-script pipeline fixed end-to-end: download.py now accepts --db argument and calls make_dump; occurrences.py produces a 45754-row Parquet with all 11 PIPE-03 columns, null coordinates excluded**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-18T21:31:23Z
- **Completed:** 2026-02-18T21:32:38Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `download.py` is now a working CLI: `--db` required argument added, `parse_args(sys.argv)` bug fixed, `make_dump({'db': args.db})` call added
- `occurrences.py` no longer hangs: `pdb.set_trace()` removed, `__main__` block fixed to accept zip path via `sys.argv[1]` and call `to_parquet()`
- `to_parquet()` now selects all 11 required columns (ecdysis_id + 10 semantic fields), filters null-coord rows (564 excluded), writes plain Parquet (not GeoParquet)

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix download.py — add --db argument, fix parse_args, call make_dump** - `d60e048` (fix)
2. **Task 2: Fix occurrences.py — remove pdb, fix __main__ block, expand to_parquet columns** - `729f1cf` (fix)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified
- `data/ecdysis/download.py` - Fixed CLI: --db argument, parse_args(), make_dump() call
- `data/ecdysis/occurrences.py` - Fixed: removed pdb, repaired __main__, expanded to_parquet to 11 columns with null-coord filter

## Decisions Made
- Filter null coordinates using `ecdysis_decimalLatitude.notna()` (prefixed name) because `read_occurrences()` calls `add_prefix('ecdysis_')` before returning — the unprefixed column `decimalLatitude` does not exist at that point
- Write `pd.DataFrame(df).to_parquet(...)` (not `df.to_parquet(...)` directly on a GeoDataFrame) to produce plain Parquet that hyparquet can read

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — both fixes were straightforward. The six bugs identified in research were accurate and the prescribed fixes worked on the first attempt.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `data/ecdysis.parquet` is ready for upload to S3 (Phase 2 infra)
- Both CLI scripts verified end-to-end; no blockers for downstream work
- The pdb blocker noted in STATE.md is resolved

---
*Phase: 01-pipeline*
*Completed: 2026-02-18*

## Self-Check: PASSED

- data/ecdysis/download.py: FOUND
- data/ecdysis/occurrences.py: FOUND
- .planning/phases/01-pipeline/01-01-SUMMARY.md: FOUND
- Commit d60e048: FOUND
- Commit 729f1cf: FOUND
