---
phase: 105
plan: 01
subsystem: url-state
tags: [url-state, lit, vitest, frontend]
dependency_graph:
  requires: []
  provides: [UiState.paneState, pane= URL param, legacy view=table alias]
  affects: [bee-atlas.ts URL read/write paths]
tech_stack:
  added: []
  patterns: [include-when-non-default guard, Option-A precedence chain for legacy alias]
key_files:
  created: []
  modified:
    - src/url-state.ts
    - src/bee-atlas.ts
    - src/tests/url-state.test.ts
    - src/tests/bee-atlas.test.ts
decisions:
  - "pane= wins over view= when both present (Option A precedence)"
  - "_viewMode field in bee-atlas.ts NOT renamed — Phase 106 owns that"
  - "pane=list maps to _viewMode='map' in Phase 105 (no list state yet)"
metrics:
  duration_minutes: 8
  completed: "2026-05-19T18:19:13Z"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 105 Plan 01: UiState paneState Migration Summary

Replace `UiState.viewMode: 'map' | 'table'` with `UiState.paneState: 'list' | 'table' | 'collapsed'` in url-state.ts, with legacy `?view=table` alias preserved; wire four bee-atlas.ts call sites through a temporary adapter preserving the `_viewMode` runtime field.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Migrate url-state.ts + url-state.test.ts | b4d7692 | src/url-state.ts, src/tests/url-state.test.ts |
| 2 | Wire bee-atlas.ts call sites + bee-atlas.test.ts | 6a089f2 | src/bee-atlas.ts, src/tests/bee-atlas.test.ts |

## Diff Stats

- **Task 1:** 2 files changed, 63 insertions(+), 22 deletions(-)
- **Task 2:** 2 files changed, 13 insertions(+), 8 deletions(-)
- **Total:** 4 files changed, ~76 insertions, ~30 deletions

## Verification Results

### npm test (url-state + bee-atlas targets)
```
Test Files  6 passed (6)
Tests  304 passed (304)
Duration  541ms
```

### npx tsc --noEmit
Exit 0 — no TypeScript errors.

### Acceptance criteria checks
- `grep -n viewMode src/url-state.ts` — 0 matches (clean)
- `grep -n viewMode src/tests/url-state.test.ts` — 0 matches (clean)
- `paneState` present in all 4 modified files (34 occurrences)
- `@state() private _viewMode` declaration preserved at bee-atlas.ts line 36
- `describe('pane state param (URL-01, URL-02)')` block with 6 tests in url-state.test.ts
- VIEW-02 regex in bee-atlas.test.ts updated to `parsed\.ui\?\.paneState`

## Note on build-output and data-species test suites

Two test files (`src/tests/build-output.test.ts` and `src/tests/data-species.test.ts`) fail in the worktree because `public/data/species.json` (a data pipeline artifact) is absent. These failures are pre-existing and unrelated to this plan's changes.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — no stub patterns introduced.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. The `parseParams` changes only affect the `pane=` and `view=` query string values with an allowlist ternary chain as specified in T-105-01.

## Next Phase

Phase 106 replaces the `_viewMode` runtime field with a real three-state pane machine, completing the v3.9 sidebar redesign.

## Self-Check: PASSED

- src/url-state.ts exists and contains paneState interface
- src/bee-atlas.ts exists and contains paneState adapter
- src/tests/url-state.test.ts exists and contains 'pane state param (URL-01, URL-02)' describe block
- src/tests/bee-atlas.test.ts exists and contains parsed.ui?.paneState assertion
- Commits b4d7692 and 6a089f2 verified in git log
