---
status: complete
phase: 60-wa-sqlite-integration
source: [60-01-SUMMARY.md, 60-02-SUMMARY.md, 60-03-SUMMARY.md]
started: 2026-04-17T03:03:29Z
updated: 2026-04-17T03:05:00Z
---

## Current Test

[testing complete]

## Tests

### 1. App loads and renders map
expected: Open the app in a browser. The map renders with specimen and sample dots visible. No console errors about WASM, SQLite, or parquet loading. The data layer initializes without crashing.
result: pass

### 2. Filters work
expected: Use the taxon, year, county, ecoregion, and collector filters. Each filter narrows the visible specimens/samples on the map correctly. Clearing filters restores all dots.
result: pass

### 3. Table view shows rows, sorts, and paginates
expected: Switch to table view. Rows of specimen/sample data appear. Clicking a column header sorts by that column. Pagination controls advance through pages.
result: pass

### 4. Load performance is acceptable
expected: On a fresh page load (hard refresh), the app reaches an interactive state noticeably faster than before the wa-sqlite migration. Benchmark: WASM instantiate ~69 ms, tablesReady ~1087 ms (per BENCHMARK.md). No multi-second blank screen.
result: pass

### 5. No regressions in click interactions
expected: Clicking a dot on the map opens the sidebar with specimen/sample details. iNat links in the sidebar are present and point to the correct iNaturalist URLs.
result: pass

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
