---
phase: 52-header-component
plan: "01"
subsystem: frontend
tags: [lit, web-components, header, navigation, responsive]
dependency_graph:
  requires: []
  provides: [bee-header-component]
  affects: [bee-atlas, frontend/index.html]
tech_stack:
  added: []
  patterns: [lit-custom-element, tdd-red-green, shadow-dom-events, responsive-breakpoint]
key_files:
  created:
    - frontend/src/bee-header.ts
    - frontend/src/tests/bee-header.test.ts
  modified: []
decisions:
  - "Used native <details>/<summary> for hamburger — zero JS state, inherently internal per D-03"
  - "GitHub SVG icon absorbed into component from index.html per D-01 recommendation"
  - "4 pre-existing test failures in bee-table and bee-sidebar confirmed pre-existing on main, out of scope"
metrics:
  duration: "~5 minutes"
  completed: "2026-04-13"
  tasks_completed: 2
  files_created: 2
  files_modified: 0
---

# Phase 52 Plan 01: bee-header Component Summary

bee-header Lit custom element with layer/view nav tabs, disabled placeholder tabs, Map/Table icon toggle, and responsive hamburger menu using native details/summary.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create bee-header test file (RED) | f14fb4d | frontend/src/tests/bee-header.test.ts |
| 2 | Implement bee-header component (GREEN) | cef1e7b | frontend/src/bee-header.ts |

## What Was Built

`frontend/src/bee-header.ts` — A Lit custom element (`<bee-header>`) that:

- Accepts `layerMode: 'specimens' | 'samples'` and `viewMode: 'map' | 'table'` as `@property` inputs (attribute: false)
- Emits `layer-changed` CustomEvent (bubbles, composed) when an inactive layer tab is clicked; no-op if already active
- Emits `view-changed` CustomEvent (bubbles, composed) when an inactive view icon is clicked; no-op if already active
- Renders Specimens/Samples as clickable tabs with accent underline on active tab
- Renders Species/Plants as `disabled` buttons with `opacity: 0.4` and `pointer-events: none`
- Renders Map/Table icon buttons (Heroicons outline SVGs, 44px touch targets per WCAG 2.5.5)
- Absorbs the GitHub icon link (previously in index.html) into its template per D-01
- Uses native `<details>/<summary>` for hamburger (zero JS overhead, per CONTEXT.md D-03)
- Applies `@media (max-width: 640px)` to hide inline tabs and show hamburger (per D-07)

`frontend/src/tests/bee-header.test.ts` — Unit test suite with 8 tests covering:
- Property interface (elementProperties map has layerMode and viewMode)
- Custom element registration (bee-header tag name)
- Event emission on inactive tab click (layer-changed detail verified)
- No-op behavior when clicking the already-active tab
- Event emission on inactive view icon click (view-changed detail verified)
- Species and Plants buttons have `disabled` attribute
- `<details>` element exists in shadow DOM
- `<summary>` element exists inside `<details>`

## Test Results

- bee-header tests: 8/8 passed
- Full suite: 139 passed, 4 failed (pre-existing failures in bee-table and bee-sidebar; confirmed on main before this plan)

## Deviations from Plan

None - plan executed exactly as written. The `vi.mock` blocks for duckdb, features, and region-layer were included as specified (though bee-header.ts doesn't directly import them — included prophylactically per the pattern from bee-sidebar.test.ts).

## Known Stubs

None. The component renders its full intended structure. The `layerMode` and `viewMode` props default to sensible values (`'specimens'` and `'map'`). No placeholder text or hardcoded empty data flows to any UI output.

## Threat Flags

No new threat surface introduced. The component emits only typed string literal values in CustomEvent details; no user-supplied strings enter event payloads (T-52-01, T-52-02 both accepted per plan threat model).

## Self-Check: PASSED

- [x] frontend/src/bee-header.ts exists
- [x] frontend/src/tests/bee-header.test.ts exists
- [x] Commit f14fb4d exists (test RED)
- [x] Commit cef1e7b exists (feat GREEN)
- [x] bee-header tests: 8 passed
