---
phase: 54-sidebar-cleanup
plan: "01"
subsystem: frontend
tags: [sidebar, cleanup, lit, state]
dependency_graph:
  requires: []
  provides: [detail-only-sidebar, sidebar-open-state]
  affects: [bee-atlas, bee-sidebar]
tech_stack:
  added: []
  patterns: [conditional-render, custom-event-close]
key_files:
  created: []
  modified:
    - frontend/src/bee-atlas.ts
    - frontend/src/bee-sidebar.ts
    - frontend/src/tests/bee-sidebar.test.ts
    - frontend/src/tests/bee-atlas.test.ts
decisions:
  - Kept FilteredSummary export in bee-sidebar.ts because bee-map.ts still imports and emits it
  - Removed _panTo state and .panTo bee-map binding since _onSampleEventClick was its only setter
metrics:
  duration: "~2 minutes"
  completed: 2026-04-13
  tasks_completed: 3
  files_modified: 4
---

# Phase 54 Plan 01: Sidebar Cleanup Summary

**One-liner:** Sidebar stripped to detail-only panel with close button; hidden by default, shown on map click, dismissed via X button.

## What Was Built

- `_sidebarOpen: boolean` state added to `BeeAtlas`; sidebar conditionally rendered with `${this._sidebarOpen ? html\`<bee-sidebar ...>\` : ''}`
- `bee-sidebar` reduced from ~440 lines to ~130 lines: removed layer toggle, view toggle, summary stats, recent collections, feeds section
- Close button (`&times;`) added to sidebar header; dispatches `close` CustomEvent upward; `bee-atlas._onClose` sets `_sidebarOpen = false`
- Sidebar opens on `_onSpecimenClick` and `_onSampleClick`; closes on `_onClose` and `_onLayerChanged`
- URL state restoration: `_onPopState` sets `_sidebarOpen = true` when `occIds.length > 0`

## Removed from bee-atlas.ts

- `_activeFeedEntries`, `_feedIndex`, `_computeActiveFeedEntries()`, `feeds/index.json` fetch (D-08)
- `_filteredSummary`, `_onFilteredSummaryComputed`, `queryFilteredCounts` usage (D-04)
- `_recentSampleEvents`, `_sampleDataLoaded`, `_onSampleDataLoaded` (D-05)
- `_panTo`, `_onSampleEventClick` (only setter was `_onSampleEventClick`)
- `FeedEntry`, `FilteredSummary` imports; `sample-data-loaded`, `filtered-summary-computed`, `sample-event-click` event listeners

## Removed from bee-sidebar.ts

- Methods: `_renderToggle`, `_renderViewToggle`, `_renderSummary`, `_renderRecentSampleEvents`, `_renderFeedsSection`, `_onToggleLayer`, `_onToggleView`, `_onSampleEventRowClick`, `_formatSampleDate`
- Properties: `summary`, `filteredSummary`, `layerMode`, `viewMode`, `recentSampleEvents`, `sampleDataLoaded`, `activeFeedEntries`
- Export: `FeedEntry` interface removed (no other file uses it)
- Kept: `FilteredSummary` export (still imported by `bee-map.ts`)
- All related CSS for removed sections

## Tests Updated

- `bee-sidebar.test.ts`: Removed `DISC-04` (feed discovery) and `VIEW-01` (view toggle) describe blocks; added `SIDE-01/SIDE-02` block with 11 new assertions
- `bee-atlas.test.ts`: Replaced `DISC-02` (feed index tests) with `SIDE-01` (sidebar visibility tests); removed stale VIEW-02 assertions for `viewMode`/`activeFeedEntries` pass-through

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] bee-map.ts still imports FilteredSummary**
- **Found during:** Task 2 verification (tsc)
- **Issue:** `bee-map.ts` imports `FilteredSummary` from `bee-sidebar.ts` for its `filtered-summary-computed` event. Removing it would break compilation.
- **Fix:** Kept `FilteredSummary` exported from `bee-sidebar.ts` (the event is emitted by bee-map but no longer consumed by bee-atlas — harmless)
- **Files modified:** `frontend/src/bee-sidebar.ts`

**2. [Rule 1 - Bug] _panTo binding referenced removed state**
- **Found during:** Task 1 verification (tsc line 166)
- **Issue:** `.panTo=${this._panTo}` remained in bee-map binding after `_panTo` state was removed
- **Fix:** Removed `.panTo` binding from bee-map render (confirmed `_onSampleEventClick` was its only setter)
- **Files modified:** `frontend/src/bee-atlas.ts`

**3. [Rule 1 - Bug] bee-atlas.test.ts DISC-02 tests broke after feed removal**
- **Found during:** Task 3 test run
- **Issue:** Pre-existing `DISC-02` describe block in `bee-atlas.test.ts` asserted feed-related code that was removed in Task 1. `VIEW-02` tests asserted `viewMode`/`activeFeedEntries` pass-through to sidebar, also removed.
- **Fix:** Replaced `DISC-02` with `SIDE-01` assertions for sidebar visibility. Removed the stale VIEW-02 test assertions.
- **Files modified:** `frontend/src/tests/bee-atlas.test.ts`

## Known Stubs

None — sidebar renders full detail panels from `bee-specimen-detail` and `bee-sample-detail`.

## Pre-existing Test Failures (not caused by this plan)

- `bee-table.test.ts` TABLE-01 and TABLE-08 (3 failures): unrelated to sidebar changes, were failing before this plan executed

## Self-Check

- [x] `frontend/src/bee-atlas.ts` — modified and committed (ec185f4)
- [x] `frontend/src/bee-sidebar.ts` — modified and committed (acafa7e)
- [x] `frontend/src/tests/bee-sidebar.test.ts` — modified and committed (124cd16)
- [x] `frontend/src/tests/bee-atlas.test.ts` — modified and committed (124cd16)
- [x] All acceptance criteria verified (24/24 PASS)
- [x] TypeScript compiles with no new errors in bee-atlas.ts / bee-sidebar.ts

## Self-Check: PASSED
