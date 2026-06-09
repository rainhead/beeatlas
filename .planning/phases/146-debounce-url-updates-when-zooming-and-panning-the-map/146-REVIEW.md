---
phase: 146-debounce-url-updates-when-zooming-and-panning-the-map
reviewed: 2026-06-09T20:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - src/bee-atlas.ts
  - src/tests/bee-atlas.test.ts
findings:
  critical: 1
  warning: 3
  info: 1
  total: 5
status: issues_found
---

# Phase 146: Code Review Report

**Reviewed:** 2026-06-09T20:00:00Z
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Phase 146 replaces a 500ms debounced `pushState` (the old `_pushUrlStateDebounced` + `_mapMoveDebounce` timer) with session-coalescing via `_viewportSessionActive`. The state-machine logic in `bee-atlas.ts` is sound — the three reset paths (`_replaceUrlState`, `_onPopState`, initial `false`) are all in place, and the `_filterResolving` and `_isRestoringFromHistory` guards are preserved without regression.

One broken test in a file that was not updated causes the test suite to be red. Three test-quality gaps reduce confidence in the behavioral proofs.

---

## Critical Issues

### CR-01: `_pushUrlStateDebounced` call in legacy-taxon test file causes TypeError at runtime

**File:** `src/tests/bee-atlas-legacy-taxon.test.ts:61`
**Issue:** `_pushUrlStateDebounced` was removed from `bee-atlas.ts` in Phase 146, but the call at line 61 was not updated. Since `el` is typed `any`, TypeScript does not catch this at compile time. At runtime Vitest will throw `TypeError: el._pushUrlStateDebounced is not a function` and the test fails hard — the `expect` assertion on line 62 is never reached. The test suite is red.

The test covered D-05 suppression for the old debounce path. That behavior is now covered by Case 4b in `bee-atlas.test.ts` (line 972), so the stale test is redundant in addition to broken. It needs to be either updated to call `_writeViewportHistory()` or removed.

**Fix:** Replace the stale call with the new method name:
```typescript
// Old (broken):
el._pushUrlStateDebounced();

// Option A — update to new method name:
el._writeViewportHistory();
expect(window.location.search).toContain('taxon=Habropoda'); // D-05: URL preserved

// Option B — remove the test entirely (behavior is already covered by Case 4b in bee-atlas.test.ts)
```

---

## Warnings

### WR-01: Case 3 (popstate re-arm) does not assert that the restore-settle move writes nothing

**File:** `src/tests/bee-atlas.test.ts:939-959`
**Issue:** The test fires `fireViewMoved` after `_onPopState()` and then asserts `pushSpy.toHaveBeenCalledTimes(1)` (unchanged), correctly verifying the settle is suppressed. However, it does not assert `replaceSpy.not.toHaveBeenCalled()` after the restore-settle. A regression that makes `_onViewMoved` call `replaceState` on the restore-settle path (e.g., if `_isRestoringFromHistory` is cleared prematurely) would not be caught — the `pushSpy` count would still be 1. The test is weaker than it looks.

**Fix:**
```typescript
// After: fireViewMoved(inst, -120, 47.5, 7);  // restore settle
// Add assertion:
expect(replaceSpy).not.toHaveBeenCalled(); // D-06: restore-settle writes nothing
// Then fire the genuine user pan...
```

### WR-02: No test for `_filterResolving=true` NOT resetting `_viewportSessionActive`

**File:** `src/tests/bee-atlas.test.ts` (missing test in the Phase 146 describe block)
**Issue:** The early return in `_replaceUrlState` (line 660) short-circuits before line 663 (`this._viewportSessionActive = false`), which means a suppressed `_replaceUrlState` call does not reset the session flag. This is currently harmless — `_filterResolving` is only set `true` from paths (`firstUpdated`, `_onPopState`) that also set `_viewportSessionActive = false` before or alongside setting `_filterResolving`. But the invariant is nowhere documented or tested. A future caller that sets `_filterResolving = true` mid-session (without also resetting the session flag) would silently corrupt the state machine with no failing test.

**Fix:** Add a test (or a code comment) that documents the invariant. As a test:
```typescript
test('_replaceUrlState suppressed by _filterResolving does NOT reset session flag', () => {
  const inst = el as unknown as BeeAtlasPrivate;
  inst._filterResolving = false;
  // Start a session.
  fireViewMoved(inst, -120, 47.5, 7);
  expect(inst._viewportSessionActive).toBe(true);
  // Suppress a write via _filterResolving — session must survive.
  inst._filterResolving = true;
  inst._replaceUrlState(); // suppressed
  expect(inst._viewportSessionActive).toBe(true); // session not destroyed by suppressed write
  inst._filterResolving = false;
});
```
Alternatively, add a comment in `_replaceUrlState` before the early-return: `// D-05: do NOT reset _viewportSessionActive here — callers that set _filterResolving=true also reset the session flag themselves (_onPopState, firstUpdated).`

### WR-03: Test type alias for private access omits `_writeViewportHistory` and `_viewportSessionActive` assertions

**File:** `src/tests/bee-atlas.test.ts:873-881`
**Issue:** The `BeeAtlasPrivate` type alias exposes `_viewportSessionActive` and `_filterResolving` for direct mutation, but does not expose `_writeViewportHistory`. This means tests cannot verify the flag's value mid-session (e.g., that `_viewportSessionActive === true` after the first push, or `=== false` after a reset). Tests currently only verify side effects (spy call counts), which is correct for black-box testing but leaves the internal flag state unverified. For Case 2 in particular, the test doesn't assert `inst._viewportSessionActive === false` after `_replaceUrlState()` fires — a bug where the flag is not cleared would only surface through the subsequent pushState count, which is an indirect check.

**Fix:** Extend the type alias to allow flag inspection in diagnostic assertions:
```typescript
type BeeAtlasPrivate = {
  _viewportSessionActive: boolean;
  _filterResolving: boolean;
  _isRestoringFromHistory: boolean;
  _onViewMoved(e: CustomEvent<{ lon: number; lat: number; zoom: number }>): void;
  _onPopState(): void;
  _replaceUrlState(): void;
  _writeViewportHistory(): void; // add this
};
```
Then in Case 2: `expect(inst._viewportSessionActive).toBe(false);` after `inst._replaceUrlState()`.

---

## Info

### IN-01: Removed `_mapMoveDebounce` cleanup in `disconnectedCallback` — no impact but worth noting

**File:** `src/bee-atlas.ts:350-354`
**Issue:** The Phase 146 diff removes the `clearTimeout(_mapMoveDebounce)` block from `disconnectedCallback`. There is no functional problem because the timer no longer exists. But the removal is worth calling out: if `bee-atlas` is ever disconnected and reconnected (e.g., in test harnesses or SSR-ish scenarios), there is no residual timer to clear. The new implementation has no cleanup to perform on disconnect beyond the already-present `removeEventListener('popstate', ...)`, which remains. This is correct.

---

_Reviewed: 2026-06-09T20:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
