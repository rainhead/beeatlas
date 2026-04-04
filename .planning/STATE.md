---
gsd_state_version: 1.0
milestone: v1.9
milestone_name: Frontend Architecture Refactor
status: defining requirements
stopped_at: —
last_updated: "2026-04-03T00:00:00.000Z"
last_activity: 2026-04-03
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.
**Current focus:** Milestone v1.9 — defining requirements

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-03 — Milestone v1.9 started

Progress: (not started)

## Phase Plan

*(to be defined — see ROADMAP.md)*

## Accumulated Context

### From v1.8 (carried forward)

- EH bundle (not threads) avoids SharedArrayBuffer/COOP-COEP requirement; no CloudFront header changes needed
- GeoJSON loaded via fetch+registerFileBuffer+read_json (spatial extension cannot read registered URL files in WASM)
- `buildFilterSQL()` returns plain SQL string (not parameterized) — DuckDB WASM `query()` does not support ? placeholders
- `tablesReady` Promise gates OL feature creation; DuckDB init errors are fatal from Phase 31 onward

## Pending Todos

| # | Title | Area | File |
|---|-------|------|------|
| 999.1 | Error overlay and loading overlay overlap when fetch fails — "Failed load" and "Loading..." render simultaneously; likely z-index issue in existing CSS | frontend/ui | - |

## Blockers/Concerns

None.
