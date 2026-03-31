---
gsd_state_version: 1.0
milestone: v1.8
milestone_name: DuckDB WASM Frontend
status: verifying
last_updated: "2026-03-31T17:11:03Z"
last_activity: 2026-03-31
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 1
  completed_plans: 1
  percent: 33
---

# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.
**Current focus:** v1.8 — migrate frontend data layer from hyparquet + FilterState to DuckDB WASM + SQL filters

## Current Position

Phase: 30
Plan: 01 (Tasks 1-2 complete; awaiting Task 3 human-verify checkpoint)
Status: Paused at checkpoint:human-verify
Last activity: 2026-03-31

Progress: [███░░░░░░░] 33% (0/3 phases; 1/1 plans in progress)

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
| 30 | DuckDB WASM Setup | DUCK-01–04 | Pending |
| 31 | Feature Creation from DuckDB | FEAT-01–03 | Pending |
| 32 | SQL Filter Layer | FILT-01–07 | Pending |

## Accumulated Context

### Decisions

- **[Phase 30-duckdb-wasm-setup]**: EH bundle (not threads) avoids SharedArrayBuffer/COOP-COEP requirement — no CloudFront header changes needed for DUCK-04
- **[Phase 30-duckdb-wasm-setup]**: INSTALL spatial + LOAD spatial called as separate conn.query() invocations (Pitfall 5 — multi-statement strings unreliable in DuckDB WASM)
- **[Phase 30-duckdb-wasm-setup]**: Spatial extension failure caught with try/catch; fallback to read_json_auto preserves GeoJSON properties (loses geometry column; acceptable for Phase 30)
- **[Phase 30-duckdb-wasm-setup]**: DuckDB init fires non-fatal in parallel with existing hyparquet loading; _dataError/_dataLoading lifecycle still driven by specimenSource.once('change') until Phase 31

## Pending Todos

| # | Title | Area | File |
|---|-------|------|------|
| - | (none) | - | - |

## Blockers/Concerns

None.
