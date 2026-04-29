---
phase: 066-provisional-rows-in-pipeline
verified: 2026-04-20T19:00:00Z
status: passed
score: 6/6 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 4/6
  gaps_closed:
    - "export.py specimen_obs_base CTE now JOINs taxon_lineage on taxon_id — observations__taxon__ancestors absent from export.py"
    - "conftest.py no longer creates observations__taxon__ancestors — fixture matches production schema"
    - "Production export ran successfully with no CatalogException (human-confirmed, Plan 05 Task 3)"
    - "node scripts/validate-schema.mjs passed against locally exported occurrences.parquet (human-confirmed)"
  gaps_remaining: []
  regressions: []
---

# Phase 066: Provisional Rows in Pipeline — Verification Report

**Phase Goal:** The export pipeline surfaces WABA observations that have no Ecdysis match as provisional occurrence rows, complete with iNat taxon, observer, and host sample context
**Verified:** 2026-04-20T19:00:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (Plan 05)

---

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Running export.py produces occurrences.parquet rows with ecdysis_id=null and is_provisional=true for unmatched WABA observations | VERIFIED | test_provisional_rows_appear passes: asserts is_provisional=True, ecdysis_id=None for waba-obs-2 (id=888888). Production export confirmed by human (Plan 05 Task 3). |
| 2 | Provisional rows carry genus, family from iNat taxon; specimen_observation_id = WABA obs id; iNat user login populated | VERIFIED | test_provisional_rows_appear asserts: specimen_observation_id=888888, specimen_inat_login='provisionaluser', specimen_inat_taxon_name='Osmia'. taxon_lineage seeds genus='Osmia', family='Megachilidae'. Production export confirmed. |
| 3 | Provisional rows with OFV 1718 carry host_observation_id; known sample gets specimen_count and sample_id | VERIFIED | test_provisional_rows_appear asserts host_obs_id=999999, spec_count=3. SQL: regexp_extract(ofv1718.value, '([0-9]+)$', 1) → samples_base join. 31 tests pass. |
| 4 | WABA observations with Ecdysis catalog-number match are absent from provisional rows | VERIFIED | test_matched_waba_not_provisional asserts is_provisional=False for waba-obs-1 (id=777777). matched_waba_ids CTE correctly identifies matched set. |
| 5 | validate-schema.mjs passes with new is_provisional column; 2 pytest integration tests confirm inclusion/exclusion | VERIFIED | validate-schema.mjs EXPECTED list has 30 columns including is_provisional, specimen_inat_*, host_inat_login. Both integration tests pass. Production parquet validated by human. |
| 6 | Running export.py against production DuckDB succeeds with 0 null county/ecoregion | VERIFIED | Human confirmed production export completed with no CatalogException (Plan 05 Task 3). export.py asserts null_county == 0 and null_eco == 0 at runtime. |

**Score:** 6/6 truths verified

---

### Root Cause Resolved

Plan 05 fixed the table-name mismatch that caused 2 of 6 truths to fail in the initial verification:

- `data/export.py` commit `351c877`: `specimen_obs_base` CTE now uses `LEFT JOIN inaturalist_waba_data.taxon_lineage tl ON tl.taxon_id = waba.taxon__id` — the two `LEFT JOIN observations__taxon__ancestors` joins (filtered by rank) are gone. `grep -n "observations__taxon__ancestors" data/export.py` returns no output (exit 1 confirmed).
- `data/tests/conftest.py` commit `0d49270`: Removed CREATE TABLE and INSERT seed blocks for `observations__taxon__ancestors`. `grep -n "observations__taxon__ancestors" data/tests/conftest.py` returns no output (exit 1 confirmed). Fixture now reflects production schema exactly.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `data/waba_pipeline.py` | OFV fields + enrich_taxon_lineage creates taxon_lineage | VERIFIED | enrich_taxon_lineage() creates `inaturalist_waba_data.taxon_lineage(taxon_id, genus, family)` (lines 148, 155). OFVs (including 1718) captured via `ofvs.uuid,ofvs.field_id,ofvs.name,ofvs.value,ofvs.datatype` in DEFAULT_FIELDS. |
| `data/export.py` | UNION ALL with provisional arm, taxon_lineage JOIN, 30-column output | VERIFIED | specimen_obs_base uses `LEFT JOIN inaturalist_waba_data.taxon_lineage tl ON tl.taxon_id = waba.taxon__id` (line 115). No reference to observations__taxon__ancestors. Final SELECT emits 30 columns including is_provisional. |
| `data/tests/conftest.py` | Fixture matches production schema (taxon_lineage only) | VERIFIED | Creates taxon_lineage (line 108); seeds 2 rows (taxon_ids 100001, 100002). No observations__taxon__ancestors table. |
| `data/tests/test_export.py` | 30-column list + 2 provisional tests | VERIFIED | EXPECTED_OCCURRENCES_COLS has 30 entries. test_provisional_rows_appear and test_matched_waba_not_provisional both pass. |
| `scripts/validate-schema.mjs` | EXPECTED list with 30 columns including is_provisional | VERIFIED | All 30 columns present: specimen_inat_login, specimen_inat_taxon_name, specimen_inat_genus, specimen_inat_family, is_provisional, host_inat_login all listed. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| waba_pipeline.py DEFAULT_FIELDS `ofvs.*` | `inaturalist_waba_data.observations__ofvs` | dlt REST API normalization | VERIFIED | ofvs.field_id, ofvs.value in DEFAULT_FIELDS; OFV 1718 (associated observation URL) persisted |
| export.py `specimen_obs_base` | `inaturalist_waba_data.taxon_lineage` | LEFT JOIN tl ON tl.taxon_id = waba.taxon__id | VERIFIED | Line 115 confirmed; no observations__taxon__ancestors reference in export.py |
| export.py `provisional_waba_ids` | `matched_waba_ids` CTE | WHERE waba.id NOT IN (...) | VERIFIED | Correctly captures all WABA obs with no Ecdysis catalog match |
| ARM 2 `ofv1718.value` | `samples_base.observation_id` | regexp_extract('([0-9]+)$', 1) | VERIFIED | test_provisional_rows_appear confirms host_obs_id=999999, spec_count=3 |
| `combined` | `joined` | SELECT ROW_NUMBER() OVER () AS _row_id, * FROM combined | VERIFIED | Single ROW_NUMBER() application, no ID collisions between arms |
| `scripts/validate-schema.mjs EXPECTED` | `occurrences.parquet` | parquetMetadataAsync reads footer | VERIFIED | Human confirmed schema gate passes against locally exported parquet (Plan 05 Task 3) |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| export.py `specimen_obs_base` | specimen_inat_genus, specimen_inat_family | LEFT JOIN taxon_lineage on taxon_id | YES — taxon_lineage created by enrich_taxon_lineage() which queries iNat API data | FLOWING — source table created by production pipeline |
| export.py ARM 2 | is_provisional=TRUE rows | provisional_waba_ids (NOT IN matched_waba_ids) | YES — verified in fixture and production | FLOWING — production export confirmed by human |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 10 export tests pass | `uv run --project data pytest data/tests/test_export.py -v` | 10 passed | PASS |
| Full test suite (31 tests) passes | `uv run --project data pytest data/tests/ -v` | 31 passed in 1.03s | PASS |
| observations__taxon__ancestors absent from export.py | `grep -n "observations__taxon__ancestors" data/export.py` | no output (exit 1) | PASS |
| taxon_lineage present in export.py | `grep -n "taxon_lineage" data/export.py` | line 115: LEFT JOIN inaturalist_waba_data.taxon_lineage tl | PASS |
| observations__taxon__ancestors absent from conftest.py | `grep -n "observations__taxon__ancestors" data/tests/conftest.py` | no output (exit 1) | PASS |
| export.py runs against production DB | `python data/export.py` | Completed, no CatalogException (human-confirmed, Plan 05 Task 3) | PASS |
| Schema gate passes | `node scripts/validate-schema.mjs` | Passes against locally written occurrences.parquet (human-confirmed) | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PROV-01 | 066-01 | DEFAULT_FIELDS includes OFV field_id 1718; value persisted in observations__ofvs | SATISFIED | `ofvs.uuid,ofvs.field_id,ofvs.name,ofvs.value,ofvs.datatype` in DEFAULT_FIELDS captures all OFVs including 1718. Taxon data provided via enrich_taxon_lineage() instead of dlt ancestor normalization — same outcome. |
| PROV-02 | 066-02, 066-03, 066-05 | export.py adds provisional rows (ecdysis_id=null, is_provisional=true) | SATISFIED | SQL structure correct; test_provisional_rows_appear passes; production export confirmed by human. |
| PROV-03 | 066-02, 066-03, 066-05 | Provisional rows carry scientificName, genus, family, observer=iNat login, specimen_observation_id=WABA obs ID | SATISFIED | All fields present (column named specimen_inat_login — more descriptive than observer). taxon_lineage JOIN provides genus/family. Production export confirmed. |
| PROV-04 | 066-02, 066-03 | Provisional rows with OFV 1718 carry host_observation_id; known sample gets specimen_count, sample_id | SATISFIED | test_provisional_rows_appear asserts host_obs_id=999999, spec_count=3. SQL wiring verified. |
| PROV-05 | 066-04, 066-05 | is_provisional BOOLEAN in schema; validate-schema.mjs updated; 2 pytest tests confirm behavior | SATISFIED | validate-schema.mjs EXPECTED updated with is_provisional; 2 integration tests pass; schema gate confirmed against production parquet. |

---

### Anti-Patterns Found

None — the blocker from the initial verification (observations__taxon__ancestors mismatch) is resolved. No new anti-patterns identified.

---

### Human Verification Required

None.

---

## Gaps Summary

No gaps. All 6 observable truths are verified. The single root cause identified in the initial verification — export.py joining observations__taxon__ancestors while waba_pipeline.py creates taxon_lineage — was resolved by Plan 05 commits 351c877 and 0d49270. The production execution path is confirmed end-to-end.

---

_Verified: 2026-04-20T19:00:00Z_
_Verifier: Claude (gsd-verifier)_
