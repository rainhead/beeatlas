---
phase: 28-frontend-runtime-fetch
verified: 2026-03-29T00:00:00Z
status: passed
score: 6/6 must-haves verified
gaps: []
human_verification:
  - test: "Observe loading indicator in browser"
    expected: '"Loading..." overlay is visible briefly while ecdysis.parquet is being fetched'
    why_human: "Timing-dependent visual; cannot verify overlay timing programmatically without running a browser"
  - test: "Observe error state in browser"
    expected: '"Failed to load data. Please try refreshing." appears when network requests to beeatlas.net/data/* are blocked'
    why_human: "Requires DevTools network blocking; cannot simulate fetch failure in static code check"
  - test: "Verify county and ecoregion dropdowns populate after page load"
    expected: "Sidebar dropdowns list county and ecoregion names after GeoJSON sources finish loading"
    why_human: "Requires running browser; countySource.once('change') callback populates dropdowns asynchronously"
---

# Phase 28: Frontend Runtime Fetch Verification Report

**Phase Goal:** Remove bundled data files from frontend build; frontend fetches all data from CloudFront /data/ at runtime; add loading/error UI; configure CloudFront CORS for cross-origin fetch + Range request support.
**Verified:** 2026-03-29
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                              | Status     | Evidence                                                                                    |
|----|-----------------------------------------------------------------------------------------------------|------------|---------------------------------------------------------------------------------------------|
| 1  | Frontend build output (dist/) contains no .parquet or .geojson files                              | VERIFIED   | `ls frontend/dist/assets/` returns only `.js`, `.js.map`, `.css` — no data files            |
| 2  | Frontend fetches parquet and GeoJSON from CloudFront /data/ at runtime                            | VERIFIED   | `bee-map.ts:8` sets `DATA_BASE_URL`; sources use `${DATA_BASE_URL}/ecdysis.parquet` etc.     |
| 3  | Loading indicator is visible while parquet files are being fetched                                 | VERIFIED*  | `_dataLoading=true` initially; `.loading-overlay` rendered in `render()` overlay; cleared at `specimenSource.once('change')` line 753 |
| 4  | Error message appears if data fetch fails                                                          | VERIFIED*  | `dataErrorHandler` set in `firstUpdated()`; sets `_dataError = 'Failed to load data. Please try refreshing.'`; rendered as `.error-overlay` |
| 5  | CloudFront /data/* returns CORS headers including Access-Control-Allow-Origin and Access-Control-Expose-Headers | VERIFIED | `curl -sI -H "Origin: http://localhost:5173" https://beeatlas.net/data/ecdysis.parquet` returns `access-control-allow-origin: *` and `access-control-expose-headers: Content-Range,Content-Length,ETag` |
| 6  | County and ecoregion dropdowns populate after GeoJSON loads asynchronously                         | VERIFIED*  | `countySource.once('change')` at line 795 and `ecoregionSource.once('change')` at line 800 set `_countyOptions`/`_ecoregionOptions` @state; passed to `<bee-sidebar>` via `.countyOptions` and `.ecoregionOptions` |

*Truths 3, 4, 6 are mechanically verified in code; final browser confirmation is in Human Verification section.

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact                             | Expected                                       | Status   | Details                                                                                                      |
|--------------------------------------|------------------------------------------------|----------|--------------------------------------------------------------------------------------------------------------|
| `infra/lib/beeatlas-stack.ts`        | CloudFront /data/* behavior with CORS          | VERIFIED | Contains `DataCachePolicy` (Origin in cache key), `DataCorsPolicy` (CORS + Range headers), `addBehavior('/data/*')` |
| `frontend/src/region-layer.ts`       | Async GeoJSON VectorSource with url+format     | VERIFIED | `countySource` and `ecoregionSource` use `url: \`${DATA_BASE_URL}/...\`` with `GeoJSONFormat`; no bundled imports |
| `frontend/src/bee-map.ts`            | Loading/error state, async countyOptions       | VERIFIED | `_dataLoading`, `_dataError`, `_countyOptions`, `_ecoregionOptions` all present as `@state()` properties    |
| `frontend/.env.example`              | Documents VITE_DATA_BASE_URL env var           | VERIFIED | File exists; contains `VITE_DATA_BASE_URL=https://beeatlas.net/data` (commented example)                    |

### Key Link Verification

| From                          | To                            | Via                                  | Status   | Details                                                                      |
|-------------------------------|-------------------------------|--------------------------------------|----------|------------------------------------------------------------------------------|
| `frontend/src/bee-map.ts`     | `https://beeatlas.net/data`   | `VITE_DATA_BASE_URL` env var         | WIRED    | Line 8: `DATA_BASE_URL` defined; lines 199/212: used in ParquetSource URLs  |
| `frontend/src/region-layer.ts`| `https://beeatlas.net/data`   | `VITE_DATA_BASE_URL` for GeoJSON url | WIRED    | Line 10: `DATA_BASE_URL` defined; lines 47/53: used in VectorSource urls     |
| `infra/lib/beeatlas-stack.ts` | siteBucket /data/ prefix      | `distribution.addBehavior('/data/*')`| WIRED    | Line 74: `addBehavior('/data/*', S3BucketOrigin.withOriginAccessControl(...))` |

### Data-Flow Trace (Level 4)

| Artifact                    | Data Variable      | Source                                    | Produces Real Data    | Status    |
|-----------------------------|--------------------|-------------------------------------------|-----------------------|-----------|
| `frontend/src/bee-map.ts`   | `_countyOptions`   | `countySource.once('change')` → `getFeatures()` | Yes — OL loads from CloudFront URL | FLOWING |
| `frontend/src/bee-map.ts`   | `_ecoregionOptions`| `ecoregionSource.once('change')` → `getFeatures()` | Yes — OL loads from CloudFront URL | FLOWING |
| `frontend/src/bee-map.ts`   | `_dataLoading`     | Cleared by `specimenSource.once('change')` | Yes — triggered by real parquet fetch | FLOWING |
| `frontend/src/bee-map.ts`   | `_dataError`       | `dataErrorHandler` set in `firstUpdated()`; called by `ParquetSource.onError` | Yes — wired to real fetch failure path | FLOWING |

### Behavioral Spot-Checks

| Behavior                                    | Command                                                                                      | Result                                                                  | Status |
|---------------------------------------------|----------------------------------------------------------------------------------------------|-------------------------------------------------------------------------|--------|
| CDK infra TypeScript compiles               | `cd infra && npm run build`                                                                  | Exit 0, no errors                                                       | PASS   |
| dist/ contains no .parquet/.geojson         | `ls frontend/dist/assets/`                                                                   | `index-kvdk1Swo.js`, `.js.map`, `.css` only                             | PASS   |
| src/assets/ contains no data files         | `ls frontend/src/assets/`                                                                    | Empty (no files)                                                        | PASS   |
| CloudFront CORS headers present on /data/*  | `curl -sI -H "Origin: http://localhost:5173" https://beeatlas.net/data/ecdysis.parquet`     | `access-control-allow-origin: *`, `access-control-expose-headers: Content-Range,Content-Length,ETag` | PASS |
| geojson.d.ts deleted                        | `test -f frontend/src/geojson.d.ts`                                                          | File does not exist                                                     | PASS   |
| geojsonPlugin removed from vite.config.ts  | `grep geojsonPlugin frontend/vite.config.ts`                                                 | No match                                                                | PASS   |
| No bundled parquet/geojson import in source | `grep -n "import ecdysisDump\|import samplesDump" frontend/src/bee-map.ts`                   | No match                                                                | PASS   |

### Requirements Coverage

| Requirement | Source Plan | Description                                                                                                               | Status    | Evidence                                                                                                               |
|-------------|-------------|---------------------------------------------------------------------------------------------------------------------------|-----------|------------------------------------------------------------------------------------------------------------------------|
| FETCH-01    | 28-01-PLAN  | Frontend fetches all four data files from CloudFront /data/ at runtime; bundled asset imports removed from build          | SATISFIED | `DATA_BASE_URL` used in `bee-map.ts` and `region-layer.ts`; no `.parquet`/`.geojson` in `dist/`; `src/assets/` empty  |
| FETCH-02    | 28-01-PLAN  | CloudFront /data/* cache behavior with correct CORS headers (Origin in cache key); supports Range requests                | SATISFIED | `DataCachePolicy` (Origin allowList), `DataCorsPolicy` (exposes Content-Range/ETag), `addBehavior('/data/*')` in CDK; confirmed live via curl |
| FETCH-03    | 28-01-PLAN  | Frontend shows loading state while data files are being fetched                                                           | SATISFIED | `_dataLoading=true` initial; `.loading-overlay` in render; cleared on `specimenSource` change event                  |

No orphaned requirements — all three FETCH requirements are claimed by `28-01-PLAN.md` and all three are satisfied.

### Anti-Patterns Found

| File                               | Line | Pattern                    | Severity | Impact   |
|------------------------------------|------|----------------------------|----------|----------|
| `frontend/src/bee-map.ts` line 625 | 625  | `_dataError ? '' : html\`` | Info     | Sidebar hidden on error — intended behavior per plan (not a stub) |

No blocker or warning anti-patterns found. The `return null`, `return {}`, or empty handler patterns are absent. The `_dataLoading=true` initial value is overwritten by real fetch completion (not a stub — the `specimenSource.once('change')` callback at line 753 writes `false`).

### Human Verification Required

#### 1. Loading Indicator Timing

**Test:** Open http://localhost:5173 (`npm run dev` in `frontend/`). Observe the page during initial load.
**Expected:** "Loading..." overlay appears briefly over the map area while ecdysis.parquet is being fetched, then disappears when the specimen dots render.
**Why human:** The overlay timing is driven by a real fetch event — cannot verify visual appearance without running a browser.

#### 2. Error State

**Test:** Open DevTools Network tab, add a blocking rule for `beeatlas.net/data/*`, then reload the page.
**Expected:** "Failed to load data. Please try refreshing." message appears in place of the map.
**Why human:** Requires DevTools network interception; cannot simulate fetch failure in static analysis.

#### 3. County and Ecoregion Dropdowns

**Test:** Load the app, switch sidebar to "Counties" boundary mode.
**Expected:** County dropdown lists county names (e.g. "King", "Pierce", "Wahkiakum") after GeoJSON loads.
**Why human:** Requires running browser to confirm `countySource` fires `change` and populates the dropdown.

### Gaps Summary

No gaps. All six observable truths are mechanically verified in the codebase. The three FETCH requirements are fully satisfied:

- FETCH-01: All four data files are fetched from CloudFront at runtime; no bundled copies remain in `src/assets/` or `dist/`.
- FETCH-02: CDK stack has `/data/*` behavior with `DataCachePolicy` (Origin in cache key) and `DataCorsPolicy` (CORS + Content-Range/ETag exposed). Confirmed live against beeatlas.net.
- FETCH-03: Loading overlay (`_dataLoading`) and error overlay (`_dataError`) are both wired to real data-fetch events, not placeholder values.

Three behavioral items require human confirmation but do not represent code gaps — the wiring is complete and substantive.

---

_Verified: 2026-03-29_
_Verifier: Claude (gsd-verifier)_
