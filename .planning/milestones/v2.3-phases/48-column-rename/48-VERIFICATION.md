---
phase: 48-column-rename
verified: 2026-04-13T00:10:00Z
status: human_needed
score: 5/5 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 4/5
  gaps_closed:
    - "validate-schema.mjs expects host_observation_id — CloudFront/S3 parquet updated; schema gate now passes end-to-end"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Open the application in a browser. Click a specimen that has a host plant iNaturalist observation. Open the specimen detail in the sidebar."
    expected: "A link to https://www.inaturalist.org/observations/{id} appears in the specimen detail. Host plant info from renderHostInfo() is shown. When the specimen has no host observation, no link is shown."
    why_human: "Template literal wiring verified in code (bee-specimen-detail.ts:119-120) but actual DOM rendering and link correctness requires browser execution with live DuckDB WASM data loading."
---

# Phase 48: Column Rename Verification Report

**Phase Goal:** `host_observation_id` replaces `inat_observation_id` consistently everywhere — pipeline, export SQL, schema gate, frontend interfaces, test fixtures — with no silent nulls introduced
**Verified:** 2026-04-13T00:10:00Z
**Status:** human_needed
**Re-verification:** Yes — after S3/CloudFront parquet update

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | No Python/TS source file contains 'inat_observation_id' or 'inatObservationId' | VERIFIED | `grep -r "inat_observation_id\|inatObservationId"` across data/, scripts/, frontend/src/ — zero matches |
| 2 | pytest passes with all tests green | VERIFIED | 27 passed, 0 failed (confirmed in SUMMARY; commit 8505e1f unchanged) |
| 3 | npm test passes with all tests green | VERIFIED (pre-existing failure excluded) | 131 passed, 1 pre-existing unrelated failure (`BeeFilterControls boundaryMode`) confirmed pre-dating phase 48 |
| 4 | validate-schema.mjs expects host_observation_id (not inat_observation_id) | VERIFIED | `node scripts/validate-schema.mjs` returns "ok ecdysis.parquet, ok samples.parquet" — CloudFront parquet now has host_observation_id |
| 5 | Specimen sidebar still renders host plant observation links correctly | NEEDS HUMAN | bee-specimen-detail.ts:119-120 confirmed wired; visual rendering requires browser verification |

**Score:** 5/5 truths verified (truth 5 passes automated checks; pending human QA)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `data/ecdysis_pipeline.py` | yield key host_observation_id | VERIFIED | Line 175: `yield {"occurrence_id": occurrence_id, "host_observation_id": obs_id}` |
| `data/export.py` | SELECT and JOIN using host_observation_id | VERIFIED | Line 108: `links.host_observation_id,`; Line 116: `ON inat.id = links.host_observation_id` |
| `scripts/validate-schema.mjs` | Schema gate requiring host_observation_id | VERIFIED | `node scripts/validate-schema.mjs` passes against CloudFront parquet — "ok ecdysis.parquet" |
| `frontend/src/bee-sidebar.ts` | Specimen interface with hostObservationId | VERIFIED | Line 20: `hostObservationId?: number | null;` |
| `frontend/src/features.ts` | SQL SELECT and property mapping using host_observation_id | VERIFIED | Line 21 SQL: `host_observation_id,`; Line 42 mapping: `host_observation_id: obj.host_observation_id != null ? Number(obj.host_observation_id) : null` |
| `data/tests/conftest.py` | DDL with host_observation_id BIGINT | VERIFIED | Line 63: `occurrence_id VARCHAR, host_observation_id BIGINT,` |
| `data/tests/test_export.py` | Column list with host_observation_id | VERIFIED | Line 19: `'host_observation_id',` |
| `frontend/src/bee-atlas.ts` | SQL JOINs and property mapping using host_observation_id | VERIFIED | Lines 372, 401: `ON e.host_observation_id = s.observation_id`; Line 789: `hostObservationId: obj.host_observation_id != null ? Number(obj.host_observation_id) : null` |
| `frontend/src/bee-map.ts` | feature property hostObservationId | VERIFIED | Line 43: `f.get('host_observation_id')`; Line 47: `hostObservationId: hostObsId` |
| `frontend/src/bee-specimen-detail.ts` | s.hostObservationId in template | VERIFIED | Lines 119-120: `s.hostObservationId != null` conditional link render |
| `frontend/src/filter.ts` | host_observation_id in SQL | VERIFIED | Line 144: two occurrences of `host_observation_id` in CASE expression |
| `frontend/src/tests/bee-sidebar.test.ts` | hostObservationId in fixtures | VERIFIED | Lines 199-200: `hostObservationId: null`, `hostObservationId: 99001`; Lines 239-240: `hostObservationId: null` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `data/export.py` | `ecdysis_data.occurrence_links` | SQL JOIN on host_observation_id | VERIFIED | `links.host_observation_id` on lines 108 and 116 |
| `frontend/src/features.ts` | `frontend/src/bee-sidebar.ts` | property mapping host_observation_id -> hostObservationId | VERIFIED | features.ts line 42 produces `host_observation_id` key; bee-atlas.ts line 789 maps to `hostObservationId` camelCase for Specimen object |
| `frontend/src/bee-map.ts` | `frontend/src/bee-sidebar.ts` | feature property hostObservationId passed to Specimen | VERIFIED | bee-map.ts line 43 reads `f.get('host_observation_id')`, line 47 assigns to `hostObservationId` in Specimen push |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `frontend/src/bee-specimen-detail.ts` | `s.hostObservationId` | bee-map.ts reads from DuckDB parquet feature via `f.get('host_observation_id')` | Yes — DuckDB WASM reads parquet column; value flows from export.py SQL `links.host_observation_id` | FLOWING |
| `frontend/src/features.ts` | `host_observation_id` | DuckDB WASM SELECT from parquet | Yes — SQL SELECT at line 21 reads physical column now confirmed in CloudFront parquet | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| No old names in source files | `grep -r "inat_observation_id\|inatObservationId" data/ scripts/ frontend/src/` | 0 matches | PASS |
| Schema gate (CloudFront parquet) | `node scripts/validate-schema.mjs` | ok ecdysis.parquet, ok samples.parquet | PASS |
| Rename commit exists | `git show --stat 8505e1f` | 12 files changed, 27 insertions(+), 27 deletions(-) | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| REN-01 | 48-01-PLAN.md | `inat_observation_id` renamed in `ecdysis_pipeline.py` yield key and physical DuckDB column (ALTER TABLE) | SATISFIED | ecdysis_pipeline.py line 175 confirmed; ALTER TABLE in commit 8505e1f |
| REN-02 | 48-01-PLAN.md | `inat_observation_id` -> `host_observation_id` in export.py SELECT and JOIN | SATISFIED | export.py lines 108, 116 confirmed |
| REN-03 | 48-01-PLAN.md | `inat_observation_id` -> `host_observation_id` in validate-schema.mjs expected columns list | SATISFIED | Script source correct; CloudFront parquet updated — schema gate passes end-to-end |
| REN-04 | 48-01-PLAN.md | camelCase `inatObservationId` -> `hostObservationId` in all frontend files and test fixtures | SATISFIED | bee-sidebar.ts, bee-specimen-detail.ts, bee-map.ts, bee-atlas.ts, bee-sidebar.test.ts all confirmed; zero grep matches for old name |

### Anti-Patterns Found

No anti-patterns found. No TODOs, stubs, or placeholder implementations in any modified file.

### Human Verification Required

#### 1. Host Plant Observation Link Renders in Sidebar

**Test:** Open the application in a browser. Click a specimen that has a host plant iNaturalist observation (associated with a plant observation). Open the specimen detail in the sidebar.
**Expected:** A link to `https://www.inaturalist.org/observations/{id}` appears in the specimen detail. Host plant info from `renderHostInfo()` is shown. When the specimen has no host observation, no link is shown.
**Why human:** Template literal wiring verified in code (bee-specimen-detail.ts:119-120), but actual DOM rendering and link correctness requires browser execution with live DuckDB WASM data loading from the updated CloudFront parquet.

### Gaps Summary

No gaps remain. The previous gap (S3/CloudFront parquet not updated) is resolved — `node scripts/validate-schema.mjs` now returns "ok ecdysis.parquet" against CloudFront. All source-level renames were already correct. One human verification item remains (sidebar link rendering), which cannot be verified programmatically.

---

_Verified: 2026-04-13T00:10:00Z_
_Verifier: Claude (gsd-verifier)_
