# Phase 40: bee-table Component - Research

**Researched:** 2026-04-07
**Domain:** Lit web components, DuckDB WASM, tabular data display
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** The table fills the full available height of the map area (viewport minus the top bar). Rows scroll internally inside the table body — the column headers and the pagination bar stay fixed in view at all times.

**D-02:** The sidebar stays visible. The table occupies the space where `<bee-map>` was; sidebar remains on the right with toggle + filter controls.

**D-03:** Pagination controls (← Prev / 1–100 of N → Next) are anchored at the bottom of the table area, outside the scrollable row region.

**D-04:** All cells truncate with `overflow: hidden; text-overflow: ellipsis` at a fixed column width. The full value is shown in a native browser tooltip (`title` attribute) on hover.

**D-05:** Row height is uniform (single line per row). No wrapping.

**D-06:** Sort column and sort direction are encoded in the URL (e.g. `sort=year&dir=desc`). `UiState` in `url-state.ts` gains `sortColumn` and `sortDir` fields; `buildParams` omits them when they match the default; `parseParams` restores them.

**D-07:** Default sort: **year descending** — most recent specimens first. Applied when no `sort` param is present in the URL.

**D-08:** Current page number is **ephemeral** — resets to page 1 on every load, URL share, or filter change. Not URL-encoded.

**D-09:** When the filter changes, page resets to 1 automatically.

### Claude's Discretion

- `bee-table` (or a helper in `filter.ts`) executes a DuckDB `SELECT … ORDER BY … LIMIT 100 OFFSET …` query with the same `WHERE` clause logic as `queryVisibleIds`. `bee-atlas` owns `_sortColumn`, `_sortDir`, and `_tablePage` as `@state()` fields. `bee-table` receives these as `@property()` inputs and emits `sort-changed` / `page-changed` events upward — following the established event-up/property-down pattern.

- Row count (total matching rows) comes from a separate `SELECT COUNT(*)` query (or reuse from `filteredSummary` if available) — not from loading all rows.

- `bee-table` is a pure presenter (no internal state beyond render). It receives: `rows`, `rowCount`, `layerMode`, `page`, `sortColumn`, `sortDir` as properties. It emits `sort-changed` and `page-changed` events.

- The table component is registered as `<bee-table>` and replaces the `<div class="table-slot">` in `bee-atlas` render — conditional on `_viewMode === 'table'`.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope. CSV export is Phase 41.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TABLE-01 | Table displays specimens when layer mode is "specimens", samples when layer mode is "samples" | `layerMode` property drives column definition selection; `SPECIMEN_COLUMNS` vs `SAMPLE_COLUMNS` constants |
| TABLE-02 | Table reflects the active filter state — rows shown match `visibleIds` (or all rows if no filter active) | `queryTablePage` passes `buildFilterSQL` WHERE clause to DuckDB; same logic as `queryVisibleIds` |
| TABLE-03 | Table shows a row count indicator (e.g. "showing 1–100 of 3,847 specimens") | Separate `SELECT COUNT(*)` query or reuse from `filteredSummary`; row count passed as `rowCount` prop |
| TABLE-04 | Table is paginated at 100 rows/page with previous/next controls and current page display | `LIMIT 100 OFFSET (page-1)*100` in DuckDB query; Prev/Next buttons emit `page-changed` |
| TABLE-05 | User can sort by clicking a column header; clicking again reverses sort direction | `ORDER BY ${col} ${dir}` in DuckDB query; sort state in `bee-atlas` `@state()` fields; emitted via `sort-changed` |
| TABLE-06 | Specimen table columns: species, collector (recordedBy), year, month, county, ecoregion, field number | `ecdysis` table has: `scientificName`, `recordedBy`, `year`, `month`, `county`, `ecoregion_l3`, `fieldNumber` — all confirmed in `validate-schema.mjs` |
| TABLE-07 | Sample table columns: observer, date, specimen count, county, ecoregion | `samples` table has: `observer`, `date`, `specimen_count`, `county`, `ecoregion_l3` — all confirmed in `validate-schema.mjs` |
</phase_requirements>

---

## Summary

Phase 40 adds `<bee-table>`, a Lit web component that fills the `table-slot` introduced by Phase 39. The component is a pure presenter: `bee-atlas` owns all reactive state (`_sortColumn`, `_sortDir`, `_tablePage`, `_tableRows`, `_tableRowCount`) and passes it downward as properties. `bee-table` emits `sort-changed` and `page-changed` events upward. A new `queryTablePage` function in `filter.ts` (or a co-located `table-query.ts`) performs the DuckDB `SELECT … ORDER BY … LIMIT 100 OFFSET …` query using the existing `buildFilterSQL` WHERE clauses.

The implementation has high confidence because the architecture is already established in the codebase. The DuckDB query pattern is demonstrated in `queryVisibleIds`, the event-up/property-down pattern is demonstrated in `bee-sidebar`, and the URL state extension pattern is demonstrated in how `viewMode` was added in Phase 39. Column names are confirmed against the parquet schema gate (`validate-schema.mjs`). No third-party libraries are needed — this is plain Lit + CSS + DuckDB WASM.

The key risk area is query timing: `bee-atlas` must handle the async `queryTablePage` call with the same generation-counter guard pattern used by `_runFilterQuery`, so stale results from superseded filter/sort/page changes do not clobber `_tableRows`.

**Primary recommendation:** Implement `queryTablePage` in `filter.ts` (alongside `queryVisibleIds`), add `_sortColumn`/`_sortDir`/`_tablePage`/`_tableRows`/`_tableRowCount` to `bee-atlas`, extend `UiState` with `sortColumn`/`sortDir`, then build `bee-table` as a pure Lit presenter with a `<table>` element, sticky `<thead>`, scrollable `<tbody>`, and a flex pagination bar.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Lit | Already installed | `bee-table` web component base class | Project-wide component framework — no alternative [VERIFIED: existing codebase] |
| @duckdb/duckdb-wasm | Already installed | `SELECT … ORDER BY … LIMIT 100 OFFSET …` queries | Static-hosting constraint mandates WASM; already used for all data queries [VERIFIED: existing codebase] |

### Supporting

No new libraries needed. All UI (CSS custom properties, Unicode arrows), accessibility (`aria-sort`, `role="table"`), and pagination logic are hand-authored per the UI-SPEC.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-authored `<table>` | AG Grid, Tabulator | External library — contradicts static/minimal-dep constraint; overkill for 100-row pages |
| Separate COUNT(*) query | Reuse `filteredSummary.filteredSpecimens` | `filteredSummary` only counts specimens, not samples; separate COUNT(*) is more reliable and already shown in `queryVisibleIds` pattern |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended Project Structure

New files:
```
frontend/src/
├── bee-table.ts           # New: <bee-table> Lit component
└── filter.ts              # Modified: add queryTablePage()
```

Modified files:
```
frontend/src/
├── bee-atlas.ts           # Add _sortColumn, _sortDir, _tablePage, _tableRows, _tableRowCount states
│                          # Add _runTableQuery(), _onSortChanged(), _onPageChanged()
│                          # Replace <div class="table-slot"> with <bee-table ...>
│                          # Import bee-table.ts
└── url-state.ts           # Extend UiState with sortColumn/sortDir
                           # Extend buildParams/parseParams for sort/dir params
```

New test file:
```
frontend/src/tests/
└── bee-table.test.ts      # Unit tests for bee-table rendering and URL state round-trip
```

### Pattern 1: DuckDB Paginated Query (queryTablePage)

**What:** Async function that queries DuckDB for a single page of rows plus total count, using the same `buildFilterSQL` WHERE clause as `queryVisibleIds`.

**When to use:** Called from `bee-atlas._runTableQuery()` whenever `_filterState`, `_sortColumn`, `_sortDir`, or `_tablePage` changes.

```typescript
// Source: pattern derived from filter.ts queryVisibleIds [VERIFIED: codebase]
export interface SpecimenRow {
  scientificName: string;
  recordedBy: string;
  year: number;
  month: number;
  county: string;
  ecoregion_l3: string;
  fieldNumber: string;
}

export interface SampleRow {
  observer: string;
  date: string;
  specimen_count: number;
  county: string;
  ecoregion_l3: string;
}

export async function queryTablePage(
  f: FilterState,
  layerMode: 'specimens' | 'samples',
  sortCol: string,
  sortDir: 'asc' | 'desc',
  page: number
): Promise<{ rows: SpecimenRow[] | SampleRow[]; total: number }> {
  const { ecdysisWhere, samplesWhere } = buildFilterSQL(f);
  await tablesReady;
  const db = await getDuckDB();
  const conn = await db.connect();
  try {
    if (layerMode === 'specimens') {
      const offset = (page - 1) * 100;
      // DuckDB WASM does not support parameterized queries [VERIFIED: STATE.md]
      const dataResult = await conn.query(
        `SELECT scientificName, recordedBy, year, month, county, ecoregion_l3, fieldNumber
         FROM ecdysis WHERE ${ecdysisWhere}
         ORDER BY ${sortCol} ${sortDir}
         LIMIT 100 OFFSET ${offset}`
      );
      const countResult = await conn.query(
        `SELECT COUNT(*) as n FROM ecdysis WHERE ${ecdysisWhere}`
      );
      const rows = dataResult.toArray().map(r => r.toJSON() as SpecimenRow);
      const total = Number(countResult.toArray()[0]?.toJSON().n ?? 0);
      return { rows, total };
    } else {
      // samples
      const offset = (page - 1) * 100;
      const dataResult = await conn.query(
        `SELECT observer, date, specimen_count, county, ecoregion_l3
         FROM samples WHERE ${samplesWhere}
         ORDER BY ${sortCol} ${sortDir}
         LIMIT 100 OFFSET ${offset}`
      );
      const countResult = await conn.query(
        `SELECT COUNT(*) as n FROM samples WHERE ${samplesWhere}`
      );
      const rows = dataResult.toArray().map(r => r.toJSON() as SampleRow);
      const total = Number(countResult.toArray()[0]?.toJSON().n ?? 0);
      return { rows, total };
    }
  } finally {
    await conn.close();
  }
}
```

### Pattern 2: bee-atlas State and Event Handler Wiring

**What:** `bee-atlas` owns the table state and coordinates queries. Follows the `_runFilterQuery` / `_filterQueryGeneration` guard pattern exactly.

```typescript
// Source: bee-atlas.ts _runFilterQuery pattern [VERIFIED: codebase]

// New @state() fields in BeeAtlas:
@state() private _sortColumn = 'year';
@state() private _sortDir: 'asc' | 'desc' = 'desc';
@state() private _tablePage = 1;
@state() private _tableRows: SpecimenRow[] | SampleRow[] = [];
@state() private _tableRowCount = 0;
@state() private _tableLoading = false;

// Generation guard (same as _filterQueryGeneration):
private _tableQueryGeneration = 0;

private async _runTableQuery(): Promise<void> {
  this._tableLoading = true;
  const generation = ++this._tableQueryGeneration;
  const { rows, total } = await queryTablePage(
    this._filterState, this._layerMode,
    this._sortColumn, this._sortDir, this._tablePage
  );
  if (generation !== this._tableQueryGeneration) return; // stale
  this._tableRows = rows;
  this._tableRowCount = total;
  this._tableLoading = false;
}

private _onSortChanged(e: CustomEvent<{ column: string; dir: 'asc' | 'desc' }>) {
  this._sortColumn = e.detail.column;
  this._sortDir = e.detail.dir;
  this._tablePage = 1;
  this._runTableQuery();
  this._pushUrlState();
}

private _onPageChanged(e: CustomEvent<{ page: number }>) {
  this._tablePage = e.detail.page;
  this._runTableQuery();
}
```

### Pattern 3: UiState Extension for Sort Params

**What:** Extend `UiState` with optional `sortColumn`/`sortDir`; extend `buildParams`/`parseParams` to serialize/deserialize. Omit when default (year/desc).

```typescript
// Source: url-state.ts buildParams pattern [VERIFIED: codebase]
// In UiState interface:
export interface UiState {
  layerMode: 'specimens' | 'samples';
  boundaryMode: 'off' | 'counties' | 'ecoregions';
  viewMode: 'map' | 'table';
  sortColumn: string;           // new
  sortDir: 'asc' | 'desc';      // new
}

// In buildParams — omit when defaults:
if (ui.sortColumn !== 'year') params.set('sort', ui.sortColumn);
if (ui.sortDir !== 'desc') params.set('dir', ui.sortDir);

// In parseParams — restore with defaults:
const sortColumn = p.get('sort') ?? 'year';
const sortDir = (p.get('dir') === 'asc') ? 'asc' : 'desc';
```

### Pattern 4: bee-table Pure Presenter Structure

**What:** Lit component with `:host { display: flex; flex-direction: column; height: 100%; overflow: hidden }`, a sticky `<thead>`, a flex-grow `<tbody>` container with `overflow-y: auto`, and a fixed pagination bar.

```typescript
// Source: bee-sidebar.ts presenter pattern [VERIFIED: codebase]
@customElement('bee-table')
export class BeeTable extends LitElement {
  @property({ attribute: false }) rows: SpecimenRow[] | SampleRow[] = [];
  @property({ attribute: false }) rowCount = 0;
  @property({ attribute: false }) layerMode: 'specimens' | 'samples' = 'specimens';
  @property({ attribute: false }) page = 1;
  @property({ attribute: false }) sortColumn = 'year';
  @property({ attribute: false }) sortDir: 'asc' | 'desc' = 'desc';
  @property({ attribute: false }) loading = false;

  // Emits sort-changed: { column, dir }
  // Emits page-changed: { page }
}
```

### Pattern 5: Sort Header Click Logic

**What:** Clicking the active column reverses direction; clicking a different column sets ascending on that column.

```typescript
// Source: UI-SPEC.md sort interaction [VERIFIED: UI-SPEC]
private _onHeaderClick(colKey: string) {
  if (colKey === this.sortColumn) {
    const newDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    this.dispatchEvent(new CustomEvent('sort-changed', { detail: { column: colKey, dir: newDir }, bubbles: true, composed: true }));
  } else {
    this.dispatchEvent(new CustomEvent('sort-changed', { detail: { column: colKey, dir: 'asc' }, bubbles: true, composed: true }));
  }
}
```

### Pattern 6: When to Trigger queryTablePage

`_runTableQuery()` must fire whenever any of its inputs change. These triggers in `bee-atlas`:

1. `_viewMode` changes to `'table'` — initial table load
2. `_filterState` changes (via `_onFilterChanged`) — reset `_tablePage = 1` first
3. `_layerMode` changes (via `_onLayerChanged`) — reset `_tablePage = 1` and `_sortColumn`/`_sortDir` to defaults
4. `sort-changed` event from `bee-table`
5. `page-changed` event from `bee-table`

**Important:** Do NOT run `_runTableQuery()` while `_viewMode === 'map'` to avoid unnecessary DuckDB queries when the table is not visible.

### Anti-Patterns to Avoid

- **Storing sort/page state inside bee-table:** `bee-table` is a pure presenter. All state lives in `bee-atlas`. No `@state()` in `bee-table`.
- **Running queryTablePage when viewMode is 'map':** Wastes DuckDB resources. Gate the call on `this._viewMode === 'table'`.
- **Using parameterized queries:** DuckDB WASM does not support parameterized queries — use string interpolation with the same single-quote escaping already in `buildFilterSQL`. [VERIFIED: STATE.md]
- **Not closing DuckDB connections:** The `queryVisibleIds` pattern uses `finally { await conn.close() }` — `queryTablePage` must do the same.
- **Forgetting generation guard:** Without `_tableQueryGeneration`, rapid filter changes or sort clicks will cause stale results to overwrite fresh ones.
- **Forgetting to reset page on filter change:** D-09 is a locked decision. `_onFilterChanged` must set `_tablePage = 1` before calling `_runTableQuery()`.
- **SQL injection in sort column:** The sort column value comes from a user click on a predefined column key. Use a column allowlist before interpolating into SQL: only accept column keys defined in `SPECIMEN_COLUMNS` / `SAMPLE_COLUMNS`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sticky table headers | CSS position: sticky tricks | `position: sticky; top: 0` on `<thead>` inside scrollable container | Native CSS handles this correctly with `:host { overflow: hidden }` + tbody `overflow-y: auto` |
| Pagination math | Custom range calculator | `start = (page-1)*100+1`, `end = Math.min(page*100, rowCount)` | Trivial arithmetic; no library needed |
| SQL sort direction safety | Input sanitization library | Allowlist check: `['asc','desc'].includes(dir)` | Only two valid values |

**Key insight:** This phase adds no new libraries. The entire feature is DuckDB SQL + Lit templates + CSS custom properties already in the codebase.

---

## Parquet Column Verification

Confirmed column names from `scripts/validate-schema.mjs` [VERIFIED: codebase]:

**ecdysis table** (for specimen rows):
- `scientificName` — maps to "Species" column (TABLE-06)
- `recordedBy` — maps to "Collector" column (TABLE-06)
- `year` — maps to "Year" column (TABLE-06)
- `month` — maps to "Month" column (TABLE-06)
- `county` — maps to "County" column (TABLE-06)
- `ecoregion_l3` — maps to "Ecoregion" column (TABLE-06)
- `fieldNumber` — maps to "Field #" column (TABLE-06)

**samples table** (for sample rows):
- `observer` — maps to "Observer" column (TABLE-07)
- `date` — maps to "Date" column (TABLE-07)
- `specimen_count` — maps to "Specimens" column (TABLE-07)
- `county` — maps to "County" column (TABLE-07)
- `ecoregion_l3` — maps to "Ecoregion" column (TABLE-07)

**Sort column SQL name mapping** (column key in UI → SQL column name):

For specimens:
| UI Column Key | SQL Column | Notes |
|---------------|------------|-------|
| `species` | `scientificName` | String sort — alphabetical |
| `collector` | `recordedBy` | String sort |
| `year` | `year` | Integer sort (default) |
| `month` | `month` | Integer sort |
| `county` | `county` | String sort |
| `ecoregion` | `ecoregion_l3` | String sort — note `_l3` suffix |
| `fieldNumber` | `fieldNumber` | String sort |

For samples:
| UI Column Key | SQL Column | Notes |
|---------------|------------|-------|
| `observer` | `observer` | String sort |
| `date` | `date` | String/date sort |
| `specimenCount` | `specimen_count` | Integer sort — note underscore |
| `county` | `county` | String sort |
| `ecoregion` | `ecoregion_l3` | String sort — note `_l3` suffix |

**Critical:** The SQL column name is NOT always the same as the UI column key. `queryTablePage` needs a mapping from UI key to SQL column name. An allowlist map serves double duty as SQL injection protection.

---

## Common Pitfalls

### Pitfall 1: ecoregion Column Name Mismatch
**What goes wrong:** Using `ecoregion` as the SQL column name produces a DuckDB error — the actual column is `ecoregion_l3`.
**Why it happens:** The UI column key is `ecoregion` but the parquet/table column is `ecoregion_l3` (level 3 ecoregion). This asymmetry exists in `buildFilterSQL` too (it correctly uses `ecoregion_l3`).
**How to avoid:** Map UI column key to SQL column name via a constant object before constructing the query. Example: `const SQL_COLUMN = { ecoregion: 'ecoregion_l3', specimenCount: 'specimen_count', ... }`.
**Warning signs:** DuckDB error "Binder Error: Referenced column … not found" in console.

### Pitfall 2: Stale Table Query Results
**What goes wrong:** User changes filter, then immediately changes sort direction; the first (filter) query resolves after the second (sort) query started, overwriting `_tableRows` with stale data.
**Why it happens:** `queryTablePage` is async. Without a generation counter, race conditions corrupt displayed data.
**How to avoid:** Use `_tableQueryGeneration` counter identical to `_filterQueryGeneration` in `bee-atlas.ts`. Every call to `_runTableQuery()` increments the counter; the async result checks if the counter has advanced before committing.
**Warning signs:** Table shows wrong rows after rapid filter/sort interaction.

### Pitfall 3: DuckDB Connection Not Closed on Error
**What goes wrong:** If `queryTablePage` throws, the DuckDB connection leaks; subsequent queries may hang or fail.
**Why it happens:** Forgetting `finally { await conn.close() }`.
**How to avoid:** Always close the connection in a `finally` block — exactly as `queryVisibleIds` does.

### Pitfall 4: Table Query Runs While View is Map
**What goes wrong:** Filter changes in map view trigger `_runTableQuery()` unnecessarily, adding DuckDB latency to every filter interaction even when the table is hidden.
**Why it happens:** `_onFilterChanged` unconditionally calls `_runTableQuery()` if not gated.
**How to avoid:** Gate `_runTableQuery()` behind `if (this._viewMode === 'table')`. Similarly, when switching to table view (`_onViewChanged`), trigger the initial query at that point.

### Pitfall 5: Sort Column Injection
**What goes wrong:** An attacker or malformed event detail passes a SQL keyword as `column` — DuckDB executes arbitrary SQL.
**Why it happens:** String interpolation into SQL without validation.
**How to avoid:** Validate `sortColumn` against the allowlist of known column keys before interpolating. Return early (use default) if invalid.

### Pitfall 6: page*100 >= rowCount Boundary
**What goes wrong:** "Next" button appears enabled on the last page when `rowCount` is an exact multiple of 100 (e.g., 200 rows on page 2: `2*100 >= 200` is `true` so Next is correctly disabled — but easy to get the comparison wrong).
**How to avoid:** Use `page * 100 >= rowCount` (as specified in UI-SPEC) for the Next disabled condition. Test with rowCount = 0, 1, 100, 101, 200.

### Pitfall 7: Loading State During Initial Table View Switch
**What goes wrong:** When switching from map to table view, `_tableRows` is empty (never been queried), so the component briefly shows "No specimens match the current filters." before the query completes.
**How to avoid:** Set `_tableLoading = true` before firing `_runTableQuery()`, and show the loading overlay instead of the empty state while loading. The empty state should only appear after a completed query that returned 0 rows.

---

## Code Examples

### Verified Patterns from Codebase

### DuckDB Connection Pattern
```typescript
// Source: filter.ts queryVisibleIds [VERIFIED: codebase]
await tablesReady;
const db = await getDuckDB();
const conn = await db.connect();
try {
  const result = await conn.query(`SELECT ...`);
  // process result.toArray().map(r => r.toJSON())
} finally {
  await conn.close();
}
```

### Event Dispatch Pattern (from bee-sidebar)
```typescript
// Source: bee-sidebar.ts (inferred from bee-atlas.ts handler pattern) [VERIFIED: codebase]
this.dispatchEvent(new CustomEvent('sort-changed', {
  detail: { column: colKey, dir: newDir },
  bubbles: true,
  composed: true,
}));
```

### Custom Element Registration Pattern
```typescript
// Source: bee-sidebar.ts @customElement decorator [VERIFIED: codebase]
@customElement('bee-table')
export class BeeTable extends LitElement { ... }
// Note: @customElement also registers via customElements.define internally
```

### Lit Property Decorator (no reflection to attribute)
```typescript
// Source: bee-sidebar.ts @property pattern [VERIFIED: codebase]
@property({ attribute: false }) rows: SpecimenRow[] | SampleRow[] = [];
```

### Pagination Bar Copywriting
```typescript
// Source: UI-SPEC.md Copywriting Contract [VERIFIED: UI-SPEC]
const start = (page - 1) * 100 + 1;
const end = Math.min(page * 100, rowCount);
const noun = layerMode === 'specimens' ? 'specimens' : 'samples';
// "Showing 1–100 of 3,847 specimens"
const label = `Showing ${start}–${end} of ${rowCount.toLocaleString()} ${noun}`;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No table view | `bee-table` Lit component in `table-slot` | Phase 40 | Users can browse data without map |
| `UiState` had no sort fields | `UiState` gains `sortColumn`/`sortDir` | Phase 40 | Sort is bookmarkable/shareable |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `date` column in samples is sortable as a string (ISO date format YYYY-MM-DD) | Parquet Column Verification | If stored as integer timestamp, ORDER BY date would sort correctly but displayed value needs formatting |
| A2 | DuckDB `toJSON()` on a row returns plain JS objects with column names as keys, matching the column list in the SELECT | Architecture Patterns — queryTablePage | If the API differs, row mapping code needs adjustment |

**Both assumptions are LOW risk** — A1 is confirmed by `buildFilterSQL` using `date::TIMESTAMP` casts (implying date is a string), and A2 is confirmed by the `_restoreSelectionSamples` pattern in `bee-atlas.ts` which uses exactly this pattern.

---

## Open Questions (RESOLVED)

1. **Should `queryTablePage` live in `filter.ts` or a new `table-query.ts`?**
   - What we know: `filter.ts` already holds `queryVisibleIds` with the same DuckDB pattern; adding `queryTablePage` there is consistent.
   - What's unclear: If `filter.ts` grows to export many types, it may become unwieldy.
   - Recommendation: Add to `filter.ts` for Phase 40. If the file grows beyond ~200 lines, extract in a later refactor.

2. **Should `_tableRowCount` use the separate COUNT(*) query or `filteredSummary.filteredSpecimens`?**
   - What we know: `filteredSummary` only has `filteredSpecimens` (not filtered samples count). A separate COUNT(*) handles both modes uniformly.
   - Recommendation: Use a separate COUNT(*) query inside `queryTablePage` that runs in the same connection — avoids the samples/specimens asymmetry.

---

## Environment Availability

Step 2.6: SKIPPED — no new external dependencies. Phase 40 uses existing DuckDB WASM (already bundled), existing Lit (already installed), and plain CSS. No CLI tools, databases, or services beyond what Phase 39 already required.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (existing) |
| Config file | `frontend/vite.config.ts` (Vitest config embedded) |
| Quick run command | `cd frontend && npm test` |
| Full suite command | `cd frontend && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TABLE-01 | `bee-table` renders specimen columns when `layerMode='specimens'`, sample columns when `layerMode='samples'` | unit | `cd frontend && npm test -- bee-table` | ❌ Wave 0 |
| TABLE-02 | `queryTablePage` passes correct WHERE clause from `buildFilterSQL` | unit | `cd frontend && npm test -- filter` (extend existing) | ✅ extend |
| TABLE-03 | Row count indicator shows correct string at page 1, mid-page, and last page | unit | `cd frontend && npm test -- bee-table` | ❌ Wave 0 |
| TABLE-04 | Prev button disabled at page 1; Next button disabled when `page * 100 >= rowCount` | unit | `cd frontend && npm test -- bee-table` | ❌ Wave 0 |
| TABLE-05 | Clicking active column header reverses sort dir; clicking new column sets ascending | unit | `cd frontend && npm test -- bee-table` | ❌ Wave 0 |
| TABLE-06 | Specimen column headers render in correct order with correct labels | unit | `cd frontend && npm test -- bee-table` | ❌ Wave 0 |
| TABLE-07 | Sample column headers render in correct order with correct labels | unit | `cd frontend && npm test -- bee-table` | ❌ Wave 0 |
| D-06 | `buildParams`/`parseParams` round-trips `sortColumn`/`sortDir` | unit | `cd frontend && npm test -- url-state` (extend existing) | ✅ extend |

### Sampling Rate
- **Per task commit:** `cd frontend && npm test`
- **Per wave merge:** `cd frontend && npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/tests/bee-table.test.ts` — covers TABLE-01 through TABLE-07 (pure unit tests of rendering and event emission; mock DuckDB as in existing tests)
- [ ] Extend `frontend/src/tests/filter.test.ts` — add tests for `queryTablePage` with mocked DuckDB (TABLE-02)
- [ ] Extend `frontend/src/tests/url-state.test.ts` — add sort param round-trip tests (D-06)

---

## Security Domain

The codebase is a static frontend with no authentication, server runtime, or user accounts. ASVS categories V2 (Authentication), V3 (Session Management), and V4 (Access Control) do not apply. The relevant threat for this phase:

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes — sort column value | Column key allowlist before SQL interpolation |
| V6 Cryptography | no | — |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via sort column | Tampering | Allowlist: only accept column keys defined in `SPECIMEN_COLUMNS`/`SAMPLE_COLUMNS` constants before interpolating into `ORDER BY` clause |

---

## Sources

### Primary (HIGH confidence)
- `frontend/src/filter.ts` — `buildFilterSQL`, `queryVisibleIds` — DuckDB query pattern, WHERE clause reuse
- `frontend/src/duckdb.ts` — `getDuckDB`, `tablesReady` — async init pattern
- `frontend/src/bee-atlas.ts` — event handler patterns, `_filterQueryGeneration` guard, existing `@state()` fields
- `frontend/src/url-state.ts` — `UiState` interface, `buildParams`/`parseParams` extension pattern
- `frontend/src/bee-sidebar.ts` — pure presenter pattern (property-down, event-up)
- `scripts/validate-schema.mjs` — ground-truth column names for both parquet tables
- `.planning/phases/40-bee-table-component/40-CONTEXT.md` — locked decisions
- `.planning/phases/40-bee-table-component/40-UI-SPEC.md` — visual contract, column definitions, copywriting

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — "DuckDB WASM does not support parameterized queries" decision record

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries, all existing
- Architecture: HIGH — patterns are directly reusable from `queryVisibleIds` and `bee-sidebar`
- Pitfalls: HIGH — all derived from concrete code inspection
- Parquet columns: HIGH — verified against `validate-schema.mjs`

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable tech stack)
