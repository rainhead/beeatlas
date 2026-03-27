---
gsd_state_version: 1.0
milestone: v1.6
milestone_name: dlt Pipeline Migration
status: Defining requirements
stopped_at: ""
last_updated: "2026-03-27T00:00:00.000Z"
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-27)

**Core value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.
**Current focus:** Planning next milestone

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-03-27 — Milestone v1.6 started

## Performance Metrics

**Velocity:**

- Total plans completed: 0 (this milestone)
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

*Updated after each plan completion*
| Phase 16-pipeline-spatial-join P04 | 5 | 1 tasks | 1 files |
| Phase 16-pipeline-spatial-join P01 | 1 | 1 tasks | 1 files |
| Phase 16-pipeline-spatial-join P02 | 2 | 1 tasks | 1 files |
| Phase 16 P03 | 148 | 2 tasks | 3 files |
| Phase 16-pipeline-spatial-join P05 | 525712min | 2 tasks | 2 files |
| Phase 16-pipeline-spatial-join P06 | 1min | 2 tasks | 2 files |
| Phase 16-pipeline-spatial-join P07 | ~30min | 2 tasks | 1 files |
| Phase 17-frontend-data-layer P01 | 2min | 2 tasks | 2 files |
| Phase 17-frontend-data-layer P02 | 1min | 2 tasks | 2 files |
| Phase 18-map-integration P01 | 3 | 2 tasks | 2 files |
| Phase 18-map-integration P02 | 8min | 1 tasks | 4 files |
| Phase 18-map-integration P03 | 4min | 3 tasks | 2 files |
| Phase 18-map-integration P04 | 7min | 2 tasks | 2 files |
| Phase 19-sidebar-ui P01 | 5min | 2 tasks | 2 files |
| Phase 19-sidebar-ui P02 | 1min | 1 tasks | 0 files |

## Accumulated Context

### Decisions

- **v1.4 BigInt coercion**: hyparquet returns INT64 Parquet columns as JavaScript BigInt; must coerce with Number() at read time
- **v1.4 exclusive toggle**: Layer toggle uses layer.setVisible(bool) — sample data has no taxon column so parity is impossible; click disambiguation requires exclusive display
- **v1.4 filter controls**: Specimen taxon/date filters hidden when sample layer is active — sample features have no taxon properties
- [Phase 15]: links.parquet requires force-add to git tracking (*.parquet gitignored but needed for frontend)
- **v1.5 CRS risk**: EPA L3 ecoregion shapefile uses non-EPSG spherical Lambert AEA CRS — must call .to_crs('EPSG:4326') before sjoin or results are silently wrong
- **v1.5 coastal nulls**: ~408 WA specimens (~0.9%) fall outside ecoregion polygon boundaries; nearest-polygon fallback required after 'within' sjoin for null rows
- **v1.5 click priority**: Polygon singleclick handler must check specimen/sample hits FIRST; checking polygon first swallows specimen clicks when boundary overlay is visible
- **v1.5 polygon fill**: OL only hit-detects rendered pixels; transparent Fill (rgba 0,0,0,0) required for polygon interior to be clickable
- [Phase 16-pipeline-spatial-join]: validate-schema.mjs EXPECTED dict is the authoritative CI schema contract for parquet column requirements
- [Phase 16-pipeline-spatial-join]: Test scaffold contracts: build_county_geojson/build_ecoregion_geojson accept out_path param; load_boundaries must exist in inat.download; separate load_*_gdf functions for test isolation
- [Phase 16-pipeline-spatial-join]: Three coordinate conventions handled in add_region_columns: longitude/latitude, lon/lat, decimalLongitude/decimalLatitude
- [Phase 16-pipeline-spatial-join]: sjoin_nearest fallback uses EPSG:32610 to avoid geographic CRS warning; deduplication applied after every sjoin
- [Phase 16]: build_geojson.py uses underscore (not dash) to match Python module import requirements from 16-01 test scaffold
- [Phase 16-pipeline-spatial-join]: Pipeline boundary loading: boundaries loaded once at entrypoint (main/__main__), passed as arguments through to pipeline functions — avoids double-loading
- [Phase 16-pipeline-spatial-join]: iNat load_boundaries() defined as named function for test mocking; add_region_columns applied to merged (not delta alone) to handle incremental run correctness
- [Phase 16-pipeline-spatial-join]: GeoJSON boundary files committed to git rather than generated at CI time — simplest resolution with no workflow changes
- [Phase 16-pipeline-spatial-join]: fetch-data workflow step order: cache-restore must precede ecdysis pipeline to enable incremental iNat fetch; boundary download must precede pipeline steps
- [Phase 17-frontend-data-layer]: county and ecoregion_l3 are string columns — no BigInt coercion needed (unlike year/month INT64)
- [Phase 17-frontend-data-layer]: Region filter semantics: AND-across-types (county AND ecoregion if both active), OR-within-type (membership in Set)
- [Phase 17-frontend-data-layer]: geojson.d.ts module declaration typed as FeatureCollection — eliminates as unknown as casts, cleaner than plan's workaround
- [Phase 18-map-integration]: _setBoundaryMode deferred to boundary toggle UI plan — noUnusedLocals:true prevents unused private methods; will be added when call site exists
- [Phase 18-map-integration]: vite.config.ts geojson plugin: .geojson imports handled via readFileSync + export default; map:null suppresses sourcemap warnings
- [Phase 18-map-integration]: bm= URL param omitted when off (absence = off) — clean URLs; counties= and ecor= also omitted when empty
- [Phase 18-map-integration]: sampleDotStyle ghost check bypasses cache: filter-dependent styles must skip tier cache
- [Phase 18-map-integration]: map-container flex wrapper with position:relative enables absolute toggle without breaking existing layout
- [Phase 18-map-integration]: Parquet assets remain gitignored; spatial join columns added by regenerating via pipeline, not force-adding to git
- [Phase 18-map-integration]: Single-select replaces entire selection (including cross-type clear) on plain click; toggle-off when re-clicking sole selection
- [Phase 18-map-integration]: makeRegionStyleFn takes getBoundaryMode getter so closure always reads current mode; regionLayer.changed() required after filterState mutation
- [Phase 19-sidebar-ui]: Boundary toggle reuses .layer-toggle/.toggle-btn/.toggle-btn.active CSS — no new CSS classes needed
- [Phase 19-sidebar-ui]: Clear filters button moved to _renderRegionControls() so it is always visible covering both filter blocks
- [Phase 19-sidebar-ui]: countyOptions and ecoregionOptions derived as module-level constants with Set deduplication (ecoregions: 80 features → 11 unique names)
- [Phase 19-sidebar-ui]: Auto-approved human-verify checkpoint for FILTER-03/04/06 in auto_advance mode — all region filter requirements accepted as verified

### Pending Todos

| # | Title | Area | File |
|---|-------|------|------|
| 1 | Specify explicit fields on iNat API calls | general | [2026-03-12-specify-explicit-fields-on-inat-api-calls.md](./todos/pending/2026-03-12-specify-explicit-fields-on-inat-api-calls.md) |

### Blockers/Concerns

None — ecoregion property name confirmed as `NA_L3NAME` by Phase 17 verifier (checked live file).

## Session Continuity

Last session: 2026-03-18T22:41:30Z
Stopped at: Completed 19-sidebar-ui-02-PLAN.md
Resume file: None
