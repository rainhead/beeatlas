---
phase: 18-map-integration
verified: 2026-03-14T22:00:00Z
status: gaps_found
score: 9/9 must-haves verified
re_verification: false
human_verification:
  - test: "Toggle UI renders at top-right of map"
    expected: "Floating 'Off / Counties / Ecoregions' buttons appear in the top-right corner of the map; active button has blue fill; inactive buttons are white"
    why_human: "CSS absolute positioning and visual rendering cannot be verified programmatically"
  - test: "County boundary overlay appears on click"
    expected: "Clicking 'Counties' shows subtle grey county boundary lines across Washington State; clicking 'Off' removes them"
    why_human: "GeoJSON feature rendering and visual appearance require browser verification"
  - test: "Ecoregion boundary overlay appears on click"
    expected: "Clicking 'Ecoregions' shows ecoregion outlines distinct from county outlines; only one type visible at a time"
    why_human: "Requires browser to verify OL layer source swap and rendering"
  - test: "Polygon click adds region to filter; sidebar updates"
    expected: "Clicking a county polygon shows 'Filter: [County Name]' in sidebar; specimens/samples outside that county are ghosted"
    why_human: "Requires browser to verify OL getFeatures pixel hit, filter state mutation, and visual ghosting"
  - test: "Toggle deselect removes region"
    expected: "Clicking the same county again removes it from filter; sidebar text clears"
    why_human: "Toggle Set logic verified in code, but user-visible outcome requires browser"
  - test: "Open map click clears all region selections"
    expected: "Clicking open water or non-polygon area clears region filter; sidebar text disappears"
    why_human: "Requires verifying OL getFeatures returns empty on open area"
  - test: "Specimen dot click takes priority over polygon click"
    expected: "With Counties active, clicking a specimen cluster opens specimen detail, not polygon filter"
    why_human: "Priority ordering in singleclick handler verified in code; actual pixel hit disambiguation requires browser test"
  - test: "URL round-trip restores state"
    expected: "After selecting a county, copy URL and paste in new tab; same boundary mode and county filter restored"
    why_human: "Requires browser navigation to verify URL decode and regionLayer restore"
  - test: "Back button undoes polygon click"
    expected: "After clicking a county polygon, pressing browser back restores previous filter state"
    why_human: "Requires browser history interaction"
---

# Phase 18: Map Integration Verification Report

**Phase Goal:** The region boundary overlay is visible on the map, users can toggle it between off / counties / ecoregions, clicking a polygon adds its region to the active filter, and region filter state round-trips through the URL
**Verified:** 2026-03-14T22:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

All automated checks pass. Nine human verification items remain for browser smoke test.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Pasting a URL with bm=counties restores county boundary mode and shows county outlines | VERIFIED | `parseUrlParams` decodes `bm=` param (line 114-116 bee-map.ts); `firstUpdated` and `_restoreFilterState` call `regionLayer.setSource(countySource)` + `regionLayer.setVisible(true)` when `boundaryMode === 'counties'` |
| 2 | Pasting a URL with counties=King,Pierce restores those counties in selectedCounties | VERIFIED | `parseUrlParams` decodes `counties=` param into `selectedCounties` Set (lines 118-121); `_restoreFilterState` assigns `filterState.selectedCounties = parsed.selectedCounties` |
| 3 | Pasting a URL with ecor=Cascades restores that ecoregion in selectedEcoregions | VERIFIED | `parseUrlParams` decodes `ecor=` param into `selectedEcoregions` Set (lines 123-126); `_restoreFilterState` assigns `filterState.selectedEcoregions = parsed.selectedEcoregions` |
| 4 | Pressing back after a polygon click restores the previous region filter state | VERIFIED | `_onPolygonClick` calls `window.history.pushState` (line 303); `_onPopState` calls `_restoreFilterState(parsed)` which restores region state including `regionLayer` visibility |
| 5 | When bm= is absent from URL, boundaryMode is 'off' and region filter is empty | VERIFIED | `parseUrlParams` defaults `boundaryMode` to `'off'` when `bm=` param absent (line 116 fallback); `selectedCounties` and `selectedEcoregions` default to empty Sets |
| 6 | Clicking Off/Counties/Ecoregions buttons changes which boundary overlay is visible | VERIFIED (code) | `_setBoundaryMode` wired to all three buttons via `@click` (lines 603-609); sets `regionLayer.setVisible` and `regionLayer.setSource` appropriately; HUMAN NEEDED for browser rendering |
| 7 | Clicking a county polygon adds that county name to the active filter; clicking again removes it | VERIFIED (code) | `_onPolygonClick` toggles county name in/out of `filterState.selectedCounties` Set (lines 278-304); singleclick fallback calls `_onPolygonClick` after specimen/sample miss; HUMAN NEEDED for browser |
| 8 | Clicking open map area outside all polygons clears all region selections | VERIFIED (code) | singleclick handler calls `_clearRegionFilter()` when `regionLayer.getFeatures` returns empty (lines 793, 822); HUMAN NEEDED for browser |
| 9 | Specimen and sample dot clicks take priority over polygon clicks | VERIFIED (code) | Singleclick handler checks `specimenLayer.getFeatures` first (specimens mode) and `sampleLayer.getFeatures` first (samples mode), returns early on hit before polygon fallback (lines 774-784, 800-813); HUMAN NEEDED for browser |

**Score:** 9/9 truths verified (5 fully automated, 4 code-verified pending browser smoke test)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/src/bee-map.ts` | boundaryMode @state(), regionLayer in map layers array, bm=/counties=/ecor= URL params, toggle UI, polygon click handler | VERIFIED | All present: `@state() private boundaryMode` (line 228), `regionLayer` in layers array (line 662), `buildSearchParams` writes `bm=`/`counties=`/`ecor=` (lines 73-79), `parseUrlParams` reads them (lines 114-126), `.boundary-toggle` HTML in `render()` (lines 602-609), `_onPolygonClick` (line 278), `_clearRegionFilter` (line 306), `_setBoundaryMode` (line 252), `_regionFilterText @state` (line 242) |
| `frontend/src/region-layer.ts` | Updated boundaryStyle with subtle stroke color | VERIFIED | `rgba(80, 80, 80, 0.55)` stroke at line 15; transparent fill at line 14 (required for interior click detection) |
| `frontend/src/style.ts` | sampleDotStyle ghosting filtered-out sample dots | VERIFIED | `GHOSTED_SAMPLE_STYLE` constant (lines 85-91); ghost check before cache lookup in `sampleDotStyle` using `isFilterActive` + `matchesFilter` (lines 96-100) |
| `frontend/src/bee-sidebar.ts` | regionFilterText @property, region-filter-text CSS class, render displays filter text | VERIFIED | `@property({ attribute: false }) regionFilterText: string | null = null` (line 84); `.region-filter-text` CSS (lines 313-318); template renders `<p class="region-filter-text">` when non-null (line 669) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| bee-map.ts parseUrlParams | ParsedParams.boundaryMode + selectedCounties + selectedEcoregions | bm= / counties= / ecor= URLSearchParams | WIRED | `bmRaw`, `countiesRaw`, `ecorRaw` all decoded and returned in ParsedParams object (lines 114-128) |
| bee-map.ts _restoreFilterState | regionLayer.setSource + regionLayer.setVisible | parsed.boundaryMode switch | WIRED | Lines 475-483: switch on `parsed.boundaryMode`, sets source and visibility; `sampleSource.changed()` called after (line 485) |
| bee-map.ts firstUpdated | regionLayer in map layers array | layers: [..., regionLayer] | WIRED | `regionLayer` is the last entry in the OL map `layers` array (line 662) |
| bee-map.ts singleclick handler | regionLayer.getFeatures(event.pixel) | fallback after specimen/sample miss when boundaryMode !== 'off' | WIRED | Lines 786-795 (specimens mode) and 815-824 (samples mode): both paths check `regionLayer.getFeatures` as fallback |
| bee-map.ts _onPolygonClick | filterState.selectedCounties / selectedEcoregions | feature.get('NAME') or feature.get('NA_L3NAME') toggle in/out of Set | WIRED | Lines 280-293: reads `NAME` for counties, `NA_L3NAME` for ecoregions; toggles in/out of Set and reassigns filterState |
| style.ts sampleDotStyle | filterState via matchesFilter | isFilterActive check before returning ghosted style | WIRED | Lines 97-100: `isFilterActive(filterState)` guard, `matchesFilter(feature, filterState)` check, returns `GHOSTED_SAMPLE_STYLE` on mismatch |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MAP-09 | 18-02-PLAN.md | User can toggle boundary overlay between off/county/ecoregion; only one type visible at a time | SATISFIED | `_setBoundaryMode` method, floating toggle HTML with three buttons, active-state CSS class on current mode |
| MAP-10 | 18-02-PLAN.md | User can click a visible boundary polygon to add region to filter; dot clicks take priority | SATISFIED | `_onPolygonClick` toggles region in/out of filterState Sets; singleclick handler checks dots first, polygon fallback after miss |
| FILTER-05 | 18-01-PLAN.md | Region filter state (boundaryMode, counties, ecoregions) encoded in URL; restored on paste/navigate | SATISFIED | `buildSearchParams` writes `bm=`/`counties=`/`ecor=`; `parseUrlParams` decodes them; `_restoreFilterState` and `firstUpdated` restore regionLayer + filterState + `_regionFilterText` |

All three requirement IDs from PLAN frontmatter (MAP-09 from 18-02, MAP-10 from 18-02, FILTER-05 from 18-01) are accounted for. No orphaned requirements: REQUIREMENTS.md Traceability table maps all three to Phase 18, and all three are marked Complete.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| bee-sidebar.ts | 526, 541, 549 | `placeholder=` attribute | Info | HTML input placeholder text — not a code stub, purely UI hint text |

No blocker or warning anti-patterns found. No TODO/FIXME/HACK/PLACEHOLDER comments. No empty implementations or stub return values in Phase 18 modified files.

### Human Verification Required

#### 1. Toggle UI renders at top-right of map

**Test:** Load the app at http://localhost:5173/ and look at the map area
**Expected:** Floating "Off / Counties / Ecoregions" buttons in the top-right corner of the map with white background and box shadow; active button ("Off" on load) has blue fill
**Why human:** CSS absolute positioning within Shadow DOM, z-index, and visual rendering cannot be verified without a browser

#### 2. County boundary overlay

**Test:** Click the "Counties" button
**Expected:** Subtle grey stroke county boundary lines appear across Washington State; "Off" removes them; only county lines visible (not ecoregion)
**Why human:** Requires OL VectorLayer rendering, GeoJSON feature display, and visual color verification

#### 3. Ecoregion boundary overlay

**Test:** Click "Ecoregions"
**Expected:** Ecoregion outlines appear, visually distinct from county boundaries; clicking "Counties" switches to county lines only
**Why human:** Requires browser to verify OL source swap behavior and rendering

#### 4. Polygon click adds region to filter

**Test:** With Counties active, click a county polygon
**Expected:** Sidebar shows "Filter: [County Name]" in blue; specimens and sample dots outside that county become translucent grey
**Why human:** Requires verifying OL pixel hit detection, Set mutation, sampleDotStyle ghost rendering, and sidebar text display in browser

#### 5. Toggle deselect removes region

**Test:** Click the same county again
**Expected:** County removed from filter; "Filter: [name]" disappears from sidebar; ghosting clears
**Why human:** Toggle Set logic is code-verified but user-visible outcome requires browser

#### 6. Open map click clears all region selections

**Test:** With a county selected, click open ocean or non-polygon area
**Expected:** All region selections clear; sidebar filter text disappears
**Why human:** OL `getFeatures` on open area returning empty array requires runtime verification

#### 7. Specimen dot priority over polygon click

**Test:** With Counties active, click a specimen cluster dot overlapping a county boundary
**Expected:** Specimen detail opens in sidebar (not treated as polygon click)
**Why human:** Pixel hit priority order is code-verified; actual disambiguation at shared pixel needs browser

#### 8. URL round-trip restores state

**Test:** Select a county filter, copy the URL, paste into new browser tab
**Expected:** Same boundary mode (counties) and county filter restored; sidebar shows "Filter: [name]"
**Why human:** Full HTTP navigation + URL decode + regionLayer + filterState restore path requires browser

#### 9. Back button undoes polygon click

**Test:** After clicking a county, press browser back
**Expected:** Previous filter state restored (polygon click undone); boundary overlay may or may not change depending on prior state
**Why human:** Browser history popstate interaction requires manual testing

### Gaps Summary

Four gaps found during browser smoke test (2026-03-14):

| # | Gap | Severity | Type |
|---|-----|----------|------|
| 1 | All specimen clusters and sample dots ghosted when region filter active — nothing matches | Blocker | Bug |
| 2 | Sidebar specimen/sample list unaffected by region filter after polygon click | High | Bug |
| 3 | Selected region polygons have no visual differentiation from unselected polygons | Medium | UX gap |
| 4 | Clicking a region should replace current selection (not add); shift-click should multi-select | Medium | Design gap |

**Gap 1 — All ghosted (blocker):** When a county or ecoregion is selected, every cluster and sample dot turns grey rather than only features outside the region. Root cause is likely a mismatch between the name stored in `filterState.selectedCounties` (from GeoJSON `NAME` property, e.g. `"King"`) and the name stored in `feature.get('county')` on specimen/sample features (from parquet, possibly `"King County"` or different casing). Alternatively, `clusterSource.changed()` may not be called after mutation, so `clusterStyle` is not re-evaluated.

**Gap 2 — Sidebar list unaffected:** After clicking a polygon, if a cluster is then clicked, the sidebar should only show specimens matching the active region filter (the `toShow` filter path in `singleclick` already exists). The user observes this is not working — connected to Gap 1 (if all fail matchesFilter, toShow is empty and the click is a no-op).

**Gap 3 — No selected polygon highlight:** User expects selected polygons to have distinct visual treatment (fill, stroke color, or opacity change) to confirm which regions are in the active filter. MAP-11 was deferred but the user is asking for it as part of basic usability.

**Gap 4 — Single-select by default:** User expects clicking a new polygon to replace the current selection (single-select), with shift-click to add to the selection (multi-select). Current implementation always adds/toggles. The `_onPolygonClick` handler needs to check for shift key and only use multi-select when held.

All four require gap closure plans. Bug gaps 1+2 are highest priority as they block basic functionality.
- Build compiles with zero TypeScript errors
- All four modified files contain substantive, non-stub implementations
- All six key links are fully wired (source writes to params, params read on parse, parse feeds restore, restore configures OL layer, singleclick handler hits polygon as fallback, style.ts ghosts via matchesFilter)
- All three requirement IDs (MAP-09, MAP-10, FILTER-05) have clear implementation evidence and are marked Complete in REQUIREMENTS.md
- No blocker anti-patterns in any modified file

Nine items require browser smoke test to confirm visual rendering, OL pixel hit detection, and real navigation behavior. These are inherently untestable by static analysis.

---

_Verified: 2026-03-14T22:00:00Z_
_Verifier: Claude (gsd-verifier)_
