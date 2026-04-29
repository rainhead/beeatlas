---
phase: 068-filter-panel-redesign
plan: "02"
subsystem: frontend
tags: [filter, localStorage, cleanup, bee-filter-controls]
dependency_graph:
  requires: []
  provides: [bee-filter-controls without localStorage side effects]
  affects: [frontend/src/bee-filter-controls.ts]
tech_stack:
  added: []
  patterns: [surgical deletion — remove feature, update call sites]
key_files:
  created: []
  modified:
    - frontend/src/bee-filter-controls.ts
decisions:
  - D-09 — localStorage recents removed; browser native input history/autofill is sufficient
metrics:
  duration: 60s
  completed: "2026-04-20T21:40:33Z"
  tasks_completed: 1
  tasks_total: 1
  files_changed: 1
---

# Phase 068 Plan 02: Remove localStorage Recents from bee-filter-controls Summary

**One-liner:** Deleted `beeatlas.recentFilters` localStorage read/write from `bee-filter-controls.ts` per D-09 — five functions removed, three call sites updated to no-ops.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Delete localStorage recents from bee-filter-controls.ts | 505a85b | frontend/src/bee-filter-controls.ts |

## What Was Built

Removed the custom recent-filter recall mechanism from `bee-filter-controls.ts`:

- Deleted `RECENTS_KEY`, `RECENTS_MAX` constants
- Deleted `loadRecentTokens()`, `saveRecentToken()`, `getRecentSuggestions()` functions
- `_onInput`: empty input now sets `_suggestions = []` and `_open = false` (no recent recall on clear)
- `_onFocus`: replaced with no-op comment (was calling `getRecentSuggestions`)
- `_selectSuggestion`: removed `saveRecentToken(s.token)` call

Net change: 7 insertions, 56 deletions. `getSuggestions` (typed input autocomplete) is fully preserved.

## Verification

- No matches for `RECENTS_KEY`, `RECENTS_MAX`, `loadRecentTokens`, `saveRecentToken`, `getRecentSuggestions`, `beeatlas.recentFilters`, or `localStorage` in `bee-filter-controls.ts`
- `getSuggestions` still present and called from `_onInput`
- TypeScript errors are all pre-existing (unrelated `observer` vs `host_inat_login` mismatch across several files; `speicmenLayer` deferred typo) — identical error set before and after changes
- All 152 Vitest tests pass

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

T-068-02 (Information Disclosure) is now mitigated: `beeatlas.recentFilters` is no longer written to localStorage. Any pre-existing values in browser storage become orphaned but cause no harm.

## Self-Check: PASSED

- `frontend/src/bee-filter-controls.ts` — modified, verified clean of all localStorage patterns
- Commit `505a85b` — confirmed in git log
