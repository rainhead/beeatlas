---
gsd_state_version: 1.0
milestone: v4.2
milestone_name: iNaturalist Expert Observations
status: planning
stopped_at: Milestone v4.2 started — defining requirements
last_updated: 2026-05-25T23:30:00.000Z
last_activity: 2026-05-25 -- Milestone v4.2 started
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-25 for v4.2 milestone)

**Core value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.
**Current focus:** Milestone v4.2 — iNaturalist Expert Observations

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-05-25 — Milestone v4.2 started

## Performance Metrics

**Velocity:**

- Total plans completed: 0 (this milestone)
- Average duration: —
- Total execution time: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

- iNat expert observations sourced from periodic CSV export (not API); query uses `ident_user_id` list as quality gate
- 45,354 observations in first export (2011–2026); 821 overlap with existing Ecdysis specimen_observation_ids → exclude from new source arm
- quality_grade=any in export query (research, needs_id, casual) — expert identification is the quality gate, not community consensus
- Species/genus pages to show "N specimens · N community observations" broken down by source
- Photo carousel is out of scope for v4.2; image_url persisted in pipeline output for future use

### Pending Todos

None.

### Blockers/Concerns

None.

## Deferred Items

None.

## Session Continuity

Last session: 2026-05-25
Stopped at: Milestone v4.2 initialized — requirements definition in progress
Resume file: None
