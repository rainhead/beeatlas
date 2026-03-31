---
gsd_state_version: 1.0
milestone: v1.8
milestone_name: DuckDB WASM Frontend
status: milestone_planning_complete
stopped_at: requirements and roadmap defined; ready for phase planning
last_updated: "2026-03-31T00:00:00.000Z"
last_activity: 2026-03-31
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 3
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.
**Current focus:** v1.8 — migrate frontend data layer from hyparquet + FilterState to DuckDB WASM + SQL filters

## Current Position

Phase: 30 (not started)
Plan: Not started
Status: Ready for `/gsd:plan-phase 30`
Last activity: 2026-03-31

Progress: [░░░░░░░░░░] 0% (0/3 phases)

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

(None yet — milestone just started)

## Pending Todos

| # | Title | Area | File |
|---|-------|------|------|
| - | (none) | - | - |

## Blockers/Concerns

- DuckDB WASM bundle configuration (SharedArrayBuffer / COOP-COEP) needs research in Phase 30
- CloudFront may need header updates if SharedArrayBuffer bundle is required
