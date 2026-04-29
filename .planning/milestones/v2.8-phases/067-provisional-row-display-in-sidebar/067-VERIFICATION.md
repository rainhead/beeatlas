---
phase: 067-provisional-row-display-in-sidebar
verified: 2026-04-20T13:20:50Z
status: passed
score: 8/8 must-haves verified
overrides_applied: 0
re_verification: null
---

# Phase 67: Provisional Row Display in Sidebar Verification Report

**Phase Goal:** Users see meaningful labels and links for sample-only and provisional rows in the occurrence detail sidebar
**Verified:** 2026-04-20T13:20:50Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|---------|
| 1 | Clicking a sample-only occurrence (ecdysis_id null, is_provisional falsy) shows "N specimens collected, identification pending" in the sidebar — no blank species name | VERIFIED | `_renderSampleOnly` at line 209–211 of bee-occurrence-detail.ts builds count string "N specimens collected, identification pending"; `render()` routes `ecdysis_id == null && is_provisional !== true` rows there |
| 2 | Clicking a provisional occurrence (is_provisional true) shows a provisional identification label with the iNat community taxon name and a link to the WABA observation via `specimen_observation_id` | VERIFIED | `_renderProvisional` at line 229–251: renders `.inat-id-label` with "iNat ID:", italic taxon name from `specimen_inat_taxon_name`, quality badge, and WABA link to `https://www.inaturalist.org/observations/${row.specimen_observation_id}` |
| 3 | A Vitest render test mounts `bee-occurrence-detail` with a provisional row fixture and asserts the provisional label and observation link are present | VERIFIED | bee-sidebar.test.ts lines 272–290: SID-02 test mounts with `is_provisional: true` fixture, asserts `.inat-id-label` contains "iNat ID:", asserts link href contains "12345678" |
| 4 | Existing specimen and sample-only render tests continue to pass | VERIFIED | 152 tests pass (150 pre-existing + 2 new), 0 failures |
| 5 | export.py produces `specimen_inat_quality_grade` in ARM 1 (null for non-WABA rows via LEFT JOIN), ARM 2 (populated from sob.quality_grade), and final SELECT | VERIFIED | Lines 151, 183, 248 of export.py contain the column alias in both CTE arms and the final SELECT |
| 6 | validate-schema.mjs EXPECTED list includes `specimen_inat_quality_grade` | VERIFIED | Line 37 of scripts/validate-schema.mjs: `'specimen_inat_genus', 'specimen_inat_family', 'specimen_inat_quality_grade'` |
| 7 | OccurrenceRow has `host_inat_login`, `is_provisional`, `specimen_inat_taxon_name`, `specimen_inat_quality_grade`; no `observer` field; OCCURRENCE_COLUMNS matches | VERIFIED | filter.ts lines 47–50 (OccurrenceRow), lines 59–61 (OCCURRENCE_COLUMNS); no `observer` references remain anywhere in filter.ts |
| 8 | buildFilterSQL collector filter uses `host_inat_login` SQL column name | VERIFIED | filter.ts lines 237–241: `.filter(c => c.host_inat_login !== null)`, `host_inat_login IN (...)` |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|---------|--------|---------|
| `data/export.py` | `specimen_inat_quality_grade` in ARM 1, ARM 2, final SELECT | VERIFIED | Lines 151, 183, 248 — 3 occurrences, all substantive SQL aliases |
| `scripts/validate-schema.mjs` | schema gate entry for new column | VERIFIED | Line 37: added to WABA fields block |
| `frontend/src/filter.ts` | updated OccurrenceRow, OCCURRENCE_COLUMNS, buildFilterSQL | VERIFIED | All four new/renamed fields present; no `observer` remains |
| `frontend/src/bee-occurrence-detail.ts` | `_renderProvisional` method, updated `_renderSampleOnly`, `.inat-id-label` CSS | VERIFIED | Lines 138–142 (CSS), 178–183 (`_renderQualityBadge`), 208–227 (`_renderSampleOnly`), 229–251 (`_renderProvisional`), 261–265 (`render()` dispatch) |
| `frontend/src/tests/bee-sidebar.test.ts` | provisional render test and sample-only pending test | VERIFIED | Lines 233–306: `describe('SID-01/SID-02: bee-occurrence-detail render branches', ...)` with two tests |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `render()` in bee-occurrence-detail.ts | `_renderProvisional` | `row.is_provisional === true` branch | WIRED | Line 262: `row.is_provisional === true ? this._renderProvisional(row)` |
| `_renderProvisional` | `https://www.inaturalist.org/observations/${row.specimen_observation_id}` | anchor href | WIRED | Lines 245–247: href template literal uses `specimen_observation_id` |
| `OCCURRENCE_COLUMNS` | DuckDB SELECT in queryAllFiltered and queryTablePage | `OCCURRENCE_COLUMNS.join(', ')` | WIRED | Lines 130 and 155 of filter.ts: `const selectCols = OCCURRENCE_COLUMNS.join(', ')` |
| `data/export.py` combined CTE | occurrences.parquet schema | `COPY ... TO ... FORMAT PARQUET` | WIRED | Line 248 of export.py: `j.specimen_inat_quality_grade` in final SELECT |
| `buildFilterSQL` collector filter | `host_inat_login` SQL column | SQL string in logins clause | WIRED | Line 241: `host_inat_login IN (${logins.join(',')})` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `bee-occurrence-detail.ts` `_renderProvisional` | `row.specimen_inat_taxon_name`, `row.specimen_inat_quality_grade`, `row.specimen_observation_id` | `OccurrenceRow` props from `occurrences` property — populated by DuckDB SELECT via `OCCURRENCE_COLUMNS.join(', ')` from occurrences table; upstream from export.py parquet columns | Yes — ARM 2 of combined CTE selects real WABA data from `specimen_obs_base sob` | FLOWING |
| `bee-occurrence-detail.ts` `_renderSampleOnly` | `row.specimen_count`, `row.host_inat_login` | Same OccurrenceRow props path | Yes — populated from `samples_base s` join | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 152 Vitest tests pass (including 2 new SID-01/SID-02 tests) | `npm test -- --run` | 7 test files, 152 tests, 0 failures | PASS |
| SID-02 test asserts `.inat-id-label` with "iNat ID:" and WABA link with "12345678" | Vitest test output | Passes | PASS |
| SID-01 test asserts `.event-count` contains "identification pending" | Vitest test output | Passes | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| SID-01 | 067-01, 067-02 | `bee-occurrence-detail` renders sample-only rows with "identification pending" label; specimen count as "N specimens collected" | SATISFIED | `_renderSampleOnly` generates "N specimens collected, identification pending"; Vitest test SID-01 asserts `.event-count` contains "identification pending" |
| SID-02 | 067-01, 067-02 | `bee-occurrence-detail` renders WABA provisional rows with provisional identification label and link to WABA observation via `specimen_observation_id`; 1 Vitest render test covers this row type | SATISFIED | `_renderProvisional` renders `.inat-id-label`, italic taxon, quality badge with aria-label, "View WABA observation" link; Vitest test SID-02 asserts the label and link |

### Anti-Patterns Found

None. No TODO, FIXME, HACK, PLACEHOLDER, return null, hardcoded empty data, or stub indicators found in any phase-modified files.

### Human Verification Required

None. All must-haves are verifiable programmatically. The test suite exercises the shadow DOM rendering directly.

### Gaps Summary

No gaps. All 8 observable truths are verified. All artifacts exist, are substantive, and are properly wired. Both requirement IDs (SID-01, SID-02) are satisfied. All 152 tests pass including the 2 new render tests.

---

_Verified: 2026-04-20T13:20:50Z_
_Verifier: Claude (gsd-verifier)_
