---
phase: 083
plan: 04
type: execute
wave: 3
depends_on: [083-03]
files_modified:
  - data/dbt/macros/emit_feature_collection.sql
  - data/dbt/models/marts/occurrences.sql
  - data/dbt/models/marts/counties_geo.sql
  - data/dbt/models/marts/ecoregions_geo.sql
  - .planning/research/dbt-spike-findings.md
autonomous: true
requirements: [SCAFFOLD-02, PORT-01, PORT-02, PORT-03, PORT-04]
tags: [dbt, marts, geojson, spatial, findings, spike]

must_haves:
  truths:
    - "`bash data/dbt/run.sh build` exits 0 from a clean local checkout against `beeatlas.duckdb`, exercising the slice end-to-end (closes SCAFFOLD-02)"
    - "After `dbt build`, `data/dbt/target/sandbox/occurrences.parquet`, `data/dbt/target/sandbox/counties.geojson`, `data/dbt/target/sandbox/ecoregions.geojson` ALL exist (closes PORT-03)"
    - "`marts/occurrences.sql` contains BOTH `ST_Within` AND `ST_Distance ... ORDER BY ... LIMIT 1` (closes PORT-02 grep gates V-PORT-02a + V-PORT-02b)"
    - "`occurrences.parquet` has 0 rows with NULL county and 0 rows with NULL ecoregion_l3 (mirrors `export.py:266-277` invariant)"
    - "Both GeoJSON FeatureCollections have `type=FeatureCollection`, non-empty features, and the property naming matches `export.py`: counties use `NAME`, ecoregions use `NA_L3NAME`"
    - "`.planning/research/dbt-spike-findings.md` exists with `## Slice Choice` section + slice-rationale paragraph + the GDAL-vs-handrolled-FeatureCollection trade-off note (closes PORT-04 seed)"
    - "`data/dbt/run.sh ls --resource-type model` lists ≥ 23 models total (11 staging + 9 intermediate + 3 marts)"
  artifacts:
    - path: "data/dbt/macros/emit_feature_collection.sql"
      provides: "shared dbt macro that takes (model_relation, property_name, out_path) and runs `COPY (SELECT json_object(...)) TO '...' (FORMAT JSON, ARRAY false, COMPRESSION uncompressed)`"
      min_lines: 12
    - path: "data/dbt/models/marts/occurrences.sql"
      provides: "external parquet mart with inline spatial-join CTEs (`with_county`/`county_fallback`/`final_county`, `with_eco`/`eco_dedup`/`eco_fallback`/`final_eco`) mirroring export.py:199-263"
      contains: "ST_Within"
    - path: "data/dbt/models/marts/counties_geo.sql"
      provides: "table mart + post-hook calling emit_feature_collection(this, 'NAME', 'target/sandbox/counties.geojson')"
    - path: "data/dbt/models/marts/ecoregions_geo.sql"
      provides: "table mart + post-hook calling emit_feature_collection(this, 'NA_L3NAME', 'target/sandbox/ecoregions.geojson')"
    - path: "data/dbt/target/sandbox/occurrences.parquet"
      provides: "the slice's main parquet output (sandbox path — NOT public/data/)"
    - path: "data/dbt/target/sandbox/counties.geojson"
      provides: "WA counties FeatureCollection with NAME property"
      contains: "FeatureCollection"
    - path: "data/dbt/target/sandbox/ecoregions.geojson"
      provides: "WA ecoregions FeatureCollection with NA_L3NAME property"
      contains: "FeatureCollection"
    - path: ".planning/research/dbt-spike-findings.md"
      provides: "PORT-04 seed: slice-choice rationale + GDAL trade-off note; body fleshed out in Phase 84"
      contains: "## Slice Choice"
  key_links:
    - from: "data/dbt/models/marts/occurrences.sql"
      to: "data/dbt/models/intermediate/int_combined.sql, stg_geo__us_counties, stg_geo__ecoregions"
      via: "{{ ref('int_combined') }} + {{ ref('stg_geo__us_counties') }} + {{ ref('stg_geo__ecoregions') }}"
      pattern: "ref\\('int_combined'\\)"
    - from: "data/dbt/models/marts/counties_geo.sql + ecoregions_geo.sql"
      to: "data/dbt/macros/emit_feature_collection.sql"
      via: "post_hook=[emit_feature_collection(this, '<property>', '<path>')]"
      pattern: "emit_feature_collection\\(this,"
    - from: "data/dbt/models/marts/occurrences.sql config()"
      to: "data/dbt/target/sandbox/occurrences.parquet"
      via: "materialized='external' + location='target/sandbox/occurrences.parquet' + format='parquet'"
      pattern: "materialized='external'.*location='target/sandbox/occurrences\\.parquet'"
---

<objective>
Land the three mart models + the shared GeoJSON serializer macro, seed the findings doc, and prove the end-to-end slice green. After this plan, `bash data/dbt/run.sh build` exits 0 on a fresh shell, the three sandbox outputs exist, and the spatial-join semantics from `export.py:199-262` are byte-faithfully expressed in the marts/occurrences SQL. This plan closes SCAFFOLD-02 (full-slice green build), PORT-01 (final layer of the DAG), PORT-02 (spatial-join semantics), PORT-03 (sandbox output path), and PORT-04 (findings seed).

Purpose: This is the wave where the DAG produces files. Plans 01-03 stood up scaffolding and the upstream layers; Plan 04 attaches them to dbt's `external` materialization + the post-hook macro that emits the two GeoJSON FeatureCollections. The spatial-join CTE structure stays inside `marts/occurrences.sql` (per RESEARCH "Anti-Patterns to Avoid" line 504-507 — don't split spatial joins into a separate model; they need `int_combined`'s `_row_id` semantics). The findings doc gets seeded with the slice-choice paragraph + the GDAL trade-off note copied verbatim from RESEARCH lines 472-479 (PORT-04 body is Phase 84 work).

Output: 3 mart SQL files + 1 macro + 3 sandbox artifacts + 1 findings seed doc. End-to-end `dbt build` green.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/083-scaffold-slice-port/083-CONTEXT.md
@.planning/phases/083-scaffold-slice-port/083-RESEARCH.md
@.planning/phases/083-scaffold-slice-port/083-PATTERNS.md
@.planning/phases/083-scaffold-slice-port/083-VALIDATION.md
@.planning/phases/083-scaffold-slice-port/083-01-SUMMARY.md
@.planning/phases/083-scaffold-slice-port/083-02-SUMMARY.md
@.planning/phases/083-scaffold-slice-port/083-03-SUMMARY.md
@data/export.py
@data/tests/test_dbt_scaffold.py

<interfaces>
Canonical mart + macro code lives in 083-RESEARCH.md:
- Pattern 4 (external parquet mart `marts/occurrences.sql`, lines 376-416) + the PORT-02 constraint list (lines 418-423)
- Pattern 5 (`emit_feature_collection` macro + `counties_geo.sql` + `ecoregions_geo.sql`, lines 427-469)
- Trade-off note (lines 472-479) to copy into the findings seed

Source SQL line ranges:
- `marts/occurrences.sql` body translates `export.py:199-263` (joined, occ_pt, with_county, county_fallback, final_county, with_eco, eco_dedup, eco_fallback, final_eco, final SELECT)
- `counties_geo.sql` translates `export.py:280-296` (NAME property, ST_AsGeoJSON + ST_SimplifyPreserveTopology, FeatureCollection assembly via Python)
- `ecoregions_geo.sql` translates `export.py:297-314` (NA_L3NAME property)

Macro signature (RESEARCH Pattern 5 lines 427-443):
`{% macro emit_feature_collection(model_relation, property_name, out_path) %}` — body is a `COPY (SELECT json_object('type','FeatureCollection','features',(SELECT to_json(list({'type':'Feature','properties':{property_name: name},'geometry':ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.001))::JSON})) FROM {{ model_relation }})) AS doc) TO '{{ out_path }}' (FORMAT JSON, ARRAY false, COMPRESSION uncompressed)`.

Mart config for occurrences (RESEARCH Pattern 4 lines 379-384):
`{{ config(materialized='external', location='target/sandbox/occurrences.parquet', format='parquet', options={'CODEC': "'SNAPPY'"}) }}`. Assumption A5 (RESEARCH line 796) — if `CODEC` is the wrong option key (DuckDB sometimes uses `compression`), the first `dbt build` will reveal the correct key; fix in place. Compressed parquet is preferred but not strictly required for the spike — uncompressed is acceptable if the codec syntax is uncooperative.

Mart config for the two geo marts (RESEARCH Pattern 5 lines 448-454, 462-468):
`{{ config(materialized='table', schema='dbt_sandbox', post_hook=[emit_feature_collection(this, '<NAME|NA_L3NAME>', 'target/sandbox/<counties|ecoregions>.geojson')]) }}`.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create the emit_feature_collection macro + the two geo marts (counties_geo.sql, ecoregions_geo.sql) and run them</name>
  <files>data/dbt/macros/emit_feature_collection.sql, data/dbt/models/marts/counties_geo.sql, data/dbt/models/marts/ecoregions_geo.sql</files>
  <read_first>
    - data/export.py lines 280-314 (the two GeoJSON exporters being ported)
    - .planning/phases/083-scaffold-slice-port/083-RESEARCH.md Pattern 5 (lines 427-469) — canonical macro + post-hook example
    - .planning/phases/083-scaffold-slice-port/083-RESEARCH.md Pitfall 6 (lines 608-614) — json extension autoload
    - .planning/phases/083-scaffold-slice-port/083-PATTERNS.md lines 245-265 (mart pattern assignments)
  </read_first>
  <action>
    **`data/dbt/macros/emit_feature_collection.sql`** — Copy Pattern 5 (RESEARCH lines 427-443) verbatim, with the Jinja signature `{% macro emit_feature_collection(model_relation, property_name, out_path) %}`. The body wraps a `COPY (...) TO '{{ out_path }}' (FORMAT JSON, ARRAY false, COMPRESSION uncompressed)` with the inner SELECT building one FeatureCollection JSON object via `json_object('type', 'FeatureCollection', 'features', (SELECT to_json(list({'type': 'Feature', 'properties': { '<property_name>': name }, 'geometry': ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.001))::JSON })) FROM {{ model_relation }}))`. Simplification tolerance `0.001` matches `export.py:284, 301`. The property-key construction needs Jinja interpolation — follow RESEARCH lines 434-437 verbatim (the `{{ "{" }} {{ "'" ~ property_name ~ "'" }}: name {{ "}" }}` escape pattern).

    **`data/dbt/models/marts/counties_geo.sql`** — Copy Pattern 5 lines 446-457. Config: `materialized='table'`, `schema='dbt_sandbox'`, `post_hook=[emit_feature_collection(this, 'NAME', 'target/sandbox/counties.geojson')]`. Body: `SELECT county AS name, geom FROM {{ ref('stg_geo__us_counties') }}` — the `county` column comes from the alias in Plan 02 Task 1's `stg_geo__us_counties.sql`. The macro's inner expression references `name` as the geometry property source, so the SELECT must alias `county` back to `name` (or the planner can alias inside the SELECT — either works as long as the macro's `name` reference resolves to the property string).

    **`data/dbt/models/marts/ecoregions_geo.sql`** — Same shape as counties_geo. Config: `post_hook=[emit_feature_collection(this, 'NA_L3NAME', 'target/sandbox/ecoregions.geojson')]`. Body: `SELECT ecoregion_l3 AS name, geom FROM {{ ref('stg_geo__ecoregions') }}`.

    After authoring, run `bash data/dbt/run.sh build --select counties_geo ecoregions_geo`. dbt will (1) materialize each model as a table in `dbt_sandbox`, (2) run the post-hook which COPYs the FeatureCollection JSON to the target/sandbox path. If `to_json` errors with "function does not exist" (Pitfall 6 / Assumption A2), revisit Plan 01 Task 4 and confirm `json` is in the `extensions:` list of `profiles.yml`. If `ST_AsGeoJSON(...)::JSON` errors on the `::JSON` cast, fall back to `CAST(ST_AsGeoJSON(...) AS JSON)` (same semantics, more portable).

    Smoke-check both GeoJSON outputs: `jq '.type, (.features | length)' data/dbt/target/sandbox/counties.geojson` must print `"FeatureCollection"` and a count ≥ 30 (WA has 39 counties — VALIDATION manual-only note line 84). Same for `ecoregions.geojson`. Spot-check property names: `jq -r '.features[0].properties | keys[]' data/dbt/target/sandbox/counties.geojson` must print `NAME`; same for ecoregions must print `NA_L3NAME`.
  </action>
  <verify>
    <automated>bash data/dbt/run.sh build --select counties_geo ecoregions_geo 2>&1 | tail -5 | grep -iE 'completed|done|success|2 of 2'</automated>
    <automated>test -f data/dbt/target/sandbox/counties.geojson && test -f data/dbt/target/sandbox/ecoregions.geojson</automated>
    <automated>jq -e '.type == "FeatureCollection" and (.features | length) >= 30' data/dbt/target/sandbox/counties.geojson</automated>
    <automated>jq -e '.type == "FeatureCollection" and (.features | length) >= 1' data/dbt/target/sandbox/ecoregions.geojson</automated>
    <automated>jq -e '.features[0].properties | has("NAME")' data/dbt/target/sandbox/counties.geojson</automated>
    <automated>jq -e '.features[0].properties | has("NA_L3NAME")' data/dbt/target/sandbox/ecoregions.geojson</automated>
  </verify>
  <done>
    Macro file exists. Both geo mart SQL files exist with `post_hook=[emit_feature_collection(...)]`. After `dbt build`, both GeoJSON files exist under `data/dbt/target/sandbox/`. Counties has ≥ 30 features with `NAME` property; ecoregions has ≥ 1 feature with `NA_L3NAME` property. Both are valid `FeatureCollection` JSON.
  </done>
  <acceptance_criteria>
    - Macro is invoked from both geo marts via `post_hook`
    - V-PORT-03 partial pass: both geojson files exist at sandbox path
    - GeoJSON property names: counties=`NAME`, ecoregions=`NA_L3NAME` (matches `export.py:289, 309`)
    - Simplification tolerance `0.001` preserved
    - Both files parse as valid JSON with `.type == "FeatureCollection"`
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Create marts/occurrences.sql with the inline spatial-join CTEs</name>
  <files>data/dbt/models/marts/occurrences.sql</files>
  <read_first>
    - data/export.py lines 199-263 (the full spatial-join section: joined, occ_pt, with_county, county_fallback, final_county, with_eco, eco_dedup, eco_fallback, final_eco, final SELECT) — this is the source-of-truth for the SQL body
    - data/export.py lines 246-261 (the final SELECT with 30+ columns) — proves the column projection that the parquet output must contain
    - .planning/phases/083-scaffold-slice-port/083-RESEARCH.md Pattern 4 (lines 376-423) — canonical mart with the PORT-02 invariant list at lines 418-423
    - .planning/phases/083-scaffold-slice-port/083-RESEARCH.md Pitfall 3 (lines 575-584) — relative location only
    - .planning/phases/083-scaffold-slice-port/083-RESEARCH.md Assumption A5 + A6 (lines 796-797)
  </read_first>
  <action>
    Author `data/dbt/models/marts/occurrences.sql` translating `export.py:199-263` verbatim. The model is the slice's terminal node; once built, it produces `data/dbt/target/sandbox/occurrences.parquet`.

    Config block (RESEARCH Pattern 4 lines 379-384):
    ```
    {{ config(
        materialized='external',
        location='target/sandbox/occurrences.parquet',
        format='parquet',
        options={'CODEC': "'SNAPPY'"}
    ) }}
    ```
    If the `CODEC` option key errors at first run (Assumption A5), drop the `options=` line entirely (uncompressed parquet is fine for the spike) or try `options={'compression': "'SNAPPY'"}`. Document the resolution in the task commit message.

    SQL body — translate `export.py:199-263` directly with the following substitutions:
    - The outer `WITH` chain starts with `joined AS (SELECT ROW_NUMBER() OVER () AS _row_id, * FROM {{ ref('int_combined') }})` — replaces `export.py:200`'s reference to the inline `combined` CTE
    - `wa_counties AS (SELECT * FROM {{ ref('stg_geo__us_counties') }})` and `wa_eco AS (SELECT * FROM {{ ref('stg_geo__ecoregions') }})` — these two CTEs are needed because the spatial-join CTEs (`with_county`, `eco_fallback`, etc.) reference them by name
    - Keep `occ_pt`, `with_county`, `county_fallback`, `final_county`, `with_eco`, `eco_dedup`, `eco_fallback`, `final_eco` as inline CTEs verbatim from `export.py:203-244`
    - PORT-02 invariants (RESEARCH lines 418-423) — preserve EXACTLY:
      - `_row_id = ROW_NUMBER() OVER ()` over `int_combined` (NOT an existing key)
      - `eco_dedup` uses `DISTINCT ON (_row_id)` — DuckDB-specific. If it errors at execution (Assumption A6), fall back to `(SELECT _row_id, ecoregion_l3 FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY _row_id ORDER BY _row_id) AS rn FROM with_eco) WHERE rn = 1)` — semantically identical
      - `county_fallback` and `eco_fallback` use correlated `(SELECT <col> FROM wa_<x> ORDER BY ST_Distance(geom, (SELECT pt FROM occ_pt o2 WHERE o2._row_id = <outer>._row_id)) LIMIT 1)` subqueries — preserve the correlated-subquery shape verbatim
    - The final SELECT (`export.py:246-261`) projects ~32 columns from `joined j` plus `fc.county` and `fe.ecoregion_l3` from `final_county fc JOIN final_eco fe` on `_row_id = j._row_id`. Preserve the column ordering exactly — Phase 84's DIFF-01 row/schema diff against `export.py` outputs needs byte-faithful column order.
    - The `WHERE` and parquet-specific bits (`export.py:262`'s `COPY (...) TO '{out}' (FORMAT PARQUET, CODEC 'SNAPPY')`) are NOT in the SQL body — dbt's `materialized='external'` config handles those.

    The spatial-join CTEs and the final SELECT live INSIDE this single mart model (RESEARCH "Anti-Patterns to Avoid" line 504-507 — don't split spatial joins into a separate model; they need `int_combined`'s `_row_id` semantics).

    After authoring, run `bash data/dbt/run.sh build --select occurrences`. The model will read `int_combined` (Plan 03 Task 3 made it a TABLE), perform the spatial joins, and write `data/dbt/target/sandbox/occurrences.parquet`. Smoke-check via the pytest scaffold from Plan 01: `uv run --project data pytest data/tests/test_dbt_scaffold.py::test_occurrences_has_rows_and_zero_null_county_or_eco -x` must now pass (it was skipif-skipped at Plan 01 close because the parquet didn't exist). This single pytest enforces `export.py:266-277`'s row > 0 + 0 null county + 0 null ecoregion invariants — the load-bearing PORT-02 behavioral check.
  </action>
  <verify>
    <automated>bash data/dbt/run.sh build --select occurrences 2>&1 | tail -5 | grep -iE 'completed|done|success|1 of 1'</automated>
    <automated>test -f data/dbt/target/sandbox/occurrences.parquet</automated>
    <automated>grep -qE 'ST_Within' data/dbt/models/marts/occurrences.sql</automated>
    <automated>grep -qE 'ST_Distance.*ORDER BY.*LIMIT 1' data/dbt/models/marts/occurrences.sql</automated>
    <automated>grep -qE "ref\('int_combined'\)" data/dbt/models/marts/occurrences.sql</automated>
    <automated>grep -qE "materialized='external'" data/dbt/models/marts/occurrences.sql && grep -qE "location='target/sandbox/occurrences\\.parquet'" data/dbt/models/marts/occurrences.sql</automated>
    <automated>uv run --project data pytest data/tests/test_dbt_scaffold.py::test_occurrences_has_rows_and_zero_null_county_or_eco -x</automated>
  </verify>
  <done>
    `occurrences.sql` exists with the full spatial-join body translated from `export.py:199-263`. `data/dbt/target/sandbox/occurrences.parquet` exists with > 0 rows and 0 null county / 0 null ecoregion. Both V-PORT-02a and V-PORT-02b grep gates pass. The pytest invariant test passes (mirrors `export.py:266-277`).
  </done>
  <acceptance_criteria>
    - V-PORT-02a passes: `ST_Within` present in `marts/occurrences.sql`
    - V-PORT-02b passes: `ST_Distance ... ORDER BY ... LIMIT 1` present (the nearest-polygon fallback)
    - V-PORT-03 fully passes: `data/dbt/target/sandbox/occurrences.parquet` exists
    - `ROW_NUMBER() OVER ()` for `_row_id` preserved (per PORT-02 invariant)
    - `DISTINCT ON (_row_id)` preserved in `eco_dedup` (or A6 fallback applied and noted)
    - Correlated `(SELECT ... ORDER BY ST_Distance LIMIT 1)` subqueries preserved verbatim
    - `test_occurrences_has_rows_and_zero_null_county_or_eco` pytest passes (0 null county, 0 null eco — load-bearing PORT-02 behavioral check)
    - Spatial joins live INSIDE `occurrences.sql`, not in a separate model (per RESEARCH Anti-Pattern)
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: Seed findings doc + run full-slice green build + final V-PORT-01 / V-SCAFFOLD-02 acceptance</name>
  <files>.planning/research/dbt-spike-findings.md</files>
  <read_first>
    - .planning/phases/083-scaffold-slice-port/083-CONTEXT.md decisions block (lines 43-95 — slice scope, samples.parquet discrepancy from REQUIREMENTS.md, GDAL-vs-handrolled trade-off)
    - .planning/phases/083-scaffold-slice-port/083-RESEARCH.md lines 472-479 (GDAL trade-off note — copy verbatim into findings)
    - .planning/phases/083-scaffold-slice-port/083-VALIDATION.md "Standard validation commands" table (lines 51-65 — reuse V-PORT-01 / V-PORT-04)
  </read_first>
  <action>
    Create `.planning/research/dbt-spike-findings.md` as a seed doc. PORT-04 only requires the file exists with the slice-choice rationale paragraph — the BODY (FIND-01..05) is Phase 84 work and MUST NOT be pre-empted here (RESEARCH lines 113-114, CONTEXT lines 99-104).

    Required sections in the seed:
    - H1 title: `# dbt Spike — Findings`
    - `## Status` — one sentence: "Seeded by Phase 83; body to be filled by Phase 84 (TEST/DIFF/PART/FIND requirements)."
    - `## Slice Choice` — one paragraph naming the slice (`export.py` → `occurrences.parquet` + `counties.geojson` + `ecoregions.geojson`) and the rationale verbatim from CONTEXT lines 28-29 (slice covers spatial joins, FOJ, regex extractions, OFV joins, multi-source UNION — maximal learning surface) + the discrepancy note from CONTEXT line 47 (REQUIREMENTS.md says `ecdysis.parquet` + `samples.parquet`; reality is one `occurrences.parquet` because `export.py` folds samples into the FOJ — flagged for FIND-01 in Phase 84)
    - `## Open Trade-Offs (for Phase 84)` — copy verbatim the GDAL-vs-handrolled FeatureCollection trade-off from RESEARCH lines 472-479. Wording: "DuckDB's spatial extension offers a GDAL-driven single-call FeatureCollection emission (`COPY <tbl> TO '...geojson' (FORMAT GDAL, DRIVER 'GeoJSON')`) which is simpler but adds extra fields (`crs`, optional `id`, optional `bbox`) that `export.py` doesn't produce. For minimum diff with `export.py` (Phase 84 PORT-02/DIFF-01), the hand-rolled `to_json`/`list` approach is preferred. Re-evaluate after diff results."
    - `## Phase 84 To-Do` — empty placeholder bullet list ("- [ ] TEST-01..03", "- [ ] DIFF-01..03", "- [ ] PART-01..02", "- [ ] FIND-01..03") — these are the Phase 84 requirement IDs from REQUIREMENTS.md lines 73-86; the body content is Phase 84's job

    Do NOT write any FIND-01..03 body content. The "what worked / what was awkward" prose belongs to Phase 84.

    After writing, run the full slice green-build check:
    1. `bash data/dbt/run.sh clean` (clears `target/` to simulate a "clean local checkout" per SCAFFOLD-02 criterion 1)
    2. `bash data/dbt/run.sh build` from a fresh shell — must exit 0 with all 23 models (11 staging + 9 intermediate + 3 marts) built
    3. `bash data/dbt/tests/scaffold_assert.sh` — must exit 0
    4. `uv run --project data pytest data/tests/test_dbt_scaffold.py -x` — ALL 6 tests must now pass (the 4 previously-skipif tests now have the parquet/geojson files to read)
    5. V-SCAFFOLD-03a final check: `git grep -E 'data/dbt' -- data/run.py data/nightly.sh .github/workflows/` must return empty (production-surface isolation invariant)
    6. V-PORT-01 final check: `bash data/dbt/run.sh ls --resource-type model` must list ≥ 23 models (the count is the planner's hard-floor; the actual count may be 23 exactly)
    7. V-PORT-04 final check: `test -f .planning/research/dbt-spike-findings.md && grep -E '## Slice Choice' .planning/research/dbt-spike-findings.md`
  </action>
  <verify>
    <automated>bash data/dbt/run.sh clean && bash data/dbt/run.sh build 2>&1 | tail -5 | grep -iE 'completed.*success|done|23 of 23'</automated>
    <automated>bash data/dbt/tests/scaffold_assert.sh</automated>
    <automated>uv run --project data pytest data/tests/test_dbt_scaffold.py -x</automated>
    <automated>! git grep -E 'data/dbt' -- data/run.py data/nightly.sh .github/workflows/ 2>/dev/null</automated>
    <automated>bash data/dbt/run.sh ls --resource-type model 2>&1 | grep -cE '^beeatlas\.' | awk '{ exit ($1 >= 23 ? 0 : 1) }'</automated>
    <automated>test -f .planning/research/dbt-spike-findings.md && grep -qE '^## Slice Choice' .planning/research/dbt-spike-findings.md</automated>
    <automated>test -f data/dbt/target/sandbox/occurrences.parquet && test -f data/dbt/target/sandbox/counties.geojson && test -f data/dbt/target/sandbox/ecoregions.geojson</automated>
  </verify>
  <done>
    Findings doc exists with required sections (Status, Slice Choice, Open Trade-Offs, Phase 84 To-Do) — no FIND-01..03 body content (those are Phase 84's). `dbt clean && dbt build` exits 0 on a fresh shell with 23 of 23 models built. The three sandbox files exist. All 6 pytest tests in `test_dbt_scaffold.py` pass. `git grep 'data/dbt'` against forbidden paths is empty. `dbt ls --resource-type model` reports ≥ 23 models.
  </done>
  <acceptance_criteria>
    - V-SCAFFOLD-01 fully passes: `bash data/dbt/run.sh build` exits 0 from clean checkout
    - V-SCAFFOLD-03a passes
    - V-SCAFFOLD-03b passes (verified earlier; re-checked via scaffold_assert.sh)
    - V-PORT-01 passes: ≥ 23 models in `dbt ls --resource-type model`
    - V-PORT-02a + V-PORT-02b pass (verified in Task 2; re-checked here via full build green)
    - V-PORT-03 fully passes: all 3 sandbox files exist after `dbt build`
    - V-PORT-04 passes: findings doc seeded with `## Slice Choice`
    - `data/tests/test_dbt_scaffold.py` all 6 tests pass (no skipif)
    - Findings doc contains NO body content for FIND-01..03 (Phase 84 boundary respected)
  </acceptance_criteria>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| dbt mart `occurrences.sql` → DuckDB spatial extension | Uses `ST_Within`, `ST_Distance`, `ST_Point`, `ST_AsGeoJSON`, `ST_SimplifyPreserveTopology`; all bundled with `duckdb>=1.4`, no network call |
| dbt geo marts → filesystem at `data/dbt/target/sandbox/` | Post-hook `COPY ... TO '<relative-path>'` resolves under dbt's working dir; relative paths only per Pitfall 3 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-83-09 | Information disclosure | `materialized='external'` writes outside `target/sandbox/` if `location` is absolute (Pitfall 3) | mitigate | Acceptance criteria pin `location='target/sandbox/occurrences.parquet'` (relative); verify-step lists files post-build to catch path drift |
| T-83-10 | Tampering | post-hook `COPY ... TO '...'` overwrites an existing GeoJSON outside the sandbox if a developer modifies the macro carelessly | accept | Spike scope; the only invocation sites are the two geo marts and both use sandbox-relative paths; Phase 84's diff script will surface any path drift |
| T-83-11 | Tampering | DuckDB `DISTINCT ON` semantics drift from `export.py` (A6) | mitigate | Verify pytest mirrors `export.py:266-277` invariants (0 null county, 0 null eco); if `DISTINCT ON` errors, fall back to `ROW_NUMBER() OVER (PARTITION BY ...)` pattern noted in Task 2 action |

</threat_model>

<verification>
End-to-end phase acceptance (all must pass for Phase 83 sign-off):

1. `bash data/dbt/run.sh clean && bash data/dbt/run.sh build` exits 0 from a fresh shell (closes SCAFFOLD-02)
2. `data/dbt/target/sandbox/occurrences.parquet`, `data/dbt/target/sandbox/counties.geojson`, `data/dbt/target/sandbox/ecoregions.geojson` all exist (closes PORT-03)
3. `bash data/dbt/run.sh ls --resource-type model` lists ≥ 23 models (closes PORT-01)
4. `grep -E 'ST_Within|ST_Distance.*ORDER BY.*LIMIT 1' data/dbt/models/marts/occurrences.sql` matches both (closes PORT-02)
5. `uv run --project data pytest data/tests/test_dbt_scaffold.py -x` passes all 6 tests (closes PORT-02 behaviorally — 0 null county + 0 null eco)
6. `.planning/research/dbt-spike-findings.md` exists with `## Slice Choice` section + GDAL trade-off note (closes PORT-04)
7. `! git grep -E 'data/dbt' -- data/run.py data/nightly.sh .github/workflows/` returns empty (re-confirms SCAFFOLD-03)
8. `bash data/dbt/tests/scaffold_assert.sh` exits 0
</verification>

<success_criteria>
- SCAFFOLD-02 ✅ FULL (build green from clean checkout)
- PORT-01 ✅ FULL (DAG complete with staging + intermediate + marts; `source()` + `ref()` declarations match `export.py` I/O shape)
- PORT-02 ✅ FULL (`ST_Within` + `ST_Distance ORDER BY LIMIT 1` both present in marts/occurrences.sql; behavioral invariant 0 null county / 0 null eco verified)
- PORT-03 ✅ FULL (all 3 sandbox files materialize at `data/dbt/target/sandbox/`)
- PORT-04 ✅ FULL (findings doc seeded with slice rationale + GDAL trade-off note; body deferred to Phase 84 per CONTEXT line 99)
- Phase 83 must_haves all observable per the verification table above
</success_criteria>

<output>
After completion, create `.planning/phases/083-scaffold-slice-port/083-04-SUMMARY.md` capturing:
- Full-slice `dbt build` runtime (rough number — informs Phase 84's PART-01 baseline)
- Final model count breakdown (staging / intermediate / marts)
- Any A5 (CODEC syntax) or A6 (`DISTINCT ON`) fallback applied
- `occurrences.parquet` row count + file size (informs Phase 84 DIFF-01 baseline)
- counties.geojson + ecoregions.geojson feature counts (counties should be 39)
- Any noted deviations from `export.py`'s SQL to flag for FIND-01 in Phase 84

After the SUMMARY exists, Phase 83 is complete — handoff to Phase 84 (`/gsd-plan-phase 84` will pick up the seeded findings doc and the working DAG).
</output>
