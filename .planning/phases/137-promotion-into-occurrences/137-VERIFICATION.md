---
phase: 137-promotion-into-occurrences
verified: 2026-06-08T20:45:23Z
status: passed
score: 9/9
overrides_applied: 0
---

# Phase 137: Promotion into Occurrences — Verification Report

**Phase Goal:** Reconciled, deduplicated, coord-bearing checklist records enter `occurrences.parquet` as a `source='checklist'` ARM 4; the dbt contract is bumped 33→34 (`checklist_id`); the Phase 111 isolation test is explicitly retired; `geo_blob` (`sqlite_export._GEO_COLS`) and `src/features.ts` are updated in one atomic commit.
**Verified:** 2026-06-08T20:45:23Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `occurrences.parquet` contains `source='checklist'` rows (count > 0) | VERIFIED | 19,929 rows confirmed via direct DuckDB query on `data/dbt/target/sandbox/occurrences.parquet` |
| 2 | Zero checklist rows in `occurrences.parquet` have NULL lat or NULL lon | VERIFIED | Query returns 0: `WHERE source='checklist' AND (lat IS NULL OR lon IS NULL)` |
| 3 | The enforced dbt occurrences contract passes at 34 columns | VERIFIED | `schema.yml` contains exactly 34 columns for the `occurrences` model (counted); contract is `enforced: true`; `checklist_id data_type: integer` present at line 73-74 |
| 4 | ARMs 1–3 emit `NULL::INTEGER AS checklist_id`; checklist_id is NULL for every non-checklist row | VERIFIED | Lines 47, 103, 182 of `int_combined.sql` each carry `NULL::INTEGER ... AS checklist_id`; parquet query returns 0 non-checklist rows with non-NULL checklist_id |
| 5 | UNION ALL type-aligns (dbt build succeeds with zero type errors) | VERIFIED | `ea0b82b` commit message confirms "dbt build passes: 0 errors"; parquet materialized at 34 columns with correct types |
| 6 | Phase 111 isolation test no longer asserts checklist exclusion; positive `source='checklist'` existence assertion exists; greppable v4.7/Phase 137 reversal comment is present | VERIFIED | `test_dbt_scaffold.py` lines 196-238: ceiling raised to 160,000; `checklist_count >= 10_000` positive assertion; "Retired v4.7 (Phase 137)" and "Phase 137" appear at lines 196, 207, 209, 213, 226; "MUST NOT enter int_combined" text is gone |
| 7 | `sqlite_export._GEO_COLS` carries `checklist_id` at index 7 (after `source`) | VERIFIED | `_GEO_COLS = ["lat", "lon", "ecdysis_id", "observation_id", "specimen_observation_id", "year", "source", "checklist_id"]` — 8 fields, checklist_id confirmed at index 7 |
| 8 | `src/features.ts` reads `row[7]` as `checklist_id` and decodes non-null value to `occId = 'checklist:<N>'`; `_buildGeoJSONFromRaw` does not drop a checklist row | VERIFIED | `features.ts` line 33: `const checklist_id = row[7]`; line 39: `else if (checklist_id != null) occId = \`checklist:${checklist_id}\``; Vitest test "checklist row ... not dropped" passes |
| 9 | `_GEO_COLS` and `features.ts` decode change landed in ONE atomic commit, with a Vitest test | VERIFIED | Commit `469ab36` contains `data/sqlite_export.py`, `src/features.ts`, and `src/tests/build-geojson.test.ts` — confirmed via `git show --stat 469ab36` |

**Score:** 9/9 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `data/dbt/models/intermediate/int_combined.sql` | ARM 4 checklist SELECT + NULL::INTEGER AS checklist_id on ARMs 1-3 | VERIFIED | ARM 4 at lines 197-244; NULL::INTEGER at lines 47, 103, 182 |
| `data/dbt/models/marts/schema.yml` | `checklist_id` column (`data_type: integer`) on the occurrences contract → 34 columns | VERIFIED | Line 73-74; total 34 columns in occurrences model |
| `data/tests/test_dbt_scaffold.py` | Retired Phase 111 test body; positive `source='checklist'` assertion; v4.7 comment | VERIFIED | Lines 196-238; ceiling 160,000; `checklist_count >= 10_000`; reversal comments present |
| `data/sqlite_export.py` | `_GEO_COLS` with `checklist_id` appended at index 7; atomic-coupling comment | VERIFIED | Line 460-462; column-order comment at lines 455-459 cites Phase 137 |
| `src/features.ts` | `checklist_id = row[7]` decode + `else if (checklist_id != null) occId = 'checklist:${checklist_id}'` branch | VERIFIED | Lines 33 and 39 |
| `src/tests/build-geojson.test.ts` | 8-field toRow/RowOverride; `makeChecklistRow` factory; three new checklist `it` cases | VERIFIED | Lines 7-16 (RowOverride/toRow); lines 36-39 (makeChecklistRow); lines 118-135 (three it cases) |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `int_combined.sql` ARM 4 | `int_checklist_dedup_status` | `{{ ref('int_checklist_dedup_status') }} cl WHERE cl.dedup_status IS DISTINCT FROM 'confirmed' AND cl.lat IS NOT NULL AND cl.lon IS NOT NULL` | WIRED | Lines 241-244 match the plan's required filter verbatim |
| `data/dbt/models/marts/occurrences.sql` | `schema.yml` 34-column contract | `checklist_id` flows through the spatial join | WIRED | `occurrences.sql` adds `j.checklist_id` to final SELECT (per SUMMARY-01); parquet has 34 columns including `checklist_id` |
| `data/sqlite_export.py _GEO_COLS` index 7 | `src/features.ts row[7]` | positional geo_blob tuple encoding; one atomic commit | WIRED | Both read `checklist_id` at position 7; `469ab36` is the atomic commit |
| `src/features.ts` checklist branch | `occId = 'checklist:<N>'` | `else if (checklist_id != null)` appended to ecdysis/inat/inat_obs chain | WIRED | Line 39 of `features.ts` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `occurrences.parquet` (ARM 4) | 19,929 checklist rows | `int_checklist_dedup_status` materialized table (Phase 136 deduplicated records) | Yes — 19,929 real rows with non-null lat/lon/checklist_id confirmed by direct parquet query | FLOWING |
| `_buildGeoJSONFromRaw` checklist decode | `checklist_id = row[7]` | geo_blob from SQLite export of occurrences.parquet | Yes — positional index 7 maps directly to the real `checklist_id` column | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `occurrences.parquet` has `source='checklist'` rows | `duckdb -c "SELECT COUNT(*) FROM read_parquet('data/dbt/target/sandbox/occurrences.parquet') WHERE source='checklist'"` | 19929 | PASS |
| `occurrences.parquet` has 34 columns | `DESCRIBE SELECT * FROM read_parquet(...)` | 34 columns, last = `taxon_id INTEGER` | PASS |
| checklist_id NULL for non-checklist rows | `WHERE source != 'checklist' AND checklist_id IS NOT NULL` | 0 rows | PASS |
| No null-coord checklist rows | `WHERE source='checklist' AND (lat IS NULL OR lon IS NULL)` | 0 rows | PASS |
| `_GEO_COLS` has 8 fields, checklist_id at index 7 | Python parse of `_GEO_COLS` list | index 7 = checklist_id | PASS |
| `features.ts` decode wired | `grep "row\[7\]\|checklist:"` | lines 33 and 39 present | PASS |
| Atomic commit `469ab36` contains all 3 PRO-04 files | `git show --stat 469ab36` | `data/sqlite_export.py`, `src/features.ts`, `src/tests/build-geojson.test.ts` — all 3 in one commit | PASS |

---

### Probe Execution

Step 7c: No probe scripts exist for this phase (`scripts/*/tests/probe-*.sh` not applicable). Phase PLAN declares `bash data/dbt/run.sh build` as the authoritative gate; the sandbox parquet (`data/dbt/target/sandbox/occurrences.parquet`) is present and was queried directly with correct results, confirming the build ran successfully.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PRO-01 | 137-01-PLAN.md | Coord-bearing checklist records enter `int_combined`/`occurrences.parquet` as `source='checklist'`; dbt contract passes at new column count; no-coord records excluded | SATISFIED | 19,929 rows in parquet; 34-column contract confirmed; 0 null-coord checklist rows |
| PRO-02 | 137-01-PLAN.md | ARMs 1–3 emit correctly-typed NULL casts for checklist_id; UNION ALL type-aligns; new column is NULL for non-checklist rows | SATISFIED | `NULL::INTEGER AS checklist_id` at lines 47, 103, 182; 0 non-checklist rows with non-NULL checklist_id |
| PRO-03 | 137-01-PLAN.md | Phase 111 isolation pytest explicitly retired with v4.7 reference; not left failing or skipped | SATISFIED | Body replaced; `checklist_count >= 10_000` assertion; "Retired v4.7 (Phase 137)" comment; function not skipped |
| PRO-04 | 137-02-PLAN.md | `occurrences.db` geo_blob carries checklist identity; `_GEO_COLS` and `features.ts` changed in one atomic commit; Vitest test decodes `checklist:<N>`; no checklist point dropped | SATISFIED | `469ab36` contains all 3 files atomically; Vitest tests at lines 118-135 cover decode/no-drop/null-drop; `row[7]` = `checklist_id` |

All 4 requirements assigned to Phase 137 in REQUIREMENTS.md are satisfied. No orphaned requirements.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/features.ts` | 59, 66 | `console.log("[BENCHMARK]")` in production code path | Info | Pre-existing; noted in REVIEW as IN-01; deferred to Phase 138. Not introduced by Phase 137 task commits. Not a stub or debt marker. |

No `TBD`, `FIXME`, or `XXX` markers found in any phase-modified file. No empty stubs or placeholder return values found. The `placeholder` match in `sqlite_export.py` line 160 is standard SQL parameterized-query syntax, not a stub indicator.

---

### Code Review Critical Findings

The 137-REVIEW.md identified 3 Criticals (CR-01, CR-02, CR-03) and 4 Warnings. Per the verification guidance, the 3 Criticals were addressed in commit `f238ead` (which post-dates the plan commits but precedes this verification). WR-04 and IN-01 were explicitly deferred to Phase 138.

The 4 PRO-xx success criteria do not include frontend wiring of click/filter/URL handling — those belong to UIX-01 through UIX-04 in Phase 138. The Criticals were beyond the 4 stated success criteria and were fixed as a code-review action, which is appropriate.

**Note on WR-03 floor:** Commit `f238ead` updated the test floor from `> 0` to `>= 10_000` (per the code review recommendation). The test file at lines 231-238 now enforces a meaningful floor. This was already applied before this verification was run.

---

### Human Verification Required

None. All 4 PRO-xx success criteria are verifiable programmatically via file content, git history, and direct parquet queries. Visual map rendering (UIX-01 through UIX-04) is Phase 138's scope, not Phase 137's.

---

## Gaps Summary

No gaps. All 9 observable truths verified, all 6 required artifacts substantive and wired, all 4 key links confirmed, all 4 requirement IDs satisfied. Phase 137 goal is achieved.

---

_Verified: 2026-06-08T20:45:23Z_
_Verifier: Claude (gsd-verifier)_
