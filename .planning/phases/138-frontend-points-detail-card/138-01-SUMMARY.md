---
phase: 138-frontend-points-detail-card
plan: "01"
subsystem: test-scaffolds
tags: [tdd, nyquist, url-state, bee-occurrence-detail, build-geojson, checklist, pytest]
dependency_graph:
  requires: []
  provides:
    - src/tests/url-state.test.ts (updated MAP-03 assertions for 4-source VALID_SOURCES)
    - src/tests/bee-occurrence-detail.test.ts (formatRomanDate unit tests)
    - src/tests/build-geojson.test.ts (checklist source regression guard)
    - data/tests/test_species_checklist_count.py (UIX-04 deduped-count integration test)
  affects: []
tech_stack:
  added: []
  patterns:
    - Wave 0 Nyquist scaffolds — RED tests targeting post-implementation behavior
    - pytest.mark.integration for DuckDB-backed integration assertions
key_files:
  created:
    - src/tests/bee-occurrence-detail.test.ts
    - data/tests/test_species_checklist_count.py
  modified:
    - src/tests/url-state.test.ts
    - src/bee-occurrence-detail.ts (added export to formatRomanDate)
    - src/tests/build-geojson.test.ts
decisions:
  - "formatRomanDate exported from bee-occurrence-detail.ts — needed for unit-testability per D-08"
  - "UIX-04 test marked @pytest.mark.integration — requires beeatlas.duckdb + dbt sandbox parquet; collectable with --collect-only"
  - "src=checklist round-trip test uses buildParams + parseParams directly — verifies both URL encoding and parsing complement logic"
metrics:
  duration: "~7 minutes"
  completed_date: "2026-06-08"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 5
---

# Phase 138 Plan 01: Wave 0 Nyquist Scaffolds Summary

Wave 0 test scaffolds for every UIX-01..04 implementation requirement: 4-source VALID_SOURCES round-trip, formatRomanDate precision/null unit tests, checklist source GeoJSON regression guard, and UIX-04 deduped-count integration assertion.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Update url-state tests for 4-source VALID_SOURCES + src=checklist round-trip | 8098d5b | src/tests/url-state.test.ts |
| 2 | Create formatRomanDate precision/null unit tests; export formatRomanDate | 16432b8 | src/tests/bee-occurrence-detail.test.ts, src/bee-occurrence-detail.ts |
| 3 | Add checklist source GeoJSON assertion + UIX-04 deduped-count pytest | 18922ca | src/tests/build-geojson.test.ts, data/tests/test_species_checklist_count.py |

## Test State at Plan Completion (Expected Wave 0 / Nyquist State)

### url-state.test.ts (MAP-03 block)
RED — 6 failures, 68 passed. New/updated assertions fail because `VALID_SOURCES` currently has 3 members; complement assertions expect 4-member set including `checklist`. This is correct — RED until Plan 03 ships.

### bee-occurrence-detail.test.ts
RED — 3 failures, 2 passed. Failures:
- `null input returns empty string` — current `formatRomanDate(dateStr: string)` signature throws on null
- `year-only string (length 4) returns the year as-is` — current impl parses '2019' as a date (gets NaN → returns '2019' via fallback in some engines, but misrouted through date parsing)
- `month-precision string (length 7) returns roman-month year format` — '2019-06' parsed as a full date (day=last-of-month), returns wrong value

Full-date case ('2019-06-15' → '15 VI 2019') and empty-string case both pass immediately.

### build-geojson.test.ts
GREEN — 17/17 tests pass. The new `checklist source row: properties.source equals 'checklist'` assertion passes immediately (behavior already exists in features.ts; this is the regression guard for UIX-01 paint expression contract).

### data/tests/test_species_checklist_count.py
COLLECTABLE — `pytest --collect-only -q -m ""` lists `test_checklist_count_matches_dedup_status_count` without import errors. Marked `@pytest.mark.integration`; skips when `species.parquet` / `beeatlas.duckdb` absent. RED on assertion until Plan 02 re-sources `checklist_count_agg` CTE in `int_species_universe.sql`.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Implementation Notes

**Task 1 (url-state.test.ts):** The existing `hiddenSources={ecdysis}` test expected `src=inat_obs,waba_sample`. Updated to `src=checklist,inat_obs,waba_sample` (sorted) for post-Plan-03 behavior. Added 3 new tests: `src=ecdysis` hides 3 sources, VALID_SOURCES universe size assertion (hidden.size === 3), and the `src=checklist` round-trip via `buildParams` + `parseParams`.

**Task 2 (bee-occurrence-detail.ts):** Added `export` keyword to `formatRomanDate` function declaration. No other implementation changes were made — the function body is left for Plan 04 to extend with null/length-4/length-7 handling per D-08.

**Task 3 (build-geojson.test.ts):** The `makeChecklistRow` factory already existed with `source: 'checklist'`. Added the explicit `properties.source === 'checklist'` assertion as a named test with a comment explaining its UIX-01 paint contract purpose.

**Task 3 (test_species_checklist_count.py):** Marked `@pytest.mark.integration` rather than leaving as a fast-tier test — required because: (a) it must read `beeatlas.duckdb` which is a gitignored local file, and (b) it reads `species.parquet` which is a built dbt artifact. The D-05 guard in conftest.py explicitly exempts `@pytest.mark.integration` tests from asset-driven skip failures.

## Known Stubs

None — this plan creates only test files and exports. No UI components with placeholder data.

## Threat Flags

None — test-only changes; no new runtime surface, no new inputs, no network endpoints.

## Self-Check: PASSED

- [x] src/tests/url-state.test.ts exists and contains 'checklist' in MAP-03 block
- [x] src/tests/bee-occurrence-detail.test.ts exists with 5 formatRomanDate cases
- [x] src/bee-occurrence-detail.ts exports formatRomanDate
- [x] src/tests/build-geojson.test.ts contains checklist source property assertion
- [x] data/tests/test_species_checklist_count.py exists with `dedup_status IS DISTINCT FROM 'confirmed'` and `int_checklist_dedup_status`
- [x] Commits 8098d5b, 16432b8, 18922ca all present in git log
