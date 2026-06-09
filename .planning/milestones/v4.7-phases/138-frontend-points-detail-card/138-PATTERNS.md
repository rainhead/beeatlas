# Phase 138: Frontend Points & Detail Card - Pattern Map

**Mapped:** 2026-06-08
**Files analyzed:** 9 (7 frontend + 2 data pipeline)
**Analogs found:** 9 / 9

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/style.ts` | utility/config | request-response | itself — `_occurrencePointPaint` | exact (in-place edit) |
| `src/bee-occurrence-detail.ts` | component | request-response | itself — `_renderInatObs` / `_renderSampleOnly` / `_renderProvisional` | exact (in-place edit) |
| `src/bee-pane.ts` | component | event-driven | itself — `_onSourceToggle` / `_renderSources` | exact (in-place edit) |
| `src/bee-atlas.ts` | component/controller | event-driven | itself — `_onSourceFilterChanged` / `_hiddenSources` | exact (in-place edit) |
| `src/url-state.ts` | utility | request-response | itself — `VALID_SOURCES` / `buildParams` / `parseParams` | exact (in-place edit) |
| `src/filter.ts` | model/utility | CRUD | itself — `OccurrenceRow` / `OCCURRENCE_COLUMNS` | exact (in-place edit) |
| `src/bee-map.ts` | component | event-driven | itself — `hiddenSources` prop (remove `showChecklist` analog) | exact (in-place deletion) |
| `data/dbt/models/intermediate/int_combined.sql` | model | transform | itself ARM 4 `NULL::INTEGER AS checklist_id` | exact (in-place edit) |
| `data/dbt/models/marts/schema.yml` | config | — | itself — existing 34-column contract | exact (in-place edit) |

---

## Pattern Assignments

### `src/style.ts` — extend `_occurrencePointPaint`; remove `checklistCountyFillLayerSpec`

**Analog:** itself (lines 87–99, 224–236)

**Current `_occurrencePointPaint`** (lines 87–99):
```typescript
function _occurrencePointPaint(colors: RecencyColors): CircleLayerSpecification['paint'] {
  return {
    'circle-color': [
      'match', ['get', 'recencyTier'],
      'thisYear', colors.thisYear,
      'lastYear', colors.lastYear,
      colors.earlier,
    ],
    'circle-radius': 6,
    'circle-stroke-width': 1,
    'circle-stroke-color': '#ffffff',
  };
}
```

**Replace `circle-color` entry — source-keyed outer match wrapping the recency match** (UI-SPEC §Mapbox Paint Contract):
```typescript
'circle-color': [
  'match', ['get', 'source'],
  'checklist', '#2c7a2c',
  // fallback: existing recency-tier match expression
  ['match', ['get', 'recencyTier'],
    'thisYear', colors.thisYear,
    'lastYear', colors.lastYear,
    colors.earlier]
],
```
Both `unclusteredPointLayerSpec` (line 101) and `selectedOccurrencesLayerSpec` (line 111) call `_occurrencePointPaint(colors)` — both pick up the override automatically with no other changes.

**`checklistCountyFillLayerSpec` to remove** (lines 224–236):
```typescript
export function checklistCountyFillLayerSpec(): FillLayerSpecification {
  return {
    id: 'checklist-county-fill',
    type: 'fill',
    source: 'counties',
    layout: { visibility: 'none' },
    paint: {
      'fill-color': 'rgba(44, 122, 44, 0.25)',
      'fill-outline-color': 'rgba(44, 122, 44, 0.7)',
    },
    filter: ['==', 'NAME', '__never__'],
  };
}
```
Delete the function body and its export. The green `rgba(44,122,44)` is carried forward as the hex `#2c7a2c` in the point paint expression.

---

### `src/bee-occurrence-detail.ts` — add `_renderChecklist`; extend `formatRomanDate`; update `render()` dispatch

**Analog:** `_renderInatObs` (lines 256–285), `_renderSampleOnly` (lines 216–233), `_renderProvisional` (lines 235–253)

**`formatRomanDate` current form** (lines 9–13) — does not handle null or length ≠ 10:
```typescript
function formatRomanDate(dateStr: string): string {
  const d = new Date(dateStr.length === 10 ? dateStr + 'T00:00:00' : dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getDate()} ${ROMAN_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
```
Replace with the UI-SPEC extension (null guard + length-4 + length-7 branches); signature changes to `(dateStr: string | null): string`.

**`_renderInatObs` — template structure to mirror** (lines 256–285):
```typescript
private _renderInatObs(row: OccurrenceRow) {
  const inatInfo = row.taxon_id != null ? this.taxonCache?.get(row.taxon_id) : null;
  const inatDisplayName = inatInfo?.name ?? null;
  const taxonEl = inatDisplayName
    ? html`<em>${inatDisplayName}</em>`
    : html`<span class="hint">identification unknown</span>`;
  return html`
    <div class="panel-content sample-dot-detail">
      <div class="inat-id-label">${taxonEl} ${this._renderQualityBadge(row.inat_quality_grade)}</div>
      <div class="event-date">${formatRomanDate(row.date)}</div>
      ${row.user_login != null
        ? html`<div class="event-observer">${row.user_login}</div>` : ''}
      ${row.floralHost != null
        ? html`<div class="event-host"><em>${row.floralHost}</em></div>` : ''}
      ...
    </div>
  `;
}
```

**`_renderSampleOnly` — template structure to mirror** (lines 216–233) — shows how optional fields are omitted without placeholders:
```typescript
private _renderSampleOnly(row: OccurrenceRow) {
  return html`
    <div class="panel-content sample-dot-detail">
      <div class="event-date">${formatRomanDate(row.date)}</div>
      ${row.host_inat_login != null ? html`<div class="event-observer">${row.host_inat_login}</div>` : ''}
      ${row.sample_host != null ? html`<div class="event-host"><em>${row.sample_host}</em></div>` : ''}
      <div class="event-count">${count}</div>
      ...
    </div>
  `;
}
```

**New `_renderChecklist(row)` — implement using these CSS classes and null-omit patterns** (UI-SPEC §Detail Card):
- Container: `<div class="panel-content sample-dot-detail">`
- Taxon: `<div class="inat-id-label">` containing `<em>` + optional `<span class="hint">(det. as {verbatim})</span>`
- Collector: `<div class="event-observer">` — omit if `row.recordedBy == null`
- Date: `<div class="event-date">` — call `formatRomanDate(row.date)` (handles null → `''`)
- Locality: `<div class="event-host">` — omit if `row.locality == null || row.locality === ''`
- Collapsed count: `<div class="event-count">Represents ${row.collapsed_count} collapsed records</div>` — only when `row.collapsed_count > 1`
- Attribution: `<div class="hint">Bartholomew et al. 2024</div>` — always rendered, at bottom
- Taxon resolution uses `this.taxonCache?.get(row.taxon_id)` — same pattern as `_renderInatObs` line 258

**`render()` dispatch — current form** (lines 287–305):
```typescript
render() {
  const specimenBacked = this.occurrences.filter(isSpecimenBacked);
  const nonSpecimen = this.occurrences.filter(r => !isSpecimenBacked(r))
    .sort((a, b) => b.date.localeCompare(a.date));
  const dateGroups = groupOccurrences(specimenBacked);
  return html`
    ${dateGroups.map(group => this._renderDateGroup(group))}
    ${dateGroups.length > 0 && nonSpecimen.length > 0
      ? html`<hr class="separator">` : ''}
    ${nonSpecimen.map(row =>
      isProvisional(row)
        ? this._renderProvisional(row)
        : row.source === 'inat_obs'
          ? this._renderInatObs(row)
          : this._renderSampleOnly(row)
    )}
  `;
}
```
Add `row.source === 'checklist' ? this._renderChecklist(row) :` before the `this._renderSampleOnly(row)` fallback. The `render()` sort at line 291 uses `b.date.localeCompare(a.date)` — checklist rows with `date = null` will sort to the top; this is acceptable.

---

### `src/bee-pane.ts` — replace `_showChecklist` with `hiddenSources` membership; update no-sources threshold

**Analog:** `_onSourceToggle` / `_renderSources` (lines 627–635, 1111–1158)

**`_onSourceToggle` — the event dispatch pattern to reuse** (lines 627–635):
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

**`_renderSources` checklist entry — current ad-hoc form** (lines 1131–1136):
```typescript
{
  label: 'Checklist records',
  tooltip: 'County-level species presence from observation history',
  checked: this._showChecklist,
  onChange: this._onChecklistChange,
},
```
Replace with:
```typescript
{
  label: 'Checklist records',
  tooltip: 'Published specimen records from Bartholomew et al. 2024',
  checked: !this._hiddenSources.has('checklist'),
  onChange: (e: Event) => this._onSourceToggle('checklist', (e.target as HTMLInputElement).checked),
},
```

**No-sources guard — current threshold** (line 1189):
```typescript
: this._hiddenSources.size === 3
```
Change to `=== 4`.

**State fields to delete:**
- `@state() private _showChecklist = false;` (line 115)
- `@property({ attribute: false }) checklistVisible = false;` (line 84)
- `private _onChecklistChange(e: Event) { ... }` (lines 618–625) — entire method

**`updated()` to update** (lines 513–514) — remove the `checklistVisible` branch entirely:
```typescript
if (changed.has('checklistVisible') && this._showChecklist !== this.checklistVisible) {
  this._showChecklist = this.checklistVisible;
}
```

---

### `src/bee-atlas.ts` — remove `_checklistVisible`; route checklist through `hiddenSources`

**Analog:** `_onSourceFilterChanged` / `_hiddenSources` state (lines 42, 1059–1062)

**`_onSourceFilterChanged` — the update + URL-push pattern** (lines 1059–1062):
```typescript
private _onSourceFilterChanged(e: CustomEvent<{ hiddenSources: Set<SourceKey> }>) {
  this._hiddenSources = e.detail.hiddenSources;
  this._replaceUrlState();
}
```

**`_onChecklistLayerChanged` — to delete** (lines 1054–1057):
```typescript
private _onChecklistLayerChanged(e: CustomEvent<{ visible: boolean }>) {
  this._checklistVisible = e.detail.visible;
  this._replaceUrlState();
}
```

**Template bindings to remove** (lines 178, 214, 218):
```typescript
.showChecklist=${this._checklistVisible}        // bee-map binding
.checklistVisible=${this._checklistVisible}     // bee-pane binding
@checklist-layer-changed=${this._onChecklistLayerChanged}  // event listener
```

**State fields to delete:**
- `@state() private _checklistVisible = false;` (line 41)
- All `.checklistTaxon` / `.checklistTaxonRank` bindings (lines 180–181) — only needed if the checklist county-fill still exists; with the county-fill gone and checklist in the standard `source IN (...)` filter, these props become dead code too.

**`_checklistVisible` usages to update** (lines 252, 608, 670) — replace with `_hiddenSources` reads:
- Line 252: `this._checklistVisible = initialParams.ui?.checklistVisible ?? false;` → delete
- Line 608 (`_replaceUrlState`): remove `checklistVisible: this._checklistVisible` from the `UiState` literal
- Line 670: delete the `_checklistVisible` restore

---

### `src/url-state.ts` — add `checklist` to `VALID_SOURCES`

**Analog:** existing `VALID_SOURCES` and `SourceKey` (lines 32–34)

**Current form** (lines 32–34):
```typescript
export type SourceKey = 'ecdysis' | 'waba_sample' | 'inat_obs';
const VALID_SOURCES = new Set<SourceKey>(['ecdysis', 'waba_sample', 'inat_obs']);
```
Change to:
```typescript
export type SourceKey = 'ecdysis' | 'waba_sample' | 'inat_obs' | 'checklist';
const VALID_SOURCES = new Set<SourceKey>(['ecdysis', 'waba_sample', 'inat_obs', 'checklist']);
```

**`buildParams` — `cl=` serialization to remove** (line 95):
```typescript
if (ui.checklistVisible) params.set('cl', '1');
```
Delete this line. The `checklist` source is now encoded via the standard `src=` param.

**`parseParams` — `cl=` parse to remove** (lines 267–278):
```typescript
const checklistVisible = p.get('cl') === '1';
// ...
if (boundaryMode !== 'off' || paneState !== 'collapsed' || checklistVisible || ...) {
  result.ui = { boundaryMode, paneState, checklistVisible, hiddenSources };
}
```
Remove `checklistVisible` from UiState construction. Drop `checklistVisible?` from the `UiState` interface (line 39).

**`hiddenSources` computation in `parseParams`** (lines 270–273) — pattern for understanding the complement logic:
```typescript
if (srcRaw) {
  const visible = new Set(srcRaw.split(',').filter(s => VALID_SOURCES.has(s as SourceKey)) as SourceKey[]);
  const hidden = new Set([...VALID_SOURCES].filter(s => !visible.has(s)));
  hiddenSources = hidden.size > 0 ? hidden : undefined;
}
```
After adding `checklist` to `VALID_SOURCES`, `parseParams('src=ecdysis')` will produce `hiddenSources = {inat_obs, waba_sample, checklist}` — existing MAP-03 tests at `src/tests/url-state.test.ts` line 417 must be updated.

---

### `src/filter.ts` — add 3 promoted columns to `OccurrenceRow` and `OCCURRENCE_COLUMNS`

**Analog:** `checklist_id` addition in Phase 137 (lines 68–69, 88)

**`OccurrenceRow` tail** (lines 68–78) — shows Phase 137's checklist_id addition pattern:
```typescript
  // Phase 137 (PRO-04): checklist rows carry checklist_id (= ObjectID); null for all other sources.
  checklist_id: number | null;
  source: 'ecdysis' | 'waba_sample' | 'inat_obs' | 'checklist' | null;
  image_url: string | null;
  obs_url: string | null;
  user_login: string | null;
  license: string | null;
  // JOIN-resolved from taxa.name; null when taxon_id IS NULL (not a mart column)
  display_name: string | null;
  // JOIN-resolved from taxa.rank; null when taxon_id IS NULL (not a mart column)
  display_rank: string | null;
```
Add three new fields after `checklist_id` (following Phase 137's commenting pattern):
```typescript
  // Phase 138 (D-10): checklist detail fields; null for all other sources.
  verbatim_name: string | null;
  locality: string | null;
  collapsed_count: number | null;
```

**`OCCURRENCE_COLUMNS`** (lines 81–90):
```typescript
export const OCCURRENCE_COLUMNS = [
  'taxon_id', 'lat', 'lon', 'date', 'county', 'ecoregion_l3', 'place_slug',
  'ecdysis_id', 'catalog_number', 'recordedBy', 'fieldNumber',
  'floralHost', 'host_observation_id', 'inat_host',
  'inat_quality_grade', 'modified', 'specimen_observation_id', 'elevation_m',
  'year', 'month', 'observation_id', 'host_inat_login', 'specimen_count', 'sample_id', 'sample_host',
  'is_provisional', 'specimen_inat_quality_grade',
  'checklist_id',
  'source', 'image_url', 'obs_url', 'user_login', 'license',
] as const;
```
Add `'verbatim_name', 'locality', 'collapsed_count'` to the list (order does not matter for SQL `SELECT`; append for clarity).

---

### `src/bee-map.ts` — remove checklist county-fill plumbing

**Analog:** `hiddenSources` prop (line 60) — the existing source-filter path is what checklist transitions to.

**Lines/blocks to delete:**
- Properties (lines 59, 61–62): `showChecklist`, `checklistTaxon`, `checklistTaxonRank`
- Internal state (lines 67–69): `_checklistCounties`, `_checklistAllRows`, `_checklistGeneration`
- `updated()` guard (line 345): `changedProperties.has('showChecklist') || changedProperties.has('checklistTaxon') || changedProperties.has('checklistTaxonRank')`
- Layer add in `_initMap` (lines 436–441): `checklistCountyFillLayerSpec()` add + `if (this.showChecklist)` block
- Private methods (lines 704–765): `_applyChecklistLayer()`, `_applyChecklistVisibility()`, `_applyChecklistFilter()`, `_loadChecklistData()`

**Import to remove:** `checklistCountyFillLayerSpec` from `./style.ts` (wherever it is imported).

The county-fill click interaction (if any exists in the map click handler) should also be removed — search for `'checklist-county-fill'` in the click handler block.

---

### `data/dbt/models/intermediate/int_combined.sql` — ARM 4 promote 3 columns; ARMs 1–3 add typed NULLs

**Analog:** ARM 4 `checklist_id` columns (lines 240, 47, 103, 182) — Phase 137's NULL-cast pattern

**ARM 1 null-cast pattern** (line 47):
```sql
NULL::INTEGER                                  AS checklist_id
```
**ARM 2 null-cast pattern** (line 103):
```sql
NULL::INTEGER                                                               AS checklist_id
```
**ARM 3 null-cast pattern** (line 182):
```sql
NULL::INTEGER                      AS checklist_id
```

Add to each of ARMs 1–3 (after their `checklist_id` lines):
```sql
NULL::VARCHAR    AS verbatim_name,
NULL::VARCHAR    AS locality,
NULL::INTEGER    AS collapsed_count,
```

**ARM 4 actual selects** (around line 240) — add after `cl.ObjectID::INTEGER AS checklist_id`:
```sql
cl.verbatim_name,
cl.locality,
cl.collapsed_count::INTEGER AS collapsed_count,
```
Note: `::INTEGER` cast is required — `int_checklist_collapsed` computes `collapsed_count` as `COUNT(*)` which DuckDB returns as BIGINT.

Column position relative to ARM 4 header structure (lines 197–244): the three new selects fit between `checklist_id` (line 240) and the closing `FROM {{ ref('int_checklist_dedup_status') }} cl` (line 241).

---

### `data/dbt/models/marts/schema.yml` — bump 34 → 37 columns

**Analog:** existing `checklist_id` entry (lines 72–74):
```yaml
      - name: checklist_id
        data_type: integer
```

Add three entries after `checklist_id` (before the `taxon_id` block starting at line 75):
```yaml
      - name: verbatim_name
        data_type: varchar
      - name: locality
        data_type: varchar
      - name: collapsed_count
        data_type: integer
```
No `data_tests` needed on these columns — they are nullable by design.

---

### `data/dbt/models/intermediate/int_species_universe.sql` — fix `checklist_count_agg` CTE

**Analog:** `inat_obs_count_agg` CTE (lines 56–63) — reads source directly to avoid circular DAG, same motivation as the fix.

**Current `checklist_count_agg` CTE** (lines 44–51):
```sql
checklist_count_agg AS (
    -- Separate CTE for total checklist_count — does NOT filter by month IS NOT NULL
    -- so that all checklist records (including those with unknown month) are counted.
    SELECT canonical_name, COUNT(*) AS checklist_count
    FROM {{ ref('checklist') }}
    WHERE canonical_name IS NOT NULL
    GROUP BY canonical_name
),
```
Replace with (RESEARCH.md §UIX-04):
```sql
checklist_count_agg AS (
    -- UIX-04: Re-sourced from int_checklist_dedup_status (deduped promoted arm)
    -- so checklist_count equals the actual point record count in occurrences.parquet.
    -- Previously read ref('checklist') (county-level mart, 42k rows) — wrong post-Phase-137.
    SELECT canonical_name, COUNT(*) AS checklist_count
    FROM {{ ref('int_checklist_dedup_status') }}
    WHERE canonical_name IS NOT NULL
      AND dedup_status IS DISTINCT FROM 'confirmed'
      AND lat IS NOT NULL AND lon IS NOT NULL
    GROUP BY canonical_name
),
```
The `checklist_month_agg` CTE above it (lines 19–43) still reads `ref('checklist')` for the month histogram — that is a separate decision not in Phase 138 scope.

---

## Shared Patterns

### Source-toggle event flow
**Source:** `src/bee-pane.ts` `_onSourceToggle` + `src/bee-atlas.ts` `_onSourceFilterChanged`
**Apply to:** The checklist toggle entry in `_renderSources`

The canonical flow:
1. User checks/unchecks → `_onSourceToggle('checklist', checked)` in bee-pane
2. Dispatches `'source-filter-changed'` with `{ hiddenSources: Set<SourceKey> }`
3. bee-atlas `_onSourceFilterChanged` sets `this._hiddenSources = e.detail.hiddenSources` and calls `this._replaceUrlState()`
4. bee-map receives updated `hiddenSources` prop → applies `WHERE source IN (...)` via the filter state path

### CSS class vocabulary for detail cards
**Source:** `src/bee-occurrence-detail.ts` styles (lines 51–162)
**Apply to:** `_renderChecklist` method

| Class | Purpose |
|---|---|
| `.panel-content.sample-dot-detail` | outer container (flex column, gap 0.4rem) |
| `.inat-id-label` | taxon name line |
| `.event-date` | date line (serif font) |
| `.event-observer` | collector/observer line (muted) |
| `.event-host` | locality / floral host line (hint color) |
| `.event-count` | count / collapsed-count line (hint color) |
| `.hint` | muted italic text — attribution, fallback states |

### NULL-cast column pattern in `int_combined.sql`
**Source:** `data/dbt/models/intermediate/int_combined.sql` ARMs 1–3 (lines 47, 103, 182)
**Apply to:** The three new columns in each ARM

Pattern: `NULL::TYPE AS column_name` — explicit type cast on NULL ensures the UNION ALL can resolve column types without inference errors. Use `NULL::VARCHAR` for string columns and `NULL::INTEGER` for integer columns. ARM 4 always provides the real values; ARMs 1–3 always use typed NULLs.

### dbt contract bump
**Source:** `data/dbt/models/marts/schema.yml` (lines 72–74 — `checklist_id` as Phase 137 template)
**Apply to:** The 3 new column entries

CLAUDE.md invariant: "the dbt 33-column contract on `marts/occurrences` is enforced at every `bash data/dbt/run.sh build`; there is no separate JS schema validator." Adding 3 columns means every build will fail until both `int_combined.sql` AND `schema.yml` are updated together. Update both in the same wave.

---

## No Analog Found

All files have analogs. No entries needed here.

---

## Test Gaps (Wave 0 — tests to create before implementation)

Per RESEARCH.md §Wave 0 Gaps:

| Test File | What to Write | Why Needed |
|---|---|---|
| `src/tests/url-state.test.ts` (existing) | Update MAP-03 tests: `parseParams('src=ecdysis')` now produces `{inat_obs, waba_sample, checklist}` not `{inat_obs, waba_sample}`; add `src=checklist` round-trip test | Pitfall 3 — tests will fail without update |
| `src/tests/bee-occurrence-detail.test.ts` (new or extend) | `formatRomanDate` null guard, length-4 (year-only), length-7 (month-precision, currently dead but correct) | Pitfall 4 — null input throws today |
| `data/tests/test_species_checklist_count.py` (new) | Assert `checklist_count` in `species.parquet` equals `COUNT(*)` from `int_checklist_dedup_status` with dedup+coord filter | UIX-04 — verify CTE fix |

---

## Metadata

**Analog search scope:** `src/`, `data/dbt/models/`
**Files read:** 12 source files
**Pattern extraction date:** 2026-06-08
