---
phase: 165-duplicate-occurrence-rows-shared-occ-id
plan: "01"
subsystem: data-pipeline
tags: [dbt, tests, nyquist, occ-id, witness-gates]
dependency_graph:
  requires: []
  provides:
    - data/dbt/tests/test_no_duplicate_occ_ids.sql
    - src/tests/occurrence.test.ts (new category-3 case)
  affects:
    - dbt build (now WARNs on 4 current duplicate occ_ids)
tech_stack:
  added: []
  patterns:
    - dbt singular test (severity:warn) for CASE-expression uniqueness assertion
key_files:
  created:
    - data/dbt/tests/test_no_duplicate_occ_ids.sql
  modified:
    - data/dbt/models/intermediate/schema.yml
    - src/tests/occurrence.test.ts
decisions:
  - "D-09 witness test uses severity:warn so Shape C (OFV fan-out on obs 288589692) does not block the build"
  - "occ_id CASE expression in test mirrors occurrence_places.sql and occIdFromRow exactly (ecdysis→inat→inat_obs→checklist)"
  - "Category-3 test uses observation_id:351027987 (a known Shape B collision row) as the concrete fixture value"
metrics:
  duration: "~5 minutes"
  completed: "2026-06-24"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 3
---

# Phase 165 Plan 01: Wave 0 Witness Gates Summary

Wave 0 creates two automated witnesses BEFORE any model or frontend change, enabling Nyquist-compliant observation of what changes when Wave 1 (Plans 02/03) eliminates Shapes A+B.

## What Was Built

**D-09 dbt singular test** (`data/dbt/tests/test_no_duplicate_occ_ids.sql`): recomputes the synthetic occ_id from `int_combined` via the same CASE priority as `occurrence_places.sql` and `src/occurrence.ts:occIdFromRow`, then returns rows where any occ_id appears more than once. `severity:warn` so the out-of-scope Shape C (OFV fan-out) does not block the build. Currently returns 4 rows (all 3 shapes), which is the expected witness state.

**Category-3 vitest case** (`src/tests/occurrence.test.ts`): proves that `occIdFromRow` returns `inat:351027987` for a provisional row that carries `observation_id` — the corrected ARM 2 shape after D-03/D-11. The existing `provisionalRow()` → `null` test is preserved unchanged (valid for old-shape rows with observation_id null).

## Verification Results

- `bash data/dbt/run.sh test --select test_no_duplicate_occ_ids` → `WARN 4` (4 violating rows, build not blocked)
- `npm test -- src/tests/occurrence.test.ts` → 28 tests passed (exit 0)

## Commits

| Task | Commit | Files |
|------|--------|-------|
| Task 1: D-09 dbt singular test | `98c4c5b7` | `data/dbt/tests/test_no_duplicate_occ_ids.sql` (new), `data/dbt/models/intermediate/schema.yml` |
| Task 2: category-3 vitest case | `e83cbf78` | `src/tests/occurrence.test.ts` |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. No production data-flow changes in this wave.

## Threat Flags

No new security-relevant surface introduced (build-time tests only, no runtime, no user input, no network).

## Self-Check: PASSED

- `data/dbt/tests/test_no_duplicate_occ_ids.sql` — exists (confirmed by dbt run finding it)
- `98c4c5b7` — found in `git log`
- `e83cbf78` — found in `git log`
- `src/tests/occurrence.test.ts` new test present; 28/28 pass; `src/occurrence.ts` unmodified
