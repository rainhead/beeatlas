---
phase: 61-duckdb-removal
reviewed: 2026-04-16T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - frontend/package.json
  - frontend/tsconfig.json
  - frontend/src/bee-atlas.ts
  - BENCHMARK.md
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 61: Code Review Report

**Reviewed:** 2026-04-16
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Phase 61 removes the DuckDB WASM dependency and cleans up the codebase after the wa-sqlite migration completed in phase 60. The diff is primarily a removal: `duckdb` is gone from `package.json`, the `BENCHMARK.md` is updated, and `bee-atlas.ts` likely received minor cleanup. No DuckDB references survive anywhere in the frontend source tree.

The code is generally in good shape. Three warnings and two info items were found, none of which are regressions introduced by this phase — they are pre-existing issues now visible at review time.

## Warnings

### WR-01: `FilterChangedEvent` fields accessed via `as any` cast

**File:** `frontend/src/bee-atlas.ts:615-616`
**Issue:** `elevMin` and `elevMax` are typed members of `FilterChangedEvent` (defined in `bee-sidebar.ts:70-71`), yet they are read with `(detail as any).elevMin` and `(detail as any).elevMax`. The cast suppresses type-checking that would catch a rename or type change in `FilterChangedEvent`, silently breaking the elevation filter without a compile error.
**Fix:** Remove the cast — both fields exist on the typed event:
```typescript
this._filterState = {
  taxonName: detail.taxonName,
  taxonRank: detail.taxonRank,
  yearFrom: detail.yearFrom,
  yearTo: detail.yearTo,
  months: detail.months,
  selectedCounties: detail.selectedCounties,
  selectedEcoregions: detail.selectedEcoregions,
  selectedCollectors: detail.selectedCollectors,
  elevMin: detail.elevMin,
  elevMax: detail.elevMax,
};
```

### WR-02: `_pushUrlState` schedules a `pushState` after every non-map-move call

**File:** `frontend/src/bee-atlas.ts:424-437`
**Issue:** `_pushUrlState` always calls `replaceState` immediately and then schedules a `pushState` 500 ms later. The debounce is intended for map pan/zoom so each move does not create a history entry. However, every other caller — filter changes, layer toggle, view mode toggle, close sidebar — also schedules this delayed `pushState`. If two filter changes arrive within 500 ms (e.g., user clears taxon chip then clears a county chip), the first debounce is cleared, the second replaces it — that is correct. But for non-map actions the `pushState` is effectively certain to fire, creating a history entry for *every* filter chip removal regardless of user intent. The more significant risk: `_onClose` calls `_pushUrlState`, which starts a 500 ms timer; if the user then pans the map before 500 ms, `clearTimeout` in `_onViewMoved → _pushUrlState` kills the first timer and the params captured at close-time are pushed with stale view coordinates instead.
**Fix:** Separate map-move debouncing from discrete-action history writes. For non-map-move events, call `window.history.pushState` directly (no debounce). Reserve the debounce path for `_onViewMoved` only:
```typescript
private _pushUrlState(debounce = false) {
  const params = buildParams(/* ... */);
  window.history.replaceState({}, '', '?' + params.toString());
  if (debounce) {
    if (this._mapMoveDebounce) clearTimeout(this._mapMoveDebounce);
    this._mapMoveDebounce = setTimeout(() => {
      window.history.pushState({}, '', '?' + params.toString());
      this._mapMoveDebounce = null;
    }, 500);
  } else {
    if (this._mapMoveDebounce) clearTimeout(this._mapMoveDebounce);
    window.history.pushState({}, '', '?' + params.toString());
  }
}
```
Then call `this._pushUrlState(true)` only from `_onViewMoved`.

### WR-03: `_loadCollectorOptions` is called from both `_onDataLoaded` and `_onSampleDataLoaded` with no guard

**File:** `frontend/src/bee-atlas.ts:712-721`
**Issue:** In map view, `bee-map` fires `data-loaded` first and then `sample-data-loaded`. Both handlers call `this._loadCollectorOptions()`, so the collector JOIN query runs twice on every page load in map view. The second run is redundant. In addition, there is no generation guard on `_loadCollectorOptions`, so if the second call resolves before the first (unlikely but possible over slow networks), `_collectorOptions` is overwritten by an identical result — harmless but indicative of missing guard discipline.
**Fix:** Add a guard flag or move the call to only one handler. Since `sample-data-loaded` fires last and depends on both tables being fully populated, prefer calling there only:
```typescript
private _onDataLoaded(e: CustomEvent<...>) {
  this._summary = e.detail.summary;
  this._taxaOptions = e.detail.taxaOptions;
  this._loading = false;
  // do NOT call _loadCollectorOptions here — wait for sample-data-loaded
  // ...rest unchanged...
}

private _onSampleDataLoaded() {
  this._loading = false;
  this._loadCollectorOptions(); // sole call site
}
```

## Info

### IN-01: Duplicate `^\d+$` regex check in `_restoreSelectionSamples`

**File:** `frontend/src/bee-atlas.ts:743` and `748`
**Issue:** The integer-suffix guard `/^\d+$/.test(id)` is applied twice in sequence — first at line 743 when building `ecdysisIds`, then again at line 748 when building `safeIds`. The second filter is a no-op because `ecdysisIds` already contains only digit strings. The comment "Belt-and-suspenders" acknowledges the redundancy but the duplication adds noise and could mislead a future editor into thinking the two arrays can differ.
**Fix:** Remove the redundant filter:
```typescript
const ecdysisIds = occIds
  .filter(id => id.startsWith('ecdysis:'))
  .map(id => id.slice('ecdysis:'.length))
  .filter(id => /^\d+$/.test(id));
if (ecdysisIds.length === 0) return;
const { sqlite3, db } = await getDB();
const idList = ecdysisIds.map(id => `'${id}'`).join(',');
```

### IN-02: `hyparquet` remains in `dependencies` after DuckDB removal; review whether it is still needed

**File:** `frontend/package.json:25`
**Issue:** `hyparquet` is listed as a runtime dependency. Phase 61 removes DuckDB, and `sqlite.ts` still imports `asyncBufferFromUrl` and `parquetReadObjects` from `hyparquet` to load parquet files into wa-sqlite. So the dependency is currently active. However, the project memory notes that the long-term direction (v1.7+) is "DuckDB DB → parquet transfer → DuckDB WASM in browser; replaces hyparquet + FilterState". If the current wa-sqlite path is the durable path, `hyparquet` is legitimately needed and this is not an issue. If there is a plan to replace the parquet-read step, this is worth flagging as a tracked item.

No action required unless the architecture shifts. Noting here for visibility.

---

_Reviewed: 2026-04-16_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
