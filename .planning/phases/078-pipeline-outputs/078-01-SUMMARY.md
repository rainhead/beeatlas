---
phase: 078-pipeline-outputs
plan: 01
subsystem: testing

tags: [pytest, duckdb, parquet, schema-gate, tomllib, full-outer-join, canonical-name]

requires:
  - phase: 076-data-foundation
    provides: ecdysis_data.occurrences canonical_name column, FULL OUTER union pattern
  - phase: 077-lineage-expansion
    provides: canonical_to_taxon_id bridge + taxon_lineage_extended population (≥95%)
provides:
  - "[tool.beeatlas] state_fips config in data/pyproject.toml"
  - "data/config.py STATE_FIPS string export"
  - "occurrences.parquet now carries canonical_name (Pitfall #6 mitigation)"
  - "scripts/validate-schema.mjs species.parquet expected columns + species.json shape check"
  - "data/tests/conftest.py off-WA-bbox occurrence row (id=7800001, occurrence_id=OFFBBOX-01) for MAP-04"
  - "data/tests/test_species_export.py with 7 Wave 0 stub tests (red until Plan 078-02)"
  - "data/tests/test_species_maps.py with 6 Wave 0 stub tests (red until Plan 078-03)"
affects: [078-02-species-export, 078-03-species-maps, 078-04-pipeline-wire]

tech-stack:
  added: ["tomllib (stdlib)"]
  patterns:
    - "Project config sourced from [tool.beeatlas] in data/pyproject.toml — read at module import via stdlib tomllib"
    - "Wave 0 lazy-import shim: `_import_or_skip_with_wave0` converts ModuleNotFoundError → pytest.fail with canonical 'Wave 0 stub' message"
    - "Schema-gate column expansion: validate-schema.mjs intentionally fails against stale CloudFront parquet until Plan 04 redeploys (acts as canary)"

key-files:
  created:
    - data/config.py
    - data/tests/test_config.py
    - data/tests/test_species_export.py
    - data/tests/test_species_maps.py
  modified:
    - data/pyproject.toml
    - data/export.py
    - data/tests/conftest.py
    - data/tests/test_export.py
    - scripts/validate-schema.mjs

key-decisions:
  - "Config location: [tool.beeatlas] table in data/pyproject.toml (not a standalone config file). One config source, read by data/config.py via stdlib tomllib at import time."
  - "OFFBBOX-01 row uses scientific_name='Andrena anograe' / canonical_name='andrena anograe' (no existing checklist row, so it stands alone as occurrence-only). Numeric id='7800001' to satisfy CAST(o.id AS INTEGER) in export.py."
  - "Added andrena anograe to canonical_to_taxon_id (taxon_id=200020) + taxon_lineage_extended (Andrenidae) so LIN-05 coverage stays ≥0.95 (now 20/21=0.952)."
  - "Stubs use lazy-import shim so 'Wave 0 stub' surfaces in failure message even when species_export/species_maps modules are absent — keeps grep -c 'Wave 0 stub' assertion meaningful."

patterns-established:
  - "Wave 0 test scaffolding: failing red tests committed BEFORE the implementation plans, with canonical 'Wave 0 stub — Plan NN-NN implements <fn>' failure message"
  - "Project config table at [tool.beeatlas]: future state_bbox / state_county_loader knobs land here for multi-state expansion"

requirements-completed: [AGG-06, AGG-07, MAP-04, MAP-06]

duration: 25min
completed: 2026-05-04
---

# Phase 78 Plan 01: Wave 0 Test Scaffolding Summary

**Wave 0 scaffolding for the species pipeline: [tool.beeatlas] config, canonical_name on occurrences.parquet (Pitfall #6 mitigation), 13 red species_export/species_maps stubs, and validate-schema.mjs species.parquet/json gates.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-04T06:34:00Z
- **Completed:** 2026-05-04T06:59:18Z
- **Tasks:** 3 (all autonomous; Tasks 1 and 2 followed RED→GREEN TDD)
- **Files modified:** 9 (4 created, 5 modified)

## Accomplishments

- `[tool.beeatlas] state_fips = "53"` lives in `data/pyproject.toml`; `from config import STATE_FIPS` returns the string `"53"` (D-02 LOCKED).
- `occurrences.parquet` schema now includes `canonical_name`: ecdysis_base CTE / ARM 1 / ARM 2 (NULL) / final SELECT all updated. `validate-schema.mjs` EXPECTED list updated. Verified live in pytest via two new tests on `test_export.py` (`test_occurrences_canonical_name_arm1` + `_arm2_null`).
- `scripts/validate-schema.mjs` carries `EXPECTED['species.parquet']` (19 columns including `month_histogram`) and a top-level-array + required-keys shape check for `species.json` — both gracefully skipped today (no local artifacts; CloudFront 404 branches log `not available on CloudFront yet`).
- `conftest.py` seeds an OFFBBOX-01 occurrence (lon=-117.5, lat=44.8, eastern Oregon — outside WA bbox) on a new occurrence-only species (`andrena anograe`); LIN-05 coverage maintained at 20/21=0.952 via paired bridge + lineage rows.
- 13 Wave 0 stubs split 7/6 between `test_species_export.py` (AGG-01..05, AGG-07, idempotency) and `test_species_maps.py` (MAP-01..04, MAP-06, slug-agreement). All fail with the canonical `Wave 0 stub — Plan 078-NN implements <fn>` message.
- Pre-existing 107-test pytest suite remains green; nothing else regressed.

## Task Commits

Each task was committed atomically (TDD RED+GREEN where applicable):

1. **Task 1 RED — STATE_FIPS test** — `e287ab6` (test)
2. **Task 1 GREEN — config.py + pyproject** — `e9eeafb` (feat)
3. **Task 2 RED — canonical_name tests** — `55a914c` (test)
4. **Task 2 GREEN — export.py + validate-schema EXPECTED** — `f2f7739` (feat)
5. **Task 3 — conftest extension + Wave 0 stubs + species.{parquet,json} schema checks** — `5c2d413` (test)

## Files Created/Modified

### Created
- `data/config.py` — module-level `STATE_FIPS` constant read from `[tool.beeatlas]` via stdlib `tomllib`.
- `data/tests/test_config.py` — 2 tests pin STATE_FIPS value + str type.
- `data/tests/test_species_export.py` — 7 Wave 0 stubs (AGG-01..05, AGG-07, idempotency_two_runs).
- `data/tests/test_species_maps.py` — 6 Wave 0 stubs (MAP-01..04, MAP-06, svg_filename_matches_slug_column).

### Modified
- `data/pyproject.toml` — added `[tool.beeatlas]` table with `state_fips = "53"`.
- `data/export.py` — `canonical_name` propagated through ecdysis_base CTE, ARM 1 (`e.canonical_name`), ARM 2 (`NULL AS canonical_name`), and the final outer SELECT (`j.canonical_name`).
- `data/tests/conftest.py` — added OFFBBOX-01 row (id=7800001, andrena anograe) plus matching bridge (`canonical_to_taxon_id`, taxon_id=200020) and `taxon_lineage_extended` (Andrenidae) rows so LIN-05 stays at 20/21=0.952.
- `data/tests/test_export.py` — added `canonical_name` to `EXPECTED_OCCURRENCES_COLS`; added `test_occurrences_canonical_name_arm1` and `test_occurrences_canonical_name_arm2_null`.
- `scripts/validate-schema.mjs` — added `'canonical_name'` to occurrences EXPECTED, added `'species.parquet'` EXPECTED entry (19 columns), added `species.json` shape check (top-level array + row[0] required keys), added `readFileSync` import.

## Decisions Made

- **Config location**: `[tool.beeatlas]` table in `data/pyproject.toml` (planner's recommendation in plan note A; matches D-02). Single source for state-related knobs; future multi-state work appends to this table rather than a new file.
- **OFFBBOX-01 species**: `andrena anograe` chosen per plan A. No existing `andrena anograe` row anywhere in the seed data (verified via grep), so no name collision with checklist seeds. Stayed on the recommended species rather than falling back to `andrena offbbox`.
- **Numeric id**: changed from string `'OFFBBOX-01'` (planner's literal) to numeric string `'7800001'` to satisfy `CAST(o.id AS INTEGER)` in `export.py`'s ecdysis_base CTE — see deviation #1.
- **LIN-05 coverage protection**: when adding the OFFBBOX row I noticed it would push LIN-05 coverage below 0.95. Added a paired bridge + extended-lineage row so coverage holds at 20/21=0.952 — see deviation #2.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] OFFBBOX-01 string id incompatible with `CAST(o.id AS INTEGER)`**
- **Found during:** Task 3 (running pytest after seeding the OFFBBOX row exactly as the plan literal suggested)
- **Issue:** Plan specified `id, occurrence_id` values as `'OFFBBOX-01', 'occ-OFFBBOX-01'`. But `data/export.py::export_occurrences_parquet` does `CAST(o.id AS INTEGER) AS ecdysis_id` in `ecdysis_base`. With `decimal_latitude='44.8'` (non-null), the OFFBBOX row was no longer filtered out by the `WHERE decimal_latitude IS NOT NULL` clause and the cast tripped a `_duckdb.ConversionException: Could not convert string 'OFFBBOX-01' to INT32`. Existing LIN05-* rows avoid this because they have `decimal_latitude=NULL` and are filtered out.
- **Fix:** Used numeric id `'7800001'` (Phase 78 prefix `78`) and put the human-readable `OFFBBOX-01` marker in `occurrence_id`. The off-bbox row now exports cleanly while the marker remains greppable.
- **Files modified:** `data/tests/conftest.py`
- **Verification:** `cd data && uv run pytest tests/test_export.py` (12 passed); full suite (107 passed).
- **Committed in:** `5c2d413` (Task 3 commit).

**2. [Rule 1 — Bug] LIN-05 coverage drops to 0.905 when OFFBBOX adds a 21st canonical_name**
- **Found during:** Task 3 (full pytest run flagged `test_lineage_coverage_threshold` failing).
- **Issue:** `test_resolve_taxon_ids.py::test_lineage_coverage_threshold` pins LIN-05 union coverage at ≥0.95. Adding `andrena anograe` to `ecdysis_data.occurrences` without a matching `canonical_to_taxon_id` + `taxon_lineage_extended` row dropped coverage to 19/21=0.905.
- **Fix:** Added paired rows: `canonical_to_taxon_id` ('andrena anograe' → taxon_id 200020, source `inat_species`) and `taxon_lineage_extended` (200020, Andrenidae, Andreninae, NULL, Andrena, NULL). Coverage now 20/21=0.952.
- **Files modified:** `data/tests/conftest.py`
- **Verification:** `cd data && uv run pytest tests/test_resolve_taxon_ids.py::test_lineage_coverage_threshold` passes; full suite green.
- **Committed in:** `5c2d413` (Task 3 commit).

**3. [Rule 1 — Bug] Wave 0 stub failure messages were swallowed by `ModuleNotFoundError` at import time**
- **Found during:** Task 3 (initial run of new stubs).
- **Issue:** Plan dictated each stub do a lazy `import species_export as export_mod` then `pytest.fail("Wave 0 stub — Plan 02 implements <fn>")`. But `import` raised `ModuleNotFoundError` first, and the canonical `Wave 0 stub` message never reached the failure output. Acceptance criterion `grep -c "Wave 0 stub"` returned 0 instead of 13.
- **Fix:** Wrapped the lazy import in a `_import_or_skip_with_wave0(fn_name)` shim that catches `ModuleNotFoundError` and re-raises via `pytest.fail` with the canonical message. When Plan 02/03 land their modules, the import succeeds and the existing `pytest.fail` after the entry-point call takes over (planners then replace those with real assertions).
- **Files modified:** `data/tests/test_species_export.py`, `data/tests/test_species_maps.py`
- **Verification:** `grep -c "Wave 0 stub"` on the pytest output returns 53 (every failure surfaces the canonical message at multiple sites — assertion, summary, fail line). Each of the 13 stubs fails with `Failed: Wave 0 stub — Plan 078-NN implements <fn>`.
- **Committed in:** `5c2d413` (Task 3 commit).

**4. [Rule 4 — Architectural deferral] `node scripts/validate-schema.mjs` exits 1, not 0, when no local parquet present**
- **Found during:** Task 2 verification.
- **Issue:** Plan acceptance criterion says `node scripts/validate-schema.mjs` exits 0 (warns and skips when no local parquet exists; succeeds when one is present after a pipeline run). In practice, with no local `public/data/occurrences.parquet`, the validator falls through to CloudFront and correctly trips a schema-mismatch fail because production parquet does not yet carry the new `canonical_name` column. This is the schema gate working as designed (`project_schema_validation.md` memory: "catch stale S3 cache").
- **Decision:** Accept as expected behavior. Did NOT weaken the gate (would mask legitimate stale-CloudFront warnings). Plan 04 (pipeline wire + nightly run) is responsible for regenerating the parquet on disk; once present locally or after deploy → CloudFront, the validator will pass. The deviation is in the plan's expectation, not the implementation. Documented here so verifiers don't re-litigate.
- **Files modified:** None.
- **Verification:** `species.parquet` skips cleanly with the expected `not available on CloudFront yet` warning; `species.json` block is unreached because no local file exists. The only "failure" is the canonical_name expectation against the stale CloudFront artifact — exactly the gate's job.

---

**Total deviations:** 4 — 3 auto-fixed Rule 1 bugs plus 1 documented Rule 4 deferral.
**Impact on plan:** All Rule 1 fixes were necessary to make Wave 0 actually red-green useful. The Rule 4 deferral is a planner expectation that the validator skip on no-local-parquet — the validator instead correctly enforces against CloudFront, which is the right behavior. No scope creep; no architectural changes.

## Issues Encountered

None beyond the deviations above.

## TDD Gate Compliance

Plan-level type is `execute`, not `tdd`, but Tasks 1 and 2 used per-task TDD (`tdd="true"`).

- Task 1 RED commit: `e287ab6 test(078-01): add failing test for STATE_FIPS config` (test failed with `ModuleNotFoundError: config`).
- Task 1 GREEN commit: `e9eeafb feat(078-01): add data/config.py STATE_FIPS sourced from pyproject.toml`.
- Task 2 RED commit: `55a914c test(078-01): add failing tests for canonical_name on occurrences.parquet` (test failed with `Missing column in occurrences.parquet: canonical_name`).
- Task 2 GREEN commit: `f2f7739 feat(078-01): materialize canonical_name on occurrences.parquet (Pitfall #6)`.

Both gates were observed to fail before GREEN code was added.

## User Setup Required

None — all changes are config files, Python source, and test scaffolding tracked in git.

## Next Phase Readiness

- Plan 078-02 (species_export.py) can begin: `from config import STATE_FIPS` works; `occurrences.parquet` will carry `canonical_name` after the next nightly pipeline run (or after Plan 04 wires + runs locally); 7 red tests pin the contract.
- Plan 078-03 (species_maps.py) can begin: 6 red tests pin the SVG contract; the OFFBBOX-01 fixture row is in place for `test_off_bbox_clipping`.
- Schema gate is armed: `validate-schema.mjs` will accept the future `species.parquet` and `species.json` outputs and reject regressions in the existing `occurrences.parquet` schema.

### Open follow-up for Plan 04

The schema gate currently fails against the deployed CloudFront `occurrences.parquet` because it lacks `canonical_name`. Plan 04 must either:
- run the data pipeline locally so a fresh `public/data/occurrences.parquet` lands before `npm run build`, OR
- ensure the deploy pipeline regenerates parquet before the schema gate runs (current CI behavior should already do this; verify on the next deploy).

## Self-Check: PASSED

- `data/config.py` — FOUND
- `data/tests/test_config.py` — FOUND
- `data/tests/test_species_export.py` — FOUND
- `data/tests/test_species_maps.py` — FOUND
- Commit `e287ab6` — FOUND
- Commit `e9eeafb` — FOUND
- Commit `55a914c` — FOUND
- Commit `f2f7739` — FOUND
- Commit `5c2d413` — FOUND

---
*Phase: 078-pipeline-outputs*
*Completed: 2026-05-04*
