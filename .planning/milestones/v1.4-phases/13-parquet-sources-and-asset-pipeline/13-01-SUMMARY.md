---
phase: 13-parquet-sources-and-asset-pipeline
plan: 01
subsystem: ui
tags: [parquet, hyparquet, openlayers, typescript, bigint]

# Dependency graph
requires:
  - phase: 11-links-pipeline
    provides: occurrenceID column in ecdysis.parquet as UUID join key
provides:
  - ParquetSource with occurrenceID property on specimen features
  - SampleParquetSource class for iNaturalist samples data layer
affects: [14-sample-layer-wiring, 15-links-parquet-lookup]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "INT64 Parquet columns returned as BigInt by hyparquet — always coerce with Number() at read time"
    - "Feature ID prefix pattern: ecdysis:{id} for specimens, inat:{id} for iNat observations"

key-files:
  created: []
  modified:
    - frontend/src/parquet.ts

key-decisions:
  - "occurrenceID kept as-is (UUID string, no coercion) — it is large_string in Parquet, not INT64"
  - "SampleParquetSource uses lat/lon column names matching samples.parquet schema exactly (not latitude/longitude)"

patterns-established:
  - "ParquetSource pattern: columns array + setProperties maps Parquet rows to OL Feature properties"
  - "BigInt coercion: Number(obj.observation_id) in both setId and setProperties to prevent inat:93932795n suffix"

requirements-completed: [LINK-05, MAP-03]

# Metrics
duration: 1min
completed: 2026-03-12
---

# Phase 13 Plan 01: Add occurrenceID and SampleParquetSource Summary

**occurrenceID UUID join key added to ParquetSource; new SampleParquetSource class exports iNat sample features with BigInt-safe INT64 coercion**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-13T02:23:15Z
- **Completed:** 2026-03-13T02:24:12Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Added `occurrenceID` (UUID string) to `ParquetSource` columns array and `setProperties` — enables Phase 15 links.parquet join
- Created `SampleParquetSource` class exported from `parquet.ts` — data source for Phase 14's sample layer
- INT64 columns (`observation_id`, `specimen_count`) safely coerced from BigInt with `Number()` at read time
- Feature IDs use `inat:` prefix matching the established `ecdysis:` pattern

## Task Commits

Each task was committed atomically:

1. **Task 1: Add occurrenceID to ParquetSource** - `99ba8de` (feat)
2. **Task 2: Create SampleParquetSource class** - `de7aefc` (feat)

## Files Created/Modified

- `frontend/src/parquet.ts` - Added `occurrenceID` to ParquetSource; appended `sampleColumns` array and `SampleParquetSource` class

## Decisions Made

- `occurrenceID` is `large_string` in ecdysis.parquet — no `Number()` coercion needed, kept as UUID string
- `SampleParquetSource` uses `lat`/`lon` column names (not `latitude`/`longitude`) to match `samples.parquet` schema exactly
- Fixed leading spaces on import and export lines that were introduced by earlier incremental edits — restored clean formatting before Task 2 commit

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `ParquetSource` now exposes `occurrenceID` on every specimen feature — Phase 15 can use `feature.get('occurrenceID')` for links.parquet lookup
- `SampleParquetSource` is ready to be wired to the sample layer in Phase 14
- Both exports (`ParquetSource`, `SampleParquetSource`) build cleanly with zero TypeScript errors

---
*Phase: 13-parquet-sources-and-asset-pipeline*
*Completed: 2026-03-12*
