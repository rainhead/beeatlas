---
phase: quick-1
plan: 1
subsystem: data-pipeline
tags: [inat, pandas, ndjson, parquet, s3, cache]

# Dependency graph
requires:
  - phase: 09-inat-pipeline
    provides: download.py pipeline with fetch_all/fetch_since/build_dataframe/merge_delta/main
provides:
  - observations.ndjson written by pipeline with one raw API dict per line
  - downloaded_at column (pd.StringDtype) added to samples.parquet schema
  - cache_restore.sh restores observations.ndjson from S3
  - cache_upload.sh uploads observations.ndjson to S3 with existence guard
affects: [frontend-data-consumption, ci-cache-workflow]

# Tech tracking
tech-stack:
  added: [json (stdlib)]
  patterns: [NDJSON cache alongside parquet for raw API persistence]

key-files:
  created: []
  modified:
    - data/inat/download.py
    - data/tests/test_inat_download.py
    - scripts/cache_restore.sh
    - scripts/cache_upload.sh

key-decisions:
  - "Write NDJSON before build_dataframe so all raw results are cached even if obs lacks location"
  - "downloaded_at is pd.StringDtype (nullable string) — pd.NA for backfill rows, UTC ISO string for new fetches"
  - "make_mock_obs converted to plain dict factory — MagicMock subscript returns MagicMock, not values, which broke obs_to_row dict-access tests"

patterns-established:
  - "TDD red-green: write failing tests first, commit, then implement, commit"
  - "Cache scripts use 2>/dev/null || echo pattern for graceful missing-file fallback on restore"
  - "Cache upload guards optional files with [ -f ... ] existence check"

requirements-completed: []

# Metrics
duration: 7min
completed: 2026-03-11
---

# Quick Task 1: Store Full Observation JSON in Cache Summary

**Raw iNat API observations cached to observations.ndjson per pipeline run, with downloaded_at UTC timestamp column added to samples.parquet schema and S3 cache scripts updated to handle the new file.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-03-11T06:35:32Z
- **Completed:** 2026-03-11T06:42:00Z
- **Tasks:** 2 (Task 1: TDD — 3 commits; Task 2: 1 commit)
- **Files modified:** 4

## Accomplishments

- Added `NDJSON_PATH = Path("observations.ndjson")` constant and `downloaded_at: pd.StringDtype()` to `DTYPE_MAP`
- `build_dataframe` now accepts `downloaded_at` kwarg; stamps all rows with UTC ISO string or pd.NA
- `main()` writes `observations.ndjson` (one raw dict per line, including obs filtered out by location check) before calling `build_dataframe`
- `cache_restore.sh` and `cache_upload.sh` handle `observations.ndjson` alongside existing files
- 18 tests pass (4 new tests: 2 for downloaded_at, 1 for NDJSON output, 1 for empty schema)

## Task Commits

1. **Task 1 (RED): Failing tests for downloaded_at and NDJSON** - `fbbeab2` (test)
2. **Task 1 (GREEN): Implementation** - `17f478e` (feat)
3. **Task 2: Cache scripts** - `3de3349` (feat)

## Files Created/Modified

- `data/inat/download.py` - Added `import json`, `NDJSON_PATH`, `downloaded_at` in DTYPE_MAP, updated `build_dataframe` signature, NDJSON write in `main()`
- `data/tests/test_inat_download.py` - Replaced MagicMock factory with plain dict, added downloaded_at column to `make_df`, added `TestBuildDataframeDownloadedAt` and `TestMain` test classes
- `scripts/cache_restore.sh` - Added `observations.ndjson` restore block with graceful fallback
- `scripts/cache_upload.sh` - Added guarded `observations.ndjson` upload block

## Decisions Made

- Write NDJSON before `build_dataframe` so observations without a location (skipped by `obs_to_row`) are still captured in the raw cache.
- `downloaded_at` uses `pd.StringDtype()` (nullable) so backfilled rows from pre-existing parquet have `pd.NA` rather than a stale or fabricated timestamp.
- Converted `make_mock_obs` from `MagicMock` to a plain dict: `obs_to_row` uses dict subscript access (`obs["id"]`), and `MagicMock.__getitem__` returns a new `MagicMock` rather than the configured attribute value, making the old factory silently broken.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

All files verified present. All commits verified in git history.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `observations.ndjson` is now available in the S3 cache after each pipeline run
- Frontend or downstream consumers can read raw API fields without re-downloading from iNat
- `samples.parquet` schema has `downloaded_at` on every row going forward; existing parquet stub (zero rows) is schema-compatible since it also has zero rows

---
*Phase: quick-1*
*Completed: 2026-03-11*
