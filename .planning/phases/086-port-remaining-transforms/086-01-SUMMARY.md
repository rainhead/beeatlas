---
phase: "086"
plan: "01"
subsystem: data-pipeline
tags: [pytest, diff-harness, species, VALIDATE-01, wave-0]
dependency_graph:
  requires: []
  provides: [species-diff-harness]
  affects: [086-02, 086-03, 086-04, 086-05]
tech_stack:
  added: []
  patterns: [pytest-skipif-named-guard, byte-comparable-diff]
key_files:
  created: []
  modified:
    - data/tests/test_dbt_diff.py
decisions:
  - Named guard constant `SANDBOX_SPECIES_PARQUET_GUARD` (no leading underscore) distinguishes the species parquet guard from `_SANDBOX_GUARD` (occurrences) — grep-able difference as specified in PATTERNS.md
  - JSON tests use inline `pytest.mark.skipif` (not a shared guard constant) because species.json and seasonality.json are produced by Plan 086-05 independently from species.parquet (Plan 086-04) — they must SKIP independently
  - Byte comparison via `.read_bytes()` for JSON tests (not `json.loads` + dict equality) — key ordering and separator formatting are load-bearing per RESEARCH §Pitfall 3
metrics:
  duration: "82s"
  completed: "2026-05-14"
  tasks_completed: 2
  files_changed: 1
---

# Phase 086 Plan 01: VALIDATE-01 Species Diff Harness Summary

5 SKIP-guarded species artifact diff tests added to `test_dbt_diff.py` before any species mart code lands — subsequent waves get green/SKIP signal incrementally.

## What Was Built

Extended `data/tests/test_dbt_diff.py` with a `# PORT-01: Species artifact diff tests` section containing:

**New guard constant:**
- `SANDBOX_SPECIES_PARQUET_GUARD` — checks `(SANDBOX / "species.parquet").exists()` with reason "run `bash data/dbt/run.sh build` first to produce sandbox species.parquet"

**3 parquet diff tests (guarded by SANDBOX_SPECIES_PARQUET_GUARD):**
1. `test_species_parquet_row_count_matches` — sandbox vs public row count (baseline: 629 rows)
2. `test_species_parquet_schema_matches` — 19-column (name, type) list equality
3. `test_species_canonical_name_key_set_matches` — anti-join in both EXCEPT directions

**2 JSON byte-comparable tests (inline skipif, independent guards):**
4. `test_species_json_matches` — `species.json` `.read_bytes()` equality
5. `test_seasonality_json_matches` — `seasonality.json` `.read_bytes()` equality

## Test Count Before and After

| State | Total | Pass | Skip | Fail |
|-------|-------|------|------|------|
| Before (Phase 085) | 11 collected | 10 pass* | 1 skip** | 0 |
| After (this plan) | 16 collected | 10 pass* | 6 skip | 0 |

*In a worktree without sandbox outputs, all tests SKIP. The "10 pass" count is the documented baseline for when sandbox artifacts exist.
**The GeoJSON parametrize tests count as 2 tests in pytest's counting (counties + ecoregions).

**In this worktree (no sandbox artifacts):** 16 skipped, 0 passed, exit 0.

## Wave 0 → Wave 3 Progression

This plan is Wave 0 of the VALIDATE-01 gate strategy:

1. **Wave 0 (this plan):** Diff stubs land — all SKIP. Existing harness: 11 tests, all SKIP (no sandbox). New species tests: 5 SKIP.
2. **Wave 1 (086-02, 086-03):** Source declarations, staging views, LIN-05 test — no new sandbox artifacts, harness unaffected.
3. **Wave 2 (086-04):** Species mart dbt model builds `sandbox/species.parquet` → 3 parquet diff tests execute and must PASS; JSON tests still SKIP.
4. **Wave 2 (086-05):** Python JSON post-step writes `sandbox/species.json` + `sandbox/seasonality.json` → 2 JSON diff tests execute and must PASS.

## Deviations from Plan

None — plan executed exactly as written. Both tasks (3 parquet tests + 2 JSON tests) are committed together in a single commit since they both modify only `data/tests/test_dbt_diff.py`.

## Self-Check: PASSED

- [x] `data/tests/test_dbt_diff.py` modified: `[ -f data/tests/test_dbt_diff.py ] && echo FOUND`
- [x] Commit `d1a52a5` exists: confirmed in git log
- [x] 5 new test functions: each `grep -n "def test_species_*" data/tests/test_dbt_diff.py` returns exactly 1 match
- [x] `SANDBOX_SPECIES_PARQUET_GUARD` count: 4 (1 definition + 3 decorators)
- [x] `read_bytes()` count: 4 (2 tests × 2 reads each)
- [x] No `json.loads` added (count unchanged from pre-task baseline of 6)
- [x] `python3 -m py_compile data/tests/test_dbt_diff.py` exits 0
- [x] `uv run --project data pytest data/tests/test_dbt_diff.py -x` exits 0
- [x] No other file modified (`git diff --stat` shows only `data/tests/test_dbt_diff.py`)
