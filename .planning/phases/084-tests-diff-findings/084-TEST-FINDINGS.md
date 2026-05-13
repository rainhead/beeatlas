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

**Procedure:** Renamed `fc.county` to `fc.county AS county_renamed` in the final SELECT of
`data/dbt/models/marts/occurrences.sql` (and only there — no changes to contract or upstream models).

**Drift build result:**
```bash
$ bash data/dbt/run.sh build --select occurrences
# Exit code: 1

1 of 1 START sql external model dbt_sandbox.occurrences
1 of 1 ERROR creating sql external model dbt_sandbox.occurrences [ERROR in 0.09s]

Completed with 1 error, 0 partial successes, and 0 warnings:

Failure in model occurrences (models/marts/occurrences.sql)
  Compilation Error in model occurrences (models/marts/occurrences.sql)
  This model has an enforced contract that failed.
  Please ensure the name, data_type, and number of columns in your contract match the columns in your model's definition.

  | column_name    | definition_type | contract_type | mismatch_reason       |
  | -------------- | --------------- | ------------- | --------------------- |
  | county         |                 | VARCHAR       | missing in definition |
  | county_renamed | VARCHAR         |               | missing in contract   |

  > in macro assert_columns_equivalent (macros/relations/column/columns_spec_ddl.sql)
  > called by macro default__get_assert_columns_equivalent (macros/relations/column/columns_spec_ddl.sql)
  > called by macro get_assert_columns_equivalent (macros/relations/column/columns_spec_ddl.sql)
  > called by macro duckdb__create_table_as (macros/adapters.sql)
  > called by macro create_table_as (macros/relations/table/create.sql)
  > called by macro statement (macros/etc/statement.sql)
  > called by macro materialization_external_duckdb (macros/materializations/external.sql)
  > called by model occurrences (models/marts/occurrences.sql)

Done. PASS=0 WARN=0 ERROR=1 SKIP=0 NO-OP=0 TOTAL=1
```

**Exit code:** 1 (non-zero — build failed as expected)
**Error type:** `Compilation Error` — raised by dbt's `assert_columns_equivalent` macro before
writing the parquet file. The error appears in stdout; `run_results.json` also records the error.
**Error location:** In stdout; dbt identifies the model and the macro call chain.
**Mismatch table:** dbt produces a precise diff showing `county` missing in definition (the SQL
renamed it to `county_renamed`) and `county_renamed` missing in contract (the YAML still says
`county`).

**Revert:** `git checkout -- data/dbt/models/marts/occurrences.sql`
**Post-revert build:** Exit code 0, `PASS=1 WARN=0 ERROR=0` — baseline restored to green.

**Key finding:** The contract error fires at compilation time, before any SQL is executed against
DuckDB. The parquet file from the previous successful build is not overwritten by the failed build.
This is pre-emption behavior, not post-hoc detection.

---

## TEST-03

### Invariant: "occurrences.parquet must have exactly these 33 column names"

### Side-by-Side Comparison

| Dimension | `scripts/validate-schema.mjs` | `data/dbt/models/marts/schema.yml` (contract) |
|-----------|-------------------------------|------------------------------------------------|
| **File / lines** | `scripts/validate-schema.mjs` lines 23–42 | `data/dbt/models/marts/schema.yml` (entire columns block) |
| **What it checks** | Column name presence in the already-written parquet file | Column names AND DuckDB types in the model SELECT before writing |
| **When it runs** | CI time — after `data/export.py` writes to `public/data/` | dbt build time — before the parquet is written |
| **What it gates** | Production deployment (CloudFront-facing file) | Sandbox build output |
| **Type awareness** | None — only checks name presence | Full — declares `integer`, `bigint`, `double`, `varchar`, `boolean` per column |
| **Language** | JavaScript (`hyparquet` + Node.js) | YAML (dbt project) |
| **Discoverability** | Standalone script — separate from model definition | Co-located with the model in `schema.yml` |
| **Error feedback** | `x occurrences.parquet: missing columns: county` (post-export) | Table showing `missing in definition` / `missing in contract` (pre-build) |

### Verdict

The dbt contract expresses the invariant more precisely: it enforces both column names AND DuckDB
types, producing a compile-time error with a machine-readable mismatch table. If `year` silently
changed from `BIGINT` to `INTEGER`, validate-schema.mjs would pass; the dbt contract would fail.

However, validate-schema.mjs has broader scope: it runs against the actual production file on
CloudFront, catching regressions after the full export pipeline. The dbt contract only gates
sandbox output. The two mechanisms are complementary — the contract catches problems at build time
inside the dbt project, while the JavaScript gate is the last line of defense before deployment.
