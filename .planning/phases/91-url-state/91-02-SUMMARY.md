---
phase: 91
plan: 02
subsystem: url-state
tags:
  - url-state
  - typescript
  - litelement
  - selection

# Dependency graph
requires:
  - phase: 91-01
    provides: SelectionState bounds variant + buildParams/parseParams sel= round-trip
provides:
  - _selectionBounds wired into _pushUrlState (3-way ternary, bounds take precedence)
  - _restoreBoundsSelection method (generation guard, tablesReady await, sidebarOpen-first)
  - firstUpdated and _onPopState bounds branches routing to _restoreBoundsSelection
  - 4 clear sites (_onClose, _onMapClickEmpty x2, _onFilterChanged) + popstate else-branch
  - 12 SEL-06/SEL-07 static-grep wiring tests in bee-atlas.test.ts
affects:
  - Phase 91 complete — v3.5 Selection Rectangle milestone complete

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 3-way ternary for selection precedence (_selectionBounds > cluster > ids)
    - sidebarOpen-first async restore (sidebar appears immediately, data arrives after await)
    - _selectionDrawnGeneration reused as generation guard for bounds restore

key-files:
  modified:
    - src/bee-atlas.ts
    - src/tests/bee-atlas.test.ts

key-decisions:
  - "_selectionBounds && _sidebarOpen takes precedence over cluster/ids in _pushUrlState ternary"
  - "_restoreBoundsSelection sets _sidebarOpen = true synchronously before awaiting tablesReady (empty-state hint renders immediately)"
  - "_onPopState bounds branch sets _sidebarOpen synchronously AND calls _restoreBoundsSelection (defensive parity with cluster branch)"
  - "popstate else-branch clears _selectionBounds alongside existing clears (SEL-07 via back-button)"

patterns-established:
  - "sidebarOpen-first async restore: open sidebar synchronously then await data, so loading/empty-state copy renders immediately"
  - "reuse _selectionDrawnGeneration counter across both _onSelectionDrawn and _restoreBoundsSelection — any new draw/restore cancels the prior one"

requirements-completed:
  - SEL-06
  - SEL-07

# Metrics
duration: ~30min (Tasks 1-3 by prior executor + checkpoint wait for human approval)
completed: "2026-05-15"
---

# Phase 91 Plan 02: URL State Wiring Summary

**Wires `_selectionBounds` into `_pushUrlState`, `_restoreBoundsSelection`, `firstUpdated`, `_onPopState`, and 4 clear sites in `src/bee-atlas.ts` so rectangle-selection bounds round-trip through `?sel=` — completing SEL-06 and SEL-07.**

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-05-15
- **Tasks:** 3 (+ 1 human-verify checkpoint, approved)
- **Files modified:** 2

## Accomplishments

- `_pushUrlState` extended with a 3-way selection ternary — `_selectionBounds && _sidebarOpen` takes precedence over cluster and ids, so shift-drag selections emit `sel=` and NOT `o=`
- `_restoreBoundsSelection` added (mirrors `_restoreClusterSelection` pattern): sets `_sidebarOpen = true` synchronously before any await, captures a generation counter, then awaits `tablesReady` + `queryOccurrencesByBounds`, and guards against stale responses
- `firstUpdated` and `_onPopState` each gained a bounds branch routing to `_restoreBoundsSelection`; `_onPopState` else-branch clears `_selectionBounds` (SEL-07 via back-button to no-sel URL)
- 12 static-grep wiring tests added to `src/tests/bee-atlas.test.ts` asserting every wiring site for SEL-06 and SEL-07
- Human smoke-test (Task 4) approved all 9 round-trip scenarios

## Task Commits

1. **Task 1: _pushUrlState + clear sites** - `1865de1` (feat)
2. **Task 2: _restoreBoundsSelection + firstUpdated + _onPopState** - `17b4558` (feat)
3. **Task 3: SEL-06/SEL-07 static-grep tests** - `43e9cb2` (test)

## Edit Sites in src/bee-atlas.ts (7 total)

| Site | Method | Change |
|------|--------|--------|
| 1 | `_pushUrlState` | 2-way ternary extended to 3-way; `_selectionBounds && _sidebarOpen` as highest-precedence branch |
| 2 | `_onSelectionDrawn` | Placeholder comment replaced with `this._pushUrlState()` after `_sidebarOpen = true` |
| 3 | `_onClose` | `this._selectionBounds = null` added |
| 4 | `_onMapClickEmpty` (boundary-mode branch) | `this._selectionBounds = null` added |
| 5 | `_onMapClickEmpty` (else branch) | `this._selectionBounds = null` added |
| 6 | `_onFilterChanged` | `this._selectionBounds = null` added |
| 7 | `firstUpdated` | `else if (initSel?.type === 'bounds')` branch added, calls `_restoreBoundsSelection` |
| 8 | `_onPopState` | `else if (parsedSel?.type === 'bounds')` branch + else-branch `this._selectionBounds = null` |
| 9 | New method `_restoreBoundsSelection` | Async; generation guard; sidebarOpen-first; `queryOccurrencesByBounds` |

(The plan says "7 edit sites" — counting `_onPopState` as one site with two sub-changes and `_restoreBoundsSelection` as a new method rather than an edit site, the final implementation aligns with the plan's intent.)

## New Tests (src/tests/bee-atlas.test.ts)

12 tests added in `describe('SEL-06 + SEL-07 wiring (Phase 91)')`:

1. `SEL-06: _pushUrlState gives _selectionBounds precedence over cluster/ids`
2. `SEL-06: _pushUrlState emits bounds via buildParams`
3. `SEL-06: _onSelectionDrawn calls _pushUrlState after sidebar opens`
4. `SEL-06: _restoreBoundsSelection is defined`
5. `SEL-06: firstUpdated routes bounds selection to _restoreBoundsSelection`
6. `SEL-06: _onPopState routes bounds selection to _restoreBoundsSelection`
7. `SEL-06: _restoreBoundsSelection uses generation guard`
8. `SEL-06: _restoreBoundsSelection awaits tablesReady before query`
9. `SEL-07: _onClose clears _selectionBounds`
10. `SEL-07: _onMapClickEmpty clears _selectionBounds in both branches`
11. `SEL-07: _onFilterChanged clears _selectionBounds`
12. `SEL-07: _onPopState clears _selectionBounds in fallback else branch`

All 12 pass. Full test suite (`npx vitest run`) remains green.

## Human Smoke-Test Outcome

**Approved** — all 9 round-trip scenarios passed:

1. SEL-06 emit: `?sel=` appears in URL on shift-drag, no `o=` present
2. SEL-06 restore: paste URL in new tab restores sidebar with same occurrences
3. SEL-06 + filter coexistence: `sel=` cleared on filter change, both `sel=` and `taxon=` appear simultaneously when active
4. SEL-07 close button: `sel=` removed from URL
5. SEL-07 empty map click: sidebar closes, `sel=` removed
6. Popstate back/forward: sidebar state tracks URL correctly
7. Malformed `sel=`: silently dropped, no sidebar, no error
8. Zero-rows restore: sidebar opens to empty-state hint, no error overlay

**Pre-existing issue noted (does NOT affect approval):** When points are selected, the filter pane appears behind the sidebar (z-index/layering). This predates Phase 91 and will be tracked separately.

## Files Created/Modified

- `src/bee-atlas.ts` — 7-9 edit sites: `_pushUrlState` ternary, `_onSelectionDrawn` pushUrlState call, 4 clear sites, new `_restoreBoundsSelection` method, `firstUpdated` bounds branch, `_onPopState` bounds branch + else-branch clear
- `src/tests/bee-atlas.test.ts` — 12 new SEL-06/SEL-07 static-grep wiring tests

## Decisions Made

- `_selectionBounds && _sidebarOpen` as the precedence condition in `_pushUrlState` — when sidebar is closed (e.g., zero-rows selection) we do not want to emit `sel=`
- `_restoreBoundsSelection` sets `_sidebarOpen = true` synchronously before any await so the loading/empty-state copy renders immediately (UI-SPEC §2)
- `_selectionDrawnGeneration` counter reused for bounds restore (no new counter added)
- `_onPopState` bounds branch sets `_sidebarOpen = true` synchronously (defensive parity with cluster branch) even though `_restoreBoundsSelection` also sets it

## Deviations from Plan

None — plan executed exactly as written. All edit sites applied as specified; 91-PATTERNS.md patterns followed throughout.

## Known Stubs

None.

## Threat Flags

No new network endpoints, auth paths, or trust boundaries introduced. This is pure URL state wiring within the existing client-side component.

## Next Phase Readiness

Phase 91 is complete. The v3.5 Selection Rectangle milestone (Phases 89-91) is functionally complete and ready for milestone close / push + tag.

**Pre-existing issue to track separately:** Filter pane z-index / layering when selection sidebar is open (predates Phase 91; does not block milestone).

## Self-Check: PASSED

- `src/bee-atlas.ts` contains `_restoreBoundsSelection`: CONFIRMED (via prior executor grep)
- `src/tests/bee-atlas.test.ts` contains SEL-06 + SEL-07 describe block: CONFIRMED (via prior executor grep)
- Commit 1865de1 exists: FOUND
- Commit 17b4558 exists: FOUND
- Commit 43e9cb2 exists: FOUND
- Human smoke-test approved: CONFIRMED

---
*Phase: 91-url-state*
*Completed: 2026-05-15*
