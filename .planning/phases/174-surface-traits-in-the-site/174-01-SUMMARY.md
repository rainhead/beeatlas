---
phase: 174-surface-traits-in-the-site
plan: "01"
subsystem: data-pipeline
tags: [species-traits, dbt, python, path-b, parquet-merge]
dependency_graph:
  requires: [Phase 173 species_traits mart]
  provides: [species_traits.parquet emission, 11 trait fields in species.json]
  affects: [data/species_export.py, data/dbt/models/marts/species_traits.sql]
tech_stack:
  added: []
  patterns: [dbt external materialization, python-side parquet merge by canonical_name]
key_files:
  created:
    - data/tests/fixtures/species_traits_fixture.csv
  modified:
    - data/dbt/models/marts/species_traits.sql
    - data/species_export.py
    - data/tests/test_species_export.py
decisions:
  - "Path B confirmed: traits merge in Python, not dbt JOIN — SPECIES_COLUMNS stays 22"
  - "species_traits_fixture.csv has no comment-header lines (DuckDB sniffer can't detect comma delimiter when field-count mismatch or single-column heuristic fires)"
metrics:
  duration: "6m 29s"
  completed: "2026-06-30"
  tasks_completed: 2
  tasks_total: 3
  files_changed: 4
---

# Phase 174 Plan 01: Trait Parquet Emission + species.json Merge Summary

**One-liner:** Add `materialized='external'` to `species_traits.sql`, then merge the 11 trait fields from `species_traits.parquet` into `species.json` rows via a Python-side join keyed on `canonical_name` (Path B — SPECIES_COLUMNS and pyarrow schema unchanged at 22 columns).

## What Was Built

### Task 1: species_traits external parquet + test fixture rig

**`data/dbt/models/marts/species_traits.sql`** — Added `{{ config(materialized='external', location='target/sandbox/species_traits.parquet', format='parquet', options={'CODEC': "'SNAPPY'"}) }}` immediately before `WITH syn AS (`. This causes `bash data/dbt/run.sh build` to emit `species_traits.parquet` into the sandbox alongside `species.parquet` and `higher_taxa.parquet`. The SQL body and `schema.yml` are unchanged; `species_traits` has no contract.

**`data/tests/fixtures/species_traits_fixture.csv`** — Minimal 2-row fixture with `canonical_name` + 11 `_TRAIT_FIELDS` columns. `agapostemon subtilior` has all null traits (exercises null-passthrough path); `bombus mixtus` has `sociality=Social, sociality_source=genus-backbone, nesting=Ground, nesting_source=genus-backbone, native_status=Native` (exercises the merge path). Canonical names match `species_fixture.csv` so the join resolves.

**`data/tests/test_species_export.py`** — Extended `sandbox_parquet` fixture to COPY `species_traits_fixture.csv` to `species_traits.parquet` in the test sandbox (same `COPY ... FROM read_csv ... TO ... (FORMAT PARQUET)` pattern as species/occurrences blocks). All 8 pre-existing tests continue to pass.

### Task 2: Merge step in species_export.py + trait merge tests (TDD)

**`data/species_export.py`** (two additions):

1. Module-level `_TRAIT_FIELDS` constant (11 names: `sociality`, `sociality_source`, `nesting`, `nesting_source`, `diet_breadth`, `diet_breadth_source`, `host_plant_family`, `host_plant_detail`, `native_status`, `host_bees`, `host_bee_count`). NOT added to `SPECIES_COLUMNS`.

2. Merge step inside `export_species_parquet()`, inserted after the slug computation loop and before the pyarrow `columns` build:
   - If `species_traits.parquet` exists: read via `read_parquet`, build `traits_by_name` dict keyed on `canonical_name`, merge all 11 trait fields into each `species_row` dict using `t.get(field)` (returns None when species has no trait data).
   - Else: print warning `"  WARNING: species_traits.parquet not found — trait fields omitted from species.json"` and set each trait field to `None` for all rows (graceful degradation for local dev without full dbt build).
   - `_jsonify_rows()` already serializes all dict keys, so the 11 trait fields flow into `species.json` automatically without any further changes.
   - `SPECIES_COLUMNS` (22 entries) and the pyarrow `schema` block (22 type declarations) are unchanged. `species.parquet` stays at 22 columns. The existing `test_species_parquet_schema_matches` test passes unchanged.

**`data/tests/test_species_export.py`** (two new tests at end of file):
- `test_trait_fields_in_species_json`: after `export_species_parquet()`, asserts at least one `species.json` row has non-null `sociality` (merge worked for `bombus mixtus`).
- `test_trait_fields_absent_gracefully`: unlinks `species_traits.parquet` from sandbox, calls `export_species_parquet()` (must not raise), asserts all rows have `sociality == None`.

Full fast-tier result: **10 tests pass** (8 pre-existing + 2 new), **284 total fast-tier tests pass** (no regressions in any other module).

### Task 3: Operator transition nightly — DEFERRED (checkpoint:human-action)

Task 3 is an operator action on the maderas host requiring Symbiota/AWS credentials and the merged branch. It cannot be automated here. See the checkpoint return below.

**Context:** `species.json` now carries 11 extra trait fields. The nightly integration gate `test_species_json_matches` (in `data/tests/test_dbt_diff.py`, tagged `@integration`) byte-compares the freshly built `species.json` against the S3 baseline. The first post-deploy nightly will fail this gate because the S3 baseline does not yet carry trait fields.

**Required operator action (after branch merges to main and pulls on maderas):**
```bash
SKIP_INTEGRATION_GATE=1 bash data/nightly.sh
```
This refreshes the S3 `species.json` baseline with trait fields. Subsequent nightlies pass normally. The frontend waves (174-02, 174-03) degrade gracefully if this nightly is deferred (trait fields render as absent / null) so it does NOT hard-block frontend development.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] species_traits_fixture.csv: field count mismatch caused DuckDB sniffer failure**
- **Found during:** Task 2 GREEN (first pytest run after implementing merge step)
- **Issue:** The `agapostemon subtilior` row had 10 commas (11 fields) but the header had 12 columns. DuckDB's CSV sniffer could not detect the comma delimiter when the row field count did not match the header field count. The error manifested as the entire header line being treated as a single column name, then `KeyError: 'canonical_name'` in the merge dict comprehension.
- **Fix:** Added one trailing comma to the agapostemon row: `agapostemon subtilior,,,,,,,,,,,` (11 commas = 12 fields).
- **Files modified:** `data/tests/fixtures/species_traits_fixture.csv`
- **Commit:** `724915ea` (bundled with GREEN phase)

**2. [Rule 1 - Bug] species_traits_fixture.csv: comment header lines prevent DuckDB sniffer detection**
- **Found during:** Task 1 (initial fixture with comment lines failed; caught during Task 2 GREEN debug)
- **Issue:** Comment lines starting with `#` prevented DuckDB `auto_detect=True` from correctly detecting the comma delimiter when the fixture had fewer columns than `species_fixture.csv`. (The existing `species_fixture.csv` works because its 21-column structure helps the sniffer; the traits fixture with 12 columns did not.)
- **Fix:** Removed comment header lines from `species_traits_fixture.csv`. The header row and data rows are self-documenting.
- **Files modified:** `data/tests/fixtures/species_traits_fixture.csv`
- **Commit:** `724915ea`

## Known Stubs

None. The merge step produces real trait data from the fixture for `bombus mixtus` and correct null values for `agapostemon subtilior`. No hardcoded empty values, no TODO placeholders.

## Threat Flags

No new network endpoints, auth paths, or trust boundaries introduced. `read_parquet` path is derived from `DBT_SANDBOX_DIR` (operator-controlled constant), identical pattern to `species.parquet` / `occurrences.parquet` reads (T-174-02 accepted in plan threat model).

## Self-Check

PASSED:

- `data/dbt/models/marts/species_traits.sql` — FOUND
- `data/tests/fixtures/species_traits_fixture.csv` — FOUND
- `data/tests/test_species_export.py` — FOUND
- `data/species_export.py` — FOUND
- Commit `9551a8d0` (chore: external parquet + fixture rig) — FOUND
- Commit `e46d1137` (test: RED phase) — FOUND
- Commit `724915ea` (feat: GREEN phase) — FOUND
- `grep -v '^--' species_traits.sql | grep -c "materialized='external'"` → 1
- `grep -c "_TRAIT_FIELDS" species_export.py` → 3 (definition + loop reference + module import)
- `SPECIES_COLUMNS` = 22 entries, pyarrow schema = 22 type declarations — VERIFIED by passing `test_species_parquet_schema_matches` (via full fast suite)
- `grep -c 'species_traits' data/dbt/models/marts/schema.yml` → 0
- `cd data && uv run pytest -m "not integration"` → 284 passed, 9 skipped, 59 deselected
