---
phase: 45-sidebar-feed-discovery
plan: "01"
subsystem: frontend
tags: [feed-index, bee-atlas, data-layer, tdd]
dependency_graph:
  requires: []
  provides: [FeedEntry interface, _feedIndex Map, _activeFeedEntries @state, _computeActiveFeedEntries method]
  affects: [frontend/src/bee-atlas.ts, frontend/src/bee-sidebar.ts]
tech_stack:
  added: []
  patterns: [fetch + silent catch for optional static JSON, Map keyed by filter_value]
key_files:
  created: []
  modified:
    - frontend/src/bee-atlas.ts
    - frontend/src/tests/bee-atlas.test.ts
decisions:
  - "Use c.recordedBy (not c.displayName) as the Map key to match filter_value in index.json — iNat-only collectors (recordedBy=null) are skipped as they have no ecdysis feed"
  - "Silent .catch(() => {}) on fetch — feature simply absent if index.json unavailable (D-10)"
  - "_feedIndex is non-reactive (no @state) — the Map itself never changes after load; only _activeFeedEntries triggers re-render"
metrics:
  duration: ~3 minutes
  completed: "2026-04-11T22:24:42Z"
  tasks_completed: 2
  files_modified: 2
---

# Phase 45 Plan 01: Feed Index Data Layer Summary

Feed index data layer added to bee-atlas: fetches `/data/feeds/index.json` at startup, builds a `Map<string, FeedEntry>` keyed by `filter_value`, computes `activeFeedEntries` from `selectedCollectors`, and passes the result to `bee-sidebar` as a property binding.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add DISC-02 tests (RED) | 3f72040 | frontend/src/tests/bee-atlas.test.ts |
| 2 | Implement feed index fetch and activeFeedEntries (GREEN) | ceb4080 | frontend/src/bee-atlas.ts |

## What Was Built

**`FeedEntry` interface** exported from `bee-atlas.ts` — matches `index.json` schema: `filename`, `url`, `title`, `filter_type`, `filter_value`, `entry_count`.

**`_feedIndex: Map<string, FeedEntry>`** — non-reactive private field, populated once from `/data/feeds/index.json` fetch in `firstUpdated`. Keyed by `filter_value` (the collector's `recordedBy` name).

**`_activeFeedEntries: FeedEntry[] = []`** — `@state()` field, triggers re-render when changed. Computed by `_computeActiveFeedEntries()`.

**`_computeActiveFeedEntries()`** — maps `selectedCollectors` through `_feedIndex` using `c.recordedBy` as key. Collectors with `recordedBy === null` are skipped (iNat-only users have no ecdysis feed). Filters `undefined` results.

**Fetch lifecycle** — called in `firstUpdated` with silent `.catch(() => {})`. After loading, calls `_computeActiveFeedEntries()` to handle URL-restored filter state.

**`_onFilterChanged` integration** — calls `_computeActiveFeedEntries()` immediately after updating `_filterState`, before the async filter query.

**Sidebar binding** — `.activeFeedEntries=${this._activeFeedEntries}` added to `<bee-sidebar>` in render template.

## Test Results

- 6 DISC-02 tests added and passing (GREEN)
- 111 pre-existing tests continue to pass
- 1 pre-existing failure in bee-sidebar.test.ts (`boundaryMode` property) — not caused by this plan

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — `_activeFeedEntries` is wired from real data. Plan 02 will render it in bee-sidebar.

## Threat Flags

No new security surface introduced. `/data/feeds/index.json` is a same-origin static file; T-45-01 through T-45-03 in the plan's threat model cover all cases. The `activeFeedEntries` property binding passes data to bee-sidebar but does not render it yet (Plan 02 handles rendering).

## Self-Check: PASSED

- frontend/src/bee-atlas.ts: FOUND
- frontend/src/tests/bee-atlas.test.ts: FOUND
- Commit 3f72040 (RED tests): FOUND
- Commit ceb4080 (GREEN implementation): FOUND
