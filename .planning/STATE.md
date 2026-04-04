---
gsd_state_version: 1.0
milestone: v1.9
milestone_name: Frontend Architecture Refactor
status: executing
stopped_at: Completed 34-02-PLAN.md
last_updated: "2026-04-04T15:35:17.000Z"
last_activity: 2026-04-04
progress:
  total_phases: 10
  completed_phases: 9
  total_plans: 15
  completed_plans: 14
  percent: 20
---

# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.
**Current focus:** Phase 34 — global-state-elimination

## Current Position

Phase: 34
Plan: 02 Complete
Status: Executing Phase 34
Last activity: 2026-04-04
Stopped at: Completed 34-02-PLAN.md

Progress: [███░░░░░░░] 20% (1/6 phases; 3/13 plans complete)

## Phase Plan

| Phase | Name | Requirements | Status |
|-------|------|-------------|--------|
| 33 | Test Infrastructure | TEST-01 | Complete |
| 34 | Global State Elimination | STATE-01, STATE-02, STATE-03 | Complete (2/2 plans) |
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

### Decisions

- **[Phase 33]**: Extend vite.config.ts with test block (not separate vitest.config.ts) — minimal config warrants in-place extension
- **[Phase 33]**: Explicit `import { test, expect } from 'vitest'` in test files to avoid type conflicts with `"types": ["vite/client"]`
- **[Phase 33]**: Smoke test imports no app modules — DuckDB WASM has module-level side effects; Phase 34 removes them
- **[Phase 34-01]**: Style factory closures (makeClusterStyleFn, makeSampleDotStyleFn) set on layers in firstUpdated via this.visibleEcdysisIds/visibleSampleIds getters — factories called at module level not possible because BeeMap instance doesn't exist yet; plan 02 moves layers into class
- **[Phase 34-01]**: filter.ts now exports zero mutable state — FilterState interface + isFilterActive + buildFilterSQL + queryVisibleIds only; all mutable state (filterState, visibleEcdysisIds, visibleSampleIds) now private BeeMap class properties
- **[Phase 34-02]**: All OL sources and layers (specimenSource, clusterSource, specimenLayer, sampleSource, sampleLayer, countySource, ecoregionSource, regionLayer) are BeeMap instance properties; dataErrorHandler indirection removed — onError arrow functions capture this directly; eager loadFeatures() moved to firstUpdated

## Pending Todos

| # | Title | Area | File |
|---|-------|------|------|
| 999.1 | Error overlay and loading overlay overlap when fetch fails — "Failed load" and "Loading..." render simultaneously; likely z-index issue in existing CSS | frontend/ui | - |

## Blockers/Concerns

None.
