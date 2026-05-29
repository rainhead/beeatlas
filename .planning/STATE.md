---
gsd_state_version: 1.0
milestone: v4.4
milestone_name: Pipeline Data Quality
status: v4.3 milestone archived
stopped_at: context exhaustion at 75% (2026-05-29)
last_updated: "2026-05-29T17:32:09Z"
progress:
  total_phases: 10
  completed_phases: 4
  total_plans: 15
  completed_plans: 14
  percent: 40
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-28 after v4.3 milestone)

**Core value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.
**Current focus:** Planning next milestone (v4.4)

## Current Position

Milestone v4.3 (Loading Performance) archived 2026-05-28. Ready to start next milestone.

## Accumulated Context

### Decisions

All v4.3 decisions logged in PROJECT.md Key Decisions table.

Phase 123 Plan 01 decisions:
- Moved occurrence_synonyms.csv to data/dbt/seeds/ (deleted data/occurrence_synonyms.csv); updated OCCURRENCE_SYNONYMS_PATH in canonical_name.py — one canonical file, no duplication
- apply_synonym() kept in canonical_name.py (unit tests pass); only ingest-time callsites in checklist_pipeline and inat_obs_pipeline removed
- Both pipeline ingest functions now write raw normalize_scientific_name() output; synonym application delegated to dbt int_combined LEFT JOIN (Plan 02)

### Roadmap Evolution

- Phase 121: Prebuilt SQLite Load — COMPLETE
- Phase 122: Worker GeoJSON Aggregation — COMPLETE

### Pending Todos

None.

### Blockers/Concerns

None.

## Deferred Items

None.

## Quick Tasks Completed

| Date | Slug | Description |
|---|---|---|
| 2026-05-26 | inat-obs-show-species-in-sidebar | iNat expert obs: show species name + quality badge in sidebar |
| 2026-05-27 | 260527-ko5 | Move sqlite and data loading into a worker thread; profile before/after |
| 2026-05-27 | pst | Replace string-escape INSERT with wa-sqlite prepared statements |
| 2026-05-28 | syn-occurrence-synonymy-mechanism | Occurrence-side synonymy mechanism; map Agapostemon texanus → subtilior (Portman et al. 2024) |

## Session Continuity

Last session: 2026-05-29T17:32:09Z
Stopped at: Completed 123-dbt-layer-occurrence-synonymy-01-PLAN.md
Resume file: None
