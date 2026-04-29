---
phase: 071-base-map-and-occurrence-layer
plan: 01
subsystem: ui
tags: [mapbox-gl, geojson, vite, ci, typescript]

# Dependency graph
requires:
  - phase: 065-ui-unification
    provides: OccurrenceSource class, unified occurrence model
provides:
  - mapbox-gl v3.22.0 installed as dependency
  - VITE_MAPBOX_TOKEN env var typed and wired to CI
  - loadOccurrenceGeoJSON() returning GeoJSON FeatureCollection from SQLite
  - recencyTier() and RECENCY_COLORS exported without OL dependencies
  - region-layer.ts no-op stubs preventing import errors during migration
affects: [071-02, 071-03, 072]

# Tech tracking
tech-stack:
  added: [mapbox-gl v3.22.0]
  patterns: [GeoJSON FeatureCollection from SQLite, pure recency module, Vite env var typing]

key-files:
  created: [frontend/src/env.d.ts]
  modified: [frontend/package.json, frontend/src/style.ts, frontend/src/features.ts, frontend/src/region-layer.ts, .github/workflows/deploy.yml]

key-decisions:
  - "No @types/mapbox-gl -- Mapbox GL JS v3.22.0 includes first-party TypeScript declarations"
  - "features.ts returns [lon, lat] WGS84 coordinates (not projected EPSG:3857) for Mapbox consumption"
  - "region-layer.ts exports only loadBoundaries and makeRegionStyleFn as no-ops; removed exports (regionLayer, countySource, ecoregionSource) will cause expected bee-map.ts import errors until Plan 02 rewrites it"

patterns-established:
  - "GeoJSON construction: SQLite query -> row callback -> Feature array with occId and recencyTier properties"
  - "Summary and taxaOptions computed in same single-pass SQLite query as GeoJSON features"

requirements-completed: []

# Metrics
duration: 3min
completed: 2026-04-26
---

# Phase 71 Plan 01: Foundation Summary

**Mapbox GL JS v3.22.0 installed, env.d.ts with VITE_MAPBOX_TOKEN typed, style.ts/features.ts/region-layer.ts rewritten with zero OL imports**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-27T00:08:22Z
- **Completed:** 2026-04-27T00:11:08Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Installed mapbox-gl v3.22.0 with CI token pipeline (VITE_MAPBOX_TOKEN env var in deploy.yml)
- Rewrote style.ts as zero-dependency pure TypeScript module exporting recencyTier and RECENCY_COLORS
- Rewrote features.ts to return GeoJSON FeatureCollection from SQLite with occId and recencyTier per feature
- Stubbed region-layer.ts with no-op exports to prevent import errors during Mapbox migration

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Mapbox GL JS, create env.d.ts, update deploy.yml** - `ebace04` (feat)
2. **Task 2: Rewrite style.ts -- pure recency functions, no OL** - `3ef413c` (refactor)
3. **Task 3: Rewrite features.ts (GeoJSON output) and stub region-layer.ts** - `c007102` (feat)

## Files Created/Modified
- `frontend/package.json` - Added mapbox-gl v3.22.0 dependency
- `frontend/src/env.d.ts` - NEW: Vite env var type declarations for VITE_MAPBOX_TOKEN
- `.github/workflows/deploy.yml` - Added VITE_MAPBOX_TOKEN env to build step
- `frontend/src/style.ts` - Rewritten: pure recencyTier + RECENCY_COLORS, zero OL imports
- `frontend/src/features.ts` - Rewritten: loadOccurrenceGeoJSON returning GeoJSON FeatureCollection
- `frontend/src/region-layer.ts` - Rewritten: no-op stubs for loadBoundaries and makeRegionStyleFn

## Decisions Made
- No @types/mapbox-gl installed -- Mapbox GL JS v3.22.0 ships first-party TypeScript declarations (no community types needed)
- features.ts outputs [lon, lat] WGS84 coordinates (not projected EPSG:3857) since Mapbox GL JS expects WGS84 natively
- region-layer.ts only exports loadBoundaries and makeRegionStyleFn as no-ops; the removed exports (regionLayer, countySource, ecoregionSource) will cause expected TypeScript errors in bee-map.ts until Plan 02 rewrites it

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

| File | Line | Stub | Resolution |
|------|------|------|------------|
| frontend/src/region-layer.ts | 5 | loadBoundaries() no-op | Phase 72 will implement Mapbox boundary layers |
| frontend/src/region-layer.ts | 8 | makeRegionStyleFn() no-op | Phase 72 will implement Mapbox region styling |

These stubs are intentional per the plan -- boundary layers are deferred to Phase 72.

## Issues Encountered
None

## User Setup Required

Mapbox account and access token required before Plan 02 visual verification:
- Create Mapbox account at https://www.mapbox.com/
- Generate a public access token
- Restrict token to beeatlas.net URL in Mapbox dashboard
- Add token as `MAPBOX_TOKEN` GitHub Actions secret for CI builds
- For local dev, create `frontend/.env` with `VITE_MAPBOX_TOKEN=pk.your_token_here`

## Next Phase Readiness
- mapbox-gl is installed and ready for import in bee-map.ts (Plan 02)
- GeoJSON data flow from SQLite is ready (loadOccurrenceGeoJSON)
- Recency tier logic is decoupled from OL and available for Mapbox paint expressions
- bee-map.ts still has OL imports that will fail TypeScript compilation -- expected and resolved in Plan 02

---
*Phase: 071-base-map-and-occurrence-layer*
*Completed: 2026-04-26*
