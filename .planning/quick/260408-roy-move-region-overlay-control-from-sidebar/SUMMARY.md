---
phase: quick
plan: 260408-roy
subsystem: frontend/ui
tags: [ui, bee-map, bee-sidebar, region-overlay, refactor]
dependency_graph:
  requires: []
  provides: [floating-region-overlay-button]
  affects: [bee-map, bee-sidebar, bee-filter-controls, bee-atlas]
tech_stack:
  added: []
  patterns: [lit-element-event-delegation, map-overlay-control]
key_files:
  created: []
  modified:
    - frontend/src/bee-map.ts
    - frontend/src/bee-filter-controls.ts
    - frontend/src/bee-sidebar.ts
    - frontend/src/bee-atlas.ts
decisions:
  - bee-map emits dedicated boundary-mode-changed event (not bundled in filter-changed)
  - Region menu closes on map canvas click via mapElement click listener
  - Menu positioned bottom-left above OL attribution control
metrics:
  duration: ~10min
  completed: 2026-04-08
---

# Quick Task 260408-roy: Move Region Overlay Control from Sidebar Summary

**One-liner:** Floating layers button in bee-map shadow DOM emits `boundary-mode-changed` events; `boundaryMode` fully removed from sidebar/filter-controls plumbing.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Remove boundary toggle from bee-filter-controls and clean up boundaryMode plumbing | c298280 | bee-filter-controls.ts, bee-sidebar.ts, bee-atlas.ts |
| 2 | Add floating region overlay button and popover menu to bee-map | e6d1281 | bee-map.ts, bee-atlas.ts |
| 3 | Human verification checkpoint | skipped | — |

## Task 3 Note

The human-verify checkpoint (Task 3) was skipped per execution constraints. Manual review is required to confirm:
- The Off/Counties/Ecoregions toggle is gone from the sidebar
- A "Regions" floating button appears at bottom-left of the map
- Clicking opens a popover menu; selecting an option updates the boundary layer and closes the menu
- Boundary mode persists in URL and restores on reload
- Clicking map regions to filter by county/ecoregion still works

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

- `npx tsc --noEmit`: passed
- `npm run build`: passed (486 modules, no errors)
- No references to `boundaryMode` remain in `bee-filter-controls.ts` or `bee-sidebar.ts`
- `bee-map.ts` contains the new `region-control` overlay
- `bee-atlas.ts` handles `boundary-mode-changed` event via `_onBoundaryModeChanged`

## Self-Check: PASSED

Files exist:
- frontend/src/bee-map.ts: FOUND
- frontend/src/bee-atlas.ts: FOUND
- frontend/src/bee-filter-controls.ts: FOUND
- frontend/src/bee-sidebar.ts: FOUND

Commits exist:
- c298280: FOUND
- e6d1281: FOUND
