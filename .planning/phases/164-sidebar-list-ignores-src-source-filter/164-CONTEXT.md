# Phase 164: Sidebar occurrence list ignores the `src=` source filter - Context

**Gathered:** 2026-06-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the **SQL-driven, re-querying views** honor the `src=` source filter (`hiddenSources`) that the **map** already respects, so the two views agree.

**Root cause:** `hiddenSources` lives on `<bee-atlas>` as standalone UI state — it is **not** part of `FilterState` and **not** in `buildFilterSQL`. The map applies it client-side (`bee-map._visibleBySource` over the in-memory full feature set). Every SQL query path that goes through `buildFilterSQL` is source-blind: the sidebar list + filtered count (`queryVisibleGeoJSON` → `_runFilterQuery`), CSV export (`queryAllFiltered`), and table view (`queryTablePage`). Repro: `?…&pane=list&src=ecdysis,waba_sample` restricts the map but the sidebar list still shows the deselected sources.

**In scope:** the fix to the SQL filter path + promoting source into `FilterState`. **Out of scope:** any change to the map's rendering mechanism (see D-03), and the duplicate-occ_id list bug (that's Phase 165).

</domain>

<decisions>
## Implementation Decisions

### Consistency scope
- **D-01:** Fix **all count-bearing SQL views**, not just the sidebar list — the list, the filtered result count (`_filteredRowCount`), CSV export, and table view all run through `buildFilterSQL`, so they share one root cause. A "list only" fix would leave the count saying N while CSV exports a different set. One predicate fixes all four.
  - **Note:** "count" here = the **filter-result** count (`_filteredRowCount` from `queryVisibleGeoJSON`). The headline summary stats in `_loadSummaryFromSQLite` (`total_specimens`, earliest/latest year, `WHERE ecdysis_id IS NOT NULL`) are an all-time dataset overview and should **not** be source-filtered — do not naively add the source predicate there.

### State model
- **D-02:** **Promote source into `FilterState`** as a first-class field (parallel to how `bounds` became first-class in Phase 156 — see `[[project_bounds_are_filter_not_selection]]`). Fold the source predicate into `buildFilterSQL`, and add it to `isFilterActive`. Consequence: a source toggle now counts as "filter active" (reset affordance, chips, style-cache bypass) — this is correct; source *is* a filter.
  - **URL contract unchanged:** keep the existing `src=` param name/format and its round-trip (URL ↔ Sources filter chips ↔ list). The roadmap explicitly requires verifying this round-trip stays consistent. Internal home moves to `FilterState`; serialization stays as today's `src=` (currently `ui.hiddenSources` in `url-state.ts`).

### Map mechanism
- **D-03:** **Leave the map as-is.** The map's client-side `_visibleBySource` is not a perf workaround — it is structurally required and does a job the SQL predicate cannot:
  - The map holds the entire occurrence universe in `_fullGeoJSON` (loaded once, `bee-map.ts:291`, never re-queried) and derives three things from it in memory via `_visibleBySource`: the no-filter render (`:624`), the **ghost layer** (`:614`, full-set minus `visibleIds`), and the selection overlay (`:658`).
  - Mapbox clusters at the *source* level; a `setFilter` layer filter can't hide cluster bubbles (they aggregate before the filter), so hiding a source means removing it from the source DATA and re-clustering.
  - **Why convergence to SQL would regress (the concrete failure):** with source in `FilterState`, `intendedFilterActive` flips true on a source-only toggle and the map enters its filter-active branch. The ghost layer = `_fullGeoJSON` (still source-blind) minus `visibleIds` (SQL-excluded the hidden source) → **every deselected-source point reappears as a dimmed ghost dot.** Today `_visibleBySource` strips exactly those from the ghost set. Truly making SQL the sole mechanism would force re-fetching `_fullGeoJSON` on every toggle (instant gesture → SQL round-trip) and conflate two semantics: the ghost layer means "what exists *beyond* your attribute filter"; a hidden source is *suppressed*, not beyond. Different operations.
- **D-04 (derived constraint — load-bearing):** The map **MUST keep** its `hiddenSources` property + `_visibleBySource`. Do **not** delete them as "now redundant" after D-02. With source in `FilterState`, the main dot layer gets a harmless idempotent double-filter (SQL + `_visibleBySource`), and the ghost/selection sets still net to empty for hidden sources exactly as today. Removing `_visibleBySource` reintroduces the ghost-dot bug. Verify the style-cache bypass invariant (CLAUDE.md) still holds once a source toggle trips `isFilterActive` (it bypasses *more*, which is the safe direction).

### All-off behavior
- **D-05:** When all 4 sources are deselected → SQL views show an **honest empty (zero)**: list empty, filter-result count 0, CSV empty, table empty. Matches the map (which already renders empty when every feature is filtered out). "All off = show all" is rejected — it would re-introduce the very map/list disagreement this phase exists to kill.

### Claude's Discretion
- Exact SQL shape of the source predicate (`source IN (...)` over visible sources vs `source NOT IN (...)` over hidden) and where in `buildFilterSQL` it sits — researcher/planner's call, subject to the existing `o.`-alias invariant on the occurrences table.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source filter (the feature being extended)
- `src/bee-map.ts` §`_visibleBySource` / `_applyVisibleIds` / `_applySourceFilter` (≈580–676) — the map's in-memory source filter, ghost layer, and clustering rationale. The "leave as-is" decision (D-03/D-04) is grounded here.
- `src/url-state.ts` §`hiddenSources` (≈38, 94–95, 294–302) — `src=` serialization (currently under `ui.hiddenSources`); the round-trip to preserve.

### Filter pipeline (where the fix lands)
- `src/filter.ts` §`buildFilterSQL` (≈297–388), `isFilterActive` (≈246–258), `FilterState` (≈13–26), and the query consumers `queryVisibleGeoJSON` / `queryAllFiltered` / `queryTablePage` / `queryListPage` — the single SQL predicate + its four consumers (D-01, D-02).
- `src/bee-atlas.ts` §`_hiddenSources` state (104), `intendedFilterActive` getter (200–204), `_runFilterQuery` (755–761), `_buildCurrentParams` (1093–1096), `_onSourceFilterChanged` (1699–1700) — state ownership + wiring (D-02, D-04).

### Precedent
- Phase 156 (`.planning/phases/156-*`) — bounds promoted to first-class `FilterState`; the model D-02 follows. Memory: `[[project_bounds_are_filter_not_selection]]`.
- `CLAUDE.md` — Architecture Invariants: State ownership, **Style cache** (bypass when `filterState` active or `selectedOccIds` non-empty), Filter race guard (`_filterQueryGeneration`), ID format. All relevant to D-02/D-04.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `buildFilterSQL(f)` is the single WHERE-clause builder shared by all four SQL views — adding the source predicate here fixes the list, count, CSV, and table at once (D-01).
- `isFilterActive(f)` already enumerates every FilterState dimension (incl. `bounds`) — source slots in alongside (D-02).
- `bee-pane` already renders the Sources checkboxes and emits `hiddenSources`; the chip/round-trip UI exists — this phase moves where the value is *stored*, not the UI.

### Established Patterns
- Phase 156's bounds-as-FilterState migration is the template: add field → `buildFilterSQL` clause → `isFilterActive` → keep URL param name.
- Filter race guard (`_filterQueryGeneration` / `_filterGuard`) already wraps `_runFilterQuery`; the source predicate rides the existing async path with no new guard needed.

### Integration Points
- `<bee-atlas>` owns `_hiddenSources` today and feeds it to both `<bee-map>` and `<bee-pane>` as a property — D-02 relocates it into `_filterState`, but `<bee-map>` must keep receiving it (D-04). Confirm `_onSourceFilterChanged` writes into `_filterState` and still triggers `_runFilterQuery` + `_replaceUrlState`.

</code_context>

<specifics>
## Specific Ideas

User drove the map-mechanism decision by asking *why* the map doesn't already use the SQL filter and whether it was a perf issue — it isn't; the answer (D-03) is structural (clustering + ghost layer over the in-memory full set). The decision to leave the map alone is grounded in that concrete ghost-dot failure mode, not risk-aversion.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Phase 165 already tracks the separate duplicate-occ_id list-rendering bug; not folded here.)

</deferred>

---

*Phase: 164-sidebar-list-ignores-src-source-filter*
*Context gathered: 2026-06-24*
