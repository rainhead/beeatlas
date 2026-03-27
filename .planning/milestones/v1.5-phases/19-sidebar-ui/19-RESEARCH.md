# Phase 19: Sidebar UI - Research

**Researched:** 2026-03-18
**Domain:** Lit web components — multi-select autocomplete, chip UI, boundary toggle integration
**Confidence:** HIGH

## Summary

Phase 19 replaces the Phase 18 floating map boundary toggle with a sidebar boundary toggle button group, and adds county and ecoregion multi-select autocomplete controls with removable chips to the sidebar. The phase is entirely frontend — all data structures and filter semantics are already implemented in `filter.ts`, and all boundary toggle logic is already implemented in `bee-map.ts` via `_setBoundaryMode()`. The work is primarily adding new UI to `bee-sidebar.ts` and wiring event plumbing between sidebar and map.

The existing project uses Lit 3, no external component libraries (no Material, no Shoelace), and no test framework. The autocomplete pattern is already established: a native `<input type="text" list="...">` backed by a `<datalist>` with options supplied as a `@property`. This is identical to the existing taxon autocomplete and is the correct approach given only 39 counties and 11 ecoregions. No third-party autocomplete library is needed.

The sidebar's `regionFilterText` prop (Phase 18 stub, currently rendered as a `<p class="region-filter-text">`) is the insertion point for the new chip UI. The existing Specimens/Samples `.layer-toggle` / `.toggle-btn` CSS is the exact visual reference for the new Off/Counties/Ecoregions boundary toggle in the sidebar. The `_clearFilters()` method needs to also reset region state and boundary mode.

**Primary recommendation:** Use native datalist for autocomplete, inline chip rendering in Lit templates using existing CSS conventions, and extend the existing `filter-changed` custom event or add a parallel `region-changed` event to push region mutations from sidebar back to `bee-map.ts`.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- The Phase 18 floating `Off / Counties / Ecoregions` button group on the map **is removed** in this phase. The sidebar becomes the only place to control boundary mode.
- The boundary toggle lives **at the top of the sidebar, above the filter controls** — boundary mode is a map display setting, visually distinct from the data filters.
- Style: **same three-button group as the existing Specimens / Samples toggle** — three always-visible buttons (Off, Counties, Ecoregions), one active at a time, same active/hover styles.
- `_clearFilters()` in `bee-sidebar.ts` must also reset county and ecoregion selections (FILTER-06 requirement).
- After clearing, boundary mode should be reset to Off (consistent with Phase 18 decision: filter inactive = overlay off).

### Claude's Discretion

- Region controls layout (where county and ecoregion autocomplete + chips appear relative to existing taxon/date controls).
- Whether region controls are visible in sample mode (region filter applies to both layers, so showing them in sample mode is appropriate — Claude decides the exact layout).
- Autocomplete input model: native datalist vs. custom dropdown for county/ecoregion (there are ~39 WA counties and ~8–10 ecoregions — a datalist may be sufficient).
- Chips presentation: interleaved vs. grouped by type; exact chip style.
- Type label disambiguation: FILTER-04 requires chips to show "county" / "ecoregion" label when both are active; Claude decides the visual treatment.

### Deferred Ideas (OUT OF SCOPE)

- None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FILTER-03 | Multi-select county autocomplete with removable chips; OR semantics; ANDs with other filters | Datalist pattern from existing taxon autocomplete; filterState.selectedCounties already handles OR-within semantics |
| FILTER-04 | Multi-select ecoregion autocomplete with removable chips; chips show "county"/"ecoregion" type label when both active | Same datalist pattern; type label is a conditional CSS badge on the chip |
| FILTER-06 | "Clear filters" resets county and ecoregion selections in addition to taxon/date; map position unchanged | `_clearFilters()` extension; must also reset boundaryMode and dispatch event to map |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Lit | 3.2.1 | Web component base | Already the entire frontend framework |
| TypeScript | 5.8.2 | Type safety | Project-wide; noUnusedLocals:true enforced |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Native `<datalist>` | HTML5 (no library) | Autocomplete suggestions | Already used for taxon filter; sufficient for ≤39 items |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native datalist | Custom dropdown (Shoelace, Floating UI) | Datalist is adequate for 39 counties, 11 ecoregions; no new dependencies |
| Native datalist | `<select multiple>` | select-multiple is harder to style as chips and doesn't follow project's input pattern |

**No installation needed** — all required libraries are already in package.json.

---

## Architecture Patterns

### Recommended Project Structure

No new files needed. Changes are confined to:
```
frontend/src/
├── bee-sidebar.ts    # Primary change: boundary toggle, region autocomplete, chips, _clearFilters extension
├── bee-map.ts        # Remove floating boundary-toggle; add boundaryMode prop + region-changed event handler
└── filter.ts         # No changes — filterState.selectedCounties/Ecoregions already exist
```

### Pattern 1: Extending the Existing Filter-Changed Event vs. a New Region-Changed Event

**What:** When the sidebar adds/removes a region chip or clears regions, it must notify `bee-map.ts` to mutate `filterState` and repaint.

**Two options:**

**Option A — Extend `FilterChangedEvent`:**
Add `selectedCounties: Set<string>` and `selectedEcoregions: Set<string>` to the existing `FilterChangedEvent` interface. `_applyFilter()` in `bee-map.ts` mutates both taxon/date AND region sets. `_clearFilters()` emits a single event with all-null/empty fields.

**Option B — New `region-changed` CustomEvent:**
Sidebar emits a second event carrying `{ selectedCounties, selectedEcoregions, boundaryMode }`. `bee-map.ts` adds a second listener. Cleaner separation but more moving parts.

**Recommendation (Claude's Discretion):** Option A — extend `FilterChangedEvent`. It keeps a single dispatch path for all filter mutations, matches how `_clearFilters()` currently works (one dispatch), and avoids a second event listener in the map. The planner should choose one approach and use it consistently across all three region UI tasks (add chip, remove chip, clear all).

**Example (Option A extension):**
```typescript
// bee-sidebar.ts — extended interface
export interface FilterChangedEvent {
  taxonName: string | null;
  taxonRank: 'family' | 'genus' | 'species' | null;
  yearFrom: number | null;
  yearTo: number | null;
  months: Set<number>;
  selectedCounties: Set<string>;      // NEW
  selectedEcoregions: Set<string>;    // NEW
  boundaryMode: 'off' | 'counties' | 'ecoregions';  // NEW — sidebar owns this
}
```

### Pattern 2: Boundary Toggle as @property on bee-sidebar

**What:** `boundaryMode` must be known inside `bee-sidebar` to render the active toggle button and drive sidebar chips. Since `bee-map.ts` owns the ground truth for `boundaryMode` (URL restoration, `_setBoundaryMode()` side effects), the cleanest flow is:

- `bee-map.ts` passes `boundaryMode` down as `@property({ attribute: false }) boundaryMode` on `bee-sidebar`
- `bee-sidebar` renders the toggle and dispatches `boundary-changed` OR includes `boundaryMode` in the extended `FilterChangedEvent`
- `bee-map.ts` calls `_setBoundaryMode()` on receipt

**Example flow for toggle click in sidebar:**
```
User clicks "Counties" in sidebar boundary toggle
→ bee-sidebar: _onBoundaryToggle('counties')
→ bee-sidebar: dispatches filter-changed with { ..., boundaryMode: 'counties' }
→ bee-map.ts: _applyFilter() calls _setBoundaryMode('counties')
→ regionLayer.setSource(countySource), setVisible(true)
→ clusterSource.changed(), pushState
```

### Pattern 3: Chip UI Using Lit html Templates

**What:** Selected counties and ecoregions are rendered as removable chips. With 39 counties and 11 ecoregions as the fixed universe, the chip list is a simple Lit map over `Set` contents.

**Type label (FILTER-04):** Show the "county"/"ecoregion" badge on each chip when both sets are non-empty. When only one type is active, the badge can be hidden (it's already obvious from context).

**Recommendation (Claude's Discretion):**
- Group chips by type: county chips first, then ecoregion chips. No interleaving needed for 39+11.
- Show type badge always (simpler implementation, always correct per FILTER-04).

```typescript
// Source: existing bee-sidebar.ts pattern
private _renderRegionChips() {
  const bothActive = this._selectedCounties.size > 0 && this._selectedEcoregions.size > 0;
  return html`
    <div class="region-chips">
      ${[...this._selectedCounties].map(name => html`
        <span class="chip">
          ${bothActive ? html`<span class="chip-type">county</span>` : ''}
          ${name}
          <button class="chip-remove" @click=${() => this._removeCounty(name)}>&#x2715;</button>
        </span>
      `)}
      ${[...this._selectedEcoregions].map(name => html`
        <span class="chip">
          ${bothActive ? html`<span class="chip-type">ecoregion</span>` : ''}
          ${name}
          <button class="chip-remove" @click=${() => this._removeEcoregion(name)}>&#x2715;</button>
        </span>
      `)}
    </div>
  `;
}
```

### Pattern 4: Region Autocomplete Using Native Datalist

**What:** Same pattern as existing taxon datalist. `@property` supplies the option list; `<input type="text" list="...">` renders the autocomplete. On exact match selection, chip is added and input is cleared.

**Data source:** County names are derived from `countySource.getFeatures().map(f => f.get('NAME'))` at map load time. Ecoregion names from `ecoregionSource.getFeatures().map(f => f.get('NA_L3NAME'))`. These are static (39 counties, 11 ecoregions) and can be computed once and passed as props.

```typescript
// bee-map.ts — derive at firstUpdated (or on 'change' event, since GeoJSON loads synchronously)
// countySource and ecoregionSource are populated synchronously at module load
const countyNames = countySource.getFeatures()
  .map(f => f.get('NAME') as string)
  .filter((v, i, a) => a.indexOf(v) === i)  // deduplicate
  .sort();

const ecoregionNames = ecoregionSource.getFeatures()
  .map(f => f.get('NA_L3NAME') as string)
  .filter((v, i, a) => a.indexOf(v) === i)
  .sort();
```

**Critical:** The ecoregion GeoJSON has 80 feature records (multi-polygon slices) but only 11 unique `NA_L3NAME` values. Deduplication with `filter((v, i, a) => a.indexOf(v) === i)` or a `Set` is required before building the datalist options.

### Anti-Patterns to Avoid

- **Putting boundary mode state only in `bee-sidebar`:** `bee-map.ts` must remain the authoritative source for `boundaryMode` because it handles URL restoration (popstate), `regionLayer.setSource()`, and `regionLayer.setVisible()`. The sidebar should receive it as a prop.
- **Mutating `filterState` directly from `bee-sidebar.ts`:** Maintain the existing pattern — sidebar dispatches events, `bee-map.ts` mutates `filterState`. This keeps OL repaint logic centralized.
- **Not deduplicating ecoregion names:** The GeoJSON has 80 features but 11 unique names. An un-deduplicated datalist would show 80 entries including ~50 duplicates of "Strait of Georgia/Puget Lowland".
- **Using `@change` as the sole datalist selection event:** Browsers fire `input` reliably for datalist picks. Use the same `@input` + `@change` dual-handler pattern as the existing taxon autocomplete.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Autocomplete suggestions | Custom popup/dropdown | Native `<datalist>` | Already proven in taxon filter; browser handles accessibility, arrow keys, filtering |
| Multi-chip state management | Custom state store | Lit `@state()` Set on bee-sidebar | Same pattern as `_months: Set<number>` — simple and already used |
| Event debouncing | Custom debounce timer | Direct dispatch on chip add/remove | Chip operations are user-initiated, discrete — no debounce needed |

**Key insight:** The existing taxon datalist pattern is directly reusable. Region autocomplete is structurally identical — option list supplied as prop, exact-match-only filter dispatch, clear-on-select.

---

## Common Pitfalls

### Pitfall 1: Ecoregion Names Not Deduplicated
**What goes wrong:** Datalist shows 80 entries including ~50 duplicates of "Strait of Georgia/Puget Lowland"
**Why it happens:** The ecoregion GeoJSON has multi-polygon features — one row per polygon, not per region
**How to avoid:** Always use `Set` or `filter((v,i,a) => a.indexOf(v)===i)` when deriving the option list from `ecoregionSource.getFeatures()`
**Warning signs:** Datalist shows many repeating names

### Pitfall 2: Boundary Mode State Desync
**What goes wrong:** Sidebar shows boundary toggle state that doesn't match what `bee-map.ts` actually applied (especially after URL restore / popstate)
**Why it happens:** If sidebar holds its own `@state() _boundaryMode` without receiving it from the parent, a popstate event that calls `_restoreFilterState()` in `bee-map.ts` would update `this.boundaryMode` on the map but not propagate to the sidebar
**How to avoid:** `boundaryMode` must be a `@property({ attribute: false })` on `bee-sidebar`, driven by `this.boundaryMode` on `bee-map.ts` — same pattern as `layerMode`
**Warning signs:** After browser back/forward, sidebar toggle shows wrong active button

### Pitfall 3: _clearFilters() Region Reset Not Propagating to Map
**What goes wrong:** Calling `_clearFilters()` clears sidebar UI but `filterState.selectedCounties/Ecoregions` remain non-empty; map doesn't repaint
**Why it happens:** `_clearFilters()` currently only dispatches `filter-changed` with taxon/date fields. If `FilterChangedEvent` is extended but `_applyFilter()` in `bee-map.ts` isn't updated to also handle region fields, the regions aren't cleared
**How to avoid:** Both the event interface and the `_applyFilter()` handler must be updated together. Also need `regionLayer.changed()` after clearing region state.
**Warning signs:** Filter chips disappear from sidebar but map still shows region-filtered results

### Pitfall 4: noUnusedLocals Blocking Private Methods
**What goes wrong:** TypeScript build fails with `error TS6133: '_someMethod' is declared but its value is never read`
**Why it happens:** Noted in STATE.md as [Phase 18-map-integration] — `noUnusedLocals:true` is enforced in this project; adding a private method without a call site causes build failure
**How to avoid:** Ensure every new private method has at least one call site before committing; don't add stub methods
**Warning signs:** `tsc` fails during `npm run build`

### Pitfall 5: Floating Boundary Toggle CSS Left Behind
**What goes wrong:** After removing the `<div class="boundary-toggle">` from `bee-map.ts` template, the associated CSS (`.boundary-toggle`, `.boundary-toggle .btn`) remains as dead code
**Why it happens:** Easy to forget the CSS block when removing a template element
**How to avoid:** Remove both the template block (lines ~622–629) AND the CSS block (lines ~393–418) from `bee-map.ts` in the same task
**Warning signs:** Orphaned CSS generates no errors but is dead weight

---

## Code Examples

Verified patterns from the existing codebase (bee-sidebar.ts and bee-map.ts):

### Existing Layer Toggle (Style Reference for Boundary Toggle)
```typescript
// Source: bee-sidebar.ts _renderToggle()
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
```
The boundary toggle is structurally identical — replace 2 buttons with 3 (Off, Counties, Ecoregions).

### Existing Taxon Datalist (Pattern for Region Autocomplete)
```typescript
// Source: bee-sidebar.ts _renderFilterControls()
<div class="filter-row taxon-row">
  <input
    type="text"
    list="taxon-list"
    placeholder="Filter by taxon…"
    .value=${this._taxonInput}
    @input=${this._onTaxonInput}
    @change=${this._onTaxonChange}
  />
  <datalist id="taxon-list">
    ${this.taxaOptions.map(o => html`<option value=${o.label}></option>`)}
  </datalist>
</div>
```
County/ecoregion autocomplete follows the same structure. After an exact option match, add to the `@state` Set and clear the input value.

### Existing _clearFilters() (Needs Extension)
```typescript
// Source: bee-sidebar.ts
private _clearFilters() {
  this._taxonInput = '';
  this._taxonName = null;
  this._taxonRank = null;
  this._yearFrom = null;
  this._yearTo = null;
  this._months = new Set();
  this._dispatchFilterChanged();  // Must also carry region reset
}
```
Extension: also reset `this._selectedCounties = new Set()`, `this._selectedEcoregions = new Set()`, and include `boundaryMode: 'off'` in the dispatch.

### _setBoundaryMode() (Drives Region Layer — Called from bee-map.ts)
```typescript
// Source: bee-map.ts
private _setBoundaryMode(mode: 'off' | 'counties' | 'ecoregions'): void {
  this.boundaryMode = mode;
  if (mode === 'off') {
    regionLayer.setVisible(false);
    filterState.selectedCounties = new Set();
    filterState.selectedEcoregions = new Set();
    this._regionFilterText = null;
  } else if (mode === 'counties') {
    regionLayer.setSource(countySource);
    regionLayer.setVisible(true);
  } else {
    regionLayer.setSource(ecoregionSource);
    regionLayer.setVisible(true);
  }
  clusterSource.changed();
  sampleSource.changed();
  regionLayer.changed();
  if (this.map) this._pushUrlState();
}
```
Phase 19 calls this when the sidebar dispatches a boundary mode change (via the extended filter-changed event or a dedicated boundary-changed event).

### Deriving Option Lists from Already-Loaded Sources
```typescript
// Source: region-layer.ts — countySource and ecoregionSource are populated synchronously
// These can be derived in firstUpdated() or at module level in bee-map.ts
const countyOptions = [...new Set(
  countySource.getFeatures().map(f => f.get('NAME') as string)
)].sort();

const ecoregionOptions = [...new Set(
  ecoregionSource.getFeatures().map(f => f.get('NA_L3NAME') as string)
)].sort();
// Result: 39 counties, 11 unique ecoregions
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `regionFilterText` string prop (Phase 18 stub) | Region chips + autocomplete (Phase 19) | Phase 19 | Replace the stub `<p class="region-filter-text">` with full chip UI |
| Floating `.boundary-toggle` on map | Sidebar boundary toggle (Phase 19) | Phase 19 | Remove ~37 lines from bee-map.ts template + CSS; add toggle to sidebar |

---

## Open Questions

1. **Whether `_selectedCounties` / `_selectedEcoregions` should be `@state()` on bee-sidebar or driven purely via `@property()`**
   - What we know: Other filter state (taxon, year, month) uses `@state()` on the sidebar + URL restore via `@property()` restore fields. The same pattern is available.
   - What's unclear: For region state, `bee-map.ts` already tracks `filterState.selectedCounties/Ecoregions` as the authoritative Sets. If sidebar also tracks them as `@state`, we have two sources of truth that must stay in sync.
   - Recommendation: Sidebar owns `@state() private _selectedCounties` and `_selectedEcoregions` for UI rendering. Initialization from URL is handled via new restore `@property()` fields (same pattern as taxon/year/month). `bee-map.ts` remains authoritative over `filterState` (the OL-visible singleton).

2. **Whether to show region controls when `layerMode === 'samples'`**
   - What we know: CONTEXT.md states "region filter applies to both layers, so showing them in sample mode is appropriate." Region filter is already applied to `sampleSource` in `matchesFilter()`.
   - What's unclear: The current template conditionally hides `_renderFilterControls()` for sample mode (`${this.layerMode === 'specimens' ? this._renderFilterControls() : ''}`). Region controls need to appear in both modes.
   - Recommendation: Extract region controls into a separate `_renderRegionControls()` that renders outside the `layerMode === 'specimens'` gate — always visible. Boundary toggle also always visible (it's at the top, above all filters).

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None — no test framework installed |
| Config file | None |
| Quick run command | `npm run build` (TypeScript type-check is the only automated validation) |
| Full suite command | `npm run build` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FILTER-03 | County multi-select chips added/removed, OR semantics in matchesFilter | manual-only | `npm run build` (type-check only) | N/A |
| FILTER-04 | Ecoregion chips with type label; both chip types visible simultaneously | manual-only | `npm run build` (type-check only) | N/A |
| FILTER-06 | Clear filters resets county+ecoregion; map position unchanged | manual-only | `npm run build` (type-check only) | N/A |

**Justification for manual-only:** No test framework exists in the project (no vitest, jest, or playwright config; no test scripts in package.json; no `*.test.*` files). All three requirements involve DOM interaction and OL map rendering — they are not unit-testable without a browser environment and significant framework investment that is out of scope for this phase.

### Sampling Rate
- **Per task commit:** `npm run build` — catches TypeScript errors including noUnusedLocals
- **Per wave merge:** `npm run build` + manual browser smoke test (boundary toggle, chip add/remove, clear filters)
- **Phase gate:** Manual verification of all 4 success criteria from CONTEXT.md before `/gsd:verify-work`

### Wave 0 Gaps
None — no test framework investment needed; TypeScript build is the automated gate.

---

## Sources

### Primary (HIGH confidence)
- Direct source read: `frontend/src/bee-sidebar.ts` — full sidebar component, event patterns, existing CSS
- Direct source read: `frontend/src/bee-map.ts` — `_setBoundaryMode()`, `_applyFilter()`, `FilterChangedEvent`, template structure
- Direct source read: `frontend/src/filter.ts` — `filterState` shape, `matchesFilter()` semantics
- Direct source read: `frontend/src/region-layer.ts` — GeoJSON property names (`NAME`, `NA_L3NAME`), source setup
- Direct data inspection: `wa_counties.geojson` (39 counties), `epa_l3_ecoregions_wa.geojson` (80 features, 11 unique names)
- `.planning/STATE.md` — accumulated decisions including noUnusedLocals note and Phase 18 integration decisions

### Secondary (MEDIUM confidence)
- CONTEXT.md Phase 19 decisions — all locked decisions and code context from discussion phase

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use, no new dependencies
- Architecture: HIGH — patterns directly visible in existing source code
- Pitfalls: HIGH — derived from actual codebase constraints (noUnusedLocals, ecoregion deduplication verified by data inspection)
- Integration points: HIGH — full source reads of all affected files

**Research date:** 2026-03-18
**Valid until:** Phase 19 remains valid until source files change (stable — internal codebase)
