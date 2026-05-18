---
phase: 100-map-filter-integration
plan: "02"
subsystem: map-ui
tags:
  - places
  - mapbox
  - bee-map
  - bee-filter-panel
  - boundary-mode
  - feature-state
dependency_graph:
  requires:
    - 100-01
  provides:
    - place-fill layer with amber styling
    - place-line layer with amber styling
    - place-selected CustomEvent from bee-map.ts
    - place filter chip in bee-filter-panel.ts
  affects:
    - src/bee-map.ts
    - src/bee-filter-panel.ts
tech_stack:
  added: []
  patterns:
    - Mapbox GeoJSON source with generateId for feature-state
    - Mapbox feature-state for selection highlight
    - Lit lazy fetch with requestUpdate for chip label resolution
key_files:
  created: []
  modified:
    - src/bee-map.ts
    - src/bee-filter-panel.ts
decisions:
  - Warm amber palette (rgba(220,130,30,...) / rgba(180,100,30,...)) for places — visually distinct from blue counties/ecoregions (D-06)
  - place-fill unselected fill is transparent (rgba(0,0,0,0)) — lines provide visual presence without obscuring occurrence dots
  - _ensurePlaceNamesLoaded is lazy and idempotent — only fetches on first chip render
  - Place chip fallback to slug while places.json is loading or on fetch error
metrics:
  duration: "~20 minutes"
  completed: "2026-05-18"
  tasks_completed: 2
  files_modified: 2
---

# Phase 100 Plan 02: Places Boundary Mode and Filter Chip Summary

Added the user-visible Places mode to the map (amber polygon layer, click-to-filter) and the removable place filter chip to the filter panel, wiring together the D-06 visual design, D-02/D-03 click priority, and D-05 selection highlight.

## Tasks Completed

### Task 1: Extend bee-map.ts with Places boundary mode

**Commit:** e782172

**Changes in bee-map.ts:**

1. **Line 41** — `boundaryMode` property type union extended to `'off' | 'counties' | 'ecoregions' | 'places'`

2. **Line 77** — `_placeIdMap: Map<number, string>` declaration added after `_ecoregionIdMap`

3. **Lines 163-166** — `render()` label ternary extended: `this.boundaryMode === 'ecoregions' ? 'Ecoregions' : 'Places'` (was a two-branch expression before)

4. **Lines 174** — `<button>Places</button>` added as fourth option in `.region-menu`, calling `_selectBoundary('places')`

5. **Lines 300-304** — `_selectBoundary` parameter type widened to include `'places'`; generic on `_emit` also widened

6. **Lines 403-407** — `'places'` GeoJSON source added with `generateId: true` alongside counties/ecoregions sources

7. **Line 413** — `placesVis` computation added alongside `countyVis`/`ecoVis`

8. **Lines 494-532** — `place-fill` layer (amber fill, feature-state selected expression, D-06) and `place-line` layer (amber stroke + width, feature-state selected expression, D-06) added after `county-line`

9. **Lines 738-748** — `click-place` interaction registered as priority 5 (after cluster=1, point=2, county=3, ecoregion=4), targeting `place-fill` layer (D-03 visibility gate), delegating to `_handlePlaceClick` (emits `place-selected`)

10. **Lines 990-1003** — `_loadBoundaryData` extended: `placesResp` added to `Promise.all`, `_placeIdMap` built from `placesData.features` mapping `(f,i) => [i, f.properties?.slug ?? '']`, `places` source `setData` called

11. **Lines 1009-1012** — `_applyBoundaryMode` extended: `placesVis` computed, `setLayoutProperty` called for `place-fill` and `place-line`

12. **Lines 1016-1035** — `_applyBoundarySelection` extended: `removeFeatureState({ source: 'places' })` in clear block; new `else if (this.boundaryMode === 'places')` branch iterates `_placeIdMap` and calls `setFeatureState` for matching slug (D-05)

13. **Lines 1118-1128** — `_handlePlaceClick` method added: reads `feature.properties?.['slug']`, emits `this._emit('place-selected', { slug })`

### Task 2: Extend bee-filter-panel.ts with place chip

**Commit:** 561ba16

**Changes in bee-filter-panel.ts:**

1. **Line 6** — `import { resolveDataUrl } from './manifest.ts'` added

2. **Lines 74-75** — `@state() private _selectedPlace: string | null = null` and `@state() private _placeNameBySlug: Map<string, string> = new Map()` added after `_selectedEcoregions`

3. **Lines 337-343** — `willUpdate` sync block added: syncs `_selectedPlace` from `filterState.selectedPlace`; calls `_ensurePlaceNamesLoaded()` on first non-null observation

4. **Line 376** — `selectedPlace: this._selectedPlace` added to `_emitFilter` FilterChangedEvent detail

5. **Lines 564-579** — `_removePlace()` method added (sets `_selectedPlace = null`, calls `_emitFilter`); `_ensurePlaceNamesLoaded()` async helper added (lazy fetch of `places.json`, builds `_placeNameBySlug` map, calls `requestUpdate()`, silently swallows errors)

6. **Lines 719** — `hasChips` condition extended: `|| this._selectedPlace !== null`

7. **Lines 737-744** — Place chip rendered conditionally when `_selectedPlace !== null`: label = `_placeNameBySlug.get(slug) ?? slug`, remove button aria-label = `"Remove ${displayName}"`, reuses `.chip` and `.chip-remove` CSS classes

## CSS Classes

No new CSS classes introduced. Place chip reuses `.chip` and `.chip-remove` exactly as county and ecoregion chips do.

## Build Verification

- `npx tsc --noEmit`: PASS (both tasks)
- `npm run build`: Not runnable in worktree — `public/data/species.json` is a pipeline-generated file absent from the worktree (pre-existing limitation, also present before Plan 02). Vite TypeScript compilation is validated by `tsc --noEmit`.
- `npm test`: 18/20 test files pass; 2 fail due to missing `species.json`/`seasonality.json` pipeline files (pre-existing worktree limitation, not a regression from Plan 02 changes).

## Bundle Size

`places.geojson` is fetched at runtime via `resolveDataUrl('places')` — not bundled. No bundle size delta from this plan.

## Deviations from Plan

None — plan executed exactly as written. All 12 action items for Task 1 and 7 action items for Task 2 applied as specified.

## Threat Surface Scan

No new threat surface introduced beyond what is already in the plan's threat model:
- `places.geojson` fetch is a new runtime network request (same domain, static file, already registered in Manifest from Plan 01)
- `places.json` lazy fetch in `bee-filter-panel` is a new runtime network request (same domain, static file, Manifest from Plan 01)
- Both fetches are to maintainer-controlled data files with no auth surface

## Self-Check: PASSED

- FOUND: src/bee-map.ts
- FOUND: src/bee-filter-panel.ts
- FOUND: 100-02-SUMMARY.md
- FOUND: commit e782172 (Task 1)
- FOUND: commit 561ba16 (Task 2)
- PASS: boundaryMode union includes 'places'
- PASS: Places button exists in menu render
- PASS: generateId:true on places source
- PASS: _handlePlaceClick method emits place-selected
- PASS: _selectedPlace state declared in bee-filter-panel.ts
- PASS: _removePlace method defined
- PASS: selectedPlace included in _emitFilter detail
