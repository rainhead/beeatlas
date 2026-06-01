---
gsd_state_version: 1.0
milestone: v4.5
milestone_name: "Liveness: Provisional Specimen Records"
status: verifying
stopped_at: Phase 127 context gathered
last_updated: "2026-06-01T02:29:12.653Z"
last_activity: 2026-06-01
progress:
  total_phases: 14
  completed_phases: 9
  total_plans: 22
  completed_plans: 22
  percent: 64
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-29 — milestone v4.5 started)

**Core value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.
**Current focus:** Phase 127 — Inactive Taxon Remapping

## Current Position

Phase: 127 (Inactive Taxon Remapping) — EXECUTING
Plan: 2 of 2
Status: Phase complete — ready for verification
Last activity: 2026-06-01

## Accumulated Context

### Decisions

All v4.3 decisions logged in PROJECT.md Key Decisions table.

Phase 126 Plan 3 decisions:

- taxon-action class uses display:block + width:fit-content to keep action links on separate lines without a flex wrapper; applied to all four taxon templates for consistency
- CSS rule placed in taxon-pages.css under .taxon-page .taxon-action to stay scoped to taxon page context

Phase 126 Plan 2 decisions:

- taxa.csv.gz active column is BOOLEAN (not string); DuckDB query uses active=true; higher_rank_taxon_ids.json gitignored consistent with species.json treatment
- Rank filter in _build_higher_rank_taxon_ids resolves Bombus genus/subgenus name collision (T-126-05); each rank dict holds only its rank's taxon_id
- test_dbt_diff.py occurrences diff tests have pre-existing failures (require full pipeline run to populate public/data/); unrelated to plan 02 scope

Phase 126 Plan 1 decisions:

- D-01 enforced by resolution gate in production; species mart uses strict dbt NOT NULL constraint; occurrences mart uses severity:warn data_test (not hard constraint) due to 3 pre-existing unresolvable ecdysis species (anthidiellum robertsoni, lasioglossum aspilurus, osmia phaceliae — 0 iNat API results)
- KNOWN_NON_BEES = {"cicindela pugetana", "cleridae", "encopognathus"} — confirmed non-bee WABA bycatch excluded from occurrences ARM 2 via WHERE filter; reported by gate (D-09)
- Resolution union extended: dbt_sandbox.occurrence_synonyms (not main) and inaturalist_waba_data.observations (not inat_waba_data) — PATTERNS.md schema references were incorrect
- int_combined taxon_id uses ::INTEGER cast (BIGINT source); WABA canonical_name uses ::VARCHAR cast; aliases ctt/ctt_w/ctt_io avoid collision in UNION ALL

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

Last session: 2026-06-01T02:29:12.623Z
Stopped at: Phase 127 context gathered
Resume file: None
