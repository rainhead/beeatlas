---
status: passed
phase: 138-frontend-points-detail-card
source: [138-VERIFICATION.md]
started: 2026-06-08
updated: 2026-06-08
---

## Current Test

[complete — approved by user at the 138-04 human-verify checkpoint]

## Tests

### 1. Green checklist points render and cluster correctly
expected: Checklist points appear at #2c7a2c, solid (not translucent), same radius as other points; cluster with other sources when zoomed out (green only at the unclustered level); toggling the checklist source off hides them.
result: passed — approved at checkpoint

### 2. County-fill layer fully removed
expected: No translucent green county polygons remain at any zoom across Washington.
result: passed — approved at checkpoint (0 grep hits for checklistCountyFillLayerSpec / checklist-county-fill)

### 3. Detail card layout and attribution
expected: Clicking a checklist point opens a card showing accepted name + (det. as {verbatim}) only when names differ, collector, Roman-numeral date, locality (absent when null), "Represents N collapsed records" (only N>1), muted "Bartholomew et al. 2024" line.
result: passed — approved at checkpoint; a click-to-sidebar selection bug (6d6c715) and a null-date card crash (cb16436) were found and fixed during verification; the card structure itself was unchanged.

## Summary

total: 3
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

None — all visual items approved. Optional post-fix spot-check: click a checklist point with no date (date_quality='none') to confirm the null-safe sort renders the card without the date line (logic verified by tsc + tests; visually low-risk).
