---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Tabular Data View
status: ready_to_plan
stopped_at: ~
last_updated: "2026-04-07T00:00:00.000Z"
last_activity: 2026-04-07 -- Roadmap created for v2.0 (Phases 39-41)
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-07 — v2.0 milestone started)

**Core value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.
**Current focus:** Phase 39 — View Mode Toggle

## Current Position

Phase: 39 of 41 (View Mode Toggle)
Plan: — (not yet planned)
Status: Ready to plan
Last activity: 2026-04-07 — Roadmap created; 3 phases covering 12 requirements

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

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v1.9]: `bee-atlas` coordinator owns all state; `bee-map` and `bee-sidebar` are pure presenters — `bee-table` must follow the same pattern
- [v1.9]: `bee-atlas` does not import OpenLayers — keep OL contained in `bee-map`
- [v1.8]: `buildFilterSQL()` returns plain SQL strings (not parameterized) — DuckDB WASM does not support parameterized queries

### Pending Todos

| # | Title | Area | File |
|---|-------|------|------|
| 999.1 | Error overlay and loading overlay overlap when fetch fails — "Failed load" and "Loading..." render simultaneously; likely z-index issue in existing CSS | frontend/ui | - |

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-04-07
Stopped at: Roadmap written; ready to plan Phase 39
Resume file: None
