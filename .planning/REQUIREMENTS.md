# Requirements: Washington Bee Atlas

**Defined:** 2026-03-12
**Core Value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.

## v1.5 Requirements

### Pipeline

- [x] **PIPE-05**: Specimens in ecdysis.parquet each have county and ecoregion_l3 values after the pipeline runs (spatial join overrides DarwinCore county field; nearest-polygon fallback handles coastal edge cases where points fall outside polygon boundaries)
- [x] **PIPE-06**: Collection events in samples.parquet each have county and ecoregion_l3 values after the pipeline runs (same spatial join logic as specimens)
- [x] **PIPE-07**: WA county and EPA Level III ecoregion GeoJSON files are simplified, bundled with the frontend build, and available at runtime; CI schema validation (validate-schema.mjs) updated to include county and ecoregion_l3 columns

### Map

- [x] **MAP-09**: User can toggle a boundary overlay between three states: off, county boundaries, ecoregion boundaries — only one boundary type is visible at a time; overlay is independent of the specimen/sample layer toggle
- [x] **MAP-10**: User can click a visible boundary polygon to add that county or ecoregion to the active filter; specimen and sample point clicks take priority over polygon clicks when both could register

### Filter

- [x] **FILTER-03**: User can filter specimens and samples to one or more counties using a multi-select autocomplete with removable chips; county filter uses OR semantics (King OR Pierce) and ANDs with taxon, date, and ecoregion filters
- [x] **FILTER-04**: User can filter specimens and samples to one or more ecoregions using a multi-select autocomplete with removable chips; chips show a type label ("county" / "ecoregion") to disambiguate when both are active simultaneously
- [x] **FILTER-05**: Active region filter state (boundary mode, selected counties, selected ecoregions) is encoded in the URL (bm=, counties=, ecor= params) and restored when the URL is pasted or navigated to
- [x] **FILTER-06**: Clicking "Clear filters" resets county and ecoregion selections in addition to taxon and date filters; map position is unchanged

## v1.4 Requirements (Shipped)

### Map Layer

- [x] **MAP-03**: User can see iNat collection events rendered as simple dot markers on the map as a distinct layer
- [x] **MAP-04**: User can toggle between specimen clusters and sample dots (exclusive — one layer visible at a time; sidebar clears on switch)
- [x] **MAP-05**: Clicking a sample dot shows observer, date, specimen count, and a link to the iNat observation in the sidebar

### Linkage

- [x] **LINK-05**: Specimen sidebar shows a clickable iNat observation link when a linkage exists in links.parquet

## Future Requirements

### Map Layer

- **MAP-06**: URL encoding of selected sample marker (`inat=` param) — defer until collectors confirm they share sample links
- **MAP-07**: Combined specimens + samples view — click disambiguation is non-trivial; defer until collectors request it
- **MAP-08**: Sample dot size-encoded by specimen count — defer until basic layer ships and feedback received

### Map / Region

- **MAP-11**: Selected polygon highlighted distinctly on map — sidebar chips are sufficient confirmation at launch
- **MAP-12**: Draw-a-polygon region filter — named regions cover the real use case; draw interaction is significant complexity

## Out of Scope

| Feature | Reason |
|---------|--------|
| Filter controls (taxon/date) active in sample mode | Sample data has no taxon column; filters are hidden when sample layer is active |
| Tribe-level filtering | Tribe not present in Ecdysis DarwinCore export |
| Server-side API or backend | Static hosting constraint — all data client-side |
| Filter result count per region in sidebar | Requires cross-cutting count logic; defer until basic filter ships |
| Auto-zoom to region on filter | Explicitly out of scope per PROJECT.md — map position unchanged |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| MAP-03 | Phase 13 (partial — source), Phase 14 (complete) | Complete |
| MAP-04 | Phase 14 | Complete |
| MAP-05 | Phase 15 | Complete |
| LINK-05 | Phase 15 | Complete |
| PIPE-05 | Phase 16 | Complete |
| PIPE-06 | Phase 16 | Complete |
| PIPE-07 | Phase 16 | Complete |
| MAP-09 | Phase 18 | Complete |
| MAP-10 | Phase 18 | Complete |
| FILTER-05 | Phase 18 | Complete |
| FILTER-03 | Phase 19 | Complete |
| FILTER-04 | Phase 19 | Complete |
| FILTER-06 | Phase 19 | Complete |

**Coverage:**
- v1.5 requirements: 9 total
- Mapped to phases: 9
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-12 (v1.4), extended 2026-03-14 (v1.5)*
*Last updated: 2026-03-14 after v1.5 roadmap creation (Phases 16–19)*
