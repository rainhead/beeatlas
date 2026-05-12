# Phase 83: Scaffold & Slice Port — Context

**Phase**: 83
**Milestone**: v3.3 — dbt Spike
**Date**: 2026-05-12

<domain>
Stand up a working `data/dbt/` (`dbt-duckdb`) project on the v3.3 branch and express the chosen pipeline slice as a DAG of dbt models materializing into a sandbox path. No production surface (`data/run.py`, `data/nightly.sh`, `.github/workflows/`, `public/data/`, `scripts/validate-schema.mjs`) is touched. This phase delivers the scaffolding + slice; Phase 84 exercises tests/contracts/diff/findings on top of it.

Requirements (locked, from `.planning/REQUIREMENTS.md`): SCAFFOLD-01, SCAFFOLD-02, SCAFFOLD-03, PORT-01, PORT-02, PORT-03, PORT-04.
</domain>

<canonical_refs>
- `.planning/REQUIREMENTS.md` — 18 locked requirements for v3.3; SCAFFOLD-*/PORT-* belong to this phase.
- `.planning/ROADMAP.md` §"Phase 83" — goal + success criteria (canonical).
- `.planning/PROJECT.md` §"Current Milestone: v3.3 dbt Spike" — scope/non-scope summary.
- `data/export.py` — the slice being ported (330 lines, three exporters; the interesting one is `export_occurrences_parquet`, lines 23–277).
- `data/run.py`, `data/nightly.sh`, `.github/workflows/deploy.yml` — must NOT be touched or reference `data/dbt/` (SCAFFOLD-03).
- `scripts/validate-schema.mjs` — read-only reference for what schema gate currently exists (re-expression deferred to Phase 84 / TEST-03).
- `data/pyproject.toml` — where `dbt-duckdb` will be added to `[dependency-groups].dev`.
- `data/beeatlas.duckdb` — the source DB (itself an S3 download; treated as the "copy"). dbt is allowed to write into a dedicated `dbt_sandbox` schema inside this file.
- Memory: `project_duckdb_wasm_direction.md` — frontend direction informs FIND-03 prerequisites in Phase 84 (not load-bearing for this phase).
- Memory: `feedback_spike_scope.md` — spike stays local/exploratory; no production cutover in this milestone.
</canonical_refs>

<prior_decisions>
- **v3.3 scope discipline**: requirements framed as learning outcomes; no requirement says "replaces X" or "deletes X". Cutover deferred to v3.4+. (REQUIREMENTS.md preamble.)
- **Slice recommended**: `export.py` → `ecdysis.parquet` (now `occurrences.parquet`) + `samples.parquet` + `counties.geojson` + `ecoregions.geojson`. PORT-01 leaves room to override; this CONTEXT confirms the recommendation.
- **Sandbox output path locked**: `data/dbt/target/sandbox/` (PORT-03).
- **Spatial-join semantics locked**: `ST_Within` + nearest-polygon (`ST_Distance` ORDER BY LIMIT 1) fallback. Any deviation must be captured in findings.
- **Out of scope (REQUIREMENTS.md)**: `data/run.py`, `data/nightly.sh`, `public/data/`, `scripts/validate-schema.mjs`, frontend consumers, `species_maps.py`, `feeds.py`, dlt fetchers, multi-slice porting, dbt CI integration.
</prior_decisions>

<code_context>
- `data/export.py:23–277` — `export_occurrences_parquet` is the slice's core SQL. Named CTEs to mirror as dbt models: `wa_counties`, `wa_eco`, `id_modified`, `waba_link`, `ecdysis_base`, `samples_base`, `specimen_obs_base`, `ecdysis_catalog_suffixes`, `matched_waba_ids`, `provisional_waba_ids`, `combined` (UNION ALL with `is_provisional`), spatial-join CTEs (`with_county` / `county_fallback` / `final_county`, `with_eco` / `eco_dedup` / `eco_fallback` / `final_eco`).
- `data/export.py:280–314` — `export_counties_geojson` and `export_ecoregions_geojson` produce `FeatureCollection` JSON via `ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.001))`. Properties: `NAME` for counties, `NA_L3NAME` for ecoregions.
- `data/export.py:321` — `INSTALL spatial; LOAD spatial;` on every connection. Equivalent declarative form: `extensions: [spatial]` in dbt profile.
- Source schemas inside `data/beeatlas.duckdb`: `ecdysis_data.occurrences`, `ecdysis_data.identifications`, `ecdysis_data.occurrence_links`, `inaturalist_data.observations`, `inaturalist_data.observations__ofvs`, `inaturalist_waba_data.observations`, `inaturalist_waba_data.observations__ofvs`, `inaturalist_waba_data.taxon_lineage`, `geographies.us_counties`, `geographies.us_states`, `geographies.ecoregions`. These are produced by the dlt pipelines in `data/*_pipeline.py` — stay out of scope as raw sources.
- `data/pyproject.toml`: Python 3.14+; `duckdb>=1.4,<2`; `pyarrow>=12`; existing dev group only has `pytest`. Adding `dbt-duckdb` here is the agreed location.
- `data/beeatlas.duckdb` is S3-downloaded — treat as the "copy" per SCAFFOLD-01; no extra local copy step needed.
</code_context>

<decisions>

### Slice scope & GeoJSON outputs
- **Slice confirmed**: `export.py` outputs — `occurrences.parquet` + `counties.geojson` + `ecoregions.geojson` (PORT-01).
  - Note: the Python file output is `occurrences.parquet` (not `ecdysis.parquet` as REQUIREMENTS.md phrases it). The dbt slice targets `occurrences.parquet` plus the two GeoJSON files. `samples.parquet` is not currently produced by `export.py`; it's referenced in REQUIREMENTS.md/ROADMAP.md by name but is actually folded into `occurrences.parquet` as the sample-side of the FULL OUTER JOIN. **The dbt slice will produce `occurrences.parquet` + `counties.geojson` + `ecoregions.geojson`** — this matches `export.py`'s actual outputs. Discrepancy flagged for findings (FIND-01).
- **GeoJSON strategy**: model + post-hook serializer.
  - Each geo model is a normal dbt model selecting `(NAME/NA_L3NAME, ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.001)))` materialized as table or external parquet under the sandbox.
  - A model-level `post-hook` (or a small dbt-native operation / macro invoked by the model) reads the rows and writes a `FeatureCollection` to `data/dbt/target/sandbox/counties.geojson` / `ecoregions.geojson`.
  - Implementation choice (macro using DuckDB `COPY ... TO ... (FORMAT JSON, ARRAY true)` vs a tiny Python `dbt.ref()` op vs explicit post-hook) is a Phase-83 plan-level decision; the **contract** is that the GeoJSON files land in the sandbox and equal the export.py outputs structurally (same properties, same simplification tolerance).

### Source DuckDB strategy
- **No additional local copy**: `data/beeatlas.duckdb` is the S3-downloaded copy. dbt connects directly to it via repo-relative path in `data/dbt/profiles.yml`.
- **dbt is allowed to write into `data/beeatlas.duckdb`**: stage/intermediate models materialize as views or tables in a dedicated schema (proposed: `dbt_sandbox`; the planner may pick a different name as long as it's clearly scoped and documented). Marts go to external parquet under `data/dbt/target/sandbox/`.
- **Reset semantics**: re-running `data/nightly.sh` (which re-downloads `beeatlas.duckdb` from S3) wipes the dbt schema — this is acceptable and noted as the "clean slate" mechanism. `dbt clean` / a `dbt run-operation drop_sandbox_schema` may also be added for local cleanup; planner's call.

### Model granularity & layering
- **Three-layer DAG**: `models/staging/` → `models/intermediate/` → `models/marts/`.
- **Staging (1 model per raw `source()`)** — thin renaming/typing layer over the duckdb source tables. Suggested set:
  - `stg_ecdysis__occurrences` (over `ecdysis_data.occurrences`, with the `WHERE decimal_latitude IS NOT NULL/!=''` filter)
  - `stg_ecdysis__identifications`
  - `stg_ecdysis__occurrence_links`
  - `stg_inat__observations`
  - `stg_inat__ofvs`
  - `stg_waba__observations`
  - `stg_waba__ofvs`
  - `stg_waba__taxon_lineage`
  - `stg_geo__us_counties` (WA-filtered, `state_fips = '53'`)
  - `stg_geo__us_states`
  - `stg_geo__ecoregions` (WA-intersecting filter applied here)
- **Intermediate** — derivations and joins that map to `export.py`'s mid-CTEs:
  - `int_id_modified` (max modified per coreid)
  - `int_waba_link` (catalog_suffix → MIN(waba.id))
  - `int_ecdysis_catalog_suffixes`
  - `int_matched_waba_ids`
  - `int_provisional_waba_ids`
  - `int_ecdysis_base` (joins ecdysis + occurrence_links + iNat host + id_modified + waba_link)
  - `int_samples_base` (iNat observations + count OFV + sample_id OFV)
  - `int_specimen_obs_base` (waba observations + taxon_lineage)
  - `int_combined` (UNION ALL of arm 1 + arm 2, with `is_provisional` flag)
- **Marts** — sandbox-published artifacts:
  - `occurrences` → materialized as external parquet at `data/dbt/target/sandbox/occurrences.parquet`. Handles the spatial joins (`with_county`/`county_fallback`/`final_county`, `with_eco`/`eco_dedup`/`eco_fallback`/`final_eco`) and the final SELECT.
  - `counties_geo` → external/table + post-hook → `data/dbt/target/sandbox/counties.geojson`.
  - `ecoregions_geo` → external/table + post-hook → `data/dbt/target/sandbox/ecoregions.geojson`.
- **Rationale**: deep granularity maximizes the surface Phase 84 needs (TEST-01 generic tests on staging/intermediate keys, TEST-02 model contract on a mart, PART-01 partial runs across subgraphs, PART-02 lineage artifact). A mega-model would under-deliver FIND-03.
- **Spatial joins live in the `occurrences` mart**, not in a separate model — they need the combined row set's `_row_id` semantics. The fallback (nearest polygon via `ST_Distance ORDER BY ... LIMIT 1`) is preserved exactly; deviations recorded for findings.

### Layout, deps, spatial extension, sources
- **Dependency**: add `dbt-duckdb` (pin specified by planner) to `data/pyproject.toml` under `[dependency-groups].dev`. Invocation: `uv run --project data dbt build` (or equivalent) from `data/dbt/`.
- **Project layout**: `data/dbt/` contains `dbt_project.yml`, `profiles.yml`, `models/staging/`, `models/intermediate/`, `models/marts/`, `sources.yml` (one file is fine; the planner may split per-source if cleaner). `target/` and dbt logs are gitignored (SCAFFOLD-03).
- **profiles.yml location**: committed in-repo at `data/dbt/profiles.yml`. `DBT_PROFILES_DIR` is set to `data/dbt` (env var, dbt_project.yml hint, or wrapper script — planner's call). No `~/.dbt/` setup required from clean checkout.
- **Spatial extension load**: `extensions: [spatial]` in `data/dbt/profiles.yml` (declarative). dbt-duckdb runs `INSTALL spatial; LOAD spatial;` on connection. No `on-run-start` hook needed.
- **`source()` targets**: attached duckdb schemas inside `data/beeatlas.duckdb` — `ecdysis_data`, `inaturalist_data`, `inaturalist_waba_data`, `geographies`. Matches `export.py` exactly; preserves diff fidelity for Phase 84's DIFF-* requirements. Source tables enumerated under "Staging" above.

</decisions>

<deferred>
- **Cleanup macro / `dbt clean` flow** — nice to have, planner decides whether to include in Phase 83 plans or leave to Phase 84.
- **`samples.parquet` as a separate mart** — REQUIREMENTS.md/ROADMAP.md mention `samples.parquet`, but `export.py` doesn't currently emit one (samples are folded into `occurrences.parquet` via FULL OUTER JOIN). Splitting samples back out into its own mart is a design choice deferred to a follow-up rewrite milestone; flag in findings.
- **Re-expressing `validate-schema.mjs` invariants as dbt tests/contracts** — assigned to Phase 84 / TEST-03; do not pre-empt here.
- **Diff script, contracts, partial runs, findings doc** — Phase 84 scope. Phase 83 must produce a DAG that makes those exercises possible, but must not start them.
- **Production cutover, replacing `export.py`, retiring `validate-schema.mjs`** — explicitly out of v3.3 scope; v3.4+.
</deferred>

<open_questions>
- Exact `dbt-duckdb` version pin — planner / researcher selects based on duckdb 1.4.x compatibility.
- Schema name for dbt-written intermediates inside `beeatlas.duckdb` — proposal: `dbt_sandbox`. Planner may refine.
- Whether `counties_geo` / `ecoregions_geo` use a shared macro or per-model post-hooks — implementation detail for plan phase.
</open_questions>
