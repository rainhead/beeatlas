---
phase: 118-occurrence-model-extension
verified: 2026-05-25T21:00:00Z
status: gaps_found
score: 5/10 must-haves verified
re_verification: false
gaps:
  - truth: "occurrences.parquet contains a non-null `source` column with values in ('ecdysis', 'waba_sample', 'inat_obs') for every row"
    status: failed
    reason: "The sandbox parquet (written 15:17 May 25) pre-dates the SQL changes to int_combined.sql (committed 20:02 May 25). dbt build was never re-run after Plan 02 changes. The parquet has 31 columns with no source column."
    artifacts:
      - path: "data/dbt/target/sandbox/occurrences.parquet"
        issue: "31 columns; 'source', 'image_url', 'obs_url', 'user_login', 'license' all absent. DESCRIBE confirms."
    missing:
      - "Run `bash data/dbt/run.sh build` after the Plan 02 SQL changes were merged — this was never done"

  - truth: "occurrences.parquet contains iNat expert observation rows tagged source='inat_obs' with non-null lat/lon/canonical_name"
    status: failed
    reason: "Same root cause: stale parquet. Row count is 48,268 (ecdysis + waba_sample only). No ARM 3 rows present."
    artifacts:
      - path: "data/dbt/target/sandbox/occurrences.parquet"
        issue: "Only 48,268 rows — the expected ~44,534 inat_obs rows are missing because dbt was never rebuilt"
    missing:
      - "dbt build must be executed to materialize ARM 3 into occurrences.parquet"

  - truth: "occurrences.parquet exposes the four iNat-specific nullable columns image_url, obs_url, user_login, license (NULL for ARM 1/ARM 2, populated for ARM 3)"
    status: failed
    reason: "Parquet has no image_url, obs_url, user_login, or license columns. Stale build artifact."
    artifacts:
      - path: "data/dbt/target/sandbox/occurrences.parquet"
        issue: "Missing four iNat-specific columns entirely"
    missing:
      - "dbt build must be executed"

  - truth: "species.parquet emitted by dbt contains 20 SQL columns including inat_obs_count, with no NULL values (COALESCE to 0)"
    status: failed
    reason: "Sandbox species.parquet has 19 columns — inat_obs_count absent. Stale build; dbt was not re-run after Plan 03 SQL changes."
    artifacts:
      - path: "data/dbt/target/sandbox/species.parquet"
        issue: "19 columns only; 'inat_obs_count' absent. Confirmed via DESCRIBE."
    missing:
      - "dbt build must be executed"

  - truth: "species.json contains an inat_obs_count integer key for every species entry"
    status: failed
    reason: "public/data/species.json has 630 species entries, none of which contain the 'inat_obs_count' key. The species_export.py was never re-run against the updated dbt mart."
    artifacts:
      - path: "public/data/species.json"
        issue: "No inat_obs_count key in any entry. Keys confirmed via Python inspection."
    missing:
      - "Must run `bash data/dbt/run.sh build` then `uv run python species_export.py` to generate updated artifacts"
---

# Phase 118: Occurrence Model Extension — Verification Report

**Phase Goal:** Extend the unified occurrence model to include iNaturalist expert
observations (OCC-01), and add inat_obs_count to the species mart (OCC-02, OCC-03).
**Verified:** 2026-05-25T21:00:00Z
**Status:** GAPS FOUND — SQL/code correct; dbt build was never run after changes
**Re-verification:** No — initial verification

---

## Conclusion

The SQL implementation is correct and complete. Every dbt model file, schema
contract, and Python export module was correctly modified. However, the dbt build
was never executed after the Plan 02 and Plan 03 changes were merged. The sandbox
parquet files (written at 15:17 on May 25) pre-date the SQL commits (starting at
20:02 on May 25). All tests that interrogate the parquet artifacts fail because
the parquets reflect the pre-Phase-118 schema.

**Root cause:** 5 of 10 must-haves fail because the materialized artifacts are
stale. Fix: `cd data && bash dbt/run.sh build && uv run python species_export.py`.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | sources.yml declares inat_obs_data with schema inat_obs_data and table observations | VERIFIED | 6 sources in sources.yml; inat_obs_data block confirmed via YAML parse |
| 2 | int_combined.sql has three-arm UNION ALL, each 36 columns, with source literals | VERIFIED | `grep -c '^UNION ALL$'` returns 2; Python ARM column counter confirms 36×3; all three source literals present |
| 3 | occurrences.sql SELECT includes j.source, j.image_url, j.obs_url, j.user_login, j.license | VERIFIED | Line 93 of occurrences.sql confirmed with grep; positioned between j.canonical_name and fc.county |
| 4 | schema.yml occurrences model has 36 columns | VERIFIED | `awk` pipe returns 36 — county/ecoregion/place_slug on rows 65-70, then source/image_url/obs_url/user_login/license on rows 71-80 |
| 5 | occurrences.parquet contains a non-null source column with values in ('ecdysis', 'waba_sample', 'inat_obs') | FAILED | Parquet has 31 columns. source column absent. BinderException on `WHERE source IS NULL`. test_occurrences_source_column FAILS. |
| 6 | occurrences.parquet contains iNat expert observation rows tagged source='inat_obs' | FAILED | Only 48,268 rows (ecdysis + waba_sample baseline). ARM 3 rows absent. test_inat_obs_rows_in_occurrences FAILS. |
| 7 | int_species_universe.sql carries inat_obs_count_agg CTE reading inat_obs_data source directly (no circular DAG) | VERIFIED | CTE present, reads source('inat_obs_data','observations'), LEFT JOIN ioa present, ref('occurrences') absent from CTE body |
| 8 | species.parquet contains 20 SQL columns including inat_obs_count with zero NULLs | FAILED | Sandbox species.parquet has 19 columns; inat_obs_count absent. dbt not rebuilt after Plan 03. |
| 9 | species.json contains inat_obs_count integer key for every species entry | FAILED | 630 entries in public/data/species.json, none have inat_obs_count key. |
| 10 | species_export.py SPECIES_COLUMNS includes inat_obs_count at position -2 (before slug); PyArrow schema includes ('inat_obs_count', pa.int64()) | VERIFIED | `SPECIES_COLUMNS[-1]='slug', SPECIES_COLUMNS[-2]='inat_obs_count', len=21` confirmed. PyArrow entry at line 169 confirmed. |

**Score:** 5/10 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `data/dbt/models/sources.yml` | inat_obs_data source with schema + observations table | VERIFIED | 6th source block; schema: inat_obs_data; tables: [observations] |
| `data/dbt/models/intermediate/int_combined.sql` | Three-arm UNION ALL, 36 columns each, source literals | VERIFIED | 3 arms, 36 cols each, all three source literals present, ARM 3 coord filter present |
| `data/dbt/models/marts/occurrences.sql` | j.source + 4 iNat columns in SELECT | VERIFIED | Line 93 confirmed |
| `data/dbt/models/marts/schema.yml` | 36-col occurrences contract; 20-col species contract | VERIFIED | awk counts: 36 (occurrences), 20 (species) |
| `data/dbt/target/sandbox/occurrences.parquet` | 36 columns including source and iNat columns; ~92,802 rows | STUB/STALE | 31 columns, 48,268 rows — pre-dates all SQL changes |
| `data/dbt/models/intermediate/int_species_universe.sql` | inat_obs_count_agg CTE + LEFT JOIN + COALESCE BIGINT | VERIFIED | All three edits confirmed present |
| `data/dbt/models/marts/species.sql` | 20-column SELECT including inat_obs_count | VERIFIED | inat_obs_count on line 35; header comment line 7 correct ("20 SQL columns + 1 Python-added slug = 21 final columns") |
| `data/dbt/target/sandbox/species.parquet` | 20 columns including inat_obs_count with zero NULLs | STUB/STALE | 19 columns — pre-dates Plan 03 SQL changes |
| `data/species_export.py` | SPECIES_COLUMNS[-2]='inat_obs_count'; PyArrow schema includes it | VERIFIED | Confirmed via uv run python |
| `data/tests/test_dbt_scaffold.py` | Three new OCC-01 test functions behind _OCCURRENCES_GUARD | VERIFIED | Collected: test_occurrences_source_column, test_inat_obs_rows_in_occurrences, test_source_no_nulls |
| `data/tests/test_species_export.py` | test_inat_obs_count_in_species behind _SANDBOX_GUARD | VERIFIED | Collected; function present at line 72 |
| `public/data/species.json` | inat_obs_count key in every entry | FAILED | Key absent from all 630 entries |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `int_combined.sql` ARM 3 | `source('inat_obs_data', 'observations')` | FROM clause | WIRED | `source('inat_obs_data', 'observations')` appears once in ARM 3 FROM |
| `occurrences.sql` | `schema.yml occurrences columns` | dbt contract enforcement | WIRED — SQL only | Both have 36 columns; contract will enforce on next build; parquet is stale |
| `int_species_universe.sql` | `source('inat_obs_data', 'observations')` | inat_obs_count_agg CTE FROM clause | WIRED | CTE reads source directly; no circular DAG |
| `species_export.py` SPECIES_COLUMNS | `dbt/target/sandbox/species.parquet` | `mart_cols = ', '.join(SPECIES_COLUMNS[:-1])` | BROKEN at runtime | mart_cols includes inat_obs_count but parquet has 19 cols — will raise BinderException until rebuilt |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| test_occurrences_source_column | `uv run pytest tests/test_dbt_scaffold.py::test_occurrences_source_column` | BinderException: "source" not found | FAIL |
| test_inat_obs_rows_in_occurrences | (fails before reaching — stopped after first failure) | — | FAIL (by extension) |
| test_source_no_nulls | (fails before reaching) | — | FAIL (by extension) |
| test_inat_obs_count_in_species | `uv run pytest tests/test_species_export.py::test_slug_hierarchical` | BinderException: "inat_obs_count" not found in FROM clause | FAIL (pre-existing test fails due to stale parquet) |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `data/dbt/models/marts/species.sql` | 1 | Header says "19-column external parquet" (should be 20-column) | Info | Documentation only; line 7 correctly says "20 SQL columns + 1 Python-added slug = 21 final columns"; lines 1 and 6 not updated |

No TBD/FIXME/XXX markers found. No empty implementations. No circular DAG introduced.

### Gaps Summary

**Single root cause: dbt build never executed after phase SQL changes.**

All 5 failing must-haves trace to one root cause: the dbt sandbox outputs
(`occurrences.parquet` at 15:17, `species.parquet` at 15:17) were written before
the phase SQL commits landed (Plan 02 ARM 3 commit: 20:02, Plan 03 CTE commit:
also May 25 evening). The 118-02 and 118-03 SUMMARY.md files claim `dbt build`
was run, but the parquet timestamps and column structures contradict this — the
parquets carry the pre-phase schema.

**To close all 5 gaps:**
```bash
cd data
bash dbt/run.sh build
uv run python species_export.py
```

After this runs, the four OCC-01 tests (test_occurrences_source_column,
test_inat_obs_rows_in_occurrences, test_source_no_nulls) and the OCC-02/03 test
(test_inat_obs_count_in_species) should all turn GREEN. The SQL implementations
in all modified files are correct and will produce the right output on rebuild.

**Minor documentation gap (non-blocking):** `data/dbt/models/marts/species.sql`
lines 1 and 6 still read "19-column" — the Plan 03 SUMMARY claims the header was
updated to "20-column" but only line 7 was updated. This is cosmetic; the
enforced contract and SELECT list are correct.

---

_Verified: 2026-05-25T21:00:00Z_
_Verifier: Claude (gsd-verifier)_
