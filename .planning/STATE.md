---
gsd_state_version: 1.0
milestone: v2.9
milestone_name: UI Flow Redesign
status: in_progress
last_updated: "2026-04-20T00:00:00.000Z"
last_activity: 2026-04-20
progress:
  total_phases: 3
  completed_phases: 1
  total_plans: 3
  completed_plans: 3
  percent: 33
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-17 — v2.7 milestone complete)

**Core value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.
**Current focus:** v2.9 in progress — Phase 68: Filter Panel Redesign complete

## Current Position

Phase: 68 — Filter Panel Redesign
Status: Complete
Last activity: 2026-04-20 — Phase 68 complete (bee-filter-panel floating overlay, localStorage recents removed, bee-atlas wired)

```
Progress: [███████░░░░░░░░░░░░░] 33% (1/3 phases)
```

## Accumulated Context

### Decisions

- Added specimen_inat_quality_grade as second alias (sob.quality_grade) in both ARM 1 and ARM 2 of combined CTE so final SELECT can reference j.specimen_inat_quality_grade uniformly
- Renamed CollectorEntry.observer to host_inat_login to match parquet column name; collector SQL filter updated to host_inat_login IN
- bee-filter-panel placed inside .content alongside bee-map (not inside bee-map shadow DOM) to preserve pure presenter invariant; right: calc(0.5em + 6rem) clears Regions button

### Pending Todos

None.

### Blockers/Concerns

CR-01 (pre-existing from Phase 67): bee-filter-controls.ts uses `observer` field in CollectorToken but filter.ts CollectorEntry defines `host_inat_login` — collector filtering by iNat username silently non-functional until resolved.
