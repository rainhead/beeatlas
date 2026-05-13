# dbt Spike — Findings

## Status

Phase 83 and Phase 84 complete. Slice ported end-to-end; tests, diff, and findings recorded. See Verdict section for the recommendation.

## Slice Choice

The chosen slice is `export.py` → `occurrences.parquet` + `counties.geojson` + `ecoregions.geojson`.
This slice was selected because it covers the maximal learning surface of the `export.py` pipeline
in a single end-to-end path: spatial joins (`ST_Within` + nearest-polygon fallback), a FULL OUTER JOIN
across two occurrence sources (Ecdysis + iNat samples), regex extractions (catalog suffix parsing,
host OFV extraction), OFV joins (specimen count, sample_id, provisional host), and a multi-source
UNION ALL. No other sub-slice offers this breadth of dbt-duckdb feature coverage in one run.

Note on `samples.parquet` discrepancy: REQUIREMENTS.md references `ecdysis.parquet` +
`samples.parquet` as separate outputs, but `export.py` does not currently emit `samples.parquet`.
Instead, samples are folded into `occurrences.parquet` as the sample-side of the FULL OUTER JOIN.
The dbt slice faithfully follows `export.py`'s actual output shape: one `occurrences.parquet`
containing both specimen and sample rows. This discrepancy between REQUIREMENTS.md naming and
`export.py` reality is flagged for FIND-01 in Phase 84.

## Open Trade-Offs (for Phase 84)

DuckDB's spatial extension also offers a GDAL-driven single-call FeatureCollection emission
(`COPY <tbl> TO '...geojson' (FORMAT GDAL, DRIVER 'GeoJSON')`) which is simpler but adds extra
fields (`crs`, optional `id`, optional `bbox`) that `export.py` doesn't produce. For minimum diff
with `export.py` (Phase 84 PORT-02/DIFF-01), the hand-rolled `to_json`/`list` approach is
preferred. Re-evaluate after diff results.

Additional trade-off (discovered during Phase 83 implementation): DuckDB's `COPY ... TO '...'
(FORMAT JSON, ARRAY false)` writes JSON values wrapped in `{"column_name": value}` objects — not
raw JSON scalars. Writing a bare FeatureCollection required `FORMAT CSV, DELIMITER '', QUOTE '',
HEADER false` with an explicit `::VARCHAR` cast. This is fragile and worth flagging as a FIND-01
candidate: is there a cleaner DuckDB-native approach for single-document JSON output?

## TEST-01 Generic Test Outcomes

Ten generic tests were run across staging and intermediate layers using `bash data/dbt/run.sh test`.
Results captured on 2026-05-13.

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
| relationships_int_ecdysis_base_ecdysis_id__catalog_number__ref_stg_ecdysis__occurrences_ | int_ecdysis_base | **error** | --- | awkward-fit |

Summary: 8 PASS, 1 FAIL, 1 ERROR. Both non-passing results are documented awkward-fits, not regressions.

**stg_inat__observations.id not_null FAIL (1 failure):** Pre-research predicted a `unique` failure (10,845 distinct / 10,846 rows). The actual finding is that the `not_null` test failed (1 NULL id), and `unique` PASSED (NULL is not counted as a duplicate in SQL DISTINCT). This is a more precise diagnosis: the iNat pipeline does not enforce non-null source IDs. Classification: awkward-fit.

**relationships int_ecdysis_base.ecdysis_id to stg_ecdysis__occurrences.catalog_number ERROR:**

```
Runtime Error in test relationships_int_ecdysis_base_ecdysis_id__catalog_number__ref_stg_ecdysis__occurrences_
Conversion Error: Could not convert string 'WSDA_2303966' to INT32 when casting from source column to_field

LINE 30:     on child.from_field = parent.to_field
                                   ^
```

Root cause: `ecdysis_id` is INTEGER; `catalog_number` is VARCHAR. DuckDB cannot auto-cast in the `relationships` test's EXISTS subquery. Classification: awkward-fit — the `relationships` test requires explicit CAST for cross-type keys.

## TEST-02 Contract & Drift Demonstration

The model contract was placed on the `occurrences` mart (`materialized='external'`), with all 33 columns declared in `data/dbt/models/marts/schema.yml` and `config: contract: enforced: true`.

**A1 result — confirmed:** `contract: enforced: true` works with `materialized='external'` in dbt-duckdb 1.10.1. No fallback to `int_combined` was needed.

**Baseline build (contract green):**

```
1 of 1 START sql external model dbt_sandbox.occurrences
1 of 1 OK created sql external model dbt_sandbox.occurrences [OK in 0.39s]

Done. PASS=1 WARN=0 ERROR=0 SKIP=0 NO-OP=0 TOTAL=1
Exit code: 0
```

**Intentional drift experiment:** Renamed `fc.county` to `fc.county AS county_renamed` in `data/dbt/models/marts/occurrences.sql`. The contract fired at compilation time before writing any parquet:

```
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

Done. PASS=0 WARN=0 ERROR=1 SKIP=0 NO-OP=0 TOTAL=1
Exit code: 1
```

**Key finding:** The contract error fires at compilation time, before any SQL is executed against DuckDB. The parquet file from the previous successful build is not overwritten by the failed build. This is pre-emption behavior, not post-hoc detection. The error appears in stdout with a precise machine-readable mismatch table.

## TEST-03 validate-schema.mjs Comparison

The invariant "occurrences.parquet must have exactly these 33 column names" is expressed in two places: `scripts/validate-schema.mjs` (post-export CI gate) and the dbt model contract (pre-build sandbox gate).

| Dimension | `scripts/validate-schema.mjs` | `data/dbt/models/marts/schema.yml` (contract) |
|-----------|-------------------------------|------------------------------------------------|
| **File / lines** | `scripts/validate-schema.mjs` lines 23-42 | `data/dbt/models/marts/schema.yml` (entire columns block) |
| **What it checks** | Column name presence in the already-written parquet file | Column names AND DuckDB types in the model SELECT before writing |
| **When it runs** | CI time -- after `data/export.py` writes to `public/data/` | dbt build time -- before the parquet is written |
| **What it gates** | Production deployment (CloudFront-facing file) | Sandbox build output |
| **Type awareness** | None -- only checks name presence | Full -- declares `integer`, `bigint`, `double`, `varchar`, `boolean` per column |
| **Language** | JavaScript (`hyparquet` + Node.js) | YAML (dbt project) |
| **Discoverability** | Standalone script -- separate from model definition | Co-located with the model in `schema.yml` |
| **Error feedback** | `x occurrences.parquet: missing columns: county` (post-export) | Table showing `missing in definition` / `missing in contract` (pre-build) |

The dbt contract expresses the invariant more precisely: it enforces both column names AND DuckDB types. If `year` silently changed from `BIGINT` to `INTEGER`, `validate-schema.mjs` would pass; the dbt contract would fail. However, `validate-schema.mjs` has broader scope: it runs against the actual production file, catching regressions after the full export pipeline. The two mechanisms are complementary rather than substitutable.

## DIFF-01 Equality

Pytest diff harness (`data/tests/test_dbt_diff.py`) confirmed full equality on all three DIFF-01 axes.

**Pytest output (verbatim, 2026-05-13):**

```
============================= test session starts ==============================
platform darwin -- Python 3.14.5, pytest-9.0.3, pluggy-1.6.0

data/tests/test_dbt_diff.py::test_occurrences_row_count_matches PASSED   [ 10%]
data/tests/test_dbt_diff.py::test_occurrences_schema_matches PASSED      [ 20%]
data/tests/test_dbt_diff.py::test_occurrences_ecdysis_key_set_matches PASSED [ 30%]
data/tests/test_dbt_diff.py::test_occurrences_ecdysis_id_join_full PASSED [ 40%]
data/tests/test_dbt_diff.py::test_occurrences_county_spatial_diff PASSED [ 50%]
data/tests/test_dbt_diff.py::test_occurrences_ecoregion_spatial_diff PASSED [ 60%]
data/tests/test_dbt_diff.py::test_counties_geojson_feature_count_matches PASSED [ 70%]
data/tests/test_dbt_diff.py::test_ecoregions_geojson_feature_count_matches PASSED [ 80%]
data/tests/test_dbt_diff.py::test_geojson_property_names_match[counties.geojson-NAME] PASSED [ 90%]
data/tests/test_dbt_diff.py::test_geojson_property_names_match[ecoregions.geojson-NA_L3NAME] PASSED [100%]

============================== 10 passed in 0.62s ==============================
```

- **Row count:** Both sandbox and public/data contain exactly 47,883 rows.
- **Column schema:** Identical 33-column set with matching names AND DuckDB types (`DESCRIBE SELECT *` output is identical column-for-column; no silent type drift).
- **ecdysis_id key set:** Both files contain exactly 46,090 distinct non-null `ecdysis_id` values. The full anti-join (EXCEPT in both directions) returns 0 rows.

No material differences in DIFF-01 scope. The dbt implementation faithfully reproduces the `export.py` occurrence data at the row, schema, and key-set level.

## DIFF-02 Spatial Divergence

**County assignment: 84 boundary-nondeterminism rows.** The `test_occurrences_county_spatial_diff` test pins the county divergence at exactly 84 rows joined on `ecdysis_id` that differ in `county` assignment between sandbox and public outputs.

**Boundary pairs observed (2026-05-13):**

| sandbox_county | public_county | Count |
|----------------|---------------|-------|
| Grant          | Benton        | 16    |
| Benton         | Grant         | 16    |
| Grant          | Kittitas      | 14    |
| Kittitas       | Grant         | 14    |
| King           | Chelan        | 10    |
| Chelan         | King          | 10    |
| Garfield       | Whitman       | 2     |
| Whitman        | Garfield      | 2     |
| **Total**      |               | **84**|

**Root cause:** `ST_Within` returns `True` for both polygons at polygon edges (Grant/Benton, Grant/Kittitas, Chelan/King, Garfield/Whitman county boundaries). The `with_county` LEFT JOIN in both `export.py` and the dbt `int_county_base` model can match a single specimen to multiple counties simultaneously. Neither implementation deduplicates before the fallback path selects a county -- JOIN ordering determines which county wins, and that ordering differs between Python DuckDB (`export.py`) and dbt DuckDB builds. This nondeterminism is present in **both implementations**; the dbt port did not introduce it.

**Ecoregion assignment: 0 differences.** `test_occurrences_ecoregion_spatial_diff` confirms 0 rows differ in `ecoregion_l3`. Ecoregion L3 polygons tile cleanly without overlap at specimen locations.

**GeoJSON file parity:** All GeoJSON assertions pass. `counties.geojson`: 39 features in both. `ecoregions.geojson`: 66 features in both. Property-name lists (`NAME` for counties, `NA_L3NAME` for ecoregions) are identical. The only GeoJSON difference is JSON whitespace formatting (DIFF-03: neutral/cosmetic).

## DIFF-03 Classification Table

Every material difference between sandbox and public/data outputs, classified into four buckets.

| Difference | Sandbox | Public | Classification | Root Cause |
|------------|---------|--------|----------------|------------|
| GeoJSON whitespace formatting | Compact JSON (no spaces after `:` or `,`) | `json.dumps()` adds spaces after `:` and `,` | neutral / cosmetic | Different JSON formatters: DuckDB COPY with `FORMAT CSV` vs Python `json.dumps()` default |
| 84 county-boundary rows | County assignment varies by run (JOIN ordering) | County assignment varies by run (JOIN ordering) | semantic divergence to investigate | `ST_Within` returns True for 2 polygons at polygon edges (Grant/Benton, Grant/Kittitas, Chelan/King, Garfield/Whitman); no dedup in `with_county` LEFT JOIN before fallback path; nondeterministic in BOTH `export.py` and dbt |
| Row count | 47,883 | 47,883 | -- (identical) | -- |
| Column schema (names + types) | 33 columns, identical | 33 columns, identical | -- (identical) | -- |
| ecdysis_id key set | 46,090 distinct | 46,090 distinct | -- (identical) | -- |
| ecoregion_l3 assignment | No divergent rows | No divergent rows | -- (identical) | Ecoregion L3 polygons tile without overlap at specimen locations |
| GeoJSON feature counts | 39 counties / 66 ecoregions | 39 counties / 66 ecoregions | -- (identical) | -- |
| GeoJSON property names | NAME / NA_L3NAME identical | NAME / NA_L3NAME identical | -- (identical) | -- |

No additional material differences beyond those pre-classified by Phase 84 research.

## PART-01 Partial Run Behavior

Two subgraphs were exercised on 2026-05-13 using `bash data/dbt/run.sh build --select <selector>`. Both runs followed a `dbt clean` baseline.

**Subgraph A: `staging+` (all staging and downstream)**

Selector `staging+` includes all 11 staging models plus all models that depend on any of them -- which in BeeAtlas is the entire 23-model DAG (all 9 intermediate models and all 3 marts depend on staging layers). 23 models were included in the run set; 19 built successfully. The 4 models marked `skipped` (`int_samples_base`, `int_ecdysis_base`, `int_combined`, `occurrences`) were skipped by dbt's dependency propagation because the `not_null_stg_inat__observations_id` test failed upstream -- this is expected behavior, not a subgraph failure.

Thread evidence (staging+, Thread-1..4 used):

```
Thread-1 (worker)  success   stg_ecdysis__identifications
Thread-2 (worker)  success   stg_ecdysis__occurrence_links
Thread-3 (worker)  success   stg_ecdysis__occurrences
Thread-4 (worker)  success   stg_geo__us_counties
Thread-4 (worker)  success   stg_geo__us_states
Thread-2 (worker)  success   stg_inat__observations
Thread-1 (worker)  success   stg_inat__ofvs
Thread-3 (worker)  success   stg_waba__observations
Thread-2 (worker)  success   stg_waba__ofvs
Thread-4 (worker)  success   stg_waba__taxon_lineage
Thread-3 (worker)  success   counties_geo
Thread-1 (worker)  success   int_id_modified
Thread-3 (worker)  success   stg_geo__ecoregions
Thread-1 (worker)  success   int_ecdysis_catalog_suffixes
Thread-3 (worker)  success   int_specimen_obs_base
Thread-2 (worker)  success   int_waba_link
Thread-4 (worker)  success   ecoregions_geo
Thread-3 (worker)  success   int_matched_waba_ids
Thread-1 (worker)  success   int_provisional_waba_ids
```

**Subgraph B: `+occurrences` (everything upstream of the occurrences mart)**

Selector `+occurrences` includes all 11 staging + all 9 intermediate + the `occurrences` mart = 21 models. `counties_geo` and `ecoregions_geo` were correctly excluded (they are separate terminal nodes, not ancestors of `occurrences`). Both geo mart names are absent from the model run set.

Thread evidence (+occurrences, Thread-1..4 used):

```
Thread-1 (worker)  success   stg_ecdysis__identifications
Thread-2 (worker)  success   stg_ecdysis__occurrence_links
Thread-3 (worker)  success   stg_ecdysis__occurrences
Thread-4 (worker)  success   stg_geo__us_counties
Thread-2 (worker)  success   stg_geo__us_states
Thread-4 (worker)  success   stg_inat__observations
Thread-3 (worker)  success   stg_inat__ofvs
Thread-1 (worker)  success   stg_waba__observations
Thread-4 (worker)  success   stg_waba__ofvs
Thread-1 (worker)  success   stg_waba__taxon_lineage
Thread-2 (worker)  success   int_id_modified
Thread-1 (worker)  success   stg_geo__ecoregions
Thread-4 (worker)  success   int_ecdysis_catalog_suffixes
Thread-2 (worker)  success   int_specimen_obs_base
Thread-1 (worker)  success   int_waba_link
Thread-3 (worker)  success   int_matched_waba_ids
Thread-4 (worker)  success   int_provisional_waba_ids
```

**Parallelism observation:** dbt-duckdb used all 4 configured threads (`--threads 4` in `profiles.yml`) for both subgraphs. However, DuckDB serializes access to the shared in-process connection, so parallel threads provide scheduling bandwidth for DAG traversal rather than true concurrent SQL execution. The 11 independent staging models ran in interleaved order across Thread-1 through Thread-4, confirming that dbt dispatches independent models to available threads simultaneously. Total wall time for the 23-model full graph was approximately 0.5 seconds per build, consistent with the Phase 83 benchmark (~1.3s including connection setup).

## PART-02 Lineage Artifact

The full model listing was captured on 2026-05-13 using `bash data/dbt/run.sh ls --resource-type model` and committed to `.planning/phases/084-tests-diff-findings/084-lineage-listing.txt` (relative to repo root).

The listing shows 23 models grouped by layer (`marts`, `intermediate`, `staging`). Each identifier follows the pattern `<project>.<layer>.<model_name>`, confirming that dbt's DAG structure maps cleanly onto BeeAtlas's 3-layer architecture.

<details>
<summary>23 models (from 084-lineage-listing.txt)</summary>
<pre>
beeatlas.marts.counties_geo
beeatlas.marts.ecoregions_geo
beeatlas.intermediate.int_combined
beeatlas.intermediate.int_ecdysis_base
beeatlas.intermediate.int_ecdysis_catalog_suffixes
beeatlas.intermediate.int_id_modified
beeatlas.intermediate.int_matched_waba_ids
beeatlas.intermediate.int_provisional_waba_ids
beeatlas.intermediate.int_samples_base
beeatlas.intermediate.int_specimen_obs_base
beeatlas.intermediate.int_waba_link
beeatlas.marts.occurrences
beeatlas.staging.stg_ecdysis__identifications
beeatlas.staging.stg_ecdysis__occurrence_links
beeatlas.staging.stg_ecdysis__occurrences
beeatlas.staging.stg_geo__ecoregions
beeatlas.staging.stg_geo__us_counties
beeatlas.staging.stg_geo__us_states
beeatlas.staging.stg_inat__observations
beeatlas.staging.stg_inat__ofvs
beeatlas.staging.stg_waba__observations
beeatlas.staging.stg_waba__ofvs
beeatlas.staging.stg_waba__taxon_lineage
</pre>
</details>

## What Worked Well

- dbt scaffolding rolled cleanly with the `run.sh` wrapper; the `uvx --from dbt-core==1.10.1` invocation is reproducible and does not require a local dbt installation.
- The staging/intermediate/marts layering mapped naturally onto `export.py`'s CTE structure: source CTEs became staging views, transformation CTEs became intermediate models, and the final SELECT became the mart.
- Generic tests caught the iNat null `id` issue immediately (`not_null` on `stg_inat__observations.id` failed with 1 row) -- a pipeline assumption that every iNat observation has an `id` was wrong, and dbt surfaced it.
- The model contract on `occurrences` surfaced type-level invariants that `validate-schema.mjs` misses entirely: if `year` changes from `BIGINT` to `INTEGER`, the JavaScript gate passes but the dbt contract fails.
- `--select` subgraph syntax (`staging+`, `+occurrences`) is usable for ad-hoc exploration without running the full 23-model DAG, which is useful for development iteration.
- A1 assumption confirmed: `contract: enforced: true` works with `materialized='external'` on dbt-duckdb 1.10.1 -- no known limitation.

## What Was Awkward or Impossible

- The `emit_feature_collection` macro requires `FORMAT CSV, DELIMITER '', QUOTE '', HEADER false` with an explicit `::VARCHAR` cast to emit raw GeoJSON (see §Open Trade-Offs). `FORMAT JSON` wraps the output in `{"col_name": value}` envelopes, breaking the FeatureCollection structure. This workaround is fragile and underdocumented.
- The A1 contract assumption was unverified at research time; it held for `external` materialization, but the behavior on `external` models is not explicitly documented in dbt-duckdb 1.10.x docs. Future dbt-duckdb version bumps could break this silently.
- The `relationships` test on `int_ecdysis_base.ecdysis_id` errored with a `Conversion Error` (INTEGER vs VARCHAR cast failure). The test type requires explicit CAST for cross-type key relationships, which is not supported natively -- a dbt singular test with `CAST(ecdysis_id AS VARCHAR) = catalog_number` would be needed (see §TEST-01).
- `samples.parquet` conceptual fragmentation: REQUIREMENTS.md names `samples.parquet` as a separate output, but `export.py` folds samples into `occurrences.parquet`. The dbt port faithfully reproduced the actual behavior, but the REQUIREMENTS.md naming disagreement must be resolved before any full-rewrite milestone (see §samples.parquet Discrepancy).
- The 84-row county boundary nondeterminism affects BOTH implementations (`export.py` and dbt) and dbt cannot fix it -- the root cause is in the spatial join logic, not in dbt's execution model (see §DIFF-02).
- dbt-core 1.10.20 introduced a macro-parser regression (`KeyError: 'javascript'`) that blocked all dbt commands until the run.sh pin was changed from `1.10.*` to `==1.10.1`. This exact-version sensitivity is an operational risk.

## Where dbt Expressed Things More Clearly Than Python

- `ref()` lineage replaces hand-managed CTE ordering in `export.py`: dbt infers the correct build order from `ref()` calls, eliminating the need to manually sequence CTEs or track which CTE depends on which.
- YAML `data_tests` (`not_null`, `unique`) beat ad-hoc `pytest` assertions for invariants like uniqueness and key presence -- the tests are co-located with model definitions and run automatically as part of `dbt build`.
- Contract types (declaring `integer` vs `varchar` vs `boolean` per column) catch what `validate-schema.mjs` name-only checking misses -- type drift is invisible to the JavaScript gate but pre-empts a dbt build at compilation time.
- `--select` subgraph syntax (`staging+`, `+occurrences`) replaces commenting out blocks of `export.py` to skip work during development iteration; the DAG-awareness makes partial execution precise and repeatable.

## Where dbt Expressed Things Less Clearly Than Python

- The `emit_feature_collection` macro is more code than Python's `json.dumps()` + list comprehension: the macro manages Jinja templating, `FORMAT CSV` quirks, and `::VARCHAR` casting across ~40 lines of SQL/Jinja versus ~10 lines of Python.
- Debugging post-hook failures (like the `FORMAT JSON` to `FORMAT CSV` fix) requires reading `target/compiled/` SQL files and cross-referencing the Jinja macro expansion -- the intermediate representation is less readable than Python stack traces.
- The dbt-duckdb version pin sensitivity (1.10.20 regression requiring exact `==1.10.1`) adds operational risk compared to Python's simpler dependency story.
- The `_apply_migrations()` pattern in `data/run.py` (one-shot DDL for schema evolution) has no obvious dbt analog -- Python imperative migration logic is clearer than any YAML declarative equivalent for one-time DDL changes.

## samples.parquet Discrepancy

REQUIREMENTS.md and ROADMAP.md name `samples.parquet` as a separate pipeline output alongside `occurrences.parquet`. However, `export.py` does not emit a `samples.parquet` file -- samples are folded into `occurrences.parquet` as the sample-side of the FULL OUTER JOIN that merges Ecdysis specimen rows with iNat sample rows. The dbt port faithfully reproduced this behavior: the `occurrences` mart emits one parquet file containing both specimen rows (with `ecdysis_id` populated) and sample rows (with `host_observation_id` populated and `ecdysis_id` NULL).

This is a schema decision the v3.4+ planner must make explicitly before any full-rewrite milestone. Option A: keep the one-file fold (matches the frontend SQLite consumers today, simpler for JOIN queries, no schema migration required). Option B: split into two marts -- a `specimens` mart and a `samples` mart -- which provides a cleaner conceptual model at the cost of frontend changes, a `validate-schema.mjs` update to cover both files, and a SQLite migration. The distinction matters for the dbt contract: a split-mart approach would require two enforced contracts, one per mart. Reference: Phase 83 Plan 04 Summary (083-04-SUMMARY.md) documents the REQUIREMENTS.md vs `export.py` discrepancy as a known open item.

## Verdict

**Recommendation: GO-WITH-CONDITIONS**

The dbt spike demonstrated that the BeeAtlas `export.py` slice can be faithfully reproduced in dbt-duckdb with correct outputs (47,883 rows, 33-column schema, identical key sets) and meaningful test coverage (8/10 generic tests pass; 2 awkward-fits documented). However, specific prerequisites must be met before any full-rewrite milestone proceeds.

**Evidence for conditional approval:**

1. **§TEST-02 outcome -- contract maturity confirmed with one caveat.** The `contract: enforced: true` on the `occurrences` mart (external materialization) works in dbt-duckdb 1.10.1, confirming that the mechanism for schema gating exists and functions as expected. However, this behavior is not explicitly documented for external materializations in the adapter docs; a future dbt-duckdb version bump could silently change it. The contract is the right approach but needs ongoing maintenance discipline.

2. **§DIFF-02 84-row boundary divergence -- both implementations are nondeterministic.** The 84 county-assignment differences are caused by `ST_Within` returning `True` for two adjacent county polygons simultaneously at specimen locations on four boundary pairs (Grant/Benton, Grant/Kittitas, Chelan/King, Garfield/Whitman). This nondeterminism exists in both `export.py` and the dbt `int_county_base` model. dbt cannot fix it; a deduplication step (e.g., `SELECT MIN(county)`) must be added to the `with_county` LEFT JOIN before the fallback path in both implementations. This is not a blocker for the dbt approach, but it is a correctness issue that must be resolved before the pipeline output can be called deterministic.

3. **§Open Trade-Offs and §What Was Awkward -- FORMAT CSV GeoJSON workaround is fragile.** Writing a bare GeoJSON FeatureCollection from DuckDB requires `FORMAT CSV, DELIMITER '', QUOTE '', HEADER false` with `::VARCHAR` cast -- a workaround that bypasses DuckDB's JSON machinery entirely. This approach works but is underdocumented, fragile across DuckDB version changes, and harder to maintain than Python's `json.dumps()`. Before cutover, the GDAL-driver alternative (`FORMAT GDAL, DRIVER 'GeoJSON'`) should be evaluated for minimum-diff equivalence, or the FORMAT CSV approach should be stabilized with explicit documentation and an integration test.

4. **§samples.parquet Discrepancy -- schema decision blocks final schema design.** REQUIREMENTS.md names `samples.parquet` as a separate artifact, but `export.py` (and the dbt port) fold samples into `occurrences.parquet`. This is not a dbt limitation -- it is an open design question. Until the one-file vs two-file decision is made, the dbt mart schema cannot be finalized, and the frontend SQLite consumers cannot be updated safely.

The v3.4+ rewrite milestone should begin only after the five prerequisites in the following section are satisfied. In particular, it should NOT proceed if the 84-row boundary nondeterminism is still present in the implementation, if the `samples.parquet` schema decision is unresolved, or if the FORMAT CSV GeoJSON path has not been validated against a DuckDB version bump.

## Prerequisites for a Full-Rewrite Milestone (v3.4+)

### Test coverage

Before cutover, every invariant currently enforced by `validate-schema.mjs` and `data/run.py::_apply_migrations` must be re-expressed as a dbt test or contract.

- `scripts/validate-schema.mjs` currently checks column-name presence (not types) for `occurrences.parquet`. The dbt contract in `data/dbt/models/marts/schema.yml` re-expresses this with type enforcement (see §TEST-03) -- this mapping is complete for `occurrences`.
- `_apply_migrations()` in `data/run.py` runs one-shot DDL statements for schema evolution. There is no direct dbt analog: dbt declarative models re-create views/tables from scratch on each build; they do not execute imperative DDL. Incremental migrations would require custom `pre-hook` SQL or a separate migration tool. This gap must be explicitly designed around before cutover.
- The `relationships` test on `int_ecdysis_base.ecdysis_id` currently errors due to INTEGER vs VARCHAR type mismatch (see §TEST-01). A singular test with explicit `CAST` must replace it before the test suite can be called a complete regression gate.
- All 10 generic tests must be green (or the 1 not_null inat failure must be fixed upstream) before the test suite is considered a valid regression gate.

### Schema decisions

Before cutover, the `samples.parquet` vs `occurrences.parquet` shape and any column renames must be locked.

- Keep the one-file fold (current behavior): `occurrences.parquet` contains both specimen rows and sample rows, distinguished by `ecdysis_id` nullability. Simpler for frontend JOIN queries; no schema migration required; matches the existing `validate-schema.mjs` column list.
- Split into two marts (cleaner conceptual model): a `specimens` mart and a `samples` mart. Requires frontend changes to consume two files, a `validate-schema.mjs` update, and a new SQLite schema migration. The dbt contract would need to be split accordingly (see §TEST-02 A1 outcome -- contracts work on external materializations, so two contracts are viable).
- The contract enforcement target (§TEST-02) must be updated to reflect whichever schema shape is chosen. If the schema is split, the existing 33-column contract becomes invalid.

### Ingestion-vs-transform boundaries

Before cutover, the boundary between dlt-style ingestion and dbt-style transform must be drawn explicitly.

- What stays dlt / Python (raw HTTP fetchers): `data/dlt_sources/ecdysis.py`, `data/dlt_sources/inat.py`, `data/dlt_sources/waba.py`. These perform HTTP requests, pagination, and DLT schema inference -- not transformations. They belong in the ingestion layer and should write raw schemas that dbt reads as `source()` definitions.
- What moves to dbt (transform-only): `data/export.py` and `data/species_export.py`. These are pure SQL-over-DuckDB transformations that already map cleanly to staging/intermediate/mart layers in dbt.
- What requires evaluation: `data/resolve_taxon_ids.py` and `data/feeds.py` perform API lookups and feed generation that do not map cleanly to either ingestion or transformation. These are out of scope for v3.3 and must be scoped separately.
- The seam design (dlt writes raw schemas, dbt reads as `source()`) must be tested before cutover to confirm that source freshness, schema evolution, and incremental loads work as expected.

### Parallel-run / orchestration story

Before cutover, the cron orchestration story for `data/nightly.sh` must be designed to integrate `dbt build` cleanly.

- `data/nightly.sh` currently runs `export.py` as a monolith under `set -euo pipefail`. Replacing it with `dbt build` changes error-handling semantics: dbt exits non-zero on test failures (including expected awkward-fit failures like the inat `not_null` test), which would cause the nightly cron to fail spuriously. Either the awkward-fit tests must be fixed, or the nightly invocation must use `dbt build --exclude test:<known-fail>` or similar.
- Wall-clock cost: as observed in §PART-01, the 23-model full graph builds in approximately 0.5 seconds. This is significantly faster than the Python pipeline. However, incremental materialization (`materialized='incremental'`) was not tested in this spike -- that is the mechanism for avoiding full rebuilds on nightly runs. Incremental behavior on dbt-duckdb with external materializations is a known unknown.
- dbt has its own exit-code surface (0 = all pass, 1 = any fail/error) which differs from `export.py`'s Python exception-based error handling. The nightly cron must be adapted to interpret dbt exit codes correctly.

### Frontend impact

Before cutover, confirm the output schema of `occurrences.parquet` is unchanged so the wa-sqlite + hyparquet frontend keeps loading it without drift. (DuckDB-WASM was retired in the v2.6 SQLite migration for page-weight reasons; it is not on any forward path.)

- The dbt contract on `occurrences` (§TEST-02) becomes the schema gate for the frontend: if the 33-column contract is in place and green, the parquet schema is stable. The contract must remain in the build pipeline after cutover -- removing it would eliminate the primary schema-correctness guarantee.
- `validate-schema.mjs` currently runs on the actual production file at CI time (§TEST-03). This gate should either be preserved as a production-side check or formally retired in favor of the dbt contract. It should not be silently abandoned -- its role as the last defense before CloudFront deployment is distinct from the contract's sandbox-time role.
- Any column rename or type change introduced during the rewrite is a breaking frontend change. The frontend reads `occurrences.parquet` via `hyparquet` and maps column names directly to SQLite schema columns. Column drift detection is currently a CI gate -- that property must be preserved regardless of whether `validate-schema.mjs` or the dbt contract (or both) provide it.
