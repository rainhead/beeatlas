---
phase: 54-sidebar-cleanup
fixed_at: 2026-04-13T00:00:00Z
review_path: .planning/phases/54-sidebar-cleanup/54-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 54: Code Review Fix Report

**Fixed at:** 2026-04-13
**Source review:** .planning/phases/54-sidebar-cleanup/54-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3
- Fixed: 3
- Skipped: 0

## Fixed Issues

### WR-01: Sidebar stays visible with empty content after filter change

**Files modified:** `frontend/src/bee-atlas.ts`
**Commit:** 9aea543
**Applied fix:** Added `this._sidebarOpen = false;` to the selection-clearing block in `_onFilterChanged`, matching the pattern used in `_onLayerChanged` and `_onClose`.

### WR-02: Off-by-one date display for ISO date strings in UTC-negative timezones

**Files modified:** `frontend/src/bee-sample-detail.ts`
**Commit:** 3251aca
**Applied fix:** Updated `_formatSampleDate` to append `T00:00:00` when the input is a bare 10-character ISO date string, forcing local-timezone parsing instead of UTC midnight.

### WR-03: Sidebar not dismissed when clicking empty space in boundary mode with an open selection

**Files modified:** `frontend/src/bee-atlas.ts`
**Commit:** ade5931
**Applied fix:** Added `_selectedSamples = null`, `_selectedOccIds = null`, `_selectedSampleEvent = null`, and `_sidebarOpen = false` to the boundary-mode branch of `_onMapClickEmpty`, so clicking empty space always dismisses any open sidebar regardless of mode.

---

_Fixed: 2026-04-13_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
