---
phase: 083
plan: 03
type: execute
wave: 2
depends_on: [083-02]
files_modified:
  - data/dbt/models/intermediate/int_id_modified.sql
  - data/dbt/models/intermediate/int_waba_link.sql
  - data/dbt/models/intermediate/int_ecdysis_catalog_suffixes.sql
  - data/dbt/models/intermediate/int_matched_waba_ids.sql
  - data/dbt/models/intermediate/int_provisional_waba_ids.sql
  - data/dbt/models/intermediate/int_ecdysis_base.sql
  - data/dbt/models/intermediate/int_samples_base.sql
  - data/dbt/models/intermediate/int_specimen_obs_base.sql
  - data/dbt/models/intermediate/int_combined.sql
autonomous: true
requirements: [PORT-01]
tags: [dbt, intermediate, port, spike]

must_haves:
  truths:
    - "Each `export.py` mid-CTE (lines 41-197) has a 1:1 dbt intermediate model"
    - "All intermediate models reference upstream layers ONLY via `{{ ref(...) }}` (no `{{ source(...) }}` calls in this layer)"
    - "`int_combined` materializes as a TABLE (overriding the default view) per RESEARCH Pitfall 5, to avoid re-evaluating the UNION ALL inside the marts spatial join"
    - "`int_combined` produces both arms of the UNION ALL: ARM 1 (FOJ ecdysis × samples + LEFT JOIN specimen_obs) and ARM 2 (provisional WABA via ofv1718)"
    - "`bash data/dbt/run.sh build --select staging+intermediate` exits 0 and `int_combined` row count is > 0"
  artifacts:
    - path: "data/dbt/models/intermediate/int_id_modified.sql"
      provides: "MAX(modified) per coreid from stg_ecdysis__identifications — matches export.py:41-44"
    - path: "data/dbt/models/intermediate/int_waba_link.sql"
      provides: "catalog_suffix → MIN(waba.id) via waba ofvs field_id=18116 — matches export.py:46-55"
      contains: "field_id = 18116"
    - path: "data/dbt/models/intermediate/int_ecdysis_catalog_suffixes.sql"
      provides: "DISTINCT catalog suffix BIGINTs from ecdysis occurrences — matches export.py:120-124"
    - path: "data/dbt/models/intermediate/int_matched_waba_ids.sql"
      provides: "waba_obs_ids matched via catalog_suffix ↔ ecdysis_catalog_suffixes — matches export.py:125-129"
    - path: "data/dbt/models/intermediate/int_provisional_waba_ids.sql"
      provides: "waba_obs_ids with NO catalog match — matches export.py:130-134"
    - path: "data/dbt/models/intermediate/int_ecdysis_base.sql"
      provides: "ecdysis_base projection from export.py:57-85: 21 columns including ecdysis_id, recordedBy, floralHost regexp, modified, specimen_observation_id, canonical_name"
    - path: "data/dbt/models/intermediate/int_samples_base.sql"
      provides: "samples_base projection from export.py:86-103: observation_id, host_inat_login, sample_date, specimen_count via field_id=8338, sample_id via field_id=9963, sample_host"
      contains: "field_id = 8338"
    - path: "data/dbt/models/intermediate/int_specimen_obs_base.sql"
      provides: "waba observations + taxon_lineage from export.py:104-119"
    - path: "data/dbt/models/intermediate/int_combined.sql"
      provides: "UNION ALL of ARM 1 (ecdysis FOJ samples LEFT JOIN specimen_obs) + ARM 2 (provisional waba) from export.py:135-197; materialized=table (Pitfall 5 override)"
      contains: "UNION ALL"
  key_links:
    - from: "int_combined.sql"
      to: "int_ecdysis_base, int_samples_base, int_specimen_obs_base, int_provisional_waba_ids, stg_waba__ofvs (for ofv1718)"
      via: "FULL OUTER JOIN (ARM 1) and JOIN (ARM 2)"
      pattern: "FULL OUTER JOIN.*UNION ALL"
    - from: "int_combined.sql"
      to: "dbt_project.yml's intermediate.int_combined: +materialized: table override"
      via: "model-level config inherited from dbt_project.yml"
      pattern: "int_combined"
---

<objective>
Author the 9 intermediate models that mirror `export.py`'s mid-CTEs (lines 41-197) as views (default), with `int_combined` overridden to `table` per RESEARCH Pitfall 5. Each model references upstream models via `{{ ref(...) }}` only. After this plan, `dbt build --select staging+intermediate` exits 0 and `int_combined` is the table that the marts spatial join (Plan 04) will scan against.

Purpose: Translate the join/derivation backbone of `export.py` into named dbt nodes so Phase 84's generic tests (TEST-01: `not_null` on `int_id_modified.coreid`, `unique` on `int_waba_link.catalog_suffix`, `relationships` from `int_combined.host_observation_id` to `int_samples_base.observation_id`) have something to attach to. Also: deep granularity is what makes PART-01 (partial runs across subgraphs) meaningful in Phase 84.

Output: 9 SQL files under `data/dbt/models/intermediate/`. 8 are views in `dbt_sandbox`; `int_combined` is a table.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/083-scaffold-slice-port/083-CONTEXT.md
@.planning/phases/083-scaffold-slice-port/083-RESEARCH.md
@.planning/phases/083-scaffold-slice-port/083-PATTERNS.md
@.planning/phases/083-scaffold-slice-port/083-01-SUMMARY.md
@.planning/phases/083-scaffold-slice-port/083-02-SUMMARY.md
@data/export.py

<interfaces>
CTE → intermediate model map (from 083-RESEARCH.md "CTE-to-model mapping" lines 667-686):

| `export.py` CTE / line range | dbt model | Upstream refs |
|------------------------------|-----------|---------------|
| `id_modified` (41-44) | `int_id_modified` | `stg_ecdysis__identifications` |
| `waba_link` (46-55) | `int_waba_link` | `stg_waba__observations`, `stg_waba__ofvs` (filter field_id=18116) |
| `ecdysis_base` (57-85) | `int_ecdysis_base` | `stg_ecdysis__occurrences`, `stg_ecdysis__occurrence_links`, `stg_inat__observations`, `int_id_modified`, `int_waba_link` |
| `samples_base` (86-103) | `int_samples_base` | `stg_inat__observations`, `stg_inat__ofvs` (twice — field_id=8338 and field_id=9963) |
| `specimen_obs_base` (104-119) | `int_specimen_obs_base` | `stg_waba__observations`, `stg_waba__taxon_lineage` |
| `ecdysis_catalog_suffixes` (120-124) | `int_ecdysis_catalog_suffixes` | `stg_ecdysis__occurrences` (already lat-filtered) |
| `matched_waba_ids` (125-129) | `int_matched_waba_ids` | `int_waba_link`, `int_ecdysis_catalog_suffixes` |
| `provisional_waba_ids` (130-134) | `int_provisional_waba_ids` | `stg_waba__observations`, `int_matched_waba_ids` |
| `combined` (135-197) | `int_combined` | `int_ecdysis_base`, `int_samples_base`, `int_specimen_obs_base`, `int_provisional_waba_ids`, `stg_waba__ofvs` (ofv1718 LEFT JOIN in ARM 2) |

Key constraints from RESEARCH (lines 418-423) for the combined model:
- Both UNION ALL arms must preserve column count and ordering — ARM 1 fields followed by ARM 2 fields in the same projection order (export.py:137-156 vs 165-190). The `is_provisional` column is `FALSE` in ARM 1, `TRUE` in ARM 2.
- ARM 2's `host_observation_id` is derived from `regexp_extract(ofv1718.value, '([0-9]+)$', 1) CAST AS BIGINT` (export.py:176, 196).
- ARM 2's `sample_*` fields come from a LEFT JOIN to `int_samples_base` on the regex-extracted host_observation_id (export.py:195-196).
- `WHERE sob.longitude IS NOT NULL AND sob.latitude IS NOT NULL` filter at the bottom of ARM 2 (export.py:197) is load-bearing.
- ARM 1's `FULL OUTER JOIN samples_base s ON e.host_observation_id = s.observation_id` (export.py:158) is the FOJ that yields sample-only rows.

`int_combined` materialization override: dbt_project.yml from Plan 01 should already have `intermediate.int_combined: +materialized: table`. If not, set the config inline via `{{ config(materialized='table') }}` in this model's SQL.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Author the 5 small derivation models (id_modified, waba_link, ecdysis_catalog_suffixes, matched_waba_ids, provisional_waba_ids)</name>
  <files>data/dbt/models/intermediate/int_id_modified.sql, data/dbt/models/intermediate/int_waba_link.sql, data/dbt/models/intermediate/int_ecdysis_catalog_suffixes.sql, data/dbt/models/intermediate/int_matched_waba_ids.sql, data/dbt/models/intermediate/int_provisional_waba_ids.sql</files>
  <read_first>
    - data/export.py lines 41-55 (id_modified + waba_link)
    - data/export.py lines 120-134 (ecdysis_catalog_suffixes + matched_waba_ids + provisional_waba_ids)
  </read_first>
  <action>
    Each is a single SELECT translating its CTE to a `ref()`-based query. Materialization is view (default from `dbt_project.yml`).

    **`int_id_modified.sql`** — `SELECT coreid, MAX(modified) AS max_id_modified FROM {{ ref('stg_ecdysis__identifications') }} GROUP BY coreid`. Mirrors `export.py:41-44`.

    **`int_waba_link.sql`** — Reproduce `export.py:46-55` against `{{ ref('stg_waba__observations') }}` (aliased `waba`) JOIN `{{ ref('stg_waba__ofvs') }}` (aliased `ofv`) ON `ofv._dlt_root_id = waba._dlt_id AND ofv.field_id = 18116 AND ofv.value != ''`. Output columns: `catalog_suffix BIGINT` (from `CAST(ofv.value AS BIGINT)`), `specimen_observation_id BIGINT` (from `MIN(waba.id)`). GROUP BY `catalog_suffix`.

    **`int_ecdysis_catalog_suffixes.sql`** — Mirrors `export.py:120-124`. `SELECT DISTINCT CAST(regexp_extract(catalog_number, '[0-9]+$', 0) AS BIGINT) AS catalog_suffix FROM {{ ref('stg_ecdysis__occurrences') }}`. NOTE: the original CTE has `WHERE o.decimal_latitude IS NOT NULL AND o.decimal_latitude != ''` (line 123) — but `stg_ecdysis__occurrences` already applies that filter, so it can be omitted here. Document the simplification in the commit (it's not a deviation — just removed redundancy).

    **`int_matched_waba_ids.sql`** — Mirrors `export.py:125-129`. `SELECT wl.specimen_observation_id AS waba_obs_id FROM {{ ref('int_waba_link') }} wl JOIN {{ ref('int_ecdysis_catalog_suffixes') }} ecs ON ecs.catalog_suffix = wl.catalog_suffix`.

    **`int_provisional_waba_ids.sql`** — Mirrors `export.py:130-134`. `SELECT id AS waba_obs_id FROM {{ ref('stg_waba__observations') }} WHERE id NOT IN (SELECT waba_obs_id FROM {{ ref('int_matched_waba_ids') }})`.

    Run `bash data/dbt/run.sh build --select int_id_modified int_waba_link int_ecdysis_catalog_suffixes int_matched_waba_ids int_provisional_waba_ids`.
  </action>
  <verify>
    <automated>bash data/dbt/run.sh build --select int_id_modified int_waba_link int_ecdysis_catalog_suffixes int_matched_waba_ids int_provisional_waba_ids 2>&1 | tail -5 | grep -iE 'completed|done|success|5 of 5'</automated>
    <automated>grep -qE 'field_id\s*=\s*18116' data/dbt/models/intermediate/int_waba_link.sql</automated>
    <automated>grep -qE "regexp_extract\(catalog_number,\s*'\[0-9\]\+\$',\s*0\)" data/dbt/models/intermediate/int_ecdysis_catalog_suffixes.sql</automated>
  </verify>
  <done>
    5 view materializations exist in `dbt_sandbox`. Each translates its source CTE verbatim with `ref()`s replacing the source schema references. The `field_id = 18116` literal is preserved in `int_waba_link`. The regex pattern in `int_ecdysis_catalog_suffixes` matches `export.py:121` byte-for-byte.
  </done>
  <acceptance_criteria>
    - 5 SQL files exist; all use only `{{ ref(...) }}` (no `source()`)
    - `field_id = 18116` preserved in `int_waba_link`
    - regex literal preserved in `int_ecdysis_catalog_suffixes`
    - `dbt build` completes 5 of 5
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Author the three base-projection models (int_ecdysis_base, int_samples_base, int_specimen_obs_base)</name>
  <files>data/dbt/models/intermediate/int_ecdysis_base.sql, data/dbt/models/intermediate/int_samples_base.sql, data/dbt/models/intermediate/int_specimen_obs_base.sql</files>
  <read_first>
    - data/export.py lines 57-119 (the three base CTEs verbatim)
  </read_first>
  <action>
    Each model is a direct port of one CTE. All column aliases, type casts, regex extractions, and CASE expressions are preserved byte-for-byte from `export.py` — these projections are the contract that `int_combined` (Task 3) depends on.

    **`int_ecdysis_base.sql`** — Mirrors `export.py:57-85` exactly:
    - FROM `{{ ref('stg_ecdysis__occurrences') }} o`
    - LEFT JOIN `{{ ref('stg_ecdysis__occurrence_links') }} links ON links.occurrence_id = o.occurrence_id`
    - LEFT JOIN `{{ ref('stg_inat__observations') }} inat ON inat.id = links.host_observation_id`
    - LEFT JOIN `{{ ref('int_id_modified') }} im ON im.coreid = o.id`
    - LEFT JOIN `{{ ref('int_waba_link') }} wl ON wl.catalog_suffix = CAST(regexp_extract(o.catalog_number, '[0-9]+$', 0) AS BIGINT)`
    - SELECT projection: 21 columns named ecdysis_id, catalog_number, ecdysis_lon, ecdysis_lat, ecdysis_date, year, month, scientificName, recordedBy, fieldNumber, genus, family, floralHost (the regexp_extract NULLIF expression from line 71), host_observation_id, inat_host (the CASE WHEN Plantae expression from line 73), inat_quality_grade, modified (the strftime+GREATEST expression from line 75), specimen_observation_id, elevation_m (the TRY_CAST NULLIF expression from line 77), canonical_name
    - The `WHERE o.decimal_latitude IS NOT NULL AND o.decimal_latitude != ''` filter at line 84 is already applied by `stg_ecdysis__occurrences`; omit it here

    **`int_samples_base.sql`** — Mirrors `export.py:86-103` exactly:
    - FROM `{{ ref('stg_inat__observations') }} op`
    - JOIN `{{ ref('stg_inat__ofvs') }} sc ON sc._dlt_root_id = op._dlt_id AND sc.field_id = 8338 AND sc.value != ''`
    - LEFT JOIN `{{ ref('stg_inat__ofvs') }} sid ON sid._dlt_root_id = op._dlt_id AND sid.field_id = 9963`
    - SELECT projection: observation_id (op.id), host_inat_login (op.user__login), sample_date (CAST observed_on AS VARCHAR), sample_date_raw (observed_on raw), sample_lon (longitude), sample_lat (latitude), specimen_count (CAST sc.value AS INTEGER), sample_id (TRY_CAST sid.value AS INTEGER), sample_host (the CASE WHEN Plantae expression from line 96)
    - WHERE `op.longitude IS NOT NULL AND op.latitude IS NOT NULL` (line 102)

    **`int_specimen_obs_base.sql`** — Mirrors `export.py:104-119` exactly:
    - FROM `{{ ref('stg_waba__observations') }} waba`
    - LEFT JOIN `{{ ref('stg_waba__taxon_lineage') }} tl ON tl.taxon_id = waba.taxon__id`
    - SELECT projection: waba_obs_id (waba.id), waba_dlt_id (waba._dlt_id), specimen_inat_login (waba.user__login), specimen_inat_taxon_name (waba.taxon__name), longitude, latitude, observed_on, quality_grade, specimen_inat_genus (tl.genus), specimen_inat_family (tl.family)

    Run `bash data/dbt/run.sh build --select int_ecdysis_base int_samples_base int_specimen_obs_base`.
  </action>
  <verify>
    <automated>bash data/dbt/run.sh build --select int_ecdysis_base int_samples_base int_specimen_obs_base 2>&1 | tail -5 | grep -iE 'completed|done|success|3 of 3'</automated>
    <automated>grep -qE 'field_id\s*=\s*8338' data/dbt/models/intermediate/int_samples_base.sql && grep -qE 'field_id\s*=\s*9963' data/dbt/models/intermediate/int_samples_base.sql</automated>
    <automated>grep -qE 'taxon_id\s*=\s*waba\.taxon__id' data/dbt/models/intermediate/int_specimen_obs_base.sql</automated>
    <automated>grep -cE '^\s*ecdysis_id|^\s*catalog_number|^\s*scientificName|^\s*recordedBy|^\s*fieldNumber|^\s*canonical_name' data/dbt/models/intermediate/int_ecdysis_base.sql | grep -E '^[6-9]|^[1-9][0-9]'</automated>
  </verify>
  <done>
    Three views exist in `dbt_sandbox`. Column aliases match `export.py`'s `ecdysis_base`, `samples_base`, `specimen_obs_base` projections byte-for-byte. `field_id = 8338` and `field_id = 9963` literals preserved in `int_samples_base`. The `taxon_id = waba.taxon__id` join condition preserved in `int_specimen_obs_base`.
  </done>
  <acceptance_criteria>
    - `int_ecdysis_base` projection has all 21 columns from `export.py:58-78`
    - `int_samples_base` projection has all 9 columns from `export.py:87-96`
    - `int_specimen_obs_base` projection has all 10 columns from `export.py:105-115`
    - All `field_id` literals preserved (8338, 9963; 18116 is in Task 1's `int_waba_link`)
    - `dbt build` completes 3 of 3
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: Author int_combined (UNION ALL of both arms, materialized=table)</name>
  <files>data/dbt/models/intermediate/int_combined.sql</files>
  <read_first>
    - data/export.py lines 135-197 (the full `combined` CTE — both UNION ALL arms)
    - .planning/phases/083-scaffold-slice-port/083-RESEARCH.md Pitfall 5 (lines 595-606)
  </read_first>
  <action>
    Translate `export.py:135-197` directly. The model has two UNION ALL arms; both must produce the same column count and ordering. Materialization is `table` — either inherited from `dbt_project.yml`'s `intermediate.int_combined: +materialized: table` override (set in Plan 01 Task 4) or via inline `{{ config(materialized='table') }}` at the top of the file (defensive; harmless if the project-level override is also present).

    **ARM 1** (mirrors `export.py:137-159`):
    - FROM `{{ ref('int_ecdysis_base') }} e`
    - FULL OUTER JOIN `{{ ref('int_samples_base') }} s ON e.host_observation_id = s.observation_id` (line 158 — the FOJ that yields sample-only rows)
    - LEFT JOIN `{{ ref('int_specimen_obs_base') }} sob ON sob.waba_obs_id = e.specimen_observation_id`
    - SELECT projection: 35 columns matching `export.py:137-156` exactly. Key fields with COALESCE/CASE logic that MUST be preserved:
      - `lon: COALESCE(e.ecdysis_lon, s.sample_lon)`
      - `lat: COALESCE(e.ecdysis_lat, s.sample_lat)`
      - `date: COALESCE(e.ecdysis_date, s.sample_date)`
      - `year: COALESCE(e.year, YEAR(s.sample_date_raw))`
      - `month: COALESCE(e.month, MONTH(s.sample_date_raw))`
      - `specimen_inat_quality_grade: sob.quality_grade AS specimen_inat_quality_grade`
      - `is_provisional: FALSE AS is_provisional`

    **UNION ALL**

    **ARM 2** (mirrors `export.py:163-197`):
    - FROM `{{ ref('int_provisional_waba_ids') }} p`
    - JOIN `{{ ref('int_specimen_obs_base') }} sob ON sob.waba_obs_id = p.waba_obs_id`
    - LEFT JOIN `{{ ref('stg_waba__ofvs') }} ofv1718 ON ofv1718._dlt_root_id = sob.waba_dlt_id AND ofv1718.field_id = 1718` (line 193-194 — `waba_dlt_id` is the column passed through from `int_specimen_obs_base`)
    - LEFT JOIN `{{ ref('int_samples_base') }} s ON s.observation_id = CAST(regexp_extract(ofv1718.value, '([0-9]+)$', 1) AS BIGINT)` (line 195-196)
    - SELECT projection: same 35 column names/ordering as ARM 1. Provisional-specific fields:
      - `ecdysis_id: NULL AS ecdysis_id`
      - `catalog_number: NULL AS catalog_number`
      - `lon: sob.longitude AS lon`, `lat: sob.latitude AS lat`
      - `date: CAST(sob.observed_on AS VARCHAR) AS date`
      - `year: YEAR(sob.observed_on) AS year`, `month: MONTH(sob.observed_on) AS month`
      - `host_observation_id: CAST(regexp_extract(ofv1718.value, '([0-9]+)$', 1) AS BIGINT) AS host_observation_id`
      - `inat_quality_grade: sob.quality_grade AS inat_quality_grade` (NOTE the duplication — `sob.quality_grade` appears as both `inat_quality_grade` AND `specimen_inat_quality_grade` in ARM 2 per export.py:178+188; preserve verbatim)
      - `specimen_observation_id: sob.waba_obs_id AS specimen_observation_id`
      - `is_provisional: TRUE AS is_provisional`
      - `canonical_name: NULL AS canonical_name`
    - WHERE `sob.longitude IS NOT NULL AND sob.latitude IS NOT NULL` (line 197)

    Both arms produce columns in this order (matching export.py:137-156 and 165-190): `ecdysis_id, catalog_number, lon, lat, date, year, month, scientificName, recordedBy, fieldNumber, genus, family, floralHost, host_observation_id, inat_host, inat_quality_grade, modified, specimen_observation_id, elevation_m, observation_id, host_inat_login, specimen_count, sample_id, sample_host, specimen_inat_login, specimen_inat_taxon_name, specimen_inat_genus, specimen_inat_family, specimen_inat_quality_grade, is_provisional, canonical_name`. The marts/occurrences model (Plan 04) depends on this exact column set.

    Run `bash data/dbt/run.sh build --select int_combined` (this also rebuilds upstream models as needed). Then verify materialization is `table`: `bash data/dbt/run.sh run-operation run_query --args "{sql: \"SELECT table_type FROM information_schema.tables WHERE table_schema='dbt_sandbox' AND table_name='int_combined'\"}"` must show BASE TABLE (or whatever DuckDB reports for tables; the key is it's NOT VIEW). Row-count sanity: `SELECT COUNT(*) FROM dbt_sandbox.int_combined` > 0.
  </action>
  <verify>
    <automated>bash data/dbt/run.sh build --select staging+intermediate 2>&1 | tail -10 | grep -iE 'completed|done|success|20 of 20|9 of 9'</automated>
    <automated>grep -qE 'UNION ALL' data/dbt/models/intermediate/int_combined.sql</automated>
    <automated>grep -qE 'FULL OUTER JOIN' data/dbt/models/intermediate/int_combined.sql</automated>
    <automated>grep -qE 'field_id\s*=\s*1718' data/dbt/models/intermediate/int_combined.sql</automated>
    <automated>grep -qE 'FALSE AS is_provisional' data/dbt/models/intermediate/int_combined.sql && grep -qE 'TRUE AS is_provisional' data/dbt/models/intermediate/int_combined.sql</automated>
  </verify>
  <done>
    `int_combined` exists as a TABLE in `dbt_sandbox` (not a view). The full staging+intermediate DAG builds green (20 models total: 11 staging + 9 intermediate). UNION ALL with both arms is present. ARM 1 has `FALSE AS is_provisional` and FULL OUTER JOIN to `int_samples_base`. ARM 2 has `TRUE AS is_provisional` and `field_id = 1718` for the ofv1718 LEFT JOIN. Row count > 0.
  </done>
  <acceptance_criteria>
    - `int_combined` materialized as a TABLE (not view) — query `information_schema.tables`
    - UNION ALL between two arms
    - ARM 1 has `FULL OUTER JOIN` on `host_observation_id = observation_id`
    - ARM 2 has `field_id = 1718` for ofv1718
    - Both arms produce 31 (or 35 depending on planner's column-count) identically-named identically-ordered columns
    - `dbt build --select staging+intermediate` completes 20 of 20
    - V-PORT-01 partial pass: `dbt ls --resource-type model` lists 11 staging + 9 intermediate models so far (3 marts come in Plan 04)
  </acceptance_criteria>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| intermediate models → staging views | Read-only via `{{ ref(...) }}`; no external input |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-83-07 | Tampering | `int_combined` view-vs-table misconfiguration causes the marts spatial join to re-evaluate the UNION ALL on every plan call | mitigate | Verify materialization is TABLE via `information_schema.tables` query in Task 3 verify step. RESEARCH Pitfall 5 (warning sign: dbt build takes >30s on first slice) is the alarm signal. |
| T-83-08 | Tampering | column-name drift between `int_*_base` projections and the marts `occurrences.sql` consumer | mitigate | Marts model (Plan 04) reads `int_combined`'s exact column set; Plan 04 Task 1 will fail loudly via DuckDB column-binding errors if drift occurs |

</threat_model>

<verification>
After all 3 tasks:
1. `bash data/dbt/run.sh build --select staging+intermediate` exits 0 with 20 of 20 (11 staging + 9 intermediate) models built.
2. `bash data/dbt/run.sh ls --resource-type model --select intermediate` lists 9 models.
3. `int_combined` is materialized as a table (verified via `information_schema.tables` query).
4. `SELECT COUNT(*) FROM dbt_sandbox.int_combined` returns > 0.
</verification>

<success_criteria>
- PORT-01 ✅ (intermediate layer complete; marts layer is Plan 04)
- 9 intermediate models exist; 8 views + 1 table
- All CTE logic from `export.py:41-197` translated 1:1, with ARM 1/ARM 2 column ordering and `is_provisional` polarity preserved
- The marts spatial join in Plan 04 has a single materialized table to scan against, avoiding Pitfall 5
</success_criteria>

<output>
After completion, create `.planning/phases/083-scaffold-slice-port/083-03-SUMMARY.md` capturing: `int_combined` row count (ARM 1 + ARM 2 contributions if separable), any divergence from `export.py` column-name aliases, build time delta vs Plan 02 (the table materialization should add 1-3 seconds).
</output>
