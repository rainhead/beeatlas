---
gsd_state_version: 1.0
milestone: v1.5
milestone_name: Geographic Regions
status: Ready to plan
stopped_at: ~
last_updated: "2026-03-14T00:00:00.000Z"
last_activity: 2026-03-14 — Roadmap created for v1.5 Geographic Regions (Phases 16–19)
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-14)

**Core value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.
**Current focus:** v1.5 Geographic Regions — Phase 16 ready to plan

## Current Position

Phase: 16 of 19 (Pipeline Spatial Join)
Plan: —
Status: Ready to plan
Last activity: 2026-03-14 — Roadmap created; Phases 16–19 defined

Progress: [░░░░░░░░░░] 0%

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

### Pending Todos

| # | Title | Area | File |
|---|-------|------|------|
| 1 | Specify explicit fields on iNat API calls | general | [2026-03-12-specify-explicit-fields-on-inat-api-calls.md](./todos/pending/2026-03-12-specify-explicit-fields-on-inat-api-calls.md) |

### Blockers/Concerns

- **GeoJSON property name gap**: ecoregion GeoJSON property name needs confirmation against generated file — research notes `NA_L3NAME` as likely but `US_L3NAME` appears in ARCHITECTURE.md as placeholder; confirm before writing click handler in Phase 18

## Session Continuity

Last session: 2026-03-14
Stopped at: Roadmap created (ROADMAP.md, STATE.md, REQUIREMENTS.md traceability updated); ready for /gsd:plan-phase 16
Resume file: None
