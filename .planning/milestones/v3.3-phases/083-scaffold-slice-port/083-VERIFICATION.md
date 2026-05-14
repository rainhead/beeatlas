---
phase: 083-scaffold-slice-port
verified: 2026-05-12T20:10:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
---

# Phase 083: Scaffold Slice Port — Verification Report

**Phase Goal:** A working `dbt-duckdb` project exists on the branch with the spike slice expressed as a DAG of models, materializing logical outputs equivalent to the chosen Python module — without touching any production surface.

**Verified:** 2026-05-12T20:10:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `bash data/dbt/run.sh build` exits 0 from a clean local checkout against a copy of `beeatlas.duckdb`, exercising the slice end-to-end | VERIFIED | `dbt clean && dbt build` ran live: `Done. PASS=23 WARN=0 ERROR=0 SKIP=0 NO-OP=0 TOTAL=23` in ~1.4s |
| 2 | The chosen slice and its rationale are recorded in `.planning/research/dbt-spike-findings.md` | VERIFIED | File exists; `## Slice Choice` section present; includes rationale, samples.parquet discrepancy note, and GDAL trade-off |
| 3 | `git grep` confirms `data/run.py`, `data/nightly.sh`, and `.github/workflows/` contain no reference to the dbt project; `target/` and dbt logs are gitignored | VERIFIED | `git grep -l "data/dbt" -- data/run.py data/nightly.sh .github/workflows/` exits 1 (no matches); `.gitignore` lines 143-146 cover `data/dbt/target/`, `data/dbt/logs/`, `data/dbt/dbt_packages/`, `data/dbt/.user.yml` |
| 4 | The model DAG declares `source()` and `ref()` dependencies that match the Python module's input/output shape; outputs land under `data/dbt/target/sandbox/` (not `public/data/`) | VERIFIED | 23 models in DAG (11 staging + 9 intermediate + 3 marts); `sources.yml` declares all four source schemas; `occurrences.parquet` at `target/sandbox/occurrences.parquet` (1.2 MB); `counties.geojson` and `ecoregions.geojson` confirmed in sandbox |
| 5 | Spatial-join semantics (`ST_Within` + nearest-polygon fallback) are expressed in model SQL, with any deviation from `export.py` behavior captured | VERIFIED | `occurrences.sql` lines 31, 49: `ST_Within(occ_pt.pt, c.geom)` and `ST_Within(occ_pt.pt, e.geom)`; lines 36-38 and 58-60: `ORDER BY ST_Distance(geom, ...) LIMIT 1` correlated subqueries; FORMAT CSV workaround deviation documented in findings doc |

**Score:** 5/5 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `data/dbt/dbt_project.yml` | dbt project config with three-layer materialization | VERIFIED | name=beeatlas, profile=beeatlas, three layers; `int_combined: +materialized: table` override present |
| `data/dbt/profiles.yml` | duckdb connection with spatial extension, sandbox schema | VERIFIED | `extensions: [spatial, json]`; `path: ../beeatlas.duckdb`; `schema: dbt_sandbox`; `external_root: target/sandbox` |
| `data/dbt/run.sh` | Wrapper invoking dbt via uvx with --profiles-dir and --project-dir | VERIFIED | Executable; `set -euo pipefail`; `cd "$DIR"`; `mkdir -p "$DIR/target/sandbox"`; uvx dispatch with case statement for --version vs commands |
| `data/dbt/models/sources.yml` | Declares all four source schemas | VERIFIED | `ecdysis_data`, `inaturalist_data`, `inaturalist_waba_data`, `geographies` with correct table sets |
| `data/dbt/models/staging/stg_geo__us_counties.sql` | WA-filter with `state_fips = '53'` | VERIFIED | `WHERE state_fips = '53'` at line 11 |
| `data/dbt/models/staging/stg_geo__ecoregions.sql` | WA-intersection via ST_Intersects | VERIFIED | `WHERE ST_Intersects(...)` at line 11; cross-staging `ref('stg_geo__us_states')` at line 13 |
| `data/dbt/models/staging/stg_ecdysis__occurrences.sql` | Lat-NULL guard | VERIFIED | `WHERE decimal_latitude IS NOT NULL AND decimal_latitude != ''` at line 11 |
| 8 remaining staging models | Thin source() wrappers | VERIFIED | All 11 staging .sql files confirmed; `dbt ls` reports 11 staging models |
| `data/dbt/models/intermediate/int_waba_link.sql` | `field_id = 18116` | VERIFIED | Present at line 9 |
| `data/dbt/models/intermediate/int_samples_base.sql` | `field_id = 8338` and `field_id = 9963` | VERIFIED | Both present at lines 15 and 17 |
| `data/dbt/models/intermediate/int_combined.sql` | UNION ALL + FULL OUTER JOIN + materialized=table | VERIFIED | `FULL OUTER JOIN` at line 42; `UNION ALL` at line 45; `FALSE/TRUE AS is_provisional` at lines 39 and 78; `BASE TABLE` confirmed live; 0 source() calls (all ref()) |
| `data/dbt/macros/emit_feature_collection.sql` | GeoJSON macro with FORMAT CSV workaround | VERIFIED | 24-line macro; `FORMAT CSV, DELIMITER '', QUOTE '', HEADER false` workaround documented |
| `data/dbt/models/marts/occurrences.sql` | External parquet + ST_Within + ST_Distance fallback | VERIFIED | `materialized='external'`; `location='target/sandbox/occurrences.parquet'`; both spatial-join patterns confirmed |
| `data/dbt/models/marts/counties_geo.sql` | Table mart + post_hook emit_feature_collection(NAME) | VERIFIED | post_hook with `'NAME'` at line 9 |
| `data/dbt/models/marts/ecoregions_geo.sql` | Table mart + post_hook emit_feature_collection(NA_L3NAME) | VERIFIED | post_hook with `'NA_L3NAME'` at line 9 |
| `data/dbt/target/sandbox/occurrences.parquet` | 47,883 rows, sandbox path | VERIFIED | File exists (1.2 MB SNAPPY); pytest confirms 0 null county, 0 null ecoregion |
| `data/dbt/target/sandbox/counties.geojson` | 39 features, NAME property | VERIFIED | File exists (34 KB); pytest confirms FeatureCollection + 39 features + NAME property |
| `data/dbt/target/sandbox/ecoregions.geojson` | 66 features, NA_L3NAME property | VERIFIED | File exists (194 KB); pytest confirms FeatureCollection + NA_L3NAME property |
| `.planning/research/dbt-spike-findings.md` | Slice choice + GDAL trade-off note | VERIFIED | All required sections present: Status, Slice Choice, Open Trade-Offs, Phase 84 To-Do |
| `data/tests/test_dbt_scaffold.py` | 6 tests, all passing | VERIFIED | All 6 tests pass: `6 passed in 0.59s` |
| `data/dbt/tests/scaffold_assert.sh` | Executable, exits 0 | VERIFIED | `scaffold_assert.sh` exits 0; all three SCAFFOLD-03 checks pass |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `data/dbt/run.sh` | `data/dbt/profiles.yml` + `data/dbt/dbt_project.yml` | `--profiles-dir "$DIR"` + `--project-dir "$DIR"` + `cd "$DIR"` | VERIFIED | Both flags + cd present; A1 deviation (uvx instead of uv run) documented and functional |
| `data/dbt/profiles.yml` | `data/beeatlas.duckdb` | `path: ../beeatlas.duckdb` | VERIFIED | Relative path present; `dbt debug` reports "All checks passed!" per SUMMARY |
| `data/dbt/models/sources.yml` | Attached DuckDB schemas | `schema: <name>` entries | VERIFIED | All four schemas declared; live build reads them successfully |
| `marts/occurrences.sql` | `int_combined`, `stg_geo__us_counties`, `stg_geo__ecoregions` | `ref('int_combined')` + two stg_geo refs | VERIFIED | All three refs confirmed in occurrences.sql |
| `counties_geo.sql` + `ecoregions_geo.sql` | `emit_feature_collection` macro | `post_hook=[emit_feature_collection(this, ...)]` | VERIFIED | Both geo marts have post_hook with correct property names |
| `marts/occurrences.sql` config | `data/dbt/target/sandbox/occurrences.parquet` | `materialized='external'` + `location='target/sandbox/occurrences.parquet'` | VERIFIED | Config present; file confirmed on disk at sandbox path |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `occurrences.parquet` | 47,883 rows | `int_combined` TABLE -> spatial join -> DuckDB COPY | Yes — 0 null county/eco confirmed by pytest | VERIFIED |
| `counties.geojson` | 39 features | `stg_geo__us_counties` view -> post-hook COPY | Yes — 39 features (WA county count) | VERIFIED |
| `ecoregions.geojson` | 66 features | `stg_geo__ecoregions` view -> post-hook COPY | Yes — 66 WA-intersecting ecoregions | VERIFIED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full DAG build exits 0 from clean state | `dbt clean && dbt build` | `PASS=23 WARN=0 ERROR=0 SKIP=0 NO-OP=0 TOTAL=23` | PASS |
| Sandbox files created after build | `ls data/dbt/target/sandbox/` | `occurrences.parquet`, `counties.geojson`, `ecoregions.geojson` all present | PASS |
| 23 models in DAG | `bash data/dbt/run.sh ls --resource-type model` | `23` (grep count) | PASS |
| Production surface clean | `git grep -l "data/dbt" -- data/run.py data/nightly.sh .github/workflows/` | exit 1 (no matches) | PASS |
| scaffold_assert.sh | `bash data/dbt/tests/scaffold_assert.sh` | exit 0; all 3 SCAFFOLD-03 checks passed | PASS |
| All 6 pytest tests | `uv run --project data pytest data/tests/test_dbt_scaffold.py -x -v` | `6 passed in 0.59s` | PASS |
| ST_Within in occurrences.sql | `grep -n ST_Within occurrences.sql` | lines 31, 49 | PASS |
| ST_Distance fallback in occurrences.sql | `grep -n ST_Distance occurrences.sql` | lines 36, 58 (ORDER BY ... LIMIT 1 at 38, 60) | PASS |

### Probe Execution

No conventional `scripts/*/tests/probe-*.sh` probes declared. Verification performed via direct command execution above.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SCAFFOLD-01 | Plan 01 | Working dbt-duckdb project with source() declarations | SATISFIED | `dbt_project.yml`, `profiles.yml`, `sources.yml` all present and functional; 4 source schemas declared |
| SCAFFOLD-02 | Plans 01, 04 | `dbt build` exits 0 from clean local checkout | SATISFIED | Live verification: `dbt clean && dbt build` → PASS=23 |
| SCAFFOLD-03 | Plan 01 | Artifacts gitignored; no production-surface references | SATISFIED | `.gitignore` lines 143-146; `git grep` → no matches; `scaffold_assert.sh` → exit 0 |
| PORT-01 | Plans 02, 03, 04 | Slice expressed as DAG with source() + ref() dependencies | SATISFIED | 23 models; all staging use source(); all intermediate use ref(); marts use ref(); DAG covers export.py:23-263 |
| PORT-02 | Plan 04 | ST_Within + ST_Distance nearest-polygon fallback in model SQL | SATISFIED | `occurrences.sql` lines 31, 49 (ST_Within), lines 36-38, 58-60 (ST_Distance ORDER BY LIMIT 1); pytest confirms 0 null county/eco |
| PORT-03 | Plan 04 | Outputs at sandbox path, not `public/data/` | SATISFIED | `location='target/sandbox/occurrences.parquet'`; all three files confirmed in `data/dbt/target/sandbox/` |
| PORT-04 | Plan 04 | Spatial-join semantics captured; deviations in findings doc | SATISFIED | Findings doc records: FORMAT CSV workaround for GeoJSON output, DISTINCT ON (_row_id) behavior, samples.parquet discrepancy |

Requirements TEST-01 through FIND-03 are assigned to Phase 84 — not in scope for Phase 83.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `data/dbt/models/marts/occurrences.sql` | — | `_row_id = ROW_NUMBER() OVER ()` is non-deterministic across runs | Info | Documented in Plan 04 SUMMARY as 47,840 → 47,883 row delta between plans; flagged as Phase 84 DIFF-01 item. Not a stub; data is live and behavioral tests pass. |
| `data/dbt/macros/emit_feature_collection.sql` | — | FORMAT CSV with empty delimiter/quote as GeoJSON workaround | Info | Fragile but functional; documented as Phase 84 FIND-01 candidate. Output files verified structurally correct by pytest and jq. |

No TBD, FIXME, or XXX debt markers found in any dbt project file. No placeholder or stub patterns in model SQL.

### Human Verification Required

None. All critical behaviors are verified programmatically:
- Live `dbt build` execution confirmed
- pytest confirms 0 null county/ecoregion (behavioral equivalence to export.py invariant)
- GeoJSON structural checks performed
- Production-surface isolation verified by git grep

---

## Gaps Summary

No gaps. All five roadmap success criteria are verified against the live codebase:

1. `bash data/dbt/run.sh build` exits 0 from clean checkout — confirmed live
2. Slice choice recorded in `.planning/research/dbt-spike-findings.md` with `## Slice Choice` — confirmed
3. `git grep` returns no production-surface references; `target/` gitignored — confirmed
4. 23-model DAG with source()/ref() dependencies; outputs in `target/sandbox/` — confirmed
5. ST_Within + ST_Distance fallback in `occurrences.sql`; FORMAT CSV deviation documented — confirmed

**Notable deviations** (all documented and functional):
- run.sh uses `uvx --from dbt-duckdb` instead of `uv run --project` (A1: Python 3.14/mashumaro incompatibility workaround)
- `emit_feature_collection` uses FORMAT CSV instead of FORMAT JSON (DuckDB FORMAT JSON wraps values in `{"col_name": value}` envelope)
- run.sh adds `mkdir -p "$DIR/target/sandbox"` before dbt invocation (DuckDB COPY cannot create directories; `dbt clean` removes target/)
- Post-execution commit a675e99 added `cd "$DIR"` to run.sh for relative DuckDB path resolution — already present in current HEAD

---

_Verified: 2026-05-12T20:10:00Z_
_Verifier: Claude (gsd-verifier)_
