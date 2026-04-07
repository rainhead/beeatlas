---
phase: 13-parquet-sources-and-asset-pipeline
plan: 02
subsystem: ui
tags: [openlayers, typescript, style, parquet, build]

# Dependency graph
requires:
  - phase: 13-parquet-sources-and-asset-pipeline
    provides: SampleParquetSource and ParquetSource infrastructure (13-01)
provides:
  - SAMPLE_RECENCY_COLORS exported const with teal/blue/slate palette
  - sampleDotStyle function for rendering sample dots on OL map
  - Graceful links.parquet copy step in build-data.sh
affects:
  - 14-sample-layer (wires sampleDotStyle to the sample layer)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tier-keyed style cache (3 possible values) avoids filter-state dependency"
    - "Use new Date() + getUTCFullYear/Month for ISO 8601+timezone parsing (not Temporal.PlainDate.from)"
    - "|| echo fallback after cp to gracefully skip missing optional files under set -euo pipefail"

key-files:
  created: []
  modified:
    - frontend/src/style.ts
    - scripts/build-data.sh

key-decisions:
  - "Sample colors use shifted palette (teal/blue/slate) distinct from specimen colors (green/orange/gray)"
  - "sampleDotStyle radius 5px intentionally distinct from single-specimen cluster radius 4px"
  - "Date parsing uses new Date() not Temporal.PlainDate.from() — ISO 8601 with timezone offset not parseable by Temporal"

patterns-established:
  - "Tier string as cache key: sampleStyleCache keyed by 'fresh'|'thisYear'|'older' (no filter state)"

requirements-completed: [MAP-03]

# Metrics
duration: 1min
completed: 2026-03-13
---

# Phase 13 Plan 02: Sample Dot Style and links.parquet Build Step Summary

**Added sampleDotStyle (teal/blue/slate OL Circle style) and SAMPLE_RECENCY_COLORS to style.ts, plus graceful links.parquet copy to build-data.sh**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-13T02:25:53Z
- **Completed:** 2026-03-13T02:26:54Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Exported `SAMPLE_RECENCY_COLORS` const with shifted palette (teal `#1abc9c`, blue `#3498db`, slate `#7f8c8d`)
- Exported `sampleDotStyle` function reusing module-private `recencyTier()` with tier-keyed cache
- Added graceful `links.parquet` copy step to `build-data.sh` with `|| echo` fallback for `set -euo pipefail` safety

## Task Commits

1. **Task 1: Add SAMPLE_RECENCY_COLORS and sampleDotStyle to style.ts** - `ecc3f86` (feat)
2. **Task 2: Add graceful links.parquet copy to build-data.sh** - `824d4f7` (feat)

## Files Created/Modified

- `frontend/src/style.ts` - Added SAMPLE_RECENCY_COLORS const and sampleDotStyle function (30 lines)
- `scripts/build-data.sh` - Added graceful links.parquet cp step with || echo fallback

## Decisions Made

- Sample colors use a shifted palette distinct from specimen RECENCY_COLORS — visually separates sample dots from specimen clusters
- `sampleStyleCache` keyed by tier string only (not tier+count like styleCache) because sample dots have no count label
- Used `new Date()` with `getUTCFullYear()/getUTCMonth()` instead of `Temporal.PlainDate.from()` — ISO 8601 strings with timezone offsets (e.g. `2023-04-04 15:32:38-07:00`) throw RangeError in Temporal

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `sampleDotStyle` and `SAMPLE_RECENCY_COLORS` are ready for Phase 14 to wire to the sample layer
- `links.parquet` will be bundled to `frontend/src/assets/links.parquet` on the next full `build-data.sh` run after the links pipeline produces `data/links/links.parquet`

---
*Phase: 13-parquet-sources-and-asset-pipeline*
*Completed: 2026-03-13*
