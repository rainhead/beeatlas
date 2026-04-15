# Requirements: v2.5 Elevation Data

**Milestone goal:** Annotate specimens and samples with inferred elevation (meters) from the USGS 3DEP DEM, surface in sidebar detail and filter toolbar.

---

## Pipeline & Export

- [ ] **ELEV-01**: `dem_pipeline.py` downloads the USGS 3DEP 1/3 arc-second GeoTIFF for Washington bounding box using `seamless-3dep` and caches it locally; subsequent runs skip download if cache exists
- [ ] **ELEV-02**: `export.py` samples elevation at each specimen's lat/lon using `rasterio`; nodata sentinel read from `dataset.nodata` (not hardcoded) and converted to NULL; `elevation_m` (INT16, nullable) added to `ecdysis.parquet`
- [ ] **ELEV-03**: `export.py` samples elevation at each sample's lat/lon using same approach; `elevation_m` (INT16, nullable) added to `samples.parquet`
- [ ] **ELEV-04**: `validate-schema.mjs` schema gate enforces `elevation_m` column presence in both parquet files; ships in same commit as `export.py` changes

## Sidebar Display

- [ ] **ELEV-05**: `bee-specimen-detail` shows elevation as "1219 m" (integer, no decimal) when `elevation_m` is non-null; row omitted entirely when null
- [ ] **ELEV-06**: `bee-sample-detail` shows elevation in the same format and null-omit behavior

## Filter Toolbar

- [ ] **ELEV-07**: Elevation range filter (min/max number inputs) appears in `bee-filter-controls`; encoded as `elev_min=` / `elev_max=` URL params; URL round-trip preserved
- [ ] **ELEV-08**: `buildFilterSQL` in `filter.ts` applies `(elevation_m IS NULL OR elevation_m BETWEEN min AND max)` semantics — null rows excluded only when both bounds are set
- [ ] **ELEV-09**: "Clear filters" resets elevation min/max inputs in addition to existing filter fields

---

## Future Requirements

- Elevation column in `bee-table` tabular view (trivial add-on once parquet column exists)
- S3 caching of DEM file (local maderas cache is sufficient for v2.5; S3 caching adds resilience for new environments)
- Elevation color-coded map visualization

## Out of Scope

| Feature | Reason |
|---------|--------|
| Browser-side elevation lookup | Static hosting constraint — DEM too large to ship to browser |
| Feet toggle | Darwin Core standard is meters; no user need identified |
| DEM tiles for outside WA | Specimens outside WA extent are assigned NULL elevation |
| Elevation histogram / distribution chart | Map is the analytical surface; charts are scope creep |

---

## Traceability

| REQ-ID | Phase |
|--------|-------|
| ELEV-01 | Phase 55 |
| ELEV-02 | Phase 56 |
| ELEV-03 | Phase 56 |
| ELEV-04 | Phase 56 |
| ELEV-05 | Phase 57 |
| ELEV-06 | Phase 57 |
| ELEV-07 | Phase 58 |
| ELEV-08 | Phase 58 |
| ELEV-09 | Phase 58 |

_Last updated: 2026-04-15 — v2.5 traceability mapped to phases 55–58_
