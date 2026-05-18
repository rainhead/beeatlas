# Phase 100: Map & Filter Integration - Context

**Gathered:** 2026-05-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend the existing boundary mode toggle, filter chip system, and URL state to support places:
- Add `'places'` as a 4th boundary mode (Off / Counties / Ecoregions / Places)
- Render places as a GeoJSON polygon layer from `public/data/places.geojson`
- Clicking a place polygon (when in Places mode) applies a place filter
- Place filter chip appears in filter panel; removable; ghosts occurrences outside the polygon via `place_slug` SQL filter
- Active place slug encoded as `place=` URL param; restoring it also auto-activates Places boundary mode
- The `/?place={slug}` deep-link from place static pages (Phase 99 D-06) is activated by this phase

</domain>

<decisions>
## Implementation Decisions

### URL deep-link behavior
- **D-01:** `place=slug` in the URL implies `bm=places`. Parsing `place=` sets both the filter (`selectedPlace`) AND `boundaryMode = 'places'`. No need to include `bm=places` separately — the place param carries it. Deep-links from place pages (`/?place=slug`) will show the polygon overlay alongside the filter chip.

### Click interaction precedence
- **D-02:** Occurrence dot click wins over place polygon click. `bee-map` queries the point layer first; if a dot is hit, the sidebar opens as today. The place polygon click handler only fires when no occurrence dot is under the cursor.
- **D-03:** Place polygon click is only active when `boundaryMode === 'places'`. No invisible click targets — the place fill layer handles clicks only when visible.

### Boundary mode / filter coupling
- **D-04:** Place filter persists when the user switches boundary mode away from Places. The chip stays active (occurrences remain ghosted by `place_slug` SQL filter), but polygon boundaries hide. Consistent with how county/ecoregion filters work independent of boundary display mode.
- **D-05:** When `boundaryMode` switches TO `'places'` and a place filter is already active, the matching polygon renders with a selected-state highlight (same feature-state pattern used for county/ecoregion selected fill).

### Place polygon visual style
- **D-06:** Warm amber/orange color family — distinct from the blue (`rgba(44, 123, 229, ...)`) used for both counties and ecoregions. Exact shade to builder's discretion within that hue family.
  - Unselected line: `rgba(180, 100, 30, 0.65)` area (warm amber stroke)
  - Unselected fill: transparent or very low opacity amber
  - Selected line: `rgba(220, 130, 30, 0.85)` area (brighter amber)
  - Selected fill: `rgba(220, 130, 30, 0.12)`

### FilterState and OccurrenceRow extensions
- **D-07:** Add `selectedPlace: string | null` to `FilterState` (singular, not a Set — multi-place is PRICH-02 future). Add `place_slug: string | null` to `OccurrenceRow` and `OCCURRENCE_COLUMNS` (matches the `county`/`ecoregion_l3` pattern from Phase 98's parquet column).
- **D-08:** `buildFilterSQL` adds `WHERE place_slug = ?` clause when `selectedPlace` is non-null.

### URL state encoding
- **D-09:** `place=` param in `url-state.ts` serializes `filter.selectedPlace`. On parse, any non-null `place` value also forces `boundaryMode = 'places'` in the returned UI state (implementing D-01).

### Claude's Discretion
- Exact amber hex/rgba values (within warm amber family)
- Whether to add a `place-label` symbol layer for place names (likely no — not in PMAP requirements)
- Feature-state vs paint expression for selected-state highlighting (follow the existing county/ecoregion pattern — feature-state + `setFeatureState`)
- Mapbox source ID for places (suggest `'places'` consistent with `'counties'`/`'ecoregions'`)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §PMAP-01 through §PMAP-04 — The 4 requirements this phase implements
- `.planning/ROADMAP.md` §Phase 100 — Success criteria and dependency on Phase 98

### Key source files to extend
- `src/filter.ts` — `FilterState` interface (add `selectedPlace`), `OccurrenceRow` (add `place_slug`), `buildFilterSQL` (add place clause), `isFilterActive` (add place check)
- `src/url-state.ts` — `encodeParams` (add `place=` param), `parseParams` (parse `place=` and set `boundaryMode = 'places'`)
- `src/bee-atlas.ts` — `_boundaryMode` type extension to `'places'`, place filter state management, event handlers
- `src/bee-map.ts` — places GeoJSON source/layer setup, click handler for place polygons, `boundaryMode` property type extension
- `src/bee-filter-panel.ts` — place filter chip rendering and removal

### Closest patterns
- `src/bee-map.ts` §ecoregion-fill / §ecoregion-line / §county-fill / §county-line — exact style/layer setup to replicate for places (lines 415–490)
- `src/bee-map.ts` §_selectBoundary — mode switching logic to extend for `'places'`
- `src/bee-filter-panel.ts` §_removeCounty / §_removeEcoregion — chip removal pattern for `_removePlace`
- `src/url-state.ts` lines 72–84 — boundary mode + filter param encoding to follow for `place=`

### Pipeline outputs (consumed by this phase)
- `public/data/places.geojson` — slug + polygon geometry; fetched by `bee-map` for the places layer
- `public/data/places.json` — metadata (for option tooltips or chip label resolution if needed)
- `occurrences.parquet` §place_slug — added by Phase 98; loaded into wa-sqlite; filtered via `WHERE place_slug = ?`

### Prior phase context
- `.planning/phases/99-place-static-pages/99-CONTEXT.md` — D-06: deep-link anchor `/?place={slug}` is the entry point this phase activates

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `_countyIdMap` / `_ecoregionIdMap` in `bee-map.ts` — feature-state lookup pattern; add `_placeIdMap: Map<number, string>` following the same pattern
- County/ecoregion `generateId: true` source + `setFeatureState` for selection highlight — exact same mechanism for place polygon highlight
- `bee-filter-panel.ts` `.chip` / `.chip-remove` CSS — reuse for place chip (no new CSS classes needed)

### Established Patterns
- `boundaryMode` flows: `bee-atlas._boundaryMode` → passed as property to `bee-map` and `bee-filter-panel` → `bee-map` emits `boundary-mode-changed` CustomEvent → `bee-atlas._onBoundaryModeChanged` handles
- County/ecoregion filter chips: `FilterState.selectedCounties/selectedEcoregions` → `bee-filter-panel` renders chips → `_removeCounty`/`_removeEcoregion` emit `filter-changed` → `bee-atlas` updates `_filterState`
- `_filterQueryGeneration` counter in `bee-atlas` guards async query results — place filter changes must also trigger this
- Feature-state selection highlight: `map.setFeatureState({ source: 'counties', id: numericId }, { selected: true })` — follow for `source: 'places'`

### Integration Points
- `bee-map` is a pure presenter — all state changes flow up via CustomEvents; place polygon click emits a new `place-selected` event with `{ detail: slug }`
- `bee-filter-panel` receives `filterState` as a property; place chip appears when `filterState.selectedPlace !== null`
- `bee-atlas.ts` `_onBoundaryModeChanged` handles mode changes — extend type from `'off' | 'counties' | 'ecoregions'` to add `'places'`
- URL restoration in `bee-atlas.ts` `_init`: extend to handle `place` from parsed params

</code_context>

<specifics>
## Specific Ideas

- Place chip label: use the place slug initially if no name lookup is available; or load from `places.json` for a display name
- The `place=` URL param carries the slug (not the display name)

</specifics>

<deferred>
## Deferred Ideas

- Multi-place filter chips with OR semantics (PRICH-02) — future milestone
- Place polygon label layer showing place names on the map — out of PMAP scope

</deferred>

---

*Phase: 100-map-filter-integration*
*Context gathered: 2026-05-17*
