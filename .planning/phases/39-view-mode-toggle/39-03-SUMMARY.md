---
phase: 39-view-mode-toggle
plan: "03"
subsystem: frontend/bee-atlas
tags: [view-mode-toggle, lit-component, state-coordinator, conditional-render, VIEW-02, VIEW-03]
dependency_graph:
  requires: [39-01, 39-02]
  provides: [_viewMode @state in bee-atlas, _onViewChanged handler, conditional bee-map render, viewMode in URL, _onPopState viewMode restore]
  affects: [frontend/src/bee-atlas.ts, frontend/src/tests/bee-atlas.test.ts]
tech_stack:
  added: []
  patterns: [Lit @state coordinator, conditional Lit template rendering, property-down/event-up]
key_files:
  created: []
  modified:
    - frontend/src/bee-atlas.ts
    - frontend/src/tests/bee-atlas.test.ts
decisions:
  - _onViewChanged does NOT clear selections (view switch is layout only; user data persists)
  - bee-map is absent from DOM in table view (not just hidden) — complies with D-04/VIEW-02
  - .table-slot CSS uses flex-grow 1 to fill map area identically to bee-map
metrics:
  duration_minutes: 6
  completed_date: "2026-04-08"
  tasks_completed: 2
  files_modified: 2
---

# Phase 39 Plan 03: bee-atlas View Mode Wiring Summary

**One-liner:** Wired `_viewMode` @state into bee-atlas coordinator — conditional bee-map/table-slot render, `_onViewChanged` handler, viewMode in both `buildParams` call sites, and `_onPopState`/`firstUpdated` restoration for full URL round-trip.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add _viewMode state, handler, conditional render, and CSS to bee-atlas | f47642f | frontend/src/bee-atlas.ts |
| 2 | Extend bee-atlas.test.ts with VIEW-02 structural tests | 0c52959 | frontend/src/tests/bee-atlas.test.ts |

## What Was Built

`bee-atlas.ts` now:
- Declares `@state() private _viewMode: 'map' | 'table' = 'map'` (coordinator owns all state)
- Conditionally renders `<bee-map ...>` (map view) vs `<div class="table-slot"></div>` (table view) — bee-map is absent from the DOM in table view, satisfying VIEW-02
- Adds `.table-slot { flex-grow: 1; background: var(--surface); }` CSS to fill the map area
- Passes `.viewMode=${this._viewMode}` and listens `@view-changed=${this._onViewChanged}` on bee-sidebar
- `_onViewChanged` sets `_viewMode` and calls `_pushUrlState()` — does NOT clear selections (layout change only)
- Both `buildParams(...)` call sites now include `viewMode: this._viewMode` / `viewMode: initViewMode`
- `firstUpdated` restores `_viewMode` from `initialParams.ui?.viewMode ?? 'map'`
- `_onPopState` restores `_viewMode` from `parsed.ui?.viewMode ?? 'map'`

`bee-atlas.test.ts` now has 6 VIEW-02 structural tests confirming:
- `class="table-slot"` div present in template
- `.table-slot {` CSS rule in static styles
- `@state() private _viewMode` declaration
- `@view-changed=${this._onViewChanged}` event listener
- `.viewMode=${this._viewMode}` property binding
- `_onPopState` restores `_viewMode` from URL

## Verification Results

```
Test Files  4 passed (4)
     Tests  77 passed (77)
```

TypeScript: `npx tsc --noEmit` — no errors.

Structural grep checks (all passing):
- `grep -c "buildParams(" bee-atlas.ts` → 2 (both call sites include viewMode)
- `grep -n "viewMode" bee-atlas.ts` → 9 lines (state decl, both buildParams, firstUpdated restore + assign, _onPopState, bee-sidebar binding, _onViewChanged body)
- `grep -n "table-slot" bee-atlas.ts` → 2 lines (div class + CSS rule)

## Deviations from Plan

None — plan executed exactly as written. The `bee-atlas.ts` already had partial stubs (`viewMode: 'map'` hardcoded in both `buildParams` calls) from earlier worktree setup; these were correctly replaced with the `initViewMode` variable and `this._viewMode` references.

## Known Stubs

None — the table slot is an intentional empty placeholder for Phase 40 (bee-table component). The div is correctly present in the DOM in table view. The stub is structural, not data-flow — VIEW-02 is satisfied (map absent, table-slot present). Phase 40 will wire actual table content into this slot.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundary crossings beyond those in the plan's threat model. T-39-03-02 mitigation is in place: `parseParams` whitelist ensures only `'table'` produces non-default; any injected value becomes `'map'`.

## Self-Check: PASSED

- FOUND: frontend/src/bee-atlas.ts
- FOUND: frontend/src/tests/bee-atlas.test.ts
- FOUND: .planning/phases/39-view-mode-toggle/39-03-SUMMARY.md
- FOUND commit: f47642f
- FOUND commit: 0c52959
