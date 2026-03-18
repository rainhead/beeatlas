# Phase 19: Sidebar UI - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Add county and ecoregion filter controls to the sidebar: multi-select autocomplete with removable chips for each, a boundary mode toggle (replacing the Phase 18 floating map control), and extending "Clear filters" to also reset region selections. No changes to map polygon click behavior (already ships in Phase 18).

</domain>

<decisions>
## Implementation Decisions

### Boundary Toggle — Placement and Style
- The Phase 18 floating `Off / Counties / Ecoregions` button group on the map **is removed** in this phase. The sidebar becomes the only place to control boundary mode.
- The toggle lives **at the top of the sidebar, above the filter controls** — boundary mode is a map display setting, visually distinct from the data filters.
- Style: **same three-button group as the existing Specimens / Samples toggle** — three always-visible buttons (Off, Counties, Ecoregions), one active at a time, same active/hover styles.

### Clear Filters Extension
- `_clearFilters()` in `bee-sidebar.ts` must also reset county and ecoregion selections (FILTER-06 requirement).
- After clearing, boundary mode should be reset to Off (consistent with Phase 18 decision: filter inactive = overlay off).

### Claude's Discretion
- Region controls layout (where county and ecoregion autocomplete + chips appear relative to existing taxon/date controls).
- Whether region controls are visible in sample mode (region filter applies to both layers, so showing them in sample mode is appropriate — Claude decides the exact layout).
- Autocomplete input model: native datalist vs. custom dropdown for county/ecoregion (there are ~39 WA counties and ~8–10 ecoregions — a datalist may be sufficient).
- Chips presentation: interleaved vs. grouped by type; exact chip style.
- Type label disambiguation: FILTER-04 requires chips to show "county" / "ecoregion" label when both are active; Claude decides the visual treatment.

</decisions>

<specifics>
## Specific Ideas

- None beyond the requirements — open to standard approaches for autocomplete + chips.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — FILTER-03, FILTER-04, FILTER-06 define the county/ecoregion filter requirements including chip type labels and Clear filters behavior.

### Existing sidebar and filter code
- `frontend/src/bee-sidebar.ts` — Full sidebar component. `regionFilterText` prop (Phase 18 stub) is replaced by chips in this phase. `_clearFilters()` needs region reset. The Specimens/Samples button group is the style reference for the new boundary toggle.
- `frontend/src/bee-map.ts` — Contains `_setBoundaryMode()`, `boundaryMode` @state, the floating `.boundary-toggle` template block (lines ~622–629, to be removed), `_regionFilterText` / `_buildRegionFilterText()`, and `FilterChangedEvent` handler `_applyFilter()`. The `filterState.selectedCounties` / `selectedEcoregions` Sets are mutated here in response to polygon clicks — Phase 19 also needs the sidebar to mutate them.
- `frontend/src/filter.ts` — `filterState.selectedCounties` and `selectedEcoregions` Sets; `matchesFilter()` already handles them.

### Styles and layout
- `frontend/src/bee-map.ts` lines ~385–430 — `.boundary-toggle` CSS (floating control, to be removed or migrated to sidebar).
- `frontend/src/bee-sidebar.ts` CSS — `.layer-toggle`, `.toggle-btn`, `.toggle-btn.active` are the reference styles for the sidebar boundary toggle.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `bee-sidebar.ts` `.layer-toggle` / `.toggle-btn` CSS: exact style to reuse for the new Off/Counties/Ecoregions button group.
- `bee-sidebar.ts` `regionFilterText` prop: Phase 18 stub (`<p class="region-filter-text">`) is the insertion point — replace with chip UI.
- `bee-map.ts` `_setBoundaryMode()`: contains the boundary mode state + side-effects (clears filter, sets region source, triggers pushState). Needs to be driven from sidebar events rather than inline button handlers.
- `bee-sidebar.ts` `taxaOptions` / datalist pattern: model for how region autocomplete options could be supplied (parent passes list, sidebar renders input + datalist).

### Established Patterns
- Filter-changed event flow: sidebar dispatches `filter-changed` CustomEvent → `bee-map.ts` `_applyFilter()` mutates `filterState` → `clusterSource.changed()` repaints. Region filter changes need to plug into this same flow (extend `FilterChangedEvent` or dispatch a separate region-changed event).
- `@property({ attribute: false })` props for parent→child data flow; `@state()` for internal UI state.
- URL round-trip already works for region filter (`counties=`, `ecor=`, `bm=` params) — no changes needed there.
- `_regionFilterText` is built in `bee-map.ts` and passed as a prop to `bee-sidebar`. Phase 19 moves this concern into the sidebar (sidebar knows selected regions and renders chips directly).

### Integration Points
- Remove floating `.boundary-toggle` from `bee-map.ts` template and associated CSS (~lines 393–418, 622–629).
- Add boundary mode as a sidebar `@property` driven by `bee-map.ts` (same pattern as `layerMode`), or expose a `boundary-changed` event that `bee-map.ts` listens to.
- `bee-map.ts` `_applyFilter()` or a sibling handler must update `filterState.selectedCounties` / `selectedEcoregions` when the sidebar dispatches region changes.
- County names come from GeoJSON feature property `NAME`; ecoregion names from `NA_L3NAME` — these lists need to be passed to the sidebar as autocomplete options (derived at load time from the loaded GeoJSON).

</code_context>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope.

</deferred>

---

*Phase: 19-sidebar-ui*
*Context gathered: 2026-03-18*
