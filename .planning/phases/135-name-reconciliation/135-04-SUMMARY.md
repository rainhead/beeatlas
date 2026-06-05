---
phase: 135-name-reconciliation
plan: "04"
subsystem: dbt-synonym-subsystem
tags: [dbt, synonyms, checklist, name-reconciliation, staging]
dependency_graph:
  requires: [135-01]
  provides: [stg_checklist__records_full, int_synonyms-third-arm, gbif_checklist_synonyms-seed]
  affects: [int_synonyms, checklist_data-source]
tech_stack:
  added: []
  patterns: [dbt-anti-join-precedence, source-declaration, seed-header-placeholder]
key_files:
  created:
    - data/dbt/seeds/gbif_checklist_synonyms.csv
    - data/dbt/models/staging/stg_checklist__records_full.sql
  modified:
    - data/dbt/models/sources.yml
    - data/dbt/models/intermediate/int_synonyms.sql
    - data/dbt/seeds/schema.yml
decisions:
  - "D-06: gbif_checklist_synonyms.csv seed created as header-only placeholder; Plan 135-02 fills rows; nightly reads only the committed seed (zero network calls)"
  - "D-07: checklist synonym resolution unified into int_synonyms third arm; stg_checklist__records_full uses int_synonyms as single synonym source"
  - "dbt parse used for structural validation (no DuckDB file in worktree); orchestrator re-runs full dbt build post-merge"
metrics:
  duration: "138s"
  completed_date: "2026-06-05"
  tasks_completed: 2
  files_changed: 5
requirements_completed: [RCN-06, RCN-07]
---

# Phase 135 Plan 04: dbt Synonym Subsystem Wiring Summary

Single-sentence summary: Wired the GBIF checklist synonym seed as a third anti-joined UNION arm in `int_synonyms`, declared `checklist_records_full` as a dbt source, authored `stg_checklist__records_full.sql` with synonym JOIN + iNat taxon_id bridge, and registered seed tests — completing the single synonym subsystem (RCN-06) and providing the canonical_name→taxon_id mapping the homonym guard (RCN-07) checks.

## What Was Built

### Task 1: Source declaration + int_synonyms third arm + seed tests (cee4d41)

**data/dbt/models/sources.yml** — Added `checklist_records_full` to the `checklist_data` source block (Pitfall 8 from RESEARCH.md).

**data/dbt/models/intermediate/int_synonyms.sql** — Appended third `UNION ALL` arm:
```sql
UNION ALL
SELECT g.synonym, g.accepted_name, g.source
FROM {{ ref('gbif_checklist_synonyms') }} g
LEFT JOIN {{ ref('occurrence_synonyms') }} m ON m.synonym = g.synonym
LEFT JOIN {{ ref('auto_synonyms') }} a ON a.synonym = g.synonym
WHERE m.synonym IS NULL
  AND a.synonym IS NULL
```
Manual entries (`occurrence_synonyms`) and inactive-remap entries (`auto_synonyms`) both supersede GBIF auto-resolved entries via double anti-join.

**data/dbt/seeds/schema.yml** — Added `gbif_checklist_synonyms` entry with `not_null`+`unique` on `synonym` and `not_null` on `accepted_name` (T-135-08 unique constraint guard).

**data/dbt/seeds/gbif_checklist_synonyms.csv** — Header-only placeholder (`synonym,accepted_name,source,gbif_usage_key,gbif_match_type,gbif_confidence`) so dbt can parse/compile before Plan 135-02 fills the rows.

### Task 2: stg_checklist__records_full.sql (10044d3)

**data/dbt/models/staging/stg_checklist__records_full.sql** — New view following the `stg_checklist__species.sql` analog pattern:
- Selects ObjectID, verbatim_name, COALESCE(syn.accepted_name, cr.canonical_name) AS canonical_name, lat/lon/year/month/day/date_quality/recordedBy/locality/family/coord_flag
- Resolves taxon_id: exact match via `stg_inat__canonical_to_taxon_id`, genus-rank fallback via `stg_inat__genus_taxon_ids` (single-token canonical_name)
- Filters to `coord_flag = 'valid'` (drops ~9% no-coordinate rows)
- Respects Phase 137 boundary — no reference to `int_combined` or the occurrences mart

## Verification

`dbt parse` completed cleanly (no errors) on both commits — structural validity confirmed. Full dbt build requires a populated DuckDB file; the orchestrator re-runs `bash data/dbt/run.sh build` post-merge when the DB is present.

Manual acceptance checks:
- `grep -c "checklist_records_full" sources.yml` = 1
- `grep -c "gbif_checklist_synonyms" int_synonyms.sql` = 1 (third UNION arm)
- `seeds/schema.yml` has `not_null` + `unique` on `gbif_checklist_synonyms.synonym`
- `stg_checklist__records_full.sql` references `ref('int_synonyms')` and has `WHERE cr.coord_flag = 'valid'`

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Header-only seed placeholder | Plan 135-02 runs concurrently and fills the CSV rows; an empty seed is valid dbt (passes parse/compile) and avoids a cross-plan dependency for this structural wiring task |
| Double anti-join for third arm | Satisfies T-135-07 (tampering threat): GBIF auto cannot override either curated manual entries OR iNat inactive-remap entries |
| `canonical_name` column reference in stg model | Plan 135-03 adds this column to `checklist_records_full` in Python; the stg model JOINs on it directly per the PATTERNS.md specification |

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries were introduced. The seed CSV addition is a static committed artifact (offline cache pattern per D-06); the dbt view additions are read-only transforms over existing data sources.

## Self-Check: PASSED

Files created/modified:
- FOUND: data/dbt/models/sources.yml
- FOUND: data/dbt/models/intermediate/int_synonyms.sql
- FOUND: data/dbt/seeds/schema.yml
- FOUND: data/dbt/seeds/gbif_checklist_synonyms.csv
- FOUND: data/dbt/models/staging/stg_checklist__records_full.sql
- FOUND: .planning/phases/135-name-reconciliation/135-04-SUMMARY.md

Commits verified:
- cee4d41: feat(135-04): declare checklist_records_full source + int_synonyms third arm (RCN-06)
- 10044d3: feat(135-04): author stg_checklist__records_full.sql — synonym JOIN + taxon_id bridge (RCN-06, RCN-07 prereq)
