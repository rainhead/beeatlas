# Phase 65: UI Unification - Pattern Map

**Mapped:** 2026-04-17
**Files analyzed:** 11 new/modified files + 5 test files
**Analogs found:** 11 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `frontend/src/bee-occurrence-detail.ts` | component | request-response | `frontend/src/bee-specimen-detail.ts` + `bee-sample-detail.ts` | role-match (merger) |
| `frontend/src/bee-sidebar.ts` | component | request-response | itself (modify) | self |
| `frontend/src/bee-atlas.ts` | coordinator/store | event-driven | itself (modify) | self |
| `frontend/src/bee-map.ts` | component | event-driven | itself (modify) | self |
| `frontend/src/bee-header.ts` | component | event-driven | itself (modify) | self |
| `frontend/src/bee-table.ts` | component | CRUD | itself (modify) | self |
| `frontend/src/filter.ts` | utility/service | CRUD | itself (modify) | self |
| `frontend/src/url-state.ts` | utility | transform | itself (modify) | self |
| `frontend/src/style.ts` | utility | transform | itself (modify) | self |
| `frontend/src/bee-filter-toolbar.ts` | component | request-response | itself (modify) | self |
| DELETE: `frontend/src/bee-specimen-detail.ts` | component | — | — | deletion |
| DELETE: `frontend/src/bee-sample-detail.ts` | component | — | — | deletion |

---

## Pattern Assignments

### `frontend/src/bee-occurrence-detail.ts` (NEW component, request-response)

**Primary analog:** `frontend/src/bee-specimen-detail.ts` (lines 1–124)
**Secondary analog:** `frontend/src/bee-sample-detail.ts` (lines 1–87)

**Imports pattern** — copy from `bee-specimen-detail.ts` lines 1–3, updating the import source:
```typescript
import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { OccurrenceRow } from './filter.ts';
```

**Component declaration and property** — pure presenter, no `@state()` (matches DECOMP-02/DECOMP-03 test contract):
```typescript
@customElement('bee-occurrence-detail')
export class BeeOccurrenceDetail extends LitElement {
  @property({ attribute: false }) occurrences: OccurrenceRow[] = [];
  // NO @state() — pure presenter pattern from bee-specimen-detail.ts
```

**CSS to copy wholesale from `bee-specimen-detail.ts` lines 9–75:**
Copy `.sample`, `.sample-header`, `.sample-meta`, `.species-list`, `.species-list li`, `.inat-missing`, `.no-determination`, `.host-conflict`, `.host-label`, `.quality-badge`, `.quality-badge.research`, `.quality-badge.needs_id`, `.quality-badge.casual`.

**Additional CSS to copy from `bee-sample-detail.ts` lines 9–55:**
Copy `.panel-content`, `.sample-dot-detail`, `.event-date`, `.event-observer`, `.event-count`, `.event-elevation`, `.event-inat`, `.hint` — needed for the sample-only entry render path.

Add a separator rule:
```css
hr.separator {
  border: none;
  border-top: 1px solid var(--border-subtle);
  margin: 0.5rem 0;
}
```

**`_formatMonth` helper** — copy verbatim from `bee-specimen-detail.ts` lines 77–81:
```typescript
private _formatMonth(year: number, month: number): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long' }).format(
    new Date(year, month - 1)
  );
}
```

**`_formatSampleDate` helper** — copy verbatim from `bee-sample-detail.ts` lines 58–66:
```typescript
private _formatSampleDate(dateStr: string): string {
  // Append T00:00:00 to force local-timezone parsing; bare ISO dates parse as UTC
  // which causes off-by-one display in timezones west of UTC.
  const d = new Date(dateStr.length === 10 ? dateStr + 'T00:00:00' : dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  }).format(d);
}
```

**`_renderHostInfo` helper** — copy verbatim from `bee-specimen-detail.ts` lines 83–93 (update type reference from `import('./bee-sidebar.ts').Specimen` to inline `OccurrenceRow`):
```typescript
private _renderHostInfo(row: OccurrenceRow) {
  const grade = row.inat_quality_grade;
  const badge = grade
    ? html`<span class="quality-badge ${grade}">${grade === 'research' ? 'RG' : grade === 'needs_id' ? 'NID' : 'casual'}</span>`
    : '';
  if (row.floralHost && row.inat_host && row.floralHost !== row.inat_host) {
    return html`<span class="host-conflict"><span class="host-label">ecdysis:</span> ${row.floralHost} · <span class="host-label">iNat:</span> ${row.inat_host}${badge}</span>`;
  }
  const host = row.floralHost ?? row.inat_host ?? null;
  return host ? html`${host}${badge}` : html`<span class="inat-missing">no host</span>${badge}`;
}
```

**Grouping logic** — copy `buildSamples()` from `bee-map.ts` lines 28–51 as a module-level function (not a method), adapting input from `Feature[]` to `OccurrenceRow[]`:
```typescript
// Adapted from bee-map.ts buildSamples() lines 28-51
// Input is OccurrenceRow[] instead of Feature[] — use row.fieldName directly
interface SampleGroup {
  year: number;
  month: number;
  recordedBy: string;
  fieldNumber: string;
  elevation_m: number | null;
  rows: OccurrenceRow[];
}

function groupBySpecimenSample(rows: OccurrenceRow[]): SampleGroup[] {
  const map = new Map<string, SampleGroup>();
  for (const row of rows) {
    const key = `${row.year}-${row.month}-${row.recordedBy}-${row.fieldNumber}`;
    if (!map.has(key)) {
      map.set(key, {
        year: row.year!,
        month: row.month!,
        recordedBy: row.recordedBy!,
        fieldNumber: row.fieldNumber!,
        elevation_m: row.elevation_m,
        rows: [],
      });
    }
    map.get(key)!.rows.push(row);
  }
  return [...map.values()].sort((a, b) => b.year - a.year || b.month - a.month);
}
```

**`render()` structure** — null-omit pattern (D-01):
```typescript
render() {
  const specimenBacked = this.occurrences.filter(r => r.ecdysis_id != null);
  const sampleOnly = this.occurrences.filter(r => r.ecdysis_id == null);
  const specimenGroups = groupBySpecimenSample(specimenBacked);
  return html`
    ${specimenGroups.map(group => this._renderSpecimenGroup(group))}
    ${specimenGroups.length > 0 && sampleOnly.length > 0
      ? html`<hr class="separator">` : ''}
    ${sampleOnly.map(row => this._renderSampleOnly(row))}
  `;
}
```

**`_renderSpecimenGroup` method** — copy specimen block from `bee-specimen-detail.ts` `render()` lines 97–121, adapting `sample.species.map(s => ...)` to iterate `group.rows`:
- Specimen link: `https://ecdysis.org/collections/individual/index.php?occid=${row.ecdysis_id}`
- Host observation link: `row.host_observation_id` → iNat URL
- Specimen photo link: `row.specimen_observation_id` → iNat URL

**`_renderSampleOnly` method** — copy content from `bee-sample-detail.ts` `render()` lines 68–86, adapting from `event.*` to direct `row.*` field access:
```typescript
private _renderSampleOnly(row: OccurrenceRow) {
  const count = row.specimen_count != null && !isNaN(row.specimen_count)
    ? `${row.specimen_count} specimen${row.specimen_count === 1 ? '' : 's'}`
    : 'not recorded';
  return html`
    <div class="panel-content sample-dot-detail">
      <div class="event-date">${this._formatSampleDate(row.date)}</div>
      ${row.observer != null ? html`<div class="event-observer">${row.observer}</div>` : ''}
      <div class="event-count">${count}</div>
      ${row.elevation_m != null
        ? html`<div class="event-elevation">${Math.round(row.elevation_m)} m</div>`
        : ''}
      ${row.observation_id != null
        ? html`<div class="event-inat">
            <a href="https://www.inaturalist.org/observations/${row.observation_id}" target="_blank" rel="noopener">View on iNaturalist</a>
          </div>`
        : ''}
    </div>
  `;
}
```

---

### `frontend/src/bee-sidebar.ts` (component, request-response — modify)

**Current file:** `frontend/src/bee-sidebar.ts` lines 1–147

**Import changes:**
- Remove `import './bee-specimen-detail.ts'` (line 4)
- Remove `import './bee-sample-detail.ts'` (line 5)
- Add `import './bee-occurrence-detail.ts'`

**Interface deletions** — remove `Specimen` (lines 7–15), `Sample` (lines 17–24), `SampleEvent` (lines 50–58). Keep `DataSummary`, `TaxonOption`, `FilteredSummary`, `FilterChangedEvent`.

**Property changes** — replace two properties (lines 76–80) with one:
```typescript
// OLD (lines 76-80):
// @property({ attribute: false }) samples: Sample[] | null = null;
// @property({ attribute: false }) selectedSampleEvent: SampleEvent | null = null;

// NEW:
@property({ attribute: false }) occurrences: OccurrenceRow[] | null = null;
// Import OccurrenceRow from './filter.ts'
```

**`render()` changes** — replace conditional at lines 139–143:
```typescript
// OLD:
// ${this.samples !== null
//   ? html`<bee-specimen-detail .samples=${this.samples}></bee-specimen-detail>`
//   : this.selectedSampleEvent !== null
//     ? html`<bee-sample-detail .sampleEvent=${this.selectedSampleEvent}></bee-sample-detail>`
//     : html`<div class="panel-content"><p class="hint">Click a point on the map to see details.</p></div>`
// }

// NEW — copy static styles, close-btn, sidebar-header, _onCloseClick unchanged:
${this.occurrences !== null
  ? html`<bee-occurrence-detail .occurrences=${this.occurrences}></bee-occurrence-detail>`
  : html`<div class="panel-content"><p class="hint">Click a point on the map to see details.</p></div>`
}
```

---

### `frontend/src/bee-atlas.ts` (coordinator/store — modify)

**Primary analog:** itself (lines 1–870)

**@state field removals** (lines 34–45 area):
- Line 34: `@state() private _visibleEcdysisIds: Set<string> | null = null;` — replace with `@state() private _visibleIds: Set<string> | null = null;`
- Line 35: `@state() private _visibleSampleIds: Set<string> | null = null;` — delete
- Line 36: `@state() private _layerMode: 'specimens' | 'samples' = 'specimens';` — delete
- Line 44: `@state() private _selectedSamples: Sample[] | null = null;` — rename to `_selectedOccurrences: OccurrenceRow[] | null = null`
- Line 45: `@state() private _selectedSampleEvent: SampleEvent | null = null;` — delete

**Import cleanup** (line 3):
- Remove `SpecimenRow`, `SampleRow` from filter import; add `OccurrenceRow`
- Remove `type SpecimenSortBy` if still needed for table sort — keep it
- Line 6: Remove `Sample`, `Specimen`, `SampleEvent` from bee-sidebar import; keep `DataSummary`, `TaxonOption`, `FilterChangedEvent`

**`_runFilterQuery` method** — copy generation-guard pattern (lines 298–305), update destructure:
```typescript
// OLD (lines 300-304):
// const { ecdysis, samples } = await queryVisibleIds(this._filterState);
// if (generation !== this._filterQueryGeneration) return;
// this._visibleEcdysisIds = ecdysis;
// this._visibleSampleIds = samples;

// NEW:
const ids = await queryVisibleIds(this._filterState);
if (generation !== this._filterQueryGeneration) return;
this._visibleIds = ids;
```

**`_restoreSelectionSamples` method** (lines 751–799) — replace entirely. New pattern: query all `occIds` (both `ecdysis:` and `inat:` prefixes), SELECT all `OccurrenceRow` columns, return as `OccurrenceRow[]` assigned to `this._selectedOccurrences`. Remove the early-return at line 758. The SQLite query pattern to copy is the `sqlite3.exec` + `Object.fromEntries(columnNames.map(...))` pattern at line 772–774.

**`_restoreClusterSelection` method** (lines 802–869) — update:
- Remove `if (obj.ecdysis_id == null) continue` guard at line 843
- Replace `Sample[]` building with collecting raw `OccurrenceRow` objects
- Assign to `this._selectedOccurrences` instead of `this._selectedSamples`

**`_onLayerChanged` method** (lines 643–656 area) — delete entirely.

**`_onClose` method** (lines 716–723) — update: replace `this._selectedSamples = null` and `this._selectedSampleEvent = null` with `this._selectedOccurrences = null`.

**`render()` prop pass-through** — copy existing pattern of passing `@state` fields as `.property=${this._field}`:
- Replace `.samples=${this._selectedSamples} .selectedSampleEvent=${this._selectedSampleEvent}` with `.occurrences=${this._selectedOccurrences}` on `<bee-sidebar>`
- Replace `.visibleEcdysisIds=${this._visibleEcdysisIds} .visibleSampleIds=${this._visibleSampleIds}` with `.visibleIds=${this._visibleIds}` on `<bee-map>`
- Remove `.layerMode=${this._layerMode}` from `<bee-header>`, `<bee-map>`, `<bee-table>`, `<bee-filter-toolbar>`

---

### `frontend/src/bee-map.ts` (component, event-driven — modify)

**Current file:** `frontend/src/bee-map.ts` lines 1–496

**Property changes** (lines 135–138):
```typescript
// Remove:
// @property({ attribute: false }) layerMode: 'specimens' | 'samples' = 'specimens';
// @property({ attribute: false }) visibleEcdysisIds: Set<string> | null = null;
// @property({ attribute: false }) visibleSampleIds: Set<string> | null = null;

// Add:
@property({ attribute: false }) visibleIds: Set<string> | null = null;
// boundaryMode, selectedOccIds, countyOptions, ecoregionOptions, viewState, panTo, filterState: unchanged
```

**`updated()` method** (lines 262–307) — copy `changedProperties.has(...)` guard pattern:
```typescript
// OLD (line 266):
// if (changedProperties.has('visibleEcdysisIds') || changedProperties.has('visibleSampleIds')) {

// NEW:
if (changedProperties.has('visibleIds')) {
  this.clusterSource?.changed();
  this.map?.render();
  this._emitFilteredSummary();
}
```

**`_emitFilteredSummary()` method** (lines 309–330) — update `visibleEcdysisIds` references to `visibleIds`. Keep the `ecdysis:` prefix filter for summary stats (summary is still specimen-only):
```typescript
// OLD (line 310): if (this.visibleEcdysisIds !== null && this.occurrenceSource) {
// NEW:
if (this.visibleIds !== null && this.occurrenceSource) {
  const allFeatures = this.occurrenceSource.getFeatures().filter(
    f => String(f.getId()).startsWith('ecdysis:')
  );
  const matching = allFeatures.filter(f => this.visibleIds!.has(f.getId() as string));
  // rest unchanged
```

**`makeClusterStyleFn` call** (line 370) — copy closure pattern:
```typescript
// OLD: style: makeClusterStyleFn(() => this.visibleEcdysisIds, () => this.selectedOccIds),
// NEW:
style: makeClusterStyleFn(() => this.visibleIds, () => this.selectedOccIds),
```

**Click handler** (lines 443–494) — update `visibleEcdysisIds` → `visibleIds` at line 449–451, and replace `buildSamples(specimenFeatures)` with raw feature property collection:
```typescript
// OLD (lines 449-469):
// const toShow = this.visibleEcdysisIds !== null
//   ? inner.filter(f => this.visibleEcdysisIds!.has(f.getId() as string))
//   : inner;
// ...
// samples: buildSamples(specimenFeatures),

// NEW:
const toShow = this.visibleIds !== null
  ? inner.filter(f => this.visibleIds!.has(f.getId() as string))
  : inner;
if (toShow.length === 0) return;
const occIds = toShow.map(f => f.getId() as string);
// Collect raw occurrence rows from feature properties (Phase 64 D-03 established this)
const occurrences = toShow.map(f => {
  const obj: Record<string, unknown> = {};
  // all occurrence columns available as feature properties (bee-map.ts line 31 pattern)
  for (const col of OCCURRENCE_COLUMNS) obj[col] = f.get(col);
  return obj as OccurrenceRow;
});
this._emit('map-click-occurrence', { occurrences, occIds, ...clusterPayload });
```

**Deletions:**
- `buildSamples()` function (lines 28–51) — delete after click handler migration
- `_buildRecentSampleEvents()` method (lines 332–356) — delete (dead code per RESEARCH A1)
- Remove `SampleEvent` import from bee-sidebar.ts (line 18 import)

---

### `frontend/src/bee-header.ts` (component, event-driven — modify)

**Current file:** `frontend/src/bee-header.ts` lines 1–235

**Property removal** (lines 6–8): delete `@property() layerMode` and its type.

**`_renderTabItems()` removal** (lines 161–173): delete the Specimens and Samples buttons. Per RESEARCH.md, the disabled Species/Plants stubs can be kept or removed — remove them for cleanliness (they serve no function):
```typescript
// OLD _renderTabItems() returned 4 items including Specimens/Samples layer buttons.
// NEW: remove _renderTabItems() entirely; inline the view tabs directly in render()
// OR keep disabled Species/Plants stubs if desired — Claude's discretion.
```

**`_onLayerClick` method** (lines 176–182) — delete entirely.

**`render()` changes** — remove `${this._renderTabItems()}` from `.inline-tabs` and `.hamburger-items` divs. The `_onViewClick` method and view toggle buttons (map/table) remain unchanged (lines 185–231).

The `viewMode` property and view-mode event dispatch are untouched — copy those lines as-is.

---

### `frontend/src/bee-table.ts` (component, CRUD — modify)

**Current file:** `frontend/src/bee-table.ts` lines 1–321

**Import changes** (line 3):
```typescript
// OLD: import type { SpecimenRow, SampleRow, SpecimenSortBy } from './filter.ts';
// NEW:
import type { OccurrenceRow, SpecimenSortBy } from './filter.ts';
```

**Column constants** (lines 17–49) — delete `SPECIMEN_COLUMN_DEFS` and `SAMPLE_COLUMN_DEFS`. Add `OCCURRENCE_COLUMN_DEFS` using the same `ColumnDef` interface. Columns per D-02 (copy `ColumnDef` structure from existing defs):
```typescript
const OCCURRENCE_COLUMN_DEFS: ColumnDef[] = [
  { key: 'date',       label: 'Date',       dataField: 'date',            minWidth: '100px' },
  { key: 'species',    label: 'Species',    dataField: 'scientificName',  minWidth: '180px', nullLabel: 'No Determination' },
  { key: 'collector',  label: 'Collector',  dataField: 'recordedBy',      minWidth: '150px' },
  { key: 'observer',   label: 'Observer',   dataField: 'observer',        minWidth: '150px' },
  { key: 'county',     label: 'County',     dataField: 'county',          minWidth: '110px' },
  { key: 'ecoregion',  label: 'Ecoregion',  dataField: 'ecoregion_l3',    minWidth: '130px' },
  { key: 'elevation',  label: 'Elev (m)',   dataField: 'elevation_m',     minWidth: '80px'  },
  { key: 'fieldNumber',label: 'Field #',    dataField: 'fieldNumber',     minWidth: '80px'  },
  { key: 'modified',   label: 'Modified',   dataField: 'modified',        minWidth: '100px' },
  { key: 'photo',      label: 'Photo',      dataField: 'specimen_observation_id', minWidth: '60px',
    linkFn: (row) => row.specimen_observation_id != null
      ? `https://www.inaturalist.org/observations/${row.specimen_observation_id}`
      : null },
];
```

**Property change** (line 55): delete `@property({ attribute: false }) layerMode`.

**`rows` property type** (line 53): `rows: OccurrenceRow[] = []`.

**`render()` changes** (lines 229–319):
```typescript
// OLD (lines 230-231):
// const cols = this.layerMode === 'specimens' ? SPECIMEN_COLUMN_DEFS : SAMPLE_COLUMN_DEFS;
// const noun = this.layerMode === 'specimens' ? 'specimens' : 'samples';

// NEW:
const cols = OCCURRENCE_COLUMN_DEFS;
const noun = 'occurrences';
```

**Sort guard** (line 253):
```typescript
// OLD: const isSortable = this.layerMode === 'specimens' && (col.key === 'date' || col.key === 'modified');
// NEW:
const isSortable = col.key === 'date' || col.key === 'modified';
```

All other table structure (pagination, header rendering, cell rendering, event dispatchers) copy unchanged from existing lines 100–321.

---

### `frontend/src/filter.ts` (utility/service, CRUD — modify)

**Current file:** `frontend/src/filter.ts` lines 1–299

**Interface deletions** (lines 24–75): delete `SpecimenRow` (lines 24–38), `SampleRow` (lines 40–48), `SPECIMEN_COLUMNS` (lines 51–65), `SAMPLE_COLUMNS` (lines 67–75). Replace with:

```typescript
// From RESEARCH.md Code Examples section:
export interface OccurrenceRow {
  lat: number;
  lon: number;
  date: string;
  county: string | null;
  ecoregion_l3: string | null;
  ecdysis_id: number | null;
  catalog_number: string | null;
  scientificName: string | null;
  recordedBy: string | null;
  fieldNumber: string | null;
  genus: string | null;
  family: string | null;
  floralHost: string | null;
  host_observation_id: number | null;
  inat_host: string | null;
  inat_quality_grade: string | null;
  modified: string | null;
  specimen_observation_id: number | null;
  elevation_m: number | null;
  year: number | null;
  month: number | null;
  observation_id: number | null;
  observer: string | null;
  specimen_count: number | null;
  sample_id: number | null;
}

/** SQL column list for all occurrence queries. Order matches OccurrenceRow interface. */
export const OCCURRENCE_COLUMNS = [
  'lat', 'lon', 'date', 'county', 'ecoregion_l3',
  'ecdysis_id', 'catalog_number', 'scientificName', 'recordedBy', 'fieldNumber',
  'genus', 'family', 'floralHost', 'host_observation_id', 'inat_host',
  'inat_quality_grade', 'modified', 'specimen_observation_id', 'elevation_m',
  'year', 'month', 'observation_id', 'observer', 'specimen_count', 'sample_id',
] as const;
```

**`buildCsvFilename` signature** (line 94) — remove `layerMode` param; use `'occurrences'` prefix. Copy the entire function body from lines 95–137 unchanged except:
```typescript
// OLD: export function buildCsvFilename(f: FilterState, layerMode: 'specimens' | 'samples'): string {
// NEW: export function buildCsvFilename(f: FilterState): string {

// OLD (line 96): if (!isFilterActive(f)) return `${layerMode}-all-${date}.csv`;
// NEW:           if (!isFilterActive(f)) return `occurrences-all-${date}.csv`;

// OLD (line 136): return `${layerMode}-${segments.join('-')}-${date}.csv`;
// NEW:            return `occurrences-${segments.join('-')}-${date}.csv`;
```

**`queryAllFiltered` signature and body** (lines 139–169) — remove `layerMode` param; remove `discriminator`; unify `selectCols`:
```typescript
// OLD: export async function queryAllFiltered(f: FilterState, layerMode: 'specimens' | 'samples', sortBy: SpecimenSortBy = 'date')
// NEW: export async function queryAllFiltered(f: FilterState, sortBy: SpecimenSortBy = 'date')

// Remove discriminator and per-mode selectCols. New selectCols covers all display columns plus URLs:
const selectCols = OCCURRENCE_COLUMNS.join(', ') +
  ", CASE WHEN ecdysis_id IS NOT NULL THEN 'https://ecdysis.org/collections/individual/index.php?occid=' || CAST(ecdysis_id AS TEXT) ELSE NULL END AS ecdysis_url" +
  ", CASE WHEN host_observation_id IS NOT NULL THEN 'https://www.inaturalist.org/observations/' || CAST(host_observation_id AS TEXT) ELSE NULL END AS inat_url";
const orderBy = sortBy === 'modified' ? SPECIMEN_ORDER_MODIFIED : 'date DESC, recordedBy ASC, fieldNumber ASC';
const where = occurrenceWhere;
// Keep sqlite3.exec + row-building pattern from lines 160-168 unchanged
```

**`queryTablePage` signature and body** (lines 171–211) — remove `layerMode` param:
```typescript
// OLD: export async function queryTablePage(f: FilterState, layerMode: 'specimens' | 'samples', page: number, sortBy: SpecimenSortBy = 'date')
// NEW: export async function queryTablePage(f: FilterState, page: number, sortBy: SpecimenSortBy = 'date'): Promise<{ rows: OccurrenceRow[]; total: number }>

// Remove all layerMode branches. New body:
const selectCols = OCCURRENCE_COLUMNS.join(', ');
const orderBy = sortBy === 'modified' ? SPECIMEN_ORDER_MODIFIED : 'date DESC, recordedBy ASC, fieldNumber ASC';
const where = occurrenceWhere;  // no discriminator
// Keep COUNT query and page query patterns from lines 195-210 unchanged
```

**`queryVisibleIds` function** — replace current implementation (which returns `{ ecdysis: Set; samples: Set }`) with unified version from RESEARCH.md Code Examples:
```typescript
// Copy exact implementation from RESEARCH.md lines 413-431:
export async function queryVisibleIds(f: FilterState): Promise<Set<string> | null> {
  if (!isFilterActive(f)) return null;
  const { occurrenceWhere } = buildFilterSQL(f);
  await tablesReady;
  const { sqlite3, db } = await getDB();
  const ids = new Set<string>();
  await sqlite3.exec(db,
    `SELECT ecdysis_id, observation_id FROM occurrences WHERE ${occurrenceWhere}`,
    (rowValues: unknown[]) => {
      const ecdysisId = rowValues[0];
      const obsId = rowValues[1];
      if (ecdysisId != null) ids.add(`ecdysis:${Number(ecdysisId)}`);
      if (obsId != null) ids.add(`inat:${Number(obsId)}`);
    }
  );
  return ids;
}
```

Keep `isFilterActive`, `buildFilterSQL`, `FilteredCounts` interface, `SPECIMEN_ORDER_MODIFIED`, `PAGE_SIZE`, `slugify` unchanged.

---

### `frontend/src/url-state.ts` (utility, transform — modify)

**Current file:** `frontend/src/url-state.ts` lines 1–180

**`UiState` interface** (lines 13–17) — remove `layerMode` field:
```typescript
// OLD:
// export interface UiState {
//   layerMode: 'specimens' | 'samples';
//   boundaryMode: 'off' | 'counties' | 'ecoregions';
//   viewMode: 'map' | 'table';
// }

// NEW:
export interface UiState {
  boundaryMode: 'off' | 'counties' | 'ecoregions';
  viewMode: 'map' | 'table';
}
```

**`buildParams`** (lines 26–67) — remove line 50: `if (ui.layerMode !== 'specimens') params.set('lm', ui.layerMode);`

**`parseParams`** (lines 69–180) — remove lines 167–168 (`lmRaw` + `layerMode` parsing). Update line 175 guard:
```typescript
// OLD (line 175): if (layerMode !== 'specimens' || boundaryMode !== 'off' || viewMode !== 'map') {
//   result.ui = { layerMode, boundaryMode, viewMode };

// NEW:
if (boundaryMode !== 'off' || viewMode !== 'map') {
  result.ui = { boundaryMode, viewMode };
}
```

All other parsing logic (view, filter, selection) is unchanged.

---

### `frontend/src/style.ts` (utility, transform — modify)

**Current file:** `frontend/src/style.ts` lines 1–171

**Deletions** — lines 37–171 containing:
- `SAMPLE_RECENCY_COLORS` constant (lines 37–41)
- `SAMPLE_RECENCY_COLORS_ACTIVE` constant (lines 43–48)
- `GHOSTED_SAMPLE_STYLE` constant (lines 50–56)
- `sampleStyleCache` map (line 58)
- `sampleStyleCacheActive` map (line 59)
- `makeSampleDotStyleFn` function (lines 137–171)

Keep everything from lines 1–130 unchanged: `RECENCY_COLORS`, `hexWithOpacity`, `styleCache`, `recencyTier`, `makeClusterStyleFn`.

**`makeClusterStyleFn` signature** (lines 67–70) — update parameter name:
```typescript
// OLD:
// export function makeClusterStyleFn(
//   getVisibleEcdysisIds: () => Set<string> | null,
//   getSelectedOccIds: () => Set<string> | null = () => null,
// )

// NEW (copy from RESEARCH.md Code Examples):
export function makeClusterStyleFn(
  getVisibleIds: () => Set<string> | null,  // was getVisibleEcdysisIds
  getSelectedOccIds: () => Set<string> | null = () => null,
): (feature: FeatureLike) => Style | Style[] {
```

**Inside `clusterStyleFn`** (lines 72–74):
```typescript
// OLD:
// const activeEcdysisIds = getVisibleEcdysisIds();
// const hasFilter = activeEcdysisIds !== null;

// NEW:
const activeIds = getVisibleIds();
const hasFilter = activeIds !== null;
// Replace all remaining activeEcdysisIds references with activeIds
// (line 83: activeEcdysisIds.has -> activeIds.has)
```

---

### `frontend/src/bee-filter-toolbar.ts` (component, request-response — modify)

**Scope:** Minimal. Per RESEARCH.md the `layerMode` property is declared at line 15 but not used in the toolbar body beyond receipt.

Remove `@property({ attribute: false }) layerMode: 'specimens' | 'samples' = 'specimens';` (line 15). No other changes required in this file.

---

## Test File Patterns

### `frontend/src/tests/filter.test.ts` (modify)

**Mock update** (line 15): `queryVisibleIds: vi.fn(() => Promise.resolve({ ecdysis: null, samples: null }))` — change to `queryVisibleIds: vi.fn(() => Promise.resolve(null))`. Remove `SPECIMEN_COLUMNS`, `SAMPLE_COLUMNS` from import mock (line 2/mock); add `OCCURRENCE_COLUMNS`.

**`buildCsvFilename` tests** (lines 163–222) — all calls change from `buildCsvFilename(f, 'specimens')` to `buildCsvFilename(f)`. Expected filenames change prefix from `specimens-` / `samples-` to `occurrences-`.

**`queryTablePage` SQL discriminator tests** (lines 295–303 area) — remove assertions that SQL contains `ecdysis_id IS NOT NULL` or `observation_id IS NOT NULL`.

### `frontend/src/tests/bee-atlas.test.ts` (modify)

**ARCH-02 test** (lines 57–68) — copy existing `props.has(...)` test pattern, updating assertions:
```typescript
// Remove: expect(props.has('layerMode')).toBe(true);
// Remove: expect(props.has('visibleEcdysisIds')).toBe(true);
// Remove: expect(props.has('visibleSampleIds')).toBe(true);
// Add:    expect(props.has('visibleIds')).toBe(true);
// Add:    expect(props.has('layerMode')).toBe(false);  // layerMode removed
```

### `frontend/src/tests/bee-sidebar.test.ts` (modify)

**DECOMP-02/DECOMP-03** (lines 80–109) — replace with `DECOMP-02: bee-occurrence-detail` test:
```typescript
// Copy test structure from lines 80-91 (DECOMP-02 pattern):
describe('DECOMP-02: bee-occurrence-detail property interface', () => {
  test('BeeOccurrenceDetail has @property declaration for occurrences', async () => {
    const { BeeOccurrenceDetail } = await import('../bee-occurrence-detail.ts');
    const props = (BeeOccurrenceDetail as unknown as { elementProperties: Map<string, unknown> }).elementProperties;
    expect(props.has('occurrences')).toBe(true);
  });
  test('bee-occurrence-detail.ts does NOT contain @state()', () => {
    // same source-scan pattern as existing DECOMP-02 test
  });
});
```

**DECOMP-04** tests for `bee-specimen-detail` and `bee-sample-detail` tags (lines 155–163):
```typescript
// OLD:
// expect(src).toMatch(/bee-specimen-detail/);
// expect(src).toMatch(/bee-sample-detail/);

// NEW:
expect(src).toMatch(/bee-occurrence-detail/);
expect(src).not.toMatch(/bee-specimen-detail/);
expect(src).not.toMatch(/bee-sample-detail/);
```

**SIDE-01 property test** (line 321 area) — update:
```typescript
// OLD: props.has('samples'), props.has('selectedSampleEvent')
// NEW: props.has('occurrences')
// Assert old names are gone: expect(props.has('samples')).toBe(false)
```

### `frontend/src/tests/bee-table.test.ts` (modify)

**Mock update** — change `SPECIMEN_COLUMNS`/`SAMPLE_COLUMNS` mock to `OCCURRENCE_COLUMNS` mock.

**TABLE-01 test** (lines 60–96) — copy DOM inspection pattern (`querySelectorAll('th')`, `textContent?.trim()`), updating assertions for unified 10-column set: Date, Species, Collector, Observer, County, Ecoregion, Elev (m), Field #, Modified, Photo.

**Remove** layerMode-specific column count assertion (line 80: `renders 7 sample column headers`).

Add assertion for "occurrences" noun in row count text.

Remove `layerMode` from `createBeeTable` helper props.

---

## Shared Patterns

### Null-omit rendering in Lit
**Source:** `frontend/src/bee-specimen-detail.ts` lines 95–123 and `frontend/src/bee-sample-detail.ts` lines 68–85
**Apply to:** `bee-occurrence-detail.ts` render methods
```typescript
// Render only when discriminating column is non-null
${row.ecdysis_id != null ? html`...specimen content...` : ''}
${row.observation_id != null ? html`...iNat link...` : ''}
```

### Feature property access
**Source:** `frontend/src/bee-map.ts` lines 31–48 (`buildSamples` function)
**Apply to:** New click handler in `bee-map.ts`, `bee-occurrence-detail.ts` grouping
```typescript
const key = `${f.get('year')}-${f.get('month')}-${f.get('recordedBy')}-${f.get('fieldNumber')}`;
const ecdysisId = f.get('ecdysis_id') as number | null;
const obsId = f.get('observation_id') as number | null;
```

### SQLite exec + row building
**Source:** `frontend/src/bee-atlas.ts` lines 772–774 and `frontend/src/filter.ts` lines 160–168
**Apply to:** `_restoreSelectionSamples`, `_restoreClusterSelection`, all filter queries
```typescript
await sqlite3.exec(db, `SELECT ...`, (rowValues: unknown[], columnNames: string[]) => {
  const obj = Object.fromEntries(columnNames.map((col: string, i: number) => [col, rowValues[i]]));
  rows.push(obj);
});
```

### Race-guard pattern
**Source:** `frontend/src/bee-atlas.ts` lines 298–304
**Apply to:** Any new async query in `_runFilterQuery`
```typescript
const generation = ++this._filterQueryGeneration;
// ... await async work ...
if (generation !== this._filterQueryGeneration) return;
// commit results
```

### Custom event dispatch
**Source:** `frontend/src/bee-map.ts` lines 218–222 (`_emit` helper) and `frontend/src/bee-sidebar.ts` lines 127–131
**Apply to:** All component event emissions — use `bubbles: true, composed: true`
```typescript
private _emit<T>(name: string, detail?: T) {
  this.dispatchEvent(new CustomEvent(name, {
    bubbles: true, composed: true, detail,
  }));
}
```

### Pure-presenter @property / no-@state pattern
**Source:** `frontend/src/bee-specimen-detail.ts` (entire file has `@property` only, no `@state`)
**Apply to:** `bee-occurrence-detail.ts` — no internal mutable state; all data arrives via `.occurrences` property

### Source-scan test pattern
**Source:** `frontend/src/tests/bee-atlas.test.ts` lines 104–134 (`readFileSync` + `toMatch`/`not.toMatch`)
**Apply to:** New tests that verify structural invariants (e.g., "layerMode does not appear in bee-atlas.ts")
```typescript
const src = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');
expect(src).not.toMatch(/_layerMode/);
```

---

## No Analog Found

None. All files are modifications to existing well-understood components; patterns are fully extractable from current source.

---

## Metadata

**Analog search scope:** `frontend/src/` and `frontend/src/tests/`
**Files read:** bee-specimen-detail.ts, bee-sample-detail.ts, bee-sidebar.ts, bee-map.ts (lines 1–496), bee-atlas.ts (lines 1–870), bee-table.ts (lines 1–321), bee-header.ts, filter.ts (lines 1–299), url-state.ts, style.ts (lines 1–171), bee-filter-toolbar.ts (grep), tests/filter.test.ts (lines 1–230), tests/bee-atlas.test.ts (lines 1–150), tests/bee-sidebar.test.ts (lines 1–179), tests/bee-table.test.ts (lines 1–96)
**Pattern extraction date:** 2026-04-17
