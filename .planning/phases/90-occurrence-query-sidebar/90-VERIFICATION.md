---
phase: 90-occurrence-query-sidebar
verified: 2026-05-15T16:10:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Shift-drag rectangle over a populated area of the WA map; release"
    expected: "Sidebar opens showing matched occurrences in date-descending order via bee-occurrence-detail"
    why_human: "Cannot test browser rendering, Mapbox canvas interaction, or wa-sqlite WASM execution in CI"
  - test: "Apply an active filter, then shift-drag rectangle over the same area"
    expected: "Sidebar shows only filter-passing occurrences (subset of unfiltered result)"
    why_human: "Filter-query intersection requires live WASM SQLite with loaded parquet data"
  - test: "Shift-drag rectangle over the Pacific Ocean (zero-occurrence area)"
    expected: "Sidebar does not open; no console errors"
    why_human: "Requires live app with real occurrence data to confirm empty-result path"
  - test: "Open sidebar via populated rectangle, then shift-drag over the ocean"
    expected: "Sidebar closes immediately (synchronous clear fires before async query returns), does not reopen"
    why_human: "Timing contract of synchronous pre-clear before await requires runtime observation"
---

# Phase 90: Occurrence Query & Sidebar — Verification Report

**Phase Goal:** Wire selection-drawn bounding-box events from bee-map into bee-atlas: query occurrences intersecting the active filter and lat/lon bounds, open sidebar with results, stay closed when empty.
**Verified:** 2026-05-15T16:10:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Releasing a shift-drag rectangle queries SQLite for occurrences whose lat/lon fall inside the bounds AND pass the current filter state | VERIFIED | `queryOccurrencesByBounds` at `src/filter.ts:321` constructs `WHERE (${occurrenceWhere}) AND lat BETWEEN ${south} AND ${north} AND lon BETWEEN ${west} AND ${east}` where `occurrenceWhere` comes from `buildFilterSQL(f)` |
| 2 | When the bounds query returns one or more occurrences, the sidebar opens with those occurrences rendered via bee-occurrence-detail | VERIFIED | `_onSelectionDrawn` at `src/bee-atlas.ts:653` assigns rows to `_selectedOccurrences`, sets `_sidebarOpen = true`; template at line 220 conditionally renders `<bee-sidebar .occurrences=${this._selectedOccurrences}>` which renders `<bee-occurrence-detail>` |
| 3 | When the bounds query returns zero occurrences, the sidebar does not open and no error is shown | VERIFIED | `if (rows.length === 0) return;` at `src/bee-atlas.ts:664` exits before any sidebar state is mutated |
| 4 | Drawing a new rectangle over an empty area closes any previously open sidebar instead of leaving stale results visible | VERIFIED | `_onSelectionDrawn` synchronously sets `_sidebarOpen = false`, `_selectedOccurrences = null`, `_selectedOccIds = null`, `_selectedCluster = null` at lines 656-659 BEFORE the first `await` |
| 5 | The active filter state in effect at the moment the rectangle is released is the filter state used for the query (no stale-filter race) | VERIFIED | `const f = this._filterState;` at line 661 snapshots filter before first `await`; `queryOccurrencesByBounds(f, ...)` uses that snapshot |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/filter.ts` | `queryOccurrencesByBounds(f, bounds)` exported async function returning `OccurrenceRow[]` | VERIFIED | Present at line 321; `export async function queryOccurrencesByBounds`; awaits `tablesReady`, calls `getDB()`, uses `OCCURRENCE_COLUMNS.join(', ')`, uses `buildFilterSQL`, interpolates numeric bounds literals, orders by `date DESC, recordedBy ASC` |
| `src/bee-atlas.ts` | `_onSelectionDrawn` async handler that runs the bounds query and opens the sidebar | VERIFIED | `private async _onSelectionDrawn` at line 653; imports `queryOccurrencesByBounds` from `'./filter.ts'` in the single import at line 3; `@ts-ignore` removed; full sidebar-open path implemented |
| `src/tests/bee-atlas.test.ts` | Static-grep coverage for SEL-03, SEL-04, SEL-05 | VERIFIED | Describe blocks at lines 354, 372, 384; all 6 tests pass (confirmed by test run showing all SEL-03, SEL-04, SEL-05 checks green) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/bee-atlas.ts (_onSelectionDrawn)` | `src/filter.ts (queryOccurrencesByBounds)` | named import from `'./filter.ts'` | WIRED | `queryOccurrencesByBounds` present in import at line 3; called at line 663 |
| `src/filter.ts (queryOccurrencesByBounds)` | `src/filter.ts (buildFilterSQL)` + `sqlite.ts (getDB, tablesReady)` | internal call composing occurrenceWhere with lat/lon BETWEEN clauses | WIRED | `buildFilterSQL(f)` called at line 326; `await tablesReady` at line 328; `await getDB()` at line 329; BETWEEN pattern at line 332 |
| `src/bee-atlas.ts (_onSelectionDrawn non-empty branch)` | bee-sidebar component (`_sidebarOpen=true` with `_selectedOccurrences` set) | Lit reactive state propagation after `import('./bee-sidebar.ts')` | WIRED | `import('./bee-sidebar.ts')` at line 665; `this._selectedOccurrences = rows.sort(...)` at line 666; `this._sidebarOpen = true` at line 671; template at line 220 binds both to `<bee-sidebar>` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `src/bee-atlas.ts (_onSelectionDrawn)` | `rows` | `queryOccurrencesByBounds(f, this._selectionBounds!)` via wa-sqlite `sqlite3.exec` against the `occurrences` table | Yes — SQL SELECT against live `occurrences` table using `OCCURRENCE_COLUMNS`; not a stub or static return | FLOWING |
| `src/filter.ts (queryOccurrencesByBounds)` | `rows: OccurrenceRow[]` | `sqlite3.exec(db, SELECT ...)` with `Object.fromEntries(...)` deserializer per row | Yes — real DB query pattern matching existing `_restoreClusterSelection` | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED — The bounds query requires a running browser with wa-sqlite WASM initialized and parquet data loaded. No runnable entry point exists outside the dev server. All four manual smoke scenarios are routed to human verification.

### Probe Execution

No probe scripts declared in PLAN or present in `scripts/*/tests/probe-*.sh`. Step 7c: SKIPPED.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SEL-03 | 90-01-PLAN.md | On drag release, occurrences whose lat/lon fall within the rectangle bounds AND pass current active filters are identified | SATISFIED | `queryOccurrencesByBounds` exports from `filter.ts`; called from `_onSelectionDrawn`; SEL-03 describe block with 3 passing tests |
| SEL-04 | 90-01-PLAN.md | Sidebar opens showing the matched occurrences (same `bee-occurrence-detail` presentation as a cluster click) | SATISFIED | `_sidebarOpen = true` + `_selectedOccurrences = rows` in `_onSelectionDrawn`; template binds to `<bee-sidebar>`; SEL-04 describe with 2 passing tests |
| SEL-05 | 90-01-PLAN.md | If zero filter-passing occurrences fall within the bounds, the sidebar is not opened | SATISFIED | `if (rows.length === 0) return;` guard; SEL-05 describe with 1 passing test |

No orphaned requirements. SEL-06 and SEL-07 are correctly mapped to Phase 91.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/bee-atlas.ts` | 662, 672 | Forward-looking comments referencing Phase 91 (`sel=` URL encoding, `_pushUrlState`) | Info | Intentional — Phase 91 explicitly owns URL state; these are known extension points, not stubs blocking this phase's goal |

No `TBD`, `FIXME`, or `XXX` markers in any of the three modified files. No empty implementations. No hardcoded empty data arrays returned from the new query function.

### Human Verification Required

#### 1. Sidebar opens with occurrences from rectangle gesture

**Test:** Start `npm run dev`. Open app. Wait for occurrences to load on the WA map. Hold shift and drag a rectangle over a visibly populated area. Release.
**Expected:** Sidebar opens immediately showing matched occurrences in date-descending order, each rendered via `bee-occurrence-detail` (same as cluster-click presentation).
**Why human:** Requires browser, Mapbox canvas, wa-sqlite WASM, and live parquet data. Cannot be checked without a running dev server.

#### 2. Filter intersection reduces sidebar results

**Test:** Apply a taxon filter (e.g. a single genus). Draw a rectangle over the same populated area.
**Expected:** Sidebar reopens showing only filter-passing occurrences — likely a subset of the unfiltered result, possibly empty.
**Why human:** Filter + bounds intersection requires live WASM query execution.

#### 3. Empty-area rectangle leaves sidebar closed

**Test:** Shift-drag a rectangle over the Pacific Ocean (or another zero-occurrence area).
**Expected:** Sidebar does not open. No console errors.
**Why human:** Requires live occurrence data to confirm zero-row result path.

#### 4. Synchronous clear on new rectangle over empty area

**Test:** Open sidebar via populated rectangle, then immediately drag a new rectangle over the ocean.
**Expected:** Sidebar closes synchronously when the drag releases (before the async query resolves), then does not reopen.
**Why human:** The timing contract (synchronous `_sidebarOpen = false` before `await`) is only observable at runtime with async timing visible in the UI.

### Gaps Summary

No gaps. All 5 must-have truths are VERIFIED against the codebase. All three required artifacts exist, are substantive, and are wired. All three key links are confirmed in source. All three requirement IDs (SEL-03, SEL-04, SEL-05) have static-grep proof and passing tests. TypeScript compiles clean. The full test suite (excluding the pre-existing `build-output.test.ts` failure unrelated to this phase) passes 358/362 tests.

Status is `human_needed` because four manual smoke scenarios are required to confirm the full runtime behavior of the bounds query, sidebar rendering, empty-area guard, and synchronous-clear contract — none of which can be verified without a running browser + wa-sqlite + live parquet data.

---

_Verified: 2026-05-15T16:10:00Z_
_Verifier: Claude (gsd-verifier)_
