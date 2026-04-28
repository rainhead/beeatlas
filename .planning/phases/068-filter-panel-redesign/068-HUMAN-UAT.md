---
status: complete
phase: 068-filter-panel-redesign
source: [068-VERIFICATION.md]
started: 2026-04-20T00:00:00.000Z
updated: 2026-04-28T00:00:00.000Z
---

## Current Test

[testing complete]

## Tests

### 1. Visual layout
expected: Floating button sits to the left of the "Regions" button at top: 0.5em; toolbar row is gone; map fills full content area
result: pass

### 2. Filter active state
expected: Button turns green when any filter is applied (token chip visible)
result: pass

### 3. Table view CSV location
expected: Download CSV only appears in table controls, not on the filter panel overlay. In table view, the filter panel button moves to the bottom bar of the table area (desired behavior — confirmed by user 2026-04-28).
result: pass

## Summary

total: 3
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
