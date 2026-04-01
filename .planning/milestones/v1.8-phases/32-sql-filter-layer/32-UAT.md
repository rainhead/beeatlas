---
status: resolved
phase: 32-sql-filter-layer
source: 32-01-SUMMARY.md, 32-02-SUMMARY.md
started: 2026-03-31T21:30:00Z
updated: 2026-03-31T23:00:00Z
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
  status: resolved
  reason: "User reported: The filter doesn't work until you switch to the Counties tab first — county filter options are not populated until the tab is activated."
  severity: major
  test: 4
  root_cause: "countySource is an OL VectorSource with url (lazy fetch). regionLayer starts visible:false so the source never fetches. countySource.once('change') in bee-map.ts:822-826 never fires on load. Options only populate when _setBoundaryMode('counties') calls regionLayer.setVisible(true)."
  artifacts:
    - path: "frontend/src/region-layer.ts"
      issue: "regionLayer initialized with visible:false (line 64); countySource constructed with url making it lazy (lines 46-49)"
    - path: "frontend/src/bee-map.ts"
      issue: "countySource.once('change') handler (lines 822-826) never fires on page load"
  missing:
    - "Eagerly fetch countySource and ecoregionSource on init, independent of layer visibility"

- truth: "Sidebar counts update to reflect only visible filtered features when a filter is applied"
  status: resolved
  reason: "User reported: no, the counts don't change"
  severity: major
  test: 9
  root_cause: "_applyFilter sets filterState.selectedCounties (line 574), then calls _setBoundaryMode which clears selectedCounties/selectedEcoregions (lines 273-274) when mode is 'off'. The second _runFilterQuery() in _applyFilter (line 581) sees cleared state, isFilterActive returns false, queryVisibleIds returns null sets, and filteredSummary is set to null — sidebar renders unfiltered totals."
  artifacts:
    - path: "frontend/src/bee-map.ts"
      issue: "_setBoundaryMode clears filterState.selectedCounties/selectedEcoregions (lines 273-274) when mode is 'off', clobbering the values just set by _applyFilter (line 574)"
    - path: "frontend/src/bee-map.ts"
      issue: "_applyFilter line 591 checks visibleEcdysisIds !== null; when filter state was clobbered this is null and filteredSummary = null (line 604)"
  missing:
    - "Re-apply filterState county/ecoregion values from detail AFTER _setBoundaryMode returns, or skip the internal _runFilterQuery inside _setBoundaryMode when called from _applyFilter"
