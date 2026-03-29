---
phase: 28-frontend-runtime-fetch
plan: 01
subsystem: infra, ui
tags: [cloudfront, cors, vite, lit, openLayers, parquet]

# Dependency graph
requires: []
provides:
  - CloudFront /data/* cache behavior with CORS headers (Origin in cache key, Content-Range/ETag exposed)
  - Frontend runtime fetch of ecdysis.parquet, samples.parquet, counties.geojson, ecoregions.geojson from beeatlas.net/data
  - Loading/error state in BeeMap component
  - Async county/ecoregion dropdown population
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Vite VITE_DATA_BASE_URL env var for runtime data URL injection (defaults to https://beeatlas.net/data)"
    - "OL VectorSource url+format pattern for async GeoJSON fetch — countySource.getFeatures() is empty at module init"
    - "dataErrorHandler module-scope variable for routing parquet fetch errors to Lit @state"
    - "specimenSource.once('change') clears _dataLoading; map not shown until parquet ready"

key-files:
  created:
    - frontend/.env.example
  modified:
    - infra/lib/beeatlas-stack.ts
    - frontend/src/region-layer.ts
    - frontend/src/parquet.ts
    - frontend/src/bee-map.ts
    - frontend/vite.config.ts
  deleted:
    - frontend/src/geojson.d.ts
    - frontend/src/assets/counties.geojson
    - frontend/src/assets/ecoregions.geojson

key-decisions:
  - "VITE_DATA_BASE_URL defaults to https://beeatlas.net/data — dev env fetches from prod CloudFront (no proxy)"
  - "CachePolicy with Origin allowList required (not CACHING_OPTIMIZED) for per-origin CORS caching"
  - "ResponseHeadersPolicy exposes Content-Range/Content-Length/ETag for hyparquet Range request compatibility"
  - "_countyOptions/_ecoregionOptions are @state() populated via countySource/ecoregionSource once('change') handlers"
  - "dataErrorHandler is a module-scope variable set in firstUpdated() — wires parquet onError to Lit reactive state"

patterns-established:
  - "Pattern: async GeoJSON via OL VectorSource url+format — feature population deferred to source change event"
  - "Pattern: parquet onError callback surfaces fetch failures to application error state"

requirements-completed: [FETCH-01, FETCH-02, FETCH-03]

# Metrics
duration: 30min
completed: 2026-03-29
---

# Phase 28 Plan 01: Frontend Runtime Fetch Summary

**CloudFront /data/* CORS behavior added and frontend migrated from bundled assets to runtime fetch with loading/error state**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-03-29T00:00:00Z
- **Completed:** 2026-03-29
- **Tasks:** 2 of 3 auto-tasks complete (Task 3 is checkpoint:human-verify, pending)
- **Files modified:** 7 (+ 3 deleted)

## Accomplishments

- CloudFront `/data/*` cache behavior added with custom CachePolicy (Origin in cache key) and ResponseHeadersPolicy (CORS + Content-Range/ETag)
- All 4 bundled data files removed from frontend build; `npm run build` dist/ contains zero .parquet/.geojson files
- Frontend fetches ecdysis.parquet and samples.parquet at runtime from `https://beeatlas.net/data` via DATA_BASE_URL constant
- GeoJSON sources switch to OL async url+format pattern; county/ecoregion dropdowns populate lazily after source loads
- BeeMap shows "Loading..." until specimenSource fires change, and "Failed to load data. Please try refreshing." on fetch error

## Task Commits

1. **Task 1: Add CloudFront /data/* cache behavior with CORS headers** - `95e603b` (feat)
2. **Task 2: Remove bundled assets, switch to runtime fetch, add loading/error state** - `3171a62` (feat)
3. **Task 3: Verify runtime fetch works in browser** - PENDING (checkpoint:human-verify)

## Files Created/Modified

- `infra/lib/beeatlas-stack.ts` - Added DataCachePolicy + DataCorsPolicy + distribution.addBehavior('/data/*')
- `frontend/src/region-layer.ts` - Removed geojson imports; switched countySource/ecoregionSource to OL url+format
- `frontend/src/parquet.ts` - Added optional `onError` callback to ParquetSource and SampleParquetSource
- `frontend/src/bee-map.ts` - Removed parquet imports; added DATA_BASE_URL, _dataLoading/_dataError/_countyOptions/_ecoregionOptions @state; updated render(); wired county/ecoregion change listeners
- `frontend/vite.config.ts` - Removed geojsonPlugin (no longer needed)
- `frontend/.env.example` - Created; documents VITE_DATA_BASE_URL
- `frontend/src/geojson.d.ts` - DELETED
- `frontend/src/assets/counties.geojson` - DELETED (tracked file)
- `frontend/src/assets/ecoregions.geojson` - DELETED (tracked file)

## Decisions Made

- `VITE_DATA_BASE_URL` defaults to `https://beeatlas.net/data` — dev environment fetches directly from production CloudFront (no proxy needed per D-01)
- Custom `CachePolicy` with `CacheHeaderBehavior.allowList('Origin')` instead of managed `CACHING_OPTIMIZED` — necessary for per-origin CORS cache variation
- `ResponseHeadersPolicy` exposes `Content-Range`, `Content-Length`, `ETag` — ensures hyparquet Range requests work correctly from any origin
- `_countyOptions`/`_ecoregionOptions` as `@state()` properties populated on source `change` event — avoids calling `getFeatures()` before OL async VectorSource has loaded
- `dataErrorHandler` module-scope variable (set in `firstUpdated()`) — bridges parquet constructor onError to Lit reactive state without restructuring module-scope source construction

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `ecdysis.parquet` and `samples.parquet` were already gitignored (*.parquet) so were never tracked in git — `git add` of those paths gracefully reported no match. No action needed.

## User Setup Required

**Task 3 checkpoint pending.** After CDK is deployed, verify:

1. `cd infra && npx cdk deploy --require-approval never`
2. Check CORS headers: `curl -sI -H "Origin: http://localhost:5173" "https://beeatlas.net/data/ecdysis.parquet" | grep -i access-control`
3. `cd frontend && npm run dev` — open http://localhost:5173 — verify loading state then map render
4. Confirm no CORS errors in DevTools Network tab

## Next Phase Readiness

- CDK stack changes ready to deploy (Task 3 checkpoint pending user verification)
- Frontend builds cleanly with no bundled data files
- Loading/error states are wired and functional
- County/ecoregion dropdowns will populate lazily after GeoJSON loads

## Known Stubs

None — loading state and error state are wired to real data sources, not hardcoded placeholder values.

---

## Self-Check: PASSED

- `infra/lib/beeatlas-stack.ts` — FOUND (modified)
- `frontend/.env.example` — FOUND (created)
- Commit `95e603b` — FOUND
- Commit `3171a62` — FOUND
- `frontend/dist/` — no .parquet or .geojson files — VERIFIED
- `frontend/src/assets/` — empty — VERIFIED

---
*Phase: 28-frontend-runtime-fetch*
*Completed: 2026-03-29 (partial — Task 3 checkpoint pending)*
