---
phase: 100-map-filter-integration
plan: "01"
subsystem: filter-state, url-state, sqlite, manifest, pipeline
tags: [places, filter-state, url-state, sqlite, pipeline]
dependency_graph:
  requires: []
  provides:
    - FilterState.selectedPlace (consumed by 100-02 bee-filter-panel, 100-03 bee-atlas)
    - OccurrenceRow.place_slug (consumed by 100-02, 100-03)
    - OCCURRENCE_COLUMNS includes place_slug (consumed by all filter queries)
    - url-state place= encode/decode with D-01 implication (consumed by 100-03)
    - Manifest.places + Manifest.places_meta DataKey values (consumed by 100-02)
    - FilterChangedEvent.selectedPlace (consumed by 100-03)
  affects:
    - src/bee-atlas.ts (FilterState construction sites widened)
    - src/bee-map.ts (FilterState default widened)
    - src/bee-filter-controls.ts (FilterState construction site widened)
tech_stack:
  added: []
  patterns:
    - Single-quote doubling for SQL injection prevention (mirrors existing county/ecoregion pattern)
    - D-01 implication: place= in URL forces boundaryMode='places' in parseParams
key_files:
  created:
    - src/tests/filter.test.ts (place filter describe block — 5 new tests)
    - src/tests/url-state.test.ts (place filter param describe block — 6 new tests)
  modified:
    - src/filter.ts
    - src/sqlite.ts
    - src/bee-sidebar.ts
    - src/bee-atlas.ts
    - src/bee-map.ts
    - src/bee-filter-controls.ts
    - src/url-state.ts
    - src/manifest.ts
    - data/nightly.sh
decisions:
  - selectedPlace stored as singular string | null per D-07; multi-place deferred to PRICH-02
  - place= in URL forces boundaryMode='places' regardless of bm= value (D-01/D-09)
  - _boundaryMode in bee-atlas.ts widened to include 'places' as part of Task 2 typecheck sweep
metrics:
  duration: ~5 minutes
  completed: "2026-05-18"
  tasks_completed: 3
  files_changed: 9
---

# Phase 100 Plan 01: Data Plumbing for Place Filter Summary

Wire the selectedPlace / place_slug contracts that Plans 02 and 03 build against.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend FilterState, OccurrenceRow, SQLite schema, FilterChangedEvent | 5fc68d5 | filter.ts, sqlite.ts, bee-sidebar.ts, bee-atlas.ts, bee-map.ts, bee-filter-controls.ts, filter.test.ts |
| 2 | Extend url-state with place= encoding/parsing and D-01 implication | c10cceb | url-state.ts, url-state.test.ts, bee-atlas.ts |
| 3 | Extend Manifest interface and nightly.sh for places.geojson/places.json | 91ab622 | manifest.ts, nightly.sh |

## Changes by File

### src/filter.ts
- Added `selectedPlace: string | null` as final field of `FilterState` (D-07)
- Added `place_slug: string | null` to `OccurrenceRow` after `ecoregion_l3`
- Added `'place_slug'` to `OCCURRENCE_COLUMNS` after `'ecoregion_l3'`
- Extended `isFilterActive` with `|| f.selectedPlace !== null`
- Added place filter branch in `buildFilterSQL`: single-quote doubling via `replace(/'/g, "''")` + `place_slug = '${escaped}'` clause (T-100-01 mitigation)

### src/sqlite.ts
- Added `place_slug TEXT` as final column in `CREATE TABLE occurrences`

### src/bee-sidebar.ts
- Added `selectedPlace: string | null` as final field of `FilterChangedEvent` interface

### src/bee-atlas.ts
- Updated `_filterState` initializer literal (line 18) with `selectedPlace: null`
- Updated `initFilter` restoration literal (line 249) with `selectedPlace: initFilter.selectedPlace ?? null`
- Updated `parsed.filter` restoration literal (line 535) with `selectedPlace: parsed.filter?.selectedPlace ?? null`
- Updated `_onFilterChanged` literal (line 738) with `selectedPlace: detail.selectedPlace ?? null`
- Widened `_boundaryMode` type to `'off' | 'counties' | 'ecoregions' | 'places'`

### src/bee-map.ts
- Updated `filterState` default property initializer with `selectedPlace: null`

### src/bee-filter-controls.ts
- Updated `tokensToFilterState` initializer literal with `selectedPlace: null`

### src/url-state.ts
- Widened `UiState.boundaryMode` union to include `'places'`
- Added `params.set('place', filter.selectedPlace)` in `buildParams` when selectedPlace is non-null
- Added `const selectedPlace = p.get('place') ?? null` in `parseParams`
- Added `selectedPlace !== null` to `hasFilter` OR-chain
- Added `selectedPlace` to `result.filter` literal
- Implemented D-01/D-09 implication: `const placeImplied = selectedPlace !== null && selectedPlace !== ''`; when true, `boundaryMode = 'places'` regardless of `bm=`

### src/manifest.ts
- Added `places: string` and `places_meta: string` to `Manifest` interface
- `DataKey` union automatically includes both via `keyof Omit<Manifest, 'generated_at'>`
- `resolveDataUrl('places')` and `resolveDataUrl('places_meta')` are now valid call signatures

### data/nightly.sh
- Added `places_name=$(_upload_hashed "$EXPORT_DIR/places.geojson" "places" --content-type application/json)`
- Added `places_meta_name=$(_upload_hashed "$EXPORT_DIR/places.json" "places_meta" --content-type application/json)`
- Added `"places": "$places_name"` and `"places_meta": "$places_meta_name"` to manifest.json HEREDOC

## Test Count Delta

- `src/tests/filter.test.ts`: +5 tests (place filter describe block) → 46 total (41 → 46)
- `src/tests/url-state.test.ts`: +6 tests (place filter param describe block) → 74 total (68 → 74)

## FilterState Construction Sites Found During Typecheck Sweep

All sites updated with `selectedPlace: null`:
1. `src/bee-atlas.ts` line 18 — `_filterState` initializer
2. `src/bee-atlas.ts` line 249 — `initFilter` URL restoration
3. `src/bee-atlas.ts` line 535 — `parsed.filter` URL restoration (popstate)
4. `src/bee-atlas.ts` line 738 — `_onFilterChanged` from FilterChangedEvent
5. `src/bee-map.ts` line 48 — `filterState` property default
6. `src/bee-filter-controls.ts` line 39 — `tokensToFilterState` initializer
7. `src/tests/filter.test.ts` line 16 — `emptyFilter()` helper
8. `src/tests/filter.test.ts` line 103 — `combined filters` FilterState literal
9. `src/tests/url-state.test.ts` line 6 — `emptyFilter()` helper
10. `src/tests/url-state.test.ts` line 173 — `combined round-trip` FilterState literal

## FilterChangedEvent in bee-sidebar.ts

`selectedPlace: string | null` added as final field. Plan 03 (`bee-atlas._onFilterChanged`) reads `detail.selectedPlace` — the field is present in the event payload contract.

## Manifest Interface Keys Added

- `places` — resolves to content-hashed `places.geojson` URL in production
- `places_meta` — resolves to content-hashed `places.json` URL in production

## Deviations from Plan

None — plan executed exactly as written. One additional file (`src/bee-filter-controls.ts`) was discovered during the typecheck sweep and updated; this was anticipated in the plan's action description.

## Known Stubs

None — this plan establishes type contracts and SQL plumbing. No UI rendering or data fetching is wired yet; that is Wave 2 (Plan 02).

## Threat Flags

None. The T-100-01 mitigation (single-quote doubling in `buildFilterSQL`) was applied as specified. No new network endpoints or auth paths introduced.

## Self-Check: PASSED

Files verified:
- src/filter.ts — exists, contains selectedPlace in FilterState, place_slug in OccurrenceRow and OCCURRENCE_COLUMNS, place filter clause in buildFilterSQL
- src/sqlite.ts — exists, CREATE TABLE includes place_slug TEXT
- src/bee-sidebar.ts — exists, FilterChangedEvent contains selectedPlace
- src/url-state.ts — exists, UiState.boundaryMode includes 'places', buildParams emits place=, parseParams implements placeImplied
- src/manifest.ts — exists, Manifest interface contains places and places_meta
- data/nightly.sh — exists, places_name and places_meta_name hash calls present, manifest HEREDOC updated

Commits verified:
- 5fc68d5 — Task 1
- c10cceb — Task 2
- 91ab622 — Task 3
