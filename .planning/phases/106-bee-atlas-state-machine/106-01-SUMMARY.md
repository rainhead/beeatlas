---
phase: 106-bee-atlas-state-machine
plan: 01
subsystem: bee-atlas
tags: [state-machine, lit, vitest, frontend, refactor]
dependency_graph:
  requires: [Phase 105 url-state UiState.paneState]
  provides: [_paneState as single three-state reactive field in bee-atlas.ts]
  affects: [src/bee-atlas.ts, src/url-state.ts, src/tests/bee-atlas.test.ts, src/tests/bee-sidebar.test.ts, src/tests/url-state.test.ts]
tech_stack:
  added: []
  patterns: [discriminated-union @state() field, three-state pane machine, TDD RED/GREEN]
key_files:
  created: []
  modified:
    - src/bee-atlas.ts
    - src/url-state.ts
    - src/tests/bee-atlas.test.ts
    - src/tests/bee-sidebar.test.ts
    - src/tests/url-state.test.ts
decisions:
  - "_paneState: 'collapsed' | 'list' | 'table' replaces _viewMode + _sidebarOpen (Phase 106 target shape)"
  - "_tableFilterOpen kept as plain non-@state field; .externalOpen binding dropped; setOpen() drives DOM"
  - "bee-header API unchanged for Phase 106 (Option A: derive viewMode from paneState); Phase 107 will redesign"
  - "Table→map transition sets paneState = 'collapsed' not 'list' (D-08 preserved)"
  - "Rule 3 deviation: url-state.ts and url-state.test.ts updated in this plan (Phase 105 changes missing from worktree base)"
metrics:
  duration_minutes: 25
  completed: "2026-05-19T20:24:00Z"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 106 Plan 01: bee-atlas State Machine Summary

Replace the three-flag view-mode encoding (_viewMode, _sidebarOpen, _tableFilterOpen) in bee-atlas.ts with a single discriminated-union @state() field `_paneState: 'collapsed' | 'list' | 'table'`, removing Phase 105 adapters, and updating all affected tests.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Update bee-atlas.test.ts source-scan assertions and add SM-01 block (RED) | fe0fac9 | src/tests/bee-atlas.test.ts |
| 2 | Refactor bee-atlas.ts to single _paneState field, remove Phase 105 adapters (GREEN) | bbb3381 | src/bee-atlas.ts, src/url-state.ts, src/tests/bee-atlas.test.ts, src/tests/bee-sidebar.test.ts, src/tests/url-state.test.ts |

## Verification Results

### Final _paneState shape

`_paneState: 'collapsed' | 'list' | 'table' = 'collapsed'` is the sole reactive field governing pane visibility. `_viewMode` and `_sidebarOpen` are completely absent. `_tableFilterOpen` is retained as a plain `private _tableFilterOpen = false` field (non-reactive; drives filter panel open state via imperative `setOpen()` call only).

### Acceptance criteria checks

- `grep -cE "(_viewMode|_sidebarOpen)" src/bee-atlas.ts` — 0 (clean)
- `grep -c "@state() private _paneState" src/bee-atlas.ts` — 1 (present)
- `grep -c "'collapsed' | 'list' | 'table'" src/bee-atlas.ts` — 1 (union declared)
- `grep -cE "@state\(\)\s+private\s+_tableFilterOpen" src/bee-atlas.ts` — 0 (demoted)
- `grep -c "private _tableFilterOpen = false" src/bee-atlas.ts` — 1 (plain field retained)
- `grep -c "paneState: this._paneState" src/bee-atlas.ts` — 1 (direct pass to buildParams)
- `grep -c "this._selectionBounds && this._paneState === 'list'" src/bee-atlas.ts` — 1 (Pitfall 6 resolved)
- `grep -c ".externalOpen" src/bee-atlas.ts` — 0 (binding removed)
- `npx tsc --noEmit` — exits 0
- `npm test` — 398 passed, 29 skipped; SM-01 (7 tests), SIDE-01, VIEW-02, SEL-04, SEL-06 all pass

### Test count

398 tests pass (plus 29 skipped). Pre-existing failures in `build-output.test.ts` and `data-species.test.ts` due to missing `public/data/species.json` (data pipeline artifact absent in worktree — noted in Phase 105 SUMMARY as pre-existing, unrelated to Phase 106 changes).

SM-01 block adds 7 new tests. SIDE-01, VIEW-02, SEL-04, SEL-06 test names updated in place (1:1 replacement).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Phase 105 url-state.ts changes missing from worktree base**
- **Found during:** Task 2, during TypeScript compilation check
- **Issue:** The worktree was created from commit `0b17df1`, which predates Phase 105 (commits `b4d7692` and `6a089f2`). The `url-state.ts` in this worktree still had `UiState.viewMode: 'map' | 'table'` instead of `UiState.paneState: 'list' | 'table' | 'collapsed'`. TypeScript would not compile `bee-atlas.ts` with `paneState: this._paneState` in the `buildParams` call because `UiState.paneState` didn't exist.
- **Fix:** Applied Phase 105 changes to `url-state.ts` (replaced `viewMode` with `paneState` throughout: interface, `buildParams`, `parseParams`) and updated `url-state.test.ts` accordingly. Also updated `bee-sidebar.test.ts` which had a test asserting `_sidebarOpen` exists in `bee-atlas.ts`.
- **Files modified:** `src/url-state.ts`, `src/tests/url-state.test.ts`, `src/tests/bee-sidebar.test.ts`
- **Commit:** bbb3381

**2. [Rule 1 - Bug] SM-01 test 'g' regex matched legitimate bee-header binding**
- **Found during:** Task 2 GREEN phase test run
- **Issue:** The SM-01 test 'g' `not.toMatch(/paneState\s*===\s*'table'\s*\?\s*'table'\s*:\s*'map'/)` was designed to reject the Phase 105 adapter `this._viewMode = paneState === 'table' ? 'table' : 'map'` but also matched the legitimate Phase 106 bee-header binding `.viewMode=${this._paneState === 'table' ? 'table' : 'map'}`.
- **Fix:** Made the negative assertion more specific: `not.toMatch(/this\._viewMode\s*=\s*paneState\s*===\s*'table'\s*\?\s*'table'\s*:\s*'map'/)` to target only the adapter form.
- **Files modified:** `src/tests/bee-atlas.test.ts`
- **Commit:** bbb3381

**3. [Rule 1 - Bug] _onOccurrenceClick dead code**
- **Found during:** Task 2 TypeScript check  
- **Issue:** After replacing `this._sidebarOpen = true` with `this._paneState = 'list'`, the original guard `if (this._viewMode === 'table')` became `if (this._paneState === 'table')` which would never be true since _paneState was just set to 'list'. TypeScript flagged this as TS2367 (comparison with no overlap).
- **Fix:** Removed the dead code block. Clicking an occurrence now always switches to list mode; the table query refresh for table-mode occurrence clicks is no longer needed (table is not visible in list mode).
- **Files modified:** `src/bee-atlas.ts`
- **Commit:** bbb3381

## TDD Gate Compliance

- RED gate: commit `fe0fac9` — `test(106-01)` prefix — SM-01 + 5 updated assertions fail against unchanged `bee-atlas.ts` (14 failures verified)
- GREEN gate: commit `bbb3381` — `feat(106-01)` prefix — all SM-01 tests and updated assertions pass; tsc clean

## Known Stubs

None — this is a pure internal refactor with no new user-visible features or stub patterns.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. This phase is a pure internal TypeScript field-rename refactor. No ASVS categories apply.

## Self-Check: PASSED

- `src/bee-atlas.ts` exists and contains `@state() private _paneState`
- `src/tests/bee-atlas.test.ts` exists and contains `SM-01: bee-atlas pane state machine (Phase 106)`
- `src/url-state.ts` exists and contains `paneState: 'list' | 'table' | 'collapsed'`
- Commits `fe0fac9` and `bbb3381` verified in git log
