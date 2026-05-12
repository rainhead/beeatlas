---
phase: 083
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - data/pyproject.toml
  - .gitignore
  - data/dbt/run.sh
  - data/dbt/dbt_project.yml
  - data/dbt/profiles.yml
  - data/dbt/models/sources.yml
  - data/tests/test_dbt_scaffold.py
  - data/dbt/tests/scaffold_assert.sh
autonomous: true
requirements: [SCAFFOLD-01, SCAFFOLD-02, SCAFFOLD-03]
tags: [dbt, duckdb, scaffold, spike]

must_haves:
  truths:
    - "`data/dbt/` is a valid dbt-duckdb project that `dbt parse` accepts"
    - "`bash data/dbt/run.sh build` exits 0 from a clean checkout (empty DAG run — no models yet)"
    - "`data/dbt/target/` and dbt logs are gitignored from the first commit (no target/ files in `git status` after a run)"
    - "`git grep` for `data/dbt` against `data/run.py`, `data/nightly.sh`, `.github/workflows/` returns nothing"
    - "`data/dbt/profiles.yml` declares `extensions: [spatial]` and `path: ../beeatlas.duckdb` (repo-relative)"
    - "`data/dbt/models/sources.yml` declares the four source schemas (`ecdysis_data`, `inaturalist_data`, `inaturalist_waba_data`, `geographies`) over `beeatlas.duckdb`"
    - "`data/tests/test_dbt_scaffold.py` exists with skeleton assertions ready for downstream plans to fill in (post-build file checks)"
  artifacts:
    - path: "data/pyproject.toml"
      provides: "dbt-duckdb==1.10.1 added to [dependency-groups].dev"
      contains: "dbt-duckdb==1.10.1"
    - path: ".gitignore"
      provides: "dbt artifact ignore rules"
      contains: "data/dbt/target/"
    - path: "data/dbt/run.sh"
      provides: "executable wrapper invoking dbt with --profiles-dir and --project-dir set to data/dbt/"
      min_lines: 6
    - path: "data/dbt/dbt_project.yml"
      provides: "dbt project config (name=beeatlas, profile=beeatlas, three model layers)"
    - path: "data/dbt/profiles.yml"
      provides: "duckdb connection profile with extensions: [spatial], path: ../beeatlas.duckdb, schema: dbt_sandbox"
      contains: "extensions:"
    - path: "data/dbt/models/sources.yml"
      provides: "source() declarations for ecdysis_data, inaturalist_data, inaturalist_waba_data, geographies"
    - path: "data/tests/test_dbt_scaffold.py"
      provides: "pytest module with the sandbox-output assertion skeleton (file-existence + non-null county/eco + row count > 0); upstream plans fill bodies via post-build runs"
      min_lines: 30
    - path: "data/dbt/tests/scaffold_assert.sh"
      provides: "shell smoke covering SCAFFOLD-03 (no-production-touch grep + gitignore check)"
  key_links:
    - from: "data/dbt/run.sh"
      to: "data/dbt/profiles.yml + data/dbt/dbt_project.yml"
      via: "--profiles-dir + --project-dir flags"
      pattern: "--profiles-dir.*--project-dir"
    - from: "data/dbt/profiles.yml"
      to: "data/beeatlas.duckdb"
      via: "path: ../beeatlas.duckdb"
      pattern: "path:.*\\.\\./beeatlas\\.duckdb"
    - from: "data/dbt/models/sources.yml"
      to: "attached duckdb schemas inside beeatlas.duckdb"
      via: "schema: <name> entries (one per raw schema)"
      pattern: "schema: (ecdysis_data|inaturalist_data|inaturalist_waba_data|geographies)"
---

<objective>
Stand up the `data/dbt/` scaffolding: install `dbt-duckdb==1.10.1`, commit the project skeleton (`dbt_project.yml`, `profiles.yml`, `sources.yml`, `run.sh`), gitignore the runtime artifacts, and create the test/assertion files that downstream plans will populate post-build. Closes SCAFFOLD-01 and SCAFFOLD-03 fully; closes the *runnable* half of SCAFFOLD-02 (empty `dbt build` exits 0). The slice-green half of SCAFFOLD-02 closes in Plan 04 once the models land.

Purpose: Establish the project skeleton + isolation invariants (no production-surface contamination, no committed runtime state) before any model SQL is authored. Wave 0 — everything downstream depends on this.

Output: A working but empty dbt project under `data/dbt/`, plus a test scaffold (`data/tests/test_dbt_scaffold.py`) and a shell smoke (`data/dbt/tests/scaffold_assert.sh`) ready for plans 02–04 to drive.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/083-scaffold-slice-port/083-CONTEXT.md
@.planning/phases/083-scaffold-slice-port/083-RESEARCH.md
@.planning/phases/083-scaffold-slice-port/083-PATTERNS.md
@.planning/phases/083-scaffold-slice-port/083-VALIDATION.md
@CLAUDE.md
@data/pyproject.toml
@data/nightly.sh
@.gitignore

<interfaces>
Canonical scaffolding artifacts live in 083-RESEARCH.md:
- Pattern 1 (profiles.yml, lines 295-309)
- Pattern 2 (dbt_project.yml, lines 317-337)
- Pattern 3 (sources.yml, lines 341-372)
- Pattern 6 (run.sh wrapper, lines 484-490)

Analog map for the four modified/wrapper files lives in 083-PATTERNS.md:
- data/pyproject.toml: append to [dependency-groups].dev (lines 31-48 of PATTERNS)
- data/dbt/run.sh: shell idioms from data/nightly.sh:1,6,8 (lines 52-77 of PATTERNS)
- data/tests/test_dbt_scaffold.py: shape from data/tests/test_export.py:46-148 (lines 80-145 of PATTERNS)
- .gitignore: section-header style from existing patterns at .gitignore:1,75,139 (lines 164-179 of PATTERNS)

Standard validation IDs from 083-VALIDATION.md to reuse in `<automated>` blocks:
- V-SCAFFOLD-01 (integration: dbt build exits 0)
- V-SCAFFOLD-02 (yaml shape: spatial in extensions)
- V-SCAFFOLD-03a (shell: no production references)
- V-SCAFFOLD-03b (shell: gitignore covers target/ + logs/)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install dbt-duckdb dependency and verify Python 3.14 resolution</name>
  <files>data/pyproject.toml</files>
  <read_first>
    - data/pyproject.toml (full file — single-pass read; locate `[dependency-groups]` and `requires-python`)
    - .planning/phases/083-scaffold-slice-port/083-RESEARCH.md (Standard Stack table + Pitfall 4 + Assumption A1: lines 148-170, 585-593, 791-792)
    - .planning/phases/083-scaffold-slice-port/083-PATTERNS.md lines 31-48 (pyproject pattern)
  </read_first>
  <action>
    Append `"dbt-duckdb==1.10.1"` to the existing `[dependency-groups].dev` list in `data/pyproject.toml` adjacent to the existing `"pytest>=9.0.2"` entry. Do NOT add `dbt-core` directly (RESEARCH Pitfall 4 — let it resolve transitively from the adapter). Do NOT touch `[project].dependencies`, `requires-python`, or `[tool.beeatlas]`. After editing, run `uv sync --project data --dev` from repo root to install. If it errors under Python 3.14 (Assumption A1), record the failure and fall back to either (a) pinning `dbt-duckdb==1.10.0` (released 2025-11-05) or (b) noting "use `uv run --python 3.13`" in the wrapper script — pick whichever leaves Python 3.14 as the runtime for the rest of `data/`. Verify the install with `uv run --project data dbt --version` and `uv tree --project data | grep -E "dbt-(core|duckdb)"`.
  </action>
  <verify>
    <automated>uv run --project data dbt --version 2>&1 | grep -E 'dbt-duckdb:\s+1\.10\.'</automated>
    <automated>uv tree --project data 2>&1 | grep -E '^[[:space:]]*dbt-(core|duckdb) ' | wc -l | grep -E '^[[:space:]]*2$'</automated>
  </verify>
  <done>
    `uv run --project data dbt --version` prints both core and adapter versions (adapter at 1.10.x). `data/pyproject.toml` has exactly one new line under `[dependency-groups].dev` adding the adapter pin. No change to `requires-python` or `[project].dependencies`.
  </done>
  <acceptance_criteria>
    - `dbt-duckdb==1.10.1` (or A1-fallback pin) present in `data/pyproject.toml [dependency-groups].dev`
    - `dbt --version` returns 0 exit and reports both packages
    - `uv tree` lists exactly 2 lines matching `dbt-(core|duckdb)` (no double-pin, no missing core)
    - No edits to `[project].dependencies` or `requires-python`
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Add dbt artifact gitignore rules</name>
  <files>.gitignore</files>
  <read_first>
    - .gitignore (full file — single-pass read; identify the section-header comment style around lines 1, 75, 139)
    - .planning/phases/083-scaffold-slice-port/083-RESEARCH.md (Pitfall 8: lines 626-633)
    - .planning/phases/083-scaffold-slice-port/083-PATTERNS.md lines 164-179
  </read_first>
  <action>
    Append a new section to `.gitignore` (matching the existing `# Section title` comment style) covering dbt runtime artifacts: `data/dbt/target/`, `data/dbt/logs/`, `data/dbt/dbt_packages/`. The existing `*.parquet` rule at line 139 already covers the external parquet output incidentally, but the targeted `data/dbt/target/` rule is the load-bearing one — it also covers `manifest.json`, `run_results.json`, `compiled/`, etc. Put these rules BEFORE the first `dbt build` runs (D-from-CONTEXT scaffolding decision; SCAFFOLD-03 gate per RESEARCH Pitfall 8). Verify with `git check-ignore data/dbt/target/manifest.json` (must print the path) and `git status --short data/dbt/target/ 2>/dev/null` (must be empty after a build).
  </action>
  <verify>
    <automated>git check-ignore data/dbt/target/manifest.json && git check-ignore data/dbt/logs/dbt.log && git check-ignore data/dbt/dbt_packages/foo</automated>
    <automated>grep -v '^#' .gitignore | grep -cE '^data/dbt/(target|logs|dbt_packages)/?$' | grep -E '^3$'</automated>
  </verify>
  <done>
    `.gitignore` contains three new uncommented lines matching the three dbt runtime paths. `git check-ignore` returns 0 (path is ignored) for each. No existing rules removed.
  </done>
  <acceptance_criteria>
    - V-SCAFFOLD-03b passes: `data/dbt/target/`, `data/dbt/logs/`, `data/dbt/dbt_packages/` all gitignored
    - Section header added in existing style (per PATTERNS analog)
    - No existing `.gitignore` rules removed or reordered
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: Create data/dbt/run.sh wrapper + executable bit</name>
  <files>data/dbt/run.sh</files>
  <read_first>
    - data/nightly.sh (lines 1-18 — header preamble, `set -euo pipefail`, `SCRIPT_DIR` idiom; this is the only existing shell wrapper in `data/`)
    - .planning/phases/083-scaffold-slice-port/083-RESEARCH.md Pattern 6 (lines 484-490 — the canonical run.sh body)
    - .planning/phases/083-scaffold-slice-port/083-PATTERNS.md lines 52-77 (analog mapping)
  </read_first>
  <action>
    Create `data/dbt/run.sh` matching the canonical code in 083-RESEARCH.md Pattern 6 (lines 484-490). Required shape: shebang `#!/usr/bin/env bash`, brief header comment ("Wrapper: ensures dbt finds in-repo profiles.yml regardless of cwd"), `set -euo pipefail` (per `data/nightly.sh` line 6 idiom), a `DIR` assignment using the `cd "$(dirname "${BASH_SOURCE[0]}")" && pwd` idiom from nightly.sh line 8, and an `exec uv run --project "$DIR/.." dbt "$@" --profiles-dir "$DIR" --project-dir "$DIR"` line. Do NOT inherit AWS/boto/S3/CloudFront/timing helpers from `nightly.sh` (PATTERNS line 74 — "do not copy" list). After writing, `chmod +x data/dbt/run.sh` so executors invoking `bash data/dbt/run.sh ...` *and* `data/dbt/run.sh ...` both work. Smoke: `data/dbt/run.sh --version` should print dbt + adapter versions (depends on Task 1).
  </action>
  <verify>
    <automated>test -x data/dbt/run.sh && bash -n data/dbt/run.sh</automated>
    <automated>grep -qE '^set -euo pipefail$' data/dbt/run.sh && grep -qE 'exec uv run --project.*dbt.*--profiles-dir.*--project-dir' data/dbt/run.sh</automated>
    <automated>bash data/dbt/run.sh --version 2>&1 | grep -E 'dbt-duckdb:'</automated>
  </verify>
  <done>
    `data/dbt/run.sh` is executable, parses cleanly under bash, contains `set -euo pipefail` and the `exec uv run ... dbt ... --profiles-dir ... --project-dir ...` line. `bash data/dbt/run.sh --version` prints version info (proves it correctly delegates).
  </done>
  <acceptance_criteria>
    - File executable (`test -x` passes)
    - `bash -n` (syntax check) passes
    - `set -euo pipefail` present
    - The wrapper passes both `--profiles-dir "$DIR"` and `--project-dir "$DIR"` (RESEARCH Pitfall 1 — explicit beats env var)
    - Does NOT inherit AWS/S3/timing helpers from nightly.sh
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 4: Create dbt_project.yml + profiles.yml + models/sources.yml</name>
  <files>data/dbt/dbt_project.yml, data/dbt/profiles.yml, data/dbt/models/sources.yml</files>
  <read_first>
    - .planning/phases/083-scaffold-slice-port/083-RESEARCH.md Pattern 1 (profiles.yml: lines 295-309), Pattern 2 (dbt_project.yml: lines 317-337), Pattern 3 (sources.yml: lines 341-372)
    - .planning/phases/083-scaffold-slice-port/083-CONTEXT.md decisions block (lines 43-95 — slice scope, schema name `dbt_sandbox`, source schemas locked)
    - .planning/phases/083-scaffold-slice-port/083-RESEARCH.md Pitfall 5 (lines 595-606 — `int_combined` needs table materialization), Pitfall 6 (json autoload Assumption A2)
  </read_first>
  <action>
    Create three YAML files by transcribing the canonical patterns from 083-RESEARCH.md:

    **`data/dbt/dbt_project.yml`** — copy Pattern 2 (lines 317-337) verbatim, with `name: beeatlas`, `profile: beeatlas`, `config-version: 2`, `model-paths: ["models"]`, `macro-paths: ["macros"]`, `target-path: "target"`, `clean-targets: ["target", "dbt_packages", "logs"]`. The `models.beeatlas` block declares `staging: +materialized: view`, `intermediate: +materialized: view`, `marts: +materialized: table`. Add the `intermediate.int_combined: +materialized: table` override per RESEARCH Pitfall 5 (line 600) — this is the lighter-touch fix that aligns with dbt convention.

    **`data/dbt/profiles.yml`** — copy Pattern 1 (lines 295-309) verbatim. Profile name `beeatlas`, target `sandbox`, output `sandbox` with `type: duckdb`, `path: ../beeatlas.duckdb` (repo-relative — Pitfall 3 forbids absolute paths), `schema: dbt_sandbox` (per CONTEXT D — `dbt_sandbox` schema name), `threads: 4`, `extensions: [spatial]`, `external_root: target/sandbox`. Defensive add: include `json` alongside `spatial` in the `extensions:` list per Assumption A2 / Pitfall 6 (cheap defensive add — avoids "to_json does not exist" errors in the post-hook macro that lands in Plan 04).

    **`data/dbt/models/sources.yml`** — copy Pattern 3 (lines 341-372) verbatim. `version: 2`. Four `sources:` blocks, one each for `ecdysis_data` (tables: `occurrences`, `identifications`, `occurrence_links`), `inaturalist_data` (tables: `observations`, `observations__ofvs`), `inaturalist_waba_data` (tables: `observations`, `observations__ofvs`, `taxon_lineage`), `geographies` (tables: `us_counties`, `us_states`, `ecoregions`). Each `source.name` equals the `schema:` value (these are attached schemas inside `beeatlas.duckdb`).

    After writing all three, run `bash data/dbt/run.sh parse` from repo root — must exit 0 (parse-only check; no models exist yet so it doesn't actually run anything but it loads YAML + sources). Then run `bash data/dbt/run.sh debug` — must report "All checks passed!" (proves the connection to `../beeatlas.duckdb` resolves and spatial extension loads).
  </action>
  <verify>
    <automated>bash data/dbt/run.sh parse 2>&1 | tail -5 | grep -iE 'parse|done|success'</automated>
    <automated>bash data/dbt/run.sh debug 2>&1 | grep -E 'All checks passed'</automated>
    <automated>python -c "import yaml; p=yaml.safe_load(open('data/dbt/profiles.yml')); ext=p['beeatlas']['outputs']['sandbox']['extensions']; assert 'spatial' in ext, ext"</automated>
    <automated>python -c "import yaml; s=yaml.safe_load(open('data/dbt/models/sources.yml')); names=[x['name'] for x in s['sources']]; assert set(names) == {'ecdysis_data','inaturalist_data','inaturalist_waba_data','geographies'}, names"</automated>
  </verify>
  <done>
    `dbt parse` and `dbt debug` both green from `bash data/dbt/run.sh`. `profiles.yml` declares `extensions: [spatial, json]` (or `[spatial]` if Assumption A2 holds and Task 1 didn't error on json autoload — planner's call), `path: ../beeatlas.duckdb`, `schema: dbt_sandbox`, `external_root: target/sandbox`. `sources.yml` declares exactly the four source schemas with the table sets from CONTEXT lines 60-71. `dbt_project.yml` has the three-layer materialization config including the `int_combined: +materialized: table` override.
  </done>
  <acceptance_criteria>
    - V-SCAFFOLD-02 passes: `extensions` contains `spatial`
    - `dbt debug` reports "All checks passed!" (proves connection + extension load + profiles-dir resolution)
    - `dbt parse` exits 0 (proves YAML well-formed and sources resolvable)
    - sources.yml lists all four schemas with the table set from CONTEXT
    - dbt_project.yml has `intermediate.int_combined: +materialized: table` override (per RESEARCH Pitfall 5)
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 5: Scaffold test files (test_dbt_scaffold.py + scaffold_assert.sh) and prove SCAFFOLD-03 + empty-DAG build green</name>
  <files>data/tests/test_dbt_scaffold.py, data/dbt/tests/scaffold_assert.sh</files>
  <read_first>
    - data/tests/test_export.py (full file — pytest analog; especially lines 46-71 for parquet schema+count, lines 137-148 for GeoJSON structural)
    - data/nightly.sh (lines 1-8 — shell idioms for scaffold_assert.sh)
    - .planning/phases/083-scaffold-slice-port/083-PATTERNS.md lines 80-160 (analog mapping for both files)
    - .planning/phases/083-scaffold-slice-port/083-VALIDATION.md (Wave 0 Requirements + Standard validation commands table)
    - .planning/phases/083-scaffold-slice-port/083-RESEARCH.md "Phase Requirements → Test Map" (lines 733-743) + Pitfall 8 (lines 626-633)
  </read_first>
  <action>
    Create two test files:

    **`data/tests/test_dbt_scaffold.py`** — pytest module with the assertion skeleton that Plan 04 will rely on post-build. Follow the analog at `data/tests/test_export.py:46-148` (PATTERNS lines 80-145). Define `SANDBOX = Path(__file__).resolve().parent.parent / "dbt" / "target" / "sandbox"` at module top. Include these tests, each marked with `@pytest.mark.skipif(not (SANDBOX / "occurrences.parquet").exists(), reason="run dbt build first")`:
    - `test_occurrences_parquet_exists`: asserts `(SANDBOX / "occurrences.parquet").exists()`
    - `test_occurrences_has_rows_and_zero_null_county_or_eco`: copy verbatim the row-count + null-county/null-eco shape from `test_export.py:60-71` (mirrors `export.py:266-277` invariants) but read from `SANDBOX / "occurrences.parquet"` instead of the fixture
    - `test_counties_geojson_structural`: copy from `test_export.py:137-148` — assert `type == 'FeatureCollection'`, `features` non-empty (>= 30, per VALIDATION manual-only note: WA has 39 counties), each feature has `geometry` and `properties.NAME`
    - `test_ecoregions_geojson_structural`: same shape, property `NA_L3NAME` (PATTERNS line 130)
    - `test_profiles_yml_declares_spatial`: parse `data/dbt/profiles.yml` with `yaml.safe_load`, assert `'spatial' in profiles['beeatlas']['outputs']['sandbox']['extensions']` (mirrors V-SCAFFOLD-02). This one is NOT skipif-guarded — runs always.
    - `test_no_production_dbt_references`: `subprocess.run(["git", "grep", "-l", "data/dbt", "data/run.py", "data/nightly.sh", ".github/workflows/"], capture_output=True)` — assert returncode != 0 (grep returns 1 on no-match) AND stdout is empty. Mirrors V-SCAFFOLD-03a.

    Do NOT import `export as export_mod` and do NOT use `fixture_con`/`fixture_db`/`monkeypatch.setattr(export_mod, ...)` — PATTERNS lines 132-135 explicitly forbid those for the scaffold module. Imports: `import json, subprocess; from pathlib import Path; import duckdb; import pytest; import yaml`.

    **`data/dbt/tests/scaffold_assert.sh`** — shell smoke covering SCAFFOLD-03 invariants in one fast pass. Shape (per PATTERNS lines 150-160 + RESEARCH "Phase Requirements → Test Map" lines 733-743):
    - Shebang `#!/usr/bin/env bash` + `set -euo pipefail` + `SCRIPT_DIR` idiom
    - Assert file presence: `data/dbt/dbt_project.yml`, `data/dbt/profiles.yml`, `data/dbt/models/sources.yml`, `data/dbt/run.sh`
    - Assert gitignore: `git check-ignore data/dbt/target/manifest.json data/dbt/logs/dbt.log data/dbt/dbt_packages/foo` exits 0 for each (Pitfall 8)
    - Assert no-production-touch: `! git grep -E 'data/dbt' -- data/run.py data/nightly.sh .github/workflows/` (V-SCAFFOLD-03a)
    - `chmod +x` it after writing.

    Final acceptance step for this task — prove the empty-DAG build is green now (closes the runnable half of SCAFFOLD-02 before any models exist; the full-slice green build is Plan 04's acceptance): `bash data/dbt/run.sh build` (no models means it's a no-op DAG; dbt should still exit 0 with "Nothing to do"). Then `bash data/dbt/tests/scaffold_assert.sh` (all green). Then `uv run --project data pytest data/tests/test_dbt_scaffold.py::test_profiles_yml_declares_spatial data/tests/test_dbt_scaffold.py::test_no_production_dbt_references -x` (the two non-skipif tests should pass; the rest are correctly skipped).
  </action>
  <verify>
    <automated>bash data/dbt/run.sh build 2>&1 | tail -3 | grep -iE 'completed|nothing to do|success|done'</automated>
    <automated>bash data/dbt/tests/scaffold_assert.sh</automated>
    <automated>uv run --project data pytest data/tests/test_dbt_scaffold.py::test_profiles_yml_declares_spatial data/tests/test_dbt_scaffold.py::test_no_production_dbt_references -x</automated>
    <automated>! git grep -E 'data/dbt' -- data/run.py data/nightly.sh .github/workflows/ 2>/dev/null</automated>
  </verify>
  <done>
    `bash data/dbt/run.sh build` exits 0 against the empty model set. `scaffold_assert.sh` exits 0. The two non-skipif pytest tests pass. The four skipif tests are correctly marked skipped (no parquet yet). `git grep 'data/dbt'` against the three forbidden paths returns empty.
  </done>
  <acceptance_criteria>
    - V-SCAFFOLD-01 partial pass: `dbt build` exits 0 (empty DAG — full-slice green is Plan 04 acceptance)
    - V-SCAFFOLD-03a passes (no production-surface references)
    - `data/tests/test_dbt_scaffold.py` exists with 6 named tests in the skeleton shape from `test_export.py`
    - `data/dbt/tests/scaffold_assert.sh` is executable and exits 0
    - `data/tests/test_dbt_scaffold.py` does NOT import `export as export_mod` or use export fixtures
  </acceptance_criteria>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| repo → dbt CLI | dbt-duckdb adapter runs locally against a file-backed DuckDB; no network calls except DuckDB's auto-install of the spatial extension over HTTPS (DuckDB defaults) |
| repo → S3 (transitive via `data/nightly.sh`) | NOT a Phase-83 surface — SCAFFOLD-03 guards against this contamination |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-83-01 | Tampering | supply chain (dbt-duckdb pin) | mitigate | Pin `dbt-duckdb==1.10.1` exactly in `data/pyproject.toml`; let `dbt-core` resolve transitively per Pitfall 4 |
| T-83-02 | Information disclosure | accidental commit of dbt runtime artifacts (target/, logs/) | mitigate | Add `.gitignore` entries in Task 2 BEFORE any `dbt build` runs (Pitfall 8); verify via `git check-ignore` |
| T-83-03 | Tampering | accidental contamination of production paths (`data/run.py`, `data/nightly.sh`, `.github/workflows/`) | mitigate | SCAFFOLD-03 grep gate (V-SCAFFOLD-03a) — automated check in Task 5 and `scaffold_assert.sh` |
| T-83-04 | Information disclosure | DuckDB spatial extension auto-install over the network | accept | DuckDB defaults; spike scope; the extension is bundled with `duckdb>=1.4` so most environments will not actually hit the network |

</threat_model>

<verification>
After all 5 tasks complete:
1. `bash data/dbt/run.sh build` exits 0 (empty DAG run).
2. `bash data/dbt/run.sh debug` reports "All checks passed!".
3. `bash data/dbt/tests/scaffold_assert.sh` exits 0.
4. `uv run --project data pytest data/tests/test_dbt_scaffold.py::test_profiles_yml_declares_spatial data/tests/test_dbt_scaffold.py::test_no_production_dbt_references -x` passes.
5. `git grep 'data/dbt'` against `data/run.py`, `data/nightly.sh`, `.github/workflows/` is empty.
6. `git status --short data/dbt/target/` is empty after the build.
</verification>

<success_criteria>
- SCAFFOLD-01 ✅ (project skeleton present, source declarations enumerate all four schemas)
- SCAFFOLD-02 ✅ partial (empty-DAG `dbt build` exits 0; full-slice green is Plan 04 acceptance)
- SCAFFOLD-03 ✅ (gitignore in place; no production-surface references)
- All must_have `truths`, `artifacts`, and `key_links` observable per the verification commands above.
</success_criteria>

<output>
After completion, create `.planning/phases/083-scaffold-slice-port/083-01-SUMMARY.md` capturing: dbt-duckdb resolution result under Python 3.14 (A1 outcome — pin held or fell back), final extensions list (`[spatial]` or `[spatial, json]`), any deviation from RESEARCH patterns, and the empty-DAG build runtime.
</output>
