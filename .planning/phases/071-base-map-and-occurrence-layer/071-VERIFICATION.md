---
phase: 071-base-map-and-occurrence-layer
verified: 2026-04-27T00:35:00Z
status: human_needed
score: 8/8
overrides_applied: 0
human_verification:
  - test: "Verify basemap renders with Mapbox outdoors-v12 tiles at WA center"
    expected: "Map shows terrain contours, green vegetation at center [-120.5, 47.5] zoom 7"
    why_human: "Requires visual confirmation of WebGL rendering in a browser"
  - test: "Verify clusters display with recency coloring and count labels"
    expected: "Green=fresh, orange=thisYear, gray=older clusters with white count text"
    why_human: "Color perception and cluster rendering require visual inspection"
  - test: "Verify single unclustered points display with recency coloring"
    expected: "Zoom in to see individual points with the same color scheme at radius 6"
    why_human: "Requires zooming into the map and visual inspection"
  - test: "Verify visibleIds filtering with ghost dots"
    expected: "Activating a filter shows matching dots in color and excluded dots as faint gray"
    why_human: "Filter interaction and visual feedback require manual testing"
  - test: "Verify selectedOccIds highlighting with yellow ring"
    expected: "Selected features display a yellow ring (stroke-width 2.5, color #f1c40f)"
    why_human: "Selection highlighting requires clicking occurrences (deferred to Phase 72) or URL restore"
  - test: "Verify URL view state round-trip"
    expected: "Pan/zoom updates URL; pasting URL in new tab restores map position"
    why_human: "URL state sync requires browser interaction"
---

# Phase 71: Base Map and Occurrence Layer Verification Report

**Phase Goal:** Replace OpenLayers map, tile layer, and occurrence clustering with Mapbox GL JS equivalents -- basemap renders, occurrences cluster with recency colors, view state syncs with URL
**Verified:** 2026-04-27T00:35:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Mapbox GL JS v3 renders the basemap with an outdoors-style tileset at the same default center/zoom as OL | VERIFIED | bee-map.ts:207 `style: 'mapbox://styles/mapbox/outdoors-v12'`, center `[DEFAULT_LON, DEFAULT_LAT]` = `[-120.5, 47.5]`, zoom `DEFAULT_ZOOM` = `7` |
| 2 | Occurrence data from SQLite loads into a Mapbox GeoJSON source with `cluster: true` | VERIFIED | bee-map.ts:220-232 addSource 'occurrences' with `cluster: true`, `clusterRadius: 20`, `clusterProperties` aggregating recency tiers; features.ts:40 queries SQLite `SELECT * FROM occurrences` |
| 3 | Clusters display with recency-based coloring (fresh/thisYear/older) matching the current OL style | VERIFIED | bee-map.ts:262-264 paint expression uses `RECENCY_COLORS.fresh` (#2ecc71), `.thisYear` (#f39c12), `.older` (#7f8c8d) prioritized fresh>thisYear>older |
| 4 | Single (unclustered) points display with the same recency coloring and size | VERIFIED | bee-map.ts:297-313 'unclustered-point' layer with `['match', ['get', 'recencyTier'], ...]` paint and `circle-radius: 6` |
| 5 | View state (center, zoom) syncs to URL params via the existing `view-moved` event | VERIFIED | bee-map.ts:352-356 `moveend` handler emits `view-moved` with `{ lon: center.lng, lat: center.lat, zoom }`; bee-atlas.ts:561-568 `_onViewMoved` calls `_pushUrlState()` |
| 6 | `visibleIds` filtering works -- only features matching the active filter are rendered | VERIFIED | bee-map.ts:374-397 `_applyVisibleIds()` partitions `_fullGeoJSON.features` by `visibleIds` membership, calls `setData` on 'occurrences' (visible) and 'occurrences-ghost' (excluded) sources |
| 7 | `selectedOccIds` highlighting works -- selected features render with distinct styling | VERIFIED | bee-map.ts:399-414 `_applySelection()` calls `setFilter` on 'selected-ring' layer with `['in', ['get', 'occId'], ['literal', [...]]]`; layer paint: yellow stroke (#f1c40f), radius 10 |
| 8 | The Mapbox access token is configured without hardcoding in source (env var or config) | VERIFIED | bee-map.ts:202 `import.meta.env.VITE_MAPBOX_TOKEN`; env.d.ts:4 `VITE_MAPBOX_TOKEN: string`; deploy.yml:33 `VITE_MAPBOX_TOKEN: ${{ secrets.MAPBOX_TOKEN }}` |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/src/bee-map.ts` | Mapbox GL JS map component | VERIFIED | 469 lines, imports mapboxgl, zero OL imports, clustered source, ghost source, selection ring, all events |
| `frontend/src/features.ts` | GeoJSON FeatureCollection loader from SQLite | VERIFIED | 103 lines, exports `loadOccurrenceGeoJSON`, imports from sqlite.ts and style.ts, zero OL imports |
| `frontend/src/style.ts` | Recency tier logic without OL dependencies | VERIFIED | 15 lines, exports `RECENCY_COLORS` and `recencyTier`, zero imports of any kind |
| `frontend/src/region-layer.ts` | No-op stubs for boundary layers | VERIFIED | 10 lines, exports `loadBoundaries` and `makeRegionStyleFn` as no-ops, zero OL imports |
| `frontend/src/env.d.ts` | Vite env var type declarations | VERIFIED | 10 lines, declares `VITE_MAPBOX_TOKEN: string` with `/// <reference types="vite/client" />` |
| `frontend/src/bee-atlas.ts` | Root coordinator wired to Mapbox-based bee-map | VERIFIED | 897 lines, imports `loadBoundaries` from region-layer.ts, calls `_loadCountyEcoregionOptions()` from `_onDataLoaded` |
| `frontend/src/tests/bee-atlas.test.ts` | Updated test suite with mocks matching new module exports | VERIFIED | Mocks `loadOccurrenceGeoJSON` (not OccurrenceSource), `loadBoundaries` (not regionLayer/countySource), mapbox-gl Map class |
| `.github/workflows/deploy.yml` | CI passes MAPBOX_TOKEN to build | VERIFIED | Line 33: `VITE_MAPBOX_TOKEN: ${{ secrets.MAPBOX_TOKEN }}` |
| `frontend/package.json` | mapbox-gl v3.x dependency | VERIFIED | `"mapbox-gl": "^3.22.0"` in dependencies; no `@types/mapbox-gl` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| bee-map.ts | features.ts | `import { loadOccurrenceGeoJSON }` | WIRED | Line 5: `import { loadOccurrenceGeoJSON, type OccurrenceProperties } from './features.ts'`; called at line 216 |
| bee-map.ts | style.ts | `import { RECENCY_COLORS }` | WIRED | Line 6: `import { RECENCY_COLORS } from './style.ts'`; used in paint expressions at lines 264, 265, 266, 305, 306, 307 |
| bee-map.ts | mapbox-gl | `import mapboxgl` | WIRED | Line 3: `import mapboxgl from 'mapbox-gl'`; `new mapboxgl.Map` at line 205 |
| features.ts | sqlite.ts | `import { getDB, tablesReady }` | WIRED | Line 2: `import { getDB, tablesReady } from './sqlite.ts'`; used at lines 31-32 |
| features.ts | style.ts | `import { recencyTier }` | WIRED | Line 3: `import { recencyTier } from './style.ts'`; called at line 52 |
| bee-atlas.ts | region-layer.ts | `import { loadBoundaries }` | WIRED | Line 6: `import { loadBoundaries } from './region-layer.ts'`; called at line 283 |
| tests/bee-atlas.test.ts | features.ts | `vi.mock('../features.ts')` | WIRED | Lines 15-28: mocks `loadOccurrenceGeoJSON` with GeoJSON response |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| bee-map.ts | `_fullGeoJSON` | `loadOccurrenceGeoJSON()` from features.ts | features.ts queries `SELECT * FROM occurrences` via sqlite.ts | FLOWING |
| bee-map.ts | `summary` / `taxaOptions` | `loadOccurrenceGeoJSON()` return value | Computed from same SQLite query in features.ts lines 54-100 | FLOWING |
| bee-atlas.ts | `_countyOptions` | `_loadCountyEcoregionOptions()` | `SELECT DISTINCT county FROM occurrences` at line 426 | FLOWING |
| bee-atlas.ts | `_ecoregionOptions` | `_loadCountyEcoregionOptions()` | `SELECT DISTINCT ecoregion_l3 FROM occurrences` at line 432 | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript compiles cleanly | `npx tsc --noEmit` | Zero errors, clean exit | PASS |
| All 162 Vitest tests pass | `npx vitest run` | 162 passed, 0 failed (940ms) | PASS |
| Zero OL imports in bee-map.ts | `grep -c "from 'ol" frontend/src/bee-map.ts` | 0 | PASS |
| Zero OL imports in style.ts | `grep -c "from 'ol" frontend/src/style.ts` | 0 | PASS |
| Zero OL imports in features.ts | `grep -c "from 'ol" frontend/src/features.ts` | 0 | PASS |
| Zero OL imports in region-layer.ts | `grep -c "from 'ol" frontend/src/region-layer.ts` | 0 | PASS |
| mapbox-gl in package.json | `grep "mapbox-gl" frontend/package.json` | `"mapbox-gl": "^3.22.0"` | PASS |
| speicmenLayer typo preserved | `grep "speicmenLayer" frontend/src/bee-map.ts` | Line 52: `private speicmenLayer: unknown` | PASS |
| All 6 commits valid | `git log --oneline` for each hash | All present and correctly messaged | PASS |

### Requirements Coverage

No formal requirement IDs assigned for this phase (platform migration). Success criteria from ROADMAP.md serve as the requirement contract.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| region-layer.ts | 5, 8 | No-op stub functions | INFO | Intentional per plan -- boundary layers deferred to Phase 72 |
| bee-map.ts | 360-362 | All clicks emit map-click-empty | INFO | Intentional per plan -- occurrence/region click handling deferred to Phase 72 |

No TODO/FIXME/PLACEHOLDER markers found. No empty return stubs. No console.log-only implementations. No hardcoded empty data flowing to rendering.

### Human Verification Required

### 1. Basemap Rendering

**Test:** Create `frontend/.env` with `VITE_MAPBOX_TOKEN=pk.your_token_here`, run `npm run dev`, open http://localhost:5173
**Expected:** Mapbox outdoors-v12 basemap renders with terrain contours and green vegetation, centered on Washington State
**Why human:** WebGL rendering requires a browser with a valid Mapbox token

### 2. Cluster Recency Coloring

**Test:** Observe occurrence clusters on the map
**Expected:** Green clusters (fresh), orange clusters (thisYear), gray clusters (older) with white count labels
**Why human:** Color verification requires visual inspection

### 3. Unclustered Point Rendering

**Test:** Zoom in until clusters dissolve into individual points
**Expected:** Individual points show same recency coloring at radius 6 with white stroke
**Why human:** Requires interactive zoom and visual inspection

### 4. Filter Ghost Dots

**Test:** Open filter panel, select a family. Clear the filter.
**Expected:** Filtered-out dots appear as faint gray ghosts (opacity 0.2). Clearing filter restores all dots.
**Why human:** Filter interaction and visual feedback require manual testing

### 5. URL View State Round-Trip

**Test:** Pan/zoom map, copy URL, open in new tab
**Expected:** New tab restores same map position and zoom level
**Why human:** URL state sync requires browser interaction

### 6. Container Resize

**Test:** Switch to table mode and back to map mode
**Expected:** Map resizes correctly via ResizeObserver without gaps or overflow
**Why human:** Layout behavior requires visual confirmation

### Gaps Summary

No gaps found. All 8 success criteria from ROADMAP.md are verified at the code level:

- Mapbox GL JS v3 installed and renders with outdoors-v12 style
- Occurrence data flows from SQLite through features.ts into a clustered GeoJSON source
- Cluster and point layers use recency-based coloring via RECENCY_COLORS
- View state syncs to URL via moveend -> view-moved event -> bee-atlas _pushUrlState
- visibleIds filtering uses setData to partition features between main and ghost sources
- selectedOccIds highlighting uses setFilter on the selected-ring layer
- Token configured via VITE_MAPBOX_TOKEN env var (typed in env.d.ts, passed in deploy.yml)

The two intentional stubs (region-layer.ts no-ops, all-clicks-emit-empty) are explicitly deferred to Phase 72 per the plan and ROADMAP.md.

Status is `human_needed` because WebGL map rendering, cluster coloring, and filter visual feedback cannot be verified programmatically.

---

_Verified: 2026-04-27T00:35:00Z_
_Verifier: Claude (gsd-verifier)_
