---
phase: 16-pipeline-spatial-join
plan: 05
subsystem: pipeline
tags: [geopandas, spatial-join, parquet, ecdysis, inat]

# Dependency graph
requires:
  - phase: 16-02
    provides: add_region_columns() in spatial.py with multi-convention coordinate detection

provides:
  - Ecdysis pipeline (occurrences.py) writes county and ecoregion_l3 to ecdysis.parquet
  - iNat pipeline (download.py) writes county and ecoregion_l3 to samples.parquet
  - load_boundaries() helper in inat/download.py for test-mocking boundary loading

affects:
  - 16-06 (CI/schema validation — parquet output columns now include county and ecoregion_l3)
  - Phase 18 (click handler reading ecoregion/county from parquet)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Boundary GDFs loaded once in __main__ / main() and passed through as arguments — avoids double-loading
    - add_region_columns() called on merged DataFrame (not delta alone) so incremental iNat runs re-apply regions to all rows

key-files:
  created: []
  modified:
    - data/ecdysis/occurrences.py
    - data/inat/download.py

key-decisions:
  - "Boundaries loaded once in __main__/main() and passed into to_parquet()/add_region_columns() — not loaded inside the function (avoids double-loading per plan spec)"
  - "add_region_columns() applied to merged DataFrame in iNat main(), not just delta, so incremental runs re-process existing rows from lat/lon coordinates"
  - "iNat load_boundaries() defined as named function (not inline) to enable test mocking via patch('inat.download.load_boundaries')"

patterns-established:
  - "Pattern: Pipeline boundary loading — load boundary GDFs once at entrypoint, pass as arguments through pipeline functions"

requirements-completed: [PIPE-05, PIPE-06]

# Metrics
duration: 10min
completed: 2026-03-14
---

# Phase 16 Plan 05: Pipeline Spatial Join Integration Summary

**Both ecdysis and iNat pipelines now write county and ecoregion_l3 columns to their parquet outputs via add_region_columns() from spatial.py**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-14T18:10:00Z
- **Completed:** 2026-03-14T18:20:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Updated `data/ecdysis/occurrences.py` to import and call `add_region_columns()` before column selection, with `to_parquet()` accepting boundary GDFs as parameters
- Updated `data/inat/download.py` to import geopandas and `add_region_columns`, add `load_boundaries()` helper, and apply region join to merged DataFrame in `main()`
- All 9 tests in `tests/test_spatial.py` pass GREEN including `TestInatIntegration`

## Task Commits

Each task was committed atomically:

1. **Task 1: Integrate spatial join into data/ecdysis/occurrences.py** - `6ab74bc` (feat)
2. **Task 2: Integrate spatial join into data/inat/download.py** - `8b2fa84` (feat)

## Files Created/Modified

- `data/ecdysis/occurrences.py` - Added `add_region_columns` import; updated `to_parquet()` signature to accept `counties_gdf`/`ecoregions_gdf`; added county/ecoregion_l3 to column selection; updated `__main__` to load boundaries once
- `data/inat/download.py` - Added `geopandas` and `add_region_columns` imports; added `TIGER_ZIP`/`ECO_ZIP` constants; added `load_boundaries()` helper; updated `main()` to call `load_boundaries()` and `add_region_columns(merged, ...)` before writing parquet

## Decisions Made

- Boundaries loaded once in `__main__`/`main()` and passed as arguments — not re-loaded inside `to_parquet()` (avoids double-loading per plan spec).
- `add_region_columns()` applied to `merged` (post-`merge_delta`), not just `delta`, ensuring incremental iNat runs re-apply regions from lat/lon to all rows in the full dataset.
- `load_boundaries()` defined as a named function (not inlined in `main()`) to enable clean mocking in `TestInatIntegration` via `patch('inat.download.load_boundaries')`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. All tests were already passing for `spatial.py` (TestAddRegionColumns, TestNearestFallback from Plan 02). `TestInatIntegration` went from RED to GREEN as expected after adding `load_boundaries()` to `inat/download.py`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both pipeline outputs now carry `county` and `ecoregion_l3` columns
- Ready for Phase 16 Plan 06: CI/schema validation update to include new columns in expected schema dict
- No blockers

---
*Phase: 16-pipeline-spatial-join*
*Completed: 2026-03-14*
