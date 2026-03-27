# Phase 18: Map Integration - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire the region boundary overlay into the live map: toggle between off / counties / ecoregions, handle polygon clicks that add/remove regions from the active filter, and encode region filter state in the URL. No sidebar chips in this phase (Phase 19). No polygon highlighting (MAP-11 deferred).

</domain>

<decisions>
## Implementation Decisions

### Boundary Toggle UI
- A floating control in the **top-right corner** of the map — three always-visible buttons: **Off**, **Counties**, **Ecoregions**
- The active button is visually highlighted (Claude's discretion on exact style — solid fill vs. strong border)
- Button labels: exactly "Off / Counties / Ecoregions"
- Whether to keep or remove this floating toggle when Phase 19 ships the sidebar control: **decide in Phase 19** (don't hard-code removal)

### Boundary Stroke Style
- Change from current `#3388ff` (OL default blue) to a **more subtle color** — lighter or semi-transparent so boundary lines don't dominate over specimen/sample points
- Claude picks the specific color/opacity during implementation

### Polygon Click Behavior
- Clicking a polygon **adds** the region to the active filter (selectedCounties or selectedEcoregions Set)
- Clicking an **already-selected** polygon **removes** it (toggle deselect)
- Clicking **outside all polygons** (open map area) **clears the entire region filter** (all counties and ecoregions)
- After a polygon click the boundary overlay **stays visible** — user can keep clicking to add/remove regions
- Each polygon click triggers **pushState** immediately (creates browser history entry, back button undoes region selection)
- Polygon click shows a **simple text line in the sidebar**: "Filter: [Region Name]" — Phase 19 replaces this with chips

### Specimen/Sample Click Priority
- Specimen and sample dot clicks take priority over polygon clicks (already decided in STATE.md)
- singleclick handler: check specimen layer (or sample layer per layerMode) first; only check polygon layer if no specimen/sample hit

### Region Filter Scope
- Region filter applies to **both layers simultaneously** — filtering King County hides specimens AND samples outside King County regardless of which layer is visible
- Consistent with how taxon/date filters work (global, not layer-gated)

### Layer Mode Independence
- Boundary overlay mode (off/counties/ecoregions) is **fully independent** of layer mode (specimens/samples)
- Switching between specimens and samples **preserves** the boundary overlay and region filter
- Region filter persists across layer mode switches

### Filter + Overlay Coupling
- Turning the overlay **off** (clicking the Off button) **clears the region filter** (selectedCounties and selectedEcoregions both reset to empty Sets)
- URL also clears (bm=, counties=, ecor= params all dropped) when overlay is turned off
- This means: filter active = overlay visible; filter inactive = overlay off

### URL Encoding
- `bm=counties` or `bm=ecoregions` when overlay is active; **omit `bm=` entirely** when off (absence = off)
- `counties=` comma-separated, percent-encoded county names (e.g. `counties=King%20County,Pierce%20County`)
- `ecor=` comma-separated, percent-encoded ecoregion names (e.g. `ecor=Cascades,Puget%20Lowland`)
- Full restore on URL paste: bm= activates the overlay, counties=/ecor= apply the filter — both immediately on load

### Claude's Discretion
- Exact visual styling of active vs. inactive toggle buttons
- Subtle boundary stroke color and opacity
- How `buildSearchParams` and `parseUrlParams` are extended (additive, same pattern as existing params)

</decisions>

<specifics>
## Specific Ideas

- The toggle should behave like a button group (radio-button style) — three options, one active at a time
- "Filter: King County" sidebar text is intentionally minimal — Phase 19 will make it look polished with chips

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `region-layer.ts`: exports `regionLayer` (VectorLayer, starts invisible), `countySource`, `ecoregionSource`, `boundaryStyle` — Phase 18 imports these and wires them into `bee-map.ts`
- `filter.ts`: `filterState.selectedCounties` and `filterState.selectedEcoregions` Sets already defined; `matchesFilter()` already handles them
- `style.ts` + `filter.ts`: `clusterSource.changed()` repaint pattern to trigger map refresh after filter state mutation

### Established Patterns
- `buildSearchParams()` in `bee-map.ts`: extend to add `bm=`, `counties=`, `ecor=` params
- `parseUrlParams()` in `bee-map.ts`: extend to parse and restore boundary mode + region filter
- `layerMode` as `@state()`: `boundaryMode: 'off' | 'counties' | 'ecoregions'` follows the same pattern
- `_isRestoringFromHistory` guard: required on the popstate restore path to avoid feedback loops
- `pushState` on meaningful user interactions (polygon click), `replaceState` on moveend

### Integration Points
- `bee-map.ts` `firstUpdated()`: add `regionLayer` to the map's layer array (after specimen/sample layers for correct z-order)
- `bee-map.ts` `singleclick` handler: polygon hit-test added as fallback after specimen/sample hit-test misses
- `bee-map.ts` template: floating toggle buttons rendered in top-right corner (positioned absolute over the map)
- County feature property: `NAME` (e.g. "King"); ecoregion feature property: `NA_L3NAME` (e.g. "Cascades") — **confirmed by Phase 17 verifier**
- Turning overlay off → clear both Sets → call `clusterSource.changed()` to repaint

</code_context>

<deferred>
## Deferred Ideas

- Polygon highlighting when selected — MAP-11 deferred (sidebar chips are sufficient confirmation at launch)
- Whether Phase 18 floating toggle persists or is removed in Phase 19 — decide in Phase 19

</deferred>

---

*Phase: 18-map-integration*
*Context gathered: 2026-03-14*
