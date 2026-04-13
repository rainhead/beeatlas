---
gsd_state_version: 1.0
milestone: v2.3
milestone_name: Specimen iNat Observation Links
status: in_progress
stopped_at: Phase 49 complete
last_updated: "2026-04-13T16:30:00.000Z"
last_activity: 2026-04-13
progress:
  total_phases: 4
  completed_phases: 2
  total_plans: 2
  completed_plans: 2
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-12 — v2.3 milestone started)

**Core value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.
**Current focus:** Phase 49 complete — next: Phase 50 (Export Join & Schema Gate)

## Current Position

Phase: 49 of 51 (waba pipeline) — COMPLETE
Plan: 1/1 complete
Status: Phase complete, verified
Last activity: 2026-04-13

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**

- Total plans completed: 1 (this milestone)
- Average duration: —
- Total execution time: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v2.2]: DuckDB `ST_Read('/vsizip/...')` + `ST_Transform` with always_xy=true replaces geopandas for all shapefile reads
- [v2.1]: Static hosting constraint means each feed variant is a separate XML file; nightly.sh uploads them to S3
- [v1.9]: `bee-atlas` coordinator owns all state; `bee-map` and `bee-sidebar` are pure presenters
- [v1.9]: `bee-atlas` does not import OpenLayers — keep OL contained in `bee-map`
- [v1.8]: `buildFilterSQL()` returns plain SQL strings — DuckDB WASM does not support parameterized queries

### Key Constraints for v2.3

- Column rename (Phase 48) must be atomic and complete before any new iNat column is added — prevents ambiguous two-iNat-column state
- WABA pipeline must use `pipeline_name="waba"` and `dataset_name="inaturalist_waba_data"` — separate from existing `inaturalist` pipeline to avoid cursor collision
- iNat v2 API filter parameter form for WABA field: `field:WABA=` confirmed working; `field_id=18116` is MEDIUM confidence — verify with live curl before writing pipeline
- Catalog number join uses `split_part(catalog_number, '_', 2) = ofv.value` (VARCHAR, no integer cast)
- `DISTINCT ON (ofv.value)` dedup required in waba_link CTE — multiple photographers per specimen exist

### Pending Todos

None.

### Blockers/Concerns

None.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260408-roy | Move region overlay control from sidebar to map overlay button | 2026-04-09 | e6d1281 | [260408-roy-move-region-overlay-control-from-sidebar](./quick/260408-roy-move-region-overlay-control-from-sidebar/) |
| 260408-tkd | Add occurrence/observation ID columns to table for ecdysis and iNat links | 2026-04-09 | 003284c | [260408-tkd-add-occurrence-observation-id-columns-to](./quick/260408-tkd-add-occurrence-observation-id-columns-to/) |
| 260408-tvl | Show recent filters when filter input is focused and empty | 2026-04-09 | a8fa85f | [260408-tvl-show-recent-filters-when-filter-input-is](./quick/260408-tvl-show-recent-filters-when-filter-input-is/) |
| 260411-pru | Display "No determination" for unidentified specimens in sidebar | 2026-04-12 | 01928e3 | [260411-pru-unidentified-specimens-like-5611752-are-](./quick/260411-pru-unidentified-specimens-like-5611752-are-/) |
| 260412-dl6 | Add 'modified' column to specimen table view | 2026-04-12 | d99bd54 | [260412-dl6-in-the-frontend-in-the-specimen-table-vi](./quick/260412-dl6-in-the-frontend-in-the-specimen-table-vi/) |
| 260412-kpe | Schema validation is failing on build despite having rerun nightly.sh | 2026-04-12 | 10915b3 | [260412-kpe-schema-validation-is-failing-on-build-de](./quick/260412-kpe-schema-validation-is-failing-on-build-de/) |

## Session Continuity

Last session: 2026-04-13T05:54:00.813Z
Stopped at: Phase 48 context gathered
Resume file: .planning/phases/48-column-rename/48-CONTEXT.md
