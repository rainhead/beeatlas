---
phase: 160-overlap-capable-place-model-many-to-many-membership
verified: 2026-06-23T19:30:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification_resolved: "2026-06-23 — operator confirmed the member-place chip ('Hanford Reach National Monument') renders correctly in the live sidebar after clearing a stale cached DB. Reproduced on HEAD via Playwright. UAT PASS."
human_verification:
  - test: "Open the sidebar detail for an occurrence with place membership and confirm member place NAME(s) render as readable chips (D-04)."
    expected: "Member place name(s) render (not slugs), styled like the existing place-name pattern; an occurrence in no place shows no chips."
    result: "PASS (operator-confirmed 2026-06-23 — 'Hanford Reach National Monument' renders)."
    why_human: "Visual appearance/layout is a UX behavior grep/unit tests cannot fully confirm. NOTE: production places.toml currently has NO true multi-place occurrence; inat_obs:320276469 sits in ONE place (Hanford Reach) but is duplicated across the waba_sample/inat_obs source arms (occ_id collision — filed to backlog). Dense real overlaps arrive with Phase 161 (WDFW). Multi-place membership itself is proven by the synthetic-overlap unit test."
---

# Phase 160: Overlap-capable place model (many-to-many membership) Verification Report

**Phase Goal:** Let a bee occurrence belong to more than one place. Replace the one-place-per-occurrence partition (scalar `place_slug` + `DISTINCT ON` + `ST_Overlaps` rejection) with many-to-many membership via a new `occurrence_places` bridge mart; drop `place_slug` from the occurrences mart; remove the overlap-rejection guard; recompute per-place counts/maps via the bridge (double-count across places); rewrite the frontend place filter as an EXISTS membership test; and list all member places in the sidebar occurrence detail.
**Verified:** 2026-06-23
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth (Success Criterion) | Status | Evidence |
| --- | --- | --- | --- |
| SC-1 | New `occurrence_places` bridge mart (one row per occ↔place, ST_Within INNER JOIN, no DISTINCT ON, synthetic occ_id); `place_slug` dropped from occurrences mart (contract 37→36 cols); bridge has its own 2-col enforced contract; `bash data/dbt/run.sh build` passes. | ✓ VERIFIED | `occurrence_places.sql` lines 37-52: INNER JOIN `ST_Within`, no DISTINCT ON, occ_id CASE, `ORDER BY occ_id, place_slug`. schema.yml parsed: occurrences=36 cols (contract enforced, no place_slug), occurrence_places=2 cols (contract enforced). dbt build run independently: **PASS=90 WARN=1 ERROR=0** (WARN = pre-existing `test_lin05`). Built parquet columns = `['occ_id','place_slug']`, 10,655 rows. |
| SC-2 | `places_validation.py` no longer rejects overlapping polygons; WKT/WGS84/slug/permit checks retained; overlapping places LOAD. | ✓ VERIFIED | `ST_Overlaps` code guard gone (only docstring note at line 14; `valid_geometries` accumulator removed). Slug (47-58), duplicate (51-55), permit (62-68), WKT (81-90), WGS84 (93-105) checks intact. `test_overlapping_polygons` asserts `validate_places(...) is None` (loads, no raise). Independent pytest: 37/37 pass across the 5 phase files. |
| SC-3 | Per-place counts (`places_export._query_counts`) and per-place maps (`places_maps`) derived via the bridge JOIN — double-count ACROSS places without within-place inflation. | ✓ VERIFIED | `places_export.py:86` uses `COUNT(DISTINCT CASE WHEN occ.ecdysis_id IS NOT NULL THEN occ.occ_id END) AS specimen_count` (WR-01 fixed); JOINs bridge on occ_id, GROUP BY place_slug. `places_maps.py:87` uses `SELECT DISTINCT b.place_slug, occ.lon, occ.lat` (WR-01 fixed). Both parameter-bind paths (IN-01 fixed). occ_id CASE matches occurrence.ts priority. |
| SC-4 | Frontend place filter is an EXISTS membership subquery against `occurrence_places` (not `place_slug = ?`); `place_slug` removed from OccurrenceRow + OCCURRENCE_COLUMNS; slug escaping retained; single-place selection preserved. | ✓ VERIFIED | `filter.ts:314-317` EXISTS subquery on `occurrence_places` keyed by `OCC_ID_SQL_CASE`; line 315 escaping `replace(/'/g,"''")`. `place_slug` absent from OCCURRENCE_COLUMNS (lines 85-100) and OccurrenceRow (only comments remain). `selectedPlace` still singular (line 24). filter.test asserts EXISTS/occurrence_places/escaped-slug and NOT `o.place_slug =` (lines 327-349). tsc clean. |
| SC-5 | A point in the overlap of two places resolves to BOTH slugs (two bridge rows), deterministic; sidebar lists ALL member place names, resolved in `<bee-atlas>` (state owner), presenters don't query wa-sqlite. | ✓ VERIFIED | `test_occurrence_places.py:127` asserts overlap point → EXACTLY two sorted rows (true multi-place membership). Real built parquet caveat: `inat_obs:320276469` yields two bridge rows for ONE place (Hanford Reach) — an `occ_id` collision across the `waba_sample`/`inat_obs` source arms, not two distinct places (filed to backlog 999.9). `getOccurrencePlaceSlugs` (wa-sqlite call) lives only in `bee-atlas.ts:1078`; `_resolvePlaceNames` assigns `_placeNamesByOccId`, passed down as `.placeNames` (line 546). `bee-occurrence-detail.ts` reads only the property (line 420), never queries. Mounted-component test asserts both names render (`bee-occurrence-detail.test.ts:131-140`). |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `data/dbt/models/marts/occurrence_places.sql` | M2M bridge, INNER JOIN ST_Within, no DISTINCT ON, synthetic occ_id | ✓ VERIFIED | 53 lines; CASE matches occurrence.ts; `_row_id` internal-only; ORDER BY for determinism |
| `data/dbt/models/marts/occurrences.sql` | place_slug + place join/DISTINCT ON removed | ✓ VERIFIED | with_place/place_dedup CTEs and fp.place_slug projection gone; remaining DISTINCT ON are county/ecoregion (out of scope) |
| `data/dbt/models/marts/schema.yml` | occurrences 36-col contract (no place_slug) + occurrence_places 2-col contract | ✓ VERIFIED | Parsed: both enforced; occurrence_places carries occ_id + place_slug |
| `data/places_validation.py` | ST_Overlaps removed, other checks kept | ✓ VERIFIED | guard + accumulator removed; docstring updated (IN-02 fixed) |
| `data/places_export.py` | _query_counts via bridge, DISTINCT specimen_count | ✓ VERIFIED | line 86 COUNT(DISTINCT ...), parameter-bound |
| `data/places_maps.py` | per-place points via bridge, SELECT DISTINCT | ✓ VERIFIED | line 87 SELECT DISTINCT, FileNotFoundError guard present |
| `data/sqlite_export.py` | ships occurrence_places table + index, with guard | ✓ VERIFIED | CREATE TABLE (line 447) preceded by FileNotFoundError guard (442-445, WR-03 fixed); idx_occ_places IF NOT EXISTS |
| `data/run.py` | bridge parquet in copy loop | ✓ VERIFIED | line 80 copy loop includes occurrence_places.parquet |
| `scripts/make-local-manifest.js` / `scripts/validate-db.mjs` | both whitelists include occurrence_places | ✓ VERIFIED | both arrays list 'occurrence_places' |
| `src/filter.ts` | EXISTS clause + place_slug removed | ✓ VERIFIED | EXISTS subquery, OCC_ID_SQL_CASE matches, columns cleaned |
| `src/bee-atlas.ts` | membership resolved in state owner, stale-guard | ✓ VERIFIED | getOccurrencePlaceSlugs + _resolvePlaceNames + _placeNamesGeneration (WR-02 fixed) |
| `src/bee-occurrence-detail.ts` | placeNames presenter render | ✓ VERIFIED | _renderPlaceNames reads passed-down map; never queries |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| occurrence_places.sql | geographies.places | INNER JOIN ST_Within, no DISTINCT ON | ✓ WIRED | lines 36-52 |
| run.py | EXPORT_DIR/occurrence_places.parquet | copy loop | ✓ WIRED | line 80 |
| sqlite_export.py | out.occurrence_places SQLite table | CREATE TABLE AS read_parquet | ✓ WIRED | line 447 + index |
| places_export._query_counts | occurrence_places.parquet | JOIN on occ_id | ✓ WIRED | line 88, GROUP BY place_slug |
| places_maps.generate_place_maps | occurrence_places.parquet | JOIN on occ_id, SELECT DISTINCT | ✓ WIRED | lines 87-88 |
| filter.ts buildFilterSQL | occurrence_places in occurrences.db | EXISTS subquery on occ_id, escaped slug | ✓ WIRED | lines 314-317 |
| bee-atlas.ts (state owner) | occurrence_places via query helper | getOccurrencePlaceSlugs, names resolved, passed as property | ✓ WIRED | 1078 → 1083 → 546 |
| bee-occurrence-detail.ts | resolved names | property passed from bee-atlas (presenter receives state) | ✓ WIRED | property line 77, render line 420 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| occurrence_places mart | place_slug rows | int_combined ∩ geographies.places via ST_Within | Yes — 10,655 rows; 1 real multi-place occ | ✓ FLOWING |
| bee-occurrence-detail placeNames | `_placeNamesByOccId` | bee-atlas getOccurrencePlaceSlugs → occurrence_places.db | Yes — bridge-backed; mounted test renders 2 names | ✓ FLOWING |
| places.json specimen_count | per-place counts | occurrences JOIN bridge, COUNT(DISTINCT occ_id) | Yes — bridge-derived, no within-place inflation | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Bridge parquet schema | duckdb read_parquet LIMIT 0 | columns `['occ_id','place_slug']`, 10,655 rows | ✓ PASS |
| Real overlap → multi-row | GROUP BY occ_id HAVING COUNT>1 | inat_obs:320276469 → 2 bridge rows (1 place — source-arm dup, backlog 999.9) | ✓ PASS (mechanism); multi-place proven by unit test |
| place_slug gone from frontend | grep OccurrenceRow/OCCURRENCE_COLUMNS | absent (comments only) | ✓ PASS |
| tsc typecheck | npx tsc --noEmit | exit 0 | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
| --- | --- | --- | --- |
| dbt build gate | `bash data/dbt/run.sh build` | PASS=90 WARN=1 ERROR=0 (WARN pre-existing test_lin05) | ✓ PASS |
| pipeline pytest (5 phase files) | `uv run pytest tests/test_occurrence_places.py test_places_validation.py test_places_export.py test_places_maps.py test_sqlite_export.py` | 37 passed | ✓ PASS |
| frontend vitest | `vitest run src/tests/filter.test.ts bee-occurrence-detail.test.ts` | 82 passed | ✓ PASS |
| deferred concern (test_sqlite_export) | `uv run pytest tests/test_sqlite_export.py` | 16 passed (deferred fixture issue resolved) | ✓ PASS |

### Requirements Coverage

No REQUIREMENTS.md for v5.2 (confirmed). ROADMAP Success Criteria SC-1..SC-5 and CONTEXT decisions D-01..D-05 served as anchors — all satisfied (see Observable Truths). D-01 (bridge relation not array) ✓, D-02 (drop scalar place_slug) ✓, D-03 (remove ST_Overlaps) ✓, D-04 (sidebar lists all places) ✓ structurally + human spot-check below, D-05 (cross-place double-count) ✓.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| (none) | — | No TBD/FIXME/XXX/PLACEHOLDER in any of the 13 phase-modified files | — | Clean |

All 3 code-review WARNINGs (WR-01 within-place inflation, WR-02 stale-result guard, WR-03 FileNotFoundError guard) and 4 INFOs (IN-01 param binding, IN-02 docstring, IN-03 comment numbering, IN-04 stale line ref) were verified FIXED in the actual code, not merely claimed.

### Human Verification Required

#### 1. Multi-place occurrence detail renders all member place names (D-04)

**Test:** Open the sidebar occurrence detail for an occurrence with place membership (e.g. `inat_obs:320276469` → "Hanford Reach National Monument"; note this is ONE place, duplicated across source arms — true multi-place overlaps arrive with Phase 161 WDFW). **Operator-confirmed PASS 2026-06-23.**
**Expected:** Every member place NAME (not slug) renders as a readable chip in the detail pane, styled consistently with the existing place-name pattern. An occurrence in no place shows no place chips.
**Why human:** Visual appearance and sidebar layout are UX behaviors. The mounted-component unit test (`bee-occurrence-detail.test.ts:131-140`) confirms the `.member-place` chips appear in the shadow DOM with the right names, but live styling/placement cannot be confirmed programmatically.

### Gaps Summary

No gaps. All five Success Criteria are achieved in the actual codebase, verified independently of SUMMARY claims:

- The bridge mart exists with the correct INNER JOIN / no-DISTINCT-ON / synthetic occ_id semantics; the dbt contract is 36 cols on occurrences (no place_slug) and 2 cols on the bridge, both enforced; the build is green (PASS=90).
- The overlap-rejection guard is gone while all other validation checks remain; the inverted test asserts overlaps load.
- Counts and maps derive from the bridge with the cross-place double-count intended (D-05) and WITHOUT within-place inflation (COUNT(DISTINCT occ_id) / SELECT DISTINCT — the WR-01 fix is in the real code).
- The frontend filter is a genuine EXISTS membership subquery with retained slug escaping; place_slug is removed from the row type and column list; single-place selection is preserved.
- Overlap resolves to multiple bridge rows deterministically (unit test + real-data proof); membership names are resolved in the `<bee-atlas>` state owner (with a WR-02 stale-guard) and passed down to a pure presenter — the state-ownership invariant from CLAUDE.md is preserved.

Status is **human_needed** solely because the D-04 sidebar member-place display is a user-visible UX change whose visual rendering warrants one human confirmation; all automated checks pass.

---

_Verified: 2026-06-23_
_Verifier: Claude (gsd-verifier)_
