---
phase: 17-frontend-data-layer
plan: 01
subsystem: ui
tags: [parquet, hyparquet, openlayers, typescript, filtering]

# Dependency graph
requires:
  - phase: 16-pipeline-spatial-join
    provides: county and ecoregion_l3 columns in ecdysis.parquet and samples.parquet
provides:
  - county and ecoregion_l3 OL feature properties on specimen and sample features
  - FilterState.selectedCounties and FilterState.selectedEcoregions Sets
  - isFilterActive() recognizes non-empty region sets as active
  - matchesFilter() enforces AND-across-types / OR-within-type region filtering
affects:
  - 17-02 (region filter UI will read these feature properties and filter state)
  - 18-region-filtering (consumes region Sets in filter state)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Region filter uses Set<string> membership (has()) for OR-within-type semantics"
    - "Multiple filter dimensions use AND-across-types: feature must pass county AND ecoregion guards"
    - "Parquet string columns require 'as string ?? null' cast pattern (no BigInt coercion unlike year/month)"

key-files:
  created: []
  modified:
    - frontend/src/parquet.ts
    - frontend/src/filter.ts

key-decisions:
  - "county and ecoregion_l3 are string columns — no BigInt coercion needed (unlike year/month INT64 columns)"
  - "Region filter semantics: AND-across-types (county AND ecoregion if both active), OR-within-type (King OR Pierce within selectedCounties)"

patterns-established:
  - "Parquet string property pattern: obj.field as string ?? null"
  - "FilterState region guard in matchesFilter: check set size > 0, then feature.get() membership"

requirements-completed: []

# Metrics
duration: 2min
completed: 2026-03-14
---

# Phase 17 Plan 01: Frontend Data Layer - Parquet Columns and Region Filter State Summary

**county and ecoregion_l3 Parquet columns exposed as OL feature properties, with FilterState extended with region Sets and AND/OR filter guards in matchesFilter()**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-14T20:36:05Z
- **Completed:** 2026-03-14T20:38:02Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added 'county' and 'ecoregion_l3' to both `columns` (specimens) and `sampleColumns` (samples) Parquet column projection arrays
- Added county and ecoregion_l3 properties to both specimen and sample `setProperties()` calls using string cast pattern
- Extended `FilterState` interface and `filterState` singleton with `selectedCounties: Set<string>` and `selectedEcoregions: Set<string>`
- Extended `isFilterActive()` to return true when either region set is non-empty
- Added county and ecoregion_l3 guard clauses to `matchesFilter()` implementing AND-across-types / OR-within-type semantics

## Task Commits

Each task was committed atomically:

1. **Task 1: Add county and ecoregion_l3 to Parquet column projections** - `8f0b706` (feat)
2. **Task 2: Extend FilterState with region Sets and update filter logic** - `0b2d5ff` (feat)

## Files Created/Modified
- `frontend/src/parquet.ts` - Added county/ecoregion_l3 columns to both specimen and sample Parquet projections and setProperties calls
- `frontend/src/filter.ts` - Added selectedCounties and selectedEcoregions Sets to interface, singleton, isFilterActive, and matchesFilter

## Decisions Made
- String Parquet columns use `obj.field as string ?? null` cast (no BigInt coercion like year/month) — consistent with the existing pattern for string fields like scientificName, floralHost
- Region filter uses AND-across-types (feature must pass county AND ecoregion guards if both sets active), OR-within-type (membership in Set handles OR semantics natively)

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `feature.get('county')` and `feature.get('ecoregion_l3')` are ready on all specimen and sample features after Parquet load
- `filterState.selectedCounties` and `filterState.selectedEcoregions` are ready for Phase 17-02 region filter UI to populate
- Manual verification of feature properties at runtime deferred to Phase 17-02 checkpoint

---
*Phase: 17-frontend-data-layer*
*Completed: 2026-03-14*
