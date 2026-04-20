---
gsd_state_version: 1.0
milestone: v2.8
milestone_name: Liveness — Provisional Specimen Records
status: complete
last_updated: "2026-04-20T00:00:00.000Z"
last_activity: 2026-04-20
progress:
  total_phases: 2
  completed_phases: 2
  total_plans: 7
  completed_plans: 7
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-17 — v2.7 milestone complete)

**Core value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.
**Current focus:** v2.8 complete — Phase 67: Provisional Row Display in Sidebar

## Current Position

Phase: 67 — Provisional Row Display in Sidebar
Plan: 02 complete; all plans done
Status: Complete
Last activity: 2026-04-20 — Phase 67, Plan 02 complete (rendering + tests)

```
Progress: [████████████████████] 100% (7/7 plans)
```

## Accumulated Context

### Decisions

- Added specimen_inat_quality_grade as second alias (sob.quality_grade) in both ARM 1 and ARM 2 of combined CTE so final SELECT can reference j.specimen_inat_quality_grade uniformly
- Renamed CollectorEntry.observer to host_inat_login to match parquet column name; collector SQL filter updated to host_inat_login IN

### Pending Todos

None.

### Blockers/Concerns

None.
