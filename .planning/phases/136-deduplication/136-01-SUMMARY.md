---
phase: 136-deduplication
plan: "01"
subsystem: data-pipeline
status: complete
completed_date: "2026-06-08"
duration_minutes: 9
tags: [tdd, red-scaffold, dedup, dbt, pytest]
requirements_completed: [DUP-01, DUP-02, DUP-03]

dependency_graph:
  requires: []
  provides:
    - checklist_dedup.py stub module with constants + four stub functions
    - int_checklist_collapsed.sql placeholder (DUP-01)
    - int_dedup_candidates.sql placeholder (DUP-02)
    - int_checklist_dedup_status.sql placeholder (DUP-03)
    - dedup_decisions.csv header-only seed
    - schema.yml dedup_decisions entry
    - 11 RED pytest tests pinning DUP-01/02/03 behaviors
  affects:
    - data/dbt/seeds/schema.yml (new entry)
    - data/dbt/models/intermediate/ (3 new models)

tech_stack:
  added: []
  patterns:
    - Isolated :memory: DuckDB fixture (no pandas, uses fetchall+description)
    - monkeypatch.setattr for CSV path redirection (gate test pattern)
    - NotImplementedError stubs for all Python helpers (waves 2-4 implement)
    - WHERE false column-shape placeholder for candidate SQL model

key_files:
  created:
    - data/checklist_dedup.py
    - data/dbt/models/intermediate/int_checklist_collapsed.sql
    - data/dbt/models/intermediate/int_dedup_candidates.sql
    - data/dbt/models/intermediate/int_checklist_dedup_status.sql
    - data/dbt/seeds/dedup_decisions.csv
    - data/tests/test_checklist_dedup.py
  modified:
    - data/dbt/seeds/schema.yml

key_decisions:
  - "Placeholder int_dedup_candidates.sql uses WHERE false column shell rather than a ref() to real tables — lets the DAG build before implementation and gives tests a concrete column shape to assert against"
  - "DUP-02 and DUP-03 SQL tests require a positive assertion (valid pair IS a candidate / confirmed decision IS propagated) so they fail RED even when placeholder returns no rows, not just trivially pass"
  - "All SQL tests use fetchall()+cursor.description (no pandas dependency)"

metrics:
  tasks_completed: 2
  tasks_total: 2
  files_created: 6
  files_modified: 1
---

# Phase 136 Plan 01: RED Scaffold — Dedup Test Stubs + Stub Module + Placeholder Models Summary

Wave 0 scaffold for Phase 136 deduplication: 11 RED pytest stubs covering DUP-01/02/03 behaviors, stub `checklist_dedup.py` module with constants + four `NotImplementedError` functions, three placeholder intermediate dbt models (table/view materialization), and a header-only `dedup_decisions.csv` seed with `schema.yml` registration.

## What Was Built

### Task 1: Stub module + placeholders + seed (commit 00a9907)

`data/checklist_dedup.py` — stub module with:
- Module-level constants: `DB_PATH`, `DEDUP_CANDIDATE_CSV`, `DEDUP_DECISIONS_CSV`, `DEDUP_DISTANCE_THRESHOLD_M = 1000.0`
- `_csv_safe()` formula-injection guard copied verbatim from `resolve_taxon_ids.py` (WR-03 / T-136-01)
- Four stub functions with docstrings and `raise NotImplementedError`: `_normalize_collector`, `_collectors_match`, `write_dedup_candidates`, `check_dedup_gate`

Three placeholder dbt models:
- `int_checklist_collapsed.sql`: `materialized='table'`, passes through `stg_checklist__records_full` (DUP-01 collapse lands in 136-02)
- `int_dedup_candidates.sql`: `materialized='table'`, `WHERE false` column shell with pair_key/checklist_ObjectID/ecdysis_id and full column shape (DUP-02 spatial join lands in 136-03)
- `int_checklist_dedup_status.sql`: `materialized='view'`, passes through `int_checklist_collapsed` with `CAST(NULL AS VARCHAR) AS dedup_status` (DUP-03 LEFT JOIN lands in 136-04)

`data/dbt/seeds/dedup_decisions.csv` — header-only: `pair_key,dedup_status,note`

`data/dbt/seeds/schema.yml` — new `dedup_decisions` entry with `pair_key` (not_null, unique), `dedup_status` (not_null, accepted_values ['confirmed','rejected']), `note` (description).

### Task 2: 11 RED test stubs (commit cd1dcba)

`data/tests/test_checklist_dedup.py` — all 11 tests from VALIDATION.md, all RED (11 failed, 0 skipped, 0 xfailed):

| Test | Req | How it fails RED |
|------|-----|-----------------|
| `test_no_exact_duplicates_after_collapse` | DUP-01 | Placeholder passes 3 identical rows through; duplicate tuples assertion fails |
| `test_collapsed_count_correct` | DUP-01 | No `collapsed_count` column in placeholder SELECT * |
| `test_lowest_objectid_survives` | DUP-01 | 3 rows survive instead of 1 |
| `test_null_date_excluded_from_candidates` | DUP-02 | Requires valid-date pair to be a candidate; placeholder returns no rows |
| `test_null_coord_excluded_from_candidates` | DUP-02 | Same: requires valid-coord pair as candidate; placeholder empty |
| `test_candidate_csv_written` | DUP-02 | `write_dedup_candidates()` raises `NotImplementedError` |
| `test_collector_normalization` | D-05 | `_collectors_match()` raises `NotImplementedError` |
| `test_distance_1km_window` | DUP-02 | Inside pair not a candidate (placeholder WHERE false) |
| `test_unreviewed_pair_not_suppressed` | DUP-03 | Placeholder ignores dedup_decisions; confirmed decision not propagated |
| `test_confirmed_pair_suppressed` | DUP-03 | Placeholder returns NULL dedup_status; expects 'confirmed' |
| `test_dedup_gate` | DUP-03 | `check_dedup_gate()` raises `NotImplementedError`, not `SystemExit` |

## Deviations from Plan

None — plan executed exactly as written.

## TDD Gate Compliance

This plan is the RED phase. GREEN gates land in waves 2-4 (plans 136-02 through 136-04).

- RED gate: `test(136-01)` commit exists (cd1dcba) ✓
- GREEN gate: pending (136-02/03/04)

## Known Stubs

All stubs are intentional Wave 0 scaffolding — each references the wave that implements it:

| Stub | File | Wave |
|------|------|------|
| `_normalize_collector()` — raises NotImplementedError | data/checklist_dedup.py | 136-02 |
| `_collectors_match()` — raises NotImplementedError | data/checklist_dedup.py | 136-02 |
| `write_dedup_candidates()` — raises NotImplementedError | data/checklist_dedup.py | 136-03 |
| `check_dedup_gate()` — raises NotImplementedError | data/checklist_dedup.py | 136-04 |
| `int_checklist_collapsed.sql` — SELECT * passthrough | data/dbt/models/intermediate/ | 136-02 |
| `int_dedup_candidates.sql` — WHERE false shell | data/dbt/models/intermediate/ | 136-03 |
| `int_checklist_dedup_status.sql` — NULL dedup_status | data/dbt/models/intermediate/ | 136-04 |

## Threat Flags

None. This plan only adds stubs and tests; no new network endpoints, auth paths, or trust boundaries. The `_csv_safe()` helper (T-136-01 mitigation for formula injection in curator-facing CSVs) is included in the stub module.

## Self-Check: PASSED
