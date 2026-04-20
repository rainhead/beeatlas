---
phase: 066-provisional-rows-in-pipeline
plan: "03"
subsystem: pipeline
tags: [duckdb, sql, export, provisional-rows, union-all, waba]

# Dependency graph
requires:
  - plan: "066-01"
    provides: "waba_pipeline.py DEFAULT_FIELDS with taxon.ancestors"
  - plan: "066-02"
    provides: "conftest.py fixtures and RED test stubs for provisional rows"
provides:
  - "export.py emits provisional occurrence rows via UNION ALL (is_provisional=true, ecdysis_id=null)"
  - "specimen_obs_base CTE joins WABA observations with taxon ancestors (genus, family)"
  - "ecdysis_catalog_suffixes + matched_waba_ids + provisional_waba_ids CTEs identify unmatched WABA obs"
  - "combined CTE as UNION ALL of ARM 1 (Ecdysis+samples) and ARM 2 (provisional WABA)"
  - "joined CTE applies ROW_NUMBER() OVER () globally across combined"
  - "Final SELECT emits host_inat_login, specimen_inat_login, specimen_inat_taxon_name, specimen_inat_genus, specimen_inat_family, is_provisional"
  - "observations__taxon__ancestors fixture table in conftest.py with 4 seed rows"
affects:
  - 066-04  # validate-schema.mjs update; depends on final column list confirmed here

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "UNION ALL pattern: combined CTE unifies Ecdysis+samples (ARM 1) with provisional WABA obs (ARM 2); joined wraps with ROW_NUMBER() OVER ()"
    - "provisional_waba_ids via NOT IN matched_waba_ids: captures WABA obs with no OFV 18116 AND obs with OFV 18116 pointing to non-Ecdysis catalog"
    - "two LEFT JOINs on observations__taxon__ancestors (one per rank) for genus and family ancestor fields"

key-files:
  created: []
  modified:
    - data/export.py
    - data/tests/conftest.py

key-decisions:
  - "provisional_waba_ids defined as ALL WABA obs NOT IN matched set — not FROM waba_link anti-join — to capture obs with no OFV 18116"
  - "observations__taxon__ancestors table added to conftest.py (missing from plan 02 despite being listed in its SUMMARY)"
  - "matched_waba_ids CTE added (not in plan) to cleanly separate the matched set from the full provisioning logic"

patterns-established:
  - "Provisional row identification: matched_waba_ids (WABA obs with catalog suffix in Ecdysis) → provisional_waba_ids (all WABA obs NOT in matched set)"
  - "ARM 2 WHERE sob.longitude IS NOT NULL AND sob.latitude IS NOT NULL gates provisional rows for spatial join compatibility"

requirements-completed:
  - PROV-02
  - PROV-03
  - PROV-04

# Metrics
duration: 15min
completed: 2026-04-20
---

# Phase 066 Plan 03: Restructure export.py with UNION ALL and Provisional Row Arm

**export.py restructured with specimen_obs_base CTE, matched_waba_ids/provisional_waba_ids CTEs, and UNION ALL in combined CTE — occurrences.parquet now emits provisional rows (is_provisional=true) for unmatched WABA observations with iNat taxon fields and OFV 1718 host linkage**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-20T16:00:00Z
- **Completed:** 2026-04-20T16:15:00Z
- **Tasks:** 2 of 2
- **Files modified:** 2

## Accomplishments

- Renamed `observer` to `host_inat_login` in `samples_base` CTE and propagated through final SELECT
- Added `specimen_obs_base` CTE that joins WABA observations with two LEFT JOINs on `observations__taxon__ancestors` (one for `rank='genus'`, one for `rank='family'`)
- Added `ecdysis_catalog_suffixes`, `matched_waba_ids`, and `provisional_waba_ids` CTEs to correctly identify all unmatched WABA observations
- Added `combined` CTE as UNION ALL of ARM 1 (Ecdysis FULL OUTER JOIN samples + WABA LEFT JOIN) and ARM 2 (provisional WABA obs)
- Wrapped combined in `joined` CTE with `ROW_NUMBER() OVER ()` for globally unique `_row_id`
- Updated final SELECT to emit all 6 new/renamed columns including `is_provisional`
- Added `observations__taxon__ancestors` fixture table + 4 seed rows to conftest.py (was missing despite being claimed in plan 02 SUMMARY)
- All 31 pytest tests pass (10 export tests + 21 others)

## Task Commits

1. **Task 1: Rename observer to host_inat_login in samples_base CTE** - `ffe5e9e` (feat)
2. **Task 2: Restructure joined CTE into combined+joined with UNION ALL and new columns** - `70cc9b9` (feat)

## Files Created/Modified

- `data/export.py` — Full restructure: samples_base rename, 5 new CTEs (specimen_obs_base, ecdysis_catalog_suffixes, matched_waba_ids, provisional_waba_ids, combined), joined wrapper, updated final SELECT
- `data/tests/conftest.py` — Added `observations__taxon__ancestors` CREATE TABLE and 4 ancestor seed rows

## Decisions Made

- **provisional_waba_ids via NOT IN matched_waba_ids (not FROM waba_link):** The plan specified `FROM waba_link WHERE ecs.catalog_suffix IS NULL` but this misses WABA observations with no OFV 18116 (they're never in `waba_link` at all). The correct definition is all WABA obs whose `id` is not in the matched set. This is more general and correct for both production (obs with no catalog OFV) and test fixture (waba-obs-2 has no OFV 18116).
- **matched_waba_ids CTE added:** Not in original plan. Added to cleanly express the "matched" set before negating it in provisional_waba_ids. Makes the SQL intent explicit.
- **observations__taxon__ancestors fixture added in Task 2:** Plan 02 SUMMARY claimed this table was created, but the actual conftest.py was missing it. Added as a Rule 2 correction — without it the specimen_obs_base CTE would fail at test time.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed provisional_waba_ids CTE to capture WABA obs with no OFV 18116**
- **Found during:** Task 2 (export restructure) — `test_provisional_rows_appear` failed with 0 provisional rows
- **Issue:** Plan's `provisional_waba_ids` was `FROM waba_link ... WHERE ecs.catalog_suffix IS NULL`. `waba_link` only contains observations that have OFV 18116; waba-obs-2 (the fixture's provisional obs) has no OFV 18116 and is therefore invisible to the waba_link anti-join.
- **Fix:** Added `matched_waba_ids` CTE (WABA obs with catalog suffix in Ecdysis), then defined `provisional_waba_ids` as `FROM inaturalist_waba_data.observations WHERE id NOT IN (SELECT waba_obs_id FROM matched_waba_ids)`. This correctly captures all unmatched WABA obs regardless of whether they have OFV 18116.
- **Files modified:** data/export.py
- **Verification:** `test_provisional_rows_appear` passes with provisional row id=888888 having correct fields
- **Committed in:** 70cc9b9

**2. [Rule 2 - Missing Critical] Added observations__taxon__ancestors fixture table**
- **Found during:** Task 2 (pre-run analysis) — conftest.py was missing the table claimed in plan 02 SUMMARY
- **Issue:** `specimen_obs_base` CTE joins on `inaturalist_waba_data.observations__taxon__ancestors`; without the fixture table, all tests would fail with "Table not found"
- **Fix:** Added CREATE TABLE for `observations__taxon__ancestors` and 4 seed rows (genus+family for each of the 2 WABA observations)
- **Files modified:** data/tests/conftest.py
- **Verification:** All tests pass; specimen_inat_genus and specimen_inat_family correctly populated
- **Committed in:** 70cc9b9

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical fixture)
**Impact on plan:** Both fixes necessary for correctness. The provisional_waba_ids fix aligns with the plan's stated intent (capture unmatched WABA obs); the fixture fix was a gap left by plan 02.

## Issues Encountered

- `provisional_waba_ids` anti-join was logically incorrect for observations with no OFV 18116 — required one debug cycle to identify and fix (see Deviations above)

## Known Stubs

None — all new columns are wired to real fixture data; no placeholder text or hardcoded empty values.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundary changes. Pipeline-internal SQL transform only.

## Self-Check

Files exist:
- data/export.py: FOUND (modified)
- data/tests/conftest.py: FOUND (modified)
- .planning/phases/066-provisional-rows-in-pipeline/066-03-SUMMARY.md: FOUND

Commits exist:
- ffe5e9e (Task 1): FOUND
- 70cc9b9 (Task 2): FOUND

Tests: 31/31 passed

## Self-Check: PASSED

## Next Phase Readiness

- `export.py` fully restructured with provisional rows; all 31 tests green
- Plan 04 (validate-schema.mjs update) can proceed — column list is now confirmed: `host_inat_login` (renamed from `observer`), plus `specimen_inat_login`, `specimen_inat_taxon_name`, `specimen_inat_genus`, `specimen_inat_family`, `is_provisional`
- No blockers

---
*Phase: 066-provisional-rows-in-pipeline*
*Completed: 2026-04-20*
