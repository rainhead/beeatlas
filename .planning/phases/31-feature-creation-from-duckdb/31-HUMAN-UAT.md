---
status: complete
phase: 31-feature-creation-from-duckdb
source: [31-VERIFICATION.md]
started: 2026-03-31T19:15:00.000Z
updated: 2026-03-31T19:30:00.000Z
---

## Current Test

complete

## Tests

### 1. Specimen clusters render and split on zoom
expected: Specimen clusters appear on map; cluster count decreases on zoom-in; individual markers visible at high zoom
result: passed

### 2. Sample dots render with correct style
expected: iNat sample dots appear on map with correct dot rendering (distinct from specimen clusters)
result: passed

### 3. Sidebar shows correct feature details on click
expected: Clicking specimen/sample shows correct species, collector, date, iNat link in sidebar panel
result: passed

### 4. DuckDB tables loaded — console confirms
expected: DevTools console shows `DuckDB tables ready` and feature count lines (~46000 ecdysis, ~9000 samples); no hyparquet network requests
result: passed

### 5. No console errors
expected: No console errors; no unhandled promise rejections; no `hyparquet` in network tab
result: passed

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
