---
status: partial
phase: 39-view-mode-toggle
source: [39-VERIFICATION.md]
started: 2026-04-07T19:21:00Z
updated: 2026-04-07T19:21:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Toggle control visibility
expected: Map/Table segmented buttons render in sidebar below the layer toggle row

result: [pending]

### 2. Map-to-table switch
expected: Clicking "Table" removes bee-map from DOM, table-slot div fills map area, URL gains `?view=table`

result: [pending]

### 3. Table-to-map switch
expected: Clicking "Map" remounts bee-map, table-slot removed, `view=table` removed from URL

result: [pending]

### 4. URL bookmarkability
expected: Copy URL with `?view=table`, paste in new tab, page opens directly in table view

result: [pending]

### 5. Browser back/forward
expected: Pressing Back from table view restores map view (and vice versa)

result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
