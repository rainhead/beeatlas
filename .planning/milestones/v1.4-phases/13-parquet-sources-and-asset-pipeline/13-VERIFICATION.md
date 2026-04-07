---
phase: 13-parquet-sources-and-asset-pipeline
verified: 2026-03-12T00:00:00Z
status: passed
score: 8/8 must-haves verified
re_verification: false
---

# Phase 13: Parquet Sources and Asset Pipeline Verification Report

**Phase Goal:** Add occurrenceID to ParquetSource, create SampleParquetSource, add sample dot styling, and add graceful links.parquet copy to build pipeline
**Verified:** 2026-03-12
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

All must-haves are drawn directly from plan frontmatter across both plans (13-01 and 13-02).

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Each specimen OL feature carries an occurrenceID property (UUID string) accessible via feature.get('occurrenceID') | VERIFIED | `'occurrenceID'` in `columns` array (line 11); `occurrenceID: obj.occurrenceID` in `setProperties` (line 35) of `parquet.ts` |
| 2 | SampleParquetSource class exists in parquet.ts and can be instantiated with a URL without TypeScript errors | VERIFIED | Class exported at line 66; `npm run build` exits 0 with zero TypeScript errors |
| 3 | SampleParquetSource feature IDs use the inat: prefix (e.g. inat:93932795) | VERIFIED | `feature.setId(\`inat:${Number(obj.observation_id)}\`)` at line 76; Number() coercion prevents `n` BigInt suffix |
| 4 | SampleParquetSource feature properties include observation_id, observer, date, and specimen_count (INT64 coerced to Number) | VERIFIED | All four properties set in `setProperties` (lines 77–81); `observation_id` and `specimen_count` wrapped with `Number()` |
| 5 | sampleDotStyle is exported from style.ts and returns an OL Style for any valid feature with a date property | VERIFIED | `export function sampleDotStyle(feature: FeatureLike): Style` at line 87; returns Style object via tier-keyed cache |
| 6 | Sample dots are visually distinct: teal (#1abc9c) for fresh, blue (#3498db) for thisYear, slate (#7f8c8d) for older | VERIFIED | `SAMPLE_RECENCY_COLORS` at lines 79–83 contains exactly `#1abc9c`, `#3498db`, `#7f8c8d` |
| 7 | build-data.sh copies links/links.parquet to frontend/src/assets/links.parquet when the file exists | VERIFIED | `cp "$REPO_ROOT/data/links/links.parquet" "$REPO_ROOT/frontend/src/assets/links.parquet"` at line 33 |
| 8 | build-data.sh does NOT hard-fail when links/links.parquet is absent (graceful skip) | VERIFIED | `\|\| echo "links.parquet not found, skipping (pipeline not yet run)"` at line 34; `bash -n` syntax check passes |

**Score:** 8/8 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/src/parquet.ts` | ParquetSource with occurrenceID, SampleParquetSource class | VERIFIED | 93 lines; both classes exported; all required patterns present |
| `frontend/src/style.ts` | SAMPLE_RECENCY_COLORS const + sampleDotStyle function | VERIFIED | 107 lines; both exports present at lines 79 and 87 |
| `scripts/build-data.sh` | graceful links.parquet copy step | VERIFIED | cp + `\|\| echo` fallback at lines 33–34 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `parquet.ts ParquetSource` | ecdysis.parquet occurrenceID column | columns array + setProperties | WIRED | `'occurrenceID'` at line 11; `occurrenceID: obj.occurrenceID` at line 35 |
| `parquet.ts SampleParquetSource` | samples.parquet | asyncBufferFromUrl + parquetReadObjects | WIRED | `inat:${Number(obj.observation_id)}` at line 76 matches plan pattern exactly |
| `style.ts sampleDotStyle` | recencyTier() (module-private) | direct call — same file | WIRED | `recencyTier(year, month)` called at line 94; function defined at line 20 |
| `scripts/build-data.sh` | frontend/src/assets/links.parquet | cp with \|\| echo fallback | WIRED | Pattern `links/links\.parquet.*\|\|` confirmed at lines 33–34 |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| MAP-03 | 13-01, 13-02 | User can see iNat collection events as distinct dot markers (partial — source + style) | SATISFIED (partial) | SampleParquetSource provides data source; sampleDotStyle provides visual rendering; wiring to layer deferred to Phase 14 per REQUIREMENTS.md traceability table |
| LINK-05 | 13-01 | Specimen sidebar shows clickable iNat observation link when linkage exists in links.parquet | SATISFIED (prerequisite) | occurrenceID UUID now present on every ParquetSource feature via feature.get('occurrenceID'); join key available for Phase 15 lookup |

REQUIREMENTS.md traceability table maps MAP-03 to "Phase 13 (partial — source), Phase 14 (complete)" and LINK-05 to Phase 15 (Complete). Both statuses are consistent with what this phase delivers.

No orphaned requirements: the traceability table maps MAP-04 to Phase 14 and MAP-05 to Phase 15 — neither is claimed by any Phase 13 plan.

---

### Anti-Patterns Found

None. No TODO/FIXME/HACK/PLACEHOLDER comments in any modified file. No empty implementations. The `return []` occurrences at lines 30 and 73 of `parquet.ts` are correct guard clauses (skip features with null coordinates), not stubs.

---

### Human Verification Required

#### 1. Sample dot colors render correctly on the map

**Test:** Load the app with a samples.parquet dataset wired to a sample layer (available after Phase 14). Observe sample dots with dates in the fresh, thisYear, and older recency tiers.
**Expected:** Fresh dots appear teal (#1abc9c), thisYear dots appear blue (#3498db), older dots appear slate (#7f8c8d) — visually distinct from specimen cluster green/orange/gray.
**Why human:** Color perception and visual distinctiveness cannot be verified programmatically; requires rendering in browser.

#### 2. BigInt coercion prevents inat:Nn suffix at runtime

**Test:** Inspect a sample feature ID in browser devtools after the sample layer is wired (Phase 14).
**Expected:** Feature ID is `inat:93932795` (plain integer string), never `inat:93932795n` (BigInt suffix).
**Why human:** The coercion is correct in source code but runtime BigInt behavior with real data should be confirmed in browser console.

---

### Wiring Note: Orphaned Exports by Design

`SampleParquetSource`, `sampleDotStyle`, and `SAMPLE_RECENCY_COLORS` are defined but not yet imported anywhere in the frontend. This is expected — Phase 14 (sample-layer-wiring) will consume all three. The TypeScript build confirms there are no import errors; the exports are ready to be picked up.

---

### Commits Verified

All four commits documented in SUMMARY files exist in git history:

| Commit | Plan | Description |
|--------|------|-------------|
| `99ba8de` | 13-01 Task 1 | feat(13-01): add occurrenceID to ParquetSource |
| `de7aefc` | 13-01 Task 2 | feat(13-01): create SampleParquetSource class |
| `ecc3f86` | 13-02 Task 1 | feat(13-02): add SAMPLE_RECENCY_COLORS and sampleDotStyle to style.ts |
| `824d4f7` | 13-02 Task 2 | feat(13-02): add graceful links.parquet copy step to build-data.sh |

---

_Verified: 2026-03-12_
_Verifier: Claude (gsd-verifier)_
