# Phase 112: Checklist Map Layer — Pattern Map

**Mapped:** 2026-05-24
**Files analyzed:** 9 (5 source changes + 4 test changes)
**Analogs found:** 9 / 9

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/bee-pane.ts` | component | event-driven | `src/bee-pane.ts` `_renderWhen()` (self) | exact |
| `src/bee-atlas.ts` | component/coordinator | event-driven | `src/bee-atlas.ts` `_onBoundaryModeChanged` (self) | exact |
| `src/bee-map.ts` | component | request-response + event-driven | `src/bee-map.ts` `_applyBoundaryMode()` (self) | exact |
| `src/url-state.ts` | utility | transform | `src/url-state.ts` `boundaryMode`/`paneState` (self) | exact |
| `src/manifest.ts` | utility | request-response | `src/manifest.ts` `Manifest` interface (self) | exact |
| `scripts/make-local-manifest.js` | config | transform | `scripts/make-local-manifest.js` (self) | exact |
| `src/tests/bee-map.test.ts` | test | — | `src/tests/bee-atlas.test.ts` BOUNDARY-01 describe block | exact |
| `src/tests/bee-pane.test.ts` | test | — | `src/tests/bee-pane.test.ts` PANE-05 describe block (self) | exact |
| `src/tests/url-state.test.ts` | test | — | `src/tests/url-state.test.ts` `boundaryMode`/`paneState` tests (self) | exact |

---

## Pattern Assignments

### `src/bee-pane.ts` — add `_renderShow()` and `_showChecklist` state

**Analog:** `src/bee-pane.ts` `_renderWhen()` method and `_yearThisYear` state

**New `@state` field pattern** (lines 103–105, follow the year-bucket pattern):
```typescript
// In the @state block alongside _yearThisYear / _yearLastYear / _yearEarlier
@state() private _showChecklist = false;
```

**New `_renderShow()` method — modeled exactly on `_renderWhen()`** (lines 1034–1063):
```typescript
// In bee-pane.ts _renderWhen() — the template to mirror:
private _renderWhen() {
  return html`
    <div class="filter-row">
      <svg class="row-icon" width="16" height="16" viewBox="0 0 16 16" fill="none"
           stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <!-- calendar icon -->
      </svg>
      <div class="year-row">
        <label class="year-label">
          <input type="checkbox" .checked=${this._yearThisYear}
            @change=${(e: Event) => { this._yearThisYear = (e.target as HTMLInputElement).checked; this._emitFilter(); }}
          />
          This year
        </label>
        <!-- ... more labels ... -->
      </div>
    </div>
  `;
}
```

**New `_renderShow()` — copy `.filter-row` + `.year-row` + `.year-label` structure, substituting layers icon and single checkbox:**
```typescript
private _renderShow() {
  return html`
    <div class="filter-row">
      <svg class="row-icon" width="16" height="16" viewBox="0 0 16 16" fill="none"
           stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <polygon points="8,2 14,5.5 8,9 2,5.5"/>
        <polyline points="2,8.5 8,12 14,8.5"/>
      </svg>
      <div class="year-row">
        <label class="year-label">
          <input type="checkbox" .checked=${this._showChecklist}
            aria-label="Show checklist county records on map"
            @change=${this._onChecklistChange}
          />
          Checklist records
        </label>
      </div>
    </div>
  `;
}
```

**Event dispatch pattern — copy from `_emitFilter` and `_onToggle`** (lines 550–578):
```typescript
// Existing CustomEvent dispatch pattern in bee-pane.ts:
this.dispatchEvent(new CustomEvent('pane-expand-list', { bubbles: true, composed: true }));
// With detail:
this.dispatchEvent(new CustomEvent<FilterChangedEvent>('filter-changed', {
  bubbles: true, composed: true,
  detail: { ... },
}));

// New handler to add:
private _onChecklistChange(e: Event) {
  const visible = (e.target as HTMLInputElement).checked;
  this._showChecklist = visible;
  this.dispatchEvent(new CustomEvent('checklist-layer-changed', {
    bubbles: true, composed: true,
    detail: { visible },
  }));
}
```

**`_renderListContent()` call site** (lines 1065–1105): Call `${this._renderShow()}` after `${this._renderWhen()}` inside the `.filter-panel` div.

**CSS already covers the new element:** `.filter-row`, `.year-row`, `.year-label`, `.row-icon`, and `input[type="checkbox"] { accent-color: var(--accent, #2c7a2c) }` are all declared at lines 239–379. No new CSS needed.

---

### `src/bee-atlas.ts` — add `_checklistVisible` state, handler, and render wiring

**Analog:** `src/bee-atlas.ts` `_boundaryMode` + `_onBoundaryModeChanged`

**New `@state` field** (follow pattern at lines 33–36):
```typescript
// Existing pattern:
@state() private _boundaryMode: 'off' | 'counties' | 'ecoregions' | 'places' = 'off';
@state() private _paneState: 'collapsed' | 'list' | 'table' = 'collapsed';

// New field — same block:
@state() private _checklistVisible = false;
```

**New event handler — copy from `_onBoundaryModeChanged`** (lines 957–971):
```typescript
// Existing handler pattern:
private _onBoundaryModeChanged(e: CustomEvent<'off' | 'counties' | 'ecoregions' | 'places'>) {
  const newMode = e.detail;
  this._boundaryMode = newMode;
  // ...
  this._replaceUrlState();
}

// New handler:
private _onChecklistLayerChanged(e: CustomEvent<{ visible: boolean }>) {
  this._checklistVisible = e.detail.visible;
  this._replaceUrlState();
}
```

**`render()` template — wire to `<bee-map>` and `<bee-pane>`** (lines 155–205):
```typescript
// Existing bee-map binding pattern (lines 155–172):
<bee-map
  .boundaryMode=${this._boundaryMode}
  .visibleIds=${this._visibleIds}
  .filterState=${this._filterState}
  @boundary-mode-changed=${this._onBoundaryModeChanged}
  ...
></bee-map>

// Add two properties + one listener:
<bee-map
  ...
  .showChecklist=${this._checklistVisible}
  .checklistTaxon=${this._filterState.taxonName}
  ...
></bee-map>

// Existing bee-pane listener pattern (lines 194–204):
<bee-pane
  ...
  @filter-changed=${this._onFilterChanged}
  @pane-expand-list=${this._onPaneExpandList}
  ...
></bee-pane>

// Add one listener:
<bee-pane
  ...
  @checklist-layer-changed=${this._onChecklistLayerChanged}
></bee-pane>
```

**`_buildCurrentParams()` — add `checklistVisible`** (lines 521–532):
```typescript
// Existing pattern:
private _buildCurrentParams(): URLSearchParams {
  return buildParams(
    this._currentView,
    this._filterState,
    { ... },
    { boundaryMode: this._boundaryMode, paneState: this._paneState }
    //               ^^ extend this object with:
    //                  checklistVisible: this._checklistVisible
  );
}
```

**`firstUpdated()` — restore from URL** (lines 221–226, follow `_boundaryMode` restore):
```typescript
// Existing restore pattern:
const initBoundaryMode = initialParams.ui?.boundaryMode ?? 'off';
const paneState = initialParams.ui?.paneState ?? 'collapsed';
this._boundaryMode = initBoundaryMode;
this._paneState = paneState;

// Add:
this._checklistVisible = initialParams.ui?.checklistVisible ?? false;
```

**`_onPopState` — restore from URL** (lines 581–582, follow same pattern):
```typescript
// Existing:
this._boundaryMode = parsed.ui?.boundaryMode ?? 'off';

// Add:
this._checklistVisible = parsed.ui?.checklistVisible ?? false;
```

**Generation guard for checklist async fetch:** The checklist fetch runs inside `bee-map`, not `bee-atlas`. `bee-atlas` does NOT need its own checklist generation counter — the counter (`_checklistGeneration`) lives in `bee-map`. This is correct per CLAUDE.md architecture invariant: `bee-atlas` owns cross-component state (`_checklistVisible`), `bee-map` owns internal map state (cached rows, generation counter).

---

### `src/bee-map.ts` — add layer, properties, fetch, and `updated()` handler

**Analog:** `src/bee-map.ts` `_applyBoundaryMode()`, `county-fill` layer, `updated()` handler

**New `@property` declarations** (lines 41–60, follow existing property block):
```typescript
// Existing property pattern:
@property({ attribute: false }) boundaryMode: 'off' | 'counties' | 'ecoregions' | 'places' = 'off';
@property({ attribute: false }) filterState: FilterState = { ... };

// New properties — add at end of @property block:
@property({ attribute: false }) showChecklist = false;
@property({ attribute: false }) checklistTaxon: string | null = null;
```

**New `@state` fields for internal map state:**
```typescript
@state() private _checklistCounties: Set<string> = new Set();
private _checklistAllRows: Array<{ county: string | null; scientificName: string; family: string; genus: string }> = [];
private _checklistGeneration = 0;
```

**`updated()` handler** (lines 310–351, follow `boundaryMode` and `filterState` pattern):
```typescript
// Existing pattern:
updated(changedProperties: PropertyValues) {
  super.updated(changedProperties);
  if (changedProperties.has('boundaryMode')) {
    this._applyBoundaryMode();
    this._applyBoundarySelection();
  }
  if (changedProperties.has('filterState')) {
    this._applyBoundarySelection();
  }
}

// Add (inside the same updated() method):
if (changedProperties.has('showChecklist') || changedProperties.has('checklistTaxon')) {
  this._applyChecklistLayer();
}
```

**Layer add in `_map.on('load')` callback** (after `place-label` layer add at ~line 563, BEFORE `ghost-points` at line 566):
```typescript
// Existing ghost-points layer add at line 566:
this._map!.addLayer({
  id: 'ghost-points',
  type: 'circle',
  source: 'occurrences-ghost',
  ...
});

// Insert BEFORE ghost-points, using beforeId:
this._map!.addLayer({
  id: 'checklist-county-fill',
  type: 'fill',
  source: 'counties',          // already added at line 402
  layout: { visibility: 'none' },
  paint: {
    'fill-color': 'rgba(44, 122, 44, 0.25)',
    'fill-outline-color': 'rgba(44, 122, 44, 0.7)',
  },
  filter: ['==', 'NAME', '__never__'],  // empty initial state — matches nothing
}, 'ghost-points');
```

**`_applyChecklistLayer()` — modeled on `_applyBoundaryMode()`** (lines 1060–1072):
```typescript
// Existing pattern:
private _applyBoundaryMode() {
  if (!this._map?.getLayer('county-fill')) return;
  const countyVis = this.boundaryMode === 'counties' ? 'visible' : 'none';
  this._map.setLayoutProperty('county-fill', 'visibility', countyVis);
  // ...
}

// New method:
private _applyChecklistLayer() {
  this._applyChecklistVisibility();
  if (this.showChecklist) {
    void this._loadChecklistData();
  }
}

private _applyChecklistVisibility() {
  if (!this._map?.getLayer('checklist-county-fill')) return;
  this._map.setLayoutProperty(
    'checklist-county-fill',
    'visibility',
    this.showChecklist ? 'visible' : 'none'
  );
}

private _applyChecklistFilter() {
  if (!this._map?.getLayer('checklist-county-fill')) return;
  const counties = [...this._checklistCounties];
  this._map.setFilter(
    'checklist-county-fill',
    counties.length > 0
      ? ['in', ['get', 'NAME'], ['literal', counties]]
      : ['==', 'NAME', '__never__']
  );
}
```

**`_loadChecklistData()` — modeled on `sqlite.ts` parquetReadObjects pattern** (lines 101–104 of sqlite.ts):
```typescript
// Existing parquetReadObjects pattern in sqlite.ts:
const resp = await fetch((await resolveDataUrl('occurrences'))!);
const buffer = await resp.arrayBuffer();
const file = { byteLength: buffer.byteLength, slice: (start: number, end: number) => buffer.slice(start, end) };
const occRows = await parquetReadObjects({ file });

// New method in bee-map.ts (import { parquetReadObjects } from 'hyparquet' at top of file):
private async _loadChecklistData(): Promise<void> {
  const generation = ++this._checklistGeneration;
  try {
    if (this._checklistAllRows.length === 0) {
      // First fetch — cache the full parsed rows
      const url = await resolveDataUrl('checklist');
      if (!url) return;
      const resp = await fetch(url);
      const buffer = await resp.arrayBuffer();
      const file = { byteLength: buffer.byteLength, slice: (s: number, e: number) => buffer.slice(s, e) };
      this._checklistAllRows = await parquetReadObjects({
        file,
        columns: ['county', 'scientificName', 'family', 'genus'],
      }) as Array<{ county: string | null; scientificName: string; family: string; genus: string }>;
    }
    if (generation !== this._checklistGeneration) return;
    // Filter by taxon rank — match against filterState.taxonRank/taxonName
    const taxon = this.checklistTaxon;
    const filtered = taxon
      ? this._checklistAllRows.filter(r => r.scientificName === taxon)
      : this._checklistAllRows;
    this._checklistCounties = new Set(filtered.map(r => r.county).filter(Boolean) as string[]);
    this._applyChecklistFilter();
  } catch (err) {
    console.warn('checklist data unavailable:', err);
  }
}
```

**Import to add at top of bee-map.ts** (line 1, follow existing import pattern):
```typescript
import { parquetReadObjects } from 'hyparquet';
```

**Note on taxon rank:** The RESEARCH.md recommends matching on all three ranks (family/genus/species) via `filterState.taxonRank`. The `checklistTaxon` property passed from `bee-atlas` is `filterState.taxonName`. To support rank-aware filtering, `bee-map` would also need `checklistTaxonRank`. The simplest approach matching RESEARCH.md recommendation is to pass both `checklistTaxon` (the name) and filter `_checklistAllRows` by checking the appropriate column based on the rank. However per the locked decisions, the initial scope can use `scientificName` matching and extend for family/genus in a follow-on. Planner should decide whether to include `checklistTaxonRank` as a second property.

---

### `src/url-state.ts` — extend `UiState` and `buildParams`/`parseParams`

**Analog:** `src/url-state.ts` `boundaryMode` and `paneState` — lines 29–235

**`UiState` interface extension** (lines 29–32):
```typescript
// Existing:
export interface UiState {
  boundaryMode: 'off' | 'counties' | 'ecoregions' | 'places';
  paneState: 'list' | 'table' | 'collapsed';
}

// Add field (make optional to avoid breaking existing test helpers):
export interface UiState {
  boundaryMode: 'off' | 'counties' | 'ecoregions' | 'places';
  paneState: 'list' | 'table' | 'collapsed';
  checklistVisible?: boolean;   // NEW — absent = false
}
```

**`buildParams()` addition** (line 73, after `if (ui.paneState !== 'collapsed') params.set('pane', ui.paneState)`):
```typescript
// Existing pattern:
if (ui.boundaryMode !== 'off') params.set('bm', ui.boundaryMode);
if (ui.paneState !== 'collapsed') params.set('pane', ui.paneState);

// Add after pane:
if (ui.checklistVisible) params.set('cl', '1');
```

**`parseParams()` addition** (lines 218–235, in the UI state block):
```typescript
// Existing pattern:
const boundaryMode: 'off' | 'counties' | 'ecoregions' | 'places' = ...;
const paneState: 'list' | 'table' | 'collapsed' = ...;
// Include UI when non-default values present
if (boundaryMode !== 'off' || paneState !== 'collapsed') {
  result.ui = { boundaryMode, paneState };
}

// Extend:
const checklistVisible = p.get('cl') === '1';
if (boundaryMode !== 'off' || paneState !== 'collapsed' || checklistVisible) {
  result.ui = { boundaryMode, paneState, checklistVisible };
}
```

---

### `src/manifest.ts` — add `checklist` key

**Analog:** `src/manifest.ts` `Manifest` interface and `DataKey` type (lines 3–24)

```typescript
// Existing Manifest interface:
interface Manifest {
  occurrences: string;
  species: string;
  seasonality: string;
  counties: string;
  ecoregions: string;
  places: string;
  places_meta: string;
  generated_at: string;
}

// Add one field:
interface Manifest {
  // ... existing fields ...
  checklist: string;      // NEW — checklist.parquet
  generated_at: string;
}

// DataKey is derived automatically: type DataKey = keyof Omit<Manifest, 'generated_at'>
// Adding 'checklist' to Manifest automatically adds it to DataKey — no further change needed.
```

---

### `scripts/make-local-manifest.js` — add `checklist` key

**Analog:** `scripts/make-local-manifest.js` lines 11–20

```javascript
// Existing JSON object written to manifest.json:
writeFileSync(outPath, JSON.stringify({
  occurrences: 'occurrences.parquet',
  species: 'species.json',
  seasonality: 'seasonality.json',
  counties: 'counties.geojson',
  ecoregions: 'ecoregions.geojson',
  places: 'places.geojson',
  places_meta: 'places.json',
  generated_at: 'local',
}, null, 2) + '\n');

// Add one entry:
  checklist: 'checklist.parquet',   // Add before generated_at
```

---

### NEW `src/tests/bee-map.test.ts` — source-text assertions for MAP-02

**Analog:** `src/tests/bee-atlas.test.ts` BOUNDARY-01 describe block (lines 187–208)

**File boilerplate** — copy header and mocks from `bee-atlas.test.ts` (lines 1–65):
```typescript
import { test, expect, describe } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(__dirname, '../bee-map.ts'), 'utf-8');
```

**No vi.mock needed** — source-text tests read the file as a string, never import it.

**Test structure — mirror BOUNDARY-01 pattern** (lines 187–208 of bee-atlas.test.ts):
```typescript
// Existing BOUNDARY-01 pattern:
describe('BOUNDARY-01: bee-map boundary layer declarations', () => {
  test('bee-map.ts contains addSource calls for counties and ecoregions with generateId', () => {
    const src = readFileSync(resolve(__dirname, '../bee-map.ts'), 'utf-8');
    expect(src).toMatch(/addSource\s*\(\s*['"]counties['"]/);
    expect(src).toMatch(/generateId\s*:\s*true/);
  });
  test('bee-map.ts contains fill and line layers for both boundary types', () => {
    expect(src).toMatch(/['"]county-fill['"]/);
  });
});

// New describe block for MAP-02:
describe('MAP-02: checklist county fill layer', () => {
  test('bee-map.ts adds checklist-county-fill layer', () => {
    expect(src).toMatch(/['"]checklist-county-fill['"]/);
  });
  test('bee-map.ts declares showChecklist @property', () => {
    expect(src).toMatch(/showChecklist/);
  });
  test('bee-map.ts declares checklistTaxon @property', () => {
    expect(src).toMatch(/checklistTaxon/);
  });
  test('bee-map.ts adds checklist layer before ghost-points (beforeId)', () => {
    expect(src).toMatch(/['"]ghost-points['"]/);
    // Both IDs appear; ghost-points must appear after checklist-county-fill in the addLayer call
    const checklistIdx = src.indexOf("'checklist-county-fill'");
    const ghostBeforeIdIdx = src.indexOf("'ghost-points'", checklistIdx);
    expect(ghostBeforeIdIdx).toBeGreaterThan(checklistIdx);
  });
  test('bee-map.ts uses parquetReadObjects for checklist fetch', () => {
    expect(src).toMatch(/parquetReadObjects/);
  });
  test('bee-map.ts has _checklistGeneration counter', () => {
    expect(src).toMatch(/_checklistGeneration/);
  });
  test('bee-map.ts calls resolveDataUrl with checklist key', () => {
    expect(src).toMatch(/resolveDataUrl\s*\(\s*['"]checklist['"]/);
  });
  test('bee-map.ts uses setLayoutProperty to toggle checklist layer visibility', () => {
    expect(src).toMatch(/setLayoutProperty[\s\S]{0,100}checklist-county-fill/);
  });
});
```

---

### `src/tests/bee-pane.test.ts` — extend for MAP-01

**Analog:** `src/tests/bee-pane.test.ts` PANE-05 describe block (lines 148–219) — source-text test pattern

**Test structure to add** (new `describe` at end of file):
```typescript
// Existing source-text pattern:
const src = readFileSync(resolve(__dirname, '../bee-pane.ts'), 'utf-8');

describe('MAP-01: checklist toggle in filter panel', () => {
  test('bee-pane.ts has _showChecklist @state field', () => {
    expect(src).toMatch(/_showChecklist/);
  });
  test('bee-pane.ts defines _renderShow method', () => {
    expect(src).toMatch(/_renderShow\s*\(/);
  });
  test('bee-pane.ts renders "Checklist records" label text', () => {
    expect(src).toMatch(/Checklist records/);
  });
  test('bee-pane.ts dispatches checklist-layer-changed event', () => {
    expect(src).toMatch(/new CustomEvent\(['"]checklist-layer-changed['"]/);
  });
  test('bee-pane.ts _renderShow uses aria-label for checkbox', () => {
    expect(src).toMatch(/aria-label=["']Show checklist county records on map["']/);
  });
  test('bee-pane.ts calls _renderShow inside _renderListContent', () => {
    const listContentBody = src.match(/_renderListContent\s*\([^)]*\)[^{]*\{[\s\S]*?\n\s{0,4}\}/);
    expect(listContentBody).not.toBeNull();
    expect(listContentBody![0]).toMatch(/this\._renderShow\s*\(\)/);
  });
});
```

---

### `src/tests/url-state.test.ts` — extend for MAP-04

**Analog:** `src/tests/url-state.test.ts` `boundaryMode` tests (lines 79–98) — exact same pattern

**`defaultUi` constant:** Currently `{ boundaryMode: 'off' as const, paneState: 'collapsed' as const }` at line 24. Since `checklistVisible` is optional in `UiState`, this constant needs no change.

**Test structure to add** (new `describe` at end of file):
```typescript
// Existing pattern from lines 79-90:
test('boundaryMode=counties: serialized as bm=counties', () => {
  const ui = { boundaryMode: 'counties' as const, paneState: 'collapsed' as const };
  const params = buildParams(defaultView, emptyFilter(), defaultSelection, ui);
  expect(params.get('bm')).toBe('counties');
  const result = parseParams(params.toString());
  expect(result.ui?.boundaryMode).toBe('counties');
});
test('boundaryMode=off (default): bm param is absent', () => {
  const params = buildParams(defaultView, emptyFilter(), defaultSelection, defaultUi);
  expect(params.has('bm')).toBe(false);
});

// New describe block for MAP-04:
describe('MAP-04: checklist layer URL param (cl=1)', () => {
  test('checklistVisible=true: cl param is "1"', () => {
    const ui = { boundaryMode: 'off' as const, paneState: 'collapsed' as const, checklistVisible: true };
    const params = buildParams(defaultView, emptyFilter(), defaultSelection, ui);
    expect(params.get('cl')).toBe('1');
  });
  test('checklistVisible=false (default): cl param is absent', () => {
    const params = buildParams(defaultView, emptyFilter(), defaultSelection, defaultUi);
    expect(params.has('cl')).toBe(false);
  });
  test('cl=1 parses to checklistVisible: true in result.ui', () => {
    const result = parseParams('cl=1');
    expect(result.ui?.checklistVisible).toBe(true);
  });
  test('cl absent: checklistVisible is absent or false in result.ui', () => {
    const result = parseParams('bm=counties');
    expect(result.ui?.checklistVisible ?? false).toBe(false);
  });
  test('cl=1 + bm=counties: both round-trip together', () => {
    const ui = { boundaryMode: 'counties' as const, paneState: 'collapsed' as const, checklistVisible: true };
    const params = buildParams(defaultView, emptyFilter(), defaultSelection, ui);
    const result = parseParams(params.toString());
    expect(result.ui?.boundaryMode).toBe('counties');
    expect(result.ui?.checklistVisible).toBe(true);
  });
  test('cl=0 (not "1"): checklistVisible is false', () => {
    const result = parseParams('cl=0');
    expect(result.ui?.checklistVisible ?? false).toBe(false);
  });
});
```

---

## Shared Patterns

### `@state` + `@property` Declaration (Lit)
**Source:** `src/bee-map.ts` lines 41–60; `src/bee-atlas.ts` lines 19–58
**Apply to:** `bee-pane.ts` (`_showChecklist`), `bee-atlas.ts` (`_checklistVisible`), `bee-map.ts` (`showChecklist`, `checklistTaxon`)
```typescript
// @state for internal component state (triggers re-render, not exposed to parent):
@state() private _checklistVisible = false;
// @property for parent-passed input (Lit property binding, no attribute reflection):
@property({ attribute: false }) showChecklist = false;
@property({ attribute: false }) checklistTaxon: string | null = null;
```

### Custom Event Dispatch (bubbles + composed)
**Source:** `src/bee-pane.ts` lines 550–570 (`_emitFilter`, `_onToggle`)
**Apply to:** `bee-pane.ts` `_onChecklistChange`
```typescript
this.dispatchEvent(new CustomEvent('checklist-layer-changed', {
  bubbles: true, composed: true,
  detail: { visible },
}));
```

### `updated(changedProperties)` Reactive Handler
**Source:** `src/bee-map.ts` lines 310–351; `src/bee-pane.ts` lines 499–548
**Apply to:** `bee-map.ts` checklist layer update trigger
```typescript
updated(changedProperties: PropertyValues) {
  super.updated(changedProperties);
  if (changedProperties.has('showChecklist') || changedProperties.has('checklistTaxon')) {
    this._applyChecklistLayer();
  }
  // ...existing handlers unchanged...
}
```

### `setLayoutProperty` Visibility Toggle
**Source:** `src/bee-map.ts` `_applyBoundaryMode()` lines 1060–1072
**Apply to:** `bee-map.ts` `_applyChecklistVisibility()`
```typescript
private _applyBoundaryMode() {
  if (!this._map?.getLayer('county-fill')) return;
  this._map.setLayoutProperty('county-fill', 'visibility', countyVis);
  // ...
}
// Pattern: guard with getLayer check, then setLayoutProperty
```

### `parquetReadObjects` Fetch Pattern
**Source:** `src/sqlite.ts` lines 101–104
**Apply to:** `bee-map.ts` `_loadChecklistData()`
```typescript
const resp = await fetch(url);
const buffer = await resp.arrayBuffer();
const file = { byteLength: buffer.byteLength, slice: (start: number, end: number) => buffer.slice(start, end) };
const rows = await parquetReadObjects({ file, columns: ['county', 'scientificName', 'family', 'genus'] });
```

### Generation Guard for Async Operations
**Source:** `src/bee-atlas.ts` `_runFilterQuery()` lines 311–318
**Apply to:** `bee-map.ts` `_loadChecklistData()`
```typescript
private async _runFilterQuery(): Promise<void> {
  const generation = ++this._filterQueryGeneration;
  const result = await queryVisibleIds(this._filterState);
  if (generation !== this._filterQueryGeneration) return;  // discard stale result
  // ...commit result...
}
```

### Source-Text Test Pattern
**Source:** `src/tests/bee-pane.test.ts` lines 23–33; `src/tests/bee-atlas.test.ts` lines 99–115
**Apply to:** NEW `src/tests/bee-map.test.ts`
```typescript
// Read source as string — no imports, no mocks needed for source-text tests:
const src = readFileSync(resolve(__dirname, '../bee-map.ts'), 'utf-8');
// Assertions use toMatch with regex or string:
expect(src).toMatch(/['"]checklist-county-fill['"]/);
```

### URL Param Encode/Decode Pattern
**Source:** `src/url-state.ts` lines 72–74 (`buildParams`), lines 218–235 (`parseParams`)
**Apply to:** `url-state.ts` `cl=1` param
```typescript
// buildParams: omit param entirely when default (false)
if (ui.boundaryMode !== 'off') params.set('bm', ui.boundaryMode);
// Equivalent for checklist:
if (ui.checklistVisible) params.set('cl', '1');

// parseParams: parse and include in ui only when non-default
if (boundaryMode !== 'off' || paneState !== 'collapsed') {
  result.ui = { boundaryMode, paneState };
}
// Extended:
if (boundaryMode !== 'off' || paneState !== 'collapsed' || checklistVisible) {
  result.ui = { boundaryMode, paneState, checklistVisible };
}
```

---

## No Analog Found

All files have close analogs in the codebase. No files require falling back to RESEARCH.md patterns exclusively.

---

## Key Warnings for Planner

1. **`UiState.checklistVisible` should be optional (`checklistVisible?: boolean`)** to avoid TypeScript errors in the 12+ existing test calls that construct `defaultUi = { boundaryMode: 'off', paneState: 'collapsed' }` without the new field. Making it optional (treat absent as `false`) is simpler than updating every test fixture.

2. **`bee-atlas.ts` `_buildCurrentParams()` must pass `checklistVisible: this._checklistVisible`** in the UiState argument. There is only one call site for `buildParams` in `bee-atlas.ts` — it is the `_buildCurrentParams()` method at line 521.

3. **`bee-map.ts` needs `import { parquetReadObjects } from 'hyparquet'`** at the top. The existing import block at lines 1–11 does not include hyparquet — this is a new import, but the package is already in `node_modules`.

4. **`_renderShow()` must be called from `_renderListContent()`** — the spec places it as a 5th filter row after `_renderWhen()`. The `_renderListContent()` method at line 1065 currently calls four render methods; add `${this._renderShow()}` as the fifth.

5. **The `speicmenLayer` typo in `bee-map.ts` is intentionally deferred** per CLAUDE.md — do not fix incidentally.

6. **Taxon rank filtering for checklist:** The simple approach is to match `scientificName === checklistTaxon` for species, and add `family === checklistTaxon` / `genus === checklistTaxon` when `taxonRank` is passed as a second property. To support rank-aware filtering, planner should add `checklistTaxonRank` as a third property alongside `checklistTaxon`.

---

## Metadata

**Analog search scope:** `src/`, `src/tests/`, `scripts/`
**Files scanned:** 9 source files read in full
**Pattern extraction date:** 2026-05-24
