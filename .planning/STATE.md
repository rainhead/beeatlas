---
gsd_state_version: 1.0
milestone: v1.5
milestone_name: Geographic Regions
status: executing
stopped_at: Completed 16-07-PLAN.md
last_updated: "2026-03-14T19:05:00.000Z"
last_activity: 2026-03-14 — 16-07 S3 cache refreshed; schema validation passes
progress:
  total_phases: 7
  completed_phases: 3
  total_plans: 12
  completed_plans: 12
  percent: 75
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-14)

**Core value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.
**Current focus:** v1.5 Geographic Regions — Phase 16 ready to plan

## Current Position

Phase: 16 of 19 (Pipeline Spatial Join)
Plan: 7 of 7 complete (16-07 S3 cache refresh)
Status: Complete
Last activity: 2026-03-14 — 16-07 S3 cache refreshed; schema validation passes

Progress: [███████░░░] 75%

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

### Pending Todos

| # | Title | Area | File |
|---|-------|------|------|
| 1 | Specify explicit fields on iNat API calls | general | [2026-03-12-specify-explicit-fields-on-inat-api-calls.md](./todos/pending/2026-03-12-specify-explicit-fields-on-inat-api-calls.md) |

### Blockers/Concerns

- **GeoJSON property name gap**: ecoregion GeoJSON property name needs confirmation against generated file — research notes `NA_L3NAME` as likely but `US_L3NAME` appears in ARCHITECTURE.md as placeholder; confirm before writing click handler in Phase 18

## Session Continuity

Last session: 2026-03-14T19:05:00.000Z
Stopped at: Completed 16-07-PLAN.md
Resume file: None
