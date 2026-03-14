# Feature Research

**Domain:** Multi-layer interactive map with polygon-based geographic region filtering — specimen atlas addendum
**Researched:** 2026-03-14
**Confidence:** HIGH (codebase directly inspected; OpenLayers Select API verified; map UX patterns cross-referenced from multiple sources)

---

## Scope: v1.5 Geographic Regions

This milestone adds geographic region filtering to the existing specimen/sample map. The pipeline
will spatial-join region attributes (`county`, `ecoregion_l3`) into both Parquet files at build
time. The frontend adds a boundary overlay toggle on the map and multi-select region filters in
the sidebar. Region filter ANDs with existing taxon/date filters. Clicking a visible polygon adds
it to the active filter.

**Existing filter system (do not break):**
- `FilterState` singleton in `filter.ts` with fields: `taxonName`, `taxonRank`, `yearFrom`,
  `yearTo`, `months`
- `isFilterActive()` and `matchesFilter()` functions used throughout `bee-map.ts`
- `BeeSidebar` dispatches `filter-changed` CustomEvent; `BeeMap` receives and applies it
- URL state encodes all filter fields via `replaceState`/`pushState` pattern
- Month filter uses checkbox Set; taxon uses autocomplete datalist with exact-match gate

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist in any map tool with region filtering. Missing these = feature feels
incomplete or broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Region filter clears all data when no regions share an intersection | AND semantics is the universal expectation for combined filters; "nothing matches" is the correct and expected empty state | LOW | Same pattern as existing taxon + date AND logic |
| Active region filter visually reflected in the UI | Users need confirmation the filter is applied; a filter with no visible feedback feels broken | LOW | Selected chips/tags in sidebar; highlighted polygons on map if overlay is on |
| Multi-select for both county and ecoregion | Collectors frequently work across multiple counties or within a large ecoregion that spans boundaries; single-select forces repeated toggling | MEDIUM | Two independent multi-select autocomplete inputs, one per region type |
| Remove individual regions from active filter | Chip/tag removal is the standard affordance after any multi-select UI | LOW | X button on each selected region chip; clicking polygon in active filter removes it |
| Clear all region filters at once | Consistent with existing "Clear filters" button; collectors routinely switch study areas | LOW | Extend existing `_clearFilters()` to reset region arrays |
| Region filter applies to both specimens and samples | Both layers show data for the same geography; filtering only one is confusing | MEDIUM | Pipeline must add county/ecoregion_l3 to both ecdysis.parquet and samples.parquet; frontend matchesFilter() must check the new columns |
| Boundary overlay off by default | A polygon overlay on top of clustered points adds visual noise for users not using region filtering; default-off is the standard | LOW | Initial state: no polygon layer visible; toggle activates one of two vector layers |
| Map position unchanged when region filter applied | Applying a filter should not auto-pan or auto-zoom; collectors know where they are | LOW | Explicitly called out in PROJECT.md; do not call `map.getView().fit()` on filter change |

### Differentiators (Competitive Advantage)

Features that make this implementation notably better than a generic region filter add-on.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Click a visible polygon to add it to the active filter | Direct map interaction is faster than typing for geographic selection; collectors naturally think spatially | MEDIUM | Requires OL Select interaction on the boundary VectorLayer; fires only when overlay is visible; clicking an already-selected polygon removes it (toggle) |
| Exclusive 3-state boundary toggle (off / counties / ecoregions) | County and ecoregion boundaries overlap and visually conflict if shown together; mutual exclusion forces legibility | LOW | Three-state segmented button in UI; same pattern as existing specimens/samples toggle; `layer.setVisible(false)` on the inactive boundary layer |
| Region filter on sidebar, boundary toggle on map, linked | Filter and map view are synchronized: when overlay is off but filter is active, the sidebar shows active regions as chips; when overlay is on, selected polygons are highlighted | MEDIUM | Highlight requires OL Select interaction or manual style callback that checks region membership |
| Region type label in selected chip | "King (county)" vs "Blue Mountains (ecoregion)" prevents ambiguity when both region types are in the active filter simultaneously | LOW | Prefix or suffix tag on chip; data-driven from region type field |
| Autocomplete narrows by prefix match | 39 WA counties and ~12 EPA L3 ecoregions fit in dropdown, but prefix autocomplete is faster than scrolling | LOW | HTML datalist with options pre-populated from GeoJSON; matches existing taxon autocomplete pattern |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Auto-zoom to selected region bounding box | "Show me King County" feels natural as zoom + filter | Violates PROJECT.md constraint ("map position unchanged when region is selected"); disorients collectors who've manually positioned the view | Do not auto-zoom; let the boundary overlay and highlighted polygon provide visual confirmation |
| Draw-a-polygon custom region filter | Power-user spatial selection; common in ArcGIS tools | Adds significant UI complexity (OL Draw interaction, polygon simplification, spatial query against Parquet attributes); pipeline spatial join is at named-region granularity, not arbitrary geometry | Named region filter (county/ecoregion) covers the actual use case; arbitrary polygon is v3+ if ever requested |
| Show specimens AND boundary overlay as a simultaneous combined view with automatic layer ordering | "I want to see clusters inside King County" is intuitive | Not an anti-feature per se — this IS the target behavior. The risk is z-index fighting between polygon fill and point clusters. The correct approach is semi-transparent fill (fill opacity ≈ 0.08–0.15) so clusters remain visible | Semi-transparent polygon fill on boundary layer; stroke only; clusters on top via z-index |
| OR logic between regions of the same type | "Show me King OR Pierce County" — collector might expect checkbox-style OR | AND across region types (county AND ecoregion) is required; OR within the same type is the natural expectation for multi-select. But implementing OR-within-type, AND-across-type introduces query logic complexity | Use OR within a single region type naturally: "selected counties" forms a union; "selected ecoregions" forms a union; the two unions are then ANDed together. This is the correct UX expectation and is consistent with how faceted search works |
| Server-side spatial query | "Just query the database for features in the polygon" | Static hosting constraint: no server runtime. All filtering is client-side against Parquet data with pre-joined region columns | Pipeline spatial join at build time; client reads pre-assigned region name columns |
| Save named regions as presets | Collectors might want to bookmark "my study area = Okanogan + Chelan" | URL sharing already covers the use case (region filter state encoded in query string); named presets require persistent storage | Encode selected regions in URL query params; share the URL |

---

## Feature Dependencies

```
[Pipeline spatial join: county + ecoregion_l3 columns in both Parquet files]
    └──required by──> [Region filter in matchesFilter()]
    └──required by──> [Autocomplete populates from unique column values in Parquet]

[GeoJSON bundled at build time: WA counties + EPA L3 ecoregions]
    └──required by──> [Boundary overlay VectorLayer on map]
    └──required by──> [Click-polygon-to-filter (Select interaction)]

[Boundary overlay VectorLayer]
    └──enables──> [3-state boundary toggle (off/counties/ecoregions)]
    └──enables──> [Click polygon → add to filter]
    └──enhances──> [Selected polygon highlight when filter active]

[Region filter state (Set<string> counties, Set<string> ecoregions)]
    └──extends──> [FilterState in filter.ts]
    └──requires──> [isFilterActive() updated]
    └──requires──> [matchesFilter() updated for both Parquet row schemas]
    └──requires──> [URL encoding updated for region params]
    └──requires──> [BeeSidebar updated to render region chips + autocomplete inputs]
    └──requires──> [filter-changed CustomEvent detail updated]

[Click polygon → add to filter]
    └──requires──> [Boundary overlay visible (at least one boundary layer active)]
    └──conflicts with──> [Boundary overlay off — click hits specimen/sample layer instead]

[Selected polygon highlight on map]
    └──requires──> [Boundary overlay visible]
    └──requires──> [OL style function that checks region membership in active filter]

[Region filter]
    └──ANDs with──> [Existing taxon filter]
    └──ANDs with──> [Existing year/month filter]
    └──applies to──> [Specimen cluster layer]
    └──applies to──> [Sample dot layer]
```

### Dependency Notes

- **Pipeline spatial join is a hard prerequisite:** Without `county` and `ecoregion_l3` columns in
  both Parquet files, the frontend cannot filter. The pipeline phase must complete before any
  frontend filter work can be validated. This creates a strong phase ordering constraint.

- **OR-within-type AND-across-types semantics:** A specimen matches the region filter if
  `(counties.size === 0 || counties.has(feature.county)) && (ecoregions.size === 0 || ecoregions.has(feature.ecoregion_l3))`.
  Empty set means "no restriction on this type." This is the natural multi-select faceted search
  model and what users expect when selecting multiple counties.

- **GeoJSON size consideration:** WA county boundaries at full resolution are ~2 MB; simplified
  at 0.001 degree tolerance (Mapshaper default) typically reduce to ~100–200 KB. EPA L3 ecoregion
  boundaries for WA are smaller (fewer polygons). Both must be bundled with the Vite build as
  static assets. Total boundary asset budget: aim for under 500 KB combined to keep bundle size
  acceptable.

- **Autocomplete values from Parquet vs GeoJSON:** The list of county/ecoregion names should come
  from unique values in the Parquet data (what actually has records), not from GeoJSON (full
  boundary set). A county with zero specimens should still appear in the autocomplete if the
  GeoJSON includes it, but this adds noise. Using Parquet-derived unique values is cleaner.

- **URL state extension:** The existing URL schema uses single-value params
  (`taxon`, `yr0`, `yr1`, `months`). Multi-select regions require repeatable params or
  comma-delimited strings. Comma-delimited is simpler to implement given the existing pattern
  (e.g., `c=King,Pierce&e=Blue+Mountains`). County names with spaces need encoding.

- **FilterState is a singleton (not Lit reactive):** Adding region arrays to FilterState follows
  the existing pattern. The singleton mutation + `clusterSource.changed()` repaint pattern
  documented in PROJECT.md Key Decisions works for region filtering too. No architecture change
  needed.

---

## MVP Definition

### Launch With (v1.5)

Minimum viable product — the goal stated in PROJECT.md.

- [ ] PIPE: Pipeline spatial join adds `county` and `ecoregion_l3` to both `ecdysis.parquet` and
      `samples.parquet` at build time (using geopandas or pyogrio point-in-polygon)
- [ ] DATA: WA county GeoJSON and EPA Level III ecoregion GeoJSON bundled with Vite build
      (simplified to keep file size reasonable)
- [ ] MAP-TOGGLE: Exclusive 3-state boundary overlay toggle (off / counties / ecoregions) on
      map; clicking toggles VectorLayer visibility
- [ ] FILTER-REGION: County multi-select autocomplete in sidebar sidebar; ecoregion multi-select
      autocomplete in sidebar; selected regions shown as removable chips
- [ ] FILTER-CLICK: Clicking a visible region polygon adds it to the active filter (or removes it
      if already selected)
- [ ] FILTER-AND: Region filter ANDs with existing taxon/date filters; applies to both specimen
      and sample layers
- [ ] URL: Region filter state encoded in URL query params (shareable)

### Add After Validation (v1.x)

- [ ] Selected polygon highlighted distinctly from unselected polygons when overlay is on —
      useful but not blocking; the sidebar chip list is sufficient confirmation at launch
- [ ] Autocomplete values derived from Parquet unique values rather than hardcoded GeoJSON names
      — correctness improvement; defer until mismatch is actually observed

### Future Consideration (v2+)

- [ ] Filter summary in sidebar shows "X of Y specimens in selected region" — requires
      cross-cutting count logic; defer until basic region filter ships and collectors request it
- [ ] Arbitrary draw-a-polygon region filter — significant complexity; named regions cover the
      use case for the Washington Bee Atlas

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Pipeline spatial join (county + ecoregion) | HIGH | MEDIUM | P1 |
| Bundle GeoJSON boundaries | HIGH | LOW | P1 |
| Boundary overlay toggle (3-state) | HIGH | LOW | P1 |
| Sidebar region multi-select autocomplete | HIGH | MEDIUM | P1 |
| Click polygon to add to filter | HIGH | MEDIUM | P1 |
| Region filter ANDs with existing filters | HIGH | LOW | P1 |
| URL encoding of region filter state | MEDIUM | LOW | P1 |
| Selected polygon highlight on map | MEDIUM | LOW | P2 |
| Parquet-derived autocomplete values | LOW | LOW | P2 |
| Filter result count by region in sidebar | LOW | MEDIUM | P3 |
| Arbitrary draw-polygon filter | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for v1.5 launch
- P2: Should have, add if time permits
- P3: Nice to have, future milestone

---

## Implementation Notes

### Existing Filter Integration

The key extension points in the current codebase:

**`filter.ts`** — extend `FilterState`:
```
counties: Set<string>      // empty = no restriction
ecoregions: Set<string>    // empty = no restriction
```
Update `isFilterActive()` to check `counties.size > 0 || ecoregions.size > 0`.
Update `matchesFilter()`: AND the two region checks with existing taxon/date checks.
For the sample layer, a parallel `matchesSampleFilter()` (or generalized version) must
check the same region columns on sample rows.

**`bee-sidebar.ts`** — the `FilterChangedEvent` detail must include `counties` and `ecoregions`.
The sidebar renders two new autocomplete inputs (one per region type) below the existing month
grid, plus a chips row showing selected regions. The existing `_clearFilters()` clears these too.
The existing `restoredX` property pattern extends to `restoredCounties` and `restoredEcoregions`.

**`bee-map.ts`** — receives the extended `filter-changed` event; updates `filterState` singleton;
calls `clusterSource.changed()` to repaint. Also manages the boundary VectorLayer(s) and the
OL Select interaction on them.

### Boundary Overlay Toggle

The 3-state toggle (off / counties / ecoregions) is an exclusive segmented control, identical
in logic to the existing specimens/samples toggle. Implementation:
```
state: 'off' | 'counties' | 'ecoregions'
```
On each state change: set `countyLayer.setVisible(state === 'counties')` and
`ecoregionLayer.setVisible(state === 'ecoregions')`. When switching to 'off', deactivate the
OL Select interaction so clicks fall through to the specimen/sample layer.

### Click-to-Filter with OL Select Interaction

OpenLayers has a built-in `ol/interaction/Select` that handles single-click on vector features,
applies a highlight style, and maintains a selected features collection. For click-to-filter:

1. Add an `ol/interaction/Select` targeting whichever boundary layer is currently active.
2. On `select` event: read the clicked feature's region name property, toggle it in/out of the
   active filter Set, dispatch `filter-changed`, repaint.
3. The Select interaction's style callback should reflect the filter state — selected regions
   (those in the active filter) get a distinct fill/stroke regardless of whether they were
   the most recently clicked feature.

Alternatively, a plain `singleclick` handler on the map can call
`countyLayer.getFeatures(event.pixel)` to detect a polygon hit when the overlay is visible.
This is simpler and avoids interaction priority issues with the existing specimen cluster
click handler. The simpler approach is preferred given the existing codebase pattern.

### GeoJSON Sources

- **WA Counties:** Washington State Department of Transportation or US Census TIGER/Line
  shapefiles (counties for Washington state, EPSG:4326). Simplify with Mapshaper before bundling.
- **EPA Level III Ecoregions:** EPA official download at
  https://www.epa.gov/eco-research/level-iii-and-iv-ecoregions-continental-united-states
  Clip to Washington state extent. Simplify before bundling.

Both should be stored as static assets in `frontend/src/assets/` and imported by Vite.
The Parquet spatial join pipeline needs the same GeoJSON files (or equivalent shapefiles)
as input. A single source of truth (one GeoJSON per region type, used by both pipeline and
frontend) reduces drift risk.

---

## Standard UX Expectations for Polygon Region Filters

Based on analysis of GIS tools (ArcGIS Experience Builder, Foursquare Studio), faceted search
UX literature, and map UI pattern libraries (MEDIUM confidence — patterns verified across
multiple sources):

1. **AND semantics across filter dimensions is universal.** Users expect taxon + region to narrow
   results, not expand them. No tool uses OR across filter categories.

2. **OR semantics within a multi-select is also universal.** Selecting King AND Pierce County
   means "show records in King OR Pierce" — both are included. This is what faceted search users
   expect and what e-commerce sites (the largest training ground for filter UX) consistently do.

3. **Empty multi-select means no restriction, not "nothing matches."** An empty county set
   means "no county filter active" — do not filter by county at all. This is consistent with
   the existing `months` Set behavior (empty Set = no month filter).

4. **Click-to-filter requires the boundary overlay to be visible.** If the polygon layer is off,
   clicking the map should hit the specimen/sample layer as normal. Activating click-to-filter
   without a visible overlay would be invisible affordance — a UX failure.

5. **Selected polygon visual distinction.** When a region is in the active filter AND the
   boundary overlay is on, the polygon should look visually selected (different fill or stroke
   color/weight). This confirms the filter is applied at the spatial level. Fill opacity of
   selected regions can be ~0.25–0.35; unselected ~0.05–0.10.

6. **Removal affordance on every chip.** Each selected region chip must have an X that removes
   only that region. This is the universal chip/tag UX expectation.

7. **"Clear filters" must clear region filters too.** Users expect one action to reset everything.
   Partial clear (only clears taxon, leaves region) is a common complaint in complex filter UIs.

---

## Sources

- OpenLayers Select interaction API: [ol/interaction/Select](https://openlayers.org/en/latest/apidoc/module-ol_interaction_Select-Select.html) — HIGH confidence
- OpenLayers Select Features example: [openlayers.org examples](https://openlayers.org/en/latest/examples/select-features.html) — HIGH confidence
- Spatial filter UX pattern: [Map UI Patterns — Spatial filter](https://mapuipatterns.com/spatial-filter/) — MEDIUM confidence
- Feature selection UX pattern: [Map UI Patterns — Feature selection](https://mapuipatterns.com/feature-selection/) — MEDIUM confidence
- Faceted search multi-select chip UX: [Filter UI Design — insaim.design](https://www.insaim.design/blog/filter-ui-design-best-ux-practices-and-examples) — MEDIUM confidence
- Exclusive layer toggle pattern: [Leaflet layers control](https://leafletjs.com/examples/layers-control/) — MEDIUM confidence (same radio-button-for-base-layers concept)
- AND across filter dimensions, OR within multi-select: [Foursquare geospatial filters docs](https://docs.foursquare.com/analytics-products/docs/filters-geospatial) — MEDIUM confidence
- Existing codebase (`filter.ts`, `bee-sidebar.ts`, `bee-map.ts`, `PROJECT.md`) — HIGH confidence (direct inspection)

---
*Feature research for: Washington Bee Atlas v1.5 Geographic Regions*
*Researched: 2026-03-14*
