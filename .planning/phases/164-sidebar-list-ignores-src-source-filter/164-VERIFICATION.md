---
phase: 164-sidebar-list-ignores-src-source-filter
verified: 2026-06-24T18:40:00Z
status: human_needed
score: 6/6 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
  note: initial verification (no prior VERIFICATION.md)
human_verification:
  - test: "Toggle a single source off on the MAP (e.g. deselect ecdysis via the Sources chips) with no other filter active."
    expected: "No greyed-out ghost dots appear for the hidden-source points, and there is no flicker as the map re-renders. The hidden source's points simply disappear (matching pre-164 client-side behavior)."
    why_human: "WR-02 — Phase 164 made a source-only filter trip isFilterActive, so the map now flows through the SQL/ghost-layer path instead of the legacy pure-client-side path. The double-filter (_visibleBySource at bee-map.ts:614) is expected to collapse the ghost set to empty, but this is a visual/render-timing property (ghost dots, flicker) that cannot be asserted by grep or unit test. Code review accepted WR-02 with no code change pending this UAT confirmation; if ghost dots appear it is a BLOCKER per the review."
---

# Phase 164: Sidebar occurrence list ignores the `src=` source filter — Verification Report

**Phase Goal:** Make the SQL-driven re-querying views (sidebar list, filter-result count, CSV export, table view) honor the `src=` source filter the map already respects, by promoting source into `FilterState.hiddenSources` and folding it into the shared `buildFilterSQL` predicate + `isFilterActive`, while leaving the map's client-side mechanism untouched. Verify the `src=` round-trip (URL ↔ Sources chips ↔ list) is consistent.

**Verified:** 2026-06-24T18:40:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Loading `…&pane=list&src=ecdysis,waba_sample` shows the sidebar list with ONLY the visible sources (matching the map) — deselected sources gone (D-01) | ✓ VERIFIED | `buildFilterSQL` emits `o.source IN (<visible>)` (filter.ts:397-406); `queryListPage` calls `buildFilterSQL` (filter.ts:486); `_onSourceFilterChanged` re-runs `_runListQuery` (bee-atlas.ts:1707). parseParams populates `result.filter.hiddenSources` (url-state.ts:276). |
| 2 | The filter-result count (`_filteredRowCount`), CSV export, and table view return the same source-restricted set as the list (D-01) | ✓ VERIFIED | All four consumers call the single `buildFilterSQL`: `queryVisibleGeoJSON` (filter.ts:423, count/map), `queryAllFiltered` (filter.ts:183, CSV), `queryTablePage` (filter.ts:228, table), `queryListPage` (filter.ts:486, list). `_onSourceFilterChanged` re-runs `_runFilterQuery`+`_runListQuery`+`_runTableQuery` (bee-atlas.ts:1706-1708); CSV reads `_filterState` at download time. |
| 3 | Deselecting all 4 sources yields honest empty list / count 0 / empty CSV / empty table (D-05) | ✓ VERIFIED | `visibleSources.length === 0` → pushes `1 = 0` (filter.ts:400-402). Unit test `all 4 sources hidden: occurrenceWhere contains 1 = 0` (filter.test.ts:347-351, passing). Single predicate → all four views inherit it. |
| 4 | The `src=` URL param round-trips: URL ↔ Sources chips ↔ list stays consistent (D-02), including the WR-01 all-off `src=none` sentinel | ✓ VERIFIED | `buildParams` writes `src=` (visible list, or `none` when all hidden — url-state.ts:94-100); `parseParams` reads it incl. `src=none` → all-hidden (url-state.ts:241-254); `hasFilter` recognizes src= (url-state.ts:261). Round-trip + sentinel tests pass (url-state.test.ts:448-481). |
| 5 | The map still renders source-correctly with no ghost-dot regression — bee-map keeps `hiddenSources` + `_visibleBySource` (D-03/D-04) | ✓ VERIFIED (code) / ⚠️ human for visual | `_visibleBySource` retained (6 refs) and `hiddenSources` property retained (7 refs) in bee-map.ts. Only bee-map.ts change in the phase is the `hiddenSources: new Set()` default-literal (commit efe93373) — ghost/clustering logic untouched. Visual ghost-dot/flicker check deferred to UAT (WR-02). |
| 6 | Headline summary stats (`_loadSummaryFromSQLite` total_specimens / earliest / latest) remain all-time, NOT source-filtered (D-01 note) | ✓ VERIFIED | `_loadSummaryFromSQLite` (bee-atlas.ts:764-788) runs `SELECT COUNT(*)… FROM occurrences WHERE ecdysis_id IS NOT NULL` — no `buildFilterSQL`, no source predicate. Untouched by the phase. |

**Score:** 6/6 truths verified (truth 5 fully code-verified; one visual sub-property routed to human UAT — WR-02).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/filter.ts` | FilterState.hiddenSources field + source predicate + isFilterActive clause | ✓ VERIFIED | Field at :27; isFilterActive `f.hiddenSources.size > 0` at :264; `o.source IN` predicate + `1 = 0` all-off at :397-407; WR-03 `-all-` collapse at :175. |
| `src/url-state.ts` | parseParams returns hiddenSources in result.filter; hasFilter recognizes src= | ✓ VERIFIED | src= parse hoisted before hasFilter (:239-254); hasFilter clause :261; result.filter.hiddenSources :276; buildParams src=none sentinel :94-100. |
| `src/bee-atlas.ts` | _filterState.hiddenSources single source of truth; _onSourceFilterChanged re-runs all four queries | ✓ VERIFIED | init :95; standalone `@state() _hiddenSources` field count = 0 (deleted); both render bindings :503/:558; restore :645/:1304; preserve :1542; initial URL write :691; `_onSourceFilterChanged` :1702-1709 re-runs Filter/List/Table queries + replaceUrlState. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| bee-atlas `_onSourceFilterChanged` | filter `buildFilterSQL` | `_filterState.hiddenSources` flows through `_runFilterQuery`/`_runListQuery`/`_runTableQuery` | ✓ WIRED | `_filterState = { ...this._filterState, hiddenSources: e.detail.hiddenSources }` (1 match) then 3 query calls (bee-atlas.ts:1704-1708). |
| filter `buildFilterSQL` | `occurrences.source` column | `o.source IN (<visible allowlist>)` | ✓ WIRED | `o.source IN` present (1 match, filter.ts:405); allowlist from hardcoded local `VALID_SOURCES`. |
| bee-atlas render template | bee-map `hiddenSources` property | `.hiddenSources=${this._filterState.hiddenSources}` | ✓ WIRED | 2 matches (bee-map :503, bee-pane :558); bee-map retains the property + `_visibleBySource`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| sidebar list / table / count | `_filterState.hiddenSources` | `_onSourceFilterChanged` writes from chip event; `queryListPage`/`queryTablePage`/`queryVisibleGeoJSON` query real `occurrences` table via `buildFilterSQL` | ✓ FLOWING | Source set drives the `o.source IN (...)` WHERE against the live sqlite occurrences table; not hardcoded. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite green | `npm test` | 32 files / 864 tests passed | ✓ PASS |
| tsc typecheck clean | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Source-filter unit tests (D-01/D-02/D-05) | `vitest run filter.test.ts url-state.test.ts -t source` | 22 passed, 0 failed | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| (none) | — | Phase declares no `scripts/*/tests/probe-*.sh`; not a migration/tooling phase | SKIPPED |

### Requirements Coverage

No REQUIREMENTS.md IDs map to this phase (`phase_req_ids` is null; PLAN `requirements: []`). Must-haves are driven by CONTEXT D-01..D-05 and the PLAN frontmatter, all verified above. No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | No TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER markers in filter.ts, url-state.ts, bee-atlas.ts, bee-map.ts | — | Clean. No stubs; all four SQL consumers wired to the live predicate. |

### Human Verification Required

#### 1. Source-only map toggle — no ghost dots / no flicker (WR-02)

**Test:** With no other filter active, deselect a single source on the map via the Sources chips (e.g. turn off ecdysis).
**Expected:** The hidden-source points disappear cleanly. No greyed-out ghost dots appear for those points, and no flicker as the map re-renders.
**Why human:** Phase 164 made a source-only filter trip `isFilterActive`, routing the map through the SQL/ghost-layer path instead of the legacy pure-client-side path. The double-filter (`_visibleBySource`, bee-map.ts:614) is designed to collapse the ghost set to empty, but ghost-dot presence and render flicker are visual/timing properties unverifiable by grep or unit test. Code review accepted WR-02 pending this UAT; ghost dots would be a BLOCKER (gate the ghost computation on a non-source filter).

### Gaps Summary

No code gaps. Every locked decision is delivered and proven:
- **D-01** — single `buildFilterSQL` source predicate consumed by list, count, CSV, and table; summary stats correctly excluded.
- **D-02** — `FilterState.hiddenSources` is first-class; `isFilterActive` accounts for it; `src=` round-trip preserved, with the WR-01 `src=none` sentinel persisting the all-off state across reload/share.
- **D-03/D-04** — bee-map untouched except the required default-literal; `_visibleBySource` + ghost layer + clustering intact.
- **D-05** — all-off emits `1 = 0` (honest zero) and survives a URL round-trip via `src=none`.

Tests (864) and tsc (0) are green at HEAD. The single open item is WR-02, a visual UAT that cannot be automated — hence status `human_needed` rather than `passed`. WR-01/WR-03 are fixed (commit 00423df3); IN-01/IN-02 are intentional non-blocking deferrals documented in the review.

---

_Verified: 2026-06-24T18:40:00Z_
_Verifier: Claude (gsd-verifier)_
