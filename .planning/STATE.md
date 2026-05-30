---
gsd_state_version: 1.0
milestone: v4.5
milestone_name: "Liveness: Provisional Specimen Records"
status: verifying
stopped_at: ROADMAP.md populated with Phases 124–127; ready to plan Phase 124
last_updated: "2026-05-30T16:11:41.832Z"
last_activity: 2026-05-30
progress:
  total_phases: 14
  completed_phases: 7
  total_plans: 17
  completed_plans: 17
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-29 — milestone v4.5 started)

**Core value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.
**Current focus:** Phase 125 — species-visibility

## Current Position

Phase: 125 (species-visibility) — EXECUTING
Plan: 1 of 1
Status: Phase complete — ready for verification
Last activity: 2026-05-30

## Accumulated Context

### Decisions

All v4.3 decisions logged in PROJECT.md Key Decisions table.

Phase 123 decisions:

- Moved occurrence_synonyms.csv to data/dbt/seeds/ (deleted data/occurrence_synonyms.csv); updated OCCURRENCE_SYNONYMS_PATH in canonical_name.py — one canonical file, no duplication
- apply_synonym() kept in canonical_name.py (unit tests pass); only ingest-time callsites in checklist_pipeline and inat_obs_pipeline removed
- Both pipeline ingest functions now write raw normalize_scientific_name() output; synonym application delegated to dbt int_combined LEFT JOIN
- Per-arm LEFT JOIN (not leading CTE) in int_combined to avoid CTE scoping risk with UNION ALL
- agapostemon texanus retained as checklist-only species row (occurrence_count=0, inat_obs_count=0) per research Pitfall 5 — test corrected accordingly

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

Last session: 2026-05-30T16:11:41.824Z
Stopped at: ROADMAP.md populated with Phases 124–127; ready to plan Phase 124
Resume file: None
