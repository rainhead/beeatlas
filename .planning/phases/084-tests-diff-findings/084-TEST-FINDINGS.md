# 084 Test Findings

Scratch document capturing per-test outcomes from the dbt spike (Phase 84, Plan 01).
Consumed by Plan 03 (findings consolidation) — do NOT write to dbt-spike-findings.md directly.

---

## TEST-01

Generic tests (not_null, unique, relationships) on staging and intermediate models.
Run command: `bash data/dbt/run.sh test`
Run date: 2026-05-13

### Results Table

| test_name | model | status | failures | classification |
|-----------|-------|--------|----------|----------------|
| not_null_stg_ecdysis__occurrences_catalog_number | stg_ecdysis__occurrences | **pass** | 0 | held |
| unique_stg_ecdysis__occurrences_catalog_number | stg_ecdysis__occurrences | **pass** | 0 | held |
| not_null_stg_waba__observations_id | stg_waba__observations | **pass** | 0 | held |
| unique_stg_waba__observations_id | stg_waba__observations | **pass** | 0 | held |
| not_null_stg_inat__observations_id | stg_inat__observations | **fail** | 1 | awkward-fit |
| unique_stg_inat__observations_id | stg_inat__observations | **pass** | 0 | held |
| not_null_int_id_modified_coreid | int_id_modified | **pass** | 0 | held |
| unique_int_id_modified_coreid | int_id_modified | **pass** | 0 | held |
| not_null_int_combined_is_provisional | int_combined | **pass** | 0 | held |
| relationships_int_ecdysis_base_ecdysis_id__catalog_number__ref_stg_ecdysis__occurrences_ | int_ecdysis_base | **error** | — | awkward-fit |

### Awkward-fit findings

**stg_inat__observations.id not_null FAIL (1 failure):**
The pre-research predicted a `unique` failure on this column (10,845 distinct / 10,846 rows). The
actual finding is that the `not_null` test failed (1 NULL id), and the `unique` test PASSED (because
NULL is not counted as a duplicate in SQL DISTINCT). This is a more precise diagnosis than expected:
iNat `id` is not always populated. The iNat pipeline does not enforce non-null source IDs.
Classification: awkward-fit — the pipeline assumption that every observation has an ID is wrong.

**relationships int_ecdysis_base.ecdysis_id → stg_ecdysis__occurrences.catalog_number ERROR:**
```
Runtime Error in test relationships_int_ecdysis_base_ecdysis_id__catalog_number__ref_stg_ecdysis__occurrences_
Conversion Error: Could not convert string 'WSDA_2303966' to INT32 when casting from source column to_field

LINE 30:     on child.from_field = parent.to_field
                                   ^
```
Root cause: `ecdysis_id` is INTEGER; `catalog_number` is VARCHAR. DuckDB cannot auto-cast in the
`relationships` test's EXISTS subquery — it tries to cast the VARCHAR `catalog_number` to INT32
and fails on rows like 'WSDA_2303966' (non-numeric catalog numbers). This confirms Pitfall 3.
Classification: awkward-fit — relationships test requires explicit CAST for cross-type keys.
Fix would be: a dbt singular test with `CAST(ecdysis_id AS VARCHAR) = catalog_number`.

---

## TEST-02

### A1 Result: Contract on occurrences mart (external materialization) — CONFIRMED

**Contract target:** `data/dbt/models/marts/schema.yml` → model `occurrences`
**Materialization:** `materialized='external'` (writes to `target/sandbox/occurrences.parquet`)
**Contract:** 33 columns with DuckDB types; `config: contract: enforced: true`

**Build result:**
```
1 of 1 START sql external model dbt_sandbox.occurrences
1 of 1 OK created sql external model dbt_sandbox.occurrences [OK in 0.39s]

Done. PASS=1 WARN=0 ERROR=0 SKIP=0 NO-OP=0 TOTAL=1
Exit code: 0
```

A1 confirmed: `contract: enforced: true` works with `materialized='external'` in dbt-duckdb 1.10.1.
The contract is enforced on the `occurrences` mart (not the int_combined fallback).
No fallback to int_combined needed.

### Contract definition

File: `data/dbt/models/marts/schema.yml`
All 33 columns declared with name + data_type (integer, bigint, double, varchar, boolean).
Column count verified: `grep -c 'data_type:' data/dbt/models/marts/schema.yml` = 33

---

## TEST-02 Drift Demonstration

See Task 3 below — filled in after the drift experiment.

---

## TEST-03

See Task 3 below — filled in after the validate-schema.mjs comparison.
