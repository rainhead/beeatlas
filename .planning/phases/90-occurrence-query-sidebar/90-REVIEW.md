---
phase: 90-occurrence-query-sidebar
reviewed: 2026-05-15T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - src/filter.ts
  - src/bee-atlas.ts
  - src/tests/bee-atlas.test.ts
findings:
  critical: 2
  warning: 3
  info: 1
  total: 6
status: issues_found
---

# Phase 90: Code Review Report

**Reviewed:** 2026-05-15
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Reviewed `filter.ts` (SQL query builders and filter logic), `bee-atlas.ts` (coordinator component), and `bee-atlas.test.ts` (structural tests). The new `queryOccurrencesByBounds` function and `_onSelectionDrawn` handler introduce the rectangular selection feature cleanly, and the filter SQL construction is correct. Two blockers surface: one in `sqlite.ts` (cross-file, affects the reviewed code's correctness) where boolean parquet values are misserialised, breaking the `is_provisional` rendering branch; and one in `bee-atlas.ts` where popstate navigation restores a visible sidebar without re-fetching the occurrence rows it should display.

## Critical Issues

### CR-01: `is_provisional` always evaluates to falsy — provisional samples never render correctly

**File:** `src/bee-atlas.ts:189` (cross-file root cause: `src/sqlite.ts:123-129`)
**Issue:** `_escapeSqlValue` in `sqlite.ts` has no branch for JavaScript `boolean`. When `hyparquet` deserialises the DuckDB `BOOLEAN` column `is_provisional`, it returns `true`/`false`. `_escapeSqlValue(true)` falls through to the string path and produces the SQL literal `'true'` (a TEXT value). SQLite stores this as TEXT in the `INTEGER`-declared column because `'true'` is not numerically castable. On read-back via `sqlite3.exec`, wa-sqlite returns the string `'true'`. In `bee-occurrence-detail.ts:256`, the comparison `row.is_provisional === true` is strict-equality against a boolean, so it is always `false`. Provisional samples silently render as ordinary sample-only rows — the `_renderProvisional` branch is dead code at runtime.

**Fix:** Add a boolean branch to `_escapeSqlValue` in `src/sqlite.ts`:
```typescript
function _escapeSqlValue(v: unknown): string {
  if (v == null) return 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';   // ← add this
  if (typeof v === 'number') return String(v);
  if (typeof v === 'bigint') return String(Number(v));
  if (v instanceof Date) return `'${v.toISOString().slice(0, 10)}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}
```
Then update `bee-occurrence-detail.ts:256` to compare against the integer representation if needed, or re-type `OccurrenceRow.is_provisional` as `boolean | number` and use a truthy check: `row.is_provisional` (no `=== true`).

---

### CR-02: `_onPopState` opens the sidebar without restoring `_selectedOccurrences` — stale or null content displayed

**File:** `src/bee-atlas.ts:551-558`
**Issue:** When the user navigates back/forward to a URL encoding an `ids` or `cluster` selection, `_onPopState` correctly sets `_sidebarOpen = true` and restores `_selectedOccIds` / `_selectedCluster`. However, it never calls `_restoreSelectionOccurrences` or `_restoreClusterSelection`. `_selectedOccurrences` therefore retains whatever value it had before the navigation — either stale occurrence rows from a different click, or `null` (if the sidebar was closed before navigating away). In both cases the sidebar renders with wrong content: the wrong specimens, or the "Click a point on the map to see details" hint inside an open sidebar.

By contrast, `firstUpdated` (lines 832-837) and `_onDataLoaded` (lines 832-837) both guard these calls correctly.

**Fix:**
```typescript
// In _onPopState, after restoring _selectedOccIds / _selectedCluster:
if (parsedSel?.type === 'ids' && parsedSel.ids.length > 0) {
  this._selectedOccIds = parsedSel.ids;
  this._selectedCluster = null;
  this._sidebarOpen = true;
  this._selectedOccurrences = null;                          // ← clear stale data
  this._restoreSelectionOccurrences(parsedSel.ids);          // ← re-fetch
} else if (parsedSel?.type === 'cluster') {
  this._selectedCluster = { lon: parsedSel.lon, lat: parsedSel.lat, radiusM: parsedSel.radiusM };
  this._selectedOccIds = null;
  this._sidebarOpen = true;
  this._selectedOccurrences = null;                          // ← clear stale data
  this._restoreClusterSelection(this._selectedCluster);      // ← re-fetch
} else { ... }
```

---

## Warnings

### WR-01: `_onSelectionDrawn` has no generation guard — concurrent draws leave stale occurrences

**File:** `src/bee-atlas.ts:653-673`
**Issue:** `_onSelectionDrawn` is `async` and awaits `queryOccurrencesByBounds`. If the user draws a second rectangle while the first query is in flight, both coroutines run concurrently. The second clears state synchronously (lines 656-659) and starts its own query. Whichever query resolves last wins and sets `_selectedOccurrences`. If the first (stale, larger) query resolves after the second, the sidebar shows results for a region the user already abandoned. A further scenario: `_onOccurrenceClick` fires synchronously during the await and sets `_selectedOccurrences`, then the pending `_onSelectionDrawn` resumes and overwrites it unconditionally.

`_runFilterQuery` and `_runTableQuery` both use a generation counter to prevent exactly this class of race; `_onSelectionDrawn` lacks an equivalent.

**Fix:**
```typescript
// Add to non-reactive private fields:
private _selectionDrawnGeneration = 0;

private async _onSelectionDrawn(e: CustomEvent<...>) {
  const generation = ++this._selectionDrawnGeneration;
  // ... (existing synchronous clear) ...
  const f = this._filterState;
  const rows = await queryOccurrencesByBounds(f, this._selectionBounds!);
  if (generation !== this._selectionDrawnGeneration) return;  // ← guard
  if (rows.length === 0) return;
  // ... rest unchanged ...
}
```

---

### WR-02: `_onSelectionDrawn` has no error handling — SQLite failure causes unhandled promise rejection

**File:** `src/bee-atlas.ts:663`
**Issue:** `queryOccurrencesByBounds` (in `filter.ts`) performs raw `sqlite3.exec` calls with no internal `try/catch`. If the database is unavailable or returns an error, the thrown exception propagates up through `_onSelectionDrawn` as an unhandled promise rejection. At that point `_sidebarOpen` is `false` and `_selectedOccurrences` is `null` (cleared at lines 656-659 before the await), so the UI is not broken, but the unhandled rejection will surface as a browser console error. All other async handlers in the file (`_runTableQuery`, `_loadSummaryFromSQLite`, `_restoreSelectionOccurrences`, etc.) wrap database calls in `try/catch`.

**Fix:**
```typescript
private async _onSelectionDrawn(e: CustomEvent<...>) {
  // ... existing code ...
  try {
    const rows = await queryOccurrencesByBounds(f, this._selectionBounds!);
    if (rows.length === 0) return;
    // ... rest ...
  } catch (err) {
    console.error('Bounds query failed:', err);
  }
}
```

---

### WR-03: `(detail as any).elevMin` / `(detail as any).elevMax` bypasses TypeScript type checking

**File:** `src/bee-atlas.ts:714-715`
**Issue:** `FilterChangedEvent` (defined in `src/bee-sidebar.ts:31-42`) explicitly declares `elevMin: number | null` and `elevMax: number | null`. The `as any` casts on these two lines suppress type-checking for no reason — `detail.elevMin` and `detail.elevMax` are valid, typed property accesses. If `FilterChangedEvent` were later refactored to rename or remove these fields, the compiler would not catch the divergence in `_onFilterChanged`. The casts appear to be a leftover from when the fields were not yet in the interface definition.

**Fix:**
```typescript
// Replace lines 714-715:
elevMin: detail.elevMin,
elevMax: detail.elevMax,
```

---

## Info

### IN-01: Test description names a non-existent handler (`_onSpecimenClick`)

**File:** `src/tests/bee-atlas.test.ts:138`
**Issue:** The test description reads `"sets _sidebarOpen = true in _onSpecimenClick"`. The actual handler is `_onOccurrenceClick` (line 587 of `bee-atlas.ts`). The test body only checks for the `this._sidebarOpen = true` pattern anywhere in the file and passes regardless; the wrong name in the description is purely a documentation error but misleads readers about what the test exercises.

**Fix:** Change the test description to reference `_onOccurrenceClick`.

---

_Reviewed: 2026-05-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
