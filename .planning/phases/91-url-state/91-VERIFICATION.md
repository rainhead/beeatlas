---
phase: 91-url-state
verified: 2026-05-15T11:43:30Z
status: human_needed
score: 7/8 must-haves verified
overrides_applied: 0
human_verification:
  - test: "SEL-06 emit and restore round-trip"
    expected: "After shift-drag with >=1 row, URL shows sel=west,south,east,north (4 decimals, no o=). Pasting that URL in a new tab restores the sidebar with the same occurrences."
    why_human: "Requires a live dev server with SQLite loaded and actual shift-drag interaction."
  - test: "SEL-07 dismiss paths clear sel= from URL"
    expected: "Clicking close button, empty-clicking the map, or changing the filter each remove sel= from the URL bar."
    why_human: "Runtime browser behavior — cannot verify URL bar changes programmatically."
  - test: "Browser back/forward restores/clears sel= correctly"
    expected: "Browser Back restores the prior sel= state (or lack thereof); Forward does the inverse."
    why_human: "Requires a live browser session with history stack."
  - test: "sel= and filter params coexist simultaneously in the URL"
    expected: "After a shift-drag with an active taxon filter, both sel=... and taxon=... appear in the URL bar."
    why_human: "Runtime URL state — not testable by static grep."
---

# Phase 91: URL State Verification Report

**Phase Goal:** Rectangle selection bounds are round-tripped through the URL so selections are shareable and survive page refresh
**Verified:** 2026-05-15T11:43:30Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | After a rectangle selection the URL gains a `sel=west,south,east,north` param with 4 decimal places | ✓ VERIFIED | `_pushUrlState` 3-way ternary at line 504–508 routes `_selectionBounds && _sidebarOpen` to `buildParams` with `type: 'bounds' as const`; `buildParams` calls `toFixed(4)` on each coordinate (url-state.ts lines 64–71); `_onSelectionDrawn` calls `this._pushUrlState()` at line 694 after `_sidebarOpen = true` |
| SC-2 | Pasting the URL in a new tab re-runs the bounds query and opens the sidebar with the same occurrences | ✓ VERIFIED | `firstUpdated` bounds branch at line 285–288 sets `_selectionBounds` and calls `_restoreBoundsSelection`; `_restoreBoundsSelection` at lines 956–972 awaits `tablesReady`, calls `queryOccurrencesByBounds`, assigns `_selectedOccurrences` and `_selectedOccIds`. Human smoke-test approved in SUMMARY-02. |
| SC-3 | Clicking anywhere on the map to dismiss the sidebar removes the `sel=` param from the URL | ✓ VERIFIED | `_onMapClickEmpty` sets `this._selectionBounds = null` in both branches (lines 711, 723) then calls `_pushUrlState()`; with `_selectionBounds` null, `_pushUrlState` ternary falls through to ids/cluster paths, emitting no `sel=` |
| SC-4 | The `sel=` param integrates cleanly with existing filter params — both are preserved simultaneously in the URL | ✓ VERIFIED | `buildParams` only emits `sel=` when `selection.type === 'bounds'` — it is independent of filter params which always emit; test in url-state.test.ts line 372–381 (`combined params: bounds selection + filter coexist`) passes |

### Additional Must-Have Truths (from PLAN frontmatter)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| T-1 | SelectionState supports `{ type: 'bounds'; west; south; east; north }` — buildParams signature unchanged | ✓ VERIFIED | url-state.ts line 27 adds third union variant; `buildParams` signature unchanged (4 params: view, filter, selection, ui) |
| T-2 | buildParams emits sel= with 4 decimal places; does NOT emit o= alongside | ✓ VERIFIED | url-state.ts lines 64–71; test at url-state.test.ts line 328–333 asserts `params.has('o')` is false and `params.has('sel')` is true |
| T-3 | parseParams silently drops malformed sel= (non-finite, out-of-range, south>=north) | ✓ VERIFIED | url-state.ts lines 187–204 validate all four coordinates and `south < north`; 5 rejection tests at url-state.test.ts lines 347–370 pass |
| T-4 | D-03: `_selectionBounds` is cleared at every dismiss site | ✓ VERIFIED | `grep -c "this._selectionBounds = null" src/bee-atlas.ts` = 5: `_onClose` (line 834), `_onMapClickEmpty` boundary branch (line 711), `_onMapClickEmpty` plain branch (line 723), `_onFilterChanged` (line 749), `_onPopState` else-branch (line 581) |
| T-5 | popstate (browser back/forward) restores or clears sel= correctly | ✓ VERIFIED (code) / ? UNCERTAIN (runtime) | `_onPopState` adds bounds branch at line 570–576 calling `_restoreBoundsSelection`; else-branch at line 577–583 clears `_selectionBounds`; human smoke-test in SUMMARY-02 confirmed "Popstate back/forward: sidebar state tracks URL correctly" |

**Score:** 7/8 truths verified (SC-2 and T-5 have code-level verification; runtime verification was confirmed by human in SUMMARY-02 but not re-run by this verifier)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/url-state.ts` | Extended SelectionState union + buildParams/parseParams for bounds | ✓ VERIFIED | Line 27: `\| { type: 'bounds'; west: number; south: number; east: number; north: number }`. Line 64–71: `buildParams` bounds branch. Lines 187–204: `parseParams` sel= block. Contains `type: 'bounds'` at 2 locations (union + assignment). |
| `src/tests/url-state.test.ts` | Round-trip and validation tests for bounds variant | ✓ VERIFIED | `describe('bounds selection (SEL-06)')` at line 311 with 11 tests, including round-trip, positive-longitude formatting, no o= assertion, rejection tests for malformed/out-of-range/inverted inputs, and combined filter coexistence. |
| `src/bee-atlas.ts` | Wired _selectionBounds into _pushUrlState, 4 clear sites, _restoreBoundsSelection, firstUpdated + _onPopState branches | ✓ VERIFIED | `_restoreBoundsSelection` defined at line 956; 5 null-clear sites confirmed; `initSel?.type === 'bounds'` at line 285; `parsedSel?.type === 'bounds'` at line 570; 3-way ternary at lines 504–508; `_pushUrlState()` call in `_onSelectionDrawn` at line 694. |
| `src/tests/bee-atlas.test.ts` | Static-grep wiring tests for SEL-06 and SEL-07 | ✓ VERIFIED | `describe('SEL-06 + SEL-07 wiring (Phase 91)')` at line 392 with 12 tests, all passing. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `_pushUrlState` selection ternary | `buildParams` sel arg | `this._selectionBounds && this._sidebarOpen` checks bounds precedence | ✓ WIRED | Line 504 exact match confirmed |
| `_onSelectionDrawn` success branch | `_pushUrlState()` | Called after `this._sidebarOpen = true` | ✓ WIRED | Line 693–694: `_sidebarOpen = true` then `_pushUrlState()` |
| `_onClose`, `_onMapClickEmpty`, `_onFilterChanged` | `this._selectionBounds = null` | Added alongside existing selection clears | ✓ WIRED | 4 clear sites in these methods confirmed (line 834, 711, 723, 749) |
| `firstUpdated` bounds branch | `_restoreBoundsSelection` | `initSel?.type === 'bounds'` → `_restoreBoundsSelection(...)` | ✓ WIRED | Lines 285–288 confirmed |
| `_onPopState` bounds branch | `_restoreBoundsSelection` | `parsedSel?.type === 'bounds'` → `_restoreBoundsSelection(...)` | ✓ WIRED | Lines 570–576 confirmed |
| `_restoreBoundsSelection` | `queryOccurrencesByBounds` | Awaits `tablesReady` then calls query | ✓ WIRED | Lines 960–961 confirmed |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `_restoreBoundsSelection` | `_selectedOccurrences` | `queryOccurrencesByBounds(this._filterState, bounds)` | Yes — queries SQLite via filter.ts; result sorted and assigned to `_selectedOccurrences` (line 965) | ✓ FLOWING |
| `_pushUrlState` ternary | `sel=` param | `this._selectionBounds` (set by `_onSelectionDrawn` from `e.detail`) | Yes — populated from actual drag bounds event detail | ✓ FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED for the browser-interaction portions (requires live dev server). Automated checks run instead:

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| url-state tests pass | `npx vitest run src/tests/url-state.test.ts` | 47 passed | ✓ PASS |
| bee-atlas wiring tests pass | `npx vitest run src/tests/bee-atlas.test.ts` | 64 passed | ✓ PASS |
| Full suite no regressions | `npx vitest run` | 385 passed (23 files) | ✓ PASS |
| TypeScript clean | `npx tsc --noEmit -p tsconfig.json` | Exit 0 (no output) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SEL-06 | 91-01, 91-02 | Rectangle bounds encoded in URL as `sel=west,south,east,north` (4 decimal places); restored on page load | ✓ SATISFIED | `buildParams` emits sel=; `parseParams` reads sel=; `firstUpdated` and `_onPopState` restore via `_restoreBoundsSelection` |
| SEL-07 | 91-02 | When sidebar dismissed, `sel=` param cleared from URL | ✓ SATISFIED | 5 null-clear sites confirmed; `_pushUrlState` emits no sel= when `_selectionBounds` is null |

Both requirements declared in PLAN frontmatter (91-01: SEL-06; 91-02: SEL-06, SEL-07) are covered. REQUIREMENTS.md marks both as `[x]` complete.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/bee-atlas.ts` | 683 | Comment `Phase 91 will also read it for sel= URL encoding` (informational, not a TODO/FIXME) | ℹ️ Info | None — factual comment about what the phase does; not a stub marker. The placeholder comment about calling `_pushUrlState()` was confirmed removed (grep returns 0 hits). |

No `TBD`, `FIXME`, `XXX`, `TODO`, `HACK`, or `PLACEHOLDER` markers found in any phase-modified file.

### Human Verification Required

The automated code-level checks all pass. The following items require a human with a running dev server to fully confirm the end-to-end behavior. The SUMMARY-02 records human approval of all 9 scenarios — this verifier cannot re-run that check, so the items are flagged for completeness.

#### 1. SEL-06 Emit and Restore Round-Trip

**Test:** Run `npm run dev`. Shift-drag a rectangle over an area with specimen dots. Confirm URL bar shows `?sel=<4 decimals>,<4 decimals>,<4 decimals>,<4 decimals>` and no `o=`. Copy URL, paste in new tab, confirm sidebar re-opens with same occurrences.
**Expected:** sel= appears on successful selection; same occurrences restored in new tab after SQLite loads.
**Why human:** Requires live dev server with SQLite loaded and actual mouse drag interaction.

#### 2. SEL-07 Dismiss Paths

**Test:** With sidebar open from a rectangle selection, test each dismiss path: (a) click close button, (b) empty-click the map, (c) apply a taxon filter.
**Expected:** Each action removes `sel=` from the URL bar.
**Why human:** Runtime URL bar state not testable by static grep or unit tests.

#### 3. Browser Back/Forward

**Test:** After several selection/dismiss cycles, click browser Back and Forward buttons.
**Expected:** Sidebar state (open with rows, or closed) and sel= param track the URL history correctly.
**Why human:** Requires live browser session with history stack.

#### 4. sel= and Filter Params Coexist

**Test:** Apply a taxon filter, then shift-drag a rectangle. Confirm both `sel=` and `taxon=` appear in the URL simultaneously.
**Expected:** Both params present; sidebar shows occurrences matching both bounds and taxon filter.
**Why human:** Runtime URL state with active filter — not testable without live session.

---

## Gaps Summary

No gaps found. All code-level must-haves are verified:

- `SelectionState` union extended with `bounds` variant (url-state.ts line 27)
- `buildParams` emits `sel=` with `toFixed(4)` and does not emit `o=` alongside (lines 64–71)
- `parseParams` rejects malformed, out-of-range, and degenerate bounds (lines 187–204)
- All 11 url-state bounds tests pass
- `_pushUrlState` 3-way ternary gives `_selectionBounds` precedence (lines 504–508)
- `_onSelectionDrawn` calls `_pushUrlState()` after `_sidebarOpen = true` (line 694)
- 5 `_selectionBounds = null` clear sites cover all dismiss paths
- `_restoreBoundsSelection` method is substantive: `tablesReady` await, generation guard, `queryOccurrencesByBounds`, result assignment (lines 956–972)
- `firstUpdated` and `_onPopState` both route `type: 'bounds'` selections to `_restoreBoundsSelection`
- All 12 SEL-06/SEL-07 static-grep wiring tests pass
- Full suite: 385 tests, 0 failures; `tsc --noEmit` exits 0

Status is `human_needed` because 4 runtime behaviors (URL bar changes, browser history, live sidebar restore) require a dev server session. The SUMMARY-02 records human approval of all 9 scenarios on 2026-05-15, but this verifier does not count SUMMARY claims as evidence — the human approval items remain listed for a new manual check.

---

_Verified: 2026-05-15T11:43:30Z_
_Verifier: Claude (gsd-verifier)_
