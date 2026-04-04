---
gsd_state_version: 1.0
milestone: v1.9
milestone_name: Frontend Architecture Refactor
status: roadmap defined
stopped_at: Phase 33 (not started)
last_updated: "2026-04-03T00:00:00.000Z"
last_activity: 2026-04-03
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.
**Current focus:** Milestone v1.9 — Phase 33: Test Infrastructure

## Current Position

Phase: 33 — Test Infrastructure (not started)
Plan: —
Status: Roadmap defined, ready to plan Phase 33
Last activity: 2026-04-03 — v1.9 roadmap created (Phases 33–38)

Progress: [░░░░░░░░░░] 0% (0/6 phases)

## Phase Plan

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 33 | Test Infrastructure | TEST-01 | Not started |
| 34 | Global State Elimination | STATE-01, STATE-02, STATE-03 | Not started |
| 35 | URL State Module | URL-01, URL-02 | Not started |
| 36 | bee-atlas Root Component | ARCH-01, ARCH-02, ARCH-03 | Not started |
| 37 | Sidebar Decomposition | DECOMP-01, DECOMP-02, DECOMP-03, DECOMP-04 | Not started |
| 38 | Unit Tests | TEST-02, TEST-03, TEST-04 | Not started |

## Accumulated Context

### From v1.8 (carried forward)

- EH bundle (not threads) avoids SharedArrayBuffer/COOP-COEP requirement; no CloudFront header changes needed
- GeoJSON loaded via fetch+registerFileBuffer+read_json (spatial extension cannot read registered URL files in WASM)
- `buildFilterSQL()` returns plain SQL string (not parameterized) — DuckDB WASM `query()` does not support ? placeholders
- `tablesReady` Promise gates OL feature creation; DuckDB init errors are fatal from Phase 31 onward

### v1.9 Architecture Notes

- Phase 34 (global state elimination) is a prerequisite for Phase 35+ — modules with side effects on import cannot be tested in isolation
- Phase 36 (bee-atlas root component) is the largest structural refactor; bee-map becomes a pure presenter after this phase
- Sidebar decomposition (Phase 37) depends on Phase 36 because bee-atlas owns the state that sub-components receive as props
- Tests (Phase 38) are written last so they exercise the stable post-refactor API, not the intermediate states

## Pending Todos

| # | Title | Area | File |
|---|-------|------|------|
| 999.1 | Error overlay and loading overlay overlap when fetch fails — "Failed load" and "Loading..." render simultaneously; likely z-index issue in existing CSS | frontend/ui | - |

## Blockers/Concerns

None.
