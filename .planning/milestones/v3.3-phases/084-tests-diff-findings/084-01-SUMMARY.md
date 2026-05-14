---
phase: 084
plan: 01
subsystem: data/dbt
tags: [dbt, testing, contracts, spike]
dependency_graph:
  requires: []
  provides:
    - data/dbt/models/staging/schema.yml
    - data/dbt/models/intermediate/schema.yml
    - data/dbt/models/marts/schema.yml
    - .planning/phases/084-tests-diff-findings/084-TEST-FINDINGS.md
  affects:
    - .planning/research/dbt-spike-findings.md (via Plan 03 consolidation)
tech_stack:
  added: []
  patterns:
    - dbt generic tests (not_null, unique, relationships) in schema.yml
    - dbt model contract (enforced: true) on external materialization
key_files:
  created:
    - data/dbt/models/staging/schema.yml
    - data/dbt/models/intermediate/schema.yml
    - data/dbt/models/marts/schema.yml
    - .planning/phases/084-tests-diff-findings/084-TEST-FINDINGS.md
  modified: []
decisions:
  - "A1 confirmed: contract enforced: true works with materialized='external' in dbt-duckdb 1.10.1"
  - "Contract target is occurrences mart (not int_combined fallback)"
  - "inat not_null fails (1 NULL id) rather than unique — more precise diagnosis than pre-research predicted"
  - "relationships test errors with Conversion Error on INTEGER vs VARCHAR cast — awkward-fit documented"
metrics:
  duration: ~25 minutes
  completed: 2026-05-13T21:55:34Z
  tasks_completed: 3
  files_changed: 4
---

# Phase 084 Plan 01: dbt Tests — Summary

## One-liner

dbt generic tests + 33-column enforced contract on occurrences mart, with drift demo (exit 1) and validate-schema.mjs comparison — all outcomes captured in 084-TEST-FINDINGS.md.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Author generic-test schema.yml files for TEST-01 | 5ba7023 | staging/schema.yml, intermediate/schema.yml, marts/schema.yml (stub) |
| 2 | Add contract to occurrences mart + run full test suite | 43c78fd | marts/schema.yml (contract), 084-TEST-FINDINGS.md (TEST-01+02) |
| 3 | TEST-02 drift demo + TEST-03 validate-schema comparison | 202cb76 | 084-TEST-FINDINGS.md (drift + TEST-03) |

## What Was Built

### TEST-01: Generic Tests (10 tests across 3 layers)

`data/dbt/models/staging/schema.yml`: not_null + unique on:
- `stg_ecdysis__occurrences.catalog_number` — PASS (unique primary key)
- `stg_waba__observations.id` — PASS (unique)
- `stg_inat__observations.id` — not_null FAIL (1 NULL id, awkward-fit), unique PASS

`data/dbt/models/intermediate/schema.yml`: not_null + unique on `int_id_modified.coreid` (both PASS);
not_null on `int_combined.is_provisional` (PASS); relationships on `int_ecdysis_base.ecdysis_id`
→ `stg_ecdysis__occurrences.catalog_number` (ERROR — Conversion Error, awkward-fit).

`dbt test` results: 8 PASS, 1 FAIL (not_null inat id), 1 ERROR (relationships type mismatch).
Both failures are documented awkward-fits, not regressions.

### TEST-02: Model Contract on occurrences Mart

`data/dbt/models/marts/schema.yml`: 33-column contract with DuckDB types on the `occurrences`
mart (`materialized='external'`). A1 confirmed: contract enforcement works with external
materialization in dbt-duckdb 1.10.1. `dbt build --select occurrences` exits 0.

**Drift experiment:** Renamed `fc.county` to `fc.county AS county_renamed` in the final SELECT.
dbt raised a `Compilation Error` with a precise mismatch table before writing the parquet.
Exit code 1. Post-revert build returns to exit 0.

### TEST-03: validate-schema.mjs vs dbt Contract Comparison

Side-by-side comparison documented in 084-TEST-FINDINGS.md §TEST-03. Verdict:
- dbt contract is type-aware (names + DuckDB types) and pre-empts bad builds at sandbox time
- validate-schema.mjs is type-blind but gates the actual production file on CloudFront
- Both mechanisms are complementary; neither fully replaces the other

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as specified.

### Actual Test Results vs Pre-Research Predictions

**Deviation: inat unique test PASSED (predicted FAIL)**
The pre-research predicted `unique` would fail on `stg_inat__observations.id` (10,845 distinct /
10,846 rows). The actual finding: the `not_null` test failed (1 NULL id) and the `unique` test
passed (SQL DISTINCT does not count NULL as a duplicate). This is a more precise diagnosis. The
NULL id explains the row count discrepancy from pre-research. Documented in 084-TEST-FINDINGS.md
§TEST-01 as the corrected awkward-fit finding.

### Open Question A1 (Resolved)

A1 was whether `contract: enforced: true` works with `materialized='external'`. Confirmed: it
works. No fallback to int_combined needed.

## Known Stubs

None — all sections of 084-TEST-FINDINGS.md are complete (TEST-01, TEST-02, TEST-02 Drift
Demonstration, TEST-03).

## Threat Flags

None — local-only spike per plan threat_model (applies: false).

## Self-Check: PASSED

All created files verified present on disk:
- data/dbt/models/staging/schema.yml: FOUND
- data/dbt/models/intermediate/schema.yml: FOUND
- data/dbt/models/marts/schema.yml: FOUND
- .planning/phases/084-tests-diff-findings/084-TEST-FINDINGS.md: FOUND
- .planning/phases/084-tests-diff-findings/084-01-SUMMARY.md: FOUND

All commits verified in git log:
- 5ba7023 (Task 1): FOUND
- 43c78fd (Task 2): FOUND
- 202cb76 (Task 3): FOUND
