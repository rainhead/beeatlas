# Phase 83: Scaffold & Slice Port — Research

**Researched:** 2026-05-12
**Domain:** `dbt-duckdb` project scaffolding + SQL-DAG port of one Python ELT slice (`data/export.py`)
**Confidence:** HIGH (scope is locked by CONTEXT; remaining uncertainty is on adapter version pin + post-hook ergonomics, both flagged)

## Summary

Phase 83 stands up a `data/dbt/` `dbt-duckdb` project on the v3.3 branch and re-expresses the
`export.py` slice as a DAG of staging → intermediate → marts models that materialize into
`data/dbt/target/sandbox/`. CONTEXT.md has already locked all material decisions: slice
(`occurrences.parquet` + `counties.geojson` + `ecoregions.geojson`), three-layer layout, dbt
writing into a `dbt_sandbox` schema inside `beeatlas.duckdb`, declarative `extensions: [spatial]`
in `profiles.yml`, and a post-hook serializer for the two GeoJSON FeatureCollections. No
production surface is touched.

The research focused on resolving the five open questions: (1) `dbt-duckdb` version pin —
`1.10.1` (Feb 2026, current); (2) intermediate schema — `dbt_sandbox` inside `beeatlas.duckdb`
is fine and matches dbt-duckdb's attached-DB pattern; (3) GeoJSON emission — use a dbt macro
invoked from a model post-hook that runs DuckDB's `COPY ... TO ... (FORMAT JSON, ARRAY true)`
over a `Feature`-shaped CTE (preferred over the GDAL driver for fidelity with `export.py`'s
hand-built FeatureCollection); (4) `DBT_PROFILES_DIR` — set declaratively via a
`profile-dir` flag in a tiny wrapper or `--profiles-dir data/dbt`; (5) external parquet —
use the built-in `materialized='external'` strategy with `format='parquet'` and
`location='target/sandbox/occurrences.parquet'`.

**Primary recommendation:** Pin `dbt-duckdb==1.10.1` in `data/pyproject.toml`'s dev group,
commit `data/dbt/profiles.yml` (no secrets — DuckDB is a local file), set the profiles dir
via a one-line `data/dbt/run.sh` wrapper that invokes `uv run --project data dbt build
--profiles-dir "$(dirname "$0")"`, and emit GeoJSON via a shared `emit_feature_collection`
macro called from each geo model's `post-hook`.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Slice scope & GeoJSON outputs**
- Slice confirmed: `export.py` outputs — `occurrences.parquet` + `counties.geojson` +
  `ecoregions.geojson` (PORT-01).
- The dbt slice will produce `occurrences.parquet` + `counties.geojson` +
  `ecoregions.geojson` — this matches `export.py`'s actual outputs. Discrepancy
  (REQUIREMENTS.md says `ecdysis.parquet` + `samples.parquet`; reality is one
  `occurrences.parquet`) flagged for findings (FIND-01).
- GeoJSON strategy: model + post-hook serializer. Each geo model materializes a
  Feature-shaped row set; a post-hook writes the FeatureCollection to the sandbox.
  Implementation choice (macro vs explicit post-hook) is a Phase-83 plan-level
  decision; the **contract** is that the GeoJSON files land in the sandbox and
  equal the `export.py` outputs structurally.

**Source DuckDB strategy**
- No additional local copy: `data/beeatlas.duckdb` is the S3-downloaded copy. dbt
  connects directly via repo-relative path in `data/dbt/profiles.yml`.
- dbt is allowed to write into `data/beeatlas.duckdb`: stage/intermediate models
  materialize as views/tables in a dedicated `dbt_sandbox` schema (planner may pick
  a different name). Marts go to external parquet under `data/dbt/target/sandbox/`.
- Reset semantics: re-running `data/nightly.sh` (which re-downloads `beeatlas.duckdb`
  from S3) wipes the dbt schema — acceptable "clean slate" mechanism.

**Model granularity & layering**
- Three-layer DAG: `models/staging/` → `models/intermediate/` → `models/marts/`.
- Staging: ~10 models, one per raw `source()`, thin renaming/typing.
- Intermediate: derivations + joins matching `export.py`'s mid-CTEs.
- Marts: `occurrences` (external parquet), `counties_geo` + `ecoregions_geo`
  (table or external + post-hook → GeoJSON).
- Spatial joins live in the `occurrences` mart, not a separate model (need the
  combined row set's `_row_id` semantics). Fallback (nearest polygon via
  `ST_Distance ORDER BY ... LIMIT 1`) preserved exactly.

**Layout, deps, spatial extension, sources**
- Dependency: add `dbt-duckdb` to `data/pyproject.toml` `[dependency-groups].dev`.
  Invocation: `uv run --project data dbt build` (or equivalent) from `data/dbt/`.
- Project layout: `data/dbt/` contains `dbt_project.yml`, `profiles.yml`,
  `models/staging/`, `models/intermediate/`, `models/marts/`, `sources.yml`.
  `target/` and dbt logs gitignored.
- `profiles.yml` committed in-repo at `data/dbt/profiles.yml`. `DBT_PROFILES_DIR`
  set to `data/dbt` via env var, `dbt_project.yml` hint, or wrapper script —
  planner's call. No `~/.dbt/` setup required from clean checkout.
- Spatial extension: `extensions: [spatial]` in `profiles.yml` (declarative).
- `source()` targets: attached duckdb schemas inside `data/beeatlas.duckdb` —
  `ecdysis_data`, `inaturalist_data`, `inaturalist_waba_data`, `geographies`.

### Claude's Discretion

- Exact `dbt-duckdb` version pin (planner picks).
- Schema name for dbt-written intermediates inside `beeatlas.duckdb` (proposal:
  `dbt_sandbox`; planner may refine).
- Whether `counties_geo` / `ecoregions_geo` use a shared macro or per-model
  post-hooks.
- Cleanup macro / `dbt clean` flow — nice to have, planner decides whether to
  include in Phase 83 plans or leave to Phase 84.
- Path for `DBT_PROFILES_DIR` (env var, project hint, or wrapper script).

### Deferred Ideas (OUT OF SCOPE)

- `samples.parquet` as a separate mart — folded into `occurrences.parquet` per
  `export.py`'s actual output shape; splitting is a follow-up rewrite design
  choice. Flag in findings.
- Re-expressing `validate-schema.mjs` invariants as dbt tests/contracts (assigned
  to Phase 84 / TEST-03).
- Diff script, contracts, partial runs, findings doc body (Phase 84).
- Production cutover, replacing `export.py`, retiring `validate-schema.mjs`
  (v3.4+).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCAFFOLD-01 | `data/dbt/` working `dbt-duckdb` project; reads `beeatlas.duckdb`; `source()` declarations | Project layout + `sources.yml` patterns documented under "Architecture Patterns" |
| SCAFFOLD-02 | `dbt build` exits 0 from clean checkout against copy of `beeatlas.duckdb` | Declarative `extensions: [spatial]` + repo-relative `path:` in profile (see "Spatial extension load") |
| SCAFFOLD-03 | dbt artifacts gitignored; no references from `data/run.py`, `data/nightly.sh`, `.github/workflows/` | Gitignore lines documented; grep verification specified in "Common Pitfalls" |
| PORT-01 | Slice expressed as DAG with `source()`/`ref()` matching Python I/O | CTE-to-model mapping table (under "Architecture Patterns") translates each `export.py` CTE 1-to-1 to a model |
| PORT-02 | Spatial-join semantics (`ST_Within` + nearest fallback) preserved | Spatial-join SQL preserved verbatim in the `occurrences` mart; pattern documented |
| PORT-03 | Outputs land in `data/dbt/target/sandbox/` | `materialized='external'` with `location='target/sandbox/<name>'`; verified against dbt-duckdb docs |
| PORT-04 | Slice rationale recorded in `.planning/research/dbt-spike-findings.md` | File seeded by Phase 83 with header + slice-choice paragraph only; body deferred to Phase 84 |

## Project Constraints (from CLAUDE.md)

- **Static hosting only — no server runtime at any layer.** dbt is a *local CLI* spike;
  the sandbox outputs do not ship to `public/data/` and do not affect the runtime story.
- **Python 3.14+** (`data/pyproject.toml: requires-python = ">=3.14"`). `dbt-core` 1.10.x
  supports Python 3.9–3.13 per dbt docs; 3.14 support is currently the bleeding edge
  ([CITED: docs.getdbt.com/faqs/Core/install-python-compatibility]) — **VERIFY at install
  time** that `uv add --dev dbt-duckdb==1.10.1` resolves under Python 3.14. If it fails,
  options are: (a) pin a `python_versions` constraint on the dbt dev group, (b) use
  `uv run --python 3.13 ...` for dbt invocations only. [ASSUMED — see Assumptions Log A1]
- **No AWS / no CI integration for this milestone** — `.github/workflows/` must not
  reference `data/dbt/`. SCAFFOLD-03 is the explicit gate.
- **`speicmenLayer` typo is intentionally deferred** — irrelevant to this phase but a
  reminder that name drift is fine inside the spike.
- **dbt is a spike** — no production cutover (`feedback_spike_scope`); don't replace
  `export.py`, don't retire `validate-schema.mjs`, don't touch `data/nightly.sh`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Raw source declaration | dbt sources layer | — | `source()` over already-loaded `beeatlas.duckdb` schemas; dlt fetchers stay out of scope |
| Type normalization, NULL filters | dbt staging models | — | One-to-one wrappers; analogous to `export.py`'s per-table SELECTs |
| Derivations + joins (catalog match, FOJ specimen/sample) | dbt intermediate models | — | Mirrors `export.py`'s mid-CTEs; deep granularity feeds Phase 84's TEST-01 / PART-01 |
| Spatial joins (`ST_Within` + nearest fallback) | dbt marts model (`occurrences`) | — | Needs combined row set's `_row_id`; same pattern as `export.py` lines 199–262 |
| External parquet emission | dbt external materialization | — | `materialized='external'` writes directly to `target/sandbox/occurrences.parquet` |
| GeoJSON FeatureCollection emission | dbt model + post-hook macro | — | `ST_AsGeoJSON` returns only the geometry fragment; full FeatureCollection requires assembly. Macro keeps SQL declarative; post-hook is the only dbt-native write seam |
| Spatial extension load | DuckDB connection (declarative) | — | `extensions: [spatial]` in profile; no `on-run-start` hook needed |
| Production export | `data/export.py` (UNCHANGED) | — | Spike must not touch this path |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `dbt-core` | `>=1.8,<1.11` (transitive) | DAG runner, Jinja templating, materializations | Required by adapter; 1.10.x is the current line |
| `dbt-duckdb` | `==1.10.1` | DuckDB adapter; `external` materialization, `extensions` profile field | Latest stable, released 2026-02-17, declared by upstream as the supported line targeting `dbt-core>=1.8.x` and `duckdb 1.1.x+` ("we work hard to ensure newer versions of DuckDB will continue to work") [CITED: pypi.org/project/dbt-duckdb] [CITED: github.com/duckdb/dbt-duckdb README] |
| `duckdb` | `>=1.4,<2` (already pinned) | SQL engine + spatial extension host | Already in `data/pyproject.toml` [VERIFIED: `data/pyproject.toml:9`] |

**Installation:**
```bash
# from repo root
uv add --project data --dev "dbt-duckdb==1.10.1"
```

**Version verification (DO THIS IN PLAN EXECUTION, NOT NOW):**
```bash
uv run --project data python -c "import dbt_duckdb, dbt.adapters.factory; print(dbt_duckdb.__version__)"
uv run --project data dbt --version   # should print core + adapter versions
```

If `uv add` errors on Python 3.14 incompatibility, fall back to either pinning
`dbt-duckdb==1.10.0` (2025-11-05) or scoping a separate Python via `uv run --python
3.13`. [ASSUMED A1]

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| DuckDB `spatial` extension | bundled with duckdb 1.4 | `ST_Within`, `ST_Distance`, `ST_AsGeoJSON`, `ST_SimplifyPreserveTopology`, `ST_GeomFromText` | Loaded declaratively via `extensions: [spatial]` |
| DuckDB `json` extension | bundled | Building Feature objects via `to_json()` / `CAST(... AS JSON)` | Optional — only if a Feature-row macro path is chosen instead of GDAL driver |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `materialized='external'` + `format='parquet'` | Custom materialization | Built-in covers all our needs; custom adds maintenance burden — reject for spike |
| Macro + post-hook `COPY ... (FORMAT JSON, ARRAY true)` | GDAL driver `COPY ... (FORMAT GDAL, DRIVER 'GeoJSON')` | GDAL emits a FeatureCollection automatically and includes a CRS field; **but** `export.py` produces FeatureCollections with **only** `{type:Feature, properties:{NAME|NA_L3NAME}, geometry:...}` — no CRS, no `id`, no bbox. To minimize diff with `export.py` (Phase 84 PORT-02), build the FeatureCollection by hand via JSON. Worth re-evaluating in findings (FIND-01-adjacent) |
| `dbt_sandbox` schema | Separate DuckDB file | CONTEXT explicitly chose "write into beeatlas.duckdb" — re-attached DB pattern adds setup steps and breaks the "S3 download is the copy" simplicity |
| `DBT_PROFILES_DIR` env var | `dbt_project.yml` profile-dir hint / `--profiles-dir` flag | dbt-core 1.3+ also searches the project dir first by default [CITED: github.com/dbt-labs/dbt-core#6066], so a committed `data/dbt/profiles.yml` may "just work" when invoked from `data/dbt/`. Wrapper script (`data/dbt/run.sh`) is the most explicit and portable — recommend. |

## Architecture Patterns

### System Architecture Diagram

```
                       data/beeatlas.duckdb  (S3-downloaded copy)
                       ┌───────────────────────────────────────┐
                       │ ecdysis_data.*                        │
                       │ inaturalist_data.*                    │
                       │ inaturalist_waba_data.*               │  ← raw schemas
                       │ geographies.*                         │     (read-only for dbt)
                       └─────────────────┬─────────────────────┘
                                         │  source()
                                         ▼
                  ┌──────────────────────────────────────────┐
                  │ models/staging/  (views or ephemeral)    │
                  │  stg_ecdysis__occurrences                │
                  │  stg_ecdysis__identifications            │
                  │  stg_ecdysis__occurrence_links           │
                  │  stg_inat__observations                  │
                  │  stg_inat__ofvs                          │
                  │  stg_waba__observations                  │
                  │  stg_waba__ofvs                          │
                  │  stg_waba__taxon_lineage                 │
                  │  stg_geo__us_counties     (WA-filtered)  │
                  │  stg_geo__us_states                      │
                  │  stg_geo__ecoregions      (WA-intersect) │
                  └────────────────────┬─────────────────────┘
                                       │  ref()
                                       ▼
                  ┌──────────────────────────────────────────┐
                  │ models/intermediate/  (views or tables   │
                  │   materialized into dbt_sandbox schema)  │
                  │  int_id_modified                         │
                  │  int_waba_link                           │
                  │  int_ecdysis_catalog_suffixes            │
                  │  int_matched_waba_ids                    │
                  │  int_provisional_waba_ids                │
                  │  int_ecdysis_base                        │
                  │  int_samples_base                        │
                  │  int_specimen_obs_base                   │
                  │  int_combined  (UNION ALL arm1 + arm2)   │
                  └────────────────────┬─────────────────────┘
                                       │  ref()
                                       ▼
                  ┌──────────────────────────────────────────┐
                  │ models/marts/                            │
                  │  occurrences        ──► external parquet │
                  │   (spatial joins inside; ST_Within +     │   ──►  data/dbt/target/sandbox/
                  │    ST_Distance nearest-polygon fallback) │       occurrences.parquet
                  │  counties_geo       ──► table + post-hook│   ──►  counties.geojson
                  │  ecoregions_geo     ──► table + post-hook│   ──►  ecoregions.geojson
                  └──────────────────────────────────────────┘
```

Trace: a row in `ecdysis_data.occurrences` enters via `stg_ecdysis__occurrences`, flows
through `int_ecdysis_base` (joined with `int_id_modified`, `int_waba_link`,
`stg_inat__observations` for floral host), enters `int_combined` as ARM 1 of the UNION
(LEFT JOINed against `int_specimen_obs_base`), is paired with a sample via the FULL OUTER
JOIN on `host_observation_id`, then receives `_row_id`, county, and ecoregion in the
`occurrences` mart, and lands as a row in `target/sandbox/occurrences.parquet`.

### Recommended Project Structure

```
data/
├── dbt/                                # ← new this phase
│   ├── dbt_project.yml                 # name: beeatlas; profile: beeatlas
│   ├── profiles.yml                    # committed (no secrets — local duckdb file)
│   ├── run.sh                          # one-line wrapper: exec dbt build --profiles-dir "$(dirname "$0")" "$@"
│   ├── models/
│   │   ├── sources.yml                 # one file; ~10 source tables
│   │   ├── staging/
│   │   │   ├── stg_ecdysis__occurrences.sql
│   │   │   ├── stg_ecdysis__identifications.sql
│   │   │   ├── stg_ecdysis__occurrence_links.sql
│   │   │   ├── stg_inat__observations.sql
│   │   │   ├── stg_inat__ofvs.sql
│   │   │   ├── stg_waba__observations.sql
│   │   │   ├── stg_waba__ofvs.sql
│   │   │   ├── stg_waba__taxon_lineage.sql
│   │   │   ├── stg_geo__us_counties.sql
│   │   │   ├── stg_geo__us_states.sql
│   │   │   └── stg_geo__ecoregions.sql
│   │   ├── intermediate/
│   │   │   ├── int_id_modified.sql
│   │   │   ├── int_waba_link.sql
│   │   │   ├── int_ecdysis_catalog_suffixes.sql
│   │   │   ├── int_matched_waba_ids.sql
│   │   │   ├── int_provisional_waba_ids.sql
│   │   │   ├── int_ecdysis_base.sql
│   │   │   ├── int_samples_base.sql
│   │   │   ├── int_specimen_obs_base.sql
│   │   │   └── int_combined.sql
│   │   └── marts/
│   │       ├── occurrences.sql         # materialized='external', format='parquet'
│   │       ├── counties_geo.sql        # table + post-hook → counties.geojson
│   │       └── ecoregions_geo.sql      # table + post-hook → ecoregions.geojson
│   ├── macros/
│   │   └── emit_feature_collection.sql # shared serializer (called from post-hooks)
│   └── target/                         # gitignored (dbt-generated)
│       └── sandbox/                    # external parquet + GeoJSON land here
└── pyproject.toml                      # + dbt-duckdb==1.10.1 in [dependency-groups].dev
```

### Pattern 1: profiles.yml — declarative spatial + repo-relative DuckDB path

```yaml
# Source: docs.getdbt.com/docs/local/connect-data-platform/duckdb-setup (verified pattern)
# data/dbt/profiles.yml
beeatlas:
  target: sandbox
  outputs:
    sandbox:
      type: duckdb
      path: ../beeatlas.duckdb          # relative to data/dbt/ — points at data/beeatlas.duckdb
      schema: dbt_sandbox               # default schema for intermediates/views
      threads: 4
      extensions:
        - spatial                       # auto INSTALL + LOAD on each connection
      external_root: target/sandbox     # base for materialized='external' relative locations
```

**Why this is enough for SCAFFOLD-02:** `extensions: [spatial]` is the dbt-duckdb-native
declarative form of `INSTALL spatial; LOAD spatial;` and matches `export.py:321` exactly.
[CITED: github.com/duckdb/dbt-duckdb README — "extensions" field]

### Pattern 2: dbt_project.yml — profile binding, model materializations, gitignore signal

```yaml
# Source: docs.getdbt.com/reference/dbt_project.yml + duckdb-setup
name: beeatlas
version: '0.1.0'
config-version: 2
profile: beeatlas

model-paths: ["models"]
macro-paths: ["macros"]
target-path: "target"
clean-targets: ["target", "dbt_packages", "logs"]

models:
  beeatlas:
    staging:
      +materialized: view
    intermediate:
      +materialized: view
    marts:
      +materialized: table       # default; occurrences overrides to 'external'
```

### Pattern 3: Source declaration over attached DuckDB schemas

```yaml
# data/dbt/models/sources.yml
# Source: docs.getdbt.com/reference/source-properties + dbt-duckdb DuckDB-setup
version: 2
sources:
  - name: ecdysis_data           # schema name inside beeatlas.duckdb
    schema: ecdysis_data
    tables:
      - name: occurrences
      - name: identifications
      - name: occurrence_links

  - name: inaturalist_data
    schema: inaturalist_data
    tables:
      - name: observations
      - name: observations__ofvs

  - name: inaturalist_waba_data
    schema: inaturalist_waba_data
    tables:
      - name: observations
      - name: observations__ofvs
      - name: taxon_lineage

  - name: geographies
    schema: geographies
    tables:
      - name: us_counties
      - name: us_states
      - name: ecoregions
```

### Pattern 4: External parquet mart

```sql
-- data/dbt/models/marts/occurrences.sql
-- Source: github.com/duckdb/dbt-duckdb README — external materialization
{{ config(
    materialized='external',
    location='target/sandbox/occurrences.parquet',
    format='parquet',
    options={'CODEC': "'SNAPPY'"}
) }}

WITH joined AS (
  SELECT ROW_NUMBER() OVER () AS _row_id, *
  FROM {{ ref('int_combined') }}
),
occ_pt AS (
  SELECT *, ST_Point(lon, lat) AS pt FROM joined
),
wa_counties AS (SELECT * FROM {{ ref('stg_geo__us_counties') }}),
wa_eco      AS (SELECT * FROM {{ ref('stg_geo__ecoregions')  }}),
with_county AS (
  SELECT occ_pt._row_id, c.county
  FROM occ_pt LEFT JOIN wa_counties c ON ST_Within(occ_pt.pt, c.geom)
),
county_fallback AS (
  SELECT _row_id,
    (SELECT county FROM wa_counties
      ORDER BY ST_Distance(geom, (SELECT pt FROM occ_pt o2 WHERE o2._row_id = with_county._row_id))
      LIMIT 1) AS county
  FROM with_county WHERE county IS NULL
),
final_county AS (
  SELECT * FROM with_county WHERE county IS NOT NULL
  UNION ALL SELECT * FROM county_fallback
),
-- mirror the eco_/with_eco/eco_dedup/eco_fallback/final_eco shape from export.py:224-244
...
SELECT j.*, fc.county, fe.ecoregion_l3
FROM joined j
JOIN final_county fc ON fc._row_id = j._row_id
JOIN final_eco    fe ON fe._row_id = j._row_id
```

**Key constraints to preserve from `export.py` (PORT-02):**
- `_row_id` is `ROW_NUMBER() OVER ()` over `combined`, **not** an existing key.
- `eco_dedup` uses `DISTINCT ON (_row_id)` — DuckDB-specific, keep verbatim.
- Fallback is `(SELECT ... ORDER BY ST_Distance LIMIT 1)` correlated to the
  `_row_id` of the outer fallback row — preserve the correlated subquery shape.

### Pattern 5: GeoJSON post-hook via shared macro

```sql
-- data/dbt/macros/emit_feature_collection.sql
-- Source: duckdb.org/docs/current/data/json/writing_json + spatial ST_AsGeoJSON docs
{% macro emit_feature_collection(model_relation, property_name, out_path) %}
COPY (
  SELECT json_object(
    'type', 'FeatureCollection',
    'features', (
      SELECT to_json(list({
        'type': 'Feature',
        'properties': {{ "{" }} {{ "'" ~ property_name ~ "'" }}: name {{ "}" }},
        'geometry': ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.001))::JSON
      }))
      FROM {{ model_relation }}
    )
  ) AS doc
) TO '{{ out_path }}' (FORMAT JSON, ARRAY false, COMPRESSION uncompressed)
{% endmacro %}
```

```sql
-- data/dbt/models/marts/counties_geo.sql
{{ config(
    materialized='table',
    schema='dbt_sandbox',
    post_hook=[
      emit_feature_collection(this, 'NAME', 'target/sandbox/counties.geojson')
    ]
) }}
SELECT name, geom
FROM {{ ref('stg_geo__us_counties') }}
```

```sql
-- data/dbt/models/marts/ecoregions_geo.sql
{{ config(
    materialized='table',
    schema='dbt_sandbox',
    post_hook=[
      emit_feature_collection(this, 'NA_L3NAME', 'target/sandbox/ecoregions.geojson')
    ]
) }}
SELECT name, geom
FROM {{ ref('stg_geo__ecoregions') }}
```

**Trade-off note for findings:** DuckDB's spatial extension also offers a GDAL-driven
single-call FeatureCollection emission (`COPY <tbl> TO '...geojson' (FORMAT GDAL,
DRIVER 'GeoJSON')`) which is simpler but adds extra fields (`crs`, optional `id`, optional
`bbox`) that `export.py` doesn't produce. For minimum diff with `export.py` in Phase 84,
the hand-rolled `to_json`/`list` approach above is preferred. Capture this trade-off
verbatim in the seeded findings doc per PORT-04 (rationale only).
[CITED: github.com/duckdb/duckdb-spatial/issues/370 — "How to export a table as full
GeoJSON document?"]

### Pattern 6: Profiles directory resolution — committed wrapper script

```bash
# data/dbt/run.sh
#!/usr/bin/env bash
# Ensures dbt finds the in-repo profiles.yml regardless of cwd
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec uv run --project "$DIR/.." dbt "$@" --profiles-dir "$DIR" --project-dir "$DIR"
```

Usage: `data/dbt/run.sh build`, `data/dbt/run.sh ls --resource-type model`.

Why this over `DBT_PROFILES_DIR` env var: explicit, no shell state required, works from
any cwd, satisfies SCAFFOLD-02's "clean local checkout" promise. Alternative (env var)
works but requires every dev to know to set it.

### Anti-Patterns to Avoid

- **Splitting GeoJSON emission into per-model post-hooks with inline COPY statements** —
  duplicates the 6-line `to_json(list(...))` block. Shared macro is the dbt-native way.
- **Materializing `int_combined` as `external` parquet** — only the final `occurrences`
  mart is a sandbox output. Intermediates are views in `dbt_sandbox`, otherwise
  partial-runs in Phase 84 (PART-01) will have nothing to demonstrate.
- **Hard-coding the absolute path to `beeatlas.duckdb`** — break clean-checkout
  reproducibility. Use repo-relative `../beeatlas.duckdb` from `data/dbt/profiles.yml`.
- **Splitting spatial joins into a separate model** — they need the combined row set's
  `_row_id`. Keep them inside `occurrences.sql` exactly as in `export.py:199-262`.
- **Loading the spatial extension via `on-run-start` hook** — the `extensions: [spatial]`
  profile field already runs `INSTALL spatial; LOAD spatial;` on every connection. Hook
  is redundant.
- **Adding `data/dbt/` references to `data/run.py`, `data/nightly.sh`, or `.github/`** —
  SCAFFOLD-03 explicit gate. Grep verification is part of Phase 83 success.
- **Committing `target/` or `logs/`** — both are dbt-generated and must be gitignored
  (SCAFFOLD-03).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Spatial extension loading | Custom `on-run-start: ["INSTALL spatial; LOAD spatial;"]` | `extensions: [spatial]` in profile | Native dbt-duckdb feature; handles re-loads per connection automatically |
| External parquet output | Custom Python materialization, or a post-hook `COPY ... TO ...parquet` | `materialized='external'` + `location='target/sandbox/occurrences.parquet'` | First-class adapter feature; format inferred from extension since 1.4.1 |
| Profiles-dir discovery | Document "remember to set DBT_PROFILES_DIR" in README | `data/dbt/run.sh` wrapper passing `--profiles-dir` | Single point of failure → single point of fix; satisfies "clean checkout" SCAFFOLD-02 |
| Cross-source attaching | `ATTACH '...duckdb'` in `on-run-start` | `path:` in profile points at the file directly | All four schemas (`ecdysis_data`, `inaturalist_data`, `inaturalist_waba_data`, `geographies`) are already inside `beeatlas.duckdb` — no attach needed |
| GeoJSON FeatureCollection (with property + geometry only) | Multiple `print()` statements in a Python op | Macro using `to_json(list(...))` + `COPY ... (FORMAT JSON)` post-hook | Stays inside dbt's DAG; macro can be reused for both county and ecoregion models |
| dbt-core version pinning | Adding `dbt-core` directly to deps | Let `dbt-duckdb==1.10.1` pull it transitively | Adapter pins a compatible `dbt-core` range; over-constraining causes resolution churn |

**Key insight:** Every adapter-shaped problem in this slice has a built-in dbt-duckdb
solution. Reach for a custom macro **only** when assembling FeatureCollections (because
`ST_AsGeoJSON` returns only the geometry fragment by design
[CITED: duckdb.org/docs/current/core_extensions/spatial/functions]).

## Runtime State Inventory

Not applicable — this is a **greenfield scaffolding phase**, not a rename/refactor.
The dbt project is brand new; the production pipeline is untouched; no existing
runtime state (Lambdas, cron registrations, env vars, etc.) embeds a string that
needs migrating.

For the explicit categories:
- **Stored data:** None — `data/beeatlas.duckdb` is read by dbt; the only new state
  is a `dbt_sandbox` schema written inside it, which is wiped by the nightly S3
  re-download.
- **Live service config:** None — no n8n / Datadog / Tailscale interaction.
- **OS-registered state:** None — no new cron, launchd, or scheduled task.
  `data/nightly.sh` is **not** modified.
- **Secrets/env vars:** None — no AWS or external service credentials. Optional
  `DBT_PROFILES_DIR` is a *convenience* env var; the wrapper script removes the need.
- **Build artifacts:** `data/dbt/target/` and dbt log files will be created on
  every run. Gitignore must cover both before the first run lands a commit.

## Common Pitfalls

### Pitfall 1: dbt's profile-search order surprises on clean checkouts
**What goes wrong:** A developer clones the repo, runs `dbt build` from `data/dbt/`,
and dbt looks in `~/.dbt/profiles.yml` first (older versions) or finds a stray
profile there with the wrong name.
**Why it happens:** dbt-core's profile resolution order has shifted across versions
[CITED: github.com/dbt-labs/dbt-core/issues/6066]. The most robust answer is to be
explicit.
**How to avoid:** Use the `data/dbt/run.sh` wrapper that passes both `--profiles-dir`
and `--project-dir`. Verify with `data/dbt/run.sh debug`.
**Warning signs:** `Could not find profile named 'beeatlas'`; or worse, a successful
run against the wrong DuckDB file.

### Pitfall 2: Spatial extension not loaded on every adapter connection
**What goes wrong:** `ST_Within` / `ST_AsGeoJSON` calls fail with "function not found"
mid-run, sometimes only in parallel threads.
**Why it happens:** Extensions are per-connection; without the declarative profile
field, only the connection that ran `on-run-start` has it loaded.
**How to avoid:** Use `extensions: [spatial]` in `profiles.yml`. Do not also add an
`on-run-start` hook for spatial — redundant.
**Warning signs:** Intermittent failures under `--threads 4` while single-thread
runs succeed.

### Pitfall 3: `materialized='external'` writes outside `target/` when `location` is absolute
**What goes wrong:** A model with `location='/tmp/foo.parquet'` or an unintended
absolute path writes outside `data/dbt/target/sandbox/`, violating PORT-03.
**Why it happens:** `external_root` only applies when `location` is relative.
**How to avoid:** Always use relative `location` values (e.g.,
`target/sandbox/occurrences.parquet`). Verify after first run: `ls
data/dbt/target/sandbox/`.
**Warning signs:** A parquet file shows up in repo root, `/tmp`, or anywhere
other than `data/dbt/target/sandbox/`.

### Pitfall 4: dbt commits a stray `dbt-core` pin that conflicts with `dbt-duckdb`
**What goes wrong:** Adding `dbt-core` directly to `dependencies` over-constrains
the resolver and forces a downgrade of `dbt-duckdb` or a resolution failure.
**Why it happens:** Adapters already pin a compatible `dbt-core` range.
**How to avoid:** Only add `dbt-duckdb==1.10.1` to the dev group. Let resolution
pull `dbt-core` transitively. Verify with `uv tree --project data | grep -E
"dbt-(core|duckdb)"`.
**Warning signs:** `uv` resolver complaining about `dbt-core` upper bound.

### Pitfall 5: `int_combined` materialized as a view causes the spatial mart to redo all derivations
**What goes wrong:** `occurrences.sql` re-evaluates the entire UNION ALL each time
DuckDB plans the `ST_Within` join, slowing the run by an order of magnitude on
warm cache (or even crashing under memory pressure).
**Why it happens:** Views aren't materialized; DuckDB inlines them.
**How to avoid:** Either (a) override `int_combined` to `materialized='table'`
inside `dbt_project.yml`'s `intermediate:` block for this one model, or (b)
materialize all intermediates as tables. Option (a) is the lighter touch and aligns
with dbt convention.
**Warning signs:** `dbt build` takes >30s on the first slice when `export.py`
runs in <5s for the same dataset.

### Pitfall 6: `to_json(list(...))` row-builder needs both spatial AND json extensions
**What goes wrong:** Post-hook fails with "function `to_json` does not exist."
**Why it happens:** The DuckDB `json` extension is **autoloaded** by recent
DuckDB but the autoloader doesn't fire inside dbt-duckdb's connection setup if
extensions list is locked down.
**How to avoid:** If autoloading fails, add `json` alongside `spatial` in the
`extensions:` list. Cheap defensive add.
**Warning signs:** `Catalog Error: Scalar Function with name to_json does not exist!`

### Pitfall 7: `EXPORT_DIR` env var on a developer's shell shadows the sandbox
**What goes wrong:** A developer has `EXPORT_DIR=/somewhere/public/data` exported
from running `export.py`; `dbt build` ignores it (good) but the developer also
runs `export.py` afterward and gets confused which file is "real."
**Why it happens:** `export.py` reads `EXPORT_DIR`; dbt's sandbox doesn't.
**How to avoid:** Document in `data/dbt/README.md` that dbt writes to
`data/dbt/target/sandbox/` regardless of `EXPORT_DIR`. (Phase 84 diff script will
use this fact.)
**Warning signs:** Phase 84 diff finds zero differences because the developer was
comparing two `export.py` outputs.

### Pitfall 8: `target/` lands in git before gitignore is added
**What goes wrong:** First `dbt build` writes hundreds of files into
`data/dbt/target/`; `git status` shows them; developer panics or commits them.
**Why it happens:** Gitignore lines must be in place before the first run.
**How to avoid:** Add `.gitignore` entries (`data/dbt/target/`, `data/dbt/logs/`,
`data/dbt/dbt_packages/`) in the *first* scaffolding commit, before adding any
model. Verify with `git check-ignore data/dbt/target/whatever`.
**Warning signs:** `git status` shows files under `data/dbt/target/`.

## Code Examples

### Verifying spatial extension is loaded by dbt
```bash
# Source: dbt-core debug docs
data/dbt/run.sh debug
data/dbt/run.sh run-operation run_query --args '{sql: "SELECT spatial_version();"}'
```

### Preserving `export.py`'s `wa_eco` filter at the staging layer
```sql
-- data/dbt/models/staging/stg_geo__ecoregions.sql
-- Source: data/export.py lines 33-40 (WA-intersection filter)
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

Note: `export.py` uses `ST_GeomFromText(geometry_wkt)` everywhere. After the Phase 47
backfill, the same tables also have a native `geom GEOMETRY` column (per
`data/run.py::_apply_migrations`). The dbt staging models can use the native `geom`
directly — assuming the migration has been applied to the S3-cached DuckDB. **Verify
this at plan execution time** with `DESCRIBE geographies.us_counties`; if `geom`
is absent, fall back to `ST_GeomFromText(geometry_wkt)` in the staging layer.

### CTE-to-model mapping (`export.py` → dbt)

| `export.py` CTE | dbt model | Layer |
|-----------------|-----------|-------|
| `wa_counties` (line 28) | `stg_geo__us_counties` | staging |
| `wa_eco` (line 33) | `stg_geo__ecoregions` | staging |
| `id_modified` (line 41) | `int_id_modified` | intermediate |
| `waba_link` (line 46) | `int_waba_link` | intermediate |
| `ecdysis_base` (line 57) | `int_ecdysis_base` | intermediate |
| `samples_base` (line 86) | `int_samples_base` | intermediate |
| `specimen_obs_base` (line 104) | `int_specimen_obs_base` | intermediate |
| `ecdysis_catalog_suffixes` (line 120) | `int_ecdysis_catalog_suffixes` | intermediate |
| `matched_waba_ids` (line 125) | `int_matched_waba_ids` | intermediate |
| `provisional_waba_ids` (line 130) | `int_provisional_waba_ids` | intermediate |
| `combined` (line 135 — UNION ALL of 2 arms) | `int_combined` | intermediate |
| `joined`, `occ_pt`, `with_county`, `county_fallback`, `final_county`, `with_eco`, `eco_dedup`, `eco_fallback`, `final_eco` (lines 199–244) | inline CTEs inside `marts/occurrences.sql` | mart |
| Final `SELECT` + `COPY ... TO 'occurrences.parquet'` (lines 246–263) | `materialized='external'` config of `occurrences.sql` | mart |
| `export_counties_geojson` (line 280) | `marts/counties_geo.sql` + macro | mart |
| `export_ecoregions_geojson` (line 297) | `marts/ecoregions_geo.sql` + macro | mart |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `INSTALL spatial; LOAD spatial;` via `on-run-start` hook | `extensions: [spatial]` profile field | dbt-duckdb 1.0+ | Declarative, applied per-connection, survives threading |
| Custom Python materialization for parquet outputs | `materialized='external'` + `format='parquet'` | dbt-duckdb 1.0+, format inference added 1.4.1 | Built-in, no maintenance burden |
| `path: ":memory:"` (in-memory) | `path: ../beeatlas.duckdb` (file-backed) | n/a — always file-backed for this use case | Persists `dbt_sandbox` between runs; re-attachable from `python -c "import duckdb; duckdb.connect('data/beeatlas.duckdb')"` |
| `~/.dbt/profiles.yml` (home dir) | Project-local `data/dbt/profiles.yml` + wrapper | dbt-core 1.3 (project-dir search added) | No home-dir setup; "clean checkout" promise holds |

**Deprecated/outdated:**
- The `jwills/dbt-duckdb` repo redirects to `duckdb/dbt-duckdb` (the adapter moved
  under the DuckDB org). Use `duckdb/dbt-duckdb` for issue links and docs.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python | dbt-core + adapter | ✓ (assumed — project pins ≥3.14) | 3.14+ | If `dbt-duckdb` resolution fails under 3.14, pin `dbt-duckdb==1.10.0` or scope dbt invocations to `uv run --python 3.13` |
| `uv` | Package management | ✓ (already used by data project) | — | — |
| `duckdb` Python | spatial SQL + adapter backend | ✓ | `>=1.4,<2` (pinned in pyproject) | — |
| DuckDB `spatial` extension | All `ST_*` functions | ✓ (bundled core extension; loaded declaratively) | matches duckdb 1.4 | — |
| DuckDB `json` extension | `to_json` / `list_to_json` in GeoJSON macro | ✓ (bundled, usually autoloaded) | matches duckdb 1.4 | Add `json` explicitly to `extensions:` list if autoloader fails |
| `data/beeatlas.duckdb` | dbt source connection | ✓ (S3-downloaded; treated as the "copy" per SCAFFOLD-01) | post-Phase-47 schema with native `geom` column | If file is absent at plan time, instruct dev to run `data/nightly.sh` first |
| `dbt-duckdb` 1.10.1 | This whole phase | ✗ (not yet installed) | — | Install via `uv add --project data --dev dbt-duckdb==1.10.1` as part of the first plan |

**Missing dependencies with no fallback:** None blocking — `dbt-duckdb` install is a
normal task action, not a blocker.

**Missing dependencies with fallback:** `dbt-duckdb` under Python 3.14 — fallback to
`dbt-duckdb==1.10.0` (released 2025-11-05) or `uv run --python 3.13 dbt ...`.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `pytest` (already installed; `data/pyproject.toml` dev group); validation is partly *behavioral via `dbt build`* and partly *file-shape via pytest* |
| Config file | `data/pyproject.toml` `[tool.pytest.ini_options]` (testpaths = ["tests"]) |
| Quick run command | `data/dbt/run.sh build` then `uv run --project data pytest data/tests/test_dbt_scaffold.py -x` |
| Full suite command | `data/dbt/run.sh build && uv run --project data pytest data/tests -x` |

dbt does not have its own dbt-tests in Phase 83 (those are TEST-01/TEST-02 in Phase 84).
Phase 83's validation is: **does `dbt build` exit 0, and do the three expected files
land in `data/dbt/target/sandbox/`?**

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCAFFOLD-01 | `data/dbt/` has `dbt_project.yml`, `profiles.yml`, `sources.yml` | smoke | `test -f data/dbt/dbt_project.yml && test -f data/dbt/profiles.yml && test -f data/dbt/models/sources.yml` | ❌ Wave 0 (shell assertion script `data/dbt/tests/scaffold_assert.sh` or inline pytest) |
| SCAFFOLD-02 | `dbt build` exits 0 from clean checkout | integration | `data/dbt/run.sh build` (asserts exit code 0) | ❌ Wave 0 — first task creates this entry point |
| SCAFFOLD-03 | No references in `data/run.py`, `data/nightly.sh`, `.github/workflows/`; `target/` and logs gitignored | static-grep | `! git grep -E 'dbt/|dbt-duckdb' -- data/run.py data/nightly.sh .github/`<br>`git check-ignore data/dbt/target/anything` | ❌ Wave 0 (shell assertion in `data/dbt/tests/scaffold_assert.sh`) |
| PORT-01 | Slice expressed as DAG with `source()` + `ref()` | structural | `data/dbt/run.sh ls --resource-type model` produces ≥10 staging, ≥9 intermediate, 3 marts | ❌ Wave 0 |
| PORT-02 | Spatial-join semantics preserved | smoke | post-`build`, run a sanity-check pytest: `pytest data/tests/test_dbt_scaffold.py::test_no_null_county_or_ecoregion` reading `data/dbt/target/sandbox/occurrences.parquet` | ❌ Wave 0 — mirrors `export.py:266-277` assertions |
| PORT-03 | Outputs land in `data/dbt/target/sandbox/` | file-existence | `test -f data/dbt/target/sandbox/occurrences.parquet && test -f data/dbt/target/sandbox/counties.geojson && test -f data/dbt/target/sandbox/ecoregions.geojson` | ❌ Wave 0 |
| PORT-04 | Findings file seeded | file-existence + grep | `test -f .planning/research/dbt-spike-findings.md && grep -qi 'slice' .planning/research/dbt-spike-findings.md` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `data/dbt/run.sh build --select <changed-model>+` (downstream of
  the changed model) + the `scaffold_assert.sh` quick check.
- **Per wave merge:** `data/dbt/run.sh build` (full slice) + `uv run --project data
  pytest data/tests/test_dbt_scaffold.py -x`.
- **Phase gate:** Full `data/dbt/run.sh build` green + all SCAFFOLD/PORT pytest
  assertions green + `git grep` for `dbt` against forbidden paths returns nothing.

### Wave 0 Gaps

- [ ] `data/tests/test_dbt_scaffold.py` — pytest module asserting the three sandbox
  files exist after `dbt build`, the `occurrences.parquet` has zero null county /
  ecoregion rows (mirrors `export.py:266-277`), and basic row-count sanity (>0
  rows).
- [ ] `data/dbt/tests/scaffold_assert.sh` — shell script asserting file presence,
  gitignore behavior, and grep emptiness for SCAFFOLD-03.
- [ ] `data/dbt/run.sh` — wrapper script (Pattern 6 above).
- [ ] `data/dbt/conftest.py` — *not* needed; tests live in `data/tests/` next to
  existing fixtures.
- [ ] No framework install needed — pytest is already in the dev group.

## Security Domain

Not applicable in the strict ASVS sense — this is a *local-only spike*, no network
exposure, no auth, no untrusted input. Brief threat-pattern check:

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | n/a |
| V3 Session Management | no | n/a |
| V4 Access Control | no | n/a |
| V5 Input Validation | partial — but only over already-loaded local DuckDB data | dbt's `source()` + Jinja escape SQL identifiers; no string interpolation of untrusted values |
| V6 Cryptography | no | n/a |

**Practical concerns specific to this phase:**

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Accidental commit of dbt logs containing local paths | Information disclosure | Gitignore `data/dbt/logs/` and `data/dbt/target/` from the first scaffolding commit |
| `profiles.yml` committed with a secret | Information disclosure | DuckDB is a local file — `path:` is the only sensitive-looking field, and it's relative. No `password:`, `account:`, or `token:` fields exist. Safe to commit. |
| Re-running dbt against a stale S3 download | Tampering (data integrity) | Out of scope for spike; Phase 84's diff script (DIFF-01) will surface stale data via row-count drift |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `dbt-duckdb==1.10.1` resolves cleanly under Python 3.14 with `uv add --dev` | Project Constraints, Standard Stack | Plan needs a Python-version branch: either downgrade adapter, scope `uv run --python 3.13`, or relax the project's Python pin. **Verify at first install.** |
| A2 | DuckDB's `json` extension is autoloaded inside dbt-duckdb's adapter connection (so `to_json` and `list` work without listing `json` in `extensions:`) | Code Examples, Patterns, Pitfall 6 | Trivial fix — add `json` to `extensions:` list alongside `spatial` |
| A3 | The S3-cached `beeatlas.duckdb` has Phase-47 migrations applied (native `geom GEOMETRY` columns on `geographies.*`) | Code Examples (`stg_geo__*`) | If not migrated, staging models must use `ST_GeomFromText(geometry_wkt)` like `export.py` does — same WKT path; one-line change |
| A4 | dbt-core's profile-search order in 1.10.x prefers `--profiles-dir` over `~/.dbt` (modulo the wrapper script that passes the flag explicitly) | Pattern 6, Pitfall 1 | Wrapper script makes this irrelevant — it always passes `--profiles-dir` explicitly |
| A5 | `materialized='external'`'s `options={'CODEC': "'SNAPPY'"}` syntax is correct for parquet codec | Pattern 4 | If syntax is `compression` instead of `CODEC`, the first `dbt build` will error and reveal the correct key. Cheap to fix; doesn't change DAG shape |
| A6 | DuckDB's `DISTINCT ON (col)` works identically inside dbt-managed SQL as it does in `export.py`'s ad-hoc COPY | `occurrences.sql` mart | DuckDB feature, not dbt — should be identical. If it errors, fall back to `ROW_NUMBER() OVER (PARTITION BY _row_id) = 1` |

## Open Questions

None remaining that block planning — CONTEXT.md locked the load-bearing decisions
and this research resolved the five technical open questions:

1. ✅ **dbt-duckdb version pin** → `1.10.1` (Feb 2026).
2. ✅ **Schema name** → `dbt_sandbox` (CONTEXT proposal kept).
3. ✅ **GeoJSON emission** → shared macro called from each geo model's `post-hook`,
   using `to_json(list(...))` + `COPY ... (FORMAT JSON)`.
4. ✅ **`DBT_PROFILES_DIR`** → wrapper script `data/dbt/run.sh` passing both
   `--profiles-dir` and `--project-dir`.
5. ✅ **External parquet materialization** → built-in `materialized='external'` with
   `format='parquet'` and relative `location`.

One question to validate at execution (not at plan time): A1 — dbt-duckdb resolves
under Python 3.14.

## Sources

### Primary (HIGH confidence)
- `data/export.py` (this repo, lines 23–314) — source SQL being ported [VERIFIED: codebase read]
- `data/pyproject.toml` (this repo) — Python and duckdb pins [VERIFIED: codebase read]
- `data/run.py`, `data/nightly.sh` — production paths to *not* touch [VERIFIED: codebase read]
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/phases/083-scaffold-slice-port/083-CONTEXT.md` [VERIFIED: codebase read]
- [dbt-duckdb on PyPI](https://pypi.org/project/dbt-duckdb/) — version 1.10.1, released 2026-02-17
- [dbt-duckdb on GitHub](https://github.com/duckdb/dbt-duckdb) — README sections on `extensions`, external materialization, search order
- [DuckDB setup | dbt Developer Hub](https://docs.getdbt.com/docs/local/connect-data-platform/duckdb-setup)
- [DuckDB Spatial Functions](https://duckdb.org/docs/current/core_extensions/spatial/functions) — `ST_AsGeoJSON` returns only the geometry fragment

### Secondary (MEDIUM confidence)
- [Fully Local Data Transformation with dbt and DuckDB (DuckDB blog, 2025-04-04)](https://duckdb.org/2025/04/04/dbt-duckdb) — extensions list + external materialization example
- [How to export a table as full GeoJSON document? (duckdb-spatial #370)](https://github.com/duckdb/duckdb-spatial/issues/370) — GDAL driver vs hand-built FeatureCollection trade-off
- [About profiles.yml | dbt Developer Hub](https://docs.getdbt.com/docs/core/connect-data-platform/profiles.yml)
- [dbt-core profile search order regression (#6066)](https://github.com/dbt-labs/dbt-core/issues/6066) — explains why explicit `--profiles-dir` is safer than env var

### Tertiary (LOW confidence — flagged in Assumptions Log)
- Python 3.14 + dbt-core 1.10.x compatibility (cited but not directly verified for 3.14) — [What version of Python can I use? | dbt Developer Hub](https://docs.getdbt.com/faqs/Core/install-python-compatibility) [ASSUMED A1]
- `json` extension autoload inside dbt-duckdb adapter [ASSUMED A2]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — version verified against PyPI; adapter README confirms `extensions` + `external` features used here.
- Architecture: HIGH — patterns are 1:1 translations of `export.py`; CTE-to-model mapping is mechanical.
- Pitfalls: HIGH for adapter-shaped issues (declarative spatial, profile resolution, gitignore); MEDIUM for the Python 3.14 install (A1).
- Validation: HIGH — Phase 83 only needs file-shape + `dbt build` exit-0 checks; real dbt tests are Phase 84.

**Research date:** 2026-05-12
**Valid until:** 2026-06-11 (30 days; dbt-duckdb minor releases ~monthly so re-check before any future related work)
