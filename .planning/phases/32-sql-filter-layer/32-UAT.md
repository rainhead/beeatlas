---
status: complete
phase: 32-sql-filter-layer
source: 32-01-SUMMARY.md, 32-02-SUMMARY.md
started: 2026-03-31T21:30:00Z
updated: 2026-03-31T21:30:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

## Current Test

[testing complete]

## Tests

### 1. Taxon Filter — ecdysis visible, samples ghosted
expected: Select a taxon in the filter panel and apply. Ecdysis cluster dots update to show only occurrences matching that taxon. Sample dots disappear entirely (samples have no taxon column, so all are ghosted when a taxon filter is active).
result: pass

### 2. Year Filter
expected: Select a year in the filter panel and apply. Only ecdysis records from that year remain visible. Sample dots filter independently (samples table has a year column so some may remain).
result: pass
note: "Design concern: year filter applies to samples even though samples UI doesn't show a year filter control. User unsure if filters should be symmetric across datasets or only apply where controls exist."

### 3. Month Filter
expected: Select a month in the filter panel and apply. Only ecdysis records from that month remain visible on the map.
result: pass

### 4. County Filter
expected: Select a county in the filter panel and apply. Only ecdysis records from that county remain visible on the map.
result: issue
reported: "The filter doesn't work until you switch to the Counties tab first — county filter options are not populated until the tab is activated."
severity: major

### 5. Ecoregion Filter
expected: Select an ecoregion in the filter panel and apply. Only ecdysis records from that ecoregion remain visible on the map.
result: pass

### 6. Clear Filters
expected: After applying any filter, click clear/reset filters. All ecdysis cluster dots and sample dots reappear — the map returns to unfiltered state.
result: pass

### 7. URL Round-Trip
expected: Apply a filter, then copy the URL and open it in a new tab (or reload). The same filter is restored and applied — the map shows filtered results immediately on load without needing to re-apply the filter.
result: pass

### 8. Polygon / Region Boundary Filter
expected: Click a polygon or county boundary on the map (boundary mode). The filter activates for that region and only features within that boundary are shown. The DuckDB query runs — the map updates correctly.
result: pass

### 9. Sidebar Summary Counts
expected: With a filter applied, the sidebar counts (e.g. "N occurrences") reflect only the visible filtered features — not the total dataset count.
result: issue
reported: "no, the counts don't change"
severity: major

## Summary

total: 9
passed: 7
issues: 2
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "County filter works without needing to switch to the Counties tab first"
  status: failed
  reason: "User reported: The filter doesn't work until you switch to the Counties tab first — county filter options are not populated until the tab is activated."
  severity: major
  test: 4
  artifacts: []
  missing: []

- truth: "Sidebar counts update to reflect only visible filtered features when a filter is applied"
  status: failed
  reason: "User reported: no, the counts don't change"
  severity: major
  test: 9
  artifacts: []
  missing: []
