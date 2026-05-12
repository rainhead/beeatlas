---
phase: 083-scaffold-slice-port
reviewed: 2026-05-12T00:00:00Z
depth: standard
files_reviewed: 32
files_reviewed_list:
  - data/dbt/dbt_project.yml
  - data/dbt/macros/emit_feature_collection.sql
  - data/dbt/models/intermediate/int_combined.sql
  - data/dbt/models/intermediate/int_ecdysis_base.sql
  - data/dbt/models/intermediate/int_ecdysis_catalog_suffixes.sql
  - data/dbt/models/intermediate/int_id_modified.sql
  - data/dbt/models/intermediate/int_matched_waba_ids.sql
  - data/dbt/models/intermediate/int_provisional_waba_ids.sql
  - data/dbt/models/intermediate/int_samples_base.sql
  - data/dbt/models/intermediate/int_specimen_obs_base.sql
  - data/dbt/models/intermediate/int_waba_link.sql
  - data/dbt/models/marts/counties_geo.sql
  - data/dbt/models/marts/ecoregions_geo.sql
  - data/dbt/models/marts/occurrences.sql
  - data/dbt/models/sources.yml
  - data/dbt/models/staging/stg_ecdysis__identifications.sql
  - data/dbt/models/staging/stg_ecdysis__occurrence_links.sql
  - data/dbt/models/staging/stg_ecdysis__occurrences.sql
  - data/dbt/models/staging/stg_geo__ecoregions.sql
  - data/dbt/models/staging/stg_geo__us_counties.sql
  - data/dbt/models/staging/stg_geo__us_states.sql
  - data/dbt/models/staging/stg_inat__observations.sql
  - data/dbt/models/staging/stg_inat__ofvs.sql
  - data/dbt/models/staging/stg_waba__observations.sql
  - data/dbt/models/staging/stg_waba__ofvs.sql
  - data/dbt/models/staging/stg_waba__taxon_lineage.sql
  - data/dbt/profiles.yml
  - data/dbt/run.sh
  - data/dbt/tests/scaffold_assert.sh
  - data/pyproject.toml
  - data/tests/test_dbt_scaffold.py
findings:
  critical: 0
  warning: 5
  info: 7
  total: 12
status: issues_found
---

# Phase 083: Code Review Report

**Reviewed:** 2026-05-12
**Depth:** standard
**Files Reviewed:** 32
**Status:** issues_found

## Summary

This phase ports `data/export.py`'s in-memory DuckDB CTE pipeline to a dbt project materializing in a sandbox schema (`dbt_sandbox`) without touching the production export path. The port is largely faithful — column projections, join keys, regex extractions, and the spatial-join fallback algorithm all mirror `export.py:23–263` line-by-line. Source-tree boundaries (production untouched), gitignore rules, smoke tests, and the spike's sandbox-only output location (`target/sandbox/`) are correctly enforced.

No critical bugs or security vulnerabilities found in the reviewed code. The findings below are warnings about correctness risks at boundaries the spike has not yet exercised (multi-row OFV joins, schema-validation gate gap, fragile geometry materialization assumption) plus quality/maintenance issues that would matter for the PORT-02 cutover but are tolerable for a spike.

Most behaviors that look "off" on first read are deliberate port-equivalence choices (preserved from `export.py`) and are correctly noted in adjacent SQL comments — those have not been flagged.

## Warnings

### WR-01: `int_samples_base` JOIN to OFVs can multiply rows when the same field_id appears more than once per observation

**File:** `data/dbt/models/intermediate/int_samples_base.sql:13-17`
**Issue:** The `JOIN stg_inat__ofvs sc ON sc._dlt_root_id = op._dlt_id AND sc.field_id = 8338` (specimen_count) and the parallel `LEFT JOIN ... field_id = 9963` (sample_id) silently fan out if any iNat observation carries more than one OFV row with the same `field_id`. `export.py:97-101` has the identical bug, so the port is faithful — but the dbt scaffold introduces no `unique` or `not_null` schema test on `observation_id` in `int_samples_base`, which would have flagged this in dbt's test suite. Subsequent FULL OUTER JOIN in `int_combined` on `host_observation_id = s.observation_id` would propagate any duplication into the final occurrences row count.
**Fix:** Add a dbt schema test in a `models/intermediate/schema.yml` asserting `unique` on `observation_id`, or wrap the OFV joins so each field_id is reduced to one row per `_dlt_root_id` (e.g., `(SELECT _dlt_root_id, ANY_VALUE(value) AS value FROM stg_inat__ofvs WHERE field_id = 8338 GROUP BY _dlt_root_id)`). At minimum, add a comment flagging the duplication risk so a reviewer running PORT-02 doesn't assume parity already implies correctness.

### WR-02: `int_provisional_waba_ids` NOT IN is unsafe if `int_matched_waba_ids.waba_obs_id` is ever NULL

**File:** `data/dbt/models/intermediate/int_provisional_waba_ids.sql:4-5`
**Issue:** `WHERE id NOT IN (SELECT waba_obs_id FROM int_matched_waba_ids)`. SQL `NOT IN` returns no rows when the subquery contains any NULL value — silently dropping every provisional row. Today `int_matched_waba_ids.waba_obs_id` is sourced from `int_waba_link.specimen_observation_id = MIN(waba.id)`, which is non-NULL by construction within each group, so this hasn't bitten. But the dependency is invisible: any future change that lets `int_waba_link` emit a NULL `specimen_observation_id` (e.g., adding an outer join in `int_waba_link`) would silently zero out ARM 2 of `int_combined`. `export.py:130-134` has the same shape, so the port preserves behaviour; the dbt port is the place to harden it.
**Fix:** Switch to `NOT EXISTS` (NULL-safe by construction) or add `WHERE waba_obs_id IS NOT NULL` to the inner SELECT:
```sql
SELECT id AS waba_obs_id
FROM {{ ref('stg_waba__observations') }} w
WHERE NOT EXISTS (
    SELECT 1 FROM {{ ref('int_matched_waba_ids') }} m
    WHERE m.waba_obs_id = w.id
)
```

### WR-03: Geometry materialization assumes DuckDB will round-trip GEOMETRY through CTAS, but `counties_geo` / `ecoregions_geo` are tables, not views

**File:** `data/dbt/models/marts/counties_geo.sql:6-16`, `data/dbt/models/marts/ecoregions_geo.sql:6-16`
**Issue:** Both mart models are `materialized='table'` and `SELECT … geom FROM {{ ref('stg_geo__*') }}`. DuckDB's `GEOMETRY` column can be persisted in tables in 1.4+, but the test_dbt_scaffold.py suite has no assertion that the persisted geometry column round-trips losslessly (e.g., that `ST_AsGeoJSON(geom)` on the materialized table is byte-identical to running the same expression directly against the source). If a future DuckDB minor version changes the on-disk geometry serialization, the post-hook FeatureCollection could silently emit different coordinates than `export.py`, and the structural-only test (`assert "geometry" in feature`) would not catch it. Additionally, materializing geometry to a table when only the geojson post-hook consumes it provides no measurable benefit — the post-hook re-reads the table and the post-hook is the only consumer.
**Fix:** Either (a) materialize `counties_geo` / `ecoregions_geo` as `view` (the post-hook macro accepts any queryable relation) which sidesteps any CTAS-geometry concern, or (b) add a value-level assertion to `test_dbt_scaffold.py` that confirms the emitted GeoJSON coordinate set matches a sampled `export.py` baseline (at least one county centroid or vertex count).

### WR-04: `emit_feature_collection` macro hard-codes the inner column name `name` — coupling between the macro and every caller's projection is invisible

**File:** `data/dbt/macros/emit_feature_collection.sql:18, 21`
**Issue:** The macro accepts `property_name` (the JSON key) as a parameter but assumes the input relation exposes a column literally named `name`. This is why `counties_geo.sql:15` and `ecoregions_geo.sql:15` perform a re-alias (`SELECT county AS name, geom` and `SELECT ecoregion_l3 AS name, geom`) instead of passing the original column through. The contract is one-directional and undocumented in the macro signature — a caller that passes `(this, 'NAME', '/path')` without first re-aliasing will fail at SQL-compile time with a cryptic "column 'name' not found", and the failure will only surface during the post-hook (not the model build itself).
**Fix:** Either (a) add a third parameter `value_column` so the macro reads the source column by name (`{{ value_column }}` instead of bare `name`), or (b) document the contract in the macro docstring — "Inner relation MUST expose a column named `name`; re-alias in the model body if your source column has a different name." Option (a) is preferable because it eliminates the hidden coupling and removes the per-model re-alias boilerplate.

### WR-05: `run.sh` continues on a partially-failed `mkdir`, masking deeper filesystem problems

**File:** `data/dbt/run.sh:24`
**Issue:** `mkdir -p "$DIR/target/sandbox"` is run under `set -euo pipefail`, so a failure (e.g., `target/` exists as a file, or permission denied) does propagate. But the directory itself is created before the actual dbt invocation in the `--version` / `--help` / empty-arg case (lines 29-31) where it's not needed. More importantly, the `mkdir -p` happens before `cd "$DIR"`, but `$DIR/...` is already absolute, so the order is correct. Minor risk: if `data/dbt/target/` exists as a regular file (e.g., a stray file from a botched build), `mkdir -p` fails with an unhelpful "Not a directory" and there's no diagnostic.
**Fix:** Move the `mkdir -p` into the non-help case (after the `case` switch) so `--version` doesn't side-effect the filesystem, and add an explicit pre-check that emits a clearer error: `if [ -e "$DIR/target/sandbox" ] && [ ! -d "$DIR/target/sandbox" ]; then echo "FAIL: $DIR/target/sandbox exists and is not a directory" >&2; exit 1; fi`.

## Info

### IN-01: `int_combined` materialization is declared in two places (dbt_project.yml and the model config block)

**File:** `data/dbt/dbt_project.yml:17-18`, `data/dbt/models/intermediate/int_combined.sql:6`
**Issue:** Both files set `int_combined` to `materialized='table'`. dbt resolves the model-level config to authoritative, so the project-level override is redundant. Risk: if one is later edited without the other (e.g., a contributor changes the project default to `incremental` and assumes int_combined inherits), the divergence is silent.
**Fix:** Drop the project-level override (keep only the in-model `{{ config(materialized='table') }}`), and add a comment in `dbt_project.yml` explaining that materialization for `int_combined` is set in-model for visibility.

### IN-02: Hardcoded `state_fips = '53'` in `stg_geo__us_counties` ignores `[tool.beeatlas].state_fips` in pyproject.toml

**File:** `data/dbt/models/staging/stg_geo__us_counties.sql:11`
**Issue:** Per project memory, multi-state expansion is planned and `pyproject.toml:26` exposes `state_fips = "53"` as a config knob. This staging filter hardcodes `'53'` instead of reading from a dbt var. The same is true of the WA-only filter in `stg_geo__ecoregions.sql:13` (`abbreviation = 'WA'`). For a spike this is fine, but flag it so the v3.3 cutover doesn't re-encode the WA assumption in dbt.
**Fix:** Add `vars: {state_fips: '53', state_abbrev: 'WA'}` to `dbt_project.yml` and reference via `WHERE state_fips = '{{ var("state_fips") }}'`. Document the var in the project README when PORT-02 lands.

### IN-03: `SELECT *` in staging models hides the column contract from dbt

**File:** `data/dbt/models/staging/stg_ecdysis__occurrence_links.sql:9`, `data/dbt/models/staging/stg_ecdysis__occurrences.sql:10`, `data/dbt/models/staging/stg_inat__observations.sql:10`, `data/dbt/models/staging/stg_inat__ofvs.sql:9`, `data/dbt/models/staging/stg_waba__observations.sql:10`, `data/dbt/models/staging/stg_waba__ofvs.sql:9`, `data/dbt/models/staging/stg_waba__taxon_lineage.sql:9`
**Issue:** Most staging models do `SELECT * FROM {{ source(...) }}`. dbt's documented best practice is for staging models to project an explicit column list (one of the few places dbt strongly recommends being explicit). Without explicit projections, source schema changes silently propagate into intermediates that depend on specific column names (e.g., `_dlt_id`, `_dlt_root_id`, `taxon__iconic_taxon_name`), and dbt has no way to surface a breakage at compile time.
**Fix:** During PORT-02, enumerate the columns each downstream consumer needs and replace `SELECT *` with explicit projections + casts. The spike doesn't need this, but flag it on the seed findings document.

### IN-04: `emit_feature_collection` macro's `out_path` is string-interpolated into SQL without escaping

**File:** `data/dbt/macros/emit_feature_collection.sql:24`
**Issue:** `TO '{{ out_path }}'` would break if `out_path` contained a single quote. Both call sites pass static strings, so no exploit today, but a contributor adding a dynamic path (e.g., `out_path=var('export_dir') ~ '/counties.geojson'`) could trigger SQL injection / breakage if a var value contained a quote.
**Fix:** No action for the spike. When the macro hardens for production use, route `out_path` through dbt's `adapter.quote()` or restrict callers to a documented pattern.

### IN-05: `stg_geo__ecoregions` re-runs ST_Intersects per reference because it's materialized as a view

**File:** `data/dbt/models/staging/stg_geo__ecoregions.sql:5-14`
**Issue:** The model is `materialized='view'` and contains a non-trivial spatial subquery (`WHERE ST_Intersects(geom, (SELECT geom FROM stg_geo__us_states WHERE abbreviation = 'WA'))`). `occurrences.sql` references it twice (once via `wa_eco`, once transitively through fallback subqueries), and `ecoregions_geo.sql` references it once. Each reference re-evaluates ST_Intersects. Performance is out of v1 scope, but flag for PORT-02 because the dbt rebuild time vs. `export.py` is a measured artifact the spike intends to compare. Could give the spike a misleading "dbt is slower" signal that isn't fundamental.
**Fix:** Consider materializing `stg_geo__ecoregions` as `table` (one-time spatial filter, ~14 rows), or move the WA intersection into a dedicated intermediate model.

### IN-06: Inconsistent path conventions between `profiles.yml` location/external_root and `target/sandbox` resolution

**File:** `data/dbt/profiles.yml:9, 15`, `data/dbt/models/marts/counties_geo.sql:9`, `data/dbt/models/marts/ecoregions_geo.sql:9`, `data/dbt/models/marts/occurrences.sql:14`
**Issue:** `profiles.yml` sets `external_root: target/sandbox`, intended (per occurrences.sql:11 comment) to make `location='target/sandbox/occurrences.parquet'` resolve relative to that root. But the parquet `location:` ALSO starts with `target/sandbox/`, which suggests the path becomes `target/sandbox/target/sandbox/occurrences.parquet`. Meanwhile, the post-hook macro for counties/ecoregions writes to a literal `target/sandbox/<file>.geojson` (no `external_root` applied — post-hooks bypass it). Either the parquet path is actually being double-prefixed and the test happens to find the file because `dbt build` is run from the project dir and the relative path resolves anyway, OR the `external_root` config has a different precedence than the comment claims. Worth verifying empirically by running `dbt build` and inspecting where the parquet actually lands.
**Fix:** Confirm where `occurrences.parquet` is being written. If the path is double-prefixed, drop the `target/sandbox/` prefix from the `location` configs (leaving just `'occurrences.parquet'`) and let `external_root` handle the rest. If not, document why both halves are needed so this isn't fragile to a dbt-duckdb version bump.

### IN-07: `test_no_production_dbt_references` and `scaffold_assert.sh` duplicate the same check with different scopes

**File:** `data/tests/test_dbt_scaffold.py:114-130`, `data/dbt/tests/scaffold_assert.sh:32-38`
**Issue:** Both tests assert "no `data/dbt` references in `data/run.py`, `data/nightly.sh`, `.github/workflows/`". They use slightly different invocations (`subprocess.run(["git", "grep", ...])` vs. `git grep -l ... 2>/dev/null`) and have slightly different failure messages, but check the same invariant. Two checkers means two places to update if the production-touch surface grows (e.g., `infra/` is added). The smoke script and the pytest test should share a single source of truth.
**Fix:** Keep one (pytest is the canonical surface since it's covered by the standard `pytest` invocation). Have `scaffold_assert.sh` either drop the check or call out to `pytest -k test_no_production_dbt_references` to avoid duplication.

---

_Reviewed: 2026-05-12_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
