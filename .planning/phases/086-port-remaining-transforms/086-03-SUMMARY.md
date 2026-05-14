---
phase: "086"
plan: "03"
subsystem: data-pipeline
tags: [documentation, ingestion-boundary, PORT-02, PORT-04, dbt, python]
dependency_graph:
  requires: [086-01]
  provides: [ingestion-boundary-doc]
  affects: [086-04, 086-05, phase-88-cutover]
tech_stack:
  added: []
  patterns: [ingestion-vs-transform-boundary, dbt-source-seam]
key_files:
  created:
    - .planning/phases/086-port-remaining-transforms/ingestion-boundary.md
  modified: []
decisions:
  - PORT-02: keep load_links (HTML scraping) in Python permanently; the join+projection is already in dbt via int_waba_link + int_ecdysis_base; no new dbt models needed
  - PORT-04: keep resolve_taxon_ids.py in Python permanently; iNat API calls, _pick_match policy, rate-limiting, and CSV side-effects are ingestion not transforms
  - Boundary criterion: SQL-shaped (pure table transforms) ports to dbt; Python-shaped (HTTP, procedural policy, rate-limiting, stateful side effects) stays in Python with dbt source() seam
metrics:
  duration: "4m"
  completed: "2026-05-14"
  tasks_completed: 1
  files_changed: 1
---

# Phase 086 Plan 03: PORT-02 + PORT-04 Ingestion Boundary Decision Record Summary

Decision record authored covering both PORT-02 (occurrence-links join already in dbt, HTML scraping stays Python) and PORT-04 (resolve_taxon_ids.py is unambiguous ingestion — iNat API caller, keep in Python with dbt source() seam).

## What Was Built

Created `.planning/phases/086-port-remaining-transforms/ingestion-boundary.md` (203 lines) as a
single YAML-frontmatter decision record covering:

**PORT-02 — Occurrence-Links Derivation:**
- Documents what `data/ecdysis_pipeline.py::load_links` does: dlt pipeline scraping Ecdysis
  HTML pages to populate `ecdysis_data.occurrence_links` with `{occurrence_id, host_observation_id}`.
- Confirms the join + projection are ALREADY in dbt: `int_waba_link` (specimen_observation_id
  via WABA OFV field_id=18116) and `int_ecdysis_base` (host_observation_id LEFT JOIN via
  `ref('stg_ecdysis__occurrence_links')`).
- Records the seam: `load_links() → ecdysis_data.occurrence_links → source() →
  stg_ecdysis__occurrence_links → int_ecdysis_base → int_combined → occurrences mart`.
- Identifies Phase 88 deletion scope: `export.py` waba_link CTE (lines 46-55) and
  occurrence_links LEFT JOIN (~line 80) become dead code; the scraping step stays.

**PORT-04 — resolve_taxon_ids.py:**
- Documents all six ingestion markers: HTTP requests to iNat API, `_pick_match` D-02 filter
  ladder, `_INAT_PACE_SECONDS` rate-limiting, `_inat_get_with_retry` retry logic, stateful
  UPSERT with skip-already-resolved guard, `data/lineage_unresolved.csv` CSV side-effect.
- Records the decision to KEEP in Python permanently.
- Records the seam: `resolve_taxon_ids.py → inaturalist_data.canonical_to_taxon_id →
  source() → stg_inat__canonical_to_taxon_id → int_species_universe (Plan 086-04)`.
- Notes Phase 88: `("resolve-taxon-ids", resolve_taxon_ids)` stays in `data/run.py` STEPS
  indefinitely.

**Companion Note — enrich_taxon_lineage_extended:**
- Same ingestion-boundary logic; stays in Python; `taxon_lineage_extended` is a dbt source()
  (Plan 086-02); out of scope for porting.

**Phase 88 Cutover Scope Section:**
- Permanent Python: `ecdysis-links`, `resolve-taxon-ids`, `taxon-lineage-extended`.
- Deletable after dbt cutover: `export` step and `species-export` step from `data/run.py`.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Author ingestion-boundary.md | d8e9472 | .planning/phases/086-port-remaining-transforms/ingestion-boundary.md |

## Deviations from Plan

None — plan executed exactly as written. No source code modified (`data/`, `src/`, `data/dbt/`
unchanged). Documentation only.

## Self-Check: PASSED

- [x] `ingestion-boundary.md` exists: confirmed
- [x] File is 203 lines (>= 60): confirmed
- [x] Contains PORT-02 (5 occurrences): confirmed
- [x] Contains PORT-04 (4 occurrences): confirmed
- [x] Contains `resolve_taxon_ids`: confirmed
- [x] Contains `load_links`: confirmed
- [x] Contains `stg_ecdysis__occurrence_links`: confirmed
- [x] Contains `stg_inat__canonical_to_taxon_id`: confirmed
- [x] Contains `sources.yml`: confirmed
- [x] Contains `int_waba_link`: confirmed
- [x] YAML frontmatter parses (4 keys, valid structure): confirmed
- [x] Zero case-insensitive matches for "dbt python model": confirmed
- [x] No modifications to `data/`, `src/`: confirmed (`git diff --stat data/ src/` shows 0 changes)
- [x] Commit d8e9472 exists: confirmed
