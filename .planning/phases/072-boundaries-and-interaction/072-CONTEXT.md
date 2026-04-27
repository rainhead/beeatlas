# Phase 72: Boundaries and Interaction - Context

**Gathered:** 2026-04-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Port region boundary layers (county, ecoregion) and all click interactions (occurrence, cluster, region, empty) from OpenLayers to Mapbox GL JS. Boundary polygons serve as both visual overlays and click targets for region filtering.

</domain>

<decisions>
## Implementation Decisions

### Cluster Click Behavior
- **D-01:** Clicking a cluster queries all cluster leaves and emits `map-click-occurrence` with the full occurrence array. Does NOT zoom to expand. User sees the occurrence list in the sidebar without needing to zoom.

### County/Ecoregion Option Loading
- **D-02:** Filter panel dropdown options (county names, ecoregion names) stay loaded from SQLite in bee-atlas.ts (Phase 71 approach). Boundary layers in bee-map are interactive overlays — click targets that emit `map-click-region` — but do NOT emit county-options-loaded or ecoregion-options-loaded events.

### Claude's Discretion
- Boundary layer rendering order (whether boundaries render above or below occurrence points)
- Boundary highlight mechanism (feature-state vs filter-based — ROADMAP suggests feature-state)
- Whether to implement region-layer.ts as a real module or inline boundary logic directly in bee-map.ts

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 71 Outputs (foundation)
- `.planning/phases/071-base-map-and-occurrence-layer/071-RESEARCH.md` — Mapbox GL JS v3 patterns, pitfalls, cluster/boundary code examples
- `.planning/phases/071-base-map-and-occurrence-layer/071-02-SUMMARY.md` — bee-map.ts rewrite details (layer IDs, source structure, event contracts)

### Existing Data Files
- `frontend/public/data/counties.geojson` — County boundary polygons (already deployed)
- `frontend/public/data/ecoregions.geojson` — Ecoregion boundary polygons (already deployed)

### Key Source Files
- `frontend/src/bee-map.ts` — Target file for boundary layers and click handlers
- `frontend/src/bee-atlas.ts` — Event handler registrations, property bindings
- `frontend/src/region-layer.ts` — Currently stubbed (no-op); decide whether to revive or inline

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `bee-map.ts` region menu UI: already renders the boundary mode toggle (off/counties/ecoregions) with dropdown
- `bee-atlas.ts._loadCountyEcoregionOptions()`: loads filter option lists from SQLite
- `frontend/public/data/counties.geojson` and `ecoregions.geojson`: boundary data ready to fetch

### Established Patterns
- Sources and layers added inside `map.on('load')` callback (from Phase 71)
- `_emit()` helper for custom events with `bubbles: true, composed: true`
- `updated()` reactive property handler dispatches to private helpers (e.g., `_applyVisibleIds`, `_applySelection`)
- Selection highlighting uses filter-based approach on `selected-ring` layer

### Integration Points
- `boundaryMode` property already flows from bee-atlas → bee-map
- `_selectBoundary()` in bee-map already emits `boundary-mode-changed`
- `_onRegionClick` handler in bee-atlas already dispatches filter changes
- Click handler at bee-map.ts:360 is the Phase 72 insertion point (currently emits map-click-empty for all clicks)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard Mapbox approaches for boundary rendering and hit detection.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 72-boundaries-and-interaction*
*Context gathered: 2026-04-27*
