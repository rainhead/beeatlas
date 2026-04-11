---
phase: 40-bee-table-component
reviewed: 2026-04-07T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - frontend/src/url-state.ts
  - frontend/src/filter.ts
  - frontend/src/bee-atlas.ts
  - frontend/src/bee-table.ts
  - frontend/src/tests/url-state.test.ts
  - frontend/src/tests/filter.test.ts
  - frontend/src/tests/bee-table.test.ts
  - frontend/src/tests/bee-atlas.test.ts
findings:
  critical: 0
  warning: 4
  info: 2
  total: 6
status: issues_found
---

# Phase 40: Code Review Report

**Reviewed:** 2026-04-07
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Phase 40 delivers the `bee-table` component and its surrounding wiring: `queryTablePage` in `filter.ts`, sort/page URL persistence in `url-state.ts`, and the coordinator integration in `bee-atlas.ts`. The architecture is sound — pure presenter pattern is maintained, the SQL injection allowlist is in place, and the generation guard correctly prevents stale query results from landing. No critical issues found.

The four warnings are all real defects. Three are TypeScript compile-time errors (confirmed with `tsc --noEmit`) that will fail a strict CI build. One is a pagination display glitch during the initial loading phase. Two info items note a debug logging artifact and a magic-number inconsistency.

## Warnings

### WR-01: TypeScript type errors in url-state.test.ts — missing sortColumn/sortDir on UiState arguments

**File:** `frontend/src/tests/url-state.test.ts:75`, `89`, `102`, `143`
**Issue:** Four test cases pass object literals to `buildParams` as the `UiState` argument without the `sortColumn` and `sortDir` properties, which are required by the `UiState` interface. TypeScript reports TS2345 on all four call sites. The tests exercise real behavior (layerMode/boundaryMode/viewMode round-trips), but they will fail `tsc --noEmit` and will fail any CI step that type-checks before running Vitest.

Confirmed with `npx tsc --noEmit`:
```
src/tests/url-state.test.ts(76,78): error TS2345: Argument of type
  '{ layerMode: "samples"; boundaryMode: "off"; viewMode: "map"; }'
  is not assignable to parameter of type 'UiState'.
  Type ... is missing the following properties from type 'UiState': sortColumn, sortDir
```

**Fix:** Add `sortColumn` and `sortDir` to the four inline `ui` objects, or derive them from the existing `defaultUi` fixture via spread:

```typescript
// line 75 — was:
const ui = { layerMode: 'samples' as const, boundaryMode: 'off' as const, viewMode: 'map' as const };
// fix:
const ui = { ...defaultUi, layerMode: 'samples' as const };

// line 89:
const ui = { ...defaultUi, boundaryMode: 'counties' as const };

// line 102:
const ui = { ...defaultUi, viewMode: 'table' as const };

// line 143 (combined test):
const ui = { ...defaultUi, layerMode: 'samples' as const, boundaryMode: 'counties' as const, viewMode: 'table' as const };
```

---

### WR-02: TypeScript errors in filter.test.ts — possibly-undefined array element access

**File:** `frontend/src/tests/filter.test.ts:197`, `210`, `219`, `238`
**Issue:** Four `queryFn.mock.calls.find(...)` calls return `string[] | undefined` but the code immediately indexes into the result with `?.[0]`. TypeScript reports TS2532 ("Object is possibly 'undefined'") because `mock.calls` is typed as `any[][]` and `.find()` returns `string[] | undefined`. The code already uses optional chaining `?.[0]`, so runtime safety is fine, but the TS error surfaces because the return is then assigned to a non-optional variable without a null check.

Confirmed with `npx tsc --noEmit`:
```
src/tests/filter.test.ts(197,63): error TS2532: Object is possibly 'undefined'.
src/tests/filter.test.ts(210,63): error TS2532: Object is possibly 'undefined'.
src/tests/filter.test.ts(219,63): error TS2532: Object is possibly 'undefined'.
src/tests/filter.test.ts(238,63): error TS2532: Object is possibly 'undefined'.
```

**Fix:** Provide a typed intermediate and use a nullish coalesce on the final result, or widen the type:

```typescript
// Example for line 197:
const found = queryFn.mock.calls.find((c: string[]) => !c[0].includes('COUNT(*)'));
const dataSql: string = found?.[0] ?? '';
```

Apply the same pattern at lines 210, 219, and 238.

---

### WR-03: Pagination label shows "Showing 1–0 of 0 specimens" while loading

**File:** `frontend/src/bee-table.ts:204-208`
**Issue:** When `this.loading === true` and `this.rowCount === 0` (which is the initial state when switching to table view), `isEmptyState` is `false` (the loading guard prevents empty state), so the table skeleton and pagination bar render. `start` evaluates to `1`, `end` to `Math.min(100, 0) = 0`, and `totalPages` to `0`. The pagination bar then shows:

```
Showing 1–0 of 0 specimens   |  Prev  Page 1 of 0  Next
```

This text is exposed to users (and to the `aria-live="polite"` region) during the loading phase on first table open, and also whenever a filter change triggers a re-query.

**Fix:** Suppress the count label text while loading, or clamp `start` to never exceed `end`:

```typescript
// Option A — suppress label during load:
<span aria-live="polite" class="row-count">
  ${this.loading ? '' : `Showing ${start}–${end} of ${this.rowCount.toLocaleString()} ${noun}`}
</span>

// Option B — clamp start:
const start = this.rowCount === 0 ? 0 : (this.page - 1) * 100 + 1;
```

---

### WR-04: Unused import `beforeEach` in bee-table.test.ts

**File:** `frontend/src/tests/bee-table.test.ts:1`
**Issue:** `beforeEach` is imported from `vitest` but never called in the file. TypeScript reports TS6133 ("'beforeEach' is declared but its value is never read"). This is a confirmed compile error.

```
src/tests/bee-table.test.ts(1,38): error TS6133: 'beforeEach' is declared but its value is never read.
```

**Fix:** Remove `beforeEach` from the import statement:

```typescript
// was:
import { test, expect, describe, vi, beforeEach } from 'vitest';
// fix:
import { test, expect, describe, vi } from 'vitest';
```

---

## Info

### IN-01: Magic number 100 (PAGE_SIZE) hard-coded three times in bee-table.ts

**File:** `frontend/src/bee-table.ts:204-206`
**Issue:** The page size value `100` appears three times in the `render()` method (computing `start`, `end`, and `totalPages`), and also once in the disabled check for the Next button at line 273. `filter.ts` already defines `PAGE_SIZE = 100` but as a module-private constant (not exported). If the page size changes, `bee-table.ts` must be updated separately, creating a drift risk.

**Fix:** Export `PAGE_SIZE` from `filter.ts` and import it in `bee-table.ts`:

```typescript
// filter.ts — change line 50:
export const PAGE_SIZE = 100;

// bee-table.ts — add import:
import { PAGE_SIZE } from './filter.ts';

// bee-table.ts render():
const start = (this.page - 1) * PAGE_SIZE + 1;
const end = Math.min(this.page * PAGE_SIZE, this.rowCount);
const totalPages = Math.ceil(this.rowCount / PAGE_SIZE);
// ...
?disabled=${this.page * PAGE_SIZE >= this.rowCount}
```

---

### IN-02: console.debug calls left in production queryVisibleIds

**File:** `frontend/src/filter.ts:159-160`
**Issue:** Two `console.debug` calls print the generated SQL WHERE clauses on every filter query:

```typescript
console.debug('[filter-sql] ecdysis WHERE:', ecdysisWhere);
console.debug('[filter-sql] samples WHERE:', samplesWhere);
```

These fire in production and expose SQL structure in the browser console for every user interaction that triggers a filter. While harmless from a security perspective (DuckDB is client-side), they are development artifacts and add noise to production logs.

**Fix:** Remove both lines, or guard them behind a development flag:

```typescript
if (import.meta.env.DEV) {
  console.debug('[filter-sql] ecdysis WHERE:', ecdysisWhere);
  console.debug('[filter-sql] samples WHERE:', samplesWhere);
}
```

---

_Reviewed: 2026-04-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
