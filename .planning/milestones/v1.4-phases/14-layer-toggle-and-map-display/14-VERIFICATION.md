---
phase: 14-layer-toggle-and-map-display
verified: 2026-03-12T00:00:00Z
status: human_needed
score: 9/9 must-haves verified
human_verification:
  - test: "Click 'Samples' toggle button in sidebar — confirm specimen clusters disappear and teal sample dots appear on map"
    expected: "Only sample dots visible; specimen clusters hidden"
    why_human: "Layer visibility is runtime OpenLayers state; cannot verify programmatically"
  - test: "Click 'Specimens' toggle button — confirm sample dots disappear and specimen clusters reappear"
    expected: "Only specimen clusters visible; sample dots hidden"
    why_human: "Exclusive toggle behavior requires visual runtime verification"
  - test: "Switch to Samples mode, inspect URL bar"
    expected: "lm=samples appears in query string"
    why_human: "URL bar state only visible in browser"
  - test: "Paste a URL containing lm=samples in a new tab"
    expected: "Page loads with sample dots active, not specimen clusters"
    why_human: "URL restore behavior requires browser load"
  - test: "In Samples mode, verify taxon/year/month filter controls are NOT visible in sidebar"
    expected: "Filter section is hidden; only toggle and recent events list visible"
    why_human: "Conditional rendering requires visual inspection"
  - test: "Apply a taxon filter in Specimens mode, switch to Samples, switch back to Specimens"
    expected: "Previous taxon filter is restored (filterState survives the round-trip)"
    why_human: "State persistence across layer toggle requires interactive verification"
  - test: "In Samples mode with data loaded, verify sidebar shows collection event rows"
    expected: "Rows with observer name, formatted date, specimen count appear; 'Recent collections (last 14 days)' header visible"
    why_human: "Requires parquet data to load and recent events to exist in the 14-day window"
  - test: "Click a recent event row in Samples mode"
    expected: "Map animates pan/zoom to that sample dot's location"
    why_human: "Map animation requires visual verification"
---

# Phase 14: Layer Toggle and Map Display Verification Report

**Phase Goal:** Users can see iNat collection events as sample dots on the map and switch exclusively between specimen clusters and sample dots, with the sidebar and URL reflecting the active layer
**Verified:** 2026-03-12
**Status:** human_needed (all automated checks passed; runtime behavior requires human confirmation)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Sample dot markers appear on the map when sample mode is active | ? HUMAN | sampleLayer wired to OL map at line 186; sampleSource constructed with `new SampleParquetSource({url: samplesDump})`; samples.parquet inlined as base64 data URI in bundle (verified in minified JS) |
| 2 | Toggling to sample mode hides specimen clusters; toggling back hides sample dots | ? HUMAN | `_onLayerChanged` at line 298 calls `specimenLayer.setVisible(mode === 'specimens')` and `sampleLayer.setVisible(mode === 'samples')` — exclusive toggle confirmed |
| 3 | Switching layers clears the sidebar (no stale content) | VERIFIED | `_onLayerChanged` sets `this.selectedSamples = null` and `this._selectedOccIds = null` on every toggle (line 302-303) |
| 4 | The lm= URL parameter encodes the active layer mode | VERIFIED | `buildSearchParams` emits `lm` param when `layerMode !== 'specimens'` (line 73); omit-default pattern correct |
| 5 | Pasting a sample-mode URL restores sample dots | ? HUMAN | `parseUrlParams` parses `lm=samples` to `layerMode: 'samples'` (line 106); `firstUpdated()` restores it at lines 514-518 |
| 6 | Toggle buttons Specimens/Samples appear at top of sidebar | ? HUMAN | `_renderToggle()` is first call in `render()` at line 592; markup at lines 405-416 |
| 7 | Filter controls are hidden when sample mode is active | VERIFIED | `render()` at line 593: `${this.layerMode === 'specimens' ? this._renderFilterControls() : ''}` — conditional is correct |
| 8 | Sample mode shows collection events from last 14 days, sorted newest first | VERIFIED | `_buildRecentSampleEvents()` at lines 310-326 filters by `cutoff.setDate(cutoff.getDate() - 14)` and sorts by date descending |
| 9 | Each recent event row is clickable and pans/zooms the map | ? HUMAN | Event rows dispatch `sample-event-click` at line 429; `_onSampleEventClick` in bee-map.ts calls `this.map.getView().animate()` at line 330 |

**Score:** 9/9 truths implemented (4 verified programmatically, 5 need human runtime confirmation)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/src/bee-map.ts` | sampleLayer wired to OL map, layerMode @state, _onLayerChanged, lm= URL param | VERIFIED | All present and substantive; 634 lines |
| `frontend/src/bee-sidebar.ts` | layerMode @property, toggle UI, conditional filter rendering, SampleEvent interface, recent events list | VERIFIED | All present; SampleEvent exported at line 41; toggle at lines 404-416; conditional render at line 593 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| bee-map.ts module scope | firstUpdated() layers array | sampleLayer added after specimenLayer | WIRED | Line 501: `sampleLayer` in layers array; line 510: `sampleLayer.setVisible(false)` immediately after map construction |
| bee-map.ts _onLayerChanged | specimenLayer.setVisible / sampleLayer.setVisible | exclusive toggle | WIRED | Lines 300-301: `specimenLayer.setVisible(mode === 'specimens')` and `sampleLayer.setVisible(mode === 'samples')` |
| bee-map.ts buildSearchParams | URLSearchParams lm= | layerMode param | WIRED | Line 57: `layerMode` parameter; line 73: `params.set('lm', layerMode)` when non-default |
| BeeSidebar toggle buttons | layer-changed CustomEvent | _onToggleLayer dispatch | WIRED | Lines 419-426: `_onToggleLayer` dispatches `new CustomEvent<'specimens' | 'samples'>('layer-changed', ...)` |
| bee-sidebar render() | _renderFilterControls | layerMode === 'specimens' conditional | WIRED | Line 593: `this.layerMode === 'specimens' ? this._renderFilterControls() : ''` |
| recent event row click | sample-event-click CustomEvent | _onSampleEventRowClick dispatch | WIRED | Lines 428-434: dispatches `sample-event-click` with `{ coordinate: event.coordinate }` |
| bee-map.ts render() | bee-sidebar element | .layerMode, .recentSampleEvents, @layer-changed, @sample-event-click bindings | WIRED | Lines 458-473 in render() |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| MAP-03 | 14-01-PLAN.md | User can see iNat collection events rendered as simple dot markers on the map as a distinct layer | SATISFIED | `sampleSource` (SampleParquetSource) + `sampleLayer` (VectorLayer with sampleDotStyle) added as module-level constants; wired to OL map in firstUpdated(); samples.parquet inlined as data URI confirmed in production bundle |
| MAP-04 | 14-01-PLAN.md, 14-02-PLAN.md | User can toggle between specimen clusters and sample dots (exclusive — one layer visible at a time; sidebar clears on switch) | SATISFIED | `_onLayerChanged` implements exclusive setVisible toggle; `_onToggleLayer` in bee-sidebar dispatches layer-changed event; render() conditionally hides filter controls; selectedSamples cleared on every toggle |

No orphaned requirements — both MAP-03 and MAP-04 are claimed by plans in this phase, and REQUIREMENTS.md marks both as complete at Phase 14.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `frontend/src/bee-map.ts` | 608, 614 | `// Placeholder: clear selection (Phase 15 wires detail sidebar)` / `// sample mode — Phase 15 will add full detail` | INFO | Intentional deferral of sample-dot click detail to Phase 15; sample click clears selection instead of showing detail. The singleclick handler in sample mode is functional (not a dead stub) — it correctly handles no-hit and hit cases; it just doesn't show a detail panel yet. This is documented in PLAN and CONTEXT as expected behavior. |
| `frontend/src/bee-sidebar.ts` | 477, 492, 500 | `placeholder="..."` | INFO | HTML input placeholder attributes — not anti-patterns |

The sample singleclick handler (lines 607-618) is not a blocker. It processes click events, checks for hits, and clears state — Phase 15 will extend it with detail display. The behavior is correct for Phase 14's scope.

### Build Verification

```
> tsc && vite build
✓ 359 modules transformed
dist/assets/index-1O2DY7Zt.js  466.37 kB (gzip: 141.62 kB)
✓ built in 1.31s
```

Zero TypeScript errors. Build passes clean.

**Asset note:** `samples.parquet` is below Vite's default inline threshold and is bundled as a base64 data URI inside the JS bundle rather than emitted as a separate file. This is correct Vite behavior. The URL (`bS`) is used to construct `new TS({url:bS})` (SampleParquetSource) — confirmed in minified bundle output.

### Commit Verification

Phase 14 commits exist and are in git history:
- `8e905ce` — feat(14-01): wire sampleLayer, layerMode state, lm= URL param, and layer-toggle handler
- `cf0acab` — feat(14-02): add layer toggle UI, conditional filter rendering, and sample events list to bee-sidebar

### Human Verification Required

All automated checks pass. The following behaviors require human browser testing:

#### 1. Sample dots render on map

**Test:** Click "Samples" toggle; pan around the map
**Expected:** Teal/blue circle markers appear; green specimen clusters are hidden
**Why human:** OpenLayers layer visibility is runtime state

#### 2. Exclusive toggle (specimens back)

**Test:** Click "Specimens" from Samples mode
**Expected:** Sample dots disappear; specimen clusters reappear
**Why human:** Requires visual confirmation of mutual exclusion

#### 3. lm= URL param

**Test:** Switch to Samples mode; inspect URL bar
**Expected:** `lm=samples` present in query string
**Why human:** URL bar state only visible in browser

#### 4. URL restore (lm=samples)

**Test:** Copy URL with `lm=samples`; paste in new tab
**Expected:** App loads in Samples mode with sample dots active
**Why human:** Requires browser load from URL

#### 5. Filter controls hidden in Samples mode

**Test:** Click "Samples"; look at sidebar
**Expected:** Taxon/year/month filter section not visible; only toggle + recent events
**Why human:** Conditional rendering requires visual inspection

#### 6. Filter state persists across toggle round-trip

**Test:** Set a taxon filter in Specimens mode; switch to Samples; switch back
**Expected:** Previous taxon filter is still active when returning to Specimens
**Why human:** filterState singleton persistence requires interactive verification

#### 7. Recent events list populates

**Test:** Switch to Samples mode; wait for parquet to load
**Expected:** Rows appear with observer name, formatted date ("March 1, 2026"), specimen count
**Why human:** Depends on actual data having events within 14-day window

#### 8. Event row click pans map

**Test:** Click a row in the recent events list
**Expected:** Map animates to pan/zoom to that sample's location
**Why human:** Map animation requires visual runtime verification

### Gaps Summary

No gaps found. All 9 truths are implemented with substantive code. Both MAP-03 and MAP-04 are fully addressed. The build passes cleanly. The only outstanding items are runtime browser behaviors that cannot be verified statically — these are enumerated above for human confirmation.

---

_Verified: 2026-03-12_
_Verifier: Claude (gsd-verifier)_
