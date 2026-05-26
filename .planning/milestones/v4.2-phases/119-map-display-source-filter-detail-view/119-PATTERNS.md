# Phase 119: Map Display, Source Filter & Detail View — Pattern Map

**Mapped:** 2026-05-25
**Files analyzed:** 9 (6 source + 3 test)
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/filter.ts` | model/type-def | transform | `src/filter.ts` (self — additive) | exact |
| `src/url-state.ts` | utility | request-response | `src/url-state.ts` (self — extend `cl` param precedent) | exact |
| `src/bee-pane.ts` | component | event-driven | `src/bee-pane.ts` `_renderShow()` / `_onChecklistChange` | exact |
| `src/bee-map.ts` | component | event-driven | `src/bee-map.ts` `_applySelection()` / `updated()` | exact |
| `src/bee-atlas.ts` | component/coordinator | event-driven | `src/bee-atlas.ts` `_onChecklistLayerChanged` / `_buildCurrentParams` | exact |
| `src/bee-occurrence-detail.ts` | component | request-response | `src/bee-occurrence-detail.ts` `_renderSampleOnly` / `_renderProvisional` | exact |
| `src/tests/url-state.test.ts` | test | — | `src/tests/url-state.test.ts` `cl=1` describe block (lines 266–300) | exact |
| `src/tests/bee-atlas.test.ts` | test | — | `src/tests/bee-atlas.test.ts` ARCH-02/ARCH-03 source-inspection pattern | exact |
| `src/tests/bee-pane.test.ts` | test | — | `src/tests/bee-pane.test.ts` source-inspection pattern | exact |

---

## Pattern Assignments

### `src/filter.ts` — extend OccurrenceRow and OCCURRENCE_COLUMNS

**Analog:** `src/filter.ts` lines 26–66 (self, additive)

**Existing interface tail** (lines 50–57 — insert new fields after `sample_host`):
```typescript
  sample_id: number | null;
  sample_host: string | null;
  // NEW fields — all nullable (null in pre-Phase-118 parquet):
  source: 'ecdysis' | 'waba_sample' | 'inat_obs' | null;
  image_url: string | null;
  obs_url: string | null;
  user_login: string | null;
  license: string | null;
}
```

**Existing OCCURRENCE_COLUMNS tail** (lines 59–66 — append new names):
```typescript
export const OCCURRENCE_COLUMNS = [
  'lat', 'lon', 'date', 'county', 'ecoregion_l3', 'place_slug',
  // ... existing 26 columns ...
  'is_provisional', 'specimen_inat_taxon_name', 'specimen_inat_quality_grade',
  // NEW — append these five:
  'source', 'image_url', 'obs_url', 'user_login', 'license',
] as const;
```

**Why `as const` matters:** The `OCCURRENCE_COLUMNS` array is used as `OCCURRENCE_COLUMNS.join(', ')` in every SQL SELECT in `filter.ts`. Adding columns here automatically adds them to all query projections AND to the GeoJSON feature property spread in `features.ts` (which does `...obj` over the row). No change to `features.ts` needed.

---

### `src/url-state.ts` — add `src` param to UiState / buildParams / parseParams

**Analog:** `src/url-state.ts` — `checklistVisible` / `cl=1` pattern (lines 29–33, 76–77, 234–238)

**Existing UiState** (lines 29–33 — add one field):
```typescript
export interface UiState {
  boundaryMode: 'off' | 'counties' | 'ecoregions' | 'places';
  paneState: 'list' | 'table' | 'collapsed';
  checklistVisible?: boolean;
  hiddenSources?: Set<'ecdysis' | 'waba_sample' | 'inat_obs'>;  // NEW
}
```

**buildParams — existing `cl` serialization pattern** (line 76 — add analogous block after):
```typescript
if (ui.checklistVisible) params.set('cl', '1');
// NEW — add after:
if (ui.hiddenSources && ui.hiddenSources.size > 0) {
  params.set('src', [...ui.hiddenSources].sort().join(','));
}
```

**parseParams — existing `cl` parse + ui condition** (lines 234–238 — extend both):
```typescript
// Existing:
const checklistVisible = p.get('cl') === '1';
// NEW — add after:
const VALID_SOURCES = new Set(['ecdysis', 'waba_sample', 'inat_obs']);
const srcRaw = p.get('src') ?? '';
const hiddenSources = srcRaw
  ? new Set(srcRaw.split(',').filter(s => VALID_SOURCES.has(s)) as Array<'ecdysis'|'waba_sample'|'inat_obs'>)
  : undefined;

// Existing condition (line 236) — extend:
if (boundaryMode !== 'off' || paneState !== 'collapsed' || checklistVisible
    || (hiddenSources && hiddenSources.size > 0)) {    // NEW condition
  result.ui = { boundaryMode, paneState, checklistVisible, hiddenSources };  // NEW field
}
```

---

### `src/bee-pane.ts` — add Sources filter row

**Analog:** `src/bee-pane.ts` — `_renderShow()` (lines 1081–1099), `_onChecklistChange` (lines 599–606), `updated()` checklistVisible sync (lines 503–506)

**Property + state declarations** (following existing pattern at lines 79/109):
```typescript
// After existing @property({ attribute: false }) checklistVisible = false; (line 79):
@property({ attribute: false }) hiddenSources: Set<string> = new Set();

// After existing @state() private _showChecklist = false; (line 109):
@state() private _hiddenSources: Set<string> = new Set();
```

**updated() sync** (following lines 503–506 pattern — add inside existing `updated()`):
```typescript
// Existing (lines 503-506):
updated(changed: PropertyValues) {
  if (changed.has('checklistVisible') && this._showChecklist !== this.checklistVisible) {
    this._showChecklist = this.checklistVisible;
  }
  // NEW — add after:
  if (changed.has('hiddenSources')) {
    this._hiddenSources = new Set(this.hiddenSources);
  }
  // ... existing filterState sync continues ...
```

**Event dispatch pattern** (exact copy of `_onChecklistChange` structure at lines 599–606):
```typescript
private _onSourceToggle(sourceValue: string, checked: boolean) {
  const next = new Set(this._hiddenSources);
  if (checked) next.delete(sourceValue);
  else next.add(sourceValue);
  this._hiddenSources = next;
  this.dispatchEvent(new CustomEvent('source-filter-changed', {
    bubbles: true, composed: true,
    detail: { hiddenSources: next },
  }));
}
```

**_renderSources() method** (follows `_renderShow()` structure at lines 1081–1099):
```typescript
private _renderSources() {
  const sources: Array<{ value: string; label: string }> = [
    { value: 'ecdysis',    label: 'Ecdysis specimens' },
    { value: 'waba_sample', label: 'WABA samples' },
    { value: 'inat_obs',   label: 'iNat expert obs' },
  ];
  return html`
    <div class="filter-row">
      <svg class="row-icon" width="16" height="16" viewBox="0 0 16 16" fill="none"
           stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <!-- layers icon: two stacked polygons -->
        <polygon points="8,2 14,5.5 8,9 2,5.5"/>
        <polyline points="2,8.5 8,12 14,8.5"/>
      </svg>
      <div class="year-row">
        ${sources.map(s => html`
          <label class="year-label">
            <input type="checkbox"
              .checked=${!this._hiddenSources.has(s.value)}
              aria-label="${s.label}"
              @change=${(e: Event) => this._onSourceToggle(s.value, (e.target as HTMLInputElement).checked)}
            />
            ${s.label}
          </label>
        `)}
      </div>
    </div>
  `;
}
```

**In `_renderListContent()`** (after `${this._renderShow()}` at line 1118):
```typescript
${this._renderShow()}
${this._renderSources()}   // NEW
```

**Empty state when all sources hidden** (in the `listRows.length === 0` branch at lines 1130–1132):
```typescript
this.listLoading
  ? html`<div class="list-placeholder">Loading…</div>`
  : this._hiddenSources.size === 3
    ? html`<div class="panel-content"><p class="hint">No sources selected. Enable at least one source above.</p></div>`  // NEW
    : this.listRows.length === 0
      ? html`<div class="panel-content"><p class="hint">Click a point on the map to see details.</p></div>`
      : html`<bee-occurrence-detail .occurrences=${this.listRows}></bee-occurrence-detail>`
```

---

### `src/bee-map.ts` — add hiddenSources property + _applySourceFilter()

**Analog:** `src/bee-map.ts` — `@property visibleIds` (line 44), `updated()` (lines 320–366), `_applySelection()` (lines 870–886), `unclustered-point` paint (lines 656–672)

**Property declaration** (following existing `@property` pattern at lines 43–49):
```typescript
// After @property({ attribute: false }) showChecklist = false; (line 64):
@property({ attribute: false }) hiddenSources: Set<string> = new Set();
```

**updated() entry** (following `changedProperties.has('selectedOccIds')` pattern at lines 329–332 — add after checklist block at line 365):
```typescript
if (changedProperties.has('hiddenSources')) {
  this._applySourceFilter();
}
```

**_applySourceFilter() method** (modeled on `_applySelection()` pattern at lines 870–886):
```typescript
private _applySourceFilter() {
  if (!this._map?.getLayer('unclustered-point')) return;

  if (this.hiddenSources.size === 0) {
    // All sources visible — restore default filter (no source restriction)
    this._map.setFilter('unclustered-point', ['!', ['has', 'point_count']]);
  } else {
    const hidden = [...this.hiddenSources];
    this._map.setFilter('unclustered-point', [
      'all',
      ['!', ['has', 'point_count']],
      ['!', ['in', ['get', 'source'], ['literal', hidden]]],
    ]);
  }
}
```

**iNat obs amber color — existing `unclustered-point` paint** (lines 661–667 — wrap with `case`):
```typescript
// BEFORE (lines 662-667):
'circle-color': [
  'match', ['get', 'recencyTier'],
  'thisYear', RECENCY_COLORS.thisYear,
  'lastYear', RECENCY_COLORS.lastYear,
  RECENCY_COLORS.earlier,
],

// AFTER — `case` is outermost (source check first, falls through to recencyTier match):
'circle-color': [
  'case',
  ['==', ['get', 'source'], 'inat_obs'], '#e8a020',   // amber for iNat obs
  ['match', ['get', 'recencyTier'],                   // recency tiers for ecdysis/waba
    'thisYear', RECENCY_COLORS.thisYear,
    'lastYear', RECENCY_COLORS.lastYear,
    RECENCY_COLORS.earlier,
  ],
],
```

**Apply on map load** (following `_applySelection()` call in the `map.on('load')` callback at line 743 — add analogous call):
```typescript
// In the firstUpdated map.on('load') callback, after existing initial-state restores:
if (this.hiddenSources.size > 0) {
  this._applySourceFilter();
}
```

---

### `src/bee-atlas.ts` — own _hiddenSources state, wire event, URL round-trip

**Analog:** `src/bee-atlas.ts` — `_checklistVisible` (line 232), `_onChecklistLayerChanged` (lines 965–968), `_buildCurrentParams` (lines 528–539), `firstUpdated` URL restore block (lines 227–232), `_onPopState` UI restore (lines 587–589)

**State declaration** (following `_checklistVisible` pattern):
```typescript
// After @state() private _checklistVisible = false;
@state() private _hiddenSources: Set<string> = new Set();
```

**_buildCurrentParams() — pass new field** (line 537 — extend ui object literal):
```typescript
// BEFORE:
{ boundaryMode: this._boundaryMode, paneState: this._paneState, checklistVisible: this._checklistVisible }
// AFTER:
{ boundaryMode: this._boundaryMode, paneState: this._paneState, checklistVisible: this._checklistVisible, hiddenSources: this._hiddenSources }
```

**firstUpdated URL restore** (following line 232 pattern):
```typescript
// Existing (line 232):
this._checklistVisible = initialParams.ui?.checklistVisible ?? false;
// NEW — add on next line:
this._hiddenSources = initialParams.ui?.hiddenSources ?? new Set();
```

**_onPopState UI restore** (following lines 588–589 pattern):
```typescript
// Existing (lines 588-589):
this._boundaryMode = parsed.ui?.boundaryMode ?? 'off';
this._checklistVisible = parsed.ui?.checklistVisible ?? false;
// NEW — add after:
this._hiddenSources = parsed.ui?.hiddenSources ?? new Set();
```

**Event handler** (exact `_onChecklistLayerChanged` structure at lines 965–968):
```typescript
private _onSourceFilterChanged(e: CustomEvent<{ hiddenSources: Set<string> }>) {
  this._hiddenSources = e.detail.hiddenSources;
  this._replaceUrlState();
}
```

**render() bindings** (following existing `.checklistVisible=${this._checklistVisible}` and `@checklist-layer-changed` at line 200):
```typescript
// On bee-pane element — add alongside existing checklist bindings:
.hiddenSources=${this._hiddenSources}
@source-filter-changed=${this._onSourceFilterChanged}

// On bee-map element — add alongside existing properties:
.hiddenSources=${this._hiddenSources}
```

---

### `src/bee-occurrence-detail.ts` — add _renderInatObs() branch

**Analog:** `src/bee-occurrence-detail.ts` — `_renderSampleOnly` (lines 207–224), `_renderProvisional` (lines 226–245), `render()` dispatch (lines 247–263)

**_renderInatObs() method** (copy `_renderSampleOnly` structure, lines 207–224):
```typescript
private _renderInatObs(row: OccurrenceRow) {
  const isCC = row.license != null && row.license.toUpperCase().startsWith('CC');
  return html`
    <div class="panel-content sample-dot-detail">
      <div class="event-date">${formatRomanDate(row.date)}</div>
      ${row.user_login != null
        ? html`<div class="event-observer">${row.user_login}</div>` : ''}
      ${row.floralHost != null
        ? html`<div class="event-host"><em>${row.floralHost}</em></div>` : ''}
      ${isCC && row.image_url != null ? html`
        <img
          src="${row.image_url}"
          alt="Photo of ${row.scientificName ?? 'bee'} by ${row.user_login ?? 'observer'} on iNaturalist"
          style="width:100%;max-height:200px;object-fit:cover;border-radius:4px;"
        />
      ` : ''}
      ${row.obs_url != null ? html`
        <div class="event-inat">
          <a href="${row.obs_url}" target="_blank" rel="noopener">View on iNaturalist</a>
        </div>
      ` : ''}
    </div>
  `;
}
```

**render() dispatch update** (existing dispatch at lines 257–261 — add third branch):
```typescript
// BEFORE:
${nonSpecimen.map(row =>
  isProvisional(row)
    ? this._renderProvisional(row)
    : this._renderSampleOnly(row)
)}

// AFTER — add inat_obs branch before sample-only fallback:
${nonSpecimen.map(row =>
  isProvisional(row)
    ? this._renderProvisional(row)
    : row.source === 'inat_obs'
      ? this._renderInatObs(row)
      : this._renderSampleOnly(row)
)}
```

**CSS additions** (follow existing class patterns in static styles):
- `.event-host` — no existing class; add: `font-size: 0.8rem; color: var(--text-hint);` (matches `.event-observer`)

---

### `src/tests/url-state.test.ts` — MAP-03 tests for `src` param

**Analog:** Existing `MAP-04: checklist layer URL param (cl=1)` describe block (lines 266–300)

**Test structure to copy and adapt** (lines 266–300 — replace `cl`/`checklistVisible` references with `src`/`hiddenSources`):
```typescript
describe('MAP-03: source filter URL param (src=)', () => {
  test('hiddenSources single value: src param is "ecdysis"', () => {
    const ui = { boundaryMode: 'off' as const, paneState: 'collapsed' as const,
                 hiddenSources: new Set(['ecdysis'] as const) };
    const params = buildParams(defaultView, emptyFilter(), defaultSelection, ui);
    expect(params.get('src')).toBe('ecdysis');
  });

  test('hiddenSources empty (default): src param is absent', () => {
    const params = buildParams(defaultView, emptyFilter(), defaultSelection, defaultUi);
    expect(params.has('src')).toBe(false);
  });

  test('src=ecdysis parses to hiddenSources Set in result.ui', () => {
    const result = parseParams('src=ecdysis');
    expect(result.ui?.hiddenSources).toEqual(new Set(['ecdysis']));
  });

  test('multiple hidden sources sort alphabetically in param', () => {
    const ui = { boundaryMode: 'off' as const, paneState: 'collapsed' as const,
                 hiddenSources: new Set(['inat_obs', 'ecdysis'] as const) };
    const params = buildParams(defaultView, emptyFilter(), defaultSelection, ui);
    expect(params.get('src')).toBe('ecdysis,inat_obs');
  });

  test('invalid source value in src= is filtered out', () => {
    const result = parseParams('src=ecdysis,bogus_source');
    expect(result.ui?.hiddenSources).toEqual(new Set(['ecdysis']));
  });

  test('src=ecdysis alone triggers result.ui (hasFilter condition)', () => {
    const result = parseParams('src=ecdysis');
    expect(result.ui).toBeDefined();
  });
});
```

---

### `src/tests/bee-atlas.test.ts` — MAP-01 and DET-01 source-inspection tests

**Analog:** Existing ARCH-02/ARCH-03 source-inspection pattern (lines 89–123) — `readFileSync` + `expect(src).toMatch()`

**Test structure to copy** (lines 89–95 — same `readFileSync` approach):
```typescript
describe('MAP-01: iNat obs amber color in unclustered-point paint', () => {
  const src = readFileSync(resolve(__dirname, '../bee-map.ts'), 'utf-8');
  test('bee-map.ts contains amber color #e8a020 in paint', () => {
    expect(src).toMatch(/#e8a020/);
  });
  test('bee-map.ts uses case expression with source check before recencyTier match', () => {
    expect(src).toMatch(/'case'/);
    expect(src).toMatch(/\['==', \['get', 'source'\], 'inat_obs'\]/);
  });
});

describe('DET-01: _renderInatObs dispatched for source=inat_obs', () => {
  const src = readFileSync(resolve(__dirname, '../bee-occurrence-detail.ts'), 'utf-8');
  test('bee-occurrence-detail.ts declares _renderInatObs method', () => {
    expect(src).toMatch(/_renderInatObs\s*\(/);
  });
  test('bee-occurrence-detail.ts checks source === inat_obs in render dispatch', () => {
    expect(src).toMatch(/row\.source\s*===\s*['"]inat_obs['"]/);
  });
});

describe('MAP-02: source-filter-changed event in bee-atlas', () => {
  const src = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');
  test('bee-atlas.ts handles source-filter-changed event', () => {
    expect(src).toMatch(/source-filter-changed/);
  });
  test('bee-atlas.ts declares _hiddenSources state', () => {
    expect(src).toMatch(/_hiddenSources/);
  });
});
```

---

### `src/tests/bee-pane.test.ts` — MAP-02 source toggle tests

**Analog:** Existing PANE-01/PANE-02 source-inspection pattern (lines 23–52)

```typescript
describe('MAP-02: source filter row in bee-pane', () => {
  // src already loaded at top of file: readFileSync(resolve(__dirname, '../bee-pane.ts'), 'utf-8')
  test('bee-pane.ts declares hiddenSources @property', () => {
    expect(src).toMatch(/@property[\s\S]{0,50}hiddenSources/);
  });
  test('bee-pane.ts dispatches source-filter-changed event', () => {
    expect(src).toMatch(/new CustomEvent\(['"]source-filter-changed['"]/);
  });
  test('bee-pane.ts contains _renderSources method', () => {
    expect(src).toMatch(/_renderSources\s*\(/);
  });
  test('bee-pane.ts has checkbox for ecdysis source', () => {
    expect(src).toMatch(/ecdysis/);
  });
  test('bee-pane.ts has checkbox for inat_obs source', () => {
    expect(src).toMatch(/inat_obs/);
  });
  test('bee-pane.ts has checkbox for waba_sample source', () => {
    expect(src).toMatch(/waba_sample/);
  });
});
```

---

## Shared Patterns

### Custom Event Dispatch (bubbles + composed)
**Source:** `src/bee-pane.ts` lines 561–577 (`_emitFilter`), lines 599–606 (`_onChecklistChange`)
**Apply to:** `_onSourceToggle` in `bee-pane.ts`
```typescript
this.dispatchEvent(new CustomEvent('event-name', {
  bubbles: true, composed: true,
  detail: { ... },
}));
```

### `@property({ attribute: false })` + `@state()` local mirror
**Source:** `src/bee-pane.ts` lines 79 + 109 (`checklistVisible` / `_showChecklist`)
**Apply to:** `hiddenSources` / `_hiddenSources` pair in `bee-pane.ts`

### `updated(changedProperties)` guard pattern
**Source:** `src/bee-map.ts` lines 320–366 (every `if (changedProperties.has(...))` block)
**Apply to:** `hiddenSources` change detection in `bee-map.ts` `updated()`

### `!this._map?.getLayer(layerId) return;` guard
**Source:** `src/bee-map.ts` line 871 (`_applySelection`)
**Apply to:** `_applySourceFilter()` guard at top
```typescript
if (!this._map?.getLayer('unclustered-point')) return;
```

### `_replaceUrlState()` after state mutation
**Source:** `src/bee-atlas.ts` lines 965–968 (`_onChecklistLayerChanged`)
**Apply to:** `_onSourceFilterChanged` handler

### URL restore: `?? default` nullish coalescing
**Source:** `src/bee-atlas.ts` lines 228–232 (`firstUpdated`) and 587–589 (`_onPopState`)
**Apply to:** `_hiddenSources` restore in both sites:
```typescript
this._hiddenSources = initialParams.ui?.hiddenSources ?? new Set();
```

---

## No Analog Found

All files have close existing analogs. No new patterns need to be sourced from RESEARCH.md alone.

---

## Metadata

**Analog search scope:** `src/` (all TypeScript source files)
**Files scanned:** `filter.ts`, `url-state.ts`, `bee-pane.ts`, `bee-map.ts`, `bee-atlas.ts`, `bee-occurrence-detail.ts`, `src/tests/url-state.test.ts`, `src/tests/bee-atlas.test.ts`, `src/tests/bee-pane.test.ts`
**Pattern extraction date:** 2026-05-25
