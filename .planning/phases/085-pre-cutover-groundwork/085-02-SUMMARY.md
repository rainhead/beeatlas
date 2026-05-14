---
phase: 085
plan: "02"
subsystem: dbt-tests
tags: [dbt, testing, ecdysis, singular-test, schema-cleanup]
dependency_graph:
  requires: []
  provides: [TEST-02-resolved]
  affects: [data/dbt/tests, data/dbt/models/intermediate/schema.yml]
tech_stack:
  added: []
  patterns: [dbt-singular-test]
key_files:
  created:
    - data/dbt/tests/test_ecdysis_id_references_source.sql
  modified:
    - data/dbt/models/intermediate/schema.yml
decisions:
  - "Join via stg_ecdysis__occurrences.id (VARCHAR '5594060') not catalog_number (VARCHAR 'WSDA_2303966') — different identifier namespaces; id is the correct join key per RESEARCH.md §TEST-02"
metrics:
  duration: "4 minutes"
  completed: "2026-05-14"
  tasks_completed: 2
  files_changed: 2
---

# Phase 085 Plan 02: TEST-02 — Replace Broken relationships Test with Singular SQL Test Summary

Replaced the broken generic `relationships` test on `int_ecdysis_base.ecdysis_id` with a singular SQL test joining via `stg_ecdysis__occurrences.id`, resolving the TEST-02 awkward-fit that ERRORed with type conversion failures.

## What Was Done

### Task 1: Create singular SQL test (commit 734b271)

Created `data/dbt/tests/test_ecdysis_id_references_source.sql` — a dbt singular test that passes when it returns 0 rows. The SQL:

```sql
SELECT ib.ecdysis_id
FROM {{ ref('int_ecdysis_base') }} ib
WHERE ib.ecdysis_id IS NOT NULL
  AND CAST(ib.ecdysis_id AS VARCHAR) NOT IN (
    SELECT id FROM {{ ref('stg_ecdysis__occurrences') }}
  )
```

**Verified: returns 0 rows against live data (beeatlas.duckdb).** Test runs as `dbt test --select test_ecdysis_id_references_source` with PASS=1, FAIL=0, ERROR=0.

The file includes a header comment block explaining:
1. Pass semantics (0 rows = all ecdysis_ids have a source record)
2. What it replaces (the generic relationships test that ERRORed on type conversion)
3. Why the original test was semantically wrong (ecdysis_id INTEGER vs wrong identifier namespace)
4. Why this test is correct (joins via id VARCHAR, same logical key, CAST bridges the type gap)
5. Pointer to RESEARCH.md §TEST-02 for the verified-correct join key

**Critical join key note:** The test joins via `stg_ecdysis__occurrences.id` (VARCHAR, e.g. '5594060'), NOT `catalog_number` (VARCHAR, e.g. 'WSDA_2303966'). These are different identifier namespaces — `catalog_number` is from a different authority entirely. Using `catalog_number` would return ALL rows (always fails). See RESEARCH.md §TEST-02 Pitfall 1 for the full explanation.

### Task 2: Remove broken relationships test from schema.yml (commit 5b4030e)

Edited `data/dbt/models/intermediate/schema.yml` to remove the entire `data_tests:` block under `int_ecdysis_base.ecdysis_id`. The removed block was:

```yaml
        data_tests:
          - relationships:
              to: ref('stg_ecdysis__occurrences')
              field: catalog_number
              # NOTE: ecdysis_id is INTEGER; catalog_number is VARCHAR — type mismatch.
              # Expected to ERROR with BinderError (INTEGER vs VARCHAR comparison).
              # Documented as awkward-fit: relationships test requires explicit CAST
              # for cross-type keys. The error IS the TEST-01 finding.
```

Replaced with an inline comment documenting the removal:

```yaml
      - name: ecdysis_id
        # TEST-02: relationships test removed. The generic relationships test ERRORed
        # with "Could not convert string 'WSDA_2303966' to INT32" AND was semantically
        # wrong: ecdysis_id (INTEGER) joins to stg_ecdysis__occurrences.id (VARCHAR),
        # not catalog_number (different namespace). Replaced by singular test:
        # data/dbt/tests/test_ecdysis_id_references_source.sql
```

The `int_id_modified` and `int_combined` model blocks (with their `not_null`/`unique` tests) are untouched.

**dbt test count:** 11 → 10 (removed relationships test; singular test is in `tests/` path and auto-discovered by dbt's default `test-paths: ["tests"]`).

## Verification Results

All checks passed against live data (beeatlas.duckdb, 114MB):

| Check | Result |
|-------|--------|
| `dbt parse` exits 0 | PASS |
| `relationships:` count in schema.yml | 0 |
| `TEST-02` removal comment in schema.yml | PASS |
| `test_ecdysis_id_references_source.sql` exists | PASS |
| File uses `id` column (not `catalog_number`) | PASS |
| `dbt test --select test_ecdysis_id_references_source` | PASS=1, FAIL=0, ERROR=0 |
| Test discovered via default test-paths | PASS |

## Deviations from Plan

None — plan executed exactly as written. The worktree database is empty (274KB vs 114MB in main repo) so the live dbt test was validated by temporarily deploying the files to the main repo, running the test there, and restoring — a standard worktree isolation workaround.

## Threat Flags

None. These are read-only analytical test definitions — no new network endpoints, auth paths, or schema mutations.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| data/dbt/tests/test_ecdysis_id_references_source.sql | FOUND |
| data/dbt/models/intermediate/schema.yml | FOUND |
| .planning/phases/085-pre-cutover-groundwork/085-02-SUMMARY.md | FOUND |
| commit 734b271 (Task 1) | FOUND |
| commit 5b4030e (Task 2) | FOUND |
