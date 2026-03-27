---
gsd_state_version: 1.0
milestone: v1.6
milestone_name: dlt Pipeline Migration
status: executing
stopped_at: v1.6 roadmap created; ready to plan Phase 20
last_updated: "2026-03-27T20:34:02.571Z"
last_activity: 2026-03-27
progress:
  total_phases: 5
  completed_phases: 1
  total_plans: 2
  completed_plans: 2
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-27)

**Core value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.
**Current focus:** Phase 20 — pipeline-migration

## Current Position

Phase: 21
Plan: Not started
Status: Executing Phase 20
Last activity: 2026-03-27

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

- **v1.5 coastal nulls**: ~408 WA specimens fall outside ecoregion polygon boundaries; nearest-polygon fallback required after 'within' sjoin for null rows
- **v1.5 CRS risk**: EPA L3 ecoregion shapefile uses non-EPSG spherical Lambert AEA CRS — must call .to_crs('EPSG:4326') before sjoin
- **v1.4 BigInt coercion**: hyparquet returns INT64 Parquet columns as JavaScript BigInt; must coerce with Number() at read time
- **v1.6 scope**: Production CI integration (INFRA-06/07/08) and DuckDB WASM frontend deferred — local-first migration goal for this milestone

### Pending Todos

| # | Title | Area | File |
|---|-------|------|------|
| 1 | Specify explicit fields on iNat API calls | general | [2026-03-12-specify-explicit-fields-on-inat-api-calls.md](./todos/pending/2026-03-12-specify-explicit-fields-on-inat-api-calls.md) |

### Blockers/Concerns

- Phase 21 depends on geographies tables being populated in DuckDB (Phase 20 must run geographies pipeline successfully first)
- dlt prototype at ~/dlt-inat-test/ is the source for Phase 20 — review it before planning

## Session Continuity

Last session: 2026-03-27
Stopped at: v1.6 roadmap created; ready to plan Phase 20
Resume file: None
