---
phase: 36-bee-atlas-root-component
plan: "04"
subsystem: frontend
tags: [gap-closure, filter, url-restore, ux]
dependency_graph:
  requires: []
  provides: [early-filter-init-on-url-restore]
  affects: [frontend/src/bee-atlas.ts]
tech_stack:
  added: []
  patterns: [empty-set-sentinel-for-filter-pending, parallel-async-init]
key_files:
  created: []
  modified:
    - frontend/src/bee-atlas.ts
decisions:
  - "Empty Set (not null) used as filter-pending sentinel in firstUpdated — fails safe by hiding all dots while query resolves"
  - "_runFilterQuery started in parallel with DuckDB init — queryVisibleIds awaits tablesReady internally, safe to call early"
  - "No changes to style.ts needed — makeClusterStyleFn already treats empty Set as hide-all (matchCount=0 for all features)"
metrics:
  duration: 8m
  completed: "2026-04-06"
  tasks_completed: 1
  files_modified: 1
requirements: [ARCH-02]
---

# Phase 36 Plan 04: Early Filter Init on URL Restore Summary

Initialized visible ID sets to empty Sets (not null) in firstUpdated when a URL restores an active filter, eliminating the flash of all specimens before the async filter query completes.

## What Was Built

When `bee-atlas` component initializes from a URL with an active filter:

1. After restoring `_filterState` from URL params, if `isFilterActive()` is true, `_visibleEcdysisIds` and `_visibleSampleIds` are immediately set to `new Set()` instead of remaining `null`.
2. `_runFilterQuery()` is started immediately in `firstUpdated()` — in parallel with DuckDB init — since `queryVisibleIds` internally awaits `tablesReady`, making it safe to kick off early.

The `null` sentinel in `makeClusterStyleFn` means "show all" (no filter). An empty `Set` means "filter is active, nothing matches yet." Since the style function checks `activeEcdysisIds !== null` to determine `hasFilter`, an empty Set correctly ghosts all clusters and dots during the query window.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Initialize visible ID sets to empty Set when URL has active filter | cc77ec8 | frontend/src/bee-atlas.ts |

## Deviations from Plan

None — plan executed exactly as written. The plan noted that `style.ts` might need changes, but the existing `makeClusterStyleFn` already handles empty Set correctly as a hide-all sentinel without modification.

## Known Stubs

None.

## Threat Flags

None. This change only affects initialization order of internal state with no new trust boundaries.

## Self-Check: PASSED

- frontend/src/bee-atlas.ts modified: FOUND (lines 192-203)
- Commit cc77ec8: FOUND
- Build: passed (tsc + vite, 0 errors)
- Tests: 61/61 passed
