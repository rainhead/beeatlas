---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: Determination Feeds
status: in_progress
stopped_at: Defining requirements
last_updated: "2026-04-09T00:00:00.000Z"
last_activity: 2026-04-09
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-09 — v2.1 milestone started)

**Core value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.
**Current focus:** v2.1 Determination Feeds — defining requirements

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-09 — Milestone v2.1 started

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 0 (this milestone)
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

## Session Continuity

Last session: 2026-04-09 - Started milestone v2.1 Determination Feeds
Stopped at: Defining requirements
Resume file: None
