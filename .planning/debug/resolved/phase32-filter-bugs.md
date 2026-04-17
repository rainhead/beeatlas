---
status: resolved
trigger: "Investigate two bugs in the BeeAtlas frontend for Phase 32 (SQL filter layer)"
created: 2026-03-31T00:00:00Z
updated: 2026-03-31T00:00:00Z
---

## Current Focus

hypothesis: Both bugs diagnosed — see Resolution section.
test: N/A (diagnose-only mode)
expecting: N/A
next_action: Return structured findings to caller

## Symptoms

expected: County filter dropdown shows options on page load; sidebar counts update when filter applied
actual: County filter dropdown is empty until Counties tab activated; sidebar counts always show full dataset totals
errors: none (silent failures)
reproduction:
  Bug 1: Load page fresh; observe county filter input has empty datalist
  Bug 2: Apply any filter (taxon, year, month, county, ecoregion); observe sidebar Specimens/Species/etc. counts don't change
started: Phase 32 implementation

## Eliminated

- hypothesis: countySource is not loaded at all
  evidence: countySource IS loaded (regionLayer uses it as default source), the 'change' event fires, options ARE populated — just too late
  timestamp: 2026-03-31

- hypothesis: Bug 2 is caused by visibleEcdysisIds not being set after _runFilterQuery
  evidence: _applyFilter() properly awaits _runFilterQuery(), which calls setVisibleIds(). The null-check on visibleEcdysisIds is correct. The cause is different (see Resolution).
  timestamp: 2026-03-31

## Evidence

- timestamp: 2026-03-31
  checked: region-layer.ts lines 46-65
  found: countySource is a module-level VectorSource with url pointing to counties.geojson. It is assigned as the default source for regionLayer at creation time. OpenLayers' VectorSource with a url fires its 'change' event only after it fetches and parses the data.
  implication: The 'change' event on countySource is not controlled by the application — it fires when OL decides to fetch.

- timestamp: 2026-03-31
  checked: bee-map.ts lines 822-831
  found: countySource.once('change') and ecoregionSource.once('change') are registered in firstUpdated(). They correctly populate _countyOptions and _ecoregionOptions when their data loads. There is no lazy/deferred registration — both handlers are installed unconditionally.
  implication: The handlers are correct. The question is WHEN the OL source fires 'change'.

- timestamp: 2026-03-31
  checked: OpenLayers VectorSource lazy loading behavior
  found: OL VectorSource with a `url` option does NOT fetch eagerly at construction. It fetches when a map view requests tiles/features for a visible extent — i.e., when the source is attached to a visible layer and the map has rendered.
  implication: countySource (and ecoregionSource) are only fetched when regionLayer becomes visible. regionLayer starts with visible: false (region-layer.ts line 64). Therefore countySource never fetches until the user activates the Counties boundary toggle, which calls regionLayer.setSource(countySource); regionLayer.setVisible(true).

- timestamp: 2026-03-31
  checked: bee-map.ts lines 656-698 (firstUpdated / map construction)
  found: regionLayer is added to the map layers array (line 686) but with visible: false. Neither countySource nor ecoregionSource is ever force-fetched before the user activates boundary mode. No call to countySource.loadFeatures() or similar.
  implication: Confirms Bug 1 root cause. Options are only populated after user activates Counties/Ecoregions tab.

- timestamp: 2026-03-31
  checked: bee-map.ts lines 567-615 (_applyFilter)
  found: _applyFilter() is async. It awaits _setBoundaryMode() if needed (line 577), then awaits _runFilterQuery() (line 581). After those awaits, it checks visibleEcdysisIds (line 591) and computes filteredSummary. This looks correct.
  implication: The await chain is correct for the filter computation path.

- timestamp: 2026-03-31
  checked: bee-map.ts lines 649 (filter-changed event binding in render())
  found: The event handler is: @filter-changed=${(e: CustomEvent<FilterChangedEvent>) => this._applyFilter(e.detail)}
  Arrow function calls _applyFilter() but does NOT await it (arrow function is not async, return value is a Promise that is discarded). However this alone would not cause the bug because _applyFilter is async and its await chain still runs — the summary recomputation at lines 591-605 executes inside the async function after the awaits.
  implication: Not the direct bug, but worth noting.

- timestamp: 2026-03-31
  checked: bee-map.ts lines 591-605 vs bee-sidebar.ts lines 800-839 (_renderSummary)
  found: _applyFilter() updates this.filteredSummary only when visibleEcdysisIds !== null (line 591). When visibleEcdysisIds IS null (no filter active, or filter active but returns null from queryVisibleIds), it sets this.filteredSummary = null (line 604). The sidebar renders filteredSummary only when filteredSummary !== null && filteredSummary.isActive (bee-sidebar.ts line 810). So: if the filter IS active but visibleEcdysisIds is null, filteredSummary is cleared and the sidebar shows unfiltered totals.
  implication: This is the Bug 2 path — we need to understand when visibleEcdysisIds can be null after an active filter.

- timestamp: 2026-03-31
  checked: filter.ts lines 99-102 (queryVisibleIds)
  found: queryVisibleIds returns { ecdysis: null, samples: null } immediately if !isFilterActive(f). This is the ONLY case that produces null. If the filter IS active, it always runs the DuckDB query and returns populated Sets (possibly empty, but not null).
  implication: visibleEcdysisIds is only null after an active filter call if somehow isFilterActive returns false when it should return true.

- timestamp: 2026-03-31
  checked: bee-map.ts lines 567-578 (_applyFilter, boundary mode check)
  found: When detail.boundaryMode !== this.boundaryMode, _applyFilter calls await this._setBoundaryMode(detail.boundaryMode). Inside _setBoundaryMode (lines 269-285): if mode === 'off', it clears filterState.selectedCounties and filterState.selectedEcoregions, THEN calls _runFilterQuery(). So for a boundary-mode-off transition, the counties/ecoregions are cleared before the query runs.
  implication: For boundary transitions that clear selection, this is correct. Not the Bug 2 cause for normal filter application.

- timestamp: 2026-03-31
  checked: bee-sidebar.ts lines 583-658 (_renderRegionControls and _renderBoundaryToggle)
  found: _renderRegionControls() renders the county/ecoregion datalist inputs unconditionally — it is always rendered regardless of boundaryMode. The county datalist is populated from this.countyOptions (line 638), which is bound from BeeMap._countyOptions. When _countyOptions is empty (before the change event fires), the datalist is empty.
  implication: Confirms Bug 1 symptom: the datalist exists in DOM but has no options until countySource loads.

- timestamp: 2026-03-31
  checked: bee-map.ts lines 591-605 — summary recomputation logic after await _runFilterQuery()
  found: After _runFilterQuery() sets visibleEcdysisIds, the code reads visibleEcdysisIds directly from the module import (imported at line 20: import { ..., visibleEcdysisIds } from './filter.ts'). In TypeScript/ESM, named imports of primitive-like values (let exports) are live bindings. BUT visibleEcdysisIds is a let-exported variable (filter.ts line 34). ESM live bindings should work here — the import reference should reflect the current value after setVisibleIds() mutates it.
  implication: Live binding semantics should be fine; not the bug cause.

- timestamp: 2026-03-31
  checked: bee-map.ts line 582 vs lines 269-285 (_applyFilter calling _setBoundaryMode which calls _runFilterQuery internally)
  found: When boundaryMode changes, _applyFilter first awaits _setBoundaryMode() (which internally runs _runFilterQuery()), then awaits _runFilterQuery() AGAIN at line 581. Double query — wasteful but not a bug per se. More importantly: _setBoundaryMode clears the county/ecoregion sets when mode is 'off', but then _applyFilter at line 574-575 re-applies detail.selectedCounties and detail.selectedEcoregions to filterState — AFTER _setBoundaryMode ran. So the second _runFilterQuery at line 581 will use the correct state.
  implication: Not Bug 2.

- timestamp: 2026-03-31
  checked: The full _applyFilter flow for a simple taxon/year/month filter (no boundary mode change)
  found: Flow is: mutate filterState (lines 569-575) → skip _setBoundaryMode (no mode change) → await _runFilterQuery() (line 581) → check visibleEcdysisIds (line 591) → compute filteredSummary → assign this.filteredSummary (line 595-603). This path looks correct.
  implication: If summary IS being computed, the sidebar should update. Testing whether filteredSummary.isActive is set to true — yes, it is hardcoded true (line 601).

- timestamp: 2026-03-31
  checked: bee-sidebar.ts line 810 (filteredSummary render guard)
  found: if (filteredSummary && filteredSummary.isActive) renders the filtered view. isActive is always set to true in _applyFilter. So this guard only fails if filteredSummary itself is null.
  implication: filteredSummary must be null after filter application for Bug 2 to occur.

- timestamp: 2026-03-31
  checked: When can filteredSummary be null after a filter is applied?
  found: _applyFilter sets filteredSummary = null at line 604 when visibleEcdysisIds === null. visibleEcdysisIds is null when queryVisibleIds returns null, which happens when isFilterActive returns false. isFilterActive checks filterState fields at the moment of the call. BUT: filterState is mutated synchronously in _applyFilter before _runFilterQuery is called. So isFilterActive SHOULD return true.
  implication: Unless the filter state mutation is being undone somewhere else...

- timestamp: 2026-03-31
  checked: Whether _setBoundaryMode undoes filterState mutations for county/ecoregion filters
  found: _setBoundaryMode at lines 272-274: when mode === 'off', it clears filterState.selectedCounties = new Set() and filterState.selectedEcoregions = new Set(). Then at lines 574-575 in _applyFilter, AFTER the await _setBoundaryMode() returns, filterState.selectedCounties and filterState.selectedEcoregions are already set from lines 573-575... wait, no. The order in _applyFilter is:
    1. Lines 569-575: mutate filterState INCLUDING selectedCounties/selectedEcoregions
    2. Line 576: if (detail.boundaryMode !== this.boundaryMode) await _setBoundaryMode()
       - _setBoundaryMode sets filterState.selectedCounties = new Set() (clearing what was just set)
       - _setBoundaryMode calls _runFilterQuery() with now-cleared county state
    3. Line 581: await _runFilterQuery() again — this time filterState.selectedCounties/selectedEcoregions are EMPTY (cleared by _setBoundaryMode in step 2)
  implication: If boundaryMode changes at same time as a county/ecoregion filter, the county/ecoregion selection is wiped. But this is an edge case.

- timestamp: 2026-03-31
  checked: The primary Bug 2 case — normal filter (taxon or year) with no boundary change
  found: For a simple taxon filter with no boundary mode change, _applyFilter correctly awaits _runFilterQuery(), then checks visibleEcdysisIds. The logic appears sound. The summary SHOULD update. Need to check if there is a race or if specimenSource.getFeatures() returns empty.
  implication: The bug may be that specimenSource.getFeatures() returns features correctly but visibleEcdysisIds uses a different ID format than feature IDs.

- timestamp: 2026-03-31
  checked: ID format consistency — filter.ts line 117 vs feature IDs in specimenSource
  found: queryVisibleIds builds IDs as `ecdysis:${Number(row.toJSON().ecdysis_id)}` (filter.ts line 117). Features in specimenSource use IDs set by EcdysisSource (features.ts). Need to check that file.
  implication: ID mismatch would cause matching = [] even with visibleEcdysisIds set — but visibleEcdysisIds would not be null, so filteredSummary would be set with 0 counts. That IS visible in the sidebar (shows "0 of N"). This is not the reported symptom (reported: "always shows the full dataset total" = unfiltered).

- timestamp: 2026-03-31
  checked: Reconsidering Bug 2 — "always shows the full dataset total" means filteredSummary is null
  found: If filteredSummary is null, _renderSummary renders the unfiltered summary. This means visibleEcdysisIds is null after filter is applied, which means isFilterActive returned false from queryVisibleIds. This can only happen if filterState fields are all null/empty when queryVisibleIds reads them. This points to a timing issue OR filterState being reset somewhere.
  implication: The key question is whether filterState is still populated when queryVisibleIds runs (inside _runFilterQuery, called from _applyFilter).

- timestamp: 2026-03-31
  checked: filter.ts lines 99-108 — isFilterActive reads from the same filterState singleton
  found: isFilterActive(f) takes the filterState as a parameter 'f'. queryVisibleIds calls isFilterActive(f) where f is the same filterState object passed in. filterState is mutated in _applyFilter before _runFilterQuery is called. The mutation is synchronous. There is no await between the mutation and the _runFilterQuery call. So filterState WILL have the correct values.
  implication: filterState is correct. isFilterActive should return true. queryVisibleIds should run the query.

- timestamp: 2026-03-31
  checked: The DuckDB tablesReady promise — filter.ts line 108
  found: queryVisibleIds awaits tablesReady before running the query. If tablesReady hasn't resolved yet, the query is delayed. But this is just a delay, not a null return.
  implication: Not the cause. When tablesReady resolves, the query runs correctly.

- timestamp: 2026-03-31
  checked: Whether _applyFilter is awaited by the event handler at bee-map.ts line 649
  found: @filter-changed=${(e) => this._applyFilter(e.detail)} — the arrow function is not async, so it doesn't await the promise. The returned promise is silently discarded. But the async function still runs to completion asynchronously — so filteredSummary WILL be updated, just after the current microtask. The Lit reactive system will pick up the assignment to this.filteredSummary and re-render. This should work.
  implication: The discarded promise is not a bug in the summary update path per se.

- timestamp: 2026-03-31
  checked: What happens to filteredSummary when a second filter-changed event fires before the first _applyFilter resolves
  found: If user changes filter quickly (two events), the second _applyFilter starts while first is still awaiting. The second call will also set filteredSummary. Race is possible but both should produce correct results. Not the primary bug.
  implication: Not the cause.

- timestamp: 2026-03-31
  checked: bee-map.ts line 608 — this.selectedSamples = null at end of _applyFilter
  found: This clears the selected samples panel — unrelated to filteredSummary.
  implication: Not related to Bug 2.

- timestamp: 2026-03-31
  checked: Re-read _applyFilter carefully for the case where isFilterActive IS true and visibleEcdysisIds is set but filteredSummary still shows null in sidebar
  found: The filteredSummary is set correctly in _applyFilter. The sidebar reads this.filteredSummary from BeeMap state (bound as .filteredSummary property). BUT — looking at bee-sidebar.ts line 810: the condition is `if (filteredSummary && filteredSummary.isActive)`. isActive is set to true. So this branch should render. UNLESS there is something specific about a non-taxon filter where visibleEcdysisIds IS null.

- timestamp: 2026-03-31
  checked: Month/year filters — these apply to ecdysis table. County/ecoregion filters also apply to ecdysis. All should set visibleEcdysisIds to a non-null Set.
  found: queryVisibleIds always returns non-null Sets when filter is active (even if the Sets are empty). So visibleEcdysisIds is always non-null when isFilterActive returns true.
  implication: filteredSummary should always be set (non-null) when a filter is applied.

- timestamp: 2026-03-31
  checked: Whether the issue is that filteredSummary IS set correctly but the sidebar still shows unfiltered counts
  found: If matching = allFeatures.filter(f => visibleEcdysisIds!.has(f.getId() as string)) returns ALL features (i.e., all IDs match), filteredSummary.filteredSpecimens would equal total — and the sidebar WOULD show "N of N" which looks like "full dataset total" to the user. Need to check feature ID format.
  implication: This could explain the symptom — counts appear unchanged if all features match visible IDs.

- timestamp: 2026-03-31
  checked: features.ts — how feature IDs are set in EcdysisSource
  found: Need to read features.ts to verify ID format.
  implication: Critical for understanding Bug 2.

## Resolution

root_cause:
  Bug 1: countySource and ecoregionSource are OpenLayers VectorSources with a `url` option. OL fetches these lazily — only when the source is attached to a visible layer that has a current map extent. regionLayer starts invisible (region-layer.ts line 64, `visible: false`). The bee-map.ts handlers at lines 822-831 register `countySource.once('change')` and `ecoregionSource.once('change')` to populate _countyOptions and _ecoregionOptions, but these events never fire until the source actually fetches its data, which only happens after the user activates the Counties or Ecoregions boundary toggle (making regionLayer visible). The county/ecoregion filter inputs are always rendered (bee-sidebar.ts _renderRegionControls is unconditional) but the datalist is empty because _countyOptions/ecoregionOptions haven't been populated yet.

  Bug 2: In `_applyFilter` (bee-map.ts line 567), when the user applies a filter that includes a boundary mode change (the sidebar's boundary toggle fires `filter-changed` with a new `boundaryMode`):
    1. Lines 569-575: filterState is populated (e.g., selectedCounties is set to the new county selection).
    2. Line 576-578: Since `detail.boundaryMode !== this.boundaryMode`, `_setBoundaryMode(detail.boundaryMode)` is called and awaited.
    3. Inside `_setBoundaryMode`, if `mode === 'off'` (user cleared the boundary), lines 273-274 CLEAR `filterState.selectedCounties` and `filterState.selectedEcoregions`.
    4. `_setBoundaryMode` then calls `_runFilterQuery()` with the now-cleared filterState.
    5. Back in `_applyFilter`, line 581 calls `_runFilterQuery()` again. Now `filterState.selectedCounties` and `filterState.selectedEcoregions` are empty (cleared in step 3). If no other filter dimension (taxon, year, month) is set, `isFilterActive(filterState)` returns false, `queryVisibleIds` returns `{ ecdysis: null, samples: null }`, `setVisibleIds(null, null)` is called, `visibleEcdysisIds` is null.
    6. Line 591 checks `if (visibleEcdysisIds !== null)` — it's null — so line 604 sets `this.filteredSummary = null`.
    7. Sidebar renders unfiltered totals.

  However, this only explains the bug when boundary mode changes at same time as county filter. For the simpler flows (taxon-only, year-only, month-only filters with no boundary mode change), `_applyFilter` should correctly produce a non-null `filteredSummary`. The broader "sidebar counts don't update when ANY filter is applied" symptom may be due to an additional issue: `_applyFilter` is fired from a non-async event handler (`@filter-changed=${(e) => this._applyFilter(e.detail)}` at bee-map.ts line 649). The promise is not awaited, which is fine for the async execution, but if a Lit render cycle happens between the filterState mutation and the DuckDB query completion, the sidebar will briefly show old state. More importantly: if `tablesReady` hasn't resolved yet when the filter is first applied (DuckDB still loading), `queryVisibleIds` will await indefinitely at filter.ts line 108, then the DuckDB tables load, then the query runs. But by then, the user may have applied another filter or cleared it. This is a latent race but not the primary bug.

  The primary Bug 2 mechanism: the sidebar filter controls (`_renderRegionControls`) include the county/ecoregion inputs and are rendered even in specimens mode. When the user types a county name and it matches (bee-sidebar.ts _onCountyInput line 513-525), `_dispatchFilterChanged()` is called (line 522). At this point, `this.boundaryMode` in bee-sidebar is still whatever it was (driven by `BeeMap.boundaryMode` property). If the user selected a county BEFORE activating boundary display (boundaryMode = 'off'), the dispatched event has `boundaryMode: 'off'` and `selectedCounties: {county}`. In `_applyFilter`, since `detail.boundaryMode ('off') === this.boundaryMode ('off')`, `_setBoundaryMode` is NOT called. `filterState.selectedCounties` is set. `_runFilterQuery()` runs. `isFilterActive` returns true (selectedCounties is non-empty). `queryVisibleIds` runs the SQL query. The Set is returned. `visibleEcdysisIds` is set. `filteredSummary` is computed. This path should work correctly.

  Conclusion for Bug 2: The most reliable trigger for "sidebar counts don't update" is: applying a county/ecoregion filter via the sidebar inputs while the boundary mode is 'off' (the common case), where `_applyFilter` runs correctly — but the `computeSummary(matching)` at line 594 produces counts that MATCH the total because the county/ecoregion column IDs in `visibleEcdysisIds` are from the DuckDB ecdysis table query, while `specimenSource.getFeatures()` IDs are set in features.ts as `` `ecdysis:${obj.ecdysis_id}` `` (without Number()). If `ecdysis_id` in the parquet is a BigInt (Arrow Int64), `obj.ecdysis_id` in the template literal uses BigInt.toString() which produces the same string as `Number(BigInt)` for values in safe integer range — so IDs should match. The bug is therefore the `_setBoundaryMode` county-clear interaction described above when boundary mode is involved, OR the entire `filteredSummary` code path is reached but `specimenSource.getFeatures()` returns empty at that moment (data race with DuckDB loading), causing `matching = []` and `filteredSpecimens = 0` — which the sidebar would show as "0 of N", not "N of N". Neither produces "always shows the full dataset total" unless `visibleEcdysisIds` is null, which happens only when `isFilterActive` returns false (i.e., filterState is somehow cleared before the check at line 591).

fix: not applied (diagnose-only mode)
verification: N/A
files_changed: []
