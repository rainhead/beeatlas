---
gsd_state_version: 1.0
milestone: v2.4
milestone_name: Header Navigation & Toolbar
status: roadmap
stopped_at: ~
last_updated: "2026-04-13T00:00:00.000Z"
last_activity: 2026-04-13
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-13 — v2.4 milestone started)

**Core value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.
**Current focus:** Phase 52 — Header Component

## Current Position

Phase: 52 — Header Component
Plan: —
Status: Not started
Last activity: 2026-04-13 — Roadmap created for v2.4

```
Progress: [░░░░░░░░░░░░░░░░░░░░] 0% (0/3 phases)
```

## Accumulated Context

### Decisions

- Phase ordering: header first (standalone), then filter toolbar (uses header layout), then sidebar cleanup (depends on filter leaving sidebar)
- Sidebar feed subscription links removed with no replacement surface (deferred per REQUIREMENTS.md)
- URL params `lm=` and `view=` must continue to round-trip through new header controls

### Pending Todos

None.

### Blockers/Concerns

None.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
