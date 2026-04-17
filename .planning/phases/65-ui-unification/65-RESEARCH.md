# Phase 65: UI Unification - Research

**Researched:** 2026-04-17
**Domain:** Lit web components, TypeScript frontend refactoring
**Confidence:** HIGH

## Summary

Phase 65 completes the v2.7 Unified Occurrence Model milestone by removing all dual-source UI
artifacts. The work is a pure deletion and consolidation exercise within a well-understood
codebase: three new/modified components replace five existing ones, two filter.ts return types
collapse into one, and a handful of state fields in bee-atlas.ts are eliminated.

The technical risk is low because the occurrences table already exists (Phase 63) with all
required columns, OccurrenceSource already loads all features as unified OL features (Phase 64),
and the feature property access pattern (`f.get('column_name')`) is established throughout
bee-map.ts. The main work is wiring the unified data path through to the UI components that
still branch on `layerMode`.

Every locked decision in CONTEXT.md is unambiguous and fully specified. The planner should
follow the CONTEXT.md decisions and UI-SPEC verbatim — this phase does not require any design
research. The only discretion area is whether to keep the disabled "Species" / "Plants" tab
stubs in bee-header; they can be removed or kept as-is.

**Primary recommendation:** Sequence work as three waves — (1) filter.ts data types and
queries, (2) new bee-occurrence-detail component + bee-sidebar wiring, (3) bee-table, bee-atlas,
bee-map, bee-header cleanup and test updates. Each wave is independently testable.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

All implementation decisions were placed in Claude's Discretion by the user — see below.

### Claude's Discretion

- **D-01:** `<bee-occurrence-detail>` receives a flat array of raw occurrence row objects.
  Specimen-backed rows (`ecdysis_id` non-null): existing grouped-by-sample display.
  Sample-only rows (`ecdysis_id` null): compact entry (date, observer, specimen_count, iNat
  link). Mixed clusters: specimen groups first, then sample-only entries with a visual separator.
  Null fields omitted entirely. `_restoreSelectionSamples` and `_restoreClusterSelection`
  updated to handle sample-only IDs (no longer skip `ecdysis_id == null` rows).

- **D-02:** Single `OCCURRENCE_COLUMN_DEFS` replaces `SPECIMEN_COLUMN_DEFS` and
  `SAMPLE_COLUMN_DEFS`. Columns: Date, Species, Collector, Observer, County, Ecoregion,
  Elev (m), Field #, Modified, Photo. `OccurrenceRow` type in `filter.ts` replaces
  `SpecimenRow | SampleRow`. `queryTablePage` and `queryAllFiltered` drop `layerMode`
  parameter and return all occurrences ordered by date desc.

- **D-03:** `queryVisibleIds` returns `Set<string>` (combined ecdysis + inat IDs) instead of
  `{ ecdysis: Set<string>; samples: Set<string> }`. `bee-atlas.ts` replaces
  `_visibleEcdysisIds` / `_visibleSampleIds` with single `_visibleIds: Set<string> | null`.
  `bee-map.ts` property becomes `visibleIds`. `makeClusterStyleFn` updated accordingly.

- **D-04:** Remove `_layerMode` state, `_onLayerChanged` handler, `layerMode` property from
  `bee-header`, `bee-map`, `bee-atlas`, `bee-table`. Remove `layerMode` from url-state params
  (`ui.layerMode` key). Remove `bee-header` layer tab buttons. `buildCsvFilename` no longer
  takes `layerMode`. `makeSampleDotStyleFn` in `style.ts` deleted.

### Deferred Ideas (OUT OF SCOPE)

- All sidebar detail display decisions — revisit in v2.9
- All table column design decisions — revisit in v2.9
- Filter highlight behavior for sample-only dots (being fixed, but visual treatment open for v2.9)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OCC-08 | `<bee-occurrence-detail>` replaces `<bee-specimen-detail>` and `<bee-sample-detail>`; renders specimen columns, sample columns, or both based on nullability (null-omit pattern) | D-01, UI-SPEC component inventory; `buildSamples()` in bee-map.ts provides grouping model to copy |
| OCC-09 | `bee-atlas` coordinator and `bee-map` updated for single occurrence layer; `layerMode` toggle removed | D-03, D-04; all layerMode callsites catalogued below |
| OCC-10 | `<bee-table>` updated for unified occurrences schema; specimen vs sample column sets merged | D-02, UI-SPEC table contract; `OCCURRENCE_COLUMN_DEFS` spec fully defined |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Occurrence detail rendering | Browser / Client (`<bee-occurrence-detail>`) | — | Pure presenter; all data arrives as OL feature properties |
| Sidebar routing (which detail to show) | Browser / Client (`<bee-sidebar>`) | — | Thin shell; no business logic |
| Filter query (visibleIds) | Browser / Client (`filter.ts` SQLite) | — | wa-sqlite runs in browser; no server |
| Map layer highlight | Browser / Client (`bee-map` + `style.ts`) | — | OL style function consumes `visibleIds` getter |
| Table column data | Browser / Client (`filter.ts` SQLite) | — | `queryTablePage` returns rows directly |
| URL state serialization | Browser / Client (`url-state.ts`) | — | Client-only; static hosting |
| coordinator / state owner | Browser / Client (`bee-atlas`) | — | Architecture invariant per CLAUDE.md |

---

## Standard Stack

### Core (all verified against source)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Lit | 3.x (already in use) | Web component base class | Entire frontend uses Lit; `@customElement`, `@property`, `@state` decorators | [VERIFIED: frontend/src/*.ts]
| TypeScript | 5.x (already in use) | Type safety | All source is .ts | [VERIFIED: frontend/src/*.ts]
| wa-sqlite | already in use | In-browser SQLite for filter queries | Established in Phase 63 | [VERIFIED: frontend/src/filter.ts]
| OpenLayers | 10.8.0 (already in use) | Map features | OccurrenceSource, Cluster, VectorLayer | [VERIFIED: bee-map.ts render()]

No new dependencies required for this phase.

---

## Architecture Patterns

### System Architecture Diagram

```
OL click event
     |
     v
bee-map (click handler)
  - reads feature properties via f.get('column_name')
  - filters by visibleIds (unified Set<string> | null)
  - builds occIds array + raw feature objects
     |
     v  map-click-occurrence event {occIds, rawFeatures}
     |
bee-atlas (coordinator)
  - stores _selectedOccIds + raw occurrence rows
  - passes rows to bee-sidebar as .occurrences property
     |
     v  .occurrences prop
     |
bee-sidebar (thin shell)
  - renders <bee-occurrence-detail> when occurrences != null
     |
     v  .occurrences prop (flat array of OL feature property objects)
     |
bee-occurrence-detail
  - splits rows: ecdysis_id != null -> specimen groups, null -> sample-only entries
  - renders specimen groups first, then separator, then sample-only entries
```

Filter data flow (async):
```
FilterState change in bee-atlas
     |
     v  queryVisibleIds(f) -> Set<string> | null
     |
_visibleIds in bee-atlas
     |
     v  .visibleIds prop
     |
bee-map -> clusterSource.changed() -> makeClusterStyleFn() callback
```

### Recommended Project Structure

No new directories needed. All work is modification/deletion of existing files in
`frontend/src/` and `frontend/src/tests/`.

New file:
```
frontend/src/bee-occurrence-detail.ts    # new component (replaces two)
```

Files deleted:
```
frontend/src/bee-specimen-detail.ts
frontend/src/bee-sample-detail.ts
```

### Pattern 1: Null-omit rendering in Lit

**What:** Conditionally render a section only when its discriminating column is non-null.
**When to use:** All fields in `<bee-occurrence-detail>` that are per-source.

```typescript
// Source: existing bee-specimen-detail.ts / bee-sample-detail.ts pattern
// Specimen-backed section:
${row.ecdysis_id != null ? html`...specimen content...` : ''}

// Sample-only section:
${row.ecdysis_id == null && row.observation_id != null ? html`...sample content...` : ''}
```

### Pattern 2: Feature property access (established Phase 64)

**What:** All occurrence columns available as OL feature properties.

```typescript
// Source: bee-map.ts buildSamples() (line 28-51)
const key = `${f.get('year')}-${f.get('month')}-${f.get('recordedBy')}-${f.get('fieldNumber')}`;
const ecdysisId = f.get('ecdysis_id') as number | null;
const obsId = f.get('observation_id') as number | null;
```

### Pattern 3: Coordinator passes raw rows to detail component

**What:** `bee-atlas` collects occurrence rows from clicked features (or from SQLite for URL
restoration) and passes them directly to `<bee-occurrence-detail>` via `bee-sidebar`.

The `_restoreSelectionSamples` method currently skips `ecdysis_id == null` rows (line 758 in
bee-atlas.ts). Phase 65 removes that skip so sample-only rows also populate the sidebar.
The `_restoreClusterSelection` method similarly skips `ecdysis_id == null` at line 843.

### Anti-Patterns to Avoid

- **Keeping `Sample[]` intermediate type:** The `Sample` interface in bee-sidebar.ts groups
  specimens by year/month/collector. Phase 65 moves this grouping logic into
  `<bee-occurrence-detail>` itself; `bee-sidebar` passes raw occurrence rows, not pre-grouped
  `Sample` objects. The `Sample` / `Specimen` / `SampleEvent` interfaces in bee-sidebar.ts
  become unused and should be removed.

- **Leaving `layerMode` defaulting instead of removing it:** Any property that defaults to
  `'specimens'` but is never set will silently exclude sample-only rows from table queries.
  Fully remove the parameter — do not leave it with a constant default.

- **Cache bypass in makeClusterStyleFn not updated:** The style cache currently checks
  `visibleEcdysisIds !== null` as the `hasFilter` signal. After renaming to `visibleIds`, the
  check must still cover all filter-active cases (including inat-only rows).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date formatting for sidebar | Custom formatter | Copy `_formatSampleDate` from `bee-sample-detail.ts` | Already handles timezone edge case (bare ISO dates parse as UTC) |
| Specimen grouping | New grouping algorithm | Copy `buildSamples()` from `bee-map.ts:28-51` | Proven grouping; handles year/month/collector/fieldNumber key |
| Month name formatting | Custom formatter | Copy `_formatMonth` from `bee-specimen-detail.ts:77-80` | Uses `Intl.DateTimeFormat` correctly |

---

## Callsite Inventory — `layerMode` References to Remove

All occurrences verified by reading source. [VERIFIED: codebase grep]

### `bee-atlas.ts`
- `@state() private _layerMode` (line 36) — delete
- `_onLayerChanged` method (line 643-656) — delete
- `buildParams(..., { layerMode: this._layerMode, ... })` (lines 265, 439) — remove `layerMode` from object
- `parseParams` result `initLayerMode` (lines 213-215) — remove
- `this._layerMode = initLayerMode` (line 215) — remove
- `this._layerMode = parsed.ui?.layerMode ?? 'specimens'` (line 479) — remove
- Passes `.layerMode=${this._layerMode}` to `<bee-header>`, `<bee-map>`, `<bee-table>`, `<bee-filter-toolbar>` — remove from all four
- `queryTablePage(this._filterState, this._layerMode, ...)` (line 412) — remove `this._layerMode` arg
- `queryAllFiltered(this._filterState, this._layerMode, ...)` (line 684) — remove arg
- `buildCsvFilename(this._filterState, this._layerMode)` (line 702) — remove arg
- `@layer-changed=${this._onLayerChanged}` in render() — remove

### `bee-atlas.ts` — `_visibleEcdysisIds` / `_visibleSampleIds` → `_visibleIds`
- `@state() private _visibleEcdysisIds` (line 34) — replace with `_visibleIds`
- `@state() private _visibleSampleIds` (line 35) — remove
- `this._visibleEcdysisIds = new Set()` (line 239) — replace with `this._visibleIds = new Set()`
- `this._visibleSampleIds = new Set()` (line 240) — remove
- `_runFilterQuery`: destructure `{ ecdysis, samples }` → single `ids` (lines 300-304)
- `this._visibleEcdysisIds = ecdysis` → `this._visibleIds = ids` (line 303) — update
- `this._visibleSampleIds = samples` (line 304) — remove
- `.visibleEcdysisIds=${...}` and `.visibleSampleIds=${...}` props on `<bee-map>` — replace with `.visibleIds=${this._visibleIds}`
- `else { this._visibleEcdysisIds = null; this._visibleSampleIds = null; }` (lines 509-510) — replace with `this._visibleIds = null`

### `bee-atlas.ts` — `_selectedSamples` / `_selectedSampleEvent`
- `@state() private _selectedSamples` (line 44) — replace with `_selectedOccurrences` (or rename to match new type)
- `@state() private _selectedSampleEvent` (line 45) — remove
- `.samples=${this._selectedSamples}` and `.selectedSampleEvent=${this._selectedSampleEvent}` on `<bee-sidebar>` — replace with `.occurrences=${this._selectedOccurrences}`
- All assignments to `_selectedSamples` and `_selectedSampleEvent` — update
- `_restoreSelectionSamples`: remove early return at line 758 that skips `ecdysis_id == null`; change to return raw occurrence rows instead of `Sample[]`
- `_restoreClusterSelection`: remove `if (obj.ecdysis_id == null) continue` at line 843; collect raw rows for all features

### `bee-map.ts`
- `@property() layerMode` (line 135) — remove
- `@property() visibleEcdysisIds` (line 137) — replace with `visibleIds`
- `@property() visibleSampleIds` (line 138) — remove
- `changedProperties.has('visibleEcdysisIds') || changedProperties.has('visibleSampleIds')` (line 266) — update to `visibleIds`
- `_emitFilteredSummary()`: currently checks `this.visibleEcdysisIds !== null` and filters to `ecdysis:` IDs — update to `this.visibleIds !== null`; keep ecdysis-only filter for summary stats (summary is still specimen-only)
- click handler: `this.visibleEcdysisIds !== null ? inner.filter(...) : inner` (line 449) — update to `this.visibleIds`
- `makeClusterStyleFn(() => this.visibleEcdysisIds, ...)` (line 370) — update to `() => this.visibleIds`

### `bee-map.ts` — `buildSamples` fate
- `buildSamples` is used in the click handler (line 461, 469) to pass `samples` to the
  `map-click-occurrence` event. After Phase 65 the event payload changes from
  `{ samples: Sample[], occIds: string[] }` to `{ occurrences: OccurrenceRow[], occIds: string[] }`.
  Collect raw feature property objects instead of calling `buildSamples`.
  `buildSamples` can then be deleted.
- `_buildRecentSampleEvents()` (line 332): appears not to be consumed anywhere (the `data-loaded`
  event in `firstUpdated` passes `recentEvents: this._buildRecentSampleEvents()` at line 414 but
  `bee-atlas._onDataLoaded` does not use `recentEvents`). Delete along with `SampleEvent` import
  from bee-sidebar.ts if no other callsite remains.

### `bee-header.ts`
- `@property() layerMode` — remove
- `_renderTabItems()` returns Specimens / Samples buttons — remove those two buttons
  (keep or remove the disabled Species / Plants stubs per Claude's discretion)
- `_onLayerClick` method — remove
- `layer-changed` event dispatch — remove
- CSS for `.tab-btn` and `.inline-tabs` — can remain (still used by view tabs) or be cleaned up

### `bee-table.ts`
- `@property() layerMode` — remove
- `const cols = this.layerMode === 'specimens' ? SPECIMEN_COLUMN_DEFS : SAMPLE_COLUMN_DEFS` (line 230) — replace with `const cols = OCCURRENCE_COLUMN_DEFS`
- Sort guard `this.layerMode === 'specimens' && (col.key === 'date' || col.key === 'modified')` (line 253) — simplify to `col.key === 'date' || col.key === 'modified'`
- `const noun = this.layerMode === 'specimens' ? 'specimens' : 'samples'` (line 231) — replace with `'occurrences'`
- Row count text "X of N specimens/samples" → "X of N occurrences" (UI-SPEC)
- Delete `SPECIMEN_COLUMN_DEFS`, `SAMPLE_COLUMN_DEFS` constants
- Import `OccurrenceRow` from filter.ts, remove `SpecimenRow`, `SampleRow` imports

### `filter.ts`
- `queryVisibleIds`: merge two queries into one or combine result sets; return `Set<string>` (not object)
- `queryTablePage`: remove `layerMode` param; remove `discriminator` (`ecdysis_id IS NOT NULL` / `observation_id IS NOT NULL`); unify `selectCols` using `OCCURRENCE_COLUMNS`; return `OccurrenceRow[]`
- `queryAllFiltered`: remove `layerMode` param; remove `discriminator`; unify `selectCols`
- `buildCsvFilename`: remove `layerMode` param; filename prefix becomes `'occurrences'`
- Delete `SpecimenRow`, `SampleRow` interfaces
- Delete `SPECIMEN_COLUMNS`, `SAMPLE_COLUMNS` constants (or keep under new name as `OCCURRENCE_COLUMNS`)
- Add `OccurrenceRow` interface covering all columns needed by table + detail
- `SPECIMEN_ORDER_MODIFIED` remains valid (still need sortBy=modified path)
- Unify order: primary `date DESC` for all occurrences (matches D-02)

### `url-state.ts`
- Remove `layerMode: 'specimens' | 'samples'` from `UiState` interface
- Remove `lm` param in `buildParams` (line 50: `if (ui.layerMode !== 'specimens') params.set('lm', ...)`)
- Remove `lmRaw` / `layerMode` parsing in `parseParams` (lines 167-168)
- Update `UiState.layerMode` reference in the "Include UI when non-default" guard (line 175-176)

### `style.ts`
- Delete `makeSampleDotStyleFn` function (lines 137-171)
- Delete associated `sampleStyleCache`, `sampleStyleCacheActive`, `GHOSTED_SAMPLE_STYLE`, `SAMPLE_RECENCY_COLORS`, `SAMPLE_RECENCY_COLORS_ACTIVE` constants IF they are only used by `makeSampleDotStyleFn`
- Note: `GHOSTED_SAMPLE_STYLE` is defined at module level but only referenced inside `makeSampleDotStyleFn` — safe to delete with the function

### `bee-filter-toolbar.ts`
- `@property() layerMode` (line 15) — remove
- Verify whether layerMode is used in the toolbar body for anything visible; from the excerpt it appears to just be received but not used in any visible logic

---

## Common Pitfalls

### Pitfall 1: `_restoreSelectionSamples` still skips sample-only rows
**What goes wrong:** After renaming, the early return `if (ecdysisIds.length === 0) return` (line 758) will silently swallow any URL that contains only `inat:` IDs, showing a blank sidebar.
**Why it happens:** The current implementation only builds `Sample[]` from ecdysis-backed rows; sample-only rows were never handled.
**How to avoid:** Replace the entire method body. New behaviour: query all rows matching the `occIds` array (both `ecdysis:` and `inat:` prefixes), return raw occurrence row objects.
**Warning signs:** Clicking a sample-only dot, then copying the URL and pasting it in a new tab shows an empty sidebar.

### Pitfall 2: `makeClusterStyleFn` `hasFilter` check is wrong after rename
**What goes wrong:** `makeClusterStyleFn` currently receives `getVisibleEcdysisIds` — if the new getter is named `getVisibleIds` but the `hasFilter` logic still only checks ecdysis IDs, sample-only dots will not be ghosted when a filter is active.
**Why it happens:** The style function reads the getter on every render; if sample `inat:` IDs are in `visibleIds` but `hasFilter` is derived from a wrong check, highlights will be wrong.
**How to avoid:** The `hasFilter` variable should be `activeIds !== null` where `activeIds = getVisibleIds()`. The `matchCount` loop checks `activeIds.has(f.getId())` which correctly handles both ID prefixes.

### Pitfall 3: `bee-table` sort guard references removed `layerMode`
**What goes wrong:** `isSortable = this.layerMode === 'specimens' && (col.key === 'date' || col.key === 'modified')` — after removing `layerMode`, this expression is always false if left as-is (or a compile error).
**How to avoid:** Simplify to `col.key === 'date' || col.key === 'modified'` (sorting applies to both row types in unified view).

### Pitfall 4: `buildCsvFilename` tests still pass `layerMode`
**What goes wrong:** `filter.test.ts` lines 165-219 all call `buildCsvFilename(f, 'specimens')` or `'samples'`. After removing the param, these calls will fail to compile.
**How to avoid:** Update all `buildCsvFilename` test calls; update expected filenames to use `'occurrences'` prefix.

### Pitfall 5: `queryTablePage` test asserts `ecdysis_id IS NOT NULL` / `observation_id IS NOT NULL`
**What goes wrong:** `filter.test.ts` lines 295-303 assert that `ecdysis_id IS NOT NULL` appears in the SQL for specimens mode. After removing `layerMode`, these discriminator clauses are gone.
**How to avoid:** Update the test assertions — the new queries should have no such discriminator (all rows returned).

### Pitfall 6: bee-sidebar test asserts presence of `bee-specimen-detail` and `bee-sample-detail`
**What goes wrong:** `bee-sidebar.test.ts` lines 155-163 check that `bee-sidebar.ts` contains `bee-specimen-detail` and `bee-sample-detail` tags. These will fail after Phase 65.
**How to avoid:** Replace those two assertions with a test that `bee-sidebar.ts` contains `bee-occurrence-detail`.

### Pitfall 7: bee-atlas test asserts `visibleEcdysisIds` and `visibleSampleIds` on BeeMap props
**What goes wrong:** `bee-atlas.test.ts` lines 63-66 assert `props.has('visibleEcdysisIds')` and `props.has('visibleSampleIds')`. After rename to `visibleIds`, these assertions fail.
**How to avoid:** Update to `props.has('visibleIds')` and remove `visibleEcdysisIds`/`visibleSampleIds` assertions. Add `props.has('layerMode')` → `false` assertion.

### Pitfall 8: `BeeSidebar` property interface test
**What goes wrong:** `bee-sidebar.test.ts` SIDE-01 test (line 321) checks `props.has('samples')` and `props.has('selectedSampleEvent')`. After Phase 65 these are replaced by a single `occurrences` property.
**How to avoid:** Update the property assertions to check `props.has('occurrences')` only, and assert the old names are gone.

---

## Code Examples

### OccurrenceRow interface (filter.ts)

```typescript
// Replaces SpecimenRow | SampleRow
export interface OccurrenceRow {
  // Unified (always populated)
  lat: number;
  lon: number;
  date: string;
  county: string | null;
  ecoregion_l3: string | null;
  // Specimen-side (null for sample-only rows)
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
  // Sample-side (null for specimen-only rows)
  observation_id: number | null;
  observer: string | null;
  specimen_count: number | null;
  sample_id: number | null;
}
```

### Unified queryVisibleIds (filter.ts)

```typescript
// Returns a single combined set; null when no filter active
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

### bee-occurrence-detail structure (new component)

```typescript
// Source: derived from bee-specimen-detail.ts and bee-sample-detail.ts patterns
@customElement('bee-occurrence-detail')
export class BeeOccurrenceDetail extends LitElement {
  @property({ attribute: false }) occurrences: OccurrenceRow[] = [];

  render() {
    const specimenBacked = this.occurrences.filter(r => r.ecdysis_id != null);
    const sampleOnly = this.occurrences.filter(r => r.ecdysis_id == null);
    const specimenGroups = buildSamples(specimenBacked);  // grouping logic from bee-map.ts
    return html`
      ${specimenGroups.map(group => this._renderSpecimenGroup(group))}
      ${specimenGroups.length > 0 && sampleOnly.length > 0
        ? html`<hr class="separator">` : ''}
      ${sampleOnly.map(row => this._renderSampleOnly(row))}
    `;
  }
}
```

### makeClusterStyleFn updated signature (style.ts)

```typescript
// After D-03: renamed parameter; logic unchanged
export function makeClusterStyleFn(
  getVisibleIds: () => Set<string> | null,  // was getVisibleEcdysisIds
  getSelectedOccIds: () => Set<string> | null = () => null,
): (feature: FeatureLike) => Style | Style[] {
  return function clusterStyleFn(feature: FeatureLike): Style | Style[] {
    const activeIds = getVisibleIds();  // was activeEcdysisIds
    const hasFilter = activeIds !== null;
    // ...rest of logic unchanged; matchCount uses activeIds.has(f.getId())
  };
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate `EcdysisSource` + `SampleSource` | `OccurrenceSource` (unified) | Phase 64 | All features share one layer |
| `layerMode` toggle in header | Removed in Phase 65 | This phase | Single unified view |
| `SpecimenRow \| SampleRow` return type | `OccurrenceRow` | This phase | Type-safe null checks replace branch on layerMode |
| Two separate detail components | `<bee-occurrence-detail>` | This phase | Null-omit pattern renders only applicable fields |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `_buildRecentSampleEvents` result (`recentEvents`) is not consumed in `bee-atlas._onDataLoaded` | Callsite Inventory | If consumed, deleting it would break a feature — check before deleting |
| A2 | `bee-filter-toolbar.ts` does not use `layerMode` for any visible UI logic | Callsite Inventory | If it does, another update is needed in that file |

---

## Open Questions

1. **`_buildRecentSampleEvents` fate**
   - What we know: It is called in `firstUpdated` and passed as `recentEvents` in the `data-loaded` event. `bee-atlas._onDataLoaded` receives it but does not assign it anywhere (line 725-730).
   - What's unclear: Was this used by a removed feature, or is it plumbing for a future feed feature?
   - Recommendation: Delete it in Phase 65 (it is dead code); if the feed feature needs it later it can be re-added.

2. **`bee-filter-toolbar` `layerMode` usage**
   - What we know: The property is declared at line 15 with no visible branch on it in the first 50 lines of the file.
   - What's unclear: Whether the remainder of the toolbar uses it for anything visible.
   - Recommendation: Planner should read the full file during task scoping and confirm removal is complete.

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies; all work is TypeScript file edits and test updates
within the existing Node.js frontend project).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (already configured) |
| Config file | `frontend/vite.config.ts` |
| Quick run command | `npm --prefix frontend run test -- --reporter=dot` |
| Full suite command | `npm --prefix frontend run test` |

**Current baseline:** 175 tests passing across 7 test files (verified 2026-04-17). [VERIFIED: npm run test output]

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OCC-08 | `<bee-occurrence-detail>` renders specimen groups | unit | `npm --prefix frontend run test -- --reporter=dot` | ❌ Wave 0 |
| OCC-08 | `<bee-occurrence-detail>` renders sample-only entries | unit | same | ❌ Wave 0 |
| OCC-08 | `<bee-occurrence-detail>` null-omit: no placeholder dashes | unit | same | ❌ Wave 0 |
| OCC-09 | `bee-map` has `visibleIds` property (not `visibleEcdysisIds`/`visibleSampleIds`) | unit | same | ❌ needs update |
| OCC-09 | `bee-atlas` has no `_layerMode` state | static source check | same | ❌ needs update |
| OCC-10 | `bee-table` renders unified column headers (10 cols, no layerMode branch) | unit | same | ❌ needs update |
| OCC-10 | Table empty state says "occurrences" not "specimens" | unit | same | ❌ needs update |
| — | `queryVisibleIds` returns `Set<string> \| null` | unit | same | ❌ needs update |
| — | `queryTablePage` SQL has no discriminator | unit | same | ❌ needs update |
| — | `buildCsvFilename` uses 'occurrences' prefix | unit | same | ❌ needs update |

### Sampling Rate
- **Per task commit:** `npm --prefix frontend run test -- --reporter=dot`
- **Per wave merge:** `npm --prefix frontend run test`
- **Phase gate:** Full suite green (175+ tests) before `/gsd-verify-work`

### Wave 0 Gaps

New test coverage needed (add alongside implementation):
- [ ] `frontend/src/tests/bee-occurrence-detail.test.ts` — covers OCC-08 rendering cases
- Update `frontend/src/tests/bee-sidebar.test.ts` — replace DECOMP-02 / DECOMP-03 / DECOMP-04 assertions for deleted components; add OCC-08 assertions for `bee-occurrence-detail`
- Update `frontend/src/tests/bee-atlas.test.ts` — replace `visibleEcdysisIds`/`visibleSampleIds` ARCH-02 assertions with `visibleIds`; remove `layerMode` assertions
- Update `frontend/src/tests/bee-table.test.ts` — remove `layerMode` prop usage; assert 10 unified columns; assert "occurrences" copy
- Update `frontend/src/tests/filter.test.ts` — remove `layerMode` from `queryTablePage` calls; update `buildCsvFilename` calls and expected filenames; update SQL discriminator assertions

---

## Security Domain

Step skipped — `security_enforcement` is not set in config.json. The phase involves no
authentication, no server-side processing, no new external data inputs, and no cryptographic
operations. All changes are client-side TypeScript UI refactoring against an existing static
data file.

---

## Sources

### Primary (HIGH confidence)
- All findings derived from direct reading of current source files in `/Users/rainhead/dev/beeatlas/frontend/src/` [VERIFIED: Read tool]
- Test baseline count verified via `npm --prefix frontend run test` [VERIFIED: shell]
- Parquet schema from `scripts/validate-schema.mjs` [VERIFIED: Read tool]

### Secondary (MEDIUM confidence)
- UI-SPEC from `.planning/phases/65-ui-unification/65-UI-SPEC.md` [VERIFIED: Read tool]
- CONTEXT.md decisions [VERIFIED: Read tool]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all libraries already in use
- Architecture: HIGH — all callsites inventoried from live source; patterns directly from existing code
- Pitfalls: HIGH — derived from reading existing test assertions and code branches; all are verifiable

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (stable codebase; risk is only from parallel work on same branch)
