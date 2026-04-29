---
status: complete
phase: 071-base-map-and-occurrence-layer
source: [071-VERIFICATION.md]
started: 2026-04-27T00:36:00Z
updated: 2026-04-28T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Verify basemap renders with Mapbox outdoors-v12 tiles at WA center
expected: Map shows terrain contours, green vegetation at center [-120.5, 47.5] zoom 7
result: pass

### 2. Verify clusters display with recency coloring and count labels
expected: Green=fresh, orange=thisYear, gray=older clusters with white count text
result: pass

### 3. Verify single unclustered points display with recency coloring
expected: Zoom in to see individual points with the same color scheme at radius 6
result: pass

### 4. Verify visibleIds filtering with ghost dots
expected: Activating a filter shows matching dots in color and excluded dots as faint gray
result: pass

### 5. Verify selectedOccIds highlighting with yellow ring
expected: Selected unclustered features display a yellow ring (stroke-width 2.5, color #f1c40f)
result: pass
note: |
  Initial run failed: clicks produced no visible ring. Root cause was an isStyleLoaded() guard in
  _applySelection() (bee-map.ts:580) that returned early during clustered GeoJSON processing — the
  same Mapbox v3 quirk previously fixed in _applyVisibleIds() during Phase 073. Replaced the guard
  with getLayer('selected-ring') existence check (and applied the same pattern to _applyBoundaryMode
  and _applyBoundarySelection). After fix + hard refresh, individual unclustered points now display
  the yellow ring on click.

  Known-by-design: cluster blobs do NOT show a ring on click (the selected-ring layer filter
  excludes features with point_count). Selection state is captured (sidebar opens, leaves stored in
  _selectedOccIds), and rings appear when the user zooms in to expose individual leaves. UX
  follow-up filed in .planning/todos/pending/cluster-selection-visual-feedback.md.

### 6. Verify URL view state round-trip
expected: Pan/zoom updates URL; pasting URL in new tab restores map position
result: pass

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none — all tests passing after isStyleLoaded() guard fix in bee-map.ts]

## Resolved During UAT

Fix applied 2026-04-28:
- bee-map.ts:580 _applySelection — replaced isStyleLoaded() with getLayer('selected-ring') check
- bee-map.ts:684 _applyBoundaryMode — replaced isStyleLoaded() with getLayer('county-fill') check
- bee-map.ts:694 _applyBoundarySelection — replaced isStyleLoaded() with getSource() checks

Same Mapbox-v3 isStyleLoaded() quirk previously fixed in _applyVisibleIds() during Phase 073;
sibling methods carried the same vulnerable guard. All 172 frontend tests pass; tsc clean.

Follow-up (not a Phase 071 gap): cluster blobs have no selection visual feedback by design.
Filed as todo: .planning/todos/pending/cluster-selection-visual-feedback.md
