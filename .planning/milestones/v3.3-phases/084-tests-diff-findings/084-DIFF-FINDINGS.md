# 084-DIFF-FINDINGS — Diff Harness Results & DIFF-03 Classification

**Captured:** 2026-05-13
**Produced by:** Phase 084 Plan 02 (084-02-diff-harness-PLAN.md)
**Test module:** `data/tests/test_dbt_diff.py`
**Consumed by:** Plan 03 (consolidation into `.planning/research/dbt-spike-findings.md`)

---

## DIFF-01 — Row count, schema, and key-set equality

### Pytest output (verbatim)

```
============================= test session starts ==============================
platform darwin -- Python 3.14.5, pytest-9.0.3, pluggy-1.6.0
rootdir: /Users/rainhead/dev/beeatlas/.claude/worktrees/agent-a785bea1b9374e8c7/data
configfile: pyproject.toml
collecting ... collected 10 items

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

### Summary

Sandbox (`data/dbt/target/sandbox/occurrences.parquet`) and public/data
(`public/data/occurrences.parquet`) agree on all three DIFF-01 axes:

- **Row count:** Both files contain exactly 47,883 rows.
- **Column schema:** Both files have identical 33-column sets with matching names AND DuckDB types.
  The `DESCRIBE SELECT *` output is identical column-for-column; no silent type drift detected.
- **ecdysis_id key set:** Both files contain exactly 46,090 distinct non-null `ecdysis_id` values.
  The full anti-join (EXCEPT in both directions) returns 0 rows, confirming the key sets are
  identical, not merely equal in cardinality.

No material differences found in DIFF-01 scope. The dbt implementation faithfully reproduces the
`export.py` occurrence data at the row, schema, and key-set level.

---

## DIFF-02 — Spatial join discrepancies

### County assignment: 84 boundary-nondeterminism rows

The `test_occurrences_county_spatial_diff` test pins the county divergence at exactly **84 rows**.
These rows are joined on `ecdysis_id` and differ in their `county` column assignment between
sandbox and public outputs.

**Boundary pairs observed** (diagnostic query on 2026-05-13):

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

The 84 rows are split symmetrically: each boundary-ambiguous specimen is assigned to county A in
one implementation and county B in the other. Four boundary pairs are affected, not two as
originally noted in pre-research (Benton/Grant and Chelan/King were both documented; Grant/Kittitas
and Garfield/Whitman are newly confirmed boundary pairs in this run).

**Sample divergent rows (ecdysis_id, sandbox_county, public_county):**
```
(5598675, 'Benton', 'Grant')
(5598676, 'Benton', 'Grant')
(5598677, 'Benton', 'Grant')
(5598678, 'Benton', 'Grant')
(5598679, 'Benton', 'Grant')
(5598680, 'Benton', 'Grant')
(5598681, 'Benton', 'Grant')
(5598682, 'Benton', 'Grant')
(5609205, 'Benton', 'Grant')
(5609206, 'Benton', 'Grant')
```

**Root cause (from 084-RESEARCH.md §Summary §2, verbatim):**
`ST_Within` returns True for both polygons at Benton/Grant and Chelan/King boundaries; no dedup in
`with_county` LEFT JOIN before the fallback path; nondeterministic in BOTH `export.py` and dbt.

The root cause is **boundary nondeterminism**: at polygon edges, `ST_Within` returns `True` for
two adjacent county polygons simultaneously. The `with_county` LEFT JOIN in both `export.py` and
the dbt `int_county_base` model can match a single specimen to multiple counties. Neither
implementation deduplicates before the fallback path selects a county, so JOIN ordering determines
which county "wins" — and that ordering differs between Python DuckDB (export.py) and the dbt
DuckDB pipeline run.

### Ecoregion assignment: 0 differences

The `test_occurrences_ecoregion_spatial_diff` test confirms **0 rows** differ in `ecoregion_l3`
assignment. Ecoregion boundaries do not exhibit the same polygon-edge ambiguity observed in county
data; the L3 ecoregion polygons appear to tile cleanly without overlap at specimen locations.

### GeoJSON file parity

All GeoJSON assertions pass:

- `counties.geojson`: 39 features in both sandbox and public/data (Washington's 39 counties).
- `ecoregions.geojson`: 66 features in both sandbox and public/data.
- Property-name lists (`NAME` for counties, `NA_L3NAME` for ecoregions): sorted lists are identical
  between sandbox and public. No county or ecoregion name is missing or misnamed.

The only GeoJSON difference is JSON whitespace formatting (separate from feature content), which
is classified in DIFF-03 as neutral/cosmetic.

---

## DIFF-03 Classification

Every material difference observed between sandbox and public/data outputs, classified per the
DIFF-03 requirement (4 buckets: schema-design improvement, latent bug uncovered, semantic
divergence to investigate, neutral / cosmetic).

| Difference | Sandbox | Public | Classification | Root Cause |
|------------|---------|--------|----------------|------------|
| GeoJSON whitespace formatting | Compact JSON (no spaces after `:` or `,`) | `json.dumps()` adds spaces after `:` and `,` | neutral / cosmetic | Different JSON formatters: DuckDB COPY with `FORMAT CSV` vs Python `json.dumps()` default |
| 84 county-boundary rows | County assignment varies by run (JOIN ordering) | County assignment varies by run (JOIN ordering) | semantic divergence to investigate | `ST_Within` returns True for 2 polygons at polygon edges (Grant/Benton, Grant/Kittitas, Chelan/King, Garfield/Whitman boundaries); no dedup in `with_county` LEFT JOIN before fallback path; nondeterministic in BOTH `export.py` and dbt |
| Row count | 47,883 | 47,883 | — (identical) | — |
| Column schema (names + types) | 33 columns, identical | 33 columns, identical | — (identical) | — |
| ecdysis_id key set | 46,090 distinct | 46,090 distinct | — (identical) | — |
| ecoregion_l3 assignment | No divergent rows | No divergent rows | — (identical) | Ecoregion L3 polygons tile without overlap at specimen locations |
| GeoJSON feature counts | 39 counties / 66 ecoregions | 39 counties / 66 ecoregions | — (identical) | — |
| GeoJSON property names | NAME / NA_L3NAME identical | NAME / NA_L3NAME identical | — (identical) | — |

**No additional material differences observed beyond those pre-classified by 084-RESEARCH.md.**

The 4 newly confirmed boundary pairs (Grant/Kittitas and Garfield/Whitman, in addition to the
pre-researched Benton/Grant and Chelan/King) are not a new finding category — they are all
instances of the same root cause already classified as "semantic divergence to investigate." The
total count of 84 rows is confirmed stable across this test run.
