---
phase: 157-regions-dropdown-obscured-by-filter-button
verified: 2026-06-22T00:00:00Z
status: passed
score: 8/8 must-haves verified
overrides_applied: 0
re_verification: null
---

# Phase 157: Regions dropdown obscured by filter button — Verification Report

**Phase Goal:** Fix the regions dropdown being visually obscured by the filter button (a stacking-context issue) by relocating the region control out of `<bee-map>`'s `z-index: 0` shadow DOM into `<bee-atlas>`, where it becomes a sibling of `<bee-pane>` and paints above it — WITHOUT deleting `bee-map`'s load-bearing `z-index: 0` (Phase 108 attribution guard) — and lay the collapsed filter button beside (not under) the regions button.
**Verified:** 2026-06-22
**Status:** passed (automated tests + in-browser checks + operator UAT sign-off)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC-1: the regions dropdown paints ABOVE `<bee-pane>` in all three pane states (collapsed, list, table) and both layouts (wide + narrow) | VERIFIED | In-browser hit-test: with the list pane open, the menu's center resolves to a region option button (BEE-ATLAS → BUTTON), not the pane; collapsed + table confirmed; operator UAT PASS |
| 2 | SC-2: `bee-map { ... z-index: 0 }` is RETAINED (not deleted) | VERIFIED | `grep "z-index: 0" src/bee-atlas.ts` shows the `bee-map` rule; STACK-01 asserts `/bee-map\s*\{[^}]*z-index:\s*0/`; in-browser table mode: pane (z-index 1) paints over map (z-index 0), attribution hit-tests behind the pane (does not bleed) |
| 3 | SC-1/SC-3: the region control (button + 4-option menu + `_regionMenuOpen` + outside-click) lives in `<bee-atlas>` as a sibling of `<bee-pane>` (in `.map-toolbar` within `.content`), elevated above the pane (toolbar z-index 2 > pane 1) | VERIFIED | `.map-toolbar`/`.region-control`/`.region-menu` markup + CSS in bee-atlas.ts; `_regionMenuOpen`/`_toggleRegionMenu`/`_selectBoundaryMode`/`_onDocumentClick` present; STACK-01 asserts `.map-toolbar { z-index: 2 }` and bee-pane `:host z-index: 1` |
| 4 | SC-3: `<bee-map>` no longer renders the region control; map-click boundary selection (`map-click-region`, ecoregion-fill click) is UNCHANGED | VERIFIED | `grep region-control src/bee-map.ts` → none; STACK-01 asserts beeMapSrc `.not.toMatch(/region-control/)`, `.not.toMatch(/_regionMenuOpen/)`, `.not.toMatch(/boundary-mode-changed/)`, while still matching `boundaryMode` + `map-click-region` |
| 5 | Boundary-mode selection behavior is identical (set `_boundaryMode`; leaving 'places' clears `selectedPlace` + re-runs filter/table queries; URL `ui.boundaryMode` synced) | VERIFIED | `_applyBoundaryMode` carries the exact former `_onBoundaryModeChanged` body; `_selectBoundaryMode` routes to it; STACK-01 signature test asserts the param union; in-browser Counties/Ecoregions/Places/Off toggled overlays (operator UAT PASS) |
| 6 | SC-4: the collapsed filter button is laid out BESIDE the regions button (flex row), not stacked below via `top: calc(0.5em + 2.5rem)` | VERIFIED | `.map-toolbar { display: flex; flex-direction: row-reverse; gap: 0.5rem }`; in-browser collapsed: regions pinned at right corner, filter button to its left, 8px gap; regions button does NOT shift when the pane opens (measured shift = 0px) |
| 7 | Architecture invariants hold: `<bee-atlas>` owns state; `<bee-map>`/`<bee-pane>` remain pure presenters; no shared module-level mutable state introduced | VERIFIED | The control moved INTO the state-owner (`<bee-atlas>`); `<bee-map>` shed UI it didn't own; no new module-level state; existing ARCH-02/03 sibling-isolation tests remain green |
| 8 | `npm test` green incl. a new `STACK-01` describe block; `tsc --noEmit` clean | VERIFIED | 32 files / 828 tests pass; STACK-01 (4 tests) pass; `tsc --noEmit` exit 0 |

**Score:** 8/8 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/bee-atlas.ts` | Relocated region control + `.map-toolbar` flex layout + shared `_applyBoundaryMode`; `bee-map { z-index: 0 }` retained | PRESENT | Modified across commits 8226b87c, 53c5ae77, 77480fe9 |
| `src/bee-map.ts` | Region control removed; `boundaryMode` @property + map-click logic kept | PRESENT | Modified in 8226b87c |
| `src/tests/bee-atlas.test.ts` | STACK-01 source-analysis block (z-index retained, toolbar elevation, relocation, flex layout) | PRESENT | Added in 14f59066, retargeted in 53c5ae77 |
| `157-HUMAN-UAT.md` | Operator checklist (3 pane states × 2 layouts + attribution regression + behavior) | PRESENT | Authored in 474d4c70; status: passed (operator sign-off 2026-06-22) |

---

## Verification Method

- **Automated:** `npm test` (32 files, 828 tests) + `tsc --noEmit` (exit 0). STACK-01 locks the z-index retention, toolbar elevation, relocation, and flex layout.
- **In-browser (Playwright, wide 1280×800 + narrow 420×880):** collapsed flex row (8px gap, flush right); open list pane flush right (inset bug fixed); region menu hit-tests above the list pane; table mode keeps the Mapbox attribution behind the pane (SC-2); regions button shift = 0px collapsed↔open.
- **Operator UAT:** approved 2026-06-22 (157-HUMAN-UAT.md).

## Notes

Two layout defects were found-and-fixed during UAT before sign-off: (1) the open sidebar was inset ~8rem (hard-coded collapsed offset leaked into `.pane-list`) — fixed by the `.map-toolbar` flex layout that dissolves via `display: contents` when expanded; (2) the regions button shifted on open — fixed with `flex-direction: row-reverse` pinning it at the right corner. Both verified resolved in-browser.

## Verdict

**PASSED** — 8/8 must-haves verified. Phase goal achieved: the regions dropdown reliably paints above the pane in all states/layouts, the load-bearing `z-index: 0` is retained, and the collapsed controls are a clean flex row with a stable regions button.
