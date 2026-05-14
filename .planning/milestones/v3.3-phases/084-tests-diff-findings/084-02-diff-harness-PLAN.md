---
phase: 084
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - data/tests/test_dbt_diff.py
  - .planning/phases/084-tests-diff-findings/084-DIFF-FINDINGS.md
autonomous: true
requirements: [DIFF-01, DIFF-02, DIFF-03]
must_haves:
  truths:
    - "`uv run --project data pytest data/tests/test_dbt_diff.py -x` exits 0 with row-count, schema, key-set, county-diff, eco-diff, geojson-feature-count, and geojson-property-name assertions all passing"
    - "The 84-row county-boundary divergence between sandbox and public/data is asserted by name (expected count = 84) and classified as `semantic divergence to investigate` in 084-DIFF-FINDINGS.md"
    - "Every material difference (GeoJSON whitespace, 84 county-boundary rows, anything else surfaced) lands in a DIFF-03 classification table with one of the 4 buckets"
    - "Schema comparison covers BOTH column names and column types (not just names) so any silent type drift surfaces"
  artifacts:
    - path: "data/tests/test_dbt_diff.py"
      provides: "pytest module exercising DIFF-01 (row count, schema, key-set), DIFF-02 (county 84-row diff, eco 0-row diff, geojson feature-count + property-name equality)"
      min_lines: 60
      contains: "from pathlib import Path"
    - path: ".planning/phases/084-tests-diff-findings/084-DIFF-FINDINGS.md"
      provides: "Verbatim test output captured + DIFF-03 classification table for Plan 03 to consolidate"
      contains: "## DIFF-03 Classification"
  key_links:
    - from: "data/tests/test_dbt_diff.py"
      to: "data/dbt/target/sandbox/occurrences.parquet"
      via: "duckdb.execute(\"SELECT ... FROM read_parquet('SANDBOX/occurrences.parquet')\")"
      pattern: "read_parquet.*sandbox/occurrences"
    - from: "data/tests/test_dbt_diff.py"
      to: "public/data/occurrences.parquet"
      via: "duckdb.execute(\"SELECT ... FROM read_parquet('PUBLIC/occurrences.parquet')\")"
      pattern: "read_parquet.*public/data/occurrences"
---

<objective>
Author `data/tests/test_dbt_diff.py`, a pytest module that diffs the dbt sandbox outputs against
the current `public/data/` outputs across row count, column schema, ecdysis-id key set, county
spatial assignment (expecting 84 boundary-nondeterminism rows), ecoregion_l3 spatial assignment
(expecting 0 differences), and GeoJSON feature counts + property-name equality. Capture the
results into `084-DIFF-FINDINGS.md` along with the DIFF-03 classification table for every
material difference observed.

Purpose: Provide reproducible evidence about how faithfully the dbt slice reproduces `export.py`
outputs. Each test is also the substrate for the DIFF-03 classification of what diverged and why
— the empirically known 84-row county divergence (root-caused to ST_Within boundary
nondeterminism in BOTH implementations) and the GeoJSON whitespace cosmetic difference are
pre-classified; new surprises get classified in this plan and folded into the findings doc by
Plan 03.

Output: a pytest module mirroring `data/tests/test_dbt_scaffold.py`'s style, and a
084-DIFF-FINDINGS.md scratch document Plan 03 will consolidate into
`.planning/research/dbt-spike-findings.md`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/084-tests-diff-findings/084-RESEARCH.md
@.planning/phases/084-tests-diff-findings/084-VALIDATION.md
@.planning/codebase/TESTING.md
@data/tests/test_dbt_scaffold.py
@data/export.py
@./CLAUDE.md

<interfaces>
<!-- Empirically verified baseline (from 084-RESEARCH.md §Summary and §Pattern 4) -->

## Verified diff baseline (DO NOT re-discover)
- occurrences.parquet row count: BOTH sandbox and public/data = 47,883
- occurrences.parquet schema: identical 33 columns; same names, same types
- ecdysis_id key set: 46,090 distinct in both (matches exactly when joined on ecdysis_id)
- county diff (joining on ecdysis_id WHERE s.county != p.county): 84 rows
- ecoregion_l3 diff (same shape): 0 rows
- counties.geojson features: 39 in both files
- ecoregions.geojson features: 66 in both files
- GeoJSON property keys: NAME for counties, NA_L3NAME for ecoregions

## Existing pytest module to mirror
`data/tests/test_dbt_scaffold.py` is the pattern. Key conventions to copy:
- `SANDBOX = Path(__file__).resolve().parent.parent / "dbt" / "target" / "sandbox"`
- `@pytest.mark.skipif(not (SANDBOX / "occurrences.parquet").exists(), reason="run `bash data/dbt/run.sh build` first to produce sandbox outputs")`
- `duckdb.execute(f"DESCRIBE SELECT * FROM read_parquet('{path}')").fetchall()` for schema probing
- `json.loads(path.read_text())` for GeoJSON
- No fixture_con / fixture_db — these tests run against real files

## Path constants needed
```
SANDBOX = Path(__file__).resolve().parent.parent / "dbt" / "target" / "sandbox"
PUBLIC  = Path(__file__).resolve().parent.parent.parent / "public" / "data"
```
The PUBLIC path goes up one extra level (from data/tests/ → repo root → public/data/).

## DIFF-03 classification buckets (verbatim per REQ DIFF-03)
1. schema-design improvement
2. latent bug uncovered
3. semantic divergence to investigate
4. neutral / cosmetic

## Pre-classified material differences (from 084-RESEARCH.md §Pattern 5)
| Difference | Classification | Root cause |
|------------|---------------|------------|
| GeoJSON whitespace (json.dumps adds spaces; DuckDB COPY does not) | neutral / cosmetic | Different JSON formatters |
| 84 county-boundary rows | semantic divergence to investigate | ST_Within returns True for both polygons at Benton/Grant & Chelan/King boundaries; no dedup in LEFT JOIN; nondeterministic in BOTH implementations |
| Row count | identical (47,883) | — |
| Schema (names + types) | identical (33 cols) | — |
| ecoregion_l3 assignment | identical | — |

## Findings scratch file (consumed by Plan 03)
Plan 03 will read `.planning/phases/084-tests-diff-findings/084-DIFF-FINDINGS.md` and merge
into `.planning/research/dbt-spike-findings.md`. This plan MUST NOT touch
`dbt-spike-findings.md` directly (avoids merge conflict with Plan 01 running in parallel).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Author DIFF-01 tests (row count, schema, ecdysis key set)</name>
  <files>data/tests/test_dbt_diff.py</files>
  <read_first>
    - data/tests/test_dbt_scaffold.py for the existing path/skipif/duckdb pattern to mirror
    - 084-RESEARCH.md §Pattern 4 (lines 386-475) for the verified test skeletons and expected counts
    - data/pyproject.toml `[tool.pytest.ini_options]` to confirm pytest discovers `data/tests/test_dbt_diff.py`
  </read_first>
  <behavior>
    - test_occurrences_row_count_matches: sandbox & public row counts equal (both 47,883)
    - test_occurrences_schema_matches: column names+types from `DESCRIBE` match exactly between sandbox and public (33 cols)
    - test_occurrences_ecdysis_key_set_matches: COUNT(DISTINCT ecdysis_id) WHERE ecdysis_id IS NOT NULL is 46,090 in both files
    - test_occurrences_ecdysis_id_join_full: full anti-join (ecdysis_ids in sandbox not in public, and vice versa) returns 0 rows
    - Skipif guard on each test: skip if `SANDBOX / "occurrences.parquet"` does not exist (executor must run `bash data/dbt/run.sh build` first per the validation strategy)
  </behavior>
  <action>
Create `data/tests/test_dbt_diff.py`. Module docstring describes the diff scope (sandbox vs
public, requirements DIFF-01 row count + schema + key set). Define SANDBOX and PUBLIC Path
constants (PUBLIC = repo root / public / data). Import `json`, `duckdb`, `pytest`, `pathlib`.

Implement four tests:
- `test_occurrences_row_count_matches` — compares `COUNT(*)` from both parquets; asserts equality (expected 47,883 per RESEARCH); on failure print both counts.
- `test_occurrences_schema_matches` — fetches `DESCRIBE SELECT *` for both; extracts (col_name, col_type) pairs; asserts the **full ordered list** is equal (names AND types); on failure print the diff between the two lists.
- `test_occurrences_ecdysis_key_set_matches` — compares `COUNT(DISTINCT ecdysis_id) WHERE ecdysis_id IS NOT NULL` for both files; asserts equality (expected 46,090).
- `test_occurrences_ecdysis_id_join_full` — SQL: `SELECT COUNT(*) FROM (SELECT ecdysis_id FROM read_parquet(SANDBOX) WHERE ecdysis_id IS NOT NULL EXCEPT SELECT ecdysis_id FROM read_parquet(PUBLIC) WHERE ecdysis_id IS NOT NULL)` plus the symmetric query; both must be 0 (sets are equal, not merely same-cardinality).

Apply `@pytest.mark.skipif(not (SANDBOX/"occurrences.parquet").exists(), reason="...")` to all
four. Use the same single-quoted f-string pattern as test_dbt_scaffold.py for SQL embedding.

No new pytest fixtures. No conftest.py changes. No production-file imports. Do not modify
`scripts/validate-schema.mjs`, `data/run.py`, `data/nightly.sh`, or `public/data/`.
  </action>
  <verify>
    <automated>bash data/dbt/run.sh build 2>&1 | tail -5; uv run --project data pytest data/tests/test_dbt_diff.py::test_occurrences_row_count_matches data/tests/test_dbt_diff.py::test_occurrences_schema_matches data/tests/test_dbt_diff.py::test_occurrences_ecdysis_key_set_matches data/tests/test_dbt_diff.py::test_occurrences_ecdysis_id_join_full -xvs</automated>
  </verify>
  <acceptance_criteria>
    - `data/tests/test_dbt_diff.py` exists and contains exactly four `def test_*` functions matching the names above
    - All four tests PASS when run after `bash data/dbt/run.sh build`
    - The schema-match test asserts BOTH names AND types (grep returns at least one occurrence of `data_type` or tuple-of-tuples comparison from `DESCRIBE`)
    - Skipif guards exist on all four tests (grep -c `@pytest.mark.skipif` ≥ 4)
    - `git diff scripts/validate-schema.mjs data/run.py data/nightly.sh` is empty (spike-discipline guard)
    - No new imports outside `json`, `duckdb`, `pytest`, `pathlib.Path` (keep deps minimal)
  </acceptance_criteria>
  <done>
Four DIFF-01 tests written and green; baseline equality confirmed via pytest assertions, not
just by-hand inspection.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Author DIFF-02 tests (county 84-row diff, eco 0-row diff, GeoJSON parity)</name>
  <files>data/tests/test_dbt_diff.py</files>
  <read_first>
    - data/tests/test_dbt_diff.py (Task 1 output)
    - 084-RESEARCH.md §Pattern 4 lines 427-475 for the canonical county/eco/geojson test shapes
    - 084-RESEARCH.md §Summary (lines 8-31) for the empirically-verified 84-row count and root cause
    - data/dbt/target/sandbox/counties.geojson and public/data/counties.geojson (confirm 39 features)
    - data/dbt/target/sandbox/ecoregions.geojson and public/data/ecoregions.geojson (confirm 66 features)
  </read_first>
  <behavior>
    - test_occurrences_county_spatial_diff: count of rows where sandbox.county != public.county (joined on ecdysis_id IS NOT NULL) is 84; on failure print the divergent (county, public.county, ecdysis_id) tuples (use LIMIT 10 in the diagnostic query)
    - test_occurrences_ecoregion_spatial_diff: count of rows where sandbox.ecoregion_l3 != public.ecoregion_l3 (same join) is 0
    - test_counties_geojson_feature_count_matches: len(features) equal between sandbox and public (both 39)
    - test_ecoregions_geojson_feature_count_matches: len(features) equal between sandbox and public (both 66)
    - test_geojson_property_names_match: for counties (NAME) and ecoregions (NA_L3NAME), the sorted property-value lists are exactly equal between sandbox and public
  </behavior>
  <action>
Append five tests to `data/tests/test_dbt_diff.py` from Task 1.

`test_occurrences_county_spatial_diff` — SQL joins sandbox and public on ecdysis_id (filter
`s.ecdysis_id IS NOT NULL AND p.ecdysis_id IS NOT NULL`) and counts rows WHERE
`s.county != p.county`. Assert exactly 84 (the empirically verified value). On assertion
failure, also execute a diagnostic query with `LIMIT 10` returning (ecdysis_id, s.county,
p.county) and include it in the assertion message — this surfaces NEW boundary cases if the
count drifts.

`test_occurrences_ecoregion_spatial_diff` — same shape but on `ecoregion_l3`; expected 0.

`test_counties_geojson_feature_count_matches` and `test_ecoregions_geojson_feature_count_matches`
— `json.loads(path.read_text())["features"]` length equal between sandbox and public; expected
39 and 66 respectively.

`test_geojson_property_names_match` — parametrize over `[("counties.geojson", "NAME"),
("ecoregions.geojson", "NA_L3NAME")]` using `@pytest.mark.parametrize`. For each file, extract
sorted list of `f["properties"][prop]` from sandbox and public; assert lists are equal.

Apply skipif guards to all five (sandbox file must exist).

Re-run the full module to confirm all 9 tests pass.
  </action>
  <verify>
    <automated>uv run --project data pytest data/tests/test_dbt_diff.py -xvs 2>&1 | tee /tmp/084-02-diff.log; grep -E '(passed|failed)' /tmp/084-02-diff.log | tail -3; uv run --project data pytest data/tests/test_dbt_diff.py --collect-only -q 2>&1 | grep -c '::test_'</automated>
  </verify>
  <acceptance_criteria>
    - `data/tests/test_dbt_diff.py` contains at least 9 test functions (4 from Task 1 + 5 from Task 2)
    - `uv run --project data pytest data/tests/test_dbt_diff.py -x` exits 0 with all 9 tests reported as passed (or skipped if sandbox missing — but executor must build first)
    - test_occurrences_county_spatial_diff assertion text references the literal value 84 (`grep -q "== 84" data/tests/test_dbt_diff.py` succeeds — covers both `assert n == 84` and similar phrasings)
    - test_occurrences_ecoregion_spatial_diff assertion text references 0
    - Diagnostic LIMIT 10 query on county diff is present in the assertion failure message path (grep `LIMIT 10` in the file)
    - Parametrize decorator used for the property-name test (grep `pytest.mark.parametrize`)
  </acceptance_criteria>
  <done>
9 tests in test_dbt_diff.py, all green; the 84-row county divergence pinned as an exact
expected value; ecoregion has zero diff; GeoJSON feature/property parity asserted.
  </done>
</task>

<task type="auto">
  <name>Task 3: Capture diff outcomes + DIFF-03 classification table into 084-DIFF-FINDINGS.md</name>
  <files>.planning/phases/084-tests-diff-findings/084-DIFF-FINDINGS.md</files>
  <read_first>
    - data/tests/test_dbt_diff.py (the 9 tests just authored)
    - 084-RESEARCH.md §Pattern 5 (lines 477-490) for the canonical DIFF-03 classification table
    - 084-RESEARCH.md §Summary (lines 18-31) for the root-cause analysis of the 84 boundary rows
    - .planning/research/dbt-spike-findings.md §"Open Trade-Offs" (existing GeoJSON whitespace context)
  </read_first>
  <action>
Create `.planning/phases/084-tests-diff-findings/084-DIFF-FINDINGS.md` with three H2 sections:

`## DIFF-01 — Row count, schema, and key-set equality`
Quote the verbatim pytest output from the four DIFF-01 tests (capture via `uv run --project
data pytest data/tests/test_dbt_diff.py -v 2>&1` and paste the pass lines and any printed
counts). Include a 1-paragraph summary: "Sandbox and public/data agree on row count (47,883),
column schema (33 names+types), and ecdysis_id key set (46,090 distinct)."

`## DIFF-02 — Spatial join discrepancies`
Document the 84 county-boundary rows. Cite RESEARCH §Summary §2 verbatim: `ST_Within` returns
True for both polygons at Benton/Grant and Chelan/King boundaries; no dedup in `with_county`
LEFT JOIN before the fallback path; nondeterministic in BOTH `export.py` and dbt. Include the
LIMIT-10 sample output if available (run `uv run --project data pytest
data/tests/test_dbt_diff.py::test_occurrences_county_spatial_diff -xvs` — if it passes, run a
side query: `uv run --project data python3 -c "import duckdb; print(duckdb.execute(...))"`
with the 10-row diagnostic and capture the result). Note that ecoregion_l3 has 0 diffs.

`## DIFF-03 Classification`
Markdown table with columns: Difference | Sandbox | Public | Classification | Root Cause. One
row per material difference observed. Pre-fill from RESEARCH §Pattern 5:
- GeoJSON whitespace formatting → neutral / cosmetic → Python json.dumps vs DuckDB COPY CSV
- 84 county-boundary rows → semantic divergence to investigate → boundary nondeterminism
- Row count → identical → —
- Schema → identical → —
- ecoregion_l3 assignment → identical → —

If Task 2 surfaced any NEW material difference (e.g., schema test fails revealing an unexpected
type drift, or geojson property names don't match), add a row for it with the appropriate
DIFF-03 bucket. If nothing surprising was found, state "no additional material differences
observed beyond those pre-classified by 084-RESEARCH.md."

Do NOT modify `.planning/research/dbt-spike-findings.md` in this plan — Plan 03 consolidates.
  </action>
  <verify>
    <automated>test -f .planning/phases/084-tests-diff-findings/084-DIFF-FINDINGS.md && grep -q '^## DIFF-01' .planning/phases/084-tests-diff-findings/084-DIFF-FINDINGS.md && grep -q '^## DIFF-02' .planning/phases/084-tests-diff-findings/084-DIFF-FINDINGS.md && grep -q '^## DIFF-03' .planning/phases/084-tests-diff-findings/084-DIFF-FINDINGS.md && grep -q 'semantic divergence' .planning/phases/084-tests-diff-findings/084-DIFF-FINDINGS.md && grep -q 'neutral' .planning/phases/084-tests-diff-findings/084-DIFF-FINDINGS.md && grep -q '84' .planning/phases/084-tests-diff-findings/084-DIFF-FINDINGS.md && [ -z "$(git diff .planning/research/dbt-spike-findings.md)" ]</automated>
  </verify>
  <acceptance_criteria>
    - 084-DIFF-FINDINGS.md exists with H2 `## DIFF-01`, `## DIFF-02`, `## DIFF-03 Classification`
    - DIFF-03 table contains at least 5 rows covering: GeoJSON whitespace, 84 county-boundary rows, row count (identical), schema (identical), ecoregion_l3 (identical)
    - The 84-row divergence row has classification `semantic divergence to investigate` AND a root cause sentence referencing ST_Within
    - The GeoJSON whitespace row has classification `neutral / cosmetic`
    - `.planning/research/dbt-spike-findings.md` is unmodified (`git diff` returns empty — Plan 03 owns that file)
    - The DIFF-02 section quotes the root cause from 084-RESEARCH.md §Summary §2 verbatim (or paraphrases it; either is fine, but it must mention boundary nondeterminism)
  </acceptance_criteria>
  <done>
084-DIFF-FINDINGS.md complete with DIFF-01/02/03 sections and the classification table.
Ready for Plan 03 consolidation into the canonical findings doc.
  </done>
</task>

</tasks>

<threat_model>
applies: false
justification: Local-only spike — no auth, network, or untrusted input. The diff harness reads
local parquet/geojson files via DuckDB and the stdlib json module. No production surface
touched per v3.3 scope discipline.
</threat_model>

<verification>
After all three tasks:
- `bash data/dbt/run.sh build && uv run --project data pytest data/tests/test_dbt_diff.py -xvs` exits 0
- `data/tests/test_dbt_diff.py` has at least 9 test functions
- `084-DIFF-FINDINGS.md` has H2 sections for DIFF-01, DIFF-02, DIFF-03 with at least 5 rows in the classification table
- No production surface files modified (`scripts/validate-schema.mjs`, `data/run.py`, `data/nightly.sh`, `public/data/`)
- `.planning/research/dbt-spike-findings.md` is unmodified (Plan 03 owns consolidation)
</verification>

<success_criteria>
- DIFF-01: row count, schema (names + types), and ecdysis-id key set all asserted equal via 4 pytest tests
- DIFF-02: 84-row county-boundary divergence asserted (expected count pinned at 84), 0-row eco divergence asserted; root cause captured in findings
- DIFF-03: classification table covers every material difference (≥ 5 rows) with one of the 4 buckets per requirement
- All 9 tests green after `dbt build`; no production surface modified
</success_criteria>

<output>
After completion, create `.planning/phases/084-tests-diff-findings/084-02-SUMMARY.md`.
</output>
