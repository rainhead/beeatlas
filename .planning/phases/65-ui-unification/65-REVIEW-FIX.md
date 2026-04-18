---
phase: 65-ui-unification
fixed_at: 2026-04-17T22:35:03Z
review_path: .planning/phases/65-ui-unification/65-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 4
skipped: 1
status: partial
---

# Phase 65: Code Review Fix Report

**Fixed at:** 2026-04-17T22:35:03Z
**Source review:** .planning/phases/65-ui-unification/65-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (CR-01, WR-01, WR-02, WR-03, WR-04)
- Fixed: 4
- Skipped: 1

## Fixed Issues

### CR-01: SQL injection via URL-supplied IDs in `_restoreSelectionOccurrences`

**Files modified:** `frontend/src/bee-atlas.ts`
**Commit:** 10e270f
**Applied fix:** Added a defence-in-depth assertion block before the SQL construction that checks all IDs against `/^\d+$/` and returns early with a console error if any fail. Added a comment explaining the invariant so future developers understand why the regex guard must not be removed.

### WR-01: `_tableLoading` not reset when generation guard fires during error path

**Files modified:** `frontend/src/bee-atlas.ts`
**Commit:** 10e270f
**Applied fix:** Removed the generation guard from the `finally` block in `_runTableQuery`. `_tableLoading` is now always set to `false` in `finally`, preventing the spinner from getting stuck when a stale query's error path races with a newer query.

### WR-02: Race condition — `_onDataLoaded` may trigger a second `_runFilterQuery` after one is already in flight

**Files modified:** `frontend/src/bee-atlas.ts`
**Commit:** 10e270f
**Applied fix:** Added `&& this._visibleIds === null` guard to the `_runFilterQuery` call in `_onDataLoaded`. If `firstUpdated` already started a query that resolved and populated `_visibleIds`, the redundant second invocation is skipped.

### WR-04: `dLon` not capped against near-polar latitude producing unbounded bounding-box scan

**Files modified:** `frontend/src/bee-atlas.ts`
**Commit:** 10e270f
**Applied fix:** Wrapped the `dLon` computation in `Math.min(..., 180)` so that polar latitudes cannot expand the longitude bounding box beyond a full hemisphere, preventing a DoS-by-URL attack that would cause an unresponsive tab.

## Skipped Issues

### WR-03: `_pushUrlState` races with itself when called from within `.then()` of `_runFilterQuery`

**File:** `frontend/src/bee-atlas.ts:563-565`
**Reason:** The suggested fix (calling `_pushUrlState` synchronously before `_runFilterQuery` fire-and-forget) changes the call pattern significantly. In the current code, `_pushUrlState` is called after the filter query resolves so the URL reflects the settled state. Pushing URL state before the query completes would mean the URL can be written before `_visibleIds` is updated. The reviewer acknowledges this is low-priority and benign in practice. Applying the suggested refactor without a broader audit of all call sites risks introducing new ordering bugs. Skipped for human review.

---

_Fixed: 2026-04-17T22:35:03Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
