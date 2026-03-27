---
phase: 21-parquet-and-geojson-export
plan: 02
subsystem: ui
tags: [typescript, parquet, geojson, schema-validation, openlayers]

# Dependency graph
requires:
  - phase: 21-01
    provides: export.py that produces counties.geojson, ecoregions.geojson, ecdysis.parquet with inat_observation_id
provides:
  - Updated validate-schema.mjs expecting inat_observation_id in ecdysis.parquet (no links.parquet)
  - region-layer.ts wired to new counties.geojson and ecoregions.geojson filenames
  - Stale wa_counties.geojson, epa_l3_ecoregions_wa.geojson, links.parquet removed from assets/
affects: [CI schema gate, frontend build, region layer rendering]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "GeoJSON type declarations in geojson.d.ts for Vite JSON import resolution"

key-files:
  created:
    - frontend/src/region-layer.ts
    - frontend/src/geojson.d.ts
    - frontend/src/assets/counties.geojson
    - frontend/src/assets/ecoregions.geojson
  modified:
    - scripts/validate-schema.mjs
    - frontend/src/filter.ts

key-decisions:
  - "Copied region-layer.ts, geojson.d.ts, and updated filter.ts from dlt branch — worktree (dlt branch at bce2ebc) predated Phase 19 UI work that added selectedCounties/selectedEcoregions to FilterState"

patterns-established:
  - "geojson.d.ts provides TypeScript module declaration for .geojson imports — required for tsc --noEmit to pass"

requirements-completed: [EXP-04, GEO-01, GEO-02]

# Metrics
duration: 15min
completed: 2026-03-27
---

# Phase 21 Plan 02: Schema Validation and Frontend Import Wiring Summary

**validate-schema.mjs updated with inat_observation_id in ecdysis.parquet and links.parquet removed; region-layer.ts wired to counties.geojson/ecoregions.geojson; stale assets deleted**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-27T21:00:00Z
- **Completed:** 2026-03-27T21:15:00Z
- **Tasks:** 1
- **Files modified:** 6 (3 new, 3 deleted)

## Accomplishments

- Updated `validate-schema.mjs` EXPECTED dict: `inat_observation_id` added to ecdysis.parquet columns, `links.parquet` entry removed
- Created `region-layer.ts` in worktree with correct GeoJSON imports (`counties.geojson`, `ecoregions.geojson`)
- Added `counties.geojson` (170KB, 39 features) and `ecoregions.geojson` (1.02MB, 66 features) to assets
- Deleted stale `wa_counties.geojson`, `epa_l3_ecoregions_wa.geojson`, `links.parquet` from assets
- `npm run validate-schema` passes; `tsc --noEmit` passes

## Task Commits

1. **Task 1: Update validate-schema.mjs and region-layer.ts imports; delete stale files** - `6a25b21` (feat)

**Plan metadata:** (see final commit)

## Files Created/Modified

- `scripts/validate-schema.mjs` - Added `inat_observation_id` to ecdysis.parquet EXPECTED, removed `links.parquet` entry
- `frontend/src/region-layer.ts` - GeoJSON boundary layer module importing counties.geojson and ecoregions.geojson
- `frontend/src/geojson.d.ts` - TypeScript module declaration for .geojson Vite imports
- `frontend/src/filter.ts` - Added selectedCounties/selectedEcoregions to FilterState (required by region-layer.ts)
- `frontend/src/assets/counties.geojson` - 39 WA county features (NAME property)
- `frontend/src/assets/ecoregions.geojson` - 66 WA ecoregion features (NA_L3NAME property)

## Decisions Made

- Copied `region-layer.ts`, `geojson.d.ts`, and updated `filter.ts` from the `dlt` branch because this worktree (`worktree-agent-a43a3569`) was checked out at commit `bce2ebc` (Phase 16), predating the Phase 19 UI work that added `selectedCounties` and `selectedEcoregions` to `FilterState`. Without the updated `filter.ts`, TypeScript compilation failed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated filter.ts to include selectedCounties/selectedEcoregions**
- **Found during:** Task 1 (TypeScript compilation check)
- **Issue:** region-layer.ts references `filterState.selectedCounties` and `filterState.selectedEcoregions`, but this worktree's `filter.ts` predated Phase 19 and lacked those properties — `tsc --noEmit` failed with TS2339 errors
- **Fix:** Copied updated `filter.ts` from the `dlt` branch tip (commit `a710698`) which has both properties on `FilterState`
- **Files modified:** `frontend/src/filter.ts`
- **Verification:** `tsc --noEmit` exits 0 after update
- **Committed in:** `6a25b21` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required for TypeScript compilation to pass. No scope creep — filter.ts update was already present in dlt branch tip.

## Issues Encountered

- Worktree was checked out at Phase 16 commit, not at the tip of the `dlt` branch. Wave 1 (21-01) changes existed on the `dlt` branch but not in this worktree's working tree. All changes were applied by reading from the `dlt` branch tip via `git show dlt:path`.

## Next Phase Readiness

- Schema validation gate (EXP-04) complete — CI will validate `inat_observation_id` in ecdysis.parquet
- Frontend GeoJSON imports wired — region-layer.ts uses generated boundary files
- Stale files removed — no dangling imports or validators for removed artifacts
- Ready for Phase 21 completion / phase 22 if applicable

---
*Phase: 21-parquet-and-geojson-export*
*Completed: 2026-03-27*
