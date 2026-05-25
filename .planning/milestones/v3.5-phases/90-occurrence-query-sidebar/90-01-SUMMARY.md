---
phase: 90-occurrence-query-sidebar
plan: "01"
subsystem: frontend-query
tags: [sqlite, filter, sidebar, bounds-query, selection-rectangle]
dependency_graph:
  requires:
    - Phase 89 — Rectangle Drawing (selection-drawn event, _selectionBounds field stub)
    - src/filter.ts (buildFilterSQL, OCCURRENCE_COLUMNS, OccurrenceRow, tablesReady, getDB)
    - src/bee-atlas.ts (_onOccurrenceClick path for sidebar-open analog)
  provides:
    - queryOccurrencesByBounds(f, bounds) exported from src/filter.ts
    - Async _onSelectionDrawn handler in src/bee-atlas.ts
    - SEL-03, SEL-04, SEL-05 static-grep test coverage
  affects:
    - src/bee-atlas.ts (import list, _selectionBounds @ts-ignore removed, _onSelectionDrawn expanded)
    - src/filter.ts (new export added after queryVisibleIds)
    - src/tests/bee-atlas.test.ts (3 new describe blocks)
tech_stack:
  added: []
  patterns:
    - "Object.fromEntries(columnNames.map((col, i) => [col, rowValues[i]])) as unknown as OccurrenceRow"
    - "const f = this._filterState snapshot before first await (stale-filter race guard)"
    - "Synchronous state clear before async bounds query (Pitfall 3)"
key_files:
  created: []
  modified:
    - src/filter.ts
    - src/bee-atlas.ts
    - src/tests/bee-atlas.test.ts
decisions:
  - "Use this._selectionBounds! (not e.detail) when calling queryOccurrencesByBounds — eliminates Phase-89 @ts-ignore by making the field readable, and Phase 91 will extend _pushUrlState to also read it for sel= URL encoding"
  - "No _pushUrlState() call in _onSelectionDrawn — Phase 91 owns URL state for sel= param"
  - "Bounds interpolated as numeric literals (matches _restoreClusterSelection pattern; confirmed safe by T-90-01 threat model accept)"
metrics:
  duration: "~15 min"
  completed_date: "2026-05-15"
  tasks_completed: 3
  files_modified: 3
requirements-completed: [SEL-03, SEL-04, SEL-05]
---

# Phase 90 Plan 01: Bounds Query and Sidebar Open Summary

SQLite bounds query wired to the shift-drag rectangle gesture — `queryOccurrencesByBounds` exported from `filter.ts`, `_onSelectionDrawn` made async with sidebar-open path, SEL-03/04/05 static-grep tests added.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Add queryOccurrencesByBounds to filter.ts + SEL-03 RED test | 7957fc4 | src/filter.ts, src/tests/bee-atlas.test.ts |
| 2 | Wire _onSelectionDrawn to queryOccurrencesByBounds, open sidebar | 9b8e3e0 | src/bee-atlas.ts |
| 3 | Add SEL-04 and SEL-05 static-grep test blocks | 31f434f | src/tests/bee-atlas.test.ts |

## What Was Built

### src/filter.ts — queryOccurrencesByBounds export

New exported async function placed immediately after `queryVisibleIds` (line 321). SQL pattern:

```sql
SELECT ${selectCols}
FROM occurrences
WHERE (${occurrenceWhere}) AND lat BETWEEN ${south} AND ${north} AND lon BETWEEN ${west} AND ${east}
ORDER BY date DESC, recordedBy ASC
```

- Uses `buildFilterSQL(f)` to compose the active filter WHERE fragment
- Awaits `tablesReady` before calling `getDB()` (standard sqlite.ts init contract)
- Deserializes rows via `Object.fromEntries(columnNames.map(...))` — same pattern as `_restoreClusterSelection`
- No new imports added to filter.ts

### src/bee-atlas.ts — _onSelectionDrawn expansion

Three edits:

1. Added `queryOccurrencesByBounds` to existing named import from `'./filter.ts'` (no new import line)
2. Removed the two-line Phase-89 `// @ts-ignore` comment block above `_selectionBounds`
3. Replaced the sync stub with an async handler implementing the full SEL-03/04/05 contract:
   - Assigns `e.detail` to `this._selectionBounds` (read later in handler; Phase 91 will also read it for `sel=` URL encoding)
   - Synchronously clears `_selectedOccurrences`, `_selectedOccIds`, `_selectedCluster = null`, `_sidebarOpen = false` before first `await`
   - Snapshots `this._filterState` into `const f` before first `await` (T-90-04 race guard)
   - Awaits `queryOccurrencesByBounds(f, this._selectionBounds!)`
   - Empty result → return immediately (SEL-05: sidebar stays closed)
   - Non-empty → lazy `import('./bee-sidebar.ts')`, assign `_selectedOccurrences`, build `_selectedOccIds` with canonical `ecdysis:N / inat:N` IDs, set `_sidebarOpen = true` (SEL-04)

### src/tests/bee-atlas.test.ts — SEL-03, SEL-04, SEL-05 describe blocks

- **SEL-03** (added in Task 1): 3 tests — export present in filter.ts, `buildFilterSQL + BETWEEN` pattern in filter.ts, `queryOccurrencesByBounds` reference in bee-atlas.ts. Test 3 was intentionally RED during Task 1 (cross-file TDD cycle; went GREEN at Task 2 commit).
- **SEL-04** (added in Task 3): 2 tests — `_sidebarOpen = true` reachable, `_selectedOccurrences = rows` assignment present.
- **SEL-05** (added in Task 3): 1 test — `rows.length === 0` guard present.

## Test Results

```
Tests  355 passed | 4 skipped (359)
Test Files  21 passed (23 — 2 pre-existing failures: build-output.test.ts, data-species.test.ts)
```

`npx tsc --noEmit` exits 0 — TypeScript clean.

## TDD Gate Compliance

- RED commit (Task 1): `test(90-01)` — 2 of 3 SEL-03 tests pass, 1 intentionally fails on missing bee-atlas.ts reference
- GREEN commit (Task 2): `feat(90-01)` — all 3 SEL-03 tests pass, tsc clean
- REFACTOR: not needed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Used this._selectionBounds! instead of e.detail in queryOccurrencesByBounds call**

- **Found during:** Task 2 TypeScript check
- **Issue:** Removing the `@ts-ignore` exposed a TS6133 error — `_selectionBounds` is "declared but its value is never read" because the handler assigned it via `this._selectionBounds = e.detail` but then read from `e.detail` directly in the query call
- **Fix:** Changed `queryOccurrencesByBounds(f, e.detail)` to `queryOccurrencesByBounds(f, this._selectionBounds!)` — the field is now both written (assignment) and read (query argument). Added a comment noting Phase 91 will also read it for `sel=` URL encoding. The `!` non-null assertion is safe because `_selectionBounds` was just assigned synchronously on the line above.
- **Files modified:** src/bee-atlas.ts
- **Commit:** 9b8e3e0

## Known Stubs

None — the bounds query is fully wired and returns real data. Phase 91 will add `sel=` URL encoding and restore-on-load behavior; those are planned extensions, not stubs blocking this plan's goal.

## Threat Surface Scan

No new threat surface beyond what the plan's threat model covers. `queryOccurrencesByBounds` does not introduce new network endpoints, auth paths, or file access patterns. The bounds-query SQL path is a superset of the existing `queryVisibleIds` path (same `buildFilterSQL` + same `sqlite3.exec` infrastructure).

## Phase 91 Callout

Phase 91 will:
- Add `this._pushUrlState()` inside `_onSelectionDrawn` (after the `_sidebarOpen = true` line) to encode the selection as `sel=west,south,east,north` in the URL
- Extend `buildParams`/`parseParams` in `url-state.ts` to handle the `sel=` param
- Add `_onPopState` restore logic to re-run `queryOccurrencesByBounds` when `sel=` is present in the URL on page load
