# Phase 14: Layer Toggle and Map Display - Research

**Researched:** 2026-03-12
**Domain:** OpenLayers layer visibility, Lit Web Components event-driven pattern, URL param sync
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Toggle UI placement and structure:**
- Toggle lives inside `bee-sidebar` at the very top of the panel, above summary stats and filter controls
- Two adjacent buttons: `[ Specimens ] [ Samples ]` — active mode highlighted, inactive muted
- `bee-sidebar` receives `layerMode` as a property from `bee-map`, renders the toggle, emits a `layer-changed` event back up
- Follows the existing event-driven pattern (`filter-changed`, `close`) — no new architectural patterns needed

**Filter controls treatment in sample mode:**
- Specimen taxon/date filter controls (autocomplete, year range, month picker) are **hidden entirely** when sample mode is active
- When switching back to specimen mode, previously active filters are **restored** — filter state is preserved across the toggle (not cleared)
- `bee-sidebar` handles the hide/show via conditional rendering based on `layerMode` prop

**Sample mode default sidebar state:**
- When sample mode is active but no dot has been clicked, the sidebar shows collection events from the **last 2–3 weeks** sorted by date descending
- Each entry shows the same fields as a clicked-dot detail (observer, date, specimen count) — same format, not a special compact layout
- Each entry is **clickable**: clicking an event pans and zooms the map to that sample dot and shows its full detail
- This gives users an immediate sense of recent activity when they first enter sample mode

**Layer mode and URL:**
- `lm=` URL parameter encodes active layer mode (`specimens` | `samples`)
- Switching layers clears the sidebar (no stale specimen or sample detail remains visible)
- `o=` param (selected occurrence IDs) is cleared when switching layers, since IDs are layer-specific

### Claude's Discretion
- Exact highlight/active style for the toggle buttons (color, border, weight — should be consistent with existing sidebar aesthetic)
- Exact date window for "last 2–3 weeks" (2 weeks is a clean default)
- How `layerMode` state is held in `bee-map` (`@state` property is the natural choice given existing patterns)
- Whether `SampleParquetSource` is initialized at module level (like `specimenSource`) or lazily in `firstUpdated()`
- Transition animation (none is fine — instant toggle)

### Deferred Ideas (OUT OF SCOPE)
- URL encoding of selected sample marker (`inat=` param) — explicitly deferred as MAP-06 in REQUIREMENTS.md
- Sample dot size-encoded by specimen count — MAP-08, deferred
- Combined specimens + samples view — MAP-07, deferred
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MAP-03 | User can see iNat collection events rendered as simple dot markers on the map as a distinct layer | Wire `SampleParquetSource` + `sampleDotStyle` (both from Phase 13) as a `VectorLayer` added to the OL map in `firstUpdated()` |
| MAP-04 | User can toggle between specimen clusters and sample dots (exclusive; sidebar clears on switch) | `layer.setVisible(bool)` on both `specimenLayer` and `sampleLayer`; `layerMode` @state in `bee-map`; `layer-changed` event from `bee-sidebar`; `lm=` URL param |
</phase_requirements>

---

## Summary

Phase 14 wires `SampleParquetSource` and `sampleDotStyle` (created in Phase 13 and already present in the codebase) to an OpenLayers `VectorLayer` and adds an exclusive toggle between specimen clusters and sample dots. The implementation touches three files: `bee-map.ts` (layer wiring, state, URL params, click handler), `bee-sidebar.ts` (toggle UI, conditional filter rendering, default sample list, `layer-changed` event), and the import line for `samples.parquet`.

The critical mechanism is OpenLayers `layer.setVisible(bool)` — this is the exclusive toggle. `specimenLayer.setVisible(layerMode === 'specimens')` and `sampleLayer.setVisible(layerMode === 'samples')` is all it takes to switch layers; no features need to be added or removed. The `layerMode` value is held as a Lit `@state` in `BeeMap`, flows down to `bee-sidebar` as a `@property`, and round-trips via `layer-changed` CustomEvent back up — the same pattern already used by `filter-changed` and `close`.

The sample mode default view (recent events list) requires filtering `sampleSource.getFeatures()` to those within the last 14 days once the source's `change` event fires. This list renders as clickable entries that pan/zoom the map to the feature's coordinates and show its detail in the sidebar — reusing the `singleclick` display pipeline, called programmatically rather than by mouse event.

**Primary recommendation:** Follow the established layer/event patterns exactly. `setVisible()` is the exclusive toggle mechanism. The `layer-changed` / `@layer-changed` event pair mirrors `filter-changed` / `@filter-changed` exactly — copy that pattern, don't invent a new one.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| OpenLayers (ol) | ^10.7.0 | `VectorLayer`, `layer.setVisible()`, `getFeatures()`, `singleclick` routing | Already the map framework; `setVisible` is the established exclusive-layer pattern |
| Lit | ^3.x | `@state`, `@property`, CustomEvent, conditional rendering | Already the component framework for `bee-map` and `bee-sidebar` |
| hyparquet + `SampleParquetSource` | ^1.23.3 | Sample features already loaded by Phase 13 | Phase 13 delivers the source; this phase only instantiates and wires it |

### No New Dependencies
Phase 14 introduces zero new npm dependencies. All tools are already installed and in active use.

**Installation:** none required.

---

## Architecture Patterns

### Recommended Change Structure
```
frontend/src/
├── bee-map.ts     — add sampleSource, sampleLayer, layerMode @state,
│                    lm= URL param, singleclick routing, layer-changed handler,
│                    recent-events default view population
├── bee-sidebar.ts — add layerMode @property, toggle UI at top, conditional
│                    filter rendering, layer-changed event dispatch,
│                    clickable recent-events list, inat click → pan/zoom
└── parquet.ts     — no changes (SampleParquetSource already done in Phase 13)
└── style.ts       — no changes (sampleDotStyle already done in Phase 13)
```

### Pattern 1: Module-Level Layer Initialization
**What:** Sources and layers created at module scope, added to map in `firstUpdated()`.
**When to use:** Always — this is the existing convention for `specimenSource`, `clusterSource`, `specimenLayer`.
**Example (from `bee-map.ts` lines 157–166):**
```typescript
// Source: existing bee-map.ts
const specimenSource = new ParquetSource({url: ecdysisDump});
const clusterSource = new Cluster({ distance: 40, minDistance: 0, source: specimenSource });
const specimenLayer = new VectorLayer({ source: clusterSource, style: clusterStyle });

// Phase 14 adds — same level, same pattern:
const sampleSource = new SampleParquetSource({url: samplesDump});
const sampleLayer = new VectorLayer({ source: sampleSource, style: sampleDotStyle });
```

Then in `firstUpdated()`:
```typescript
// Existing layers array — add sampleLayer:
layers: [ tileLayer1, tileLayer2, baseLayer, specimenLayer, sampleLayer ]
// Initialize hidden (specimens is default mode):
sampleLayer.setVisible(false);
```

### Pattern 2: Exclusive Toggle via setVisible
**What:** Both layers exist simultaneously; only one is visible at a time.
**When to use:** Any layer mode switch.
**Example:**
```typescript
// In bee-map.ts — handle layer-changed event
private _onLayerChanged(mode: 'specimens' | 'samples') {
  this.layerMode = mode;
  specimenLayer.setVisible(mode === 'specimens');
  sampleLayer.setVisible(mode === 'samples');
  this.selectedSamples = null;         // clear sidebar
  this._selectedOccIds = null;
  this._pushUrlState();                // sync lm= param
}
```

### Pattern 3: CustomEvent Up / Property Down (existing pattern)
**What:** Parent (`bee-map`) passes state down via Lit property binding; child (`bee-sidebar`) emits CustomEvent to signal user action.
**When to use:** All parent-child communication — already used for `filter-changed`, `close`.
**Example — bee-sidebar emits:**
```typescript
// Source: existing bee-sidebar.ts _dispatchFilterChanged pattern
private _onToggleLayer(mode: 'specimens' | 'samples') {
  this.dispatchEvent(new CustomEvent<'specimens' | 'samples'>('layer-changed', {
    bubbles: true,
    composed: true,
    detail: mode,
  }));
}
```
**In bee-map.ts render():**
```typescript
<bee-sidebar
  .layerMode=${this.layerMode}
  @layer-changed=${(e: CustomEvent<'specimens' | 'samples'>) => this._onLayerChanged(e.detail)}
  ...
></bee-sidebar>
```

### Pattern 4: URL Param Sync (existing pattern extended)
**What:** `buildSearchParams()` and `parseUrlParams()` already handle replaceState/pushState.
**When to use:** Any new URL-persisted state.
**Changes needed:**
```typescript
// buildSearchParams() — add lm= param
if (layerMode !== 'specimens') params.set('lm', layerMode);  // omit default value

// parseUrlParams() — add lm= parsing
const lmRaw = p.get('lm') ?? '';
const layerMode: 'specimens' | 'samples' = lmRaw === 'samples' ? 'samples' : 'specimens';

// ParsedParams interface — add field:
interface ParsedParams { ..., layerMode: 'specimens' | 'samples'; }
```

### Pattern 5: Recent Sample Events Default View
**What:** When sample mode is active and no dot is clicked, show events from the last 14 days.
**When to use:** Entering sample mode for the first time, or after clearing selection.
**Example:**
```typescript
// In bee-map.ts — compute recent events for sidebar default view
private _buildRecentSampleEvents(): SampleEvent[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  return sampleSource.getFeatures()
    .filter(f => new Date(f.get('date') as string) >= cutoff)
    .sort((a, b) => new Date(b.get('date') as string).valueOf() - new Date(a.get('date') as string).valueOf())
    .map(f => ({
      observation_id: f.get('observation_id') as number,
      observer: f.get('observer') as string,
      date: f.get('date') as string,
      specimen_count: f.get('specimen_count') as number,
      // coordinates for pan/zoom on click:
      coordinate: (f.getGeometry() as Point).getCoordinates(),
    }));
}
```

### Anti-Patterns to Avoid

- **Removing and re-adding features on toggle:** `layer.setVisible()` is sufficient — never call `sampleSource.clear()` or rebuild features on every toggle. That causes unnecessary network/parse work.
- **Sharing filter state with sample mode:** `filterState` applies only to specimen features. Do not pass `filterState` to `sampleLayer` or `sampleSource`. Sample features have no taxon/year/month properties.
- **Routing singleclick hits through both layers when in exclusive mode:** The `singleclick` handler must be gated by `layerMode`. In specimen mode: `specimenLayer.getFeatures(pixel)`. In sample mode: `sampleLayer.getFeatures(pixel)`. Never hit-test both.
- **Not clearing `o=` param on layer switch:** The `o=` occurrence ID param is layer-specific (specimen IDs start with `ecdysis:`, sample IDs with `inat:`). Switching layers MUST clear it.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Exclusive layer toggle | Custom feature add/remove logic | `layer.setVisible(bool)` | OL handles all rendering; setVisible is O(1), not O(n features) |
| Sample feature loading | Re-implement parquet loading | `SampleParquetSource` from Phase 13 | Already complete; just instantiate |
| Hit-testing map clicks | Manual pixel-to-coordinate math | `layer.getFeatures(event.pixel)` | OL async hit-test already used for `specimenLayer`; same call for `sampleLayer` |
| Recent events date math | Date library | `new Date()` native — same as `sampleDotStyle` | Already established in style.ts for sample dates; consistent |

---

## Common Pitfalls

### Pitfall 1: singleclick handler not gated by layerMode
**What goes wrong:** With both layers in the hit-test, clicking a sample dot in specimen mode (or a specimen cluster in sample mode) fires, returns wrong feature type, and either crashes or shows incorrect sidebar content.
**Why it happens:** The existing `singleclick` handler only tests `specimenLayer`. If naively extended to always test both, it hits whichever layer has features at pixel regardless of visible mode.
**How to avoid:** Branch on `this.layerMode` inside the `singleclick` handler. Test only the active layer's features.
**Warning signs:** Clicking in sample mode selects specimen data, or `f.get('observer')` returns undefined (specimen feature has no `observer` property).

### Pitfall 2: Filter state persists visually after entering sample mode
**What goes wrong:** User has an active taxon filter on specimens. They switch to samples. The filter controls disappear (hidden), but `filterState` still gates `clusterStyle`. When they switch back, filters are restored — this is correct. The pitfall is rendering the UI as if no filter is active when sample mode is first entered, but the filter IS still active on the hidden layer.
**Why it happens:** `filterState` is a shared singleton mutated by both `bee-map` and `bee-sidebar`.
**How to avoid:** Do NOT clear `filterState` on layer switch. Only hide filter UI conditionally. The existing filter state must survive the toggle round-trip. This is already specified in CONTEXT.md — the pitfall is accidentally clearing it.
**Warning signs:** After switching to specimen mode, previously active filters are gone (both in UI and in data).

### Pitfall 3: sampleLayer added after specimenLayer but z-order unexpected
**What goes wrong:** Sample dots render behind specimen clusters (or vice versa) when both are briefly visible (e.g., during toggle).
**Why it happens:** OL renders layers in array order — later in array = higher z-index.
**How to avoid:** Add `sampleLayer` after `specimenLayer` in the `layers` array. Since only one layer is visible at a time, this is cosmetic, but the ordering should be intentional.
**Warning signs:** When briefly both visible (e.g., in testing), one layer occludes the other unexpectedly.

### Pitfall 4: `lm=` param not parsed on popstate
**What goes wrong:** User switches to sample mode, navigates away, presses Back. The map view restores to specimen mode instead of sample mode.
**Why it happens:** `_onPopState` calls `parseUrlParams()` but if `layerMode` is not parsed and applied there, it is ignored.
**How to avoid:** `parseUrlParams()` must return `layerMode`; `_onPopState` must call `_onLayerChanged(parsed.layerMode)` (or equivalent) in addition to restoring view and filter state.
**Warning signs:** Browser Back navigation does not restore sample mode layer.

### Pitfall 5: Recent events list tries to render before sampleSource loads
**What goes wrong:** `sampleSource.getFeatures()` returns empty array; recent events list shows nothing even when data exists.
**Why it happens:** `SampleParquetSource` loads asynchronously — same as `specimenSource`. Features are not available until the `change` event fires.
**How to avoid:** Populate the recent events list inside `sampleSource.once('change', ...)` callback, mirroring the `specimenSource.once('change', ...)` pattern in `firstUpdated()`. If the user switches to sample mode before data loads, show a "Loading..." hint (same pattern as `summary === null` in `_renderSummary()`).
**Warning signs:** Recent events sidebar shows empty list immediately on switching to sample mode.

### Pitfall 6: Clicking a recent event row calls map.pan/zoom before map is ready
**What goes wrong:** User clicks a recent event row in the sidebar before the OL map is fully initialized.
**Why it happens:** `this.map` is set in `firstUpdated()` but theoretically could be clicked before that; more realistically, this is a non-issue since data requires map.
**How to avoid:** Guard pan/zoom with `if (this.map)` — same pattern already used in `_pushUrlState()` and the `moveend` handler.

---

## Code Examples

Verified patterns from existing source files:

### Layer initialization (bee-map.ts)
```typescript
// Source: existing bee-map.ts lines 157-166
// Phase 14 additions follow same module-level pattern:
import samplesDump from './assets/samples.parquet?url';
import { SampleParquetSource } from './parquet.ts';
import { sampleDotStyle } from './style.ts';

const sampleSource = new SampleParquetSource({url: samplesDump});
const sampleLayer = new VectorLayer({ source: sampleSource, style: sampleDotStyle });
```

### Adding layer to map and setting initial visibility (bee-map.ts firstUpdated)
```typescript
// Source: existing firstUpdated pattern — layers array
layers: [
  tileLayer1, tileLayer2, baseLayer,
  specimenLayer,
  sampleLayer,   // add after specimenLayer — higher z-index
]
// After map construction:
sampleLayer.setVisible(false);  // specimens mode is default
```

### layerMode @state in BeeMap
```typescript
@state()
private layerMode: 'specimens' | 'samples' = 'specimens';
```

### layer-changed event handler in bee-map.ts
```typescript
private _onLayerChanged(mode: 'specimens' | 'samples') {
  this.layerMode = mode;
  specimenLayer.setVisible(mode === 'specimens');
  sampleLayer.setVisible(mode === 'samples');
  this.selectedSamples = null;
  this._selectedOccIds = null;
  if (this.map) this._pushUrlState();
}
```

### Toggle buttons in bee-sidebar.ts
```typescript
// Source: follows existing sidebar CSS class patterns (existing button styles)
@property({ attribute: false }) layerMode: 'specimens' | 'samples' = 'specimens';

private _renderToggle() {
  return html`
    <div class="layer-toggle">
      <button
        class=${this.layerMode === 'specimens' ? 'toggle-btn active' : 'toggle-btn'}
        @click=${() => this._onToggleLayer('specimens')}
      >Specimens</button>
      <button
        class=${this.layerMode === 'samples' ? 'toggle-btn active' : 'toggle-btn'}
        @click=${() => this._onToggleLayer('samples')}
      >Samples</button>
    </div>
  `;
}

private _onToggleLayer(mode: 'specimens' | 'samples') {
  if (mode === this.layerMode) return;   // no-op if already active
  this.dispatchEvent(new CustomEvent<'specimens' | 'samples'>('layer-changed', {
    bubbles: true,
    composed: true,
    detail: mode,
  }));
}
```

### Conditional filter controls in bee-sidebar.ts render()
```typescript
// Source: follows existing conditional rendering pattern
render() {
  return html`
    ${this._renderToggle()}
    ${this.layerMode === 'specimens' ? this._renderFilterControls() : ''}
    ${this.samples !== null
      ? this._renderDetail(this.samples)
      : this.layerMode === 'samples'
        ? this._renderRecentSampleEvents()
        : this._renderSummary()}
  `;
}
```

### singleclick handler routing by layerMode (bee-map.ts)
```typescript
this.map.on('singleclick', async (event: MapBrowserEvent) => {
  if (this.layerMode === 'specimens') {
    const hits = await specimenLayer.getFeatures(event.pixel);
    if (!hits.length) { this.selectedSamples = null; this._selectedOccIds = null; return; }
    const inner: Feature[] = (hits[0].get('features') as Feature[]) ?? [hits[0] as unknown as Feature];
    const toShow = isFilterActive(filterState) ? inner.filter(f => matchesFilter(f, filterState)) : inner;
    if (toShow.length === 0) return;
    this.selectedSamples = buildSamples(toShow);
    this._selectedOccIds = toShow.map(f => f.getId() as string);
  } else {
    // sample mode
    const hits = await sampleLayer.getFeatures(event.pixel);
    if (!hits.length) { this.selectedSamples = null; return; }
    // show clicked sample dot detail — Phase 15 handles full detail; Phase 14 shows basic info
    const f = hits[0] as Feature;
    this._showSampleDetail(f);
  }
  this._pushUrlState();
});
```

### buildSearchParams extended with lm= (bee-map.ts)
```typescript
function buildSearchParams(
  center: number[],
  zoom: number,
  fs: typeof filterState,
  selectedOccIds: string[] | null,
  layerMode: 'specimens' | 'samples'  // new param
): URLSearchParams {
  const params = new URLSearchParams();
  // ... existing params ...
  if (layerMode !== 'specimens') params.set('lm', layerMode);  // omit default
  return params;
}
```

### parseUrlParams extended with lm= (bee-map.ts)
```typescript
interface ParsedParams {
  // ... existing fields ...
  layerMode: 'specimens' | 'samples';
}

function parseUrlParams(search: string): ParsedParams {
  // ... existing parsing ...
  const lmRaw = p.get('lm') ?? '';
  const layerMode: 'specimens' | 'samples' = lmRaw === 'samples' ? 'samples' : 'specimens';
  return { ..., layerMode };
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| N/A | `layer.setVisible(bool)` for exclusive toggle | Phase 14 | No migration; pure addition |
| No layer toggle | Two-button toggle UI in sidebar | Phase 14 | Adds `layerMode` @state flow |

**No deprecated patterns.** All OpenLayers and Lit APIs in use are current for OL ^10.7.0 and Lit ^3.x.

---

## Open Questions

1. **What to show in sample mode when sampleSource not yet loaded**
   - What we know: `SampleParquetSource` loads async; there is a window between "user switches to sample mode" and "features available"
   - What's unclear: Whether this window is perceptible (samples.parquet is small; likely fast)
   - Recommendation: Show the same "Loading data..." hint that `_renderSummary()` shows when `summary === null`. Use a `@state() private sampleDataLoaded = false` flag set in `sampleSource.once('change', ...)`.

2. **Type for recent-events sidebar entries**
   - What we know: The sidebar currently uses `Sample` type (specimen concept). Recent sample events have different fields (`observer`, `date`, `specimen_count`, not `recordedBy`/`fieldNumber`/`species[]`).
   - What's unclear: Whether to reuse `Sample` interface or add a `SampleEvent` interface exported from `bee-sidebar.ts`
   - Recommendation: Add a `SampleEvent` interface to `bee-sidebar.ts`. It's a different data shape and should not share a type with `Sample`. Phase 15 may extend it.

3. **Pan/zoom behavior on recent event click**
   - What we know: CONTEXT.md says "clicking an event pans and zooms the map to that sample dot"
   - What's unclear: Target zoom level — should it match the current zoom, go to a fixed close zoom (e.g. 12), or animate?
   - Recommendation: Animate to zoom 12 (close enough to see individual dots) using `view.animate({ center: coordinate, zoom: 12, duration: 300 })` — OL's built-in animation. If the dot is already in view at a close zoom, do nothing special.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None — no jest/vitest configured for frontend TypeScript |
| Config file | none |
| Quick run command | `cd /Users/rainhead/dev/beeatlas/frontend && npm run build` |
| Full suite command | `cd /Users/rainhead/dev/beeatlas/frontend && npm run build` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MAP-03 | Sample dot markers appear on map when sample mode is active | smoke (browser) | `cd frontend && npm run build` (compile check) | ❌ manual verify |
| MAP-04 | Toggle switches layers (exclusive); sidebar clears on switch | smoke (browser) | `cd frontend && npm run build` (compile check) | ❌ manual verify |
| MAP-04 | `lm=` URL param encodes active layer; pasting URL restores it | smoke (browser) | `cd frontend && npm run build` (compile check) | ❌ manual verify |
| MAP-04 | Specimen filter controls hidden in sample mode | compile | `cd frontend && npm run build` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd /Users/rainhead/dev/beeatlas/frontend && npm run build`
- **Per wave merge:** `cd /Users/rainhead/dev/beeatlas/frontend && npm run build`
- **Phase gate:** Build green + browser verification of all 5 success criteria before `/gsd:verify-work`

### Wave 0 Gaps
None — existing TypeScript compilation covers all automated checks. No test files needed.

*(Frontend has no vitest/jest setup. Compile-time TypeScript correctness is the automated gate; runtime behavior requires browser verification.)*

---

## Sources

### Primary (HIGH confidence)
- Direct file inspection: `frontend/src/bee-map.ts` — existing `@state`, event handlers, `singleclick`, `buildSearchParams`, `parseUrlParams`, module-level layer instantiation patterns
- Direct file inspection: `frontend/src/bee-sidebar.ts` — existing `@property`, `filter-changed` CustomEvent pattern, conditional rendering structure, CSS class conventions
- Direct file inspection: `frontend/src/parquet.ts` — `SampleParquetSource` confirmed complete (Phase 13 delivered)
- Direct file inspection: `frontend/src/style.ts` — `sampleDotStyle` confirmed complete (Phase 13 delivered)
- Direct file inspection: `frontend/src/filter.ts` — `filterState` singleton pattern
- Phase 13 RESEARCH.md — samples.parquet schema, hyparquet BigInt coercion, date parsing patterns

### Secondary (MEDIUM confidence)
- OpenLayers documentation: `layer.setVisible()` is the standard exclusive-layer toggle mechanism — consistent with OL ^10.x API

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use; no new dependencies
- Architecture: HIGH — patterns read directly from existing source; Phase 13 artifacts confirmed present
- Pitfalls: HIGH — derived from direct code inspection; layerMode/singleclick routing risk is clear from existing handler structure
- Validation: HIGH — no test runner confirmed; build-as-gate established in Phase 13

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable internal codebase, no external library changes needed)
