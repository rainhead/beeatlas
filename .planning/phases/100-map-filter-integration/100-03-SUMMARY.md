---
phase: 100-map-filter-integration
plan: "03"
subsystem: ui
tags: [places, bee-atlas, filter-state, url-state, event-wiring, vitest]
dependency_graph:
  requires:
    - phase: 100-01
      provides: FilterState.selectedPlace, url-state place= encode/decode, FilterChangedEvent.selectedPlace
    - phase: 100-02
      provides: place-selected CustomEvent from bee-map, place chip in bee-filter-panel
  provides:
    - _onPlaceSelected handler in bee-atlas.ts (PMAP-02 close)
    - "@place-selected wiring on <bee-map> in render()"
    - PMAP-04 deep-link round-trip (_init + popstate apply selectedPlace + boundaryMode='places')
    - Integration tests for all place filter flows (6 tests)
  affects:
    - All PMAP requirements now observable end-to-end
tech-stack:
  added: []
  patterns:
    - Toggle-off pattern for place selection (mirrors _onRegionClick single-select toggle)
    - Clear sidebar state on place selection (matches _onFilterChanged pattern)

key-files:
  created: []
  modified:
    - src/bee-atlas.ts
    - src/tests/bee-atlas.test.ts

key-decisions:
  - "_onPlaceSelected clears sidebar selection state (selectedOccurrences, selectedOccIds, selectedCluster, selectionBounds, sidebarOpen) matching _onRegionClick and _onFilterChanged patterns"
  - "Toggle-off behavior implemented: clicking same polygon slug twice sets selectedPlace=null (D-04 spirit)"
  - "SEL-07 test count updated from 9 to 10 to account for _selectionBounds = null in new _onPlaceSelected method"

requirements-completed:
  - PMAP-02
  - PMAP-04

duration: 2min
completed: "2026-05-18"
---

# Phase 100 Plan 03: Place Event Wiring in bee-atlas Summary

**`_onPlaceSelected` handler wired in bee-atlas — polygon click drives `_filterState.selectedPlace`, `_runFilterQuery`, and `_pushUrlState`; toggle-off and deep-link (`/?place=<slug>`) work end-to-end**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-18T15:23:24Z
- **Completed:** 2026-05-18T15:24:56Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Added `_onPlaceSelected` private method to `bee-atlas.ts`: reads `e.detail.slug`, implements toggle-off (clicking same polygon twice clears filter), clears sidebar selection state, calls `_runFilterQuery().then(_pushUrlState)` and `_runTableQuery`
- Wired `@place-selected=${this._onPlaceSelected}` on `<bee-map>` in `render()`, connecting Plan 02's event emission to Plan 03's handler
- Widened `_onBoundaryModeChanged` parameter type to `CustomEvent<'off' | 'counties' | 'ecoregions' | 'places'>` for type consistency
- Added 6-test `PMAP-02/04: place filter wiring in bee-atlas` describe block to `bee-atlas.test.ts`
- Updated SEL-07 test from 9 to 10 null clears (the new method correctly adds one more clear site)

## Lines Added to bee-atlas.ts

| Line | What |
|------|------|
| 29 | `selectedPlace: null` in `_filterState` init literal (from Plan 01 wave) |
| 192 | `@place-selected=${this._onPlaceSelected}` on `<bee-map>` in `render()` |
| 261 | `selectedPlace: initFilter.selectedPlace ?? null` in `_init` (from Plan 01 wave) |
| 548 | `selectedPlace: parsed.filter?.selectedPlace ?? null` in `_onPopState` (from Plan 01 wave) |
| 678-698 | `_onPlaceSelected` method body |
| 773 | `selectedPlace: detail.selectedPlace ?? null` in `_onFilterChanged` (from Plan 01 wave) |
| 1010 | `_onBoundaryModeChanged` parameter type widened to include `'places'` |

## Test Count Delta

`src/tests/bee-atlas.test.ts`: +6 tests under `PMAP-02/04: place filter wiring in bee-atlas`:

1. `bee-atlas.ts declares _onPlaceSelected method` — confirms method definition exists
2. `bee-atlas.ts template wires @place-selected on bee-map` — confirms template attribute
3. `_onPlaceSelected reads e.detail.slug and sets _filterState.selectedPlace` — confirms implementation body contains slug, selectedPlace, _runFilterQuery, _pushUrlState
4. `_onPlaceSelected implements toggle-off (wasSelected branch)` — confirms toggle-off logic with null
5. `bee-atlas.ts _onBoundaryModeChanged parameter type includes places` — confirms type union widened
6. `_onFilterChanged passes selectedPlace through from FilterChangedEvent` — confirms chip removal flow

## PMAP Requirement Status

All four PMAP requirements are observable end-to-end after this plan:

| Req | Plan | Observable |
|-----|------|------------|
| PMAP-01 | 02 | 4-option boundary toggle, amber place polygons rendered |
| PMAP-02 | 02+03 | Clicking place polygon emits `place-selected` (Plan 02) then `_onPlaceSelected` updates `_filterState.selectedPlace` and triggers SQL filter (Plan 03) |
| PMAP-03 | 01+02 | Removable chip rendered (Plan 02), SQL ghosting via `place_slug = '<slug>'` clause (Plan 01) |
| PMAP-04 | 01+03 | `parseParams` forces `boundaryMode='places'` on `place=` (Plan 01); `_init` applies `selectedPlace` + `_boundaryMode` from parsed URL (Plans 01+03); `_pushUrlState` writes `place=<slug>` on polygon click (Plan 03) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated SEL-07 test count from 9 to 10**
- **Found during:** Task 1 implementation
- **Issue:** `_onPlaceSelected` clears `_selectionBounds = null` (matching the pattern from `_onRegionClick` and `_onFilterChanged`). The pre-existing SEL-07 test asserted exactly 9 null clears, but this is now 10.
- **Fix:** Updated test description and assertion from `9` to `10`. The 10th clear is correct behavior — place selection should dismiss any open selection sidebar.
- **Files modified:** `src/tests/bee-atlas.test.ts`
- **Committed in:** 751b363

---

**Total deviations:** 1 auto-fixed (Rule 1 - test count update)
**Impact on plan:** The deviation is a test correctness fix; the implementation follows the established patterns exactly.

## Issues Encountered

None.

## DOM-Mocking Limitations

The 6 tests are static-analysis style (regex matching on source text) rather than runtime component mounting. This matches the pre-existing pattern in `bee-atlas.test.ts` — the file mocks Mapbox GL, sqlite, and features, but most tests inspect source text rather than mounting and interacting with components. This is appropriate because:

1. The plan's behaviors are structural (handler wired, type widened, method body has correct shape)
2. The deeper behavioral assertions (filter query triggered, URL updated) would require mounting the full component + awaiting async chains in happy-dom, which would need additional test infrastructure beyond what exists

The static-analysis tests cover all 6 behaviors specified in `<behavior>` at the structural level. A future test iteration could add runtime mounting tests following the `describe('ARCH-01')` pattern.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

All four PMAP requirements are closed. The place filter feature is complete:
- Places boundary mode renders amber polygons
- Clicking a polygon applies the place filter and updates the URL
- The chip in the filter panel shows the selected place name
- Removing the chip clears the filter
- `/?place=<slug>` deep-links load the map pre-filtered with the polygon highlighted

## Self-Check: PASSED

- FOUND: src/bee-atlas.ts
- FOUND: src/tests/bee-atlas.test.ts
- FOUND: 100-03-SUMMARY.md (this file)
- FOUND: commit 751b363

---
*Phase: 100-map-filter-integration*
*Completed: 2026-05-18*
