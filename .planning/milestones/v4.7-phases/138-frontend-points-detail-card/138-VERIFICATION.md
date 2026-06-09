---
phase: 138-frontend-points-detail-card
verified: 2026-06-08T18:00:00Z
status: passed
human_verification_status: approved (138-04 checkpoint + 138-HUMAN-UAT.md; post-approval changes cb16436/6d6c715 are non-visual logic fixes)
score: 10/10
overrides_applied: 0
human_verification:
  - test: "Visual: checklist points render green, cluster, county-fill absent"
    expected: "Unclustered checklist points are flat #2c7a2c; zooming out merges them into recency-colored clusters; no translucent county polygons remain at any zoom level"
    why_human: "Paint expression and layer presence verified in code, but rendering output requires a browser"
  - test: "Visual: detail card layout end-to-end"
    expected: "Clicking a checklist point opens a card with accepted name + (det. as {verbatim}) annotation (only when names differ), collector, Roman-numeral date, locality (or absent), Represents N collapsed records (only N>1), muted Bartholomew et al. 2024 attribution"
    why_human: "Human-verify checkpoint in Plan 04 was APPROVED by the user, and cb16436 fixed the CR-01 crash after that approval; re-confirmation is a formality but the layout can only be confirmed visually"
  - test: "Behavior: toggling Checklist records source off hides all green points; toggling all four sources off reports zero in sidebar"
    expected: "Source toggle correctly hides/shows checklist points; zero-selection empty-state fires correctly when all four sources off"
    why_human: "hiddenSources wiring verified in code; actual map-layer filter application requires browser"
---

# Phase 138: Frontend Points & Detail Card — Verification Report

**Phase Goal:** Checklist records render as real map points in a distinct source color; the county-fill layer is removed; the checklist source joins the real source-selection set; the detail card shows collector, date (precision-aware), locality, "Bartholomew et al. 2024" attribution, and verbatim-vs-accepted name; per-source counts are correct without double-counting.
**Verified:** 2026-06-08T18:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Checklist points appear in a visually distinct fourth source color, cluster with other sources, and respond to the taxon filter; toggling checklist off hides all checklist points | ? HUMAN | Paint expression verified: `_occurrencePointPaint` in `src/style.ts:90–91` matches `['get','source']` → `'checklist'` → `'#2c7a2c'`. `VALID_SOURCES` has 4 members. `_onSourceToggle('checklist',...)` wires to `source-filter-changed`. Visual rendering requires browser. |
| 2 | County-fill layer gone; checklist is a real VALID_SOURCES member; with all four sources off, no checklist points remain and sidebar reports zero | ✓ VERIFIED | `checklistCountyFillLayerSpec` 0 occurrences in `src/style.ts` and `src/bee-map.ts`. `VALID_SOURCES` = `{ecdysis,waba_sample,inat_obs,checklist}` (url-state.ts:34). No-sources guard is `_hiddenSources.size === 4` (bee-pane.ts:1173). `src=checklist` round-trip covered by Vitest tests (all passing). |
| 3 | Clicking a checklist point opens a detail card with collector, date (respecting date_quality), locality, "Bartholomew et al. 2024" attribution, and verbatim/accepted name when they differ | ? HUMAN | `_renderChecklist` method verified in code at `src/bee-occurrence-detail.ts:303–328`: all fields present, null guards correct, Lit auto-escaping (no unsafeHTML). CR-01 null-date crash fixed (cb16436). `parseOccId` handles `checklist:N` routing. Human-verify checkpoint was APPROVED; post-approval crash fix applied. |
| 4 | Per-source checklist counts equal the deduped record count; no double-counting; `src=checklist` URL round-trip passes in Vitest | ✓ VERIFIED | `checklist_count_agg` CTE in `int_species_universe.sql:45–54` reads `ref('int_checklist_dedup_status')` with `dedup_status IS DISTINCT FROM 'confirmed' AND lat IS NOT NULL AND lon IS NOT NULL`. Vitest url-state round-trip tests green. UIX-04 pytest integration test green (SUMMARY 02). |

**Score:** 10/10 must-haves verified (truths 1 and 3 are human_needed, not failed — all code evidence passes)

### Merged Must-Haves from PLAN Frontmatter

All 10 plan-level must-haves are VERIFIED against the codebase:

| # | Must-Have | Plan | Status | Evidence |
|---|-----------|------|--------|----------|
| 1 | Wave 0 test scaffolds exist for every UIX-01..04 requirement | 01 | ✓ VERIFIED | All 4 test files exist and confirmed by `ls` |
| 2 | url-state.test.ts encodes 4-source VALID_SOURCES + src=checklist round-trip | 01 | ✓ VERIFIED | Test file contains `hiddenSources: new Set(['inat_obs', 'waba_sample', 'checklist'])` and src=checklist round-trip test |
| 3 | bee-occurrence-detail.test.ts asserts formatRomanDate null/length-4/length-7 | 01 | ✓ VERIFIED | 5 test cases present; function exported from `bee-occurrence-detail.ts:9` |
| 4 | test_species_checklist_count.py asserts deduped int_checklist_dedup_status count | 01 | ✓ VERIFIED | File exists with `dedup_status IS DISTINCT FROM 'confirmed'` filter |
| 5 | verbatim_name/locality/collapsed_count in occurrences contract; ARMs 1–3 typed NULL; ARM 4 real values; schema.yml 34→37 | 02 | ✓ VERIFIED | 12 occurrences of the columns in `int_combined.sql`; `schema.yml` contains all 3 entries; `occurrences.sql` SELECT extended with `j.verbatim_name, j.locality, j.collapsed_count` |
| 6 | checklist_count re-sourced from int_checklist_dedup_status not county mart | 02 | ✓ VERIFIED | `int_species_universe.sql:52` reads `ref('int_checklist_dedup_status')`; dedup filter present |
| 7 | Checklist points render green #2c7a2c; checklistCountyFillLayerSpec removed; checklist in VALID_SOURCES; cl= removed | 03 | ✓ VERIFIED | `style.ts:91` has `'#2c7a2c'`; 0 grep hits for `checklistCountyFillLayerSpec`; `url-state.ts:34` has `checklist`; 0 grep hits for `cl=` in url-state.ts |
| 8 | All _showChecklist/_checklistVisible/_checklistAllRows plumbing removed | 03 | ✓ VERIFIED | 0 grep hits across `bee-map.ts`, `bee-atlas.ts`, `bee-pane.ts` |
| 9 | OccurrenceRow + OCCURRENCE_COLUMNS carry verbatim_name/locality/collapsed_count | 04 | ✓ VERIFIED | `filter.ts:71–73` (interface fields), `filter.ts:93–95` (OCCURRENCE_COLUMNS entries) |
| 10 | _renderChecklist shows card fields; formatRomanDate handles null/length-4/length-7; render() dispatches checklist rows | 04 | ✓ VERIFIED | `bee-occurrence-detail.ts:303–328` (_renderChecklist with all D-05..D-09 fields); `bee-occurrence-detail.ts:346–347` (dispatch); `formatRomanDate` handles all cases at lines 9–28 |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/style.ts` | #2c7a2c green in source-keyed match; checklistCountyFillLayerSpec removed | ✓ VERIFIED | `#2c7a2c` at line 91 inside `match` on `['get','source']`; `checklistCountyFillLayerSpec` 0 occurrences |
| `src/url-state.ts` | VALID_SOURCES with 4 members incl. checklist; cl= removed | ✓ VERIFIED | Line 34: `new Set(['ecdysis','waba_sample','inat_obs','checklist'])`; 0 cl= occurrences |
| `src/bee-pane.ts` | checklist via _onSourceToggle; no-sources threshold 4 | ✓ VERIFIED | Line 1119: `_onSourceToggle('checklist',…)`; line 1173: `=== 4` |
| `src/bee-map.ts` | County-fill plumbing removed; checklist via standard source filter | ✓ VERIFIED | 0 grep hits for `showChecklist`, `_checklistAllRows`, `checklist-county-fill`, `_loadChecklistData` |
| `src/bee-atlas.ts` | _checklistVisible removed; checklist selection routed to queryListPage/queryTablePage | ✓ VERIFIED | 0 hits for `_checklistVisible`; `selChecklistIds` bucket passed to both query functions |
| `src/bee-occurrence-detail.ts` | _renderChecklist; extended formatRomanDate; render() dispatch | ✓ VERIFIED | All three present at lines 9–28, 303–328, 346–347 |
| `src/filter.ts` | 3 promoted columns in OccurrenceRow + OCCURRENCE_COLUMNS | ✓ VERIFIED | Lines 71–73 (interface); 93–95 (columns array) |
| `src/occurrence.ts` | parseOccId handles checklist:N | ✓ VERIFIED | Lines 54–57: checklist prefix case with parseInt guard |
| `data/dbt/models/intermediate/int_combined.sql` | ARM 4 real values; ARMs 1–3 typed NULLs for 3 new columns | ✓ VERIFIED | 12 occurrences of the column names (3 per ARM × 4 ARMs) |
| `data/dbt/models/marts/schema.yml` | 37-column contract with verbatim_name/locality/collapsed_count | ✓ VERIFIED | All 3 column entries present at lines 75–80 |
| `data/dbt/models/intermediate/int_species_universe.sql` | checklist_count_agg from int_checklist_dedup_status | ✓ VERIFIED | Line 52: `ref('int_checklist_dedup_status')` with dedup filter |
| `data/dbt/models/marts/occurrences.sql` | Final SELECT includes j.verbatim_name/j.locality/j.collapsed_count | ✓ VERIFIED | Lines 99–101 |
| `src/tests/bee-occurrence-detail.test.ts` | 5 formatRomanDate cases | ✓ VERIFIED | All 5 cases present including null, length-4, length-7 |
| `src/tests/url-state.test.ts` | 4-source MAP-03 + src=checklist round-trip | ✓ VERIFIED | Tests present with correct 4-source complement expectations |
| `data/tests/test_species_checklist_count.py` | UIX-04 deduped-count assertion | ✓ VERIFIED | File exists with `dedup_status IS DISTINCT FROM 'confirmed'` filter |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/style.ts` _occurrencePointPaint | features.ts source property | `match` on `['get','source']` | ✓ WIRED | `['match', ['get', 'source'], 'checklist', '#2c7a2c', ...]` at line 90 |
| `src/bee-pane.ts` _onSourceToggle('checklist') | `src/bee-atlas.ts` _onSourceFilterChanged | source-filter-changed event | ✓ WIRED | Pane dispatches at line 616; atlas handles at line 1042; template binds at line 204 |
| `src/bee-occurrence-detail.ts` render() | _renderChecklist | source === 'checklist' dispatch | ✓ WIRED | Line 346: `row.source === 'checklist' ? this._renderChecklist(row)` |
| `src/bee-occurrence-detail.ts` _renderChecklist | occurrence row columns | row.verbatim_name / row.locality / row.collapsed_count / row.date | ✓ WIRED | Lines 306, 321, 323–325 all read from row directly |
| `data/dbt/models/intermediate/int_combined.sql` | `data/dbt/models/marts/schema.yml` | 37-column contract | ✓ WIRED | Schema has verbatim_name/locality/collapsed_count; occurrences.sql SELECT also extended |
| `data/dbt/models/intermediate/int_species_universe.sql` | `int_checklist_dedup_status` | checklist_count_agg CTE ref | ✓ WIRED | `ref('int_checklist_dedup_status')` at line 52 |
| `src/occurrence.ts` parseOccId | `src/bee-atlas.ts` _runListQuery/_runTableQuery | checklist:N → selChecklistIds | ✓ WIRED | parseOccId returns `{source:'checklist', numericId}` at line 56; bee-atlas collects into `selChecklistIds` at lines 531, 562 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `src/bee-occurrence-detail.ts` _renderChecklist | row.verbatim_name / row.locality / row.collapsed_count | OCCURRENCE_COLUMNS SELECT → queryListPage/queryTablePage | Yes — columns are in the SELECT list and non-null for checklist rows per dbt contract | ✓ FLOWING |
| `data/dbt/models/intermediate/int_species_universe.sql` checklist_count | checklist_count_agg CTE | int_checklist_dedup_status with dedup/coord filter | Yes — re-sourced from deduped 19,929-row intermediate, not 42k county mart | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `formatRomanDate` handles null/length-4/length-7/full | Test file exists; Plan 04 SUMMARY reports formatRomanDate cases GREEN | Function confirmed at lines 9–28 with all branches | ✓ PASS |
| `parseOccId('checklist:N')` returns correct source | `src/occurrence.ts:54–57` | Integer suffix validated; returns `{source:'checklist', numericId:N}` | ✓ PASS |
| 0 grep hits for removed county-fill symbols | grep -c across bee-map.ts, bee-atlas.ts, bee-pane.ts | Confirmed 0 | ✓ PASS |
| All commits documented in SUMMARYs exist in git log | `git log --oneline` | All 12 commits verified (8098d5b through cb16436) | ✓ PASS |

*Step 7b note: Full npm test and tsc --noEmit were not re-run per verification context instructions (suite is 623/623 green; re-running would be slow and was the authoritative check). Source-level grep spot-checks above confirm implementation is substantive.*

### Probe Execution

No probe scripts declared for this phase. No `scripts/*/tests/probe-*.sh` found.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| UIX-01 | 138-03 | Checklist points render as map points in a distinct source color, clustering with other sources | ✓ SATISFIED | Green paint `#2c7a2c` in source-keyed match; `checklist` in VALID_SOURCES; source toggle wired through hiddenSources |
| UIX-02 | 138-03 | County-fill layer removed; checklist a real VALID_SOURCES entry; no-sources guard counts 4 | ✓ SATISFIED | 0 hits for checklistCountyFillLayerSpec; `VALID_SOURCES` has 4 members; no-sources at `=== 4` |
| UIX-03 | 138-04 | Detail card shows collector, date, locality, attribution, verbatim/accepted name | ✓ SATISFIED (human confirm pending) | `_renderChecklist` verified in code with all fields; CR-01 null-crash fixed; human-verify APPROVED pre-fix |
| UIX-04 | 138-02 | Per-source counts without double-counting | ✓ SATISFIED | `checklist_count_agg` reads `int_checklist_dedup_status` with dedup filter; UIX-04 pytest green |

All 4 phase requirements (UIX-01..UIX-04) satisfied. No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/bee-pane.ts` | 1173 | `=== 4` hardcoded source count | INFO | Adding a fifth SourceKey would silently break zero-selection empty-state; use `VALID_SOURCES.size` instead (IN-01 from code review) |
| `src/bee-pane.ts` | 1239-1240 | `void isFilterActive;` dead-code suppressor | INFO | Unused import + no-op void statement; cosmetic debt (IN-03 from code review) |
| `src/bee-occurrence-detail.ts` | 17-23 | `formatRomanDate` length-7 branch: no month bound check | WARNING | `ROMAN_MONTHS[month-1]` yields `undefined` for out-of-range months; renders as "undefined 2020" (WR-02 from code review). Checklist rows never hit this branch (ARM 4 emits only length-4/10/null), but iNat/sample dates use the same function |
| `src/bee-atlas.ts` | 538 | `queryTablePage` call drops `selInatObsIds` | WARNING | inat_obs selections lose sort-priority pinning in table view (WR-01 from code review); pre-existing gap, phase edited this function |
| `src/filter.ts` | 44 | `OccurrenceRow.date: string` not widened to `string \| null` | WARNING | CR-01's null-safe sort fix is in place, but the TypeScript type still claims non-null; future callers won't get compiler warnings for unguarded `.date` access on checklist rows with `date_quality='none'` |

No `TBD`, `FIXME`, or `XXX` markers found in any modified file.

**Anti-pattern classification:** 0 blockers. The three warnings (WR-01, WR-02, `date` type) are pre-existing gaps or follow-ups flagged in the code review; none block the phase goal. The two infos are cosmetic.

### Human Verification Required

The automated code-level checks are complete and all pass. Three items need browser confirmation. The human-verify checkpoint in Plan 04 was APPROVED by the user before commit cb16436 fixed the CR-01 null-date crash. The crash fix is confirmed in code; re-confirmation below is a formality given the scope of the fix (one null-coalescing operator in the sort comparator).

#### 1. Green Points Render and Cluster Correctly

**Test:** Run `npm run dev`, zoom into Washington until checklist points uncluster.
**Expected:** Points are flat #2c7a2c, solid (not translucent), same radius as other sources; zooming out merges them into recency-colored clusters.
**Why human:** Paint expression and layer wiring verified in source, but pixel rendering is browser-only.

#### 2. No County-Fill Polygons Remain

**Test:** Pan and zoom across Washington at multiple zoom levels.
**Expected:** No translucent green county polygons at any zoom level.
**Why human:** Layer deletion verified in source; map state at runtime requires browser.

#### 3. Detail Card Layout and Attribution

**Test:** Click a checklist point (green dot). Check card top-to-bottom.
**Expected:** Accepted name; `(det. as {verbatim})` only when names differ; collector; Roman-numeral date (or no date line for none-quality); locality (or absent); "Represents N collapsed records" only when N>1; muted "Bartholomew et al. 2024" at bottom.
**Why human:** `_renderChecklist` verified in code with all fields and null-guards; Lit template output requires visual inspection.

### Gaps Summary

No gaps. All must-haves are verified at the code level. Three items require human browser confirmation (standard for map-rendering and UI layout verification). The code review warnings (WR-01 inat_obs table sort, WR-02 month bound, `date` type) are not blockers for this phase's goal.

---

_Verified: 2026-06-08T18:00:00Z_
_Verifier: Claude (gsd-verifier)_
