---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Specimen-Sample Linkage
status: ready_to_plan
stopped_at: Roadmap created — Phase 11 ready to plan
last_updated: "2026-03-11"
last_activity: "2026-03-11 - v1.3 roadmap created (Phases 11–12)"
progress:
  total_phases: 2
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-11)

**Core value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.
**Current focus:** Phase 11 — Links Pipeline (v1.3 Specimen-Sample Linkage)

## Current Position

Phase: 11 of 12 (Links Pipeline)
Plan: —
Status: Ready to plan
Last activity: 2026-03-11 — v1.3 roadmap created; Phase 11 ready for planning

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

- **v1.3 scope**: Pipeline only — links.parquet (occurrenceID → inat_observation_id); frontend display deferred to v1.4+
- **v1.3 cache model**: Permanent per-record cache — once an occurrenceID→iNat link is fetched, it is never re-fetched
- **HTML scraping only method**: Symbiota (Ecdysis) has no associations API; confirmed `#association-div a[target="_blank"]` as selector
- **Two-level skip**: First skip on links.parquet presence (already linked); second skip on local HTML cache (parse without fetching)

### Pending Todos

None.

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 1 | Store full observation JSON in cache with download timestamp | 2026-03-11 | 16256f3 | Verified | [1-store-full-observation-json-in-cache-wit](./quick/1-store-full-observation-json-in-cache-wit/) |

### Blockers/Concerns

None currently.

## Session Continuity

Last session: 2026-03-11
Stopped at: Roadmap created — ready to plan Phase 11 (Links Pipeline)
Resume file: None
