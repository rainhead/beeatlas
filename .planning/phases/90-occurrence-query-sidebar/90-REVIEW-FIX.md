---
phase: 90-occurrence-query-sidebar
fixed_at: 2026-05-15T09:00:00Z
review_path: .planning/phases/90-occurrence-query-sidebar/90-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 90: Code Review Fix Report

**Fixed at:** 2026-05-15T09:00:00Z
**Source review:** .planning/phases/90-occurrence-query-sidebar/90-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (CR-01, CR-02, WR-01, WR-02, WR-03)
- Fixed: 5
- Skipped: 0

## Fixed Issues

### CR-01: `is_provisional` always evaluates to falsy

**Files modified:** `src/sqlite.ts`, `src/bee-occurrence-detail.ts`
**Commit:** a5bebe7
**Applied fix:** Added `if (typeof v === 'boolean') return v ? '1' : '0';` after the null check in `_escapeSqlValue` in `sqlite.ts`. Changed `row.is_provisional === true` to `row.is_provisional` (truthy check) in `bee-occurrence-detail.ts` line 256, so the comparison works with both old TEXT data and the corrected integer values.

---

### CR-02: `_onPopState` opens sidebar without restoring `_selectedOccurrences`

**Files modified:** `src/bee-atlas.ts`
**Commit:** 8e239c8
**Applied fix:** In `_onPopState`, added `this._selectedOccurrences = null` and a call to `this._restoreSelectionOccurrences(parsedSel.ids)` in the `ids` branch, and `this._selectedOccurrences = null` plus `this._restoreClusterSelection(this._selectedCluster)` in the `cluster` branch. This matches the pattern used in `_onDataLoaded`.

---

### WR-01: `_onSelectionDrawn` has no generation guard against concurrent draws

**Files modified:** `src/bee-atlas.ts`
**Commit:** d5c786c
**Applied fix:** Added `private _selectionDrawnGeneration = 0` to the non-reactive fields section. At the start of `_onSelectionDrawn`, added `const generation = ++this._selectionDrawnGeneration`. After the `await queryOccurrencesByBounds` resolves, added `if (generation !== this._selectionDrawnGeneration) return` before any state mutation.

---

### WR-02: `_onSelectionDrawn` has no try/catch around the await

**Files modified:** `src/bee-atlas.ts`
**Commit:** fdadb62
**Applied fix:** Wrapped the `await queryOccurrencesByBounds(...)` call and all subsequent state mutations in a try/catch block that logs `console.error('Bounds query failed:', err)`, matching the error-handling pattern used by all other async DB handlers in the file.

---

### WR-03: `(detail as any).elevMin` / `(detail as any).elevMax` bypasses TypeScript

**Files modified:** `src/bee-atlas.ts`
**Commit:** e592887
**Applied fix:** Replaced `(detail as any).elevMin ?? null` and `(detail as any).elevMax ?? null` with `detail.elevMin ?? null` and `detail.elevMax ?? null`. `FilterChangedEvent` already declares these fields as `number | null`, so the casts were unnecessary.

---

## Test Results

After all fixes, `npm test` reports 358 tests passing, 4 skipped (intentional), 22 suites passing. The one failing suite (`build-output.test.ts`) fails due to a pre-existing data validation issue with test fixture `Osmia testfaker` having an invalid license — this failure was present before any of the fixes and is unrelated to the code changes.

---

_Fixed: 2026-05-15T09:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
