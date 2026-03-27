---
gsd_state_version: 1.0
milestone: v1.6
milestone_name: dlt Pipeline Migration
status: verifying
stopped_at: Completed 23-01-PLAN.md
last_updated: "2026-03-27T22:56:12.511Z"
last_activity: 2026-03-27
progress:
  total_phases: 5
  completed_phases: 4
  total_plans: 6
  completed_plans: 6
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-27)

**Core value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.
**Current focus:** Phase 23 — frontend-simplification

## Current Position

Phase: 24
Plan: Not started
Status: Phase complete — ready for verification
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
| Phase 21-parquet-and-geojson-export P01 | 3min | 1 tasks | 7 files |
| Phase 22-orchestration P01 | 5min | 2 tasks | 3 files |
| Phase 23-frontend-simplification P01 | 1min | 2 tasks | 2 files |

## Accumulated Context

### Decisions

- **v1.5 coastal nulls**: ~408 WA specimens fall outside ecoregion polygon boundaries; nearest-polygon fallback required after 'within' sjoin for null rows
- **v1.5 CRS risk**: EPA L3 ecoregion shapefile uses non-EPSG spherical Lambert AEA CRS — must call .to_crs('EPSG:4326') before sjoin
- **v1.4 BigInt coercion**: hyparquet returns INT64 Parquet columns as JavaScript BigInt; must coerce with Number() at read time
- **v1.6 scope**: Production CI integration (INFRA-06/07/08) and DuckDB WASM frontend deferred — local-first migration goal for this milestone
- [Phase 21-parquet-and-geojson-export]: export.py uses DuckDB COPY TO PARQUET with ST_Within + ST_Distance fallback; parquet files remain gitignored (build artifacts); GeoJSON files committed as geographic source boundaries
- [Phase 22-orchestration]: data/run.py replaces build-data.sh — Python orchestrator calls pipeline functions in-process, no subprocess
- [Phase 23-frontend-simplification]: Read inat_observation_id from ecdysis feature properties; deleted loadLinksMap without fallback since Phase 21 guarantees the column

### Pending Todos

| # | Title | Area | File |
|---|-------|------|------|
| 1 | Specify explicit fields on iNat API calls | general | [2026-03-12-specify-explicit-fields-on-inat-api-calls.md](./todos/pending/2026-03-12-specify-explicit-fields-on-inat-api-calls.md) |

### Blockers/Concerns

- Phase 21 depends on geographies tables being populated in DuckDB (Phase 20 must run geographies pipeline successfully first)
- dlt prototype at ~/dlt-inat-test/ is the source for Phase 20 — review it before planning

## Session Continuity

Last session: 2026-03-27T22:52:36.276Z
Stopped at: Completed 23-01-PLAN.md
Resume file: None
