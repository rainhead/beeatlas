---
phase: 23-frontend-simplification
plan: 01
subsystem: ui
tags: [typescript, parquet, hyparquet, openlayers, lit]

# Dependency graph
requires:
  - phase: 21-parquet-and-geojson-export
    provides: inat_observation_id column embedded in ecdysis.parquet
provides:
  - inat_observation_id read directly from ecdysis ParquetSource features
  - Elimination of links.parquet network request on page load
affects:
  - frontend data loading
  - bee-sidebar iNat link display

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Read inat_observation_id from ecdysis feature properties (not a separate parquet file)"
    - "BigInt-to-Number coercion via Number() at read time (matches existing v1.4 pattern)"

key-files:
  created: []
  modified:
    - frontend/src/parquet.ts
    - frontend/src/bee-map.ts

key-decisions:
  - "inat_observation_id coerced with Number() at read time, consistent with year/month/observation_id coercion pattern"
  - "loadLinksMap and _linksMap fully deleted — no feature-flag or fallback; Phase 21 guarantees the column exists"

patterns-established:
  - "Embed join columns in the primary parquet source rather than loading a secondary parquet file"

requirements-completed: [FRONT-01]

# Metrics
duration: 1min
completed: 2026-03-27
---

# Phase 23 Plan 01: Frontend Simplification Summary

**Eliminated the links.parquet secondary fetch by reading inat_observation_id directly off ecdysis features, removing loadLinksMap, _linksMap, and the linksDump asset import**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-03-27T22:51:02Z
- **Completed:** 2026-03-27T22:51:23Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Removed `loadLinksMap`, `linkColumns`, and `_linksMap` entirely from the frontend
- Added `inat_observation_id` to the ParquetSource columns array and setProperties block
- Updated `buildSamples` to read inat_observation_id from feature properties instead of a linksMap lookup
- Removed the `links.parquet` asset import and loadLinksMap promise chain from connectedCallback
- TypeScript compiles cleanly; Vite build succeeds; links.parquet no longer bundled

## Task Commits

Each task was committed atomically:

1. **Task 1: Update parquet.ts -- add inat_observation_id column, delete loadLinksMap** - `5ed6f7d` (feat)
2. **Task 2: Update bee-map.ts -- remove links.parquet loading, rewire buildSamples** - `bed4954` (feat)

## Files Created/Modified
- `frontend/src/parquet.ts` - Added inat_observation_id to columns array and setProperties; deleted loadLinksMap and linkColumns
- `frontend/src/bee-map.ts` - Removed loadLinksMap import, linksDump import, _linksMap field, and promise chain; updated buildSamples signature and all call sites

## Decisions Made
- Deleted loadLinksMap without fallback: Phase 21 export.py guarantees the column exists in ecdysis.parquet, so no feature-flag or graceful-miss is needed
- Used `Number(obj.inat_observation_id)` coercion consistent with the existing v1.4 BigInt pattern for INT64 columns

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Frontend no longer makes a request for links.parquet
- iNat link display in the sidebar is wired to ecdysis feature properties
- Ready for remaining plans in phase 23 (frontend simplification)

## Self-Check: PASSED
- `frontend/src/parquet.ts` exists and contains `inat_observation_id` in columns and setProperties
- `frontend/src/bee-map.ts` exists with no references to loadLinksMap, _linksMap, linksDump, or links.parquet
- Commit `5ed6f7d` verified in git log
- Commit `bed4954` verified in git log

---
*Phase: 23-frontend-simplification*
*Completed: 2026-03-27*
