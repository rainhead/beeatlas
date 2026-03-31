---
gsd_state_version: 1.0
milestone: v1.8
milestone_name: DuckDB WASM Frontend
status: executing
stopped_at: Completed 32-02-PLAN.md
last_updated: "2026-03-31T23:42:41.201Z"
last_activity: 2026-03-31 -- Phase 32 execution started
progress:
  total_phases: 3
  completed_phases: 2
  total_plans: 5
  completed_plans: 4
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.
**Current focus:** Phase 32 — sql-filter-layer

## Current Position

Phase: 32 (sql-filter-layer) — EXECUTING
Plan: 1 of 3
Status: Executing Phase 32
Last activity: 2026-03-31 -- Phase 32 execution started
Stopped at: Completed 32-02-PLAN.md

Progress: [██████████] 100% (2/3 phases; 2/2 plans complete)

## Architecture Notes

### What is changing in v1.8

- **hyparquet** → **@duckdb/duckdb-wasm**: Parquet files loaded via DuckDB PARQUET scan into in-memory tables
- **ParquetSource / SampleParquetSource** → DuckDB query → OL feature creation (same Feature schema, same OL VectorSource/ClusterSource)
- **FilterState + matchesFilter()** → SQL predicate builder + DuckDB query → Set<featureId> used in style callbacks
- **GeoJSON boundaries** loaded into DuckDB spatial tables in addition to OL VectorSource (OL source retained for rendering)

### What is NOT changing

- OL map rendering, clustering, click handlers
- URL state encoding/decoding (same params)
- Loading/error overlay behavior
- Backend pipeline, data files, CI/CD

### Key decisions made

- Raw @duckdb/duckdb-wasm preferred over Mosaic (momentum/sustainability concerns)
- Migration only — no tabular views this milestone
- Filter update strategy: DuckDB query → Set<featureId> → OL style callback (not OL source repopulation)
- Boundaries go into DuckDB spatial tables (for future spatial SQL), OL VectorSource retained for rendering
- Ephemeral DuckDB only (no OPFS)

## Phase Plan

| Phase | Name | Requirements | Status |
|-------|------|-------------|--------|
| 30 | DuckDB WASM Setup | DUCK-01–04 | Complete |
| 31 | Feature Creation from DuckDB | FEAT-01–03 | Complete (Plan 01) |
| 32 | SQL Filter Layer | FILT-01–07 | Pending |

## Accumulated Context

### Decisions

- **[Phase 30-duckdb-wasm-setup]**: EH bundle (not threads) avoids SharedArrayBuffer/COOP-COEP requirement — no CloudFront header changes needed for DUCK-04
- **[Phase 30-duckdb-wasm-setup]**: DuckDB init fires non-fatal in parallel with existing hyparquet loading; _dataError/_dataLoading lifecycle still driven by specimenSource.once('change') until Phase 31
- **[Phase 30-duckdb-wasm-setup]**: GeoJSON loaded via browser fetch() + registerFileBuffer + read_json; spatial extension approach abandoned (DuckDB WASM spatial cannot read registered URL files)
- **[Phase 30-duckdb-wasm-setup]**: counties and ecoregions load as 1-row FeatureCollection tables — expected shape for Phase 30; geometry unnesting deferred to Phase 31/32
- [Phase 31-feature-creation-from-duckdb]: loader function is async — VectorSource accepts async loaders; tablesReady deferred promise guards against race condition
- [Phase 31-feature-creation-from-duckdb]: DuckDB init errors are fatal in Phase 31+ (set _dataError); hyparquet removed as fallback data path
- [Phase 32]: bee-map.ts _runFilterQuery() helper centralizes DuckDB query + setVisibleIds + source.changed() for all filter mutation paths
- [Phase 32]: visibleSampleIds removed from bee-map.ts import — style.ts reads it directly; bee-map.ts only needs visibleEcdysisIds for summary/click filtering

## Pending Todos

| # | Title | Area | File |
|---|-------|------|------|
| 999.1 | Error overlay and loading overlay overlap when fetch fails — "Failed load" and "Loading..." render simultaneously; likely z-index issue in existing CSS | frontend/ui | - |

## Blockers/Concerns

None.
