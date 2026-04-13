---
phase: 54-sidebar-cleanup
reviewed: 2026-04-13T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - frontend/src/bee-atlas.ts
  - frontend/src/bee-sidebar.ts
  - frontend/src/tests/bee-sidebar.test.ts
  - frontend/src/tests/bee-atlas.test.ts
findings:
  critical: 1
  warning: 2
  info: 2
  total: 5
status: issues_found
---

# Phase 54: Code Review Report

**Reviewed:** 2026-04-13T00:00:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Reviewed `bee-atlas.ts` (794 lines), `bee-sidebar.ts` (143 lines), and both test files. The sidebar cleanup correctly strips `bee-sidebar` to a thin presenter shell, the state-ownership invariant is respected, and the race guard is in place. One structural SQL injection risk was found in `_restoreSelectionSamples`, along with a dead-code duplication in the collector-options loading path and a CSV quoting gap for carriage-return characters.

## Critical Issues

### CR-01: SQL built by string interpolation in `_restoreSelectionSamples`

**File:** `frontend/src/bee-atlas.ts:737-744`
**Issue:** `ecdysisIds` are interpolated directly into a SQL `IN (...)` clause via template literals. The guard on line 731 (`/^\d+$/`) makes this safe today, but the query's correctness is coupled to that upstream regex. If the guard were ever weakened, relaxed, or the function reused with unvalidated input, SQL injection would be possible. DuckDB's WASM API supports parameterized queries.
**Fix:** Use a parameterized query or, since DuckDB WASM may not support `$1`-style params for `IN` lists, at minimum add an inline assertion immediately before the interpolation:

```typescript
// Belt-and-suspenders: reject any id that is not a pure integer string
const safeIds = ecdysisIds.filter(id => /^\d+$/.test(id));
if (safeIds.length === 0) return;
const idList = safeIds.map(id => `'${id}'`).join(',');
```

If parameterized `IN` support is available in the DuckDB WASM version in use, prefer:
```typescript
// Use positional params once DuckDB WASM supports them for IN lists
```

The inline assertion duplicates what line 731 already does, but makes the SQL-construction site self-contained and safe against future refactors that might remove or bypass the upstream filter.

## Warnings

### WR-01: Duplicate collector-options query — `_loadCollectorOptions` is dead duplication

**File:** `frontend/src/bee-atlas.ts:376-400`
**Issue:** `_loadCollectorOptions` runs the identical SQL query and assignment as lines 354-367 inside `_loadSummaryFromDuckDB`. Both populate `this._collectorOptions` with the same result. `_onDataLoaded` (line 709) calls `_loadCollectorOptions` after `_loadSummaryFromDuckDB` has already populated the field in table-startup paths — making the second query a no-op that wastes a DuckDB round-trip and a connection. In map-startup paths `_loadSummaryFromDuckDB` is not called, so `_loadCollectorOptions` is the only writer, but then the copy inside `_loadSummaryFromDuckDB` is dead code.
**Fix:** Remove the duplicate query from whichever path does not own the canonical call. If `_loadCollectorOptions` is the intended owner (called from `_onDataLoaded` for both map and table startup), delete the collector block from `_loadSummaryFromDuckDB` (lines 354-367). Add a comment at the call site noting that `_loadCollectorOptions` runs independently so toolbar collector options arrive as soon as DuckDB is ready, regardless of view mode.

### WR-02: CSV quoting does not handle carriage return (`\r`)

**File:** `frontend/src/bee-atlas.ts:673`
**Issue:** The CSV value quoting condition is:
```typescript
str.includes(',') || str.includes('"') || str.includes('\n')
```
A field value containing only `\r` (carriage return, U+000D) — possible in Windows-style line endings in free-text fields — would not be quoted, resulting in a malformed CSV row in consumers that treat `\r` as a record separator (RFC 4180 specifies `\r\n` as the line terminator).
**Fix:**
```typescript
str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')
```

## Info

### IN-01: `console.debug` left in production DuckDB init path

**File:** `frontend/src/bee-atlas.ts:265`
**Issue:** `console.debug('DuckDB tables ready')` is a debug artifact in the production init path. It is benign but adds noise in deployed builds.
**Fix:** Remove the line, or guard it behind a `import.meta.env.DEV` check if retaining debug logging during development is useful.

### IN-02: `_sidebarOpen` is not reset when layer mode changes away from specimen click source

**File:** `frontend/src/bee-atlas.ts:625-637`
**Issue:** `_onLayerChanged` (line 625) correctly sets `_sidebarOpen = false` and clears selections (lines 628-630). However, `_onMapClickEmpty` (line 579) clears `_selectedSamples`, `_selectedOccIds`, and `_selectedSampleEvent` but does not set `_sidebarOpen = false`. This means clicking empty map space in boundary-off mode (lines 591-596) closes the detail content but leaves `_sidebarOpen = true`, causing `bee-sidebar` to render with neither `samples` nor `selectedSampleEvent` and displaying the "Click a point…" hint in an open panel rather than collapsing it.
**Fix:**
```typescript
private _onMapClickEmpty() {
  if (this._boundaryMode !== 'off') {
    // ... existing region-clear logic
  } else {
    this._selectedSamples = null;
    this._selectedOccIds = null;
    this._selectedSampleEvent = null;
    this._sidebarOpen = false;  // add this line
    this._pushUrlState();
  }
}
```

---

_Reviewed: 2026-04-13T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
