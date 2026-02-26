---
phase: 03-core-map
plan: "01"
subsystem: ui
tags: [openlayers, clustering, parquet, temporal, recency]

# Dependency graph
requires:
  - phase: 01-pipeline
    provides: ecdysis.parquet with year/month/scientificName/recordedBy/fieldNumber/genus/family columns
provides:
  - ol/source/Cluster wrapping specimenSource with distance:40 on the specimen VectorLayer
  - clusterStyle function with recency-aware coloring (3 tiers) and count-based radius
  - RECENCY_COLORS exported constant for easy future revision
  - ParquetSource reading all sidebar and style columns (year/month/scientificName/recordedBy/fieldNumber/genus/family)
affects:
  - 03-02 (sidebar plan — uses clusterStyle and inner feature properties)
  - 04-filter (taxon/date filter will need columns loaded here)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "StyleFunction typed as (feature: FeatureLike) => Style to match OL's StyleLike interface"
    - "Style cache keyed by count:tier string to avoid per-render object allocation"
    - "Recency thresholds computed once at module load with temporal-polyfill, not per render"
    - "Cluster inner features accessed via feature.get('features') ?? [feature] fallback"

key-files:
  created: []
  modified:
    - frontend/src/parquet.ts
    - frontend/src/style.ts
    - frontend/src/bee-map.ts

key-decisions:
  - "clusterStyle parameter typed as FeatureLike (not Feature) to match OL StyleFunction signature — inner features cast to Feature[] since Cluster source always wraps proper Feature objects"
  - "Style cache key format is count:tier (e.g., '5:fresh') — sufficient granularity for visual correctness"
  - "Recency boundary uses month day=1 for PlainDate comparison — conservative (rounds early), acceptable for coarse recency tiers"

patterns-established:
  - "OL StyleFunction must accept FeatureLike; cast inner cluster features explicitly"
  - "Feature properties set via feature.setProperties() in ParquetSource loader callback"

requirements-completed: [MAP-01]

# Metrics
duration: 2min
completed: 2026-02-21
---

# Phase 03 Plan 01: Specimen Clustering Summary

**ol/source/Cluster wired on VectorLayer with recency-colored, count-sized circle styles using temporal-polyfill for 3-tier freshness tiers**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-21T03:19:42Z
- **Completed:** 2026-02-21T03:21:12Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- ParquetSource now reads all sidebar and style columns: year, month, scientificName, recordedBy, fieldNumber, genus, family
- clusterStyle encodes specimen count in circle radius and recency tier in circle color (green/orange/grey)
- ol/source/Cluster wraps specimenSource with distance:40, replacing raw VectorSource on the specimen layer
- Style objects cached by `count:tier` key — no per-render allocation
- Full production build passes cleanly (tsc + vite build)

## Task Commits

Each task was committed atomically:

1. **Task 1: Expand Parquet columns** - `cc1490d` (feat)
2. **Task 2: Rewrite clusterStyle with recency tiers** - `52fdae2` (feat)
3. **Task 3: Wire Cluster source to VectorLayer** - `3f70530` (feat)

## Files Created/Modified
- `frontend/src/parquet.ts` - Added year/month/scientificName/recordedBy/fieldNumber/genus/family columns; call feature.setProperties() in loader; removed ecdysis_fieldNumber prefix
- `frontend/src/style.ts` - Complete rewrite: exports RECENCY_COLORS and clusterStyle; recency computed at module load; style cache; removed beeStyle
- `frontend/src/bee-map.ts` - Added Cluster import and clusterSource wrapping specimenSource; VectorLayer now uses clusterSource and clusterStyle; removed beeStyle import

## Decisions Made
- `clusterStyle` parameter typed as `FeatureLike` (not `Feature`) to satisfy OL's `StyleFunction` interface — inner features from Cluster source are proper `Feature` objects so the cast is safe
- Cache key format `count:tier` is sufficient — same count + same tier always produces identical visual output
- Recency PlainDate uses `day: 1` for month-level comparison; rounds to start of month (acceptable coarseness for these tiers)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed clusterStyle parameter type to FeatureLike**
- **Found during:** Task 3 (Wire Cluster source to VectorLayer)
- **Issue:** Plan specified `feature: Feature` as parameter type, but OL's `StyleFunction` type requires `FeatureLike` — TypeScript error TS2322 prevented compile
- **Fix:** Changed parameter type to `FeatureLike` and added explicit cast for inner features to `Feature[]`; imported `FeatureLike` from `ol/Feature.js`
- **Files modified:** frontend/src/style.ts
- **Verification:** `tsc --noEmit` exits 0; `npm run build` succeeds
- **Committed in:** 3f70530 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 type bug)
**Impact on plan:** Required for TypeScript correctness; inner features are always Feature objects so the cast is semantically sound.

## Issues Encountered
None beyond the type fix above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Cluster layer is live; plan 02 (sidebar) can now reference inner feature properties (year, month, scientificName, etc.) loaded here
- Visual smoke test not run in CI — recommend manual verification at http://localhost:5173 after `npm run dev`
- Parquet file must have year/month as numeric columns for recencyTier() to work correctly

---
*Phase: 03-core-map*
*Completed: 2026-02-21*
