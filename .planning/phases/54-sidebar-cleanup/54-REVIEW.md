---
phase: 54-sidebar-cleanup
reviewed: 2026-04-13T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - frontend/src/bee-atlas.ts
  - frontend/src/bee-sample-detail.ts
  - frontend/src/bee-sidebar.ts
  - frontend/src/bee-specimen-detail.ts
  - frontend/src/tests/bee-atlas.test.ts
  - frontend/src/tests/bee-sidebar.test.ts
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 54: Code Review Report

**Reviewed:** 2026-04-13
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Reviewed all six files in scope: `bee-atlas.ts` (787 lines), `bee-sidebar.ts` (143 lines), `bee-specimen-detail.ts` (122 lines), `bee-sample-detail.ts` (82 lines), and both test files. This is an updated review that expands scope to include the two new detail components and both test files.

The sidebar cleanup refactor is well-executed. `bee-sidebar` is correctly reduced to a thin layout shell; state ownership is respected (all reactive state lives in `bee-atlas`); the filter race guard (`_filterQueryGeneration`) is intact; the architecture invariants from CLAUDE.md are satisfied; and the test suite covers the decomposition contract thoroughly.

No critical issues were found. The prior CR-01 (SQL injection in `_restoreSelectionSamples`) is reclassified to Info: the code already applies a double `/^\d+$/` guard making the interpolation safe — the second guard was added as a belt-and-suspenders fix, so the risk is mitigated. Three warnings remain: the sidebar not dismissing on filter change, an off-by-one date display bug in UTC-negative timezones, and the sidebar not dismissing when clicking empty space in boundary mode with an active selection. Four info items cover dead code in the child detail components and a type mismatch.

## Warnings

### WR-01: Sidebar stays visible with empty content after filter change

**File:** `frontend/src/bee-atlas.ts:588-612`

**Issue:** `_onFilterChanged` clears `_selectedSamples`, `_selectedOccIds`, and `_selectedSampleEvent` but does not set `_sidebarOpen = false`. If the sidebar is open when the user changes a filter chip, it remains rendered and displays the "Click a point on the map to see details." hint. All other paths that clear selection state also set `_sidebarOpen = false` (`_onLayerChanged` at line 619, `_onClose` at line 690, `_onMapClickEmpty` else-branch at line 583). The filter-change path is the only exception.

**Fix:**
```typescript
// Clear selections when filter changes
this._selectedSamples = null;
this._selectedOccIds = null;
this._selectedSampleEvent = null;
this._sidebarOpen = false;  // add this line
```

### WR-02: Off-by-one date display for ISO date strings in UTC-negative timezones

**File:** `frontend/src/bee-sample-detail.ts:55`

**Issue:** `new Date(dateStr)` where `dateStr` is an ISO date-only string (e.g., `"2023-06-15"`) is parsed as UTC midnight per the ECMAScript spec. `Intl.DateTimeFormat` then formats in the user's local timezone — so in any timezone west of UTC (US Pacific, Mountain, Central, Eastern), `"2023-06-15"` displays as June 14. This affects every sample event date shown in the sidebar.

**Fix:** Force local-timezone interpretation by appending a time component when the string is date-only:
```typescript
private _formatSampleDate(dateStr: string): string {
  // Append T00:00:00 to force local-timezone parsing; bare ISO dates parse as UTC
  // which causes off-by-one display in timezones west of UTC.
  const d = new Date(dateStr.length === 10 ? dateStr + 'T00:00:00' : dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  }).format(d);
}
```

### WR-03: Sidebar not dismissed when clicking empty space in boundary mode with an open selection

**File:** `frontend/src/bee-atlas.ts:567-585`

**Issue:** In `_onMapClickEmpty`, when `boundaryMode !== 'off'` the handler clears region filters but does not touch `_selectedSamples`, `_selectedOccIds`, `_selectedSampleEvent`, or `_sidebarOpen`. If a specimen was selected (sidebar open) before the user switched to boundary mode and then clicked empty space, the sidebar remains visible with stale specimen data while the region filter is cleared.

**Fix:** Add selection-clearing to the boundary-mode branch:
```typescript
if (this._boundaryMode !== 'off') {
  this._filterState = {
    ...this._filterState,
    selectedCounties: new Set(),
    selectedEcoregions: new Set(),
  };
  this._selectedSamples = null;
  this._selectedOccIds = null;
  this._selectedSampleEvent = null;
  this._sidebarOpen = false;
  this._runFilterQuery().then(() => {
    this._pushUrlState();
  });
}
```

## Info

### IN-01: Dead `_onClose` method in `bee-specimen-detail.ts`

**File:** `frontend/src/bee-specimen-detail.ts:95-97`

**Issue:** `_onClose()` dispatches a `close` CustomEvent but is never invoked — the template has no `@click=${this._onClose}` binding. The close button responsibility was moved to `bee-sidebar` during this phase. The method is unreachable dead code.

**Fix:** Remove lines 95-97 entirely.

### IN-02: Dead `_onClose` method in `bee-sample-detail.ts`

**File:** `frontend/src/bee-sample-detail.ts:62-64`

**Issue:** Same as IN-01. `_onClose()` dispatches a `close` event but is never wired to any element in the render template. Dead code from the close-button migration to `bee-sidebar`.

**Fix:** Remove lines 62-64 entirely.

### IN-03: Redundant second `/^\d+$/` filter in `_restoreSelectionSamples`

**File:** `frontend/src/bee-atlas.ts:727`

**Issue:** `ecdysisIds` is produced by filtering `occIds` with `/^\d+$/` at line 720. At line 727, the same array is filtered again with the identical regex to produce `safeIds`. No transformation occurs between the two filters — the second is a no-op. The comment "Belt-and-suspenders" is misleading because this is not a defense against a different threat vector; it is a repeat of the same check on the same data.

Note: the inline guard does make the SQL construction site more self-contained, which is why the prior CR-01 (SQL injection risk) is reclassified. The guard is effective — it is simply duplicated unnecessarily.

**Fix:** Remove the second filter at lines 727-728 and use `ecdysisIds` directly, or keep one guard with a clearer comment:
```typescript
// ecdysisIds already validated as /^\d+$/ above; safe to interpolate into SQL
const idList = ecdysisIds.map(id => `'${id}'`).join(',');
```

### IN-04: `SampleEvent.specimen_count` typed as `number` but guarded as nullable at runtime

**File:** `frontend/src/bee-sidebar.ts:53` and `frontend/src/bee-sample-detail.ts:68`

**Issue:** The `SampleEvent` interface declares `specimen_count: number` (non-nullable), but the render method in `bee-sample-detail` guards with `event.specimen_count != null`. The null-guard is unreachable per the declared type. Either the type does not match the runtime reality (DB rows can produce null/NaN for this field), or the guard is vestigial.

**Fix:** Update the interface to match the runtime behavior:
```typescript
export interface SampleEvent {
  observation_id: number;
  observer: string;
  date: string;
  specimen_count: number | null;  // null when not recorded in source data
  sample_id: number | null;
  coordinate: number[];
}
```

---

_Reviewed: 2026-04-13_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
