---
phase: 23-frontend-simplification
verified: 2026-03-27T23:10:00Z
status: passed
score: 3/3 must-haves verified
re_verification: false
---

# Phase 23: Frontend Simplification Verification Report

**Phase Goal:** Frontend reads inat_observation_id directly from already-loaded ecdysis features; separate links.parquet load and merge code is gone
**Verified:** 2026-03-27T23:10:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Clicking a specimen with an iNat link shows the correct iNaturalist URL in the sidebar | ✓ VERIFIED | `bee-map.ts:144` reads `f.get('inat_observation_id')` into `inatId`; `bee-sidebar.ts:870-871` renders the iNat URL when `inatObservationId != null` |
| 2 | No network request for links.parquet is made on page load | ✓ VERIFIED | `loadLinksMap`, `linksDump`, and the entire promise chain are absent from `bee-map.ts`; broad grep over `frontend/src/` returns CLEAN |
| 3 | The loadLinksMap function and _linksMap field no longer exist in the codebase | ✓ VERIFIED | Grep for `loadLinksMap`, `_linksMap`, `linkColumns`, `linksDump`, and `links.parquet` across `frontend/src/` returns no matches |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/src/parquet.ts` | Ecdysis parquet loading with inat_observation_id column | ✓ VERIFIED | Line 33: `'inat_observation_id'` in columns array; line 59: `inat_observation_id: obj.inat_observation_id != null ? Number(obj.inat_observation_id) : null` in setProperties |
| `frontend/src/bee-map.ts` | BeeMap component without links.parquet dependency | ✓ VERIFIED | No references to loadLinksMap, _linksMap, linksDump, or links.parquet; buildSamples signature is `(features: Feature[]): Sample[]` with no second parameter |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `frontend/src/parquet.ts` | `ecdysis.parquet` | columns array includes inat_observation_id | ✓ WIRED | `parquet.ts:33` contains `'inat_observation_id'` in the columns constant passed to `parquetReadObjects` |
| `frontend/src/bee-map.ts` | `frontend/src/parquet.ts` | `f.get('inat_observation_id')` in buildSamples | ✓ WIRED | `bee-map.ts:144`: `const inatId = f.get('inat_observation_id') as number | null ?? null;` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `bee-map.ts` buildSamples | `inatId` (→ `inatObservationId`) | `f.get('inat_observation_id')` from ParquetSource feature properties | Yes — column read from ecdysis.parquet at parse time via `parquetReadObjects` | ✓ FLOWING |
| `bee-sidebar.ts` iNat link | `s.inatObservationId` | Passed in `Sample.species[].inatObservationId` from buildSamples | Yes — flows from parquet column through feature properties | ✓ FLOWING |

### Behavioral Spot-Checks

TypeScript compiled with zero errors (`npx tsc --noEmit --project frontend/tsconfig.json` produced no output).

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript compiles cleanly | `npx tsc --noEmit --project frontend/tsconfig.json` | No errors | ✓ PASS |
| No deleted patterns remain in frontend/src | `grep -r 'loadLinksMap\|_linksMap\|linksDump\|links\.parquet\|linkColumns' frontend/src/` | No matches | ✓ PASS |
| inat_observation_id present in parquet.ts columns | `grep 'inat_observation_id' frontend/src/parquet.ts` | Lines 33 and 59 | ✓ PASS |
| buildSamples reads from feature properties | `grep 'inat_observation_id' frontend/src/bee-map.ts` | Line 144 | ✓ PASS |
| buildSamples call sites have single argument | `grep 'buildSamples(' frontend/src/bee-map.ts` | Lines 528 and 781, both `buildSamples(toShow)` | ✓ PASS |

Vite build was not re-run during verification (the SUMMARY documents it passed at execution time). TypeScript clean compile is the programmatic proxy.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| FRONT-01 | 23-01-PLAN.md | Frontend reads inat_observation_id directly from already-loaded ecdysis features; separate links.parquet loading and merge code is removed | ✓ SATISFIED | Column in parquet.ts columns array and setProperties; feature property read in buildSamples; all links.parquet code paths deleted |

No orphaned requirements. REQUIREMENTS.md maps FRONT-01 to Phase 23 (line 77). The plan declares `requirements: [FRONT-01]`. Coverage is complete.

### Anti-Patterns Found

None. Grep over `frontend/src/parquet.ts` and `frontend/src/bee-map.ts` for TODO, FIXME, placeholder, `return null`, and hardcoded empty returns found no items of concern.

### Human Verification Required

1. **iNat sidebar link renders for a specimen with a known inat_observation_id**

   **Test:** Load the app with production ecdysis.parquet (which has inat_observation_id populated). Click a cluster that includes a specimen linked to iNaturalist. Confirm the sidebar shows a clickable iNaturalist URL.

   **Expected:** A link appears in the species row pointing to `https://www.inaturalist.org/observations/{id}`.

   **Why human:** The data pipeline (Phase 21) must have written inat_observation_id to ecdysis.parquet; no local production parquet is present for automated inspection. The wiring is verified — whether real rows in production parquet have non-null values is a data question.

### Gaps Summary

No gaps. All three must-have truths are verified, both artifacts pass all four levels (exist, substantive, wired, data flowing), all key links are present, FRONT-01 is satisfied, TypeScript compiles cleanly, and no blocker anti-patterns were found.

The one item routed to human verification (visual link rendering against production data) is a smoke-test quality check, not a blocker — the code path is fully wired.

---

_Verified: 2026-03-27T23:10:00Z_
_Verifier: Claude (gsd-verifier)_
