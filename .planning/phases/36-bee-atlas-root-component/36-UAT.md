---
status: diagnosed
phase: 36-bee-atlas-root-component
source: [36-01-SUMMARY.md, 36-02-SUMMARY.md]
started: 2026-04-06T00:00:00Z
updated: 2026-04-06T00:01:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Map loads with specimen dots
expected: Start dev server, open http://localhost:5173. A loading overlay appears briefly then disappears. Specimen dots/clusters are visible on the map.
result: pass

### 2. Click a specimen cluster — sidebar shows details
expected: Click on a cluster of specimen dots. The sidebar appears and shows specimen detail (occurrence ID, taxon, location info, etc.).
result: pass

### 3. Clear selection closes sidebar detail
expected: With specimen detail showing in sidebar, click "Clear selection". The detail panel closes and the sidebar returns to its default state.
result: pass

### 4. Samples tab shows sample dots
expected: Click the "Samples" tab in the layer toggle. Sample dots appear on the map in place of (or alongside) specimen clusters.
result: pass

### 5. Click a sample dot — sample detail in sidebar
expected: Click on a sample dot. The sidebar shows sample detail information.
result: issue
reported: "It shows, but after a longer delay than I would expect."
severity: minor

### 6. Counties boundary mode shows borders
expected: Toggle boundary mode to "Counties". County border outlines appear on the map.
result: pass

### 7. Click a county — highlights and filters
expected: Click on a county. It highlights (distinct visual state) and the specimen dots filter to show only specimens within that county.
result: pass

### 8. Taxon filter filters dots
expected: Type a genus name into the taxon filter input. The specimen dots on the map update to show only specimens matching that taxon.
result: issue
reported: "yes, although the genus appears as both e.g. 'Bombus (genus)' and 'Bombus', which is confusing. I think the second is an exact match. We should find better copy."
severity: minor

### 9. URL copy-paste restores state
expected: With some state active (filter, selection, or view position), copy the URL and open it in a new tab. The new tab opens with the same map state restored.
result: issue
reported: "Yes, but initially all specimens are shown."
severity: minor

### 10. Browser back/forward navigates state
expected: After making state changes (filter, selection), use browser Back. The previous state is restored. Forward also works.
result: pass

### 11. Responsive layout — sidebar below map on narrow window
expected: Narrow the browser window significantly. The sidebar moves below the map rather than staying beside it.
result: pass

## Summary

total: 11
passed: 8
issues: 3
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "Clicking a sample dot shows sample detail in the sidebar promptly"
  status: failed
  reason: "User reported: It shows, but after a longer delay than I would expect."
  severity: minor
  test: 5
  root_cause: "OpenLayers fires 'singleclick' with a mandatory 250ms delay to disambiguate from double-click; all user-code after that is synchronous with no DuckDB or network involvement"
  artifacts:
    - path: "frontend/src/bee-map.ts"
      issue: "map.on('singleclick', ...) — OL singleclick introduces 250ms hold before firing"
  missing:
    - "Switch sampleLayer click handler from 'singleclick' to 'click' and add event.dragging guard"
- truth: "Taxon filter suggestions clearly distinguish genus-level matches from exact matches"
  status: failed
  reason: "User reported: the genus appears as both e.g. 'Bombus (genus)' and 'Bombus', which is confusing. I think the second is an exact match. We should find better copy."
  severity: minor
  test: 8
  root_cause: "Specimens identified only to genus level have scientificName set to the bare genus name (e.g. 'Bombus'); buildTaxaOptions() adds these to the species Set unlabelled, producing a second unlabelled entry alongside the proper genus entry with different filter semantics ('genus = Bombus' vs 'scientificName = Bombus')"
  artifacts:
    - path: "frontend/src/bee-map.ts"
      issue: "buildTaxaOptions() lines 78-94 — species group uses raw scientificName with no rank annotation, so genus-named records appear unlabelled"
  missing:
    - "Add a label suffix to the species entry for bare-genus scientificNames, e.g. 'Bombus (genus ID only)', or suppress them and fold into the genus-level filter"
- truth: "Opening a URL with active filters shows filtered results immediately, without a flash of all specimens"
  status: failed
  reason: "User reported: Yes, but initially all specimens are shown."
  severity: minor
  test: 9
  root_cause: "_visibleEcdysisIds starts as null (show-all) and _runFilterQuery() is only called in _onDataLoaded(), which fires after EcdysisSource already paints all features — a full DuckDB round-trip of flash occurs between addFeatures() and the filter result"
  artifacts:
    - path: "frontend/src/bee-atlas.ts"
      issue: "_visibleEcdysisIds initialised to null unconditionally; _runFilterQuery called in _onDataLoaded after map already painted"
    - path: "frontend/src/style.ts"
      issue: "clusterStyleFn treats null as 'show all' — cannot distinguish 'no filter' from 'filter pending'"
  missing:
    - "Call _runFilterQuery() in firstUpdated() immediately after restoring _filterState from URL, in parallel with DuckDB init (queryVisibleIds already awaits tablesReady)"
    - "Add _filterQueryPending flag or use empty Set sentinel so clusterStyleFn can ghost/hide dots while filter query is in flight"
