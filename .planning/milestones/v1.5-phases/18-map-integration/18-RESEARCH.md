# Phase 18: Map Integration - Research

**Researched:** 2026-03-14
**Domain:** OpenLayers event handling, LitElement @state pattern, URL encoding, floating overlay UI
**Confidence:** HIGH

## Summary

Phase 18 wires together components delivered by Phase 17 — `regionLayer`, `countySource`, `ecoregionSource`, `filterState.selectedCounties`, `filterState.selectedEcoregions` — and adds the user-facing interaction: boundary toggle UI, polygon click → filter mutation, and URL round-trip for boundary mode + region filter.

All the foundational building blocks exist and are tested: the VectorLayer is already exported from `region-layer.ts`, the filterState Sets are defined and respected by `matchesFilter()`, the GeoJSON features are loaded with confirmed property keys (`NAME` for counties, `NA_L3NAME` for ecoregions), and the `buildSearchParams`/`parseUrlParams` pattern is established in `bee-map.ts`. No new dependencies are required.

The phase is a pure TypeScript/LitElement wiring task. The three deliverables map cleanly to additions in `bee-map.ts`: (1) add `boundaryMode` `@state()`, extend URL functions, mount `regionLayer` in `firstUpdated`; (2) extend `singleclick` handler to hit-test `regionLayer` after specimen/sample miss; (3) render the floating three-button toggle in the Lit template.

**Primary recommendation:** Extend `bee-map.ts` in-place following every established pattern already present in that file. No new modules or dependencies required.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Boundary Toggle UI**
- A floating control in the top-right corner of the map — three always-visible buttons: Off, Counties, Ecoregions
- The active button is visually highlighted (Claude's discretion on exact style — solid fill vs. strong border)
- Button labels: exactly "Off / Counties / Ecoregions"
- Whether to keep or remove this floating toggle when Phase 19 ships the sidebar control: decide in Phase 19 (don't hard-code removal)

**Boundary Stroke Style**
- Change from current `#3388ff` (OL default blue) to a more subtle color — lighter or semi-transparent so boundary lines don't dominate over specimen/sample points
- Claude picks the specific color/opacity during implementation

**Polygon Click Behavior**
- Clicking a polygon adds the region to the active filter (selectedCounties or selectedEcoregions Set)
- Clicking an already-selected polygon removes it (toggle deselect)
- Clicking outside all polygons (open map area) clears the entire region filter (all counties and ecoregions)
- After a polygon click the boundary overlay stays visible — user can keep clicking to add/remove regions
- Each polygon click triggers pushState immediately (creates browser history entry, back button undoes region selection)
- Polygon click shows a simple text line in the sidebar: "Filter: [Region Name]" — Phase 19 replaces this with chips

**Specimen/Sample Click Priority**
- Specimen and sample dot clicks take priority over polygon clicks (already decided in STATE.md)
- singleclick handler: check specimen layer (or sample layer per layerMode) first; only check polygon layer if no specimen/sample hit

**Region Filter Scope**
- Region filter applies to both layers simultaneously — filtering King County hides specimens AND samples outside King County regardless of which layer is visible
- Consistent with how taxon/date filters work (global, not layer-gated)

**Layer Mode Independence**
- Boundary overlay mode (off/counties/ecoregions) is fully independent of layer mode (specimens/samples)
- Switching between specimens and samples preserves the boundary overlay and region filter
- Region filter persists across layer mode switches

**Filter + Overlay Coupling**
- Turning the overlay off (clicking the Off button) clears the region filter (selectedCounties and selectedEcoregions both reset to empty Sets)
- URL also clears (bm=, counties=, ecor= params all dropped) when overlay is turned off
- This means: filter active = overlay visible; filter inactive = overlay off

**URL Encoding**
- `bm=counties` or `bm=ecoregions` when overlay is active; omit `bm=` entirely when off (absence = off)
- `counties=` comma-separated, percent-encoded county names (e.g. `counties=King%20County,Pierce%20County`)
- `ecor=` comma-separated, percent-encoded ecoregion names
- Full restore on URL paste: bm= activates the overlay, counties=/ecor= apply the filter — both immediately on load

### Claude's Discretion
- Exact visual styling of active vs. inactive toggle buttons
- Subtle boundary stroke color and opacity
- How `buildSearchParams` and `parseUrlParams` are extended (additive, same pattern as existing params)

### Deferred Ideas (OUT OF SCOPE)
- Polygon highlighting when selected — MAP-11 deferred (sidebar chips are sufficient confirmation at launch)
- Whether Phase 18 floating toggle persists or is removed in Phase 19 — decide in Phase 19
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MAP-09 | User can toggle a boundary overlay between three states: off, county boundaries, ecoregion boundaries — only one boundary type is visible at a time; overlay is independent of the specimen/sample layer toggle | `regionLayer.setSource()` + `regionLayer.setVisible()` from `region-layer.ts`; `@state() boundaryMode` in `bee-map.ts` |
| MAP-10 | User can click a visible boundary polygon to add that county or ecoregion to the active filter; specimen and sample point clicks take priority over polygon clicks when both could register | `regionLayer.getFeatures(event.pixel)` hit-test after specimen/sample miss in singleclick handler; transparent Fill already in `boundaryStyle` enables interior hit-detection |
| FILTER-05 | Active region filter state (boundary mode, selected counties, selected ecoregions) is encoded in the URL (bm=, counties=, ecor= params) and restored when the URL is pasted or navigated to | Extend `buildSearchParams()` and `parseUrlParams()` following existing year/month/taxon pattern; extend `_restoreFilterState()` and `_onPopState()` |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ol` (OpenLayers) | 10.7.0 (installed) | VectorLayer getFeatures(), setSource(), setVisible() | Already the map rendering stack; no new imports needed beyond what Phase 17 already added |
| `lit` | 3.2.1 (installed) | `@state()`, `html` template, CSS-in-JS | Existing web component framework for `bee-map.ts` |

### Supporting
None required. All building blocks delivered by Phase 17.

### Alternatives Considered
None — decisions are locked. The stack is established.

**Installation:** No new packages required.

## Architecture Patterns

### Files Modified in This Phase
```
frontend/src/
├── bee-map.ts       # PRIMARY: all wiring changes — ~150 lines added/modified
├── region-layer.ts  # MINOR: update boundaryStyle stroke color to subtle shade
└── bee-sidebar.ts   # MINOR: add region filter display line ("Filter: [Region Name]")
```

### Pattern 1: `@state() boundaryMode` following `layerMode` pattern

`layerMode` in `bee-map.ts` is a `@state()` property that controls layer visibility. `boundaryMode` follows the same pattern:

```typescript
// Source: bee-map.ts existing pattern (layerMode)
@state() private layerMode: 'specimens' | 'samples' = 'specimens';

// New — same shape:
@state() private boundaryMode: 'off' | 'counties' | 'ecoregions' = 'off';
```

When `boundaryMode` changes: call `regionLayer.setSource(countySource | ecoregionSource)` and `regionLayer.setVisible(mode !== 'off')`. Also mutate `filterState.selectedCounties` and `filterState.selectedEcoregions` to empty Sets when mode becomes `'off'`, then call `clusterSource.changed()` + `sampleSource.changed()` to repaint.

### Pattern 2: regionLayer added to OL map layers array

In `firstUpdated()`, `regionLayer` is added to the layers array after `specimenLayer` and `sampleLayer` to ensure correct z-order (boundary on top of data points would be incorrect — should be below):

```typescript
// Correct z-order: base tiles → specimen/sample dots → boundary overlay ON TOP
// boundary overlay should render above specimen dots so polygon strokes are visible
// but below OL controls (controls float in their own DOM layer)
this.map = new OpenLayersMap({
  layers: [
    baseTileLayer1,
    baseTileLayer2,
    baseLayer,
    specimenLayer,
    sampleLayer,
    regionLayer,   // <-- added last, renders on top of dots
  ],
  ...
});
```

Note: The CONTEXT.md says "add `regionLayer` to the map's layer array (after specimen/sample layers for correct z-order)". This means boundary strokes render above the data points visually — boundary outlines are visible over dot markers, which is correct (you want to see the boundary lines even where dots are clustered). The transparent fill means dot interiors show through the polygon interior.

### Pattern 3: singleclick handler — polygon as fallback

The existing singleclick handler checks `specimenLayer` or `sampleLayer` depending on `layerMode`. When the boundary overlay is active, add a fallback check after a miss:

```typescript
// Source: bee-map.ts existing singleclick pattern, extended
this.map.on('singleclick', async (event: MapBrowserEvent) => {
  if (this.layerMode === 'specimens') {
    const hits = await specimenLayer.getFeatures(event.pixel);
    if (hits.length) {
      // ... existing specimen click logic ...
      this._pushUrlState();
      return;
    }
  } else {
    const hits = await sampleLayer.getFeatures(event.pixel);
    if (hits.length) {
      // ... existing sample click logic ...
      this._pushUrlState();
      return;
    }
  }

  // No specimen/sample hit — check boundary overlay if active
  if (this.boundaryMode !== 'off') {
    const polyHits = await regionLayer.getFeatures(event.pixel);
    if (polyHits.length) {
      this._onPolygonClick(polyHits[0]!);
      return;
    }
    // Miss on open map area — clear region filter
    this._clearRegionFilter();
    return;
  }

  // No boundary overlay — clear specimen selection
  this.selectedSamples = null;
  this._selectedOccIds = null;
});
```

### Pattern 4: `buildSearchParams` extension

`buildSearchParams` already handles optional params with early-return guards. Extend additively:

```typescript
// After existing params.set(...) calls:
if (boundaryMode !== 'off') params.set('bm', boundaryMode);
if (fs.selectedCounties.size > 0) {
  params.set('counties', [...fs.selectedCounties].sort().join(','));
}
if (fs.selectedEcoregions.size > 0) {
  params.set('ecor', [...fs.selectedEcoregions].sort().join(','));
}
```

`URLSearchParams` percent-encodes values automatically — spaces in "King County" become `King%20County` in the URL.

### Pattern 5: `parseUrlParams` extension

Extend `ParsedParams` interface and `parseUrlParams` function:

```typescript
interface ParsedParams {
  // ... existing fields ...
  boundaryMode: 'off' | 'counties' | 'ecoregions';
  selectedCounties: Set<string>;
  selectedEcoregions: Set<string>;
}

// In parseUrlParams:
const bmRaw = p.get('bm') ?? '';
const boundaryMode: 'off' | 'counties' | 'ecoregions' =
  (bmRaw === 'counties' || bmRaw === 'ecoregions') ? bmRaw : 'off';

const countiesRaw = p.get('counties') ?? '';
const selectedCounties = new Set(
  countiesRaw ? countiesRaw.split(',').map(s => s.trim()).filter(Boolean) : []
);

const ecorRaw = p.get('ecor') ?? '';
const selectedEcoregions = new Set(
  ecorRaw ? ecorRaw.split(',').map(s => s.trim()).filter(Boolean) : []
);
```

Note: `URLSearchParams.get()` returns the decoded value — `King%20County` is returned as `"King County"`. No manual decoding needed.

### Pattern 6: Floating toggle UI in Lit template

The existing `_renderToggle()` in `bee-sidebar.ts` is a good style reference. The boundary toggle is a separate floating element rendered by `bee-map.ts` (not bee-sidebar), positioned absolute over the map div:

```typescript
// In bee-map.ts render():
html`
  <div id="map"></div>
  <div class="boundary-toggle">
    <button class=${this.boundaryMode === 'off' ? 'btn active' : 'btn'}
            @click=${() => this._setBoundaryMode('off')}>Off</button>
    <button class=${this.boundaryMode === 'counties' ? 'btn active' : 'btn'}
            @click=${() => this._setBoundaryMode('counties')}>Counties</button>
    <button class=${this.boundaryMode === 'ecoregions' ? 'btn active' : 'btn'}
            @click=${() => this._setBoundaryMode('ecoregions')}>Ecoregions</button>
  </div>
  <bee-sidebar ...></bee-sidebar>
`
```

Positioning in `static styles`:
```css
.boundary-toggle {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  z-index: 10;   /* above OL canvas, below OL controls */
  display: flex;
  gap: 2px;
  background: white;
  border-radius: 4px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.3);
  overflow: hidden;
}
```

The `#map` div needs `position: relative` (or the parent `:host` flex container handles positioning — verify OL map target div). Since `:host` uses `display: flex`, the absolute positioning should be relative to the nearest positioned ancestor. Set `position: relative` on `#map` or wrap map+toggle in a positioned container.

### Pattern 7: `_restoreFilterState` extension for region

`_restoreFilterState` currently mutates `filterState` taxon/year/month fields and calls `clusterSource.changed()`. Extend to also handle `boundaryMode` and region Sets, plus activate `regionLayer`:

```typescript
private _restoreFilterState(parsed: ParsedParams) {
  // existing taxon/year/month mutations ...

  // Region filter restore
  filterState.selectedCounties = parsed.selectedCounties;
  filterState.selectedEcoregions = parsed.selectedEcoregions;
  this.boundaryMode = parsed.boundaryMode;
  if (parsed.boundaryMode === 'counties') {
    regionLayer.setSource(countySource);
    regionLayer.setVisible(true);
  } else if (parsed.boundaryMode === 'ecoregions') {
    regionLayer.setSource(ecoregionSource);
    regionLayer.setVisible(true);
  } else {
    regionLayer.setVisible(false);
  }

  clusterSource.changed();
  sampleSource.changed();  // sample layer also needs repaint when region filter active
  this.map?.render();
  // ... rest of filteredSummary recompute ...
}
```

### Anti-Patterns to Avoid

- **Checking polygon layer before specimen/sample layer in singleclick:** OL polygon hit-detection fires for any pixel inside the transparent fill area, which covers the entire county/ecoregion extent. All specimen dots would be swallowed by the polygon click handler. Specimen/sample check MUST be first.
- **Using opaque fill on boundary polygons:** OL only hit-detects rendered pixels. An invisible (alpha=0) fill IS required for interior clicks to register. Removing the fill entirely means only the stroke edge is clickable — not the polygon interior. The existing `boundaryStyle` in `region-layer.ts` already uses `rgba(0,0,0,0)` — do not change this.
- **Not calling `sampleSource.changed()` after filter mutation:** `clusterSource.changed()` repaints specimen clusters. The sample dots (`sampleLayer` uses `sampleSource` directly) also need a changed() call when region filter changes and sample layer is potentially visible. Currently `_applyFilter` only calls `clusterSource.changed()` — need to add `sampleSource.changed()` (check if already called or if sampleLayer repaint is automatic via OL change propagation).
- **Calling `pushState` on moveend when restoring from history:** The `_isRestoringFromHistory` guard already prevents this. When restoring boundary state from popstate, the same guard applies — set before restoring, clear after map finishes moving (same as existing pattern).
- **Encoding counties/ecor params when overlay is off:** When `boundaryMode === 'off'`, all three params (bm, counties, ecor) should be absent from the URL. This keeps URLs clean and ensures "overlay off = clean URL".

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| URL value encoding (spaces → %20) | Manual encode/replace | `URLSearchParams` (already used) | Handles all special chars; `.get()` auto-decodes |
| Polygon interior hit-detection | Canvas pixel sampling | OL `layer.getFeatures(pixel)` with transparent Fill | OL handles projection, pixel tolerance, zoom-level scaling |
| Layer source switching | Two layers with show/hide | `regionLayer.setSource(countySource \| ecoregionSource)` | Single layer; only one source active, memory efficient |

## Common Pitfalls

### Pitfall 1: sampleSource repaint after region filter change
**What goes wrong:** Sample dots don't visually update when a county filter is applied; dots outside the filtered region remain visible.
**Why it happens:** `clusterSource.changed()` only triggers repaint of the specimen cluster layer. `sampleLayer` uses `sampleSource` directly; OL doesn't propagate `changed()` across sources.
**How to avoid:** After every `filterState.selectedCounties` or `filterState.selectedEcoregions` mutation, call `sampleSource.changed()` in addition to `clusterSource.changed()`. Check if `sampleDotStyle` function reads from `filterState` — if `sampleDotStyle` doesn't check region filter, the sample dots won't filter visually at all; the style function may need to check region filter same as `clusterStyle` does for taxon/year.
**Warning signs:** Specimens filter correctly but sample dots ignore the region filter.

**Clarification on sample filtering:** Looking at the current code: `clusterStyle` checks `matchesFilter(f, filterState)` and ghosts non-matching features. `sampleDotStyle` does NOT check `filterState` at all — it only sets recency color. For region filter to affect sample dot visibility, `sampleDotStyle` needs to read `filterState.selectedCounties`/`selectedEcoregions` and ghost or hide non-matching dots. This is a planned behavior (CONTEXT.md: "region filter applies to both layers simultaneously") that requires adding filter-checking logic to `sampleDotStyle`.

### Pitfall 2: Floating toggle z-order vs OL map controls
**What goes wrong:** The floating boundary toggle buttons appear behind OL's built-in controls (zoom buttons, attribution) or behind the map canvas.
**Why it happens:** OL renders its controls as absolute-positioned DOM elements. The toggle also needs to be positioned absolute within the map container.
**How to avoid:** Set `z-index` on `.boundary-toggle` above OL canvas (z-index: 1) but verify against OL control z-index (OL defaults to z-index 1 for its containers). A value of 10 should be safe. Ensure the toggle is a child of the same positioned container as the OL map target div.

### Pitfall 3: `buildSearchParams` signature change ripple
**What goes wrong:** `buildSearchParams` is called in two places in `bee-map.ts`: `_pushUrlState()` and the initial `replaceState` in `firstUpdated()`. Adding `boundaryMode` as a parameter requires both call sites to be updated.
**Why it happens:** TypeScript will catch this at compile time, but it's easy to miss the `firstUpdated()` call when only looking at `_pushUrlState()`.
**How to avoid:** Pass `this.boundaryMode` (or `boundaryMode` local variable in `firstUpdated`) to both call sites. The TypeScript compiler will flag missing arguments.

### Pitfall 4: County name mismatch between GeoJSON and Parquet
**What goes wrong:** Clicking "King" county in the boundary overlay adds "King" to `selectedCounties`, but specimens have `county = "King County"` or vice versa.
**Why it happens:** GeoJSON property is `NAME` (e.g., "Wahkiakum"), and the pipeline-assigned `county` column could be the full name or just the base name depending on the GeoJSON source.
**How to avoid:** The pipeline (Phase 16) uses `build_county_geojson.py` which reads from the same GeoJSON file. The `county` column in `ecdysis.parquet` stores the value of the `NAME` property from `wa_counties.geojson`. These will match exactly. CONFIRMED: ecoregion property `NA_L3NAME` was verified by Phase 17 verifier against the live file.
**Warning signs:** Clicking a county boundary polygon shows "Filter: King" in the sidebar but specimen/sample points don't filter.

### Pitfall 5: `_isRestoringFromHistory` on popstate with boundary changes
**What goes wrong:** Pressing back button after a polygon click restores the previous URL state, but `_onPopState` triggers `_pushUrlState` which overwrites the back navigation.
**Why it happens:** `_onPopState` calls `_restoreFilterState()` which in turn mutates `filterState` — if `clusterSource.changed()` triggers a re-render that calls `_pushUrlState()` synchronously, the guard may not be set.
**How to avoid:** The existing `_isRestoringFromHistory` guard handles this. Ensure `_restoreFilterState` does NOT call `_pushUrlState()` — it should only mutate state and trigger map repaint, not push URL. Follow the existing pattern exactly.

## Code Examples

### Setting boundary mode with filter clearing

```typescript
// Source: bee-map.ts pattern — mirrors _onLayerChanged
private _setBoundaryMode(mode: 'off' | 'counties' | 'ecoregions') {
  if (mode === this.boundaryMode) return;  // no-op
  this.boundaryMode = mode;
  if (mode === 'off') {
    regionLayer.setVisible(false);
    filterState.selectedCounties = new Set();
    filterState.selectedEcoregions = new Set();
  } else {
    regionLayer.setSource(mode === 'counties' ? countySource : ecoregionSource);
    regionLayer.setVisible(true);
  }
  clusterSource.changed();
  sampleSource.changed();
  this.map?.render();
  if (!this._isRestoringFromHistory && this.map) this._pushUrlState();
}
```

### Polygon click handler

```typescript
private _onPolygonClick(feature: Feature) {
  const isCounty = this.boundaryMode === 'counties';
  const name = isCounty
    ? (feature.get('NAME') as string)
    : (feature.get('NA_L3NAME') as string);
  const targetSet = isCounty ? filterState.selectedCounties : filterState.selectedEcoregions;
  const newSet = new Set(targetSet);
  if (newSet.has(name)) {
    newSet.delete(name);  // toggle deselect
  } else {
    newSet.add(name);
  }
  if (isCounty) {
    filterState.selectedCounties = newSet;
  } else {
    filterState.selectedEcoregions = newSet;
  }
  clusterSource.changed();
  sampleSource.changed();
  this.map?.render();
  // pushState per decision (creates history entry for back button)
  const view = this.map!.getView();
  const center = toLonLat(view.getCenter()!);
  const zoom = view.getZoom()!;
  const params = buildSearchParams(center, zoom, filterState, this._selectedOccIds, this.layerMode, this.boundaryMode);
  window.history.pushState({}, '', '?' + params.toString());
  // Update sidebar display
  this._regionFilterText = this._buildRegionFilterText();
}
```

### Clearing region filter (outside click)

```typescript
private _clearRegionFilter() {
  filterState.selectedCounties = new Set();
  filterState.selectedEcoregions = new Set();
  clusterSource.changed();
  sampleSource.changed();
  this.map?.render();
  this._regionFilterText = null;
  if (!this._isRestoringFromHistory && this.map) this._pushUrlState();
}
```

### Sample dot style needs region filter check

```typescript
// Current sampleDotStyle only sets color by recency tier — no filter check.
// Phase 18 needs to ghost samples outside the active region filter:
export function sampleDotStyle(feature: FeatureLike): Style {
  // ... existing recency logic ...
  const isGhosted = isFilterActive(filterState) && !matchesFilter(feature as Feature, filterState);
  if (isGhosted) {
    // Return a ghosted style (low opacity / grey)
    return ghostedSampleStyle;
  }
  // ... existing color-by-tier return ...
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual percent-encoding | `URLSearchParams` auto-encoding | Already used in project | No action needed |
| Single `@state()` for all filter | Multiple `@state()` fields mirrored from filterState singleton | Established in bee-map.ts | `boundaryMode` follows the same mirror pattern |

## Open Questions

1. **Does `sampleSource.changed()` exist or is a different method needed to repaint sampleLayer?**
   - What we know: `clusterSource.changed()` triggers specimen layer repaint. `sampleSource` is a `SampleParquetSource` extending OL `VectorSource`. OL `VectorSource` inherits `.changed()` from `Observable`.
   - What's unclear: Whether `sampleLayer` repaint is triggered by `sampleSource.changed()` or requires `sampleLayer.changed()` or `this.map?.render()`.
   - Recommendation: Call both `sampleSource.changed()` and `this.map?.render()` to be safe. The existing code already calls `this.map?.render()` after `clusterSource.changed()`.

2. **Does the `sampleDotStyle` function need to call `matchesFilter` for region filtering to work on the sample layer?**
   - What we know: `clusterStyle` reads `filterState` directly (closed over). `sampleDotStyle` currently does NOT read `filterState` — it returns a color-by-recency style unconditionally.
   - What's unclear: Whether the sample layer should ghost (semi-transparent) or hide (zero-radius/opacity-zero) filtered-out dots.
   - Recommendation: Ghost filtered-out sample dots (same visual language as specimen clusters) by checking `matchesFilter` in `sampleDotStyle`. This is a required addition for FILTER-05 semantics to apply to the sample layer.

3. **Absolute positioning of floating toggle when `bee-map.ts` uses `display: flex` on `:host`**
   - What we know: `:host` on `bee-map.ts` is `display: flex; flex-direction: row`. The `#map` div is `flex-grow: 1`. The boundary toggle needs to be absolutely positioned over the map area.
   - Recommendation: Wrap the `#map` div and the toggle in a `<div class="map-container">` with `position: relative; flex: 1`. The toggle is then `position: absolute; top: 0.5rem; right: 0.5rem` within that container.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual browser testing (no automated test framework in frontend) |
| Config file | none |
| Quick run command | `cd /Users/rainhead/dev/beeatlas/frontend && npm run dev` |
| Full suite command | `cd /Users/rainhead/dev/beeatlas/frontend && npm run build` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MAP-09 | Boundary toggle cycles off/counties/ecoregions independently of layer mode | manual | `npm run build` (TypeScript compile) | N/A |
| MAP-10 | Polygon click adds region to filter; specimen/sample clicks take priority | manual | `npm run build` (TypeScript compile) | N/A |
| FILTER-05 | URL encodes bm=, counties=, ecor=; pasting URL restores state | manual | `npm run build` (TypeScript compile) | N/A |

### Sampling Rate
- **Per task commit:** `cd /Users/rainhead/dev/beeatlas/frontend && npm run build` — TypeScript compile gate
- **Per wave merge:** `cd /Users/rainhead/dev/beeatlas/frontend && npm run build`
- **Phase gate:** Manual browser smoke test before `/gsd:verify-work`

### Wave 0 Gaps
None — `npm run build` is the CI gate for TypeScript correctness. No automated test infrastructure exists or is needed for this frontend-only phase.

## Sources

### Primary (HIGH confidence)
- Direct code reading: `frontend/src/bee-map.ts` — all URL, singleclick, and @state patterns
- Direct code reading: `frontend/src/region-layer.ts` — exported layer, sources, feature property keys
- Direct code reading: `frontend/src/filter.ts` — FilterState interface and matchesFilter implementation
- Direct code reading: `frontend/src/style.ts` — clusterStyle filter-check pattern for sample ghosting guidance
- `.planning/phases/18-map-integration/18-CONTEXT.md` — all locked decisions
- `.planning/STATE.md` — click priority decision and polygon fill decision

### Secondary (MEDIUM confidence)
- Phase 17 RESEARCH.md — OL VectorLayer source-switching pattern (`layer.setSource()`)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and in use; no new dependencies
- Architecture: HIGH — all integration points confirmed from direct code reading; patterns are established in the codebase
- Pitfalls: HIGH for items derived from code reading; MEDIUM for z-index/positioning (implementation-time verification recommended)

**Research date:** 2026-03-14
**Valid until:** Stable — no third-party API changes; all dependencies are pinned
