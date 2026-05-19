---
phase: 106-bee-atlas-state-machine
reviewed: 2026-05-19T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - src/bee-atlas.ts
  - src/url-state.ts
  - src/tests/bee-atlas.test.ts
  - src/tests/bee-sidebar.test.ts
  - src/tests/url-state.test.ts
findings:
  critical: 2
  warning: 4
  info: 3
  total: 9
status: issues_found
---

# Phase 106: Code Review Report

**Reviewed:** 2026-05-19
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

The Phase 106 implementation migrates `_viewMode` + `_sidebarOpen` into a unified `_paneState: 'collapsed' | 'list' | 'table'` field and wires `paneState` through the URL state contract. The overall structure is sound and the test suite has good coverage of the structural invariants. Two critical bugs were found: a SQL injection path in `_restoreSelectionOccurrences` and a `_pushUrlState` double-write that pushes a history entry unconditionally on every call including view moves, causing runaway history growth. Four warnings cover logic gaps in the `_onPopState` pane-vs-selection interaction, a stale `_tableLoading` flag, a silent `_loadSummaryFromSQLite` early-exit that swallows the `_loading = false` on a legitimate empty-DB state, and a missing `_visibleIds` reset on popstate when filter becomes inactive.

---

## Critical Issues

### CR-01: SQL injection via URL-controlled IDs in `_restoreSelectionOccurrences`

**File:** `src/bee-atlas.ts:954-958`

**Issue:** `ecdysisIds` and `inatIds` are string arrays derived from `parseOccId` which extracts the `numericId` as a number then re-casts it to `String(parsed.numericId)`. The downstream validation at line 948 checks `!/^\d+$/.test(id)` — but the array is built from `parseOccId` results, not directly from the raw URL string. If `parseOccId` is ever changed to pass through the raw segment without fully parsing it (or if a future caller passes unvalidated strings), the guard provides false assurance because the actual SQL at line 955 uses string interpolation directly into the query rather than parameterised binding:

```typescript
conditions.push(`CAST(ecdysis_id AS TEXT) IN (${ecdysisIds.map(id => `'${id}'`).join(',')})`);
```

The IDs originate from `window.location.search`, a fully attacker-controlled surface. Even though `parseOccId` currently produces only integers, the guard comment ("If this assertion fails…") acknowledges the assumption is fragile. A crafted URL such as `o=ecdysis:1` followed by whitespace-normalised smuggling is blocked today, but the correct fix is parameterised queries, not a post-hoc assertion. The same pattern appears for `inatIds`.

**Fix:** Use parameterised placeholders via the wa-sqlite `exec` API's bind-value support, or at minimum inline only `Number`-coerced values:

```typescript
// Safe: coerce to integer before interpolation
conditions.push(
  `CAST(ecdysis_id AS TEXT) IN (${ecdysisIds.map(id => String(parseInt(id, 10))).join(',')})`
);
```

The cleanest fix is to restructure to use `?` placeholders and pass values as the bind array, which eliminates the injection surface entirely.

---

### CR-02: `_pushUrlState` always schedules a `pushState` entry — history grows unboundedly on view moves

**File:** `src/bee-atlas.ts:498-515`

**Issue:** `_pushUrlState` is called on every view-move debounce tick (via `_onViewMoved`). The implementation does two things every time it is called: (1) immediately calls `replaceState` with the current URL, then (2) schedules a `pushState` 500 ms later. The intent is debouncing so only the final resting position creates a new history entry. However, the `replaceState` + `setTimeout(pushState)` pattern has a race: if the user stops moving the map, the `pushState` fires and adds a history entry. If the user then clicks a filter chip or opens the sidebar, `_pushUrlState` is called again, which calls `replaceState` (correct) AND schedules another `pushState`. That scheduled entry then fires 500 ms later even though the user's intent was only to update in-place. This means every non-view-move action (filter change, close sidebar) also produces an unwanted extra history entry, breaking the back-button affordance and causing history to grow at roughly 2x the expected rate.

The guard `if (this._mapMoveDebounce) clearTimeout(this._mapMoveDebounce)` in `_onPopState` is correct, but `_pushUrlState` itself does not distinguish between "I was called for a view move" and "I was called for a state change that should replace only". The `pushState` should only be scheduled when the call originates from `_onViewMoved`, not from every caller.

**Fix:** Split the scheduling concern out of `_pushUrlState`:

```typescript
private _replaceUrlState() {
  const params = this._buildCurrentParams();
  window.history.replaceState({}, '', '?' + params.toString());
}

private _pushUrlStateDebounced() {
  // Called only from _onViewMoved
  this._replaceUrlState();
  if (this._mapMoveDebounce) clearTimeout(this._mapMoveDebounce);
  this._mapMoveDebounce = setTimeout(() => {
    window.history.pushState({}, '', '?' + this._buildCurrentParams().toString());
    this._mapMoveDebounce = null;
  }, 500);
}
```

All callers except `_onViewMoved` should call `_replaceUrlState()`. `_onViewMoved` should call `_pushUrlStateDebounced()`.

---

## Warnings

### WR-01: `_onPopState` sets `_paneState` twice when selection is type `ids`, `cluster`, or `bounds`

**File:** `src/bee-atlas.ts:549-585`

**Issue:** `_onPopState` assigns `this._paneState = paneState` at line 550 (from the parsed `pane=` URL param), then immediately overwrites it with `'list'` inside each of the `ids`, `cluster`, and `bounds` selection branches (lines 562, 569, 577). The `else` branch (no selection) also overwrites with `'collapsed'` at line 584. This means the value of `pane=` in the URL is ignored whenever a selection is present or absent — the pane state is always computed from the selection type, not from the URL param.

This is likely intentional for the selection-present cases (a selection implies `list`), but the double-assignment is misleading and could mask a future bug where the URL correctly encodes `pane=table` alongside a selection. More concretely: if `pane=table` is in the URL along with `o=ecdysis:123` (which can happen if the user had table mode open then clicked a point before navigating back), `_onPopState` will override to `list` rather than restoring the intended `table` state, and `_runTableQuery` at line 553 will be skipped because it is guarded by `if (this._paneState === 'table')` which evaluates against the intermediate value before the overwrite.

**Fix:** Hoist the selection-type-to-pane-state derivation before the `_runTableQuery` guard, or remove the intermediate `this._paneState = paneState` assignment and derive `_paneState` as a single expression after the selection branch:

```typescript
// Derive final paneState in one place after selection branch resolution
const finalPaneState = parsedSel?.type === 'ids' && parsedSel.ids.length > 0 ? 'list'
  : parsedSel?.type === 'cluster' ? 'list'
  : parsedSel?.type === 'bounds' ? 'list'
  : paneState;  // fall back to URL-encoded value
this._paneState = finalPaneState;
if (finalPaneState === 'table') {
  this._runTableQuery();
}
```

---

### WR-02: `_tableLoading` not reset when `_runTableQuery` early-exits

**File:** `src/bee-atlas.ts:464-494`

**Issue:** `_runTableQuery` sets `this._tableLoading = true` at line 466 before the guard `if (this._paneState !== 'table') return` — wait, actually the guard is on line 465 before the assignment. However, the `finally` block at line 491 unconditionally sets `this._tableLoading = false`. The real problem is subtler: when a stale-generation result is discarded at line 482 (`if (generation !== this._tableQueryGeneration) return`), the function returns inside the `try` block **before** the `finally` block runs. `finally` blocks in JavaScript/TypeScript always run even when `return` is inside `try`, so `_tableLoading` is correctly cleared. This is actually fine.

But the complementary issue is at `_onViewChanged` (line 826): when switching to table mode, `this._tableLoading = true` is set before `_runTableQuery()` is called, but if `loadOccurrencesTable` hasn't resolved yet the table query will return early (the internal `await queryTablePage` will likely throw or return empty), leaving `_tableLoading` stuck at `true` until `_onDataLoaded` fires and calls `_runTableQuery` again. If `_onDataLoaded` is never called (e.g., data was already loaded before the view switch), `_tableLoading` will correctly be cleared by the `finally` block. The scenario to worry about: `_onViewChanged` sets `_tableLoading = true`, calls `_runTableQuery`, `_runTableQuery` completes successfully and sets `_tableLoading = false` in `finally`, then `loadSummaryFromSQLite` is called and sets `this._loading = false` without touching `_tableLoading`. This is correct. **Downgrading severity:** this warning is more about the unconditional `this._tableLoading = true` at line 826 in `_onViewChanged` that could briefly show a loader even when the table is not actually requerying. Low impact.

Actually, examining the real bug: `_runTableQuery` at line 491–493 clears `_tableLoading` in `finally` regardless of whether the generation check discarded the result. When a newer query is in flight, the older query's `finally` will clear `_tableLoading = false` while the newer query is still running. The user sees: loading spinner disappears, then data arrives (or another loading state never reappears). This is the genuine defect.

**Fix:** Only clear `_tableLoading` in `finally` when this is the current generation:

```typescript
} finally {
  // Only clear loading flag if this query is still current;
  // if superseded, the active query controls the loading state.
  if (generation === this._tableQueryGeneration) {
    this._tableLoading = false;
  }
}
```

---

### WR-03: `_loadSummaryFromSQLite` early-exit before setting `_loading = false`

**File:** `src/bee-atlas.ts:359`

**Issue:** When the summary query returns zero rows (`Object.keys(summaryRow).length === 0`), the method returns early after setting `this._loading = false`:

```typescript
if (Object.keys(summaryRow).length === 0) { this._loading = false; return; }
```

This appears correct in isolation. However, the method is called from `_onViewChanged` (line 829) when `this._loading` is already `true` (the parquet data hasn't loaded yet). If the SQLite query legitimately returns an empty result set (no specimens in DB during development or test), `_loading` is correctly cleared. But the issue is that `_loadSummaryFromSQLite` also runs the taxa/county/ecoregion queries that populate the filter dropdowns. If the early-exit fires, those queries are skipped silently, leaving `_taxaOptions`, `_countyOptions`, and `_ecoregionOptions` as empty arrays with no user-visible error or indication that the DB is empty. The filter panel dropdowns will appear empty with no explanation.

**Fix:** Add a log statement or set a visible empty-state indicator:

```typescript
if (Object.keys(summaryRow).length === 0) {
  console.warn('Summary query returned no rows — DB may be empty');
  this._loading = false;
  return;
}
```

More robustly, consider separating the `_loading = false` that indicates "initial data fetch done" (which should only be set by `_onDataLoaded` / `_onDataError`) from the SQLite-specific loading state.

---

### WR-04: `_visibleIds` not reset on popstate when filter becomes inactive

**File:** `src/bee-atlas.ts:587-593`

**Issue:** In `_onPopState`, when `isFilterActive(this._filterState)` is true, `_runFilterQuery()` is called, which will eventually set `_visibleIds`. When the filter is inactive, the `else` branch sets `this._visibleIds = null` (correct). However, there is a window between when `_onPopState` fires and when the async `_runFilterQuery` resolves where `_visibleIds` still holds the previous filter's ID set. This stale `_visibleIds` value is passed to `<bee-map>`, which will render only the previously-filtered dots until the new query resolves.

Critically, the guard in `firstUpdated` (line 266-268) proactively sets `_visibleIds = new Set()` (empty, not null) to prevent a flash of unfiltered dots. The same hide-all pattern should be applied on popstate when a filter is active:

```typescript
if (isFilterActive(this._filterState)) {
  this._visibleIds = new Set(); // hide all until query resolves
  this._runFilterQuery();
} else {
  this._visibleIds = null;
  this._filteredRowCount = null;
}
```

Without this, navigating backward from a narrow filter to a broader filter causes a momentary flash of the narrow filter's dots rather than showing "everything" while the new broader query runs.

---

## Info

### IN-01: `console.debug` left in production path

**File:** `src/bee-atlas.ts:305`

**Issue:** `console.debug('SQLite tables ready')` fires on every page load in production. While `console.debug` is suppressed in most browser devtools by default, it represents an unintentional debug artifact in a hot code path.

**Fix:** Remove the statement, or guard it behind a `__DEV__` / `import.meta.env.DEV` check.

---

### IN-02: `(err as any)?.code` cast in `_loadSummaryFromSQLite`

**File:** `src/bee-atlas.ts:408`

**Issue:** `(err as any)?.code` uses an unsafe `any` cast to access a non-standard `code` property on the error object. This is a type safety gap; if the error shape changes, it will silently produce `undefined` with no compile-time warning.

**Fix:** Use a type guard:

```typescript
const code = err !== null && typeof err === 'object' && 'code' in err ? (err as { code: unknown }).code : undefined;
```

---

### IN-03: `_tableFilterOpen` is a non-reactive private field used to drive UI state via imperative DOM manipulation

**File:** `src/bee-atlas.ts:53, 840-843`

**Issue:** `_tableFilterOpen` is declared without `@state()` and mutated in `_onToggleFilter` via a direct `shadowRoot?.querySelector` + `(el as any)?.setOpen(...)` call. This breaks Lit's reactive data-flow model (architecture invariant: pure presenters receive state as properties). If `bee-filter-panel` is re-rendered by Lit (e.g., due to any `@state` change), the imperatively-set open state will be lost because the property binding `.openUpward=...` does not include open/closed state, meaning the filter panel's open state is invisible to the Lit render cycle.

**Fix:** Promote `_tableFilterOpen` to `@state()` and pass it as a property to `bee-filter-panel` (e.g., `.open=${this._tableFilterOpen}`), then have `bee-filter-panel` respond declaratively.

---

_Reviewed: 2026-05-19_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
