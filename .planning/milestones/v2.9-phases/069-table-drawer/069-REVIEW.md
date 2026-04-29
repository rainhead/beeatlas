---
phase: 069-table-drawer
reviewed: 2026-04-21T01:06:25Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - frontend/src/bee-atlas.ts
  - frontend/src/bee-table.ts
  - frontend/src/tests/bee-table.test.ts
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 069: Code Review Report

**Reviewed:** 2026-04-21T01:06:25Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

This phase introduces the `<bee-table>` component as an absolute-positioned drawer overlay over `<bee-map>`, wired into `<bee-atlas>` with pagination, sort, CSV download, and row-pan interactions. The architecture correctly follows the project's state-ownership invariant (all reactive state in `bee-atlas`; `bee-table` is a pure presenter). The generation-guard pattern is applied to both the filter and table async queries, preventing stale overwrites.

Three warnings are noted: a `_tableLoading` premature-clear race in the generation guard, a stale-query path that can leave `_tableLoading = true` indefinitely, and a `start`/`end` display miscalculation when `rowCount === 0`. Three info items cover magic numbers, a type suppression, and a minor accessibility gap in the sort headers.

---

## Warnings

### WR-01: `_tableLoading` cleared by stale query, can cause spurious "not loading" flash

**File:** `frontend/src/bee-atlas.ts:416-418`

**Issue:** The `finally` block in `_runTableQuery` unconditionally sets `_tableLoading = false`, regardless of whether the completing query is stale. If query generation 1 resolves *after* generation 2 has started (i.e., generation 2 is still in-flight), generation 1's `finally` clears `_tableLoading` while generation 2 is still running. The table will briefly show the spinner-less state mid-load before generation 2's `finally` fires.

The comment "the active query will set it again if needed" is only accurate if the active query has not yet reached its `await`. If it has, the loading indicator is already gone.

**Fix:**
```typescript
} finally {
  // Only clear loading if no newer query has started.
  if (generation === this._tableQueryGeneration) {
    this._tableLoading = false;
  }
}
```

---

### WR-02: `_tableLoading` left `true` permanently when `_viewMode` changes to `'map'` mid-query

**File:** `frontend/src/bee-atlas.ts:400-401`

**Issue:** `_runTableQuery` returns immediately (without clearing `_tableLoading`) if `this._viewMode !== 'table'` at entry time. However, the caller in `_onViewChanged` sets `this._tableLoading = true` (line 631) *before* calling `_runTableQuery`. If the user switches view-mode to `'table'` and then back to `'map'` quickly enough that the query fires before the in-flight query resolves, any subsequent switch back to table mode will find `_tableLoading` already `true` from the last run, and the spinner will be visible immediately — which is fine. But if `_runTableQuery` is called while `_viewMode` is already `'map'` (e.g., from `_onFilterChanged` at line 625), the early-return path skips the `finally`, leaving `_tableLoading` as whatever the previous query left it. Currently `_tableLoading` starts `false` and `_onFilterChanged` only calls `_runTableQuery` (not the loading setter), so the impact is low — but it is a latent correctness issue if the call order changes.

The more acute scenario: `_onViewChanged` line 631 sets `_tableLoading = true`, then immediately calls `_runTableQuery` which could return early at line 401 if by the time the method body runs the viewMode has been toggled back (unlikely in one tick, but possible in tests). In that case `_tableLoading` is stuck `true` with no `finally` to clear it.

**Fix:** Move the `_tableLoading = true` assignment inside `_runTableQuery`, after the guard, or ensure the early-return path resets it:
```typescript
private async _runTableQuery(): Promise<void> {
  if (this._viewMode !== 'table') {
    this._tableLoading = false;  // ensure loading is cleared if called incorrectly
    return;
  }
  this._tableLoading = true;
  // ... rest unchanged
```

---

### WR-03: Row-count display shows "Showing 1–0 of 0 occurrences" edge case on empty result

**File:** `frontend/src/bee-table.ts:224-225`

**Issue:** When `rowCount === 0`, the `start` and `end` computations yield `start = 1` and `end = 0` (since `Math.min(1 * 100 - 99, 0) = 0`... actually `start = (1-1)*100+1 = 1`, `end = Math.min(100, 0) = 0`). The template at line 290 renders the `rowCount === 0` branch separately ("No occurrences match…"), so this never reaches the "Showing X–Y of Z" string — but the `isEmptyState` guard at line 228 only controls whether the *table body* renders; the pagination bar at line 288 is always rendered and uses the `rowCount === 0` branch of the ternary (line 290), so the string "No occurrences match…" displays in the row-count span correctly.

However, the `start`/`end` variables are still computed before the guard and used directly in the template (line 290 second branch). If `rowCount` is 0 but `loading` is true (`isEmptyState` is false), the table renders with the table body but the row-count span still takes the `rowCount === 0` branch — this is correct. The true edge case: page=5, rowCount=427 computes `start=401`, `end=427` — that matches the test. But if a filter changes mid-page (page stays at 5 but new rowCount is 200), `start=401`, `end=200` — giving "Showing 401–200 of 200 occurrences". `bee-atlas` resets `_tablePage = 1` on filter change (lines 621, 652) and on sort change (line 653), so this scenario requires the page to drift without a reset. The `_onPopState` restores `_tablePage = 1` at line 473. This is guarded in practice but not in `bee-table` itself.

**Fix:** Clamp `start` and `end` defensively in the component:
```typescript
const start = this.rowCount === 0 ? 0 : (this.page - 1) * 100 + 1;
const end = Math.min(this.page * 100, this.rowCount);
```
This makes the component safe if page is ever out of sync with rowCount, and avoids a confusing "Showing 1–0" string if the guard ever fails.

---

## Info

### IN-01: Magic number `100` (page size) duplicated across `bee-table.ts` and `filter.ts`

**File:** `frontend/src/bee-table.ts:224-225, 226, 301`

**Issue:** The page size of 100 appears as a literal in three places in `bee-table.ts` (start/end computation, totalPages, and the Next-button disabled predicate) and is defined as `PAGE_SIZE = 100` in `filter.ts` (line 63) but not exported. If the page size changes, `bee-table.ts` will silently diverge.

**Fix:** Export `PAGE_SIZE` from `filter.ts` and import it in `bee-table.ts`, or accept it as a property with a sensible default.

---

### IN-02: `(detail as any).elevMin` / `(detail as any).elevMax` type suppression in `_onFilterChanged`

**File:** `frontend/src/bee-atlas.ts:611-612`

**Issue:** The `elevMin` and `elevMax` fields are cast via `as any` when reading from `FilterChangedEvent`, suggesting they may not be present in the event's declared type. If `FilterChangedEvent` is updated to drop these fields, the cast silently hides the regression.

**Fix:** Add `elevMin` and `elevMax` to `FilterChangedEvent`'s type definition in `bee-sidebar.ts` so the cast is unnecessary.

---

### IN-03: Sortable column headers lack `aria-sort` attribute

**File:** `frontend/src/bee-table.ts:248-253`

**Issue:** The `<th>` elements for sortable columns have a visual indicator (`▼`) for the active sort, but no `aria-sort` attribute. Screen readers cannot determine the current sort direction or which column is sorted.

**Fix:**
```typescript
return html`
  <th style="min-width: ${col.minWidth}" class="sortable"
      aria-sort=${isActive ? 'descending' : 'none'}
      @click=${() => this._onSortClick(col.key as SpecimenSortBy)}>
    ${col.label}${isActive
      ? html`<span class="sort-indicator" aria-hidden="true">\u25BC</span>`
      : nothing}
  </th>`;
```

---

_Reviewed: 2026-04-21T01:06:25Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
