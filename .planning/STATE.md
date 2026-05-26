---
gsd_state_version: 1.0
milestone: v4.2
milestone_name: iNaturalist Expert Observations
status: executing
stopped_at: Phase 117 context gathered
last_updated: "2026-05-26T03:32:32.384Z"
last_activity: 2026-05-26 -- Phase 118 execution started
progress:
  total_phases: 15
  completed_phases: 4
  total_plans: 19
  completed_plans: 32
  percent: 27
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-25 for v4.2 milestone)

**Core value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.
**Current focus:** Phase 118 — occurrence-model-extension

## Current Position

Phase: 118 (occurrence-model-extension) — EXECUTING
Plan: 1 of 3
Status: Executing Phase 118
Last activity: 2026-05-26 -- Phase 118 execution started

[##########----------] 25% (1/4 phases complete)

## Phase Summary

| Phase | Name | Requirements | Status |
|-------|------|-------------|--------|
| 117 | iNat Obs Pipeline | PIPE-01..04 | Complete 2026-05-26 |
| 118 | Occurrence Model Extension | OCC-01..03 | Not started |
| 119 | Map Display, Source Filter & Detail View | MAP-01..03, DET-01 | Not started |
| 120 | Species Page Source Counts & Photo List | SPE-01..03 | Not started |

## Performance Metrics

**Velocity:**

- Total plans completed: 0 (this milestone)
- Average duration: —
- Total execution time: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

- iNat expert observations sourced from periodic CSV export (not API); query uses ident_user_id list as quality gate
- 45,354 observations in first export (2011–2026); 821 overlap with existing Ecdysis specimen_observation_ids → exclude from new source arm
- quality_grade=any in export query (research, needs_id, casual) — expert identification is the quality gate, not community consensus
- Species/genus pages to show "N specimens · N community observations" broken down by source
- Photo carousel is out of scope for v4.2; image_url persisted in pipeline output for future use
- dbt contract changes from 31 columns to 32+ with the new source column and iNat-specific nullable columns; schema.yml must be updated
- Third source type designated as 'inat_obs' (alongside 'ecdysis' and 'waba_sample')
- Unified occurrence model decision (2026-05-26): iNat expert obs merge into occurrences.parquet via int_combined ARM 3, not a separate inat_obs.parquet. A separate parquet would have required duplicate frontend rendering paths; the unified model uses a source discriminator and nullable iNat-specific columns (image_url, obs_url, user_login, license) in the occurrences mart.

### Pending Todos

None.

### Blockers/Concerns

None.

## Deferred Items

None.

## Session Continuity

Last session: 2026-05-26T01:08:48.835Z
Stopped at: Phase 117 context gathered
Resume file: None
