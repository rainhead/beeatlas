---
phase: 64-occurrencesource
plan: "02"
subsystem: frontend/map-layer
tags: [occurrences, cluster, url-state, selection, refactor]
dependency_graph:
  requires: [64-01]
  provides: [unified-map-layer, cluster-click-handler, spatial-cluster-restore]
  affects: [frontend/src/bee-map.ts, frontend/src/bee-atlas.ts]
tech_stack:
  added: []
  patterns: [haversine-radius, discriminated-union, spatial-bounding-box, unified-event]
key_files:
  created: []
  modified:
    - frontend/src/bee-map.ts
    - frontend/src/bee-atlas.ts
decisions:
  - "Single OccurrenceSource->Cluster->VectorLayer stack replaces two separate source/layer pairs"
  - "Cluster distance tightened from 40px to 20px (D-02) for more precise click targets"
  - "Haversine centroid+maxRadius computed at click time in bee-map for URL-encodable cluster selection"
  - "data-loaded event consolidated to include recentEvents, eliminating sample-data-loaded"
  - "SQL bounding box pre-filter + haversine post-filter for cluster restore balances query simplicity with geometric precision"
  - "_selectedCluster state field added to bee-atlas to track cluster selections independently of _selectedOccIds"
metrics:
  duration: "~20 minutes"
  completed_date: "2026-04-17"
  tasks_completed: 2
  files_changed: 2
---

# Phase 64 Plan 02: bee-map/bee-atlas Wire-Up Summary

Single OccurrenceSource->Cluster->VectorLayer in bee-map with haversine centroid+radius computation for cluster clicks, and bee-atlas handling SelectionState discriminated union throughout with spatial cluster restore via bounding-box SQL + haversine post-filter.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | bee-map single source/layer/click handler | 69caf8e | frontend/src/bee-map.ts |
| 2 | bee-atlas SelectionState handling, spatial restore | 9ce4c70 | frontend/src/bee-atlas.ts |

## What Was Built

**bee-map.ts:** `EcdysisSource` and `SampleSource` replaced by single `OccurrenceSource`. `specimenLayer` and `sampleLayer` replaced by single `occurrenceLayer` backed by a `Cluster` source with `distance: 20` (tightened from 40, D-02). Three helper functions added: `clusterCentroid`, `haversineMetres`, `maxRadiusMetres`.

Unified click handler on the single `occurrenceLayer`:
- Filters visible features to `visibleEcdysisIds` when active
- For single-feature clicks: emits `map-click-occurrence` with `occIds` only
- For multi-feature clusters: computes centroid + maxRadius in metres, emits `map-click-occurrence` with `centroid` and `radiusM`
- `specimenFeatures` (ecdysis:-prefixed) separated from `occIds` before `buildSamples` call (Pitfall 3 guard from RESEARCH)

`data-loaded` event consolidated: fires once with `{ summary, taxaOptions, recentEvents }`. The separate `sample-data-loaded` event is eliminated. `_buildRecentSampleEvents` updated to use `occurrenceSource.getFeatures().filter(f => f.getId().startsWith('inat:'))`.

`layerMode` visibility gating removed (D-09) — no `setVisible` calls based on `layerMode`.

**bee-atlas.ts:** Added `_selectedCluster` state field. `_onSpecimenClick` and `_onSampleClick` replaced by `_onOccurrenceClick` which populates `_selectedCluster` when `centroid` + `radiusM` are present. `@map-click-specimen` / `@map-click-sample` / `@sample-data-loaded` listeners removed from render template.

SelectionState discriminated union handled in all paths:
- `firstUpdated`: restores `type:'ids'` or `type:'cluster'` from parsed URL
- `_onPopState`: handles all three cases (ids, cluster, empty)
- `_pushUrlState`: encodes `_selectedCluster` as `type:'cluster'` variant

`_restoreClusterSelection` added: awaits `tablesReady`, queries `occurrences` with equirectangular bounding box pre-filter (degPerMetre approximation), then post-filters with haversine for geometric precision. Builds `_selectedOccIds` and `_selectedSamples` from results.

`_selectedCluster = null` added to all selection-clearing sites: `_onClose`, `_onMapClickEmpty`, `_onFilterChanged`, `_onLayerChanged`.

## Verification

- `npx tsc --noEmit`: clean (0 errors)
- `npm test -- --run`: 175 tests, 7 test files, all passing
- All acceptance criteria verified via grep checks

## Deviations from Plan

**[Rule 1 - Bug] Unused SelectionState type import causes TypeScript error**

- **Found during:** Task 2 post-edit TypeScript check
- **Issue:** Plan specified `import { buildParams, parseParams, type SelectionState }` but `SelectionState` was not referenced by name in the code (only used structurally via discriminated union narrowing). TypeScript reported TS6133 unused import error.
- **Fix:** Removed the explicit `type SelectionState` from the import — the discriminated union shape is used directly without naming the type.
- **Files modified:** frontend/src/bee-atlas.ts
- **Commit:** 9ce4c70

## Threat Model Coverage

| Threat ID | Status |
|-----------|--------|
| T-64-04 | Mitigated — lat/lon/radiusM are floats from parseParams (range-validated in Plan 01); SQL uses numeric interpolation not string concatenation |
| T-64-05 | Mitigated — radiusM capped at 100000 in parseParams; bounding box pre-filter limits row scan |
| T-64-06 | Accepted — centroid/radius computed from feature geometries loaded from application's own SQLite |

## Self-Check: PASSED

- `frontend/src/bee-map.ts` exists and contains `OccurrenceSource`
- `frontend/src/bee-atlas.ts` exists and contains `_restoreClusterSelection`
- Commits 69caf8e and 9ce4c70 exist in git log
- 175 tests pass, TypeScript clean
