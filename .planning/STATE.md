---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: complete
stopped_at: Phase 46 complete
last_updated: "2026-04-12T02:30:00.000Z"
last_activity: 2026-04-12 -- Phase 46 complete
progress:
  total_phases: 2
  completed_phases: 2
  total_plans: 3
  completed_plans: 3
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-09 — v2.1 milestone started)

**Core value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.
**Current focus:** Phase 46 — basemap-tile-provider-upgrade

## Current Position

Phase: 46 (basemap-tile-provider-upgrade) — COMPLETE
Plan: 1 of 1
Status: Phase 46 complete
Last activity: 2026-04-12 - Completed quick task 260411-pru: Display "No determination" for unidentified specimens in sidebar

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

- [v1.9]: `bee-atlas` coordinator owns all state; `bee-map` and `bee-sidebar` are pure presenters
- [v1.9]: `bee-atlas` does not import OpenLayers — keep OL contained in `bee-map`
- [v1.8]: `buildFilterSQL()` returns plain SQL strings (not parameterized) — DuckDB WASM does not support parameterized queries
- [v2.1]: Determinations already exist in beeatlas.duckdb — no new pipeline fetch needed; feeds.py queries the existing data
- [v2.1]: Static hosting constraint means each filter variant (collector, genus, county, ecoregion) is a separate XML file on disk
- [v2.1]: Feed files go to `frontend/public/data/feeds/` matching the parquet export path pattern; nightly.sh uploads them to S3

### Pending Todos

None.

### Roadmap Evolution

- Phase 45 added: Sidebar Feed Discovery (v2.2 milestone)
- Phase 46 added: Basemap Tile Provider Upgrade

### Blockers/Concerns

None.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260408-roy | Move region overlay control from sidebar to map overlay button | 2026-04-09 | e6d1281 | [260408-roy-move-region-overlay-control-from-sidebar](./quick/260408-roy-move-region-overlay-control-from-sidebar/) |
| 260408-tkd | Add occurrence/observation ID columns to table for ecdysis and iNat links | 2026-04-09 | 003284c | [260408-tkd-add-occurrence-observation-id-columns-to](./quick/260408-tkd-add-occurrence-observation-id-columns-to/) |
| 260408-tvl | Show recent filters when filter input is focused and empty | 2026-04-09 | a8fa85f | [260408-tvl-show-recent-filters-when-filter-input-is](./quick/260408-tvl-show-recent-filters-when-filter-input-is/) |
| 260411-pru | Display "No determination" for unidentified specimens in sidebar | 2026-04-12 | 01928e3 | [260411-pru-unidentified-specimens-like-5611752-are-](./quick/260411-pru-unidentified-specimens-like-5611752-are-/) |

## Session Continuity

Last session: 2026-04-09 - Roadmap created for v2.1 Determination Feeds
Stopped at: Phase 42 not started
Resume file: None
