# Phase 107: create-bee-pane-component — Pattern Map

**Mapped:** 2026-05-19
**Files analyzed:** 2 (new files)
**Analogs found:** 2 / 2

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/bee-pane.ts` | component (presenter) | request-response + event-driven | `src/bee-filter-panel.ts` (filter logic); `src/bee-sidebar.ts` (layout shell) | exact (copy-merge) |
| `src/tests/bee-pane.test.ts` | test | — | `src/tests/bee-sidebar.test.ts` (source-scan tests); `src/tests/bee-atlas.test.ts` (describe structure + mocks) | exact |

---

## Pattern Assignments

### `src/bee-pane.ts` (presenter component, event-driven)

**Primary analog:** `src/bee-filter-panel.ts` (filter logic, internal state, `updated()` sync, event dispatch)
**Secondary analog:** `src/bee-sidebar.ts` (layout shell, CSS variables, box-shadow, close-button pattern)

---

#### Imports pattern

Copy the import block from `src/bee-filter-panel.ts` lines 1–7, replacing the class name and removing the `DataSummary`/`TaxonOption`/`FilterChangedEvent` re-exports (those stay in `bee-sidebar.ts`):

```typescript
// src/bee-filter-panel.ts lines 1-7
import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { isFilterActive } from './filter.ts';
import type { FilterState, CollectorEntry } from './filter.ts';
import type { DataSummary, TaxonOption, FilterChangedEvent } from './bee-sidebar.ts';
import { resolveDataUrl } from './manifest.ts';
```

Also import the sub-components used in `bee-pane`'s template (neither is imported in `bee-filter-panel.ts`):

```typescript
import './bee-occurrence-detail.ts';
import './bee-table.ts';
```

Also copy year-bucket helpers verbatim from `bee-filter-panel.ts` lines 10–36 (pure functions, no changes needed).

Copy suggestion type aliases from `bee-filter-panel.ts` lines 40–43:

```typescript
// src/bee-filter-panel.ts lines 40-43
interface TaxonSug    { kind: 'taxon';     label: string; name: string; rank: 'family' | 'genus' | 'species' }
interface CollectorSug { kind: 'collector'; label: string; entry: CollectorEntry }
interface WhereSug    { kind: 'where';     label: string; type: 'county' | 'ecoregion' | 'place'; value: string }
type AnyS = TaxonSug | CollectorSug | WhereSug;
```

---

#### @customElement and @property declarations

From `src/bee-filter-panel.ts` lines 47–59, adapt the class name and add `paneState` + table properties; remove `hideButton`, `externalOpen`, `openUpward` (these are pane-internal mechanics that do not appear on `bee-pane`'s public API):

```typescript
// src/bee-filter-panel.ts lines 47-59 (adapted)
@customElement('bee-pane')
export class BeePane extends LitElement {
  // Pane control
  @property({ attribute: false }) paneState: 'collapsed' | 'list' | 'table' = 'collapsed';

  // Filter data (same as bee-filter-panel)
  @property({ attribute: false }) filterState!: FilterState;
  @property({ attribute: false }) taxaOptions: TaxonOption[] = [];
  @property({ attribute: false }) countyOptions: string[] = [];
  @property({ attribute: false }) ecoregionOptions: string[] = [];
  @property({ attribute: false }) collectorOptions: CollectorEntry[] = [];
  @property({ attribute: false }) summary: DataSummary | null = null;
  @property({ attribute: false }) specimenCount: number | null = null;

  // Occurrence detail (from bee-sidebar)
  @property({ attribute: false }) occurrences: OccurrenceRow[] | null = null;

  // Table-specific (from bee-atlas render, lines 196-202)
  @property({ attribute: false }) rows: OccurrenceRow[] = [];
  @property({ attribute: false }) rowCount = 0;
  @property({ attribute: false }) page = 1;
  @property({ attribute: false }) loading = false;
  @property({ attribute: false }) sortBy: SpecimenSortBy = 'date';
  @property({ attribute: false }) filterActive = false;
  @property({ attribute: false }) selectedIds: Set<string> | null = null;
```

Also need `import type { OccurrenceRow, SpecimenSortBy } from './filter.ts';` in the imports.

---

#### Internal @state declarations

Copy verbatim from `src/bee-filter-panel.ts` lines 61–91. No changes needed — these are the filter UI internal states:

```typescript
// src/bee-filter-panel.ts lines 61-91
@state() private _open = false;

// Taxon (single-select)
@state() private _taxonInput = '';
@state() private _selectedTaxon: { name: string; rank: 'family' | 'genus' | 'species' } | null = null;

// Collector (multi-select)
@state() private _collectorInput = '';
@state() private _selectedCollectors: CollectorEntry[] = [];

// Where (multi-select)
@state() private _whereInput = '';
@state() private _selectedCounties: Set<string> = new Set();
@state() private _selectedEcoregions: Set<string> = new Set();
@state() private _selectedPlace: string | null = null;
@state() private _placeNameBySlug: Map<string, string> = new Map();
private _placeOptions: { slug: string; name: string }[] = [];

// Elevation
@state() private _elevMin: number | null = null;
@state() private _elevMax: number | null = null;

// Year buckets (all true = no year filter)
@state() private _yearThisYear = true;
@state() private _yearLastYear = true;
@state() private _yearEarlier = true;

// Suggestion dropdown
@state() private _openSection: 'taxon' | 'collector' | 'where' | null = null;
@state() private _suggestions: AnyS[] = [];
@state() private _highlightIndex = -1;
```

---

#### static styles — :host and container

`:host` should declare `position: absolute` only (top/right/etc. come from `bee-atlas`). CSS variables and spacing must use `var(--token)`. Box-shadow from `bee-sidebar.ts` lines 56–59:

```typescript
// src/bee-sidebar.ts lines 50-64 (adapted for bee-pane :host)
static styles = css`
  :host {
    position: absolute;
    z-index: 1;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    font-family: system-ui, Avenir, Helvetica, Arial, sans-serif;
  }
```

The collapsed-state width (2.5rem strip) and list-state width (25rem) are set via CSS on `:host` by toggling a host attribute or by matching the existing `bee-atlas.ts` approach at lines 105–113 where `bee-sidebar { width: 25rem }` is set from the parent. The pane can expose a `data-pane-state` reflect attribute so `bee-atlas` can target it, or set width via CSS custom property. The simplest approach matching the project pattern: use `:host` CSS for width per state directly in static styles, since `bee-pane` controls its own chrome.

Filter panel CSS (inputs, chips, suggestions, etc.) — copy verbatim from `src/bee-filter-panel.ts` lines 104–284.

Sidebar header CSS — copy from `src/bee-sidebar.ts` lines 77–103 (`.sidebar-header`, `.sidebar-title`, `.close-btn`).

Mobile breakpoint — copy from `src/bee-atlas.ts` lines 134–135 and apply to `.expand-btn`:

```css
/* src/bee-atlas.ts line 134 — exact breakpoint used in this project */
@media (max-aspect-ratio: 1) {
  .expand-btn {
    display: none;
  }
}
```

---

#### connectedCallback / disconnectedCallback

Copy verbatim from `src/bee-filter-panel.ts` lines 286–294. The document-click handler closes the filter dropdown when clicking outside:

```typescript
// src/bee-filter-panel.ts lines 286-294
connectedCallback() {
  super.connectedCallback();
  document.addEventListener('click', this._onDocumentClick);
}

disconnectedCallback() {
  super.disconnectedCallback();
  document.removeEventListener('click', this._onDocumentClick);
}

private _onDocumentClick = (e: MouseEvent) => {
  if (!this._open) return;
  if (!e.composedPath().includes(this)) {
    this._open = false;
    this._openSection = null;
  }
};
```

---

#### updated() — filterState sync

Copy verbatim from `src/bee-filter-panel.ts` lines 314–363. This is the core sync pattern that must be preserved:

```typescript
// src/bee-filter-panel.ts lines 314-363
updated(changed: PropertyValues) {
  if (!changed.has('filterState') || !this.filterState) return;
  const f = this.filterState;

  // Taxon
  const localTaxon = this._selectedTaxon?.name ?? null;
  if (f.taxonName !== localTaxon) {
    this._selectedTaxon = f.taxonName && f.taxonRank
      ? { name: f.taxonName, rank: f.taxonRank as 'family' | 'genus' | 'species' }
      : null;
    this._taxonInput = f.taxonName ?? '';
  }

  // Collectors
  const localNames = this._selectedCollectors.map(c => c.displayName).join('\0');
  const fsNames = f.selectedCollectors.map(c => c.displayName).join('\0');
  if (localNames !== fsNames) this._selectedCollectors = [...f.selectedCollectors];

  // Where
  const localCounties = [...this._selectedCounties].sort().join('\0');
  const fsCounties = [...f.selectedCounties].sort().join('\0');
  if (localCounties !== fsCounties) this._selectedCounties = new Set(f.selectedCounties);

  const localEcor = [...this._selectedEcoregions].sort().join('\0');
  const fsEcor = [...f.selectedEcoregions].sort().join('\0');
  if (localEcor !== fsEcor) this._selectedEcoregions = new Set(f.selectedEcoregions);

  // Place (singular)
  const localPlace = this._selectedPlace;
  const fsPlace = f.selectedPlace;
  if (localPlace !== fsPlace) {
    this._selectedPlace = fsPlace;
    if (this._selectedPlace !== null) void this._ensurePlaceNamesLoaded();
  }

  // Elevation
  if (this._elevMin !== f.elevMin) this._elevMin = f.elevMin;
  if (this._elevMax !== f.elevMax) this._elevMax = f.elevMax;

  // Year buckets
  const { yearFrom: localFrom, yearTo: localTo } = yearBucketsToFilter(
    this._yearThisYear, this._yearLastYear, this._yearEarlier
  );
  if (f.yearFrom !== localFrom || f.yearTo !== localTo) {
    const b = filterToYearBuckets(f.yearFrom, f.yearTo);
    this._yearThisYear = b.thisYear;
    this._yearLastYear = b.lastYear;
    this._yearEarlier  = b.earlier;
  }
}
```

---

#### _emitFilter() — filter-changed event dispatch

Copy verbatim from `src/bee-filter-panel.ts` lines 365–385. The event name `'filter-changed'` and its `FilterChangedEvent` shape are unchanged:

```typescript
// src/bee-filter-panel.ts lines 365-385
private _emitFilter() {
  const { yearFrom, yearTo } = yearBucketsToFilter(
    this._yearThisYear, this._yearLastYear, this._yearEarlier
  );
  this.dispatchEvent(new CustomEvent<FilterChangedEvent>('filter-changed', {
    bubbles: true, composed: true,
    detail: {
      taxonName: this._selectedTaxon?.name ?? null,
      taxonRank: this._selectedTaxon?.rank ?? null,
      yearFrom,
      yearTo,
      months: new Set<number>(),
      selectedCounties: this._selectedCounties,
      selectedEcoregions: this._selectedEcoregions,
      selectedCollectors: this._selectedCollectors,
      elevMin: this._elevMin,
      elevMax: this._elevMax,
      selectedPlace: this._selectedPlace,
    } as FilterChangedEvent,
  }));
}
```

---

#### Pane toggle/expand/shrink event dispatch — NEW pattern

These are the three new pane-navigation events. Pattern for dispatching is the same `CustomEvent` with `bubbles: true, composed: true` (matching `_onCloseClick` in `bee-sidebar.ts` lines 106–111):

```typescript
// Analog: src/bee-sidebar.ts lines 106-111
private _onCloseClick() {
  this.dispatchEvent(new CustomEvent('close', {
    bubbles: true,
    composed: true,
  }));
}

// New pane events in bee-pane.ts — follow identical pattern:
private _onToggle() {
  if (this.paneState === 'collapsed') {
    this.dispatchEvent(new CustomEvent('pane-expand-list', { bubbles: true, composed: true }));
  } else {
    this.dispatchEvent(new CustomEvent('pane-collapse', { bubbles: true, composed: true }));
  }
}

private _onExpand() {
  this.dispatchEvent(new CustomEvent('pane-expand-table', { bubbles: true, composed: true }));
}

private _onShrink() {
  this.dispatchEvent(new CustomEvent('pane-shrink-list', { bubbles: true, composed: true }));
}
```

---

#### Filter section render methods

Copy ALL of these verbatim from `src/bee-filter-panel.ts`. No changes needed:

- `_renderWhat()` — lines 638–683
- `_renderWho()` — lines 686–735
- `_renderWhere()` — lines 737–822
- `_renderWhen()` — lines 824–853

Also copy:
- `_handleKeydown()` — lines 397–424
- `_pickSuggestion()` — lines 426–431
- `_onBlur()` — lines 433–435
- All taxon section methods (`_onTaxonInput`, `_selectTaxon`, `_clearTaxon`) — lines 439–475
- All collector section methods (`_onCollectorInput`, `_selectCollector`, `_removeCollector`) — lines 479–523
- All where section methods (`_onWhereInput`, `_selectWhere`, `_removeCounty`, `_removeEcoregion`, `_removePlace`) — lines 527–595
- `_ensurePlaceNamesLoaded()` — lines 597–620
- Elevation methods (`_onElevMinInput`, `_onElevMaxInput`) — lines 624–634

---

#### _ensurePlaceNamesLoaded() — async fetch with silent catch

Copy verbatim from `src/bee-filter-panel.ts` lines 597–620:

```typescript
// src/bee-filter-panel.ts lines 597-620
private async _ensurePlaceNamesLoaded() {
  if (this._placeNameBySlug.size > 0) return;
  try {
    const url = await resolveDataUrl('places_meta');
    if (!url) return;
    const resp = await fetch(url);
    const records = await resp.json() as { slug: string; name: string; specimen_count?: number; sample_count?: number }[];
    const nameMap = new Map<string, string>();
    const options: { slug: string; name: string }[] = [];
    for (const r of records) {
      if (r.slug && r.name) {
        nameMap.set(r.slug, r.name);
        if ((r.specimen_count ?? 0) > 0 || (r.sample_count ?? 0) > 0) {
          options.push({ slug: r.slug, name: r.name });
        }
      }
    }
    this._placeNameBySlug = nameMap;
    this._placeOptions = options;
    this.requestUpdate();
  } catch {
    // silently swallow — chip falls back to the slug
  }
}
```

---

#### render() — three-state template

The render method is the only truly new code. Follow the conditional-content pattern from `src/bee-filter-panel.ts` lines 855–883 (panel-container + conditional panel div), but applied to three states. The key constraint: toggle button is outside all conditionals.

Pattern for embedding sub-components with `.property=${...}` binding: copy from `src/bee-atlas.ts` lines 195–224 (how bee-atlas passes properties to bee-table and bee-sidebar). **Do NOT** add event listeners to `<bee-table>` — all bee-table events bubble naturally (`bubbles: true, composed: true` in bee-table.ts). `bee-occurrence-detail` embedding pattern from `src/bee-sidebar.ts` lines 119–122.

For the sidebar-header section (list state header), copy from `src/bee-sidebar.ts` lines 113–118:

```typescript
// src/bee-sidebar.ts lines 113-118 (sidebar-header shell)
render() {
  return html`
    <div class="sidebar-header">
      <span class="sidebar-title">Selected specimens</span>
      <button class="close-btn" @click=${this._onCloseClick} aria-label="Close detail panel">&times;</button>
    </div>
    ${this.occurrences !== null
      ? html`<bee-occurrence-detail .occurrences=${this.occurrences}></bee-occurrence-detail>`
      : html`<div class="panel-content"><p class="hint">Click a point on the map to see details.</p></div>`
    }
  `;
}
```

---

### `src/tests/bee-pane.test.ts` (test, source-scan)

**Primary analog:** `src/tests/bee-sidebar.test.ts`
**Secondary analog:** `src/tests/bee-atlas.test.ts` (for vi.mock boilerplate and describe structure)

---

#### File header, imports, and vi.mock boilerplate

Copy verbatim from `src/tests/bee-sidebar.test.ts` lines 1–21:

```typescript
// src/tests/bee-sidebar.test.ts lines 1-21
import { test, expect, describe, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Mock heavy modules that have module-level side effects incompatible with happy-dom
vi.mock('../sqlite.ts', () => ({
  getDB: vi.fn(() => Promise.resolve({ sqlite3: {}, db: 0 })),
  loadOccurrencesTable: vi.fn(() => Promise.resolve()),
  tablesReady: Promise.resolve(),
}));

vi.mock('../features.ts', () => ({
  loadOccurrenceGeoJSON: vi.fn(() => Promise.resolve({
    geojson: { type: 'FeatureCollection', features: [] },
    summary: { totalSpecimens: 0, speciesCount: 0, genusCount: 0, familyCount: 0, earliestYear: 0, latestYear: 0 },
    taxaOptions: [],
  })),
}));
```

---

#### Source-scan test structure

Source-scan tests use `readFileSync` to load the source text and run `expect(src).toMatch(...)`. Pattern from `src/tests/bee-sidebar.test.ts` lines 70–128:

```typescript
// src/tests/bee-sidebar.test.ts lines 70-78 — source-scan pattern
test('bee-sidebar.ts does NOT contain filter-by-taxon input markup', () => {
  const src = readFileSync(resolve(__dirname, '../bee-sidebar.ts'), 'utf-8');
  expect(src).not.toMatch(/placeholder.*Filter by taxon/);
});
```

For `bee-pane.test.ts`, load the source once at describe-block level (following `bee-atlas.test.ts` lines 89–94):

```typescript
// src/tests/bee-atlas.test.ts lines 89-94 — shared src variable pattern
describe('ARCH-02: ...', () => {
  test('...', () => {
    const src = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');
    expect(src).not.toMatch(/_layerMode/);
  });
});
```

Or hoist `const src = readFileSync(...)` above all describe blocks if multiple tests share it (both patterns are valid in this codebase).

---

#### Sibling-isolation test pattern (ARCH-03 equivalent)

From `src/tests/bee-atlas.test.ts` lines 98–100:

```typescript
// src/tests/bee-atlas.test.ts lines 98-100 — sibling isolation source-scan
test('bee-map.ts does not have a runtime (non-type) import of bee-sidebar', () => {
  const beeMapSource = readFileSync(resolve(__dirname, '../bee-map.ts'), 'utf-8');
```

For `bee-pane.test.ts`, extend with: `bee-pane.ts` does not import `bee-atlas.ts`, `bee-filter-panel.ts`, or `bee-sidebar.ts`.

---

#### Property interface test pattern (ARCH-02 equivalent)

From `src/tests/bee-atlas.test.ts` lines 77–87 — import the class and inspect `elementProperties`:

```typescript
// src/tests/bee-atlas.test.ts lines 77-87
test('BeeMap class has @property declarations for required inputs', async () => {
  const { BeeMap } = await import('../bee-map.ts');
  const props = (BeeMap as unknown as { elementProperties: Map<string, unknown> }).elementProperties;
  expect(props.has('visibleIds')).toBe(true);
  expect(props.has('boundaryMode')).toBe(true);
  // ...
});
```

---

## Shared Patterns

### CustomEvent dispatch with bubbles + composed

**Source:** `src/bee-sidebar.ts` lines 106–111 (`close` event), `src/bee-filter-panel.ts` lines 365–385 (`filter-changed` event)
**Apply to:** All event dispatches in `bee-pane.ts` (`pane-collapse`, `pane-expand-list`, `pane-expand-table`, `pane-shrink-list`, `filter-changed`, `close` is NOT emitted by bee-pane — it uses `pane-collapse` instead)

```typescript
// src/bee-sidebar.ts lines 106-111
this.dispatchEvent(new CustomEvent('close', {
  bubbles: true,
  composed: true,
}));
```

All bee-table events already have `bubbles: true, composed: true` — no re-dispatch needed in bee-pane.

---

### CSS custom property tokens

**Source:** `src/bee-filter-panel.ts` lines 119–175 (filter-panel CSS using `var(--surface)`, `var(--border-input)`, `var(--accent)`, `var(--text-body)`, etc.), `src/bee-sidebar.ts` lines 56–103
**Apply to:** All CSS in `bee-pane.ts`

No hex literals. All colors via `var(--token)`. Box-shadow exact values: `0 2px 8px rgba(0,0,0,0.15)` (panel), `0 2px 6px rgba(0,0,0,0.1)` (dropdown suggestions).

---

### Mobile breakpoint

**Source:** `src/bee-atlas.ts` line 134
**Apply to:** `.expand-btn` hide rule in `bee-pane.ts` static styles

```css
/* src/bee-atlas.ts line 134 — project mobile breakpoint */
@media (max-aspect-ratio: 1) {
  /* bee-atlas hides/restructures layout here */
}
```

Use `@media (max-aspect-ratio: 1)` exclusively. Do not use `max-width` or `matchMedia` JS.

---

### Lit decorator and template patterns

**Source:** All existing components
**Apply to:** `bee-pane.ts`

- `@customElement`, `@property({ attribute: false })`, `@state()` — from `lit/decorators.js`
- `html\`\``, `css\`\``, `nothing` — from `lit`
- `type PropertyValues` — from `lit`
- `@event=${this._handler}` in templates — Lit event binding; no `.addEventListener` in `render()`
- `.property=${value}` — Lit property binding (not HTML attribute binding)

---

## No Analog Found

No files in this phase lack an analog. Both new files have strong existing patterns to follow directly.

---

## Metadata

**Analog search scope:** `src/` (all component and test files)
**Key files read:** `src/bee-filter-panel.ts` (884 lines), `src/bee-sidebar.ts` (126 lines), `src/bee-atlas.ts` (first 243 lines + event handler section), `src/bee-table.ts` (first 80 lines), `src/tests/bee-atlas.test.ts` (first 100 lines), `src/tests/bee-sidebar.test.ts` (full), `src/tests/bee-table.test.ts` (first 60 lines)
**Pattern extraction date:** 2026-05-19
