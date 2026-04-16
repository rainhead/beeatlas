---
status: complete
phase: 58-elevation-filter
source: [58-01-SUMMARY.md, 58-02-SUMMARY.md]
started: "2026-04-16T21:10:00Z"
updated: "2026-04-16T21:20:00Z"
---

## Current Test

[testing complete]

## Tests

### 1. Elevation inputs visible in filter toolbar
expected: Open the app. In the filter toolbar (below the header), two number input fields for elevation are visible — one for min elevation and one for max elevation. They appear after the other filter controls and are empty on initial load.
result: pass

### 2. Elevation range filter narrows results
expected: Enter a min value (e.g. 500) and a max value (e.g. 1500) in the elevation inputs. The map dots and table rows update to show only specimens/samples within that elevation range. Points with no elevation data (null) are excluded when both bounds are set.
result: pass

### 3. Single-bound filter passes null-elevation records
expected: Clear the max input so only a min is set (e.g. min=500, max empty). Specimens/samples with null elevation data should still appear — they are NOT excluded when only one bound is provided. Only records with a known elevation below 500 m are hidden.
result: pass

### 4. URL bookmark round-trip
expected: Set min=500 and max=1500 in the elevation inputs. Copy the URL — it should contain `elev_min=500&elev_max=1500`. Paste that URL in a new tab (or reload). The elevation inputs should be pre-filled with 500 and 1500, and the filter should be active.
result: pass

### 5. Clear filters resets elevation inputs
expected: With elevation min/max values entered and active, click "Clear filters". Both elevation inputs should reset to empty, and the filter should become inactive (all records visible again).
result: skipped
reason: No "Clear filters" button exists in the UI — test dropped by user

## Summary

total: 5
passed: 4
issues: 0
pending: 0
skipped: 1

## Gaps

[none]
