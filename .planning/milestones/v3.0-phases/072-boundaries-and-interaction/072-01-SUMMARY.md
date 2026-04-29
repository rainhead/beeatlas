---
phase: 072-boundaries-and-interaction
plan: 01
subsystem: ui
tags: [mapbox-gl, geojson, boundaries, click-interaction, feature-state]

# Dependency graph
requires:
  - phase: 071-base-map-and-occurrence-layer
    plan: 02
    provides: bee-map.ts Mapbox rewrite with clustered source, ghost source, selection ring
provides:
  - Boundary GeoJSON sources (counties, ecoregions) with generateId for feature-state
  - Fill+line layers for both boundary types with selection-aware paint expressions
  - Boundary visibility toggle via _applyBoundaryMode
  - Feature-state selection highlighting via _applyBoundarySelection
  - Full click interaction chain (cluster, point, region, empty) using addInteraction API
  - Cluster click queries all leaves and emits occurrence list (D-01 implementation)
  - featureToOccurrenceRow and haversineMetres helper functions
affects: [072-02]

# Tech tracking
tech-stack:
  added: []
  patterns: [Mapbox addInteraction with preventDefault for click priority chain, feature-state with generateId for polygon highlighting, _clickConsumed flag pattern for robust empty-click fallback]

key-files:
  created: []
  modified: [frontend/src/bee-map.ts]

key-decisions:
  - "Used _clickConsumed flag pattern to robustly handle addInteraction preventDefault propagation to generic map.on('click') -- harmless if preventDefault already blocks generic listeners, essential if it doesn't"
  - "Boundary layers render BELOW occurrence layers (ecoregion-fill, ecoregion-line, county-fill, county-line, then ghost-points, clusters, etc.) so dots remain always clickable and visually prominent"
  - "Cast cluster_id and point_count as number from feature.properties to satisfy TypeScript strict typing for getClusterLeaves callback API"
  - "Non-null assertions on GeoJSON coordinate array indices (c[0]!, c[1]!) to satisfy TypeScript -- Point coordinates always have at least 2 elements"

patterns-established:
  - "addInteraction with layer targets and preventDefault for multi-layer click routing -- replaces manual queryRenderedFeatures hit testing"
  - "feature-state with generateId for polygon selection -- setFeatureState toggles selected flag, paint expressions switch styles"
  - "ID-to-name maps (_countyIdMap, _ecoregionIdMap) built from GeoJSON feature array indices for feature-state lookup"
  - "_loadBoundaryData deferred fetch pattern -- called after data-loaded emit to avoid competing with occurrence data"

requirements-completed: []

# Metrics
duration: 3min
completed: 2026-04-27
---

# Phase 72 Plan 01: Boundary Sources/Layers, Click Interaction Chain, Feature-State Highlighting Summary

**County/ecoregion boundary layers with feature-state highlighting, full click interaction chain (cluster leaves, point, region, empty) using Mapbox addInteraction API**

## Changes

### Task 1: Boundary sources/layers, click interaction, feature-state highlighting

**Commit:** `0ccd103`

Added 322 lines to `frontend/src/bee-map.ts`:

**Boundary infrastructure:**
- Two GeoJSON sources (`counties`, `ecoregions`) with `generateId: true` for feature-state support
- Four layers: `ecoregion-fill`, `ecoregion-line`, `county-fill`, `county-line` -- all start hidden (`visibility: 'none'`)
- Paint expressions use `['feature-state', 'selected']` to switch between default (transparent fill, gray stroke) and highlighted (blue fill/stroke) styles
- `_loadBoundaryData()` fetches both GeoJSON files, builds ID-to-name maps, sets data on sources, then applies visibility and selection

**Visibility and highlighting:**
- `_applyBoundaryMode()` toggles `visibility` layout property based on `boundaryMode` property
- `_applyBoundarySelection()` clears all feature-state, then sets `selected: true` on features matching `filterState.selectedCounties` or `filterState.selectedEcoregions`
- `updated()` lifecycle calls both methods on `boundaryMode` change and `_applyBoundarySelection` on `filterState` change

**Click interaction chain:**
- `mousedown` handler resets `_clickConsumed` flag
- `addInteraction('click-cluster')` -- queries all cluster leaves via `getClusterLeaves`, filters to visible IDs, computes centroid and radius, emits `map-click-occurrence` (D-01: no zoom)
- `addInteraction('click-point')` -- builds OccurrenceRow from feature properties, emits `map-click-occurrence`
- `addInteraction('click-county')` -- extracts `NAME` property, emits `map-click-region` with name and shiftKey
- `addInteraction('click-ecoregion')` -- extracts `NA_L3NAME` property, emits `map-click-region`
- Generic `map.on('click')` fallback -- emits `map-click-empty` only if `_clickConsumed` is false

**Helper functions (module-level):**
- `featureToOccurrenceRow()` -- converts GeoJSON feature properties to OccurrenceRow using OCCURRENCE_COLUMNS
- `haversineMetres()` -- computes distance in metres between two WGS84 coordinates for cluster radius

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript strict type errors in cluster click handler**
- **Found during:** Task 1 verification (tsc --noEmit)
- **Issue:** `feature.properties?.cluster_id` typed as `string | number | boolean` but `getClusterLeaves` requires `number`; GeoJSON coordinate indices typed as `number | undefined`
- **Fix:** Added explicit `as number | undefined` cast for cluster_id and point_count; used non-null assertions (`c[0]!`, `c[1]!`) for coordinate array access
- **Files modified:** frontend/src/bee-map.ts
- **Commit:** 0ccd103

## Verification

- `npx tsc --noEmit` -- zero errors
- `npx vitest run` -- 162 tests passing (7 test files, 0 failures)
- region-layer.ts unchanged (stub retained for import compatibility)

## Self-Check: PASSED

- FOUND: frontend/src/bee-map.ts
- FOUND: commit 0ccd103
