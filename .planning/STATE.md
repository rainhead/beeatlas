---
gsd_state_version: 1.0
milestone: v2.8
milestone_name: "Liveness: Provisional Specimen Records"
status: completed
last_updated: "2026-04-21T23:18:01.649Z"
last_activity: 2026-04-21 — Phase 70 complete; v2.9 milestone shipped
progress:
  total_phases: 5
  completed_phases: 5
  total_plans: 13
  completed_plans: 13
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-17 — v2.7 milestone complete)

**Core value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.
**Current focus:** v2.9 complete — next milestone: v3.0 Plants Tab (Phases 71–72)

## Current Position

Phase: 70 — Map Overlay Sidebar
Status: Complete
Last activity: 2026-04-21 — Phase 70 complete; v2.9 milestone shipped

```
Progress: [████████████████████] 100% (3/3 phases)
```

## Accumulated Context

### Decisions

- Added specimen_inat_quality_grade as second alias (sob.quality_grade) in both ARM 1 and ARM 2 of combined CTE so final SELECT can reference j.specimen_inat_quality_grade uniformly
- Renamed CollectorEntry.observer to host_inat_login to match parquet column name; collector SQL filter updated to host_inat_login IN
- bee-filter-panel placed inside .content alongside bee-map (not inside bee-map shadow DOM) to preserve pure presenter invariant; right: calc(0.5em + 6rem) clears Regions button
- bee-sidebar :host position: absolute follows identical pattern to bee-filter-panel; portrait media query resets to position: static so sidebar re-enters flex flow on portrait screens

### Pending Todos

None.

### Blockers/Concerns

CR-01 (pre-existing from Phase 67): bee-filter-controls.ts uses `observer` field in CollectorToken but filter.ts CollectorEntry defines `host_inat_login` — collector filtering by iNat username silently non-functional until resolved.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260421-t1a | Table mode improvements (filter button, selection highlight, links column, collector coalesce, field# fallback) | 2026-04-21 | c9c1b8c | [260421-t1a-table-mode-improvements](./quick/260421-t1a-table-mode-improvements/) |
