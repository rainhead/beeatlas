---
phase: quick-260408-tvl
plan: "01"
subsystem: frontend
tags: [filter, localStorage, UX]
one_liner: "Recent filter tokens persisted to localStorage and shown as dropdown on empty input focus"
dependency_graph:
  requires: []
  provides: [recent-filters-UX]
  affects: [bee-filter-controls]
tech_stack:
  added: []
  patterns: [localStorage persistence, LitElement event handler]
key_files:
  modified:
    - frontend/src/bee-filter-controls.ts
decisions:
  - "Store up to 10 recent tokens in localStorage under 'beeatlas.recentFilters', show up to 5 as suggestions"
  - "Use JSON.stringify for token identity comparison (handles all token shapes uniformly)"
  - "Exclude tokens that conflict with already-active single-slot dimensions (taxon, yearFrom/yearTo/yearExact)"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-08"
  tasks_completed: 1
  files_modified: 1
---

# Quick Task 260408-tvl: Show Recent Filters When Filter Input Is Empty — Summary

## One-liner

Recent filter tokens persisted to localStorage and shown as dropdown on empty input focus.

## What Was Built

Modified `bee-filter-controls.ts` to add a recent-filters feature:

- **`loadRecentTokens()`** — reads the `beeatlas.recentFilters` key from localStorage, returns `Token[]` (handles parse errors gracefully).
- **`saveRecentToken(token)`** — deduplicates by JSON identity, prepends the new token, caps at 10 entries, writes back to localStorage (ignores quota errors).
- **`getRecentSuggestions(tokens)`** — returns up to 5 recent tokens as `Suggestion[]`, excluding tokens already active or conflicting with filled single-slot dimensions (taxon, year ranges).
- **`_onFocus()`** — new private method on `BeeFilterControls` that populates and opens the suggestions dropdown when the input is focused while empty.
- **`_onInput` modified** — when `value === ''`, uses `getRecentSuggestions` instead of `getSuggestions` (which returns nothing for empty input).
- **`_selectSuggestion` modified** — calls `saveRecentToken(s.token)` after pushing the token to the active list.
- **Template wired** — `@focus=${this._onFocus}` added to the `<input>` element.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `frontend/src/bee-filter-controls.ts` modified
- [x] Build passed with no TypeScript errors
- [x] Commit `a8fa85f` exists

## Self-Check: PASSED
