---
phase: 51-frontend-link-rendering
reviewed: 2026-04-13T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - frontend/src/bee-sidebar.ts
  - frontend/src/bee-map.ts
  - frontend/src/bee-atlas.ts
  - frontend/src/bee-specimen-detail.ts
  - frontend/src/tests/bee-sidebar.test.ts
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 51: Code Review Report

**Reviewed:** 2026-04-13
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

This phase adds `specimenObservationId` (photo link) support to `bee-specimen-detail.ts`, threads the new field through the data pipeline in `bee-map.ts` and `bee-atlas.ts`, and adds tests in `bee-sidebar.test.ts`. The core feature implementation is correct and the new camera-link rendering logic is sound. Three warnings and three informational items were found.

---

## Warnings

### WR-01: Unhandled promise rejection from `_loadCollectorOptions`

**File:** `frontend/src/bee-atlas.ts:738`
**Issue:** `this._loadCollectorOptions()` is called fire-and-forget inside `_onDataLoaded`. The method opens a DuckDB connection and runs a query; if it throws, the rejection is unhandled and the component silently ends up with empty collector options. There is no `.catch()` and the call site does not `await`.
**Fix:**
```typescript
// In _onDataLoaded:
this._loadCollectorOptions().catch(err => {
  console.error('Failed to load collector options:', err);
});
```

### WR-02: Unhandled promise rejections from `_runFilterQuery().then(...)` call sites

**File:** `frontend/src/bee-atlas.ts:586,599,632`
**Issue:** Several event handlers call `this._runFilterQuery().then(() => { this._pushUrlState(); })` without a `.catch()`. If `queryVisibleIds` throws (e.g., DuckDB connection error), the rejection propagates through `_runFilterQuery` and then through the `.then()` chain as an unhandled rejection, surfaced as an uncaught error in the browser console and potentially breaking URL state updates.
**Fix:**
```typescript
this._runFilterQuery()
  .then(() => { this._pushUrlState(); })
  .catch(err => { console.error('Filter query failed:', err); });
```
This pattern applies at lines 586, 599, and 632.

### WR-03: Stale test fixture — `Specimen` objects missing new optional fields

**File:** `frontend/src/tests/bee-sidebar.test.ts:199-202,239-240`
**Issue:** The render test fixtures at lines 192–202 and 228–243 create `Specimen` objects without `inatHost`, `inatQualityGrade`, or `specimenObservationId`. These fields were added to the `Specimen` interface in this phase. The tests pass because the fields are typed as optional (`?`), but `_renderHostInfo` reads `s.inatHost` and `s.inatQualityGrade` — the test does not exercise the quality-badge path or the host-conflict path. The omission means the photo-link feature added in phase 51 is not tested by these older fixtures; the new `FRONT-01` describe block does cover the new field, but the earlier render tests are now incomplete coverage.
**Fix:** Update the existing render test fixtures to include `inatHost`, `inatQualityGrade`, and `specimenObservationId` to match current interface shape and to avoid silent divergence:
```typescript
species: [
  {
    name: 'Bombus occidentalis', occid: '12345',
    hostObservationId: null, floralHost: null,
    inatHost: null, inatQualityGrade: null, specimenObservationId: null,
  },
  ...
]
```

---

## Info

### IN-01: `_loadCollectorOptions` is called redundantly in table view

**File:** `frontend/src/bee-atlas.ts:391-415,738`
**Issue:** In table-view startup, `_loadSummaryFromDuckDB` (line 316) builds and assigns `_collectorOptions` via an inline query (lines 369–382). Then `_onDataLoaded` fires (line 734) and calls `_loadCollectorOptions()` (line 738), which runs the identical query again. This means two DuckDB connections and two identical queries execute back-to-back. Not a correctness bug but wasteful.
**Fix:** Guard the call: skip `_loadCollectorOptions()` when `_collectorOptions` is already populated, or consolidate the query into a single location.

### IN-02: Inline dynamic import type in `_renderHostInfo`

**File:** `frontend/src/bee-specimen-detail.ts:92`
**Issue:** The method signature uses `import('./bee-sidebar.ts').Specimen` as an inline dynamic type reference, but `Sample` (and by extension `Specimen`) is already available — `Sample` is imported at line 3. `Specimen` can be added to the same import statement, removing the unusual inline import type.
**Fix:**
```typescript
// Line 3:
import type { Sample, Specimen } from './bee-sidebar.ts';

// Line 92:
private _renderHostInfo(s: Specimen) {
```

### IN-03: Emoji in rendered output

**File:** `frontend/src/bee-specimen-detail.ts:123`
**Issue:** The camera-link label is the literal emoji character `📷` rendered via `html\`📷\``. On some rendering environments (especially screen readers and plain-text contexts) this may be misread or announced with a lengthy description. The CLAUDE.md guideline also calls out avoiding emojis. This is low-priority since the emoji is intentional UX here (the test at `bee-sidebar.test.ts:347` explicitly asserts on it), but it should be flagged for accessibility consideration.
**Fix:** Add `aria-label` to the anchor so screen readers describe the link's purpose:
```typescript
html`<a href="..." target="_blank" rel="noopener" aria-label="View specimen photo on iNaturalist">📷</a>`
```

---

_Reviewed: 2026-04-13_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
