---
phase: 159-filter-by-taxon-from-occurrence-summary-in-sidebar
verified: 2026-06-22T23:52:15Z
status: passed
reverified: 2026-06-23T00:06:00Z
reverification_note: "All 3 human-verification items confirmed via automated Playwright UAT against the live dev server with real data (see 159-HUMAN-UAT.md — 4/4 pass). Code score was already 7/7."
score: 7/7 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Click a taxon name in the sidebar occurrence list"
    expected: "Map filters to that taxon; active filter chip for that taxon appears; other active filter dimensions (year, county, collector, etc.) remain unchanged"
    why_human: "Composed CustomEvent bubbling and Lit property reactivity cannot be verified by grep; requires a live browser session with a loaded dataset"
  - test: "Click the demoted Ecdysis icon link (🔗) next to a taxon in _renderCollectorGroup"
    expected: "Opens the correct Ecdysis record page in a new tab; does not apply a taxon filter"
    why_human: "Link target correctness and tab-open behavior are browser-only"
  - test: "Verify null-taxon rows (No determination / identification pending / verbatim-only) show no clickable affordance"
    expected: "Plain text rendered; no cursor:pointer, no role=button; clicking anywhere on the row does nothing filter-related"
    why_human: "Visual/interaction check; cursor style and role attributes render in browser only"
---

# Phase 159: Filter by Taxon from Occurrence Summary in Sidebar — Verification Report

**Phase Goal:** Give a quick click target on a taxon in the sidebar occurrence summary to filter the map to just that taxon, saving the filter-panel round-trip.
**Verified:** 2026-06-22T23:52:15Z (re-verified 2026-06-23 after UAT)
**Status:** passed
**Re-verification:** Yes — human-verification items closed by automated Playwright UAT (4/4 pass, 159-HUMAN-UAT.md)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Clicking a taxon name in the sidebar occurrence list filters the map to that taxon (D-01) | VERIFIED | `_onTaxonClick` dispatches `CustomEvent('filter-changed', {bubbles:true, composed:true})` reaching `bee-atlas`'s `@filter-changed` listener at line 548 via shadow-DOM bubbling. All four taxon-bearing render paths wire their taxon `<span role="button">` to `_onTaxonClick`. |
| 2 | Every external record destination the taxon name previously linked to stays reachable via a small icon link (D-02) | VERIFIED | `_renderCollectorGroup`: Ecdysis `<a>` now renders as `🔗` with `aria-label="View on Ecdysis"`. Other render paths' external links (`View on iNaturalist`, `View WABA observation`) were additive-only paths (no prior taxon-wrapping `<a>`) and are unchanged. |
| 3 | The taxon-filter affordance is present in `_renderCollectorGroup`, `_renderInatObs`, `_renderProvisional`, and `_renderChecklist` (D-03) | VERIFIED | `bee-occurrence-detail.ts` lines 247–248, 321, 295, 355–357 each contain `@click=${() => this._onTaxonClick(row.taxon_id!, ...)}` with `class="taxon-filter-link" role="button" tabindex="0"`. |
| 4 | Rows with null `taxon_id` have no filter affordance and no taxon link (D-04) | VERIFIED | Every taxon branch is guarded by `row.taxon_id != null` (or `accepted != null` in `_renderChecklist`); null paths render `<span class="no-determination">` or hint spans. `_renderSampleOnly` is untouched. Source-text test also asserts `_renderSampleOnly` body contains no `filter-changed`. |
| 5 | The emitted filter carries the exact `row.taxon_id` — no species roll-up (D-05) | VERIFIED | All call sites pass `row.taxon_id!` as the first argument to `_onTaxonClick`, which forwards it verbatim as `taxonId` in the `FilterChangedEvent` detail. Confirmed by source-text test regex `/_onTaxonClick\(row\.taxon_id/`. |
| 6 | Clicking a taxon replaces only `taxonId` + `taxonDisplayName` and preserves all other filter dimensions (D-07) | VERIFIED | `_onTaxonClick` (lines 205–213) spreads `yearFrom`, `yearTo`, `months`, `selectedCounties`, `selectedEcoregions`, `selectedCollectors`, `elevMin`, `elevMax`, `selectedPlace` from `this.filterState`. `bounds` is intentionally excluded (bee-atlas preserves it). Source-text tests assert all three dimension fields. |
| 7 | No new selection-clearing is introduced beyond the existing `_onFilterChanged` shared behavior (D-08) | VERIFIED | `grep selectedOccIds/clearSelection` in `bee-occurrence-detail.ts` returns no matches. The component dispatches only `filter-changed`; selection side effects remain in `bee-atlas._onFilterChanged` as before. |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/bee-occurrence-detail.ts` | filterState property, `_onTaxonClick` dispatch, name-as-filter / external-as-icon across 4 render paths | VERIFIED | Line 71: `@property({ attribute: false }) filterState: FilterState | null = null;`. Lines 197–216: `_onTaxonClick` with `new CustomEvent<FilterChangedEvent>('filter-changed', {bubbles:true, composed:true})`. All 4 render paths wired. |
| `src/bee-pane.ts` | `.filterState=${this.filterState}` on `<bee-occurrence-detail>` | VERIFIED | Line 1232: `.occurrences=${this.listRows} .taxonCache=${this.taxonCache} .filterState=${this.filterState}` |
| `src/tests/bee-occurrence-detail.test.ts` | source-text assertions for filterState prop, filter-changed dispatch, bubbles/composed, taxonId source, dimension preservation, sample-only exclusion | VERIFIED | `describe('bee-occurrence-detail.ts source structure', ...)` at line 46; 7 test cases covering all stated assertions. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `bee-occurrence-detail._onTaxonClick` | `bee-atlas @filter-changed` listener (line 548) | `new CustomEvent('filter-changed', {bubbles:true, composed:true})` bubbling through bee-pane shadow DOM | WIRED | `composed:true` crosses shadow boundary from bee-occurrence-detail (inside bee-pane shadow) to bee-atlas's listener on `<bee-pane>`. Pattern confirmed at `bee-atlas.ts:548`. |
| `bee-pane.ts` | `bee-occurrence-detail.filterState` property | `.filterState=${this.filterState}` Lit binding | WIRED | Confirmed at `bee-pane.ts:1232`. |

### Data-Flow Trace (Level 4)

Not applicable — this phase adds a new click entry point into existing filter machinery. No new data-fetching or state store is introduced; `filterState` flows down from `bee-atlas` through `bee-pane` (existing reactive property) to `bee-occurrence-detail` via the verified Lit binding.

### Behavioral Spot-Checks

Step 7b: SKIPPED — click interaction and shadow-DOM event bubbling cannot be verified without a running browser. Delegated to human UAT below.

### Probe Execution

Step 7c: No probes declared or conventional probe scripts for this phase.

### Requirements Coverage

No REQUIREMENTS.md IDs mapped to this phase. Verification is goal-backward against CONTEXT D-01..D-08 (all 8 decisions verified above) and the ROADMAP phase goal.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | — | — | No debt markers, stubs, or placeholder patterns found in modified files. |

Scanned: `src/bee-occurrence-detail.ts`, `src/bee-pane.ts`, `src/tests/bee-occurrence-detail.test.ts`, `src/tests/bee-pane.test.ts`. No `TBD`, `FIXME`, `XXX`, `return null`, `return []`, `return {}` in phase-modified code.

### Test Suite

`npm test`: 836/836 passed (32 test files).
`npx tsc --noEmit`: clean (no output, exit 0).

The 7 new source-text tests in `describe('bee-occurrence-detail.ts source structure', ...)` all pass. One new threading assertion added to `bee-pane.test.ts` also passes.

### Human Verification Required

#### 1. Taxon click filters map

**Test:** Open the app (`npm run dev`), click a map point to populate the sidebar occurrence list, then click a taxon name in the list.
**Expected:** The map filters to that taxon only; a taxon chip appears in the filter panel; other active filter dimensions (year range, county, collector) remain unchanged.
**Why human:** Lit property reactivity, shadow-DOM event bubbling chain, and map re-render require a live browser with a loaded dataset.

#### 2. Demoted Ecdysis icon link still works

**Test:** In the sidebar, locate a specimen record (Ecdysis-backed row in `_renderCollectorGroup`); click the `🔗` icon link.
**Expected:** Opens the correct Ecdysis occurrence page in a new tab. The taxon name itself is the filter trigger, not the icon.
**Why human:** Link target correctness and new-tab behavior are browser-only.

#### 3. Null-taxon rows show no affordance

**Test:** Find a row with "No determination" or "identification pending" in the sidebar. Verify no hover cursor change, no `role="button"` visual affordance.
**Expected:** Plain hint text rendered; clicking does nothing filter-related.
**Why human:** Visual rendering and cursor style require browser inspection.

### Gaps Summary

No gaps. All 7 must-have truths are VERIFIED in the codebase. The three human verification items above are interaction/visual checks that cannot be confirmed by static analysis — they are expected UAT items, not code defects.

---

_Verified: 2026-06-22T23:52:15Z_
_Verifier: Claude (gsd-verifier)_
