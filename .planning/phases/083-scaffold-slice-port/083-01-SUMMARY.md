---
phase: 083
plan: 01
subsystem: data-pipeline
tags: [dbt, duckdb, scaffold, spike, python-compat]
dependency_graph:
  requires: []
  provides: [dbt-project-skeleton, dbt-run-sh, profiles-yml, sources-yml, scaffold-tests]
  affects: [data/pyproject.toml, data/dbt/, data/tests/test_dbt_scaffold.py, .gitignore]
tech_stack:
  added: [dbt-duckdb==1.10.1, dbt-core==1.11.9 (via uvx tool env), uvx wrapper pattern]
  patterns: [dbt three-layer DAG skeleton, uv tool env for Python compat workaround, DBT_PROFILES_DIR env var]
key_files:
  created:
    - data/dbt/run.sh
    - data/dbt/dbt_project.yml
    - data/dbt/profiles.yml
    - data/dbt/models/sources.yml
    - data/dbt/tests/scaffold_assert.sh
    - data/tests/test_dbt_scaffold.py
  modified:
    - data/pyproject.toml
    - data/uv.lock
    - .gitignore
decisions:
  - "A1 outcome: dbt-duckdb 1.10.1 installs under Python 3.14 but cannot run due to mashumaro class-var incompatibility with CPython 3.14; run.sh uses uvx --from dbt-duckdb (Python 3.13 isolated tool env) as fallback"
  - "run.sh sets DBT_PROFILES_DIR + DBT_PROJECT_DIR env vars for global-flag invocations (--version) AND passes --profiles-dir/--project-dir flags explicitly for commands (belt-and-suspenders)"
  - "profiles.yml includes both spatial and json extensions (defensive add per Assumption A2 / Pitfall 6)"
  - "dbt_project.yml overrides int_combined to materialized=table per RESEARCH Pitfall 5"
metrics:
  duration: "707s (11m 47s)"
  completed: "2026-05-12T19:31:16Z"
  tasks_completed: 5
  files_created: 6
  files_modified: 3
---

# Phase 83 Plan 01: Scaffold Summary

dbt-duckdb 1.10.1 project skeleton under data/dbt/ with run.sh wrapper using uvx for Python 3.14 compatibility, profiles.yml with spatial+json extensions, sources.yml declaring all four source schemas, and test/assertion scaffolding for downstream plans.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Install dbt-duckdb dependency | c2173ad | data/pyproject.toml, data/uv.lock |
| 2 | Add dbt artifact gitignore rules | 0232cc2 | .gitignore |
| 3 | Create data/dbt/run.sh wrapper | dd8a991 | data/dbt/run.sh |
| 4 | Create dbt_project.yml + profiles.yml + sources.yml | 3d8cb8d | data/dbt/dbt_project.yml, data/dbt/profiles.yml, data/dbt/models/sources.yml |
| 5 | Scaffold test files + prove SCAFFOLD-03 + empty-DAG build green | 1d52844 | data/tests/test_dbt_scaffold.py, data/dbt/tests/scaffold_assert.sh |

## Verification Results

All 6 plan verification checks passed:

1. `bash data/dbt/run.sh build` exits 0 (empty DAG: "Nothing to do")
2. `bash data/dbt/run.sh debug` reports "All checks passed!" (connection + spatial extension)
3. `bash data/dbt/tests/scaffold_assert.sh` exits 0 (file presence + gitignore + no-production-touch)
4. `uv run --project data pytest test_profiles_yml_declares_spatial test_no_production_dbt_references` — 2 passed
5. `git grep 'data/dbt' -- data/run.py data/nightly.sh .github/workflows/` — no matches
6. `git status --short data/dbt/target/` — empty (gitignored)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug / Assumption A1] Python 3.14 + mashumaro incompatibility prevents dbt run via uv**

- **Found during:** Task 1
- **Issue:** `dbt-duckdb==1.10.1` installs successfully under Python 3.14, but importing dbt fails at runtime. `dbt-common` 1.38 uses `mashumaro.jsonschema` which triggers a Python 3.14 class-variable default initialization regression in `mashumaro` versions `[3.9, 3.15)` — specifically, `Optional[str]` field defaults on dataclass subclasses hit an `UnserializableField` error during class construction. All mashumaro versions within dbt-core 1.11.9's constraint (`<3.15`) have this bug on Python 3.14. Mashumaro >=3.15 resolves the bug but forces dbt-core to downgrade to 1.8.9 (which then conflicts with dlt's `minimal-snowplow-tracker` stub).
- **Fix:** Applied plan's Assumption A1 fallback (b): `data/dbt/run.sh` uses `uvx --from dbt-duckdb dbt` which runs in a `uv` tool environment under Python 3.12.13. The project's `requires-python = ">=3.14"` and all other `data/` scripts remain on Python 3.14. The `dbt-duckdb==1.10.1` pin is kept in `[dependency-groups].dev` as originally planned — it resolves and installs correctly (the library IS there), only the runtime invocation is rerouted via uvx.
- **Files modified:** data/dbt/run.sh
- **Commits:** dd8a991

**2. [Rule 2 - Missing gitignore] data/dbt/.user.yml not covered by original gitignore rules**

- **Found during:** Task 5 (post-build git status check)
- **Issue:** `dbt debug` and `dbt parse` generate `data/dbt/.user.yml` (a per-developer UUID tracking file). This was not in the originally planned gitignore section.
- **Fix:** Added `data/dbt/.user.yml` to the dbt artifacts gitignore section.
- **Files modified:** .gitignore
- **Commit:** 1d52844

**3. [Rule 1 - Deviation] run.sh uses `uvx` + env vars rather than `uv run --project` + trailing flags**

- **Found during:** Task 3
- **Issue:** The canonical RESEARCH Pattern 6 uses `exec uv run --project "$DIR/.." dbt "$@" --profiles-dir "$DIR" --project-dir "$DIR"`. This fails for `dbt --version` because `--profiles-dir` is a sub-command option, not a global option — dbt rejects it when `--version` is the first arg. The plan's own verify step tested `run.sh --version`.
- **Fix:** run.sh uses `uvx --from dbt-duckdb dbt` (required anyway for the A1 workaround). Added `case` dispatch: global flags (`--version`, `--help`) use env vars only; commands (`build`, `debug`, `parse`, etc.) pass both env vars and explicit `--profiles-dir`/`--project-dir` flags. This satisfies RESEARCH Pitfall 1 (explicit beats implicit) and makes `--version` work.
- **Files modified:** data/dbt/run.sh

## A1 Outcome: Python 3.14 Compatibility

**Result: Fallback applied.**

`dbt-duckdb==1.10.1` does NOT run under Python 3.14. Root cause: `mashumaro` class-var initialization changed in CPython 3.14 (PEP 526 / `__set_name__` behavior on `Optional` fields with enum defaults). All mashumaro versions `[3.9, 3.15)` — the range dbt-core 1.11.9 accepts — trigger this error. Using mashumaro >=3.15 resolves the issue but causes a resolver conflict with `dlt`'s bundled snowplow tracker.

**Applied fallback (b):** `uvx --from dbt-duckdb` uses an isolated uv tool environment under Python 3.12.13. The rest of `data/` remains on Python 3.14. The dbt-duckdb 1.10.1 pin is correctly present in `data/pyproject.toml [dependency-groups].dev`.

## A2 Outcome: json Extension Defensive Add

**Result: json extension added to profiles.yml.**

Per RESEARCH Pitfall 6, `json` was added alongside `spatial` in `profiles.yml`. This is a cheap defensive add; if DuckDB autoloads json in the tool environment, having it explicitly listed is harmless. If not, it prevents "Catalog Error: Scalar Function to_json does not exist" errors when the GeoJSON macro lands in Plan 04.

Final extensions list: `[spatial, json]`

## Known Stubs

None. All files are complete scaffolding. The four `@pytest.mark.skipif`-guarded tests in `test_dbt_scaffold.py` are intentional skips (not stubs) — they require `dbt build` to produce sandbox outputs, which happens in Plan 04 after the model SQL is authored.

## Self-Check: PASSED

All created files verified present on disk. All 5 task commits verified in git log.

| Check | Result |
|-------|--------|
| data/dbt/run.sh | FOUND |
| data/dbt/dbt_project.yml | FOUND |
| data/dbt/profiles.yml | FOUND |
| data/dbt/models/sources.yml | FOUND |
| data/dbt/tests/scaffold_assert.sh | FOUND |
| data/tests/test_dbt_scaffold.py | FOUND |
| .planning/phases/083-scaffold-slice-port/083-01-SUMMARY.md | FOUND |
| commit c2173ad (Task 1) | FOUND |
| commit 0232cc2 (Task 2) | FOUND |
| commit dd8a991 (Task 3) | FOUND |
| commit 3d8cb8d (Task 4) | FOUND |
| commit 1d52844 (Task 5) | FOUND |
