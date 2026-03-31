---
status: partial
phase: 31-feature-creation-from-duckdb
source: [31-VERIFICATION.md]
started: 2026-03-31T19:15:00.000Z
updated: 2026-03-31T19:15:00.000Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Specimen clusters render and split on zoom
expected: Specimen clusters appear on map; cluster count decreases on zoom-in; individual markers visible at high zoom
result: [pending]

### 2. Sample dots render with correct style
expected: iNat sample dots appear on map with correct dot rendering (distinct from specimen clusters)
result: [pending]

### 3. Sidebar shows correct feature details on click
expected: Clicking specimen/sample shows correct species, collector, date, iNat link in sidebar panel
result: [pending]

### 4. DuckDB tables loaded — console confirms
expected: DevTools console shows `DuckDB tables ready` and feature count lines (~46000 ecdysis, ~9000 samples); no hyparquet network requests
result: [pending]

### 5. No console errors
expected: No console errors; no unhandled promise rejections; no `hyparquet` in network tab
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
