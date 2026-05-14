---
phase: 083
plan: 02
type: execute
wave: 1
depends_on: [083-01]
files_modified:
  - data/dbt/models/staging/stg_ecdysis__occurrences.sql
  - data/dbt/models/staging/stg_ecdysis__identifications.sql
  - data/dbt/models/staging/stg_ecdysis__occurrence_links.sql
  - data/dbt/models/staging/stg_inat__observations.sql
  - data/dbt/models/staging/stg_inat__ofvs.sql
  - data/dbt/models/staging/stg_waba__observations.sql
  - data/dbt/models/staging/stg_waba__ofvs.sql
  - data/dbt/models/staging/stg_waba__taxon_lineage.sql
  - data/dbt/models/staging/stg_geo__us_counties.sql
  - data/dbt/models/staging/stg_geo__us_states.sql
  - data/dbt/models/staging/stg_geo__ecoregions.sql
autonomous: true
requirements: [PORT-01]
tags: [dbt, staging, port, spike]

must_haves:
  truths:
    - "Each of the four raw schemas in `beeatlas.duckdb` has at least one staging model wrapping its tables via `{{ source(...) }}`"
    - "Staging models use ONLY `{{ source(...) }}` (no `{{ ref(...) }}`) — staging is the source boundary"
    - "`bash data/dbt/run.sh build --select staging` exits 0 and creates ~11 views in the `dbt_sandbox` schema of `beeatlas.duckdb`"
    - "`stg_ecdysis__occurrences` preserves `export.py:84`'s NULL-filter (`WHERE o.decimal_latitude IS NOT NULL AND o.decimal_latitude != ''`)"
    - "`stg_geo__us_counties` preserves `export.py:31`'s WA filter (`state_fips = '53'`)"
    - "`stg_geo__ecoregions` preserves `export.py:36-39`'s WA-intersection filter (`ST_Intersects(...)` against `us_states WHERE abbreviation = 'WA'`)"
  artifacts:
    - path: "data/dbt/models/staging/stg_ecdysis__occurrences.sql"
      provides: "thin SELECT over source('ecdysis_data', 'occurrences') with the lat-NULL filter and column aliases that downstream intermediates depend on"
    - path: "data/dbt/models/staging/stg_ecdysis__identifications.sql"
      provides: "SELECT over source('ecdysis_data', 'identifications') — needed by int_id_modified"
    - path: "data/dbt/models/staging/stg_ecdysis__occurrence_links.sql"
      provides: "SELECT over source('ecdysis_data', 'occurrence_links') — needed by int_ecdysis_base"
    - path: "data/dbt/models/staging/stg_inat__observations.sql"
      provides: "SELECT over source('inaturalist_data', 'observations') — needed by int_ecdysis_base (inat_host) and int_samples_base"
    - path: "data/dbt/models/staging/stg_inat__ofvs.sql"
      provides: "SELECT over source('inaturalist_data', 'observations__ofvs') — needed by int_samples_base for specimen_count + sample_id OFVs"
    - path: "data/dbt/models/staging/stg_waba__observations.sql"
      provides: "SELECT over source('inaturalist_waba_data', 'observations') — needed by int_waba_link, int_specimen_obs_base, int_provisional_waba_ids"
    - path: "data/dbt/models/staging/stg_waba__ofvs.sql"
      provides: "SELECT over source('inaturalist_waba_data', 'observations__ofvs') — needed by int_waba_link and the provisional-arm ofv1718 join"
    - path: "data/dbt/models/staging/stg_waba__taxon_lineage.sql"
      provides: "SELECT over source('inaturalist_waba_data', 'taxon_lineage') — needed by int_specimen_obs_base"
    - path: "data/dbt/models/staging/stg_geo__us_counties.sql"
      provides: "WA-filtered counties with `county` alias + `geom` geometry — needed by the marts/occurrences spatial join AND marts/counties_geo"
      contains: "state_fips = '53'"
    - path: "data/dbt/models/staging/stg_geo__us_states.sql"
      provides: "thin SELECT over source('geographies', 'us_states') — used by stg_geo__ecoregions WA-intersection subquery"
    - path: "data/dbt/models/staging/stg_geo__ecoregions.sql"
      provides: "WA-intersecting ecoregions with `ecoregion_l3` alias + `geom` geometry — needed by marts/occurrences spatial join AND marts/ecoregions_geo"
      contains: "ST_Intersects"
  key_links:
    - from: "every stg_*.sql"
      to: "sources.yml declarations"
      via: "{{ source('<schema>', '<table>') }}"
      pattern: "\\{\\{\\s*source\\("
    - from: "stg_geo__ecoregions.sql"
      to: "stg_geo__us_states.sql via the WA-intersection subquery"
      via: "ST_Intersects(geom, (SELECT geom FROM {{ ref('stg_geo__us_states') }} WHERE abbreviation = 'WA'))"
      pattern: "ref\\('stg_geo__us_states'\\)"
---

<objective>
Author the ~11 staging models that wrap the raw schemas in `data/beeatlas.duckdb` as `{{ source(...) }}` SELECTs with the renaming, typing, and NULL/WA filters that mirror `data/export.py`'s line-23-105 CTE preamble. Each model is materialized as a view in `dbt_sandbox`. After this plan, `dbt build --select staging` exits 0 and the intermediate layer (Plan 03) has its inputs.

Purpose: Pin down the source boundary of the DAG. Phase 84's TEST-01 (generic tests on staging keys) needs staging models to exist as named relations. PORT-01 needs `{{ source() }}` declarations to appear in the DAG. The WA filter for ecoregions/counties must move to staging (not the marts) so the spatial-join surface in `occurrences.sql` matches `export.py`'s shape exactly.

Output: 11 SQL files under `data/dbt/models/staging/`, each a single SELECT statement with `{{ config(materialized='view') }}` inherited from `dbt_project.yml` (the per-layer default — no explicit override needed). After `dbt build --select staging`, 11 views exist in `dbt_sandbox` schema of `beeatlas.duckdb`.
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
@data/export.py

<interfaces>
Source SQL CTE → dbt staging model mapping (from 083-RESEARCH.md "CTE-to-model mapping" table, lines 667-686):

| `export.py` CTE / line | dbt staging model | Source it wraps |
|------------------------|------------------|----------------|
| `wa_counties` (line 28) | `stg_geo__us_counties` | `source('geographies', 'us_counties')` — WA-filtered with `state_fips = '53'` |
| `wa_eco` (line 33) | `stg_geo__ecoregions` | `source('geographies', 'ecoregions')` — WA-intersected via `ST_Intersects` against `stg_geo__us_states` |
| (line 38) | `stg_geo__us_states` | `source('geographies', 'us_states')` — thin |
| line 79-84 (occurrences side of `ecdysis_base`) | `stg_ecdysis__occurrences` | `source('ecdysis_data', 'occurrences')` — with lat-NULL filter |
| line 43 (`identifications`) | `stg_ecdysis__identifications` | `source('ecdysis_data', 'identifications')` |
| line 80 (`occurrence_links`) | `stg_ecdysis__occurrence_links` | `source('ecdysis_data', 'occurrence_links')` |
| line 81 (`inat host` join) + line 97 (`samples_base`) | `stg_inat__observations` | `source('inaturalist_data', 'observations')` |
| line 98-101 (specimen_count + sample_id OFVs) | `stg_inat__ofvs` | `source('inaturalist_data', 'observations__ofvs')` |
| line 50 + line 116 (waba) | `stg_waba__observations` | `source('inaturalist_waba_data', 'observations')` |
| line 51 + line 193 (waba OFVs incl. ofv1718) | `stg_waba__ofvs` | `source('inaturalist_waba_data', 'observations__ofvs')` |
| line 117 (`taxon_lineage`) | `stg_waba__taxon_lineage` | `source('inaturalist_waba_data', 'taxon_lineage')` |

Canonical staging shape (RESEARCH lines 646-658, `stg_geo__ecoregions.sql`):
```
{{ config(materialized='view') }}
SELECT
  name AS ecoregion_l3,
  geom
FROM {{ source('geographies', 'ecoregions') }}
WHERE ST_Intersects(
  geom,
  (SELECT geom FROM {{ source('geographies', 'us_states') }} WHERE abbreviation = 'WA')
)
```

Assumption A3 (RESEARCH line 794): if Phase 47 migrations have backfilled the native `geom GEOMETRY` column on `geographies.*`, use `geom` directly. Otherwise use `ST_GeomFromText(geometry_wkt)` like `export.py` does. VERIFY at execution: `bash data/dbt/run.sh run-operation run_query --args '{sql: "DESCRIBE geographies.us_counties"}' 2>&1 | grep -E "^geom\s"`.

Column-name contract for `stg_ecdysis__occurrences`: downstream `int_ecdysis_base` (Plan 03) expects columns NAMED to match `export.py:58-78`'s `ecdysis_base` projection: `id`, `catalog_number`, `decimal_longitude`, `decimal_latitude`, `event_date`, `year`, `month`, `scientific_name`, `recorded_by`, `field_number`, `genus`, `family`, `associated_taxa`, `modified`, `minimum_elevation_in_meters`, `canonical_name`, `occurrence_id`. The staging model can pass them through unchanged (rename happens in `int_ecdysis_base`) — keep this layer as thin as possible. Only the WHERE filter is load-bearing.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Verify native geom column availability (A3 resolution), then author the three `stg_geo__*` staging models</name>
  <files>data/dbt/models/staging/stg_geo__us_counties.sql, data/dbt/models/staging/stg_geo__us_states.sql, data/dbt/models/staging/stg_geo__ecoregions.sql</files>
  <read_first>
    - data/export.py lines 28-39 (wa_counties + wa_eco CTEs verbatim)
    - data/export.py lines 282-307 (counties_geojson + ecoregions_geojson — proves the property naming `NAME` / `NA_L3NAME` is added at the marts layer, NOT staging)
    - .planning/phases/083-scaffold-slice-port/083-RESEARCH.md lines 646-665 (canonical staging excerpt + A3 verification command)
    - .planning/phases/083-scaffold-slice-port/083-PATTERNS.md lines 209-218 (staging materialization + A3 fallback note)
  </read_first>
  <action>
    First resolve Assumption A3: run `bash data/dbt/run.sh run-operation run_query --args '{sql: "DESCRIBE geographies.us_counties"}' 2>&1 | grep -E "^geom\s|geometry_wkt"`. If a `geom GEOMETRY` column is present, the staging layer uses `geom` directly (cleaner; matches Phase 47 backfill). If only `geometry_wkt` is present, use `ST_GeomFromText(geometry_wkt) AS geom` in the SELECT (matches `export.py` verbatim). Record the chosen branch in this task's commit message.

    **`stg_geo__us_counties.sql`** — SELECT `name AS county` and the geom column (per A3 branch) from `{{ source('geographies', 'us_counties') }}` WHERE `state_fips = '53'`. Mirrors `export.py:28-32`. Output columns: `county` (renamed from `name`), `geom`. The `NAME` property used by `counties_geo` mart (Plan 04) is added at that layer, not here.

    **`stg_geo__us_states.sql`** — SELECT `abbreviation`, `name`, and the geom column from `{{ source('geographies', 'us_states') }}`. No filter at this layer (the WA filter is a subquery from `stg_geo__ecoregions`). Output columns: `abbreviation`, `name`, `geom`.

    **`stg_geo__ecoregions.sql`** — Copy the RESEARCH canonical pattern (lines 646-658) verbatim BUT change the inner subquery's source to `{{ ref('stg_geo__us_states') }}` (per the key_link in this plan's frontmatter — keep all cross-staging references via `ref()`, never `source()` in the dependent staging model). Output columns: `ecoregion_l3` (renamed from `name`), `geom`. Mirrors `export.py:33-40`.

    After authoring, run `bash data/dbt/run.sh build --select stg_geo__*` — all three must materialize as views in `dbt_sandbox`. Then sanity-query: `bash data/dbt/run.sh run-operation run_query --args '{sql: "SELECT COUNT(*) FROM dbt_sandbox.stg_geo__us_counties"}'` must return 39 (WA county count from VALIDATION.md manual-only note).
  </action>
  <verify>
    <automated>bash data/dbt/run.sh build --select stg_geo__us_counties stg_geo__us_states stg_geo__ecoregions 2>&1 | tail -5 | grep -iE 'completed|done|success|3 of 3'</automated>
    <automated>grep -qE "state_fips\s*=\s*'53'" data/dbt/models/staging/stg_geo__us_counties.sql</automated>
    <automated>grep -qE 'ST_Intersects' data/dbt/models/staging/stg_geo__ecoregions.sql && grep -qE "ref\('stg_geo__us_states'\)" data/dbt/models/staging/stg_geo__ecoregions.sql</automated>
  </verify>
  <done>
    Three SQL files exist with the WA-county filter, the WA-intersection filter, and the `stg_geo__us_states` `ref()` link in place. `dbt build --select stg_geo__*` completes 3 of 3. WA county count = 39.
  </done>
  <acceptance_criteria>
    - `state_fips = '53'` literal preserved in counties staging (matches `export.py:31`)
    - `ST_Intersects(...)` preserved in ecoregions staging (matches `export.py:36-39`)
    - `stg_geo__ecoregions` references `stg_geo__us_states` via `{{ ref(...) }}` (cross-staging links use `ref`, not raw `source`)
    - A3 branch (native `geom` vs `ST_GeomFromText`) recorded in commit message
    - Three views exist in `dbt_sandbox`
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Author the three `stg_ecdysis__*` staging models</name>
  <files>data/dbt/models/staging/stg_ecdysis__occurrences.sql, data/dbt/models/staging/stg_ecdysis__identifications.sql, data/dbt/models/staging/stg_ecdysis__occurrence_links.sql</files>
  <read_first>
    - data/export.py lines 41-44 (id_modified CTE — proves `identifications` only needs `coreid` + `modified`)
    - data/export.py lines 79-84 (ecdysis_base SELECT + WHERE clause — the lat-NULL filter is load-bearing)
    - data/export.py lines 80-82 (LEFT JOIN to occurrence_links + inat — proves `occurrence_links.occurrence_id` and `host_observation_id` columns are needed)
    - .planning/phases/083-scaffold-slice-port/083-RESEARCH.md "CTE-to-model mapping" table (lines 667-686)
  </read_first>
  <action>
    Each is a thin SELECT over its source — rename/typing happens in Plan 03's `int_ecdysis_base`. The exception is the `WHERE` clause on `stg_ecdysis__occurrences`, which moves up from `export.py:84` to staging so downstream intermediates see only valid-lat rows.

    **`stg_ecdysis__occurrences.sql`** — SELECT * (or the explicit column list from `export.py:59-78` — planner's choice; SELECT * is faster to author and DuckDB's view-of-source pattern handles it fine) FROM `{{ source('ecdysis_data', 'occurrences') }}` WHERE `decimal_latitude IS NOT NULL AND decimal_latitude != ''`. The latter filter mirrors `export.py:84` verbatim and is load-bearing (without it, `stg_ecdysis__occurrences` would feed NULL-lat rows into the FOJ and break the spatial join in Plan 04).

    **`stg_ecdysis__identifications.sql`** — SELECT `coreid`, `modified` FROM `{{ source('ecdysis_data', 'identifications') }}`. The narrower projection matches what `int_id_modified` (Plan 03) actually needs (`export.py:42-44`); broader projection is fine too.

    **`stg_ecdysis__occurrence_links.sql`** — SELECT * (or at minimum `occurrence_id`, `host_observation_id`) FROM `{{ source('ecdysis_data', 'occurrence_links') }}`. Used by `int_ecdysis_base` for the LEFT JOIN at `export.py:80`.

    After authoring, run `bash data/dbt/run.sh build --select stg_ecdysis__*`.
  </action>
  <verify>
    <automated>bash data/dbt/run.sh build --select stg_ecdysis__occurrences stg_ecdysis__identifications stg_ecdysis__occurrence_links 2>&1 | tail -5 | grep -iE 'completed|done|success|3 of 3'</automated>
    <automated>grep -qE "decimal_latitude\s+IS NOT NULL\s+AND\s+decimal_latitude\s*!=\s*''" data/dbt/models/staging/stg_ecdysis__occurrences.sql</automated>
    <automated>grep -qE "source\('ecdysis_data',\s*'occurrences'\)" data/dbt/models/staging/stg_ecdysis__occurrences.sql</automated>
  </verify>
  <done>
    Three views exist in `dbt_sandbox` schema. The lat-NULL filter is preserved verbatim from `export.py:84` in `stg_ecdysis__occurrences`. All three reference `{{ source('ecdysis_data', ...) }}`.
  </done>
  <acceptance_criteria>
    - Lat-NULL filter present verbatim in `stg_ecdysis__occurrences`
    - All three use `{{ source('ecdysis_data', ...) }}` (no `ref()`)
    - `dbt build --select stg_ecdysis__*` completes 3 of 3
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: Author the five `stg_inat__*` + `stg_waba__*` staging models</name>
  <files>data/dbt/models/staging/stg_inat__observations.sql, data/dbt/models/staging/stg_inat__ofvs.sql, data/dbt/models/staging/stg_waba__observations.sql, data/dbt/models/staging/stg_waba__ofvs.sql, data/dbt/models/staging/stg_waba__taxon_lineage.sql</files>
  <read_first>
    - data/export.py lines 46-55 (waba_link CTE — uses waba.observations + observations__ofvs with field_id=18116)
    - data/export.py lines 86-103 (samples_base CTE — uses inat.observations + observations__ofvs with field_id=8338 (specimen_count) and field_id=9963 (sample_id))
    - data/export.py lines 104-119 (specimen_obs_base CTE — uses waba.observations + waba.taxon_lineage joined on `taxon_id`)
    - data/export.py lines 191-197 (provisional arm ofv1718 — uses waba.observations__ofvs with field_id=1718)
    - data/export.py lines 73, 81, 96 (inat.observations columns: id, user__login, observed_on, longitude, latitude, taxon__name, taxon__iconic_taxon_name, quality_grade, _dlt_id)
    - .planning/phases/083-scaffold-slice-port/083-RESEARCH.md "CTE-to-model mapping" lines 667-686
  </read_first>
  <action>
    All five are thin `SELECT * FROM {{ source(...) }}` wrappers (or explicit column lists if the planner prefers narrower projections — but the OFV tables in particular need `_dlt_root_id`, `_dlt_id`, `field_id`, `value` which intermediate models will filter by `field_id`).

    **`stg_inat__observations.sql`** — wraps `{{ source('inaturalist_data', 'observations') }}`. Used by `int_ecdysis_base` (for `inat_host` / `inat_quality_grade` via LEFT JOIN on `links.host_observation_id`) and `int_samples_base` (the FOJ sample side).

    **`stg_inat__ofvs.sql`** — wraps `{{ source('inaturalist_data', 'observations__ofvs') }}`. No filter at this layer — the per-field_id filtering happens in `int_samples_base` (field_id=8338 for count; field_id=9963 for sample_id).

    **`stg_waba__observations.sql`** — wraps `{{ source('inaturalist_waba_data', 'observations') }}`. Used by `int_waba_link`, `int_specimen_obs_base`, `int_provisional_waba_ids`.

    **`stg_waba__ofvs.sql`** — wraps `{{ source('inaturalist_waba_data', 'observations__ofvs') }}`. Used by `int_waba_link` (filter field_id=18116) and the ARM-2 provisional join (filter field_id=1718).

    **`stg_waba__taxon_lineage.sql`** — wraps `{{ source('inaturalist_waba_data', 'taxon_lineage') }}`. Used by `int_specimen_obs_base` joined on `taxon_id`.

    After authoring, run `bash data/dbt/run.sh build --select stg_inat__* stg_waba__*` — five must materialize as views. Then run `bash data/dbt/run.sh build --select staging` for the full layer green check.
  </action>
  <verify>
    <automated>bash data/dbt/run.sh build --select staging 2>&1 | tail -5 | grep -iE 'completed|done|success|11 of 11'</automated>
    <automated>ls data/dbt/models/staging/*.sql | wc -l | grep -E '^[[:space:]]*11$'</automated>
    <automated>bash data/dbt/run.sh ls --resource-type model --select staging 2>&1 | grep -c stg_ | grep -E '^11$'</automated>
  </verify>
  <done>
    All 11 staging SQL files exist. `dbt build --select staging` completes 11 of 11. `dbt ls --resource-type model --select staging` reports 11 models. The full DAG (so far) is staging only — Plan 03 adds intermediates next.
  </done>
  <acceptance_criteria>
    - 11 SQL files exist under `data/dbt/models/staging/`
    - Each uses `{{ source(...) }}` (no `ref()` from a non-staging layer; the only cross-staging `ref()` allowed is the one from Task 1 — `stg_geo__ecoregions` → `stg_geo__us_states`)
    - `dbt build --select staging` completes 11 of 11
    - `dbt ls --resource-type model --select staging` reports exactly 11 models
  </acceptance_criteria>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| dbt staging models → raw schemas in `beeatlas.duckdb` | Read-only via `{{ source(...) }}`; no string interpolation of untrusted values (Jinja escapes SQL identifiers) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-83-05 | Tampering | accidental writes to source schemas (`ecdysis_data`, `inaturalist_data`, etc.) | accept | dbt-duckdb materializes views in `dbt_sandbox` schema only (per profiles.yml `schema: dbt_sandbox`); source schemas are read-only by convention. No write paths in staging SELECTs. |
| T-83-06 | Information disclosure | raw `_dlt_*` columns surfaced in staging views | accept | Local-only spike; `_dlt_id` / `_dlt_root_id` are internal dlt loader keys, not PII. Narrower projections optional but not required. |

</threat_model>

<verification>
After all 3 tasks:
1. `bash data/dbt/run.sh build --select staging` exits 0 with 11/11 models built.
2. `bash data/dbt/run.sh ls --resource-type model --select staging` lists 11 models.
3. `data/dbt/models/staging/` contains exactly 11 `.sql` files.
4. Spot-check via `bash data/dbt/run.sh run-operation run_query --args '{sql: "SELECT COUNT(*) FROM dbt_sandbox.stg_geo__us_counties"}'` returns 39.
</verification>

<success_criteria>
- PORT-01 ✅ (partial — staging layer of the DAG present, `{{ source() }}` declarations match the four schemas in CONTEXT lines 60-71; intermediate + marts layers complete the DAG in Plans 03-04)
- All 11 staging models exist, build green, and preserve `export.py`'s upstream filters.
</success_criteria>

<output>
After completion, create `.planning/phases/083-scaffold-slice-port/083-02-SUMMARY.md` capturing: A3 resolution (native `geom` vs `ST_GeomFromText`), any deviation from `export.py` filters, full-layer build time, and the row count of `stg_geo__us_counties` (sanity check against the expected 39).
</output>
