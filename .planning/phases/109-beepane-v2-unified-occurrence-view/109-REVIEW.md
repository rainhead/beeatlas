---
phase: 109-beepane-v2-unified-occurrence-view
reviewed: 2026-05-20T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - src/bee-atlas.ts
  - src/bee-filter-controls.ts
  - src/bee-filter-toolbar.ts
  - src/bee-header.ts
  - src/bee-map.ts
  - src/bee-pane.ts
  - src/filter.ts
  - src/tests/bee-atlas.test.ts
  - src/tests/bee-header.test.ts
  - src/tests/bee-pane.test.ts
findings:
  critical: 3
  warning: 5
  info: 3
  total: 11
status: issues_found
---

# Phase 109: Code Review Report

**Reviewed:** 2026-05-20
**Depth:** standard
**Files Reviewed:** 10 (note: `src/bee-filter-toolbar.ts` does not exist on disk — skipped)
**Status:** issues_found

## Summary

Phase 109 unifies filter controls, occurrence list, and table mode into a single `<bee-pane>` component. The architecture and state machine are sound. However, a critical logic gap exists: `_onFilterChanged` never refreshes the list view when the pane is already in `list` state, causing stale results to persist. Two additional security-adjacent issues affect SQL query construction. Several smaller quality defects are also present.

---

## Critical Issues

### CR-01: `_onFilterChanged` never calls `_runListQuery` — list pane shows stale results after any filter change

**File:** `src/bee-atlas.ts:780-818`

**Issue:** When the user changes a filter while `_paneState === 'list'` (the normal state for a live filter session), `_onFilterChanged` does NOT call `_runListQuery()`. It only calls `_runFilterQuery()` and `_runTableQuery()`. The list in `<bee-occurrence-detail>` therefore continues to display the results from the _previous_ filter until the user manually navigates (e.g., changes page or clears selection). This is a functional regression from the pre-109 behaviour where any filter change triggered a fresh data load.

The guard at line 811 (`if (this._paneState !== 'list') this._paneState = 'collapsed'`) prevents the pane from collapsing, but without a corresponding list query the content is wrong.

**Fix:**
```typescript
// after clearing selections at line 810, add:
if (this._paneState === 'list') {
  this._listPage = 1;
  this._runListQuery();
}
```

---

### CR-02: `_onRegionClick` and `_onPlaceSelected` do not call `_runListQuery` when pane is already in list state

**File:** `src/bee-atlas.ts:648-730`

**Issue:** `_onRegionClick` (line 702-706) and `_onPlaceSelected` (line 726-729) call `_runFilterQuery()` and `_runTableQuery()` but never `_runListQuery()`. When the user has the list pane open and then map-clicks a county or place boundary, the filter state changes but the list does not refresh. `_openSidebarForFilter` (called on the selection path at line 695/719) does call `_runListQuery()`, but the deselect/collapse branch and any subsequent re-selection do not.

Concretely: if user selects county A (list opens, data loads via `_openSidebarForFilter` → `_runListQuery`), then shift-clicks county B to add it, `_runListQuery` is never called for the updated two-county filter. The list keeps showing county-A-only results.

**Fix:**
```typescript
// In _onRegionClick, after line 706 (_runTableQuery):
if (this._paneState === 'list') {
  this._listPage = 1;
  this._runListQuery();
}

// Similarly in _onPlaceSelected, after line 729:
if (this._paneState === 'list') {
  this._listPage = 1;
  this._runListQuery();
}
```

---

### CR-03: `filterStatesEqual` in `bee-filter-controls.ts` omits `selectedPlace` — external place selection does not sync token field

**File:** `src/bee-filter-controls.ts:83-95`

**Issue:** The `filterStatesEqual` function used in `updated()` to decide whether to re-sync local tokens from the incoming `filterState` prop does not compare `selectedPlace`. If `filterState.selectedPlace` changes (e.g., from a map boundary click handled by `bee-atlas`) but all other fields remain equal, `filterStatesEqual` returns `true` and the token list is _not_ regenerated. The UI in `bee-filter-controls` will not reflect the place filter chip. Note that `bee-pane.ts` has its own `updated()` that correctly syncs `_selectedPlace`, so this only affects `bee-filter-controls` which is a separate component currently in-tree.

**Fix:**
```typescript
function filterStatesEqual(a: FilterState, b: FilterState): boolean {
  return a.taxonName === b.taxonName
    && a.taxonRank === b.taxonRank
    && a.yearFrom === b.yearFrom
    && a.yearTo === b.yearTo
    && setsEqual(a.months, b.months)
    && setsEqual(a.selectedCounties, b.selectedCounties)
    && setsEqual(a.selectedEcoregions, b.selectedEcoregions)
    && a.selectedCollectors.length === b.selectedCollectors.length
    && a.selectedCollectors.every((c, i) => c.displayName === b.selectedCollectors[i]!.displayName)
    && a.elevMin === b.elevMin
    && a.elevMax === b.elevMax
    && a.selectedPlace === b.selectedPlace;  // add this line
}
```

---

## Warnings

### WR-01: `_runListQuery` uses `_tableSortBy` — list ordering coupled to table sort state

**File:** `src/bee-atlas.ts:487`

**Issue:** `_runListQuery` passes `this._tableSortBy` as the `sortBy` argument to `queryListPage`. The field name `_tableSortBy` signals table-specific state, not list-specific. If a user changes the table sort order and then returns to list view, the list silently re-orders. More critically, if a future "list sort" UI control is added, it will need a separate field or this coupling will cause confusion. No separate `_listSortBy` field exists.

This is a latent design bug that will manifest as user-visible list re-ordering on table sort interaction.

**Fix:** Either rename `_tableSortBy` to `_sortBy` (shared), or introduce a separate `_listSortBy` field initialized to `'date'` and pass it to `_runListQuery`.

---

### WR-02: `_onBoundaryModeChanged` does not refresh list when leaving places mode

**File:** `src/bee-atlas.ts:944-958`

**Issue:** When the user switches away from places boundary mode, `_onBoundaryModeChanged` clears `selectedPlace`, calls `_runFilterQuery()` and `_runTableQuery()`, but does NOT call `_runListQuery()`. If the list pane is open and was showing place-filtered results, those results persist after the place filter is cleared by changing boundary mode.

**Fix:**
```typescript
if (leavingPlaces) {
  this._filterState = { ...this._filterState, selectedPlace: null };
  this._tablePage = 1;
  this._runFilterQuery().then(() => { this._replaceUrlState(); });
  this._runTableQuery();
  if (this._paneState === 'list') {
    this._listPage = 1;
    this._runListQuery();
  }
}
```

---

### WR-03: HTTP responses not checked for `ok` before parsing JSON in `_loadBoundaryData`

**File:** `src/bee-map.ts:1023-1027`

**Issue:** `countiesResp` and `ecoregionsResp` are fetched but `resp.ok` is never checked before calling `.json()`. A 404 or 500 from the CDN will cause `.json()` to throw (or worse, parse an HTML error body as GeoJSON and silently populate the map with garbage), rather than surfacing a clear error. The `places` fetch also lacks this check.

**Fix:**
```typescript
if (!countiesResp.ok) throw new Error(`Counties fetch failed: ${countiesResp.status}`);
if (!ecoregionsResp.ok) throw new Error(`Ecoregions fetch failed: ${ecoregionsResp.status}`);
const countiesData = await countiesResp.json();
const ecoregionsData = await ecoregionsResp.json();
```

---

### WR-04: `yearBucketsToFilter` silently returns no-filter for the disjoint case `thisYear && !lastYear && earlier`

**File:** `src/bee-pane.ts:21`

**Issue:** The combination "This year and Earlier but NOT Last year" is logically disjoint (cannot express with a single range), so the function correctly returns `{ yearFrom: null, yearTo: null }`. However it does so silently — the UI checkboxes show a non-trivial selection but no filter is applied in SQL. A user checking "This year" and "Earlier" without "Last year" will see _all_ records, not just years ≤ PY−1 or ≥ CY. There is no feedback that the combination is inexpressible.

**Fix:** Two options:
1. Prevent the UI from reaching this state (disable "Earlier" when "This year" is on and "Last year" is off, or vice versa).
2. Log a development warning (even a `console.warn`) when the disjoint case is hit, so the behaviour is at least traceable. The current silent return violates the principle of least surprise.

---

### WR-05: `bee-pane.ts` eagerly imports `bee-table.ts` — defeats the code-split optimization in `bee-atlas.ts`

**File:** `src/bee-pane.ts:8`

**Issue:** `bee-pane.ts` has `import './bee-table.ts'` as a static top-level import (line 8). `bee-atlas.ts` dynamically imports `bee-table.ts` (lines 218, 901) specifically to defer its load until the user enters table mode. Because `bee-pane.ts` is itself a static import of `bee-atlas.ts` (line 9), the static chain means `bee-table.ts` loads at initial page load regardless, defeating the lazy-load intent.

**Fix:** Remove the static import from `bee-pane.ts:8`. The `<bee-table>` element will already be registered by the time it is needed because `bee-atlas.ts`'s dynamic imports fire before `_renderTableContent` is called (paneState transitions to 'table' → `_onPaneExpandTable` calls `import('./bee-table.ts')` → Lit re-renders → `_renderTableContent` is called).

---

## Info

### IN-01: `isFilterActive` imported but only used via `void` suppression in `bee-pane.ts`

**File:** `src/bee-pane.ts:3,1150`

**Issue:** `isFilterActive` is imported from `filter.ts` and then suppressed with `void isFilterActive` at line 1150 to silence a lint/TS unused-import warning. The import is vestigial; the active state is conveyed through the `filterActive: boolean` property passed from `bee-atlas`. The suppression anti-pattern is the smell — the import should simply be removed.

**Fix:** Remove `import { isFilterActive } from './filter.ts'` and the `void isFilterActive` line.

---

### IN-02: `window.location.pathname` evaluated inside `render()` in `bee-header.ts`

**File:** `src/bee-header.ts:79,89`

**Issue:** `window.location.pathname.startsWith(...)` is evaluated each time Lit calls `render()`. While not harmful on the client (pathname rarely changes mid-render), this pattern breaks SSR/prerender pipelines that Eleventy or future tooling might introduce, and it produces incorrect output if the component is rendered in a test or non-browser context. The value is invariant for the component's lifetime — it should be computed once.

**Fix:** Compute in `firstUpdated` or via a getter memoized on first call:
```typescript
private readonly _isSpeciesPage = window.location.pathname.startsWith('/species');
private readonly _isPlacesPage = window.location.pathname.startsWith('/places');
```

---

### IN-03: `_selectionDrawnGeneration` counter is incremented but never read

**File:** `src/bee-atlas.ts:62,742`

**Issue:** `_selectionDrawnGeneration` is declared as a private field (line 62) and incremented in `_onSelectionDrawn` (line 742), but is never read anywhere in the file. This appears to be a leftover from an earlier race-guard design that was replaced by `_listQueryGeneration`. It is dead code.

**Fix:** Remove the field declaration and the `++this._selectionDrawnGeneration` statement.

---

_Reviewed: 2026-05-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
