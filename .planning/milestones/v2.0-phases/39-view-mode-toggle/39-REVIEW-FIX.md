---
phase: 39-view-mode-toggle
fixed_at: 2026-04-08T02:33:22Z
review_path: .planning/phases/39-view-mode-toggle/39-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 39: Code Review Fix Report

**Fixed at:** 2026-04-08T02:33:22Z
**Source review:** .planning/phases/39-view-mode-toggle/39-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (CR-01, WR-01, WR-02)
- Fixed: 3
- Skipped: 0

## Fixed Issues

### CR-01: SQL injection via URL-controlled occurrence IDs

**Files modified:** `frontend/src/bee-atlas.ts`
**Commit:** f9c9900
**Applied fix:** Added `.filter(id => /^\d+$/.test(id))` to the `ecdysisIds` pipeline in `_restoreSelectionSamples`, ensuring only pure-integer suffixes are accepted before SQL interpolation. Consistent with the CLAUDE.md invariant that ecdysis IDs are `ecdysis:<integer>`.

### WR-01: Sample-event selection silently lost on browser back/forward

**Files modified:** `frontend/src/bee-atlas.ts`
**Commit:** 936d249
**Applied fix:** Added a four-line comment block in `_onSampleClick` documenting that sample event selection is intentionally not URL-persisted — the `o=` param only serializes `ecdysis:` specimen IDs, and navigating back will restore map/filter state but leave the sample event panel blank.

### WR-02: `_renderViewToggle` reuses `layer-toggle` CSS class

**Files modified:** `frontend/src/bee-sidebar.ts`
**Commit:** 51a88f7
**Applied fix:** Changed `<div class="layer-toggle">` to `<div class="layer-toggle view-mode-toggle">` in `_renderViewToggle`, giving the view-mode toggle a distinct class for independent styling while retaining the shared `layer-toggle` base for common properties.

---

_Fixed: 2026-04-08T02:33:22Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
