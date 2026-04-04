# Phase 37: Sidebar Decomposition - Research

**Researched:** 2026-04-04
**Domain:** Lit custom element decomposition, pure presenter sub-components, stateless controlled inputs
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DECOMP-01 | `<bee-filter-controls>` renders all filter inputs (taxon, year, month, county, ecoregion) and emits a single `filter-changed` event with full filter state — it holds no filter state internally | See "Controlled-input pattern for bee-filter-controls" and "State inventory: what moves where" |
| DECOMP-02 | `<bee-specimen-detail>` renders specimen cluster detail when given a specimens property, with no sidebar or map awareness | See "bee-specimen-detail: pure render component" |
| DECOMP-03 | `<bee-sample-detail>` renders sample observation detail when given a sample event property, with no sidebar or map awareness | See "bee-sample-detail: pure render component" |
| DECOMP-04 | bee-sidebar contains no filter input markup or specimen/sample rendering logic of its own — it only composes the sub-components and routes their events upward | See "bee-sidebar as thin layout shell" and "Anti-patterns to avoid" |
</phase_requirements>

---

## Summary

`bee-sidebar.ts` is currently a 909-line monolith. It renders filter controls (taxon, year, month, county, ecoregion, boundary toggle), specimen cluster detail, sample event detail, recent sample event list, and a data summary panel — all inline. Phase 37 decomposes this into three focused sub-components plus a thin layout shell.

The decomposition is a pure structural refactor: no new packages, no new data flows, no new features. All data already flows down from `bee-atlas` as properties; all events already bubble up through `bee-sidebar` to `bee-atlas`. The challenge is correctly handling the one stateful aspect: `bee-filter-controls` must be a **controlled component** — it accepts current filter values as properties and emits `filter-changed` on every user interaction, but holds zero internal `@state` of its own. All filter state remains owned by `bee-atlas`.

The `bee-specimen-detail` and `bee-sample-detail` components are simpler: they are pure render components (no user interaction beyond the Back button, which emits a close event). They need no connection to the wider app and can be tested in isolation with just a property binding.

**Primary recommendation:** Create three new files (`bee-filter-controls.ts`, `bee-specimen-detail.ts`, `bee-sample-detail.ts`), reduce `bee-sidebar.ts` to a layout shell that imports and composes them, move CSS classes to the component that renders the markup using them, and write source-analysis tests asserting that bee-sidebar contains no filter input markup or specimen/sample rendering logic.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| lit | ^3.2.1 | Custom element base class, `html` template tag, `css` styles | Already in use [VERIFIED: frontend/package.json] |
| lit/decorators.js | (bundled with lit) | `@customElement`, `@property` | Already in use [VERIFIED: bee-sidebar.ts, bee-atlas.ts] |

No new packages required. This is a structural decomposition, not a dependency addition.

**Installation:** none needed.

---

## Architecture Patterns

### Recommended Project Structure After Phase 37

```
frontend/src/
├── bee-atlas.ts            # UNCHANGED — coordinator, owns all app state
├── bee-sidebar.ts          # CHANGED — thin layout shell, composes sub-components
├── bee-filter-controls.ts  # NEW — all filter inputs, controlled, emits filter-changed
├── bee-specimen-detail.ts  # NEW — specimen cluster render, pure presenter
├── bee-sample-detail.ts    # NEW — sample event render, pure presenter
├── bee-map.ts              # UNCHANGED — pure presenter map
├── url-state.ts            # UNCHANGED
├── filter.ts               # UNCHANGED
├── duckdb.ts               # UNCHANGED
├── features.ts             # UNCHANGED
├── region-layer.ts         # UNCHANGED
└── style.ts                # UNCHANGED
```

### Pattern 1: Controlled-Input Pattern for bee-filter-controls

**What:** A component that renders form inputs but holds no `@state`. Every input change immediately emits a `filter-changed` event containing the full new filter state. The parent (bee-sidebar → bee-atlas) owns the canonical state; bee-filter-controls is re-rendered on every property update.

**When to use:** Whenever multiple input widgets need to synchronize through a common owner. The DECOMP-01 success criterion explicitly requires "it holds no filter state internally."

**Key implication for the design:** The current bee-sidebar holds private `@state` fields (`_taxonInput`, `_taxonRank`, `_taxonName`, `_yearFrom`, `_yearTo`, `_months`, `_selectedCounties`, `_selectedEcoregions`, `_countyInput`, `_ecoregionInput`) and applies `restored*` properties via `updated()`. Under DECOMP-01, ALL of this must move to `bee-filter-controls` as `@property` inputs driven by bee-atlas. The `restored*` mechanism on bee-sidebar must be replaced by bee-atlas passing its current `_filterState` directly as a single property (or decomposed into per-field properties) to bee-filter-controls.

**The design question for the planner:** How should bee-atlas drive bee-filter-controls?

Option A — Pass the full `FilterState` as one property, plus ancillary options (taxaOptions, countyOptions, ecoregionOptions, boundaryMode):
```typescript
// bee-filter-controls receives:
@property({ attribute: false }) filterState!: FilterState;
@property({ attribute: false }) taxaOptions: TaxonOption[] = [];
@property({ attribute: false }) countyOptions: string[] = [];
@property({ attribute: false }) ecoregionOptions: string[] = [];
@property({ attribute: false }) boundaryMode: 'off' | 'counties' | 'ecoregions' = 'off';
@property({ attribute: false }) summary: DataSummary | null = null;
```
Each input renders `.value=${filterState.taxonName ?? ''}` etc. and on change reconstructs the full filter object and emits it.

Option B — Pass individual fields as separate properties (one per filter input).

**Recommendation: Option A.** The `FilterState` interface already exists and is the canonical filter shape. Option A aligns with how bee-atlas already tracks state. Option B creates N separate properties that must all stay in sync.

**Boundary mode:** `boundaryMode` is currently passed to bee-sidebar as a `@property` and included in the `FilterChangedEvent`. The boundary toggle is rendered by `_renderBoundaryToggle()` in bee-sidebar. Under DECOMP-01 the boundary toggle is part of filter controls (the county/ecoregion filter only makes sense with boundary mode active). Move boundary toggle into `bee-filter-controls`. `bee-filter-controls` emits `filter-changed` with `boundaryMode` included in the detail, matching the existing `FilterChangedEvent` interface.

**Taxon input display value:** The current bee-sidebar computes a display string via `_getRestoredTaxonInput()` in bee-atlas and passes it as `restoredTaxonInput`. Under the new model, bee-filter-controls has access to `filterState` + `taxaOptions` and can derive the display label internally. Bee-atlas can remove `_getRestoredTaxonInput()`.

**Example (bee-filter-controls controlled pattern):**
```typescript
// Source: Lit documentation patterns [ASSUMED — Lit 3 controlled input pattern]
@customElement('bee-filter-controls')
export class BeeFilterControls extends LitElement {
  @property({ attribute: false }) filterState!: FilterState;
  @property({ attribute: false }) taxaOptions: TaxonOption[] = [];
  @property({ attribute: false }) countyOptions: string[] = [];
  @property({ attribute: false }) ecoregionOptions: string[] = [];
  @property({ attribute: false }) boundaryMode: 'off' | 'counties' | 'ecoregions' = 'off';
  @property({ attribute: false }) summary: DataSummary | null = null;

  // Internal text input state — transient UI state not in FilterState
  // (mid-keystroke taxon input, county input field, ecoregion input field)
  // These three fields are acceptable as @state because they are UI-only
  // and do not affect filter results. The filter is only applied on
  // exact-match selection, not mid-keystroke.
  @state() private _taxonInputText = '';
  @state() private _countyInputText = '';
  @state() private _ecoregionInputText = '';

  private _emit(detail: FilterChangedEvent) {
    this.dispatchEvent(new CustomEvent<FilterChangedEvent>('filter-changed', {
      bubbles: true, composed: true, detail,
    }));
  }
  // ...handlers that call this._emit({...this.filterState, ...change, boundaryMode: this.boundaryMode})
}
```

**Important nuance on "no filter state internally":** The success criterion says bee-filter-controls "holds no filter state internally." The three text-input transient fields (`_taxonInputText`, `_countyInputText`, `_ecoregionInputText`) are UI-only — they track mid-keystroke input before an option is selected. They are not filter state: they do not affect what data is queried. This distinction is important. The planner should treat them as acceptable internal `@state`, not as a violation of DECOMP-01.

### Pattern 2: bee-specimen-detail — Pure Render Component

**What:** Renders a list of `Sample` objects (specimen cluster detail). No internal state. No event handling beyond emitting a `close` event from the Back button.

**Properties:**
```typescript
@property({ attribute: false }) samples: Sample[];
```

**Event:** Emits `close` (no detail) when the user clicks the Back/close button.

The current rendering logic lives in `_renderDetail(samples)` in bee-sidebar. Extract it verbatim, keeping all CSS classes. The `_clearSelection()` method on bee-sidebar dispatches `close` — this event should instead come from bee-specimen-detail directly, and bee-sidebar routes it upward.

**Note:** The current sidebar renders the "Clear selection" button inside `_renderFilterControls()` when `this.samples !== null`. After decomposition, that button belongs in `bee-specimen-detail` or is a conceptual Back button. Either way it emits `close`.

### Pattern 3: bee-sample-detail — Pure Render Component

**What:** Renders a single `SampleEvent` detail view. No internal state. Emits `close` when Back is clicked.

**Properties:**
```typescript
@property({ attribute: false }) sampleEvent: SampleEvent;
```

**Event:** Emits `close` (no detail) on Back button click.

The current rendering logic lives in `_renderSampleDotDetail(event)` in bee-sidebar. The current implementation has `this.selectedSampleEvent = null` (direct property mutation) as the Back button handler — this must become a `close` event emission.

### Pattern 4: bee-sidebar as Thin Layout Shell

**What:** Imports and renders the three sub-components. Routes events upward (re-emits or passes through). Contains no `<input>`, `<select>`, `<datalist>`, `<ul class="species-list">`, or similar markup — only `<bee-filter-controls>`, `<bee-specimen-detail>`, `<bee-sample-detail>`, structural wrappers, and the layer-mode toggle.

**What stays in bee-sidebar:**
- Layer mode toggle (`_renderToggle()`) — this is sidebar-level UI, not filter controls
- Recent sample events list (`_renderRecentSampleEvents()`) — sidebar-level content
- Summary panel (`_renderSummary()`) — sidebar-level content
- Layout CSS (`:host`, panel padding, overflow)
- The conditional rendering logic (`samples !== null ? detail : layerMode === 'samples' ? ...`)

**What moves out:**
- Boundary toggle → bee-filter-controls
- Filter inputs (taxon, year, month, county, ecoregion chips) → bee-filter-controls
- Specimen detail markup → bee-specimen-detail
- Sample dot detail markup → bee-sample-detail

**Event routing in bee-sidebar:**
- `filter-changed` from bee-filter-controls → re-emitted upward (bubbles:true composed:true already handles this automatically; no explicit re-emit needed if composed:true is set)
- `close` from bee-specimen-detail or bee-sample-detail → re-emitted or handled

**Composing in bee-sidebar render:**
```typescript
render() {
  return html`
    ${this._renderBoundaryToggle()}  // REMOVED — moves to bee-filter-controls
    ${this._renderToggle()}           // STAYS in bee-sidebar
    ${this.layerMode === 'specimens'
      ? html`<bee-filter-controls
               .filterState=${this.filterState}
               .taxaOptions=${this.taxaOptions}
               .countyOptions=${this.countyOptions}
               .ecoregionOptions=${this.ecoregionOptions}
               .boundaryMode=${this.boundaryMode}
               .summary=${this.summary}
             ></bee-filter-controls>`
      : ''}
    ${this.samples !== null
      ? html`<bee-specimen-detail .samples=${this.samples}></bee-specimen-detail>`
      : this.layerMode === 'samples' && this.selectedSampleEvent !== null
        ? html`<bee-sample-detail .sampleEvent=${this.selectedSampleEvent}></bee-sample-detail>`
        : this.layerMode === 'samples'
          ? this._renderRecentSampleEvents()
          : this._renderSummary()}
  `;
}
```

**Note on property interface change:** Once bee-filter-controls is controlled, bee-sidebar no longer needs the 10+ `restored*` properties. Instead it receives `filterState` (the full state object from bee-atlas). This simplifies the bee-atlas → bee-sidebar binding considerably. Bee-atlas currently passes `.restoredTaxonInput`, `.restoredTaxonRank`, `.restoredTaxonName`, `.restoredYearFrom`, `.restoredYearTo`, `.restoredMonths`, `.restoredCounties`, `.restoredEcoregions` — all of these can be replaced by a single `.filterState=${this._filterState}` binding, plus `.taxaOptions`, `.countyOptions`, `.ecoregionOptions`, `.boundaryMode`, `.summary`.

### Anti-Patterns to Avoid

- **@state in bee-filter-controls for filter values:** Do not add `@state private _yearFrom = null`. The filter values are NOT internal state — they come from the parent via `filterState` property. The only `@state` allowed are the three text-input transient strings.
- **Emitting partial filter-changed:** Do not emit only the changed field. Always emit the full `FilterChangedEvent` with all fields (taxon, year, month, county, ecoregion, boundaryMode). This is required by DECOMP-01.
- **bee-sidebar re-implementing filter logic:** After decomposition, bee-sidebar must not contain any handler methods like `_onTaxonInput`, `_onYearFromChange`, etc. These move to bee-filter-controls.
- **Direct property mutation for navigation:** The current `_renderSampleDotDetail` does `this.selectedSampleEvent = null` directly. Under the new design, bee-sample-detail emits `close` and bee-atlas handles it.
- **CSS in wrong component:** Move CSS classes to the component that renders the markup using them (e.g., `.sample`, `.sample-header`, `.species-list` go to bee-specimen-detail; `.sample-dot-detail`, `.event-inat` go to bee-sample-detail; filter-related classes go to bee-filter-controls).

---

## State Inventory: What Moves Where

| Current Location | What | Destination |
|-----------------|------|-------------|
| bee-sidebar `@state _taxonInput` | Text input display value | bee-filter-controls `@state _taxonInputText` |
| bee-sidebar `@state _taxonRank` | Filter state (from filterState prop) | REMOVED — read from `filterState.taxonRank` |
| bee-sidebar `@state _taxonName` | Filter state | REMOVED — read from `filterState.taxonName` |
| bee-sidebar `@state _yearFrom` | Filter state | REMOVED — read from `filterState.yearFrom` |
| bee-sidebar `@state _yearTo` | Filter state | REMOVED — read from `filterState.yearTo` |
| bee-sidebar `@state _months` | Filter state | REMOVED — read from `filterState.months` |
| bee-sidebar `@state _selectedCounties` | Filter state | REMOVED — read from `filterState.selectedCounties` |
| bee-sidebar `@state _selectedEcoregions` | Filter state | REMOVED — read from `filterState.selectedEcoregions` |
| bee-sidebar `@state _countyInput` | Text input display | bee-filter-controls `@state _countyInputText` |
| bee-sidebar `@state _ecoregionInput` | Text input display | bee-filter-controls `@state _ecoregionInputText` |
| bee-sidebar `@property restoredTaxon*` | URL restore mechanism | REMOVED — replaced by `filterState` property |
| bee-sidebar `@property restoredYear*` | URL restore mechanism | REMOVED — replaced by `filterState` property |
| bee-sidebar `@property restoredMonths` | URL restore mechanism | REMOVED — replaced by `filterState` property |
| bee-sidebar `@property restoredCounties` | URL restore mechanism | REMOVED — replaced by `filterState` property |
| bee-sidebar `@property restoredEcoregions` | URL restore mechanism | REMOVED — replaced by `filterState` property |
| bee-sidebar `updated()` restore logic | Apply restored props to @state | REMOVED — no longer needed |
| bee-atlas `_getRestoredTaxonInput()` | Compute display label for sidebar | REMOVED — bee-filter-controls derives it |
| bee-atlas template `restoredTaxon*` bindings | 8+ redundant property bindings | REMOVED — replaced by `.filterState` |

**Ripple effect on bee-atlas:** Bee-atlas `render()` currently passes 8 `restored*` property bindings to bee-sidebar. After Phase 37 these are all replaced by a single `.filterState=${this._filterState}` binding. The `_getRestoredTaxonInput()` private method on bee-atlas is also deleted.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Input synchronization between parent and child | Custom two-way binding mechanism | Lit controlled-input pattern (property down, event up) | Lit re-renders on property change automatically; no sync code needed |
| CSS isolation between sub-components | Global CSS or shared stylesheet | Shadow DOM (automatic in LitElement) | Each component gets its own shadow root; CSS is scoped |
| Event re-bubbling | Manual addEventListener + dispatchEvent wiring in bee-sidebar | `bubbles: true, composed: true` on CustomEvent in the sub-component | Composed events automatically cross shadow DOM boundaries |

**Key insight:** `bubbles: true, composed: true` on CustomEvents means bee-filter-controls' `filter-changed` event will reach bee-atlas automatically without bee-sidebar re-emitting it. Bee-atlas already wires `@filter-changed=${this._onFilterChanged}` — this continues to work unchanged.

---

## Common Pitfalls

### Pitfall 1: Stale Input Text When filterState Changes
**What goes wrong:** bee-filter-controls shows the old text input value after bee-atlas restores from URL (popstate).
**Why it happens:** The text input is `@state _taxonInputText` which doesn't auto-update when `filterState` property changes.
**How to avoid:** Implement `updated(changedProperties)` in bee-filter-controls to sync `_taxonInputText` from `filterState` when `filterState` changes (the same pattern currently used in bee-sidebar). Derive the display label from `taxaOptions.find(o => o.name === filterState.taxonName)?.label ?? filterState.taxonName ?? ''`.
**Warning signs:** Taxon filter displays old text after pressing browser back button.

### Pitfall 2: Boundary Toggle Ownership Confusion
**What goes wrong:** Boundary mode gets set in two places (bee-filter-controls and bee-sidebar) causing desync.
**Why it happens:** `boundaryMode` is currently a `@property` on bee-sidebar AND a field in `FilterChangedEvent`. If it stays on bee-sidebar as a separate property that isn't threaded through to bee-filter-controls, the toggle moves without its data.
**How to avoid:** Pass `boundaryMode` as a property to bee-filter-controls; include it in every `filter-changed` emission from bee-filter-controls. Remove the separate `boundaryMode` @property from bee-sidebar (replace with reading from filterState or as a passthrough prop to bee-filter-controls).
**Warning signs:** Boundary toggle visually resets after filter changes.

### Pitfall 3: CSS Classes Left in bee-sidebar
**What goes wrong:** Moving markup to sub-components but leaving CSS in bee-sidebar means styles don't apply (shadow DOM isolation).
**Why it happens:** Shadow DOM scopes CSS to the component's shadow root. If `.species-list` CSS is in bee-sidebar's `static styles` but the `.species-list` markup is in bee-specimen-detail's shadow root, the style won't apply.
**How to avoid:** Move each CSS rule to the component that renders the markup it styles. Audit every CSS class against its usage.
**Warning signs:** List items or detail panels render unstyled after decomposition.

### Pitfall 4: Back Button Emitting Wrong Event
**What goes wrong:** Clicking Back in bee-specimen-detail or bee-sample-detail doesn't clear the selection.
**Why it happens:** Current implementation does `this.selectedSampleEvent = null` (direct property mutation). Under decomposition, sub-components must not mutate parent properties.
**How to avoid:** Emit `close` event from the sub-component; bee-sidebar listens and re-emits (or relies on `composed: true` to reach bee-atlas).
**Warning signs:** Back button does nothing or throws a TypeScript error.

### Pitfall 5: bee-atlas Template Not Updated
**What goes wrong:** bee-sidebar still receives the 8 `restored*` property bindings after those properties are removed.
**Why it happens:** bee-atlas template is updated separately from bee-sidebar refactor; easy to miss.
**How to avoid:** Update bee-atlas template in the same plan step that removes `restored*` props from bee-sidebar. Also delete `_getRestoredTaxonInput()` from bee-atlas.
**Warning signs:** TypeScript compile error: "Property 'restoredTaxonInput' does not exist on type 'BeeSidebar'."

---

## Code Examples

### Controlled filter-changed emission pattern
```typescript
// Source: pattern established in bee-sidebar._dispatchFilterChanged [VERIFIED: frontend/src/bee-sidebar.ts:403-418]
// bee-filter-controls adapts this pattern — emits full state on every change
private _emit(partial: Partial<FilterChangedEvent> = {}) {
  const detail: FilterChangedEvent = {
    taxonName: this.filterState.taxonName,
    taxonRank: this.filterState.taxonRank,
    yearFrom: this.filterState.yearFrom,
    yearTo: this.filterState.yearTo,
    months: new Set(this.filterState.months),
    selectedCounties: new Set(this.filterState.selectedCounties),
    selectedEcoregions: new Set(this.filterState.selectedEcoregions),
    boundaryMode: this.boundaryMode,
    ...partial,
  };
  this.dispatchEvent(new CustomEvent<FilterChangedEvent>('filter-changed', {
    bubbles: true, composed: true, detail,
  }));
}
```

### Syncing text input from filterState in updated()
```typescript
// Source: pattern from bee-sidebar.updated() [VERIFIED: frontend/src/bee-sidebar.ts:380-401]
// bee-filter-controls needs same pattern to sync display text on URL restore
updated(changedProperties: PropertyValues) {
  if (changedProperties.has('filterState')) {
    const prev = changedProperties.get('filterState') as FilterState | undefined;
    if (!prev || prev.taxonName !== this.filterState.taxonName) {
      const opt = this.taxaOptions.find(
        o => o.name === this.filterState.taxonName && o.rank === this.filterState.taxonRank
      );
      this._taxonInputText = opt?.label ?? this.filterState.taxonName ?? '';
    }
    if (!prev || prev.selectedCounties !== this.filterState.selectedCounties) {
      this._countyInputText = '';
    }
    if (!prev || prev.selectedEcoregions !== this.filterState.selectedEcoregions) {
      this._ecoregionInputText = '';
    }
  }
}
```

### Source-analysis test pattern (established in Phase 36)
```typescript
// Source: frontend/src/tests/bee-atlas.test.ts [VERIFIED: frontend/src/tests/bee-atlas.test.ts:77-108]
// Phase 37 tests should use same readFileSync pattern to assert structural invariants
test('bee-sidebar.ts contains no filter input markup', () => {
  const src = readFileSync(resolve(__dirname, '../bee-sidebar.ts'), 'utf-8');
  // No <input type="text" ... placeholder="Filter by taxon">
  expect(src).not.toMatch(/placeholder.*Filter by taxon/);
  expect(src).not.toMatch(/placeholder.*Filter by county/);
  // No specimen list rendering
  expect(src).not.toMatch(/class="species-list"/);
});
```

### Custom element @property declarations for sub-components
```typescript
// Source: Lit documentation — @property decorator [ASSUMED — standard Lit pattern]
// bee-specimen-detail
@customElement('bee-specimen-detail')
export class BeeSpecimenDetail extends LitElement {
  @property({ attribute: false }) samples: Sample[] = [];
  // emits 'close' on back button
}

// bee-sample-detail
@customElement('bee-sample-detail')
export class BeeSampleDetail extends LitElement {
  @property({ attribute: false }) sampleEvent!: SampleEvent;
  // emits 'close' on back button
}
```

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 |
| Config file | `frontend/vite.config.ts` (test block) |
| Quick run command | `cd frontend && npm test -- --run` |
| Full suite command | `cd frontend && npm test -- --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DECOMP-01 | bee-filter-controls has @property declarations for filterState, taxaOptions, countyOptions, ecoregionOptions, boundaryMode | unit (property check) | `npm test -- --run` | ❌ Wave 0 |
| DECOMP-01 | bee-filter-controls emits filter-changed event | unit (structural check) | `npm test -- --run` | ❌ Wave 0 |
| DECOMP-02 | bee-specimen-detail has @property declaration for samples | unit (property check) | `npm test -- --run` | ❌ Wave 0 |
| DECOMP-03 | bee-sample-detail has @property declaration for sampleEvent | unit (property check) | `npm test -- --run` | ❌ Wave 0 |
| DECOMP-04 | bee-sidebar.ts contains no filter input markup (source analysis) | unit (readFileSync) | `npm test -- --run` | ❌ Wave 0 |
| DECOMP-04 | bee-sidebar.ts contains no specimen/sample detail markup (source analysis) | unit (readFileSync) | `npm test -- --run` | ❌ Wave 0 |
| DECOMP-04 | bee-sidebar.ts does not import bee-filter-controls internals (uses element tag only) | unit (source analysis) | `npm test -- --run` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && npm test -- --run`
- **Per wave merge:** `cd frontend && npm test -- --run`
- **Phase gate:** Full suite green + TypeScript compile clean before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/tests/bee-sidebar.test.ts` — covers DECOMP-01 through DECOMP-04 structural invariants

*(Existing `frontend/src/tests/bee-atlas.test.ts` is not modified — it covers ARCH requirements only)*

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — this is a pure frontend code decomposition with no new tools, services, or CLIs required beyond what already exists).

Node v24.12.0 and Vitest 4.1.2 confirmed available. [VERIFIED: environment probe]

---

## Runtime State Inventory

Step 2.5: NOT APPLICABLE. Phase 37 is not a rename, refactor of identifiers, or migration. It decomposes a Lit component into sub-components. No stored data, live service configs, OS-registered state, secrets, or build artifacts are affected.

---

## Security Domain

This phase creates no new network endpoints, authentication paths, input paths that reach a server, or data storage. All three new components render data that is already validated and typed by the time it arrives as Lit properties. No ASVS categories apply beyond what was already covered by the existing codebase.

---

## Open Questions

1. **Where does the layer-mode toggle live after decomposition?**
   - What we know: The layer-mode toggle (Specimens / Samples buttons) is currently in `_renderToggle()` in bee-sidebar. It is not a filter control; it is sidebar-level UI.
   - What's unclear: Should it stay in bee-sidebar, or move into a `bee-layer-toggle` component? The success criteria for DECOMP-04 only require that bee-sidebar contains no "filter input markup or specimen/sample rendering logic." The layer toggle is neither.
   - Recommendation: Leave the layer toggle inline in bee-sidebar. It is 10 lines of HTML and does not need its own component. The DECOMP requirements do not require it to move.

2. **How should bee-sidebar pass boundaryMode to bee-filter-controls?**
   - What we know: `boundaryMode` is currently a `@property` on bee-sidebar driven by bee-atlas. Bee-filter-controls needs it to render the boundary toggle. After decomposition, `FilterChangedEvent` still includes `boundaryMode`.
   - What's unclear: Should `boundaryMode` stay as a separate `@property` on bee-sidebar (passed through to bee-filter-controls), or should it be derived from a `filterState`-like object?
   - Recommendation: Keep `boundaryMode` as a separate `@property` on bee-sidebar (driven by bee-atlas) and pass it through as `.boundaryMode=${this.boundaryMode}` to bee-filter-controls. This preserves the existing data flow without changing the bee-atlas → bee-sidebar contract for this field.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Transient text input fields (`_taxonInputText`, `_countyInputText`, `_ecoregionInputText`) are acceptable as `@state` in bee-filter-controls without violating DECOMP-01 "holds no filter state internally" | Controlled-input pattern | If the success criterion is interpreted strictly (zero @state), the component cannot handle mid-keystroke input — the UX would break on every keystroke. Low risk: this interpretation is clearly correct. |
| A2 | `bubbles: true, composed: true` on bee-filter-controls' `filter-changed` event means bee-atlas receives it without bee-sidebar explicitly re-emitting | Don't Hand-Roll | If composed events don't reach bee-atlas due to some listener configuration, bee-sidebar would need to add a `@filter-changed` handler to re-emit. Low risk: the pattern is already used by the existing code. |

**All other claims in this research were verified against the actual source files.**

---

## Sources

### Primary (HIGH confidence)
- [VERIFIED: frontend/src/bee-sidebar.ts] — Full current implementation; all 909 lines read and analyzed
- [VERIFIED: frontend/src/bee-atlas.ts] — Current coordinator template; bee-sidebar bindings read
- [VERIFIED: frontend/src/filter.ts] — FilterState interface and FilterChangedEvent confirmed
- [VERIFIED: frontend/src/tests/bee-atlas.test.ts] — Established test patterns (readFileSync, elementProperties)
- [VERIFIED: frontend/vite.config.ts] — Test configuration confirmed (happy-dom, passWithNoTests)
- [VERIFIED: frontend/package.json] — Lit ^3.2.1, Vitest ^4.1.2, no new packages needed
- [VERIFIED: .planning/phases/36-bee-atlas-root-component/36-02-SUMMARY.md] — Phase 36 decisions, patterns established

### Secondary (MEDIUM confidence)
- [ASSUMED — Lit 3 patterns] — Controlled-input pattern, `updated()` for property sync; well-established Lit idiom consistent with existing codebase usage

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; existing Lit setup verified
- Architecture: HIGH — decomposition plan derived directly from reading the source; all state/event flows traced
- Pitfalls: HIGH — identified from actual code patterns in bee-sidebar.ts (e.g., the direct `this.selectedSampleEvent = null` Back button anti-pattern)

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable Lit 3; no ecosystem churn expected)
