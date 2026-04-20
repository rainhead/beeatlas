---
phase: 066-provisional-rows-in-pipeline
verified: 2026-04-20T17:00:00Z
status: gaps_found
score: 4/6 must-haves verified
gaps:
  - truth: "export.py produces provisional rows for unmatched WABA observations using genus/family from the pipeline-created table"
    status: failed
    reason: "export.py joins against inaturalist_waba_data.observations__taxon__ancestors, but waba_pipeline.py no longer creates that table — it creates taxon_lineage instead. The Plan 04 summary itself confirms: running export.py against the production DB fails with CatalogException: Table with name observations__taxon__ancestors does not exist. Tests pass only because conftest.py creates both tables."
    artifacts:
      - path: "data/export.py"
        issue: "specimen_obs_base CTE joins observations__taxon__ancestors (lines 115-118) but this table is not created by waba_pipeline.py in production"
      - path: "data/waba_pipeline.py"
        issue: "enrich_taxon_lineage() creates taxon_lineage(taxon_id, genus, family) not observations__taxon__ancestors. taxon.ancestors.rank,taxon.ancestors.name was removed from DEFAULT_FIELDS in commit bde85fe."
    missing:
      - "Either update export.py specimen_obs_base CTE to JOIN taxon_lineage ON waba.taxon__id = tl.taxon_id, OR update waba_pipeline.py to also create observations__taxon__ancestors after enrich_taxon_lineage runs"
  - truth: "validate-schema.mjs passes against locally exported occurrences.parquet"
    status: failed
    reason: "No local occurrences.parquet exists and running export.py fails because observations__taxon__ancestors does not exist in the production DB. Plan 04 Task 2 was explicitly deferred to nightly CI. This is a direct consequence of the table name mismatch above."
    artifacts:
      - path: "frontend/public/data/occurrences.parquet"
        issue: "File does not exist locally — export has not run successfully since the export.py restructure"
    missing:
      - "Fix the table name mismatch first (see gap above), then run export.py to produce occurrences.parquet, then node scripts/validate-schema.mjs to confirm the schema gate passes"
human_verification: []
---

# Phase 066: Provisional Rows in Pipeline — Verification Report

**Phase Goal:** The export pipeline surfaces WABA observations that have no Ecdysis match as provisional occurrence rows, complete with iNat taxon, observer, and host sample context
**Verified:** 2026-04-20T17:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Running export.py produces occurrences.parquet rows with ecdysis_id=null and is_provisional=true for unmatched WABA observations | PARTIAL | test_provisional_rows_appear passes against fixture; production export fails (observations__taxon__ancestors missing) |
| 2 | Provisional rows carry genus, family from iNat taxon; specimen_observation_id = WABA obs id; iNat user login populated | PARTIAL | Tests verify specimen_inat_login, specimen_inat_taxon_name, specimen_inat_genus, specimen_inat_family — correct in fixture. Column renamed from observer to specimen_inat_login (acceptable improvement). Production unreachable. |
| 3 | Provisional rows with OFV 1718 carry host_observation_id; known sample gets specimen_count and sample_id | VERIFIED | test_provisional_rows_appear asserts host_obs_id==999999, spec_count==3. SQL wiring: regexp_extract(ofv1718.value, '([0-9]+)$', 1) → samples_base join. Tests pass. |
| 4 | WABA observations with Ecdysis catalog-number match are absent from provisional rows | VERIFIED | test_matched_waba_not_provisional passes — waba-obs-1 (id=777777) linked to catalog WSDA_5594569 produces is_provisional=False. matched_waba_ids CTE correctly identifies matched set. |
| 5 | validate-schema.mjs passes with new is_provisional column; 2 pytest integration tests confirm inclusion/exclusion | PARTIAL | validate-schema.mjs EXPECTED list updated (30 columns, host_inat_login, specimen_inat_*, is_provisional). Both integration tests pass. But node scripts/validate-schema.mjs cannot pass locally — no occurrences.parquet exists. |
| 6 | Running export.py against production DuckDB succeeds with 0 null county/ecoregion | FAILED | export.py fails locally with CatalogException: Table with name observations__taxon__ancestors does not exist (documented in 066-04-SUMMARY.md). Production relies on nightly pipeline run to create the table, but pipeline no longer creates it. |

**Score:** 4/6 (criteria 3, 4 fully verified; criteria 1, 2, 5 verified in fixture only; criteria 6 fails outright)

---

### Core Gap: Table Name Mismatch Between export.py and waba_pipeline.py

This is the critical blocking issue.

**Timeline of events:**
1. Plan 01 commit `689c9f4`: Added `taxon.ancestors.rank,taxon.ancestors.name` to DEFAULT_FIELDS — dlt would normalize this to `observations__taxon__ancestors`
2. Plan 03 commit `70cc9b9`: export.py restructured using `observations__taxon__ancestors` (via LEFT JOINs in `specimen_obs_base` CTE)
3. Post-execution commit `bde85fe`: Removed `taxon.ancestors` from DEFAULT_FIELDS (iNat v2 API silently ignores this field). Added `enrich_taxon_lineage()` which creates `taxon_lineage(taxon_id, genus, family)` instead. Updated conftest.py to create both tables (so tests still pass).

**Current state:**
- `waba_pipeline.py` creates: `inaturalist_waba_data.taxon_lineage(taxon_id, genus, family)`
- `export.py` joins against: `inaturalist_waba_data.observations__taxon__ancestors` (rank, name, _dlt_root_id)
- These are different tables. In production, `export.py` will fail.

**Why tests pass:**
`conftest.py` creates BOTH tables and seeds `observations__taxon__ancestors` with 4 rows (ancestor data). The fixture insulates tests from the production mismatch.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `data/waba_pipeline.py` | OFV fields (including field_id 1718) in DEFAULT_FIELDS | VERIFIED | `ofvs.uuid,ofvs.field_id,ofvs.name,ofvs.value,ofvs.datatype` present — captures all OFVs including 1718. Contains `enrich_taxon_lineage()` which creates `taxon_lineage` table. |
| `data/export.py` | UNION ALL with provisional arm, new columns | VERIFIED (fixture) | Contains specimen_obs_base, ecdysis_catalog_suffixes, matched_waba_ids, provisional_waba_ids, combined (UNION ALL), joined (ROW_NUMBER wrapper). Final SELECT emits 30 columns including is_provisional. |
| `data/tests/conftest.py` | Ancestors table + taxon_lineage + second WABA obs | VERIFIED | Creates both tables; seeds waba-obs-2 (id=888888), OFV 1718 pointing to obs 999999, 4 ancestor rows, 2 taxon_lineage rows. |
| `data/tests/test_export.py` | Updated column list + 2 new tests | VERIFIED | EXPECTED_OCCURRENCES_COLS has 30 entries with host_inat_login (not observer), 5 new WABA/provisional columns. Both new tests exist and pass. |
| `scripts/validate-schema.mjs` | EXPECTED list with 30 columns | VERIFIED | host_inat_login (not observer), specimen_inat_login, specimen_inat_taxon_name, specimen_inat_genus, specimen_inat_family, is_provisional all present. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| waba_pipeline.py DEFAULT_FIELDS `ofvs.*` | `inaturalist_waba_data.observations__ofvs` | dlt REST API normalization | VERIFIED | ofvs.field_id, ofvs.value in DEFAULT_FIELDS; OFV 1718 (associated observation URL) will be persisted |
| export.py `specimen_obs_base` | `observations__taxon__ancestors` | LEFT JOIN on _dlt_root_id | BROKEN in production | Table not created by current waba_pipeline.py; fixture creates it so tests pass |
| export.py `provisional_waba_ids` | `matched_waba_ids` CTE | WHERE waba.id NOT IN (...) | VERIFIED | Correctly captures all WABA obs with no Ecdysis catalog match, including obs with no OFV 18116 |
| ARM 2 `ofv1718.value` | `samples_base.observation_id` | regexp_extract('([0-9]+)$', 1) | VERIFIED | test_provisional_rows_appear confirms host_obs_id=999999, spec_count=3 |
| `combined` | `joined` | SELECT ROW_NUMBER() OVER () AS _row_id, * FROM combined | VERIFIED | Single ROW_NUMBER() application, no collisions between arms |
| `scripts/validate-schema.mjs EXPECTED` | `occurrences.parquet` | parquetMetadataAsync reads footer | NOT RUNNABLE | No local parquet; no production parquet with new schema yet |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| export.py `specimen_obs_base` | specimen_inat_genus, specimen_inat_family | LEFT JOIN observations__taxon__ancestors | YES in fixture, NO in production | HOLLOW in production — source table does not exist in production DB |
| export.py ARM 2 | is_provisional=TRUE rows | provisional_waba_ids (NOT IN matched_waba_ids) | YES in fixture | FLOWING in fixture; untestable in production |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 10 export tests pass | `uv run --project data pytest data/tests/test_export.py -v` | 10 passed in 0.30s | PASS |
| Full test suite (31 tests) passes | `uv run --project data pytest data/tests/ -v` | 31 passed in 0.97s | PASS |
| export.py runs against production DB | `python data/export.py` | CatalogException: Table with name observations__taxon__ancestors does not exist (per Plan 04 summary) | FAIL |
| Schema gate passes | `node scripts/validate-schema.mjs` | No local parquet — would validate against CloudFront; CloudFront parquet not yet updated | SKIP (no local file; production not yet updated) |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PROV-01 | 066-01 | DEFAULT_FIELDS includes OFV 1718; value persisted in observations__ofvs | SATISFIED | `ofvs.uuid,ofvs.field_id,ofvs.name,ofvs.value,ofvs.datatype` in DEFAULT_FIELDS captures all OFVs including 1718. Note: taxon.ancestors approach was replaced by enrich_taxon_lineage; OFV 1718 persistence intent is met. |
| PROV-02 | 066-02, 066-03 | export.py adds provisional rows (ecdysis_id=null, is_provisional=true) | PARTIAL | SQL structure correct; tests pass; production export fails due to table mismatch |
| PROV-03 | 066-02, 066-03 | Provisional rows carry scientificName, genus, family, observer=iNat login, specimen_observation_id=WABA obs ID | PARTIAL | All fields present; column named specimen_inat_login instead of observer (acceptable rename — more descriptive). Production export fails. |
| PROV-04 | 066-02, 066-03 | Provisional rows with OFV 1718 carry host_observation_id; known sample gets specimen_count, sample_id | VERIFIED | test_provisional_rows_appear asserts host_obs_id=999999, spec_count=3. SQL wiring verified. |
| PROV-05 | 066-04 | is_provisional BOOLEAN in schema; validate-schema.mjs updated; 2 pytest tests confirm behavior | PARTIAL | validate-schema.mjs EXPECTED updated; 2 tests pass. Schema gate against production parquet not yet confirmed (deferred to nightly CI; production export also blocked by gap). |

---

### Anti-Patterns Found

| File | Issue | Severity | Impact |
|------|-------|----------|--------|
| `data/export.py` lines 115-118 | LEFT JOINs on `observations__taxon__ancestors` which does not exist in production DB | BLOCKER | Production export fails; genus/family columns will be NULL even if table is created manually unless waba_pipeline.py is updated to populate it |
| `data/tests/conftest.py` | Creates both `taxon_lineage` AND `observations__taxon__ancestors`; seeds both | WARNING | Masks the production mismatch — tests pass while production export fails |

---

### Human Verification Required

None — all gaps are programmatically identifiable.

---

## Gaps Summary

**One root cause, two symptoms:**

The iNat v2 API doesn't return `taxon.ancestors` in observation responses, so commit `bde85fe` correctly pivoted to `enrich_taxon_lineage()` which creates `taxon_lineage(taxon_id, genus, family)`. However, `export.py` was not updated to match — it still joins against `observations__taxon__ancestors` (the dlt child table that was supposed to be created from the DEFAULT_FIELDS field, which is now gone).

`conftest.py` creates both tables so the test suite is fully green, but the production execution path is broken.

**Fix required:** Update `export.py`'s `specimen_obs_base` CTE to use `taxon_lineage` instead of `observations__taxon__ancestors`:

```sql
specimen_obs_base AS (
    SELECT
        waba.id                          AS waba_obs_id,
        waba._dlt_id                     AS waba_dlt_id,
        waba.user__login                 AS specimen_inat_login,
        waba.taxon__name                 AS specimen_inat_taxon_name,
        waba.longitude,
        waba.latitude,
        waba.observed_on,
        waba.quality_grade,
        tl.genus                         AS specimen_inat_genus,
        tl.family                        AS specimen_inat_family
    FROM inaturalist_waba_data.observations waba
    LEFT JOIN inaturalist_waba_data.taxon_lineage tl
        ON tl.taxon_id = waba.taxon__id
),
```

After this fix, also update `conftest.py` to remove the orphaned `observations__taxon__ancestors` CREATE TABLE and seed data (since export.py will no longer reference it), then verify both `export.py` and `node scripts/validate-schema.mjs` pass against the production DB.

---

_Verified: 2026-04-20T17:00:00Z_
_Verifier: Claude (gsd-verifier)_
