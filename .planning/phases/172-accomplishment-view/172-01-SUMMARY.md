---
phase: 172-accomplishment-view
plan: "01"
subsystem: test-scaffold
tags: [nyquist, wave-0, tdd, collectors, accomplishments]
dependency_graph:
  requires: [171.1-COMPLETE]
  provides: [172-01-test-scaffold]
  affects: [src/tests/data-collectors.test.ts, data/tests/test_collectors_export.py, data/tests/test_collector_maps.py]
tech_stack:
  added: []
  patterns: [nyquist-wave-0, fixture-driven-frontend-tests, red-python-tests]
key_files:
  created:
    - data/tests/test_collector_maps.py
  modified:
    - src/tests/fixtures/collectors.fixture.json
    - src/tests/data-collectors.test.ts
    - data/tests/test_collectors_export.py
decisions:
  - "Fixture entries use realistic distinct values: alice multi-genus (Andrena+Bombus), bob single genus (Bombus)"
  - "alice years [2020, 2022] create gap year stress-test for D-05 distinct-seasons vs max-min span"
  - "test_collector_maps.py uses ModuleNotFoundError failure (top-level import) as RED signal — all 6 tests fail at collection time until Plan 03 creates collector_maps.py"
metrics:
  duration: "~6 minutes"
  completed: "2026-06-28"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 4
---

# Phase 172 Plan 01: Nyquist Wave 0 Test Scaffold Summary

Locked the observable contract for all four ACCOM requirements before implementation by writing tests and fixtures first. Wave 0 establishes the fixed target that Plans 02 and 03 implement against.

## What Was Built

**Task 1 (GREEN): Extended frontend fixture + Phase 172 Vitest assertions**

Extended `src/tests/fixtures/collectors.fixture.json` with five new fields on both entries:
- `active_since` (int), `seasons_count` (int), `county_count` (int), `ecoregion_count` (int)
- `species_by_genus` (list of `{genus, species:[{canonical_name, slug, count}]}`)

Alice (multi-genus: Andrena + Bombus, active_since=2019, seasons_count=4, county_count=5, ecoregion_count=3) and Bob (single genus: Bombus, active_since=2021, seasons_count=2, county_count=3, ecoregion_count=2) have distinct, realistic values. Genera are alphabetical; species are alphabetical within genus (D-04). Slugs use `Genus/epithet` format.

Added `describe('Phase 172 — accomplishment fields (ACCOM-01..04)')` to `data-collectors.test.ts` that reads the fixture via `readFileSync` (never `collectorsArray`, which is `[]` on a clean checkout per `feedback_no_committed_data_artifacts`). Asserts typed fields, `species_by_genus` Array, slug contains `/`, and at least one multi-genus entry.

**Task 2 (RED by design): Extended test_collectors_export.py with aggregation-field tests**

Extended `_write_test_occurrences_parquet` with `year`, `county`, `ecoregion_l3` columns. Alice years are [2020, 2022] — a deliberate gap year to stress-test D-05 (COUNT(DISTINCT year)=2 vs max-min+1=3).

Extended `_write_test_species_parquet` with `genus`, `canonical_name`, `slug` columns (taxon_id=10 → Testgenus testicus / Testgenus/testicus).

Added 5 new tests (all RED — `KeyError: 'active_since'` until Plan 02 extends the export):
- `test_badge_fields_present_and_typed` (ACCOM-04)
- `test_seasons_count_is_distinct_years` (D-05: alice must be 2, not 3)
- `test_active_since_is_min_year` (D-05: alice must be 2020)
- `test_county_and_ecoregion_counts` (ACCOM-01/03)
- `test_species_by_genus_structure` (ACCOM-02)

All 6 pre-existing tests remain GREEN.

**Task 3 (RED by design): Created test_collector_maps.py**

New file `data/tests/test_collector_maps.py` targeting the not-yet-created `collector_maps.py` module (Plan 03). The top-level `import collector_maps` fails with `ModuleNotFoundError`, making all 6 tests RED at collection time.

Tests written against the contract Plan 03 must satisfy:
- `test_write_coverage_svg_fills_contributed_polygon`
- `test_write_coverage_svg_skips_unfilled`
- `test_write_coverage_svg_handles_multipolygon`
- `test_write_coverage_svg_deterministic` (byte-identical idempotency)
- `test_load_ecoregion_geojsons_keys_on_NA_L3NAME` (Pitfall 2 — key is `NA_L3NAME`, not `name`)
- `test_generate_collector_maps_emits_per_login_svgs` (alice + bob get `.svg` + `-eco.svg`; carol excluded by D-01)

No test depends on real `beeatlas.duckdb` or `public/data/` — all use `tmp_path` + monkeypatched `ASSETS_DIR`.

## Verification

- `npm test`: GREEN — 896 tests pass (33 test files)
- `cd data && uv run pytest tests/test_collectors_export.py -x`: 1 failed (RED — `test_badge_fields_present_and_typed` with `KeyError: 'active_since'`) after 2 GREEN (existing tests run first with `-x`)
- `cd data && uv run pytest tests/test_collector_maps.py -x`: `ERROR: ModuleNotFoundError: No module named 'collector_maps'` — correct RED signal
- Pre-existing Python tests: 6/6 GREEN (extended fixture schema is backward-compatible)

## Deviations from Plan

None — plan executed exactly as written. The `_write_coverage_svg` signature in the test matches the PATTERNS.md excerpt. The `-eco.svg` suffix (vs `-ecoregions.svg` mentioned in CONTEXT.md D-03) was chosen per Claude's discretion (CONTEXT.md §Claude's Discretion) as the shorter form matching the PATTERNS.md `generate_collector_maps_emits_per_login_svgs` test.

## Known Stubs

None. This plan creates only test scaffolding and fixture data. No UI or data-flow stubs.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. Test fixtures and assertions only.

## Self-Check: PASSED

- `src/tests/fixtures/collectors.fixture.json` — exists, contains 5 new keys per entry
- `src/tests/data-collectors.test.ts` — contains Phase 172 describe block
- `data/tests/test_collectors_export.py` — contains new test functions
- `data/tests/test_collector_maps.py` — created, fails with correct import error
- Commits: eb840bc5, ec06aa69, 82aaf8ca (all verified in git log)
