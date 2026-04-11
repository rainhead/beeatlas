---
phase: 45-sidebar-feed-discovery
plan: "02"
subsystem: frontend
tags: [feed-discovery, bee-sidebar, tdd, lit-element]
dependency_graph:
  requires: [FeedEntry interface from bee-atlas (structural), activeFeedEntries binding from Plan 01]
  provides: [activeFeedEntries @property on BeeSidebar, _renderFeedsSection method, teaser hint in _renderSummary]
  affects: [frontend/src/bee-sidebar.ts, frontend/src/tests/bee-sidebar.test.ts]
tech_stack:
  added: []
  patterns: [local interface mirroring for ARCH-03 compliance, Lit nothing sentinel, navigator.clipboard.writeText]
key_files:
  created: []
  modified:
    - frontend/src/bee-sidebar.ts
    - frontend/src/tests/bee-sidebar.test.ts
decisions:
  - "Define FeedEntry locally in bee-sidebar.ts rather than import type from bee-atlas — ARCH-03 test forbids any import from bee-atlas in bee-sidebar; structural duck-typing ensures compatibility"
  - "Teaser hint placed in both filtered-active and default branches of _renderSummary, suppressed when activeFeedEntries.length > 0 or layerMode === samples"
  - "_renderFeedsSection returns nothing (Lit sentinel) when no entries — unconditional call in render() keeps template clean"
metrics:
  duration: ~8 minutes
  completed: "2026-04-11T22:35:00Z"
  tasks_completed: 2
  files_modified: 2
---

# Phase 45 Plan 02: Feed Discovery UI in bee-sidebar Summary

Feeds section and teaser hint added to bee-sidebar: renders per-collector feed rows with Copy URL (clipboard) and Open Feed (new tab) actions when activeFeedEntries is non-empty; shows teaser hint in specimens mode when no collector feeds are active.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add DISC-04 tests to bee-sidebar.test.ts (RED) | 604efa5 | frontend/src/tests/bee-sidebar.test.ts |
| 2 | Implement Feeds section and teaser hint in bee-sidebar.ts (GREEN) | 3dfebec | frontend/src/bee-sidebar.ts |

## What Was Built

**`FeedEntry` interface** — defined locally in bee-sidebar.ts (mirrors bee-atlas.ts shape; local definition avoids ARCH-03 violation).

**`activeFeedEntries: FeedEntry[] = []`** — `@property({ attribute: false })` on BeeSidebar, receives data from bee-atlas binding.

**`_renderFeedsSection()`** — returns `nothing` when empty; renders `.feeds-section` div with `.feeds-header` "Feeds", one `.feed-row` per entry showing `{filter_value} — determinations` label, Copy URL button (clipboard write), and Open Feed anchor (`target="_blank" rel="noopener"`).

**Teaser hint** — added to both branches of `_renderSummary()`: `"Filter by collector to subscribe to a determination feed."` shown when `activeFeedEntries.length === 0 && layerMode === 'specimens'`. Suppressed in samples mode and when feeds are active.

**CSS** — `.feeds-section`, `.feeds-header` (uppercase 0.8rem 700), `.feed-row`, `.feed-label` (0.85rem 700), `.feed-actions`, `.feed-copy-btn`, `.feed-actions a` — all using `var(--accent)` for action colors per UI-SPEC.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed import type from bee-atlas (ARCH-03 violation)**
- **Found during:** Task 2, after running tests
- **Issue:** Plan recommended `import type { FeedEntry } from './bee-atlas.ts'`. An existing ARCH-03 test (`bee-sidebar.ts does not import bee-map or bee-atlas`) forbids any import from bee-atlas in bee-sidebar, including type-only imports (the test uses a regex on source text, not AST analysis).
- **Fix:** Defined `FeedEntry` interface locally in bee-sidebar.ts with identical shape. TypeScript structural typing ensures compatibility with bee-atlas's `_activeFeedEntries`.
- **Files modified:** frontend/src/bee-sidebar.ts
- **Commit:** 3dfebec (same task commit)

## Known Stubs

None — `activeFeedEntries` is wired from real data in bee-atlas (Plan 01). Feed rows render actual collector names and URLs.

## Threat Flags

No new security surface introduced beyond what the plan's threat model covers. T-45-04 (href injection) and T-45-05 (text content injection) are mitigated by Lit's auto-escaping in html template literals. T-45-06 (clipboard) accepted as documented.

## Self-Check: PASSED

- frontend/src/bee-sidebar.ts: FOUND
- frontend/src/tests/bee-sidebar.test.ts: FOUND
- Commit 604efa5 (RED tests): FOUND
- Commit 3dfebec (GREEN implementation): FOUND
