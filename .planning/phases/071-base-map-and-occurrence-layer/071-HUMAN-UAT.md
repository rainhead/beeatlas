---
status: partial
phase: 071-base-map-and-occurrence-layer
source: [071-VERIFICATION.md]
started: 2026-04-27T00:36:00Z
updated: 2026-04-27T00:36:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Verify basemap renders with Mapbox outdoors-v12 tiles at WA center
expected: Map shows terrain contours, green vegetation at center [-120.5, 47.5] zoom 7
result: [pending]

### 2. Verify clusters display with recency coloring and count labels
expected: Green=fresh, orange=thisYear, gray=older clusters with white count text
result: [pending]

### 3. Verify single unclustered points display with recency coloring
expected: Zoom in to see individual points with the same color scheme at radius 6
result: [pending]

### 4. Verify visibleIds filtering with ghost dots
expected: Activating a filter shows matching dots in color and excluded dots as faint gray
result: [pending]

### 5. Verify selectedOccIds highlighting with yellow ring
expected: Selected features display a yellow ring (stroke-width 2.5, color #f1c40f)
result: [pending]

### 6. Verify URL view state round-trip
expected: Pan/zoom updates URL; pasting URL in new tab restores map position
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
