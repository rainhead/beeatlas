---
status: partial
phase: 89-rectangle-drawing
source: [89-VERIFICATION.md]
started: 2026-05-14T21:14:00Z
updated: 2026-05-14T21:14:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Shift-drag draws visible rectangle tracking cursor
expected: Holding Shift and dragging on the map canvas shows a blue-outlined rectangle that tracks the cursor in real time

result: [pending]

### 2. Rectangle disappears instantly on release
expected: On mouseup, the rectangle element is removed with no fade or linger

result: [pending]

### 3. BoxZoom suppressed (no zoom-to-selection on shift-drag)
expected: Releasing shift-drag does NOT zoom the map into the dragged area

result: [pending]

### 4. Plain drag still pans map
expected: Dragging without Shift continues to pan the map normally

result: [pending]

### 5. selection-drawn event detail contains correct geographic coordinates
expected: On release, devtools console shows CustomEvent "selection-drawn" with { west, south, east, north } in WA-region lng/lat values

result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
