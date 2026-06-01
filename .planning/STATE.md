---
gsd_state_version: 1.0
milestone: v4.5
milestone_name: iNat Taxonomy & Species Completeness
status: ready_to_close
stopped_at: Phase 128 verified (9/9 passed) — TID-02 closed; v4.5 ready for /gsd:complete-milestone
last_updated: "2026-06-01T20:35:00.000Z"
last_activity: 2026-06-01
progress:
  total_phases: 15
  completed_phases: 10
  total_plans: 24
  completed_plans: 24
  percent: 67
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-29 — milestone v4.5 started)

**Core value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.
**Current focus:** Phase 128 — Occurrence Finest-Rank Taxon Backfill (closes re-scoped TID-02)

## Current Position

Phase: 128
Plan: 01 — verified (9/9 passed)
Status: TID-02 closed — genus-rank backfill complete & verified; v4.5 ready for /gsd:complete-milestone
Last activity: 2026-06-01

### v4.5 Milestone Close — Ready (was blocked, now resolved)

The milestone-close attempt on 2026-06-01 surfaced a real gap during Phase 126 verification; it is now closed:

- Phase 126 verified 2026-06-01 → 3/4: TID-01, TID-03, D-03 rollup invariant VERIFIED; TID-02 failed as written (literally impossible — ~21k ecdysis specimens have no identification).
- **Human decision (Peter):** re-scope TID-02 to "every **identified** occurrence row" (finest-rank taxon_id); backfill genus-level rows in **Phase 128**; truly-unidentified stay NULL. Disambiguation by kingdom = Animalia (resolves wasps/flies too).
- **Phase 128 executed + verified (9/9 passed):** NULL taxon_id 34,354 → 21,680; 12,674 genus rows backfilled; TID-02 marked Complete.

**Open items before close:**
1. Execution commits are on branch `phase-128-occurrence-finest-rank-taxon-backfill` (linear fast-forward of `main`) — merge to main before/within close.
2. `DEF-128-01` deferred infra item (relative DB_PATH seed-path bug) to acknowledge at close.

**Resume path:** merge phase-128 → main, then `/gsd:complete-milestone v4.5`.

## Accumulated Context

### Decisions

All v4.3 decisions logged in PROJECT.md Key Decisions table.

Phase 128 Plan 01 decisions:

- Genus disambiguation by kingdom = Animalia (ancestry contains taxon 1), not Anthophila — non-bee aculeates (wasps/flies) resolve to their real genus taxon (stelis→127831, bembix→53067)
- stg_inat__genus_taxon_ids reads ../raw/taxa.csv.gz directly via DuckDB read_csv (first raw-CSV-in-model in the repo); excludes the 58 cross-phylum animal-genus homonyms via HAVING COUNT(*)=1 so genus_name is unique and the LEFT JOIN cannot fan out (0 of our 149 genera affected; ambiguous future names surface as NULL, not a wrong link)
- Per-ARM COALESCE(<bridge>.taxon_id, genus.taxon_id) guarded by taxon_id IS NULL + single-token detection; not_null test re-scoped to every named row (severity: warn); consistency test scoped to species-level (D-06)
- Backfill: whole-column NULL taxon_id 34,354 → 21,680; 12,674 genus rows (149 genera) NULL → non-null; 37-col contract held; taxon_id stays INTEGER
- Pre-existing (deferred): `data/dbt/run.sh build` needs an absolute DB_PATH or the seeds fail with a dbt-duckdb seed-path resolution bug (nightly already uses absolute DB_PATH); logged in 128 deferred-items.md

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

- Phase 128 added (2026-06-01): Occurrence Finest-Rank Taxon Backfill — closes re-scoped TID-02 (genus-rank taxon_id for 12,674 genus-level occurrence rows)
- Phase 121: Prebuilt SQLite Load — COMPLETE
- Phase 122: Worker GeoJSON Aggregation — COMPLETE

### Pending Todos

None.

### Blockers/Concerns

None.

## Deferred Items

- DEF-128-01: `data/dbt/run.sh build` fails seeds with the default relative `DB_PATH` (dbt-duckdb seed-path resolution); workaround = absolute `DB_PATH`. See `.planning/phases/128-occurrence-finest-rank-taxon-backfill/deferred-items.md`.

## Quick Tasks Completed

| Date | Slug | Description |
|---|---|---|
| 2026-05-26 | inat-obs-show-species-in-sidebar | iNat expert obs: show species name + quality badge in sidebar |
| 2026-05-27 | 260527-ko5 | Move sqlite and data loading into a worker thread; profile before/after |
| 2026-05-27 | pst | Replace string-escape INSERT with wa-sqlite prepared statements |
| 2026-05-28 | syn-occurrence-synonymy-mechanism | Occurrence-side synonymy mechanism; map Agapostemon texanus → subtilior (Portman et al. 2024) |

## Session Continuity

Last session: 2026-06-01T20:14:00.000Z
Stopped at: Phase 128 Plan 01 executed — TID-02 closed
Resume file: None
