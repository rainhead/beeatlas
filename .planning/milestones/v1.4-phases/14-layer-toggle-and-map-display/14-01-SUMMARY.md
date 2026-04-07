---
phase: 14-layer-toggle-and-map-display
plan: 01
subsystem: ui
tags: [openlayers, lit, parquet, layer-toggle, url-params]

# Dependency graph
requires:
  - phase: 13-parquet-sources-and-asset-pipeline
    provides: SampleParquetSource class and sampleDotStyle function in parquet.ts/style.ts
provides:
  - sampleLayer wired to OL map with exclusive visibility toggle
  - layerMode @state on BeeMap driving specimen vs sample display
  - lm= URL parameter for encoding and restoring active layer
  - _onLayerChanged, _buildRecentSampleEvents, _onSampleEventClick methods on BeeMap
  - recentSampleEvents populated from sampleSource on load
  - Mode-gated singleclick handler (specimens branch vs samples placeholder)
affects:
  - 14-02 (bee-sidebar.ts gets .layerMode and .recentSampleEvents props, dispatches layer-changed event)
  - phase-15 (sample detail sidebar will replace placeholder singleclick handler)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "sampleLayer.setVisible(false) as default — exclusive toggle via setVisible(bool) not layer removal"
    - "URL param omit-default pattern: lm= only written when not 'specimens' (default omitted)"
    - "Restore layer mode in firstUpdated() directly (not via _onLayerChanged) to avoid _pushUrlState before map ready"
    - "_onPopState calls _onLayerChanged when layerMode differs, enabling back/forward navigation across layer switches"

key-files:
  created: []
  modified:
    - frontend/src/bee-map.ts

key-decisions:
  - "Tasks 1 and 2 committed together because TypeScript noUnusedLocals requires render() wiring (Task 2) for Task 1's private methods and @state to compile cleanly"

patterns-established:
  - "Layer toggle uses setVisible(bool) on module-level layer constants — no architectural changes needed"
  - "filterState survives layer toggle round-trips — filter controls hidden by bee-sidebar but state preserved"

requirements-completed: [MAP-03, MAP-04]

# Metrics
duration: 3min
completed: 2026-03-13
---

# Phase 14 Plan 01: Layer Toggle and Map Display (bee-map.ts) Summary

**sampleLayer wired to OL map with exclusive visibility toggle, layerMode @state, lm= URL param encode/restore, and mode-gated singleclick handler in bee-map.ts**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-13T03:39:53Z
- **Completed:** 2026-03-13T03:42:43Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- sampleSource and sampleLayer added as module-level constants using SampleParquetSource and sampleDotStyle from Phase 13
- Exclusive layer toggle: sampleLayer starts hidden; _onLayerChanged toggles setVisible() on both layers, clears sidebar state
- lm= URL parameter encodes active layer mode (omitted when default 'specimens'); parseUrlParams restores it; firstUpdated() and _onPopState both apply it
- recentSampleEvents populated from sampleSource on load (14-day window, recency-sorted)
- render() passes .layerMode, .recentSampleEvents, @layer-changed, and @sample-event-click to bee-sidebar

## Task Commits

Both tasks implemented and committed together (build requires render() wiring for unused-variable checks to pass):

1. **Task 1: Wire sampleLayer to map + add layerMode state and toggle handler** - `8e905ce` (feat)
2. **Task 2: Add lm= URL param and wire layerMode + events to bee-sidebar in render()** - `8e905ce` (feat)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified
- `frontend/src/bee-map.ts` - sampleLayer wiring, layerMode state, lm= URL param, mode-gated singleclick, render() event bindings

## Decisions Made
- Tasks 1 and 2 committed together: TypeScript's `noUnusedLocals` causes compile errors if _onLayerChanged, _onSampleEventClick, and recentSampleEvents are declared (Task 1) but not referenced in render() (Task 2). Combined into one clean commit.

## Deviations from Plan

None - plan executed exactly as written. Tasks 1 and 2 were combined into one commit for TypeScript build hygiene (not a deviation from functionality — all specified code was written as described).

## Issues Encountered
- TypeScript noUnusedLocals: Task 1's private methods and @state fields triggered TS6133 errors until Task 2's render() bindings were added. Resolved by completing both tasks before committing.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- bee-map.ts is fully wired for layer toggle; Plan 02 (bee-sidebar.ts) can now add the toggle UI, layerMode property, and recentSampleEvents display
- _onSampleEventClick animates map to sample coordinate — ready for Plan 02 to dispatch sample-event-click events
- Phase 15 placeholder in singleclick handler (sample branch) is ready for detail sidebar wiring

---
*Phase: 14-layer-toggle-and-map-display*
*Completed: 2026-03-13*
