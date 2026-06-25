---
phase: 167-collector-identity-column
plan: "01"
subsystem: data-pipeline
tags: [dbt, sql, data-contract, collector-identity]
dependency_graph:
  requires: [Phase 165 int_combined 5-arm UNION ALL]
  provides: [collector_inat_login VARCHAR column in occurrences mart (dbt contract 36→37)]
  affects: [Phase 168 temporal dates, Phase 169 per-collector pages, Phase 170 provenance facets]
tech_stack:
  added: []
  patterns: [dbt not_null generic test with config: severity/where scoping (D-05 error + D-06 warn)]
key_files:
  created: []
  modified:
    - data/dbt/models/intermediate/int_combined.sql
    - data/dbt/models/marts/occurrences.sql
    - data/dbt/models/marts/schema.yml
decisions:
  - "D-05: hard-error not_null test for waba_sample/waba_specimen arms (0 violations today)"
  - "D-06: warn-only not_null test for ecdysis arm (baseline 2,767 NULLs, non-blocking)"
  - "Named tests (not_null_occurrences_collector_inat_login_waba + _ecdysis_drift) required to disambiguate two not_null tests on same column in dbt 1.10.1"
metrics:
  duration_minutes: 2
  completed: "2026-06-25"
  tasks_completed: 2
  tasks_total: 3
  files_modified: 3
requirements_completed: [IDENT-01]
---

# Phase 167 Plan 01: Add collector_inat_login Column (dbt contract 36→37) Summary

COALESCE-derived `collector_inat_login VARCHAR` column added to all 5 int_combined UNION ALL arms, projected through occurrences.sql, and declared as the 37th contract column in schema.yml, with D-05 hard-error and D-06 warn-only dbt data tests validating per-arm correctness.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add collector_inat_login to int_combined, occurrences mart, and schema.yml | d7c5b74e | data/dbt/models/intermediate/int_combined.sql, data/dbt/models/marts/occurrences.sql, data/dbt/models/marts/schema.yml |
| 2 | Validate per-arm NULL baselines and sqlite carry-through | (validation-only; occurrences.db gitignored) | (no source edits) |

## Verification Results

### dbt build (bash data/dbt/run.sh build)

Exit code: **0** | PASS=91 WARN=3 ERROR=0 SKIP=0

Relevant test results:
- `not_null_occurrences_collector_inat_login_waba` (D-05, severity: error): **PASS** (0 violations)
- `not_null_occurrences_collector_inat_login_ecdysis_drift` (D-06, severity: warn): **WARN 2767** (exactly the documented baseline)

Pre-existing warnings (unrelated to this phase):
- `test_lin05_lineage_coverage`: WARN 1 (pre-existing)
- `test_no_duplicate_occ_ids`: WARN 2 (pre-existing)

### Per-arm NULL validation against sandbox/occurrences.parquet

| source | rows | NULLs | Status |
|--------|------|-------|--------|
| checklist | 19,929 | 19,929 | Expected (excluded from identity) |
| ecdysis | 48,801 | 2,767 | Expected (no matched iNat obs for 5.7% of specimens) |
| inat_obs | 28,884 | 0 | PASS |
| waba_sample | 28 | 0 | PASS |
| waba_specimen | 33 | 0 | PASS |

### SQLite carry-through

After `cd data && uv run python sqlite_export.py` (no edit to sqlite_export.py):
- `occurrences.db` PRAGMA table_info confirms `collector_inat_login` as 37th column
- `sqlite_export.py` unchanged (`git diff --quiet data/sqlite_export.py` exits 0)

## Acceptance Criteria

- [x] `grep -v '^--' int_combined.sql | grep -c 'AS collector_inat_login'` = 5
- [x] `grep -c 'j.collector_inat_login' occurrences.sql` = 1
- [x] `grep -c 'j.specimen_inat_login' occurrences.sql` = 0
- [x] schema.yml contains collector_inat_login with data_type: varchar, D-05 error test, D-06 warn test
- [x] D-06 where clause is `source = 'ecdysis'` (no tautological `and collector_inat_login is null`)
- [x] `bash data/dbt/run.sh build` exits 0
- [x] D-05 test PASS (0 violations)
- [x] D-06 test WARN ~2,767 (exactly 2,767)
- [x] occurrences.db carries collector_inat_login with no edit to sqlite_export.py

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] dbt test name collision between two not_null tests on collector_inat_login**

- **Found during:** Task 1 verification (first dbt build attempt)
- **Issue:** dbt 1.10.1 auto-generates test names from column + test type; two `not_null` tests on the same column produce identical names (`not_null_occurrences_collector_inat_login`), causing a compilation error: "dbt found two data_tests with the name ... Since these resources have the same name, dbt will be unable to find the correct resource."
- **Fix:** Added explicit `name:` keys to both tests in schema.yml: `not_null_occurrences_collector_inat_login_waba` (D-05) and `not_null_occurrences_collector_inat_login_ecdysis_drift` (D-06). This is the standard dbt 1.10.1 disambiguation pattern.
- **Files modified:** data/dbt/models/marts/schema.yml
- **Commit:** d7c5b74e (included in Task 1 commit, fixed inline before committing)

## Checkpoint Required

Task 3 requires a human operator step on the maderas cron host (S3 publish with `SKIP_INTEGRATION_GATE=1`). See checkpoint below.

## Known Stubs

None - all data is live from the dbt pipeline; no placeholder values introduced.

## Threat Flags

None - no new network endpoints, auth paths, file access patterns, or schema trust boundary changes. `collector_inat_login` is derived from public iNaturalist handles already surfaced on the site (T-167-01: accepted per threat model).

## Self-Check: PASSED

Files exist:
- data/dbt/models/intermediate/int_combined.sql: FOUND
- data/dbt/models/marts/occurrences.sql: FOUND
- data/dbt/models/marts/schema.yml: FOUND

Commits exist:
- d7c5b74e: FOUND (feat(167-01): add collector_inat_login column)
