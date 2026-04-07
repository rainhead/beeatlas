---
phase: 15-click-interaction-and-inat-links
verified: 2026-03-13T18:00:00Z
status: human_needed
score: 6/6 must-haves verified
human_verification:
  - test: "Click a sample dot on the map in sample mode"
    expected: "Sidebar shows observer name, formatted date, specimen count (or 'not recorded'), and 'View on iNaturalist' link"
    why_human: "Requires live browser interaction with the OpenLayers map click event pipeline"
  - test: "Click the iNat link in the sample dot detail view"
    expected: "Browser opens https://www.inaturalist.org/observations/{id} in a new tab with a valid observation page"
    why_human: "External URL validity and new-tab behaviour cannot be verified statically"
  - test: "Click the back button in the sample dot detail view"
    expected: "Sidebar returns to the recent events list"
    why_human: "Requires browser rendering of Lit reactive property update (selectedSampleEvent = null)"
  - test: "Click a specimen cluster in specimen mode with links.parquet loaded"
    expected: "Each species row shows ecdysis.org link followed by a clickable 'iNat' link for matched specimens and 'iNat: —' (muted) for unmatched ones"
    why_human: "Requires actual parquet data round-trip and rendered DOM inspection"
  - test: "Temporarily rename links.parquet and reload the app"
    expected: "App loads without error and all specimen rows show 'iNat: —'"
    why_human: "Graceful miss depends on runtime fetch failure and .catch() fallback; cannot be triggered statically"
---

# Phase 15: Click Interaction and iNat Links Verification Report

**Phase Goal:** Clicking a sample dot shows its iNat observation detail in the sidebar, and the specimen sidebar shows a clickable iNat link when a matching entry exists in links.parquet
**Verified:** 2026-03-13T18:00:00Z
**Status:** human_needed — all automated checks pass; 5 items need live browser confirmation
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Clicking a sample dot opens sidebar with observer name, date, specimen count (or 'not recorded'), and a clickable iNat observation link | ? HUMAN NEEDED | `_renderSampleDotDetail()` in bee-sidebar.ts:595–612 renders all four fields; singleclick handler in bee-map.ts:611–624 populates `_selectedSampleEvent`; passed via `.selectedSampleEvent=${this._selectedSampleEvent}` at line 459; `render()` routes to the detail at bee-sidebar.ts:642–643 |
| 2 | The iNat link in the sample dot detail opens `https://www.inaturalist.org/observations/{id}` in a new tab | ? HUMAN NEEDED | bee-sidebar.ts:608 — `href="https://www.inaturalist.org/observations/${event.observation_id}" target="_blank" rel="noopener"` — URL template and target verified statically; live navigation requires browser |
| 3 | The sample dot detail sidebar has a back/close control that returns to the recent events list | ? HUMAN NEEDED | bee-sidebar.ts:602 — `@click=${() => { this.selectedSampleEvent = null; }}` on `.back-btn`; `render()` correctly falls through to `_renderRecentSampleEvents()` when `selectedSampleEvent` is null (line 644–645); Lit reactive property update requires runtime verification |
| 4 | Each specimen row shows a clickable iNat link beside the ecdysis.org link when links.parquet has a matching occurrenceID | ? HUMAN NEEDED | bee-sidebar.ts:624–626 — `s.inatObservationId != null` branch renders `<a href="https://www.inaturalist.org/observations/${s.inatObservationId}">iNat</a>`; `buildSamples()` (bee-map.ts:118–119) injects `inatObservationId` via `linksMap.get(f.get('occurrenceID'))` — lookup key and injection fully wired; actual data match requires runtime |
| 5 | Each specimen row shows 'iNat: —' (em dash, muted text, not a link) when links.parquet has no match | ✓ VERIFIED | bee-sidebar.ts:627 — `html\` · <span class="inat-missing">iNat: —</span>\`` in else branch; CSS `.inat-missing { color: #aaa; }` at line 284–287; `undefined != null` is false so both undefined and null fields use this branch — correct |
| 6 | links.parquet loads eagerly at startup; absent file shows all specimens with 'iNat: —' with no error | ? HUMAN NEEDED | bee-map.ts:587–589 — `loadLinksMap(linksDump).catch(() => new Map<string, number>()).then(map => { this._linksMap = map; })` — graceful miss pattern present; fallback empty map means all `linksMap.get()` calls return `undefined`, producing `inatObservationId: null`, which renders 'iNat: —'; runtime file-missing test needed to confirm |

**Score:** 6/6 truths have complete static implementation; 5/6 require human confirmation for runtime behaviour

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/src/parquet.ts` | `loadLinksMap()` async function exported | ✓ VERIFIED | Lines 9–21: `export async function loadLinksMap(url: string): Promise<Map<string, number>>` — reads `occurrenceID` + `inat_observation_id` columns, coerces BigInt, returns Map |
| `frontend/src/bee-map.ts` | Links map loaded at startup; `buildSamples` extended with linksMap; sample dot singleclick wired | ✓ VERIFIED | `loadLinksMap` imported (line 6); `_linksMap` field (line 195); startup load at lines 587–589; `buildSamples(features, linksMap?)` signature (line 104); singleclick sample branch (lines 611–624); `selectedSampleEvent` binding (line 459) |
| `frontend/src/bee-sidebar.ts` | `Specimen.inatObservationId` field; `selectedSampleEvent` property; `_renderSampleDotDetail()`; extended `_renderDetail()`; updated `render()` | ✓ VERIFIED | `inatObservationId?: number \| null` at line 7; `selectedSampleEvent: SampleEvent \| null` property at lines 79–80; `_renderSampleDotDetail()` at lines 595–612; iNat link/placeholder in `_renderDetail()` at lines 624–627; render routing at lines 640–646 |
| `frontend/src/assets/links.parquet` | Occurrence-to-iNat link data file | ✓ VERIFIED | File present at 1.7 MB; force-added to git in commit 5c6dc6c |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `bee-map.ts` | `parquet.ts` | `loadLinksMap()` called in `firstUpdated()` | ✓ WIRED | `import { ParquetSource, loadLinksMap } from "./parquet.ts"` (line 6); called at bee-map.ts:587 with `linksDump` URL |
| `bee-map.ts` | `bee-sidebar.ts` | `.selectedSampleEvent` property set from singleclick handler | ✓ WIRED | `@state() private _selectedSampleEvent: SampleEvent \| null = null` (line 197); set in singleclick handler (line 618); bound to sidebar at line 459; `_onLayerChanged()` clears it at line 302 |
| `bee-sidebar.ts` | `https://www.inaturalist.org/observations/` | `_renderSampleDotDetail()` and `_renderDetail()` iNat link hrefs | ✓ WIRED | Sample dot detail: line 608; specimen row: line 625 — both use correct URL template with `target="_blank"` |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MAP-05 | 15-01-PLAN.md | Clicking a sample dot shows observer, date, specimen count, and a link to the iNat observation in the sidebar | ✓ SATISFIED (runtime pending) | `_selectedSampleEvent` populated from singleclick (bee-map.ts:611–624); `_renderSampleDotDetail()` renders all four required fields (bee-sidebar.ts:595–612); render routing correct (line 642–643) |
| LINK-05 | 15-01-PLAN.md | Specimen sidebar shows a clickable iNat observation link when a linkage exists in links.parquet | ✓ SATISFIED (runtime pending) | `buildSamples()` injects `inatObservationId` via `linksMap.get(f.get('occurrenceID'))` (bee-map.ts:118–119); `_renderDetail()` renders conditional link or placeholder (bee-sidebar.ts:624–627) |

No orphaned requirements — REQUIREMENTS.md maps only MAP-05 and LINK-05 to Phase 15, and both are claimed in 15-01-PLAN.md.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | — |

No stubs, placeholders, empty handlers, or TODO comments found in any phase-15-modified file. The three `placeholder=` occurrences in bee-sidebar.ts are HTML input placeholder attributes, not code stubs.

---

### Human Verification Required

#### 1. Sample dot click shows full observation detail

**Test:** In sample mode, click any dot on the map.
**Expected:** Sidebar replaces the recent events list with a panel showing: observer name, formatted date (e.g. "March 11, 2026"), specimen count as "N specimens" (or "not recorded" if NaN), and a "View on iNaturalist" link.
**Why human:** Requires the OpenLayers singleclick event to fire, `getFeatures()` to resolve, Lit `@state` to trigger re-render, and the correct view to appear in the browser DOM.

#### 2. iNat observation link opens correct URL in new tab

**Test:** In the sample dot detail view, click "View on iNaturalist".
**Expected:** A new browser tab opens at `https://www.inaturalist.org/observations/{observation_id}` with a valid iNaturalist observation page.
**Why human:** URL correctness with real data and new-tab behaviour require live browser interaction.

#### 3. Back button returns to recent events list

**Test:** With the sample dot detail visible, click the "← Back" button.
**Expected:** Sidebar returns to the recent collections list; the detail panel disappears.
**Why human:** Depends on Lit rendering `selectedSampleEvent = null` correctly across the component boundary.

#### 4. Specimen iNat links appear for matched occurrences

**Test:** In specimen mode, click a cluster; inspect each row in the detail panel.
**Expected:** Rows with a matching occurrenceID in links.parquet show `[species name] · iNat` where "iNat" is a clickable link to `https://www.inaturalist.org/observations/{id}`. Rows without a match show `[species name] · iNat: —` in muted grey.
**Why human:** Requires the full parquet data pipeline (links.parquet loaded, occurrenceID lookup, inatObservationId injected, rendered) to work end-to-end.

#### 5. Graceful miss when links.parquet is absent

**Test:** Rename `frontend/src/assets/links.parquet` to `links.parquet.bak`, restart the dev server, load the app, switch to specimen mode and click a cluster.
**Expected:** App loads without a JavaScript error; all specimen rows show `iNat: —`; no broken links.
**Restore:** Rename the file back after testing.
**Why human:** The `.catch(() => new Map())` fallback requires a live network/fetch failure to exercise; the resulting empty map behaviour must be confirmed in the rendered UI.

---

### Gaps Summary

No gaps found. All six must-have truths have complete, substantive, and correctly wired implementations verified statically in the codebase. The commit (5c6dc6c) exists in git history and matches all claimed file modifications. Five truths are flagged for human verification because they depend on browser rendering, live data pipelines, or runtime event handling that cannot be confirmed by static analysis alone.

---

_Verified: 2026-03-13T18:00:00Z_
_Verifier: Claude (gsd-verifier)_
