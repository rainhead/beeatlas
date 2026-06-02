# Phase 130: Map Filter Cutover - Pattern Map

**Mapped:** 2026-06-02
**Files analyzed:** 6 (all modifications; no new files)
**Analogs found:** 6 / 6 — every file contains its own nearest analog pattern

---

## File Classification

| Modified File | Role | Data Flow | Closest Analog (within same file or sibling) | Match Quality |
|---|---|---|---|---|
| `src/filter.ts` | utility/query | CRUD (SQL generation + exec) | existing county/ecoregion clauses in same file (L257–267); `OCCURRENCE_COLUMNS` / `OccurrenceRow` expansion pattern | exact |
| `src/bee-atlas.ts` | root component / orchestrator | event-driven + CRUD | existing `_loadSummaryFromSQLite()` sequential `sqlite3.exec` blocks (L334–408) | exact |
| `src/bee-filter-controls.ts` | presenter component | event-driven | existing `getSuggestions()` taxon branch (L136–144); `TaxonToken` shape; `tokensToFilterState` | exact |
| `src/url-state.ts` | pure utility | transform | existing `yr0`/`yr1` parse pattern (L128–131); `parseParams` selective-inclusion guard (L166–185) | exact |
| `src/bee-occurrence-detail.ts` | presenter component | request-response (render) | existing `row.scientificName` conditional at L188; `@property` prop-pass pattern | role-match |
| `src/sqlite.ts` / `src/sqlite-worker.ts` | worker bridge / worker | event-driven (worker message) | `loadOccurrenceGeoJSON` + `'build-geojson'` handler (sqlite.ts L74–81; worker L81–92) | exact |

---

## Pattern Assignments

### `src/filter.ts` — FilterState shape + buildFilterSQL taxon clause + TaxonOption + OCCURRENCE_COLUMNS

**Analog within same file:** county/ecoregion clause pattern (L257–267); year clause (L244–249)

**Pattern 1 — Integer clause pushed into `occurrenceClauses[]` (analog: year range, L244–249):**
```typescript
// filter.ts L244–249 — model for any integer/numeric clause; no quoting needed
if (f.yearFrom !== null) {
  occurrenceClauses.push(`year >= ${f.yearFrom}`);
}
if (f.yearTo !== null) {
  occurrenceClauses.push(`year <= ${f.yearTo}`);
}
```
New taxon clause follows the same push-into-array shape. Integer `taxonId` needs no `''`-escaping.

**Pattern 2 — String IN-list clause with escaping (analog: county, L257–260):**
```typescript
// filter.ts L257–260 — shows the existing ''‑escape convention; taxon clause replaces its own block
if (f.selectedCounties.size > 0) {
  const counties = [...f.selectedCounties].map(c => `'${c.replace(/'/g, "''")}'`).join(',');
  occurrenceClauses.push(`county IN (${counties})`);
}
```
The new taxon clause at L232–241 uses an integer subquery instead and therefore drops the escaping entirely.

**Pattern 3 — WHERE clause composition (analog: L298):**
```typescript
// filter.ts L298 — clauses join with AND; taxon clause integrates identically
const occurrenceWhere = occurrenceClauses.length > 0 ? occurrenceClauses.join(' AND ') : '1 = 1';
```

**Pattern 4 — OCCURRENCE_COLUMNS and OccurrenceRow expansion (analog: L78–86 + L40–76):**
```typescript
// filter.ts L78–86 — add 'taxon_id' to this const array
export const OCCURRENCE_COLUMNS = [
  'lat', 'lon', 'date', 'county', 'ecoregion_l3', 'place_slug',
  'ecdysis_id', 'catalog_number', 'scientificName', 'recordedBy', 'fieldNumber',
  'genus', 'family', 'floralHost', 'host_observation_id', 'inat_host',
  'inat_quality_grade', 'modified', 'specimen_observation_id', 'elevation_m',
  'year', 'month', 'observation_id', 'host_inat_login', 'specimen_count', 'sample_id', 'sample_host',
  'is_provisional', 'specimen_inat_taxon_name', 'specimen_inat_quality_grade',
  'source', 'image_url', 'obs_url', 'user_login', 'license',
] as const;

// filter.ts L40–76 — OccurrenceRow interface; add taxon_id: number | null
// (pattern: every column in OCCURRENCE_COLUMNS has a matching field here)
```

**Pattern 5 — `isFilterActive` check (analog: L215–226):**
```typescript
// filter.ts L215–226 — taxonName check is the one to replace with taxonId
export function isFilterActive(f: FilterState): boolean {
  return f.taxonName !== null       // → replace with: f.taxonId !== null
    || f.yearFrom !== null
    || ...
}
```

**Pattern 6 — `buildCsvFilename` taxon segment (analog: L112–113):**
```typescript
// filter.ts L112–113 — taxonName ref becomes taxonDisplayName
if (f.taxonName !== null && segments.length < 2) {
  segments.push(slugify(f.taxonName));
}
```

**Pattern 7 — `TaxonOption` interface (analog: L370–374 — the thing being replaced):**
```typescript
// filter.ts L370–374 — CURRENT; expand rank union, swap name→taxonId
export interface TaxonOption {
  label: string;
  name: string;
  rank: 'family' | 'genus' | 'species';
}
```

**Pattern 8 — `FilterChangedEvent` interface (analog: L386–398):**
```typescript
// filter.ts L386–398 — taxonName/taxonRank fields to replace with taxonId/taxonDisplayName
export interface FilterChangedEvent {
  taxonName: string | null;
  taxonRank: 'family' | 'genus' | 'species' | null;
  yearFrom: number | null;
  ...
}
```

---

### `src/bee-atlas.ts` — `_loadSummaryFromSQLite()`, `FilterState` init, `_onFilterChanged()`, `_onDataLoaded()`

**Analog within same file:** the existing sequential `sqlite3.exec` blocks in `_loadSummaryFromSQLite` (L334–408); `_onDataLoaded` (L934–960); `_onFilterChanged` (L797–835)

**Pattern 1 — Sequential `sqlite3.exec` blocks after `await tablesReady` (L334–408):**
```typescript
// bee-atlas.ts L334–408 — copy this shape for the new taxa query block
private async _loadSummaryFromSQLite(): Promise<void> {
  await tablesReady;
  const { sqlite3, db } = await getDB();
  try {
    // ... existing summary exec block ...

    // Taxa options (L366–386) — THIS IS THE BLOCK TO REPLACE:
    const taxaRows: Record<string, unknown>[] = [];
    await sqlite3.exec(db,
      `SELECT DISTINCT family, genus, scientificName FROM occurrences WHERE ecdysis_id IS NOT NULL ORDER BY family, genus, scientificName`,
      (rowValues: unknown[], columnNames: string[]) => {
        taxaRows.push(Object.fromEntries(columnNames.map((col: string, i: number) => [col, rowValues[i]])));
      }
    );
    // ... builds this._taxaOptions from the rows ...

    // County options (L389–393) — shows the single-column row push pattern:
    this._countyOptions = [];
    await sqlite3.exec(db,
      `SELECT DISTINCT county FROM occurrences WHERE county IS NOT NULL ORDER BY county`,
      (rowValues: unknown[]) => { this._countyOptions.push(String(rowValues[0])); }
    );
  } catch (err) {
    ...
  } finally {
    this._loading = false;
  }
}
```
The new taxa cache query follows identical structure: `await tablesReady` is already done, `sqlite3.exec` with row callback, result assigned to `this._taxonCache` and `this._taxaOptions`.

**Pattern 2 — `@state()` field declaration (analog: L55–62):**
```typescript
// bee-atlas.ts L55 — model for adding _taxonCache
@state() private _taxaOptions: TaxonOption[] = [];
// New fields to add alongside:
// _taxonCache: Map<number, { rank: string; name: string; lineagePath: string | null }>
// _pendingLegacyTaxon: { name: string; rank: string | null } | null
// Note: _taxonCache is NOT @state (not reactive — only _taxaOptions drives re-render)
```

**Pattern 3 — `FilterState` initializer (analog: L21–33):**
```typescript
// bee-atlas.ts L21–33 — shape change: taxonName/taxonRank → taxonId/taxonDisplayName
@state() private _filterState: FilterState = {
  taxonName: null,
  taxonRank: null,
  yearFrom: null,
  yearTo: null,
  months: new Set(),
  selectedCounties: new Set(),
  selectedEcoregions: new Set(),
  selectedCollectors: [],
  elevMin: null,
  elevMax: null,
  selectedPlace: null,
};
```

**Pattern 4 — `_onFilterChanged` field-by-field assignment (analog: L797–835):**
```typescript
// bee-atlas.ts L797–813 — taxonName/taxonRank → taxonId/taxonDisplayName in the assignment block
private _onFilterChanged(e: CustomEvent<FilterChangedEvent>) {
  const detail = e.detail;
  const prev = this._filterState;
  this._filterState = {
    taxonName: detail.taxonName,
    taxonRank: detail.taxonRank,
    yearFrom: detail.yearFrom,
    ...
  };
  ...
}
```

**Pattern 5 — `_onDataLoaded` receiving taxa from `bee-map` (analog: L934–960 — the thing being partially restructured):**
```typescript
// bee-atlas.ts L934–937 — currently receives taxaOptions from bee-map data-loaded event
private _onDataLoaded(e: CustomEvent<{ summary: DataSummary; taxaOptions: TaxonOption[] }>) {
  this._summary = e.detail.summary;
  this._taxaOptions = e.detail.taxaOptions;
  this._loading = false;
  ...
}
```
After phase 130: `_taxaOptions` is built in `_loadSummaryFromSQLite` (not from `bee-map`). The `data-loaded` event no longer needs to carry `taxaOptions`. The `_loading = false` and downstream calls (`_loadCollectorOptions`, `_loadCountyEcoregionOptions`, `isFilterActive` re-run) remain in `_onDataLoaded` or move to `_loadSummaryFromSQLite`'s finally block — planner decides.

**Pattern 6 — Stale guards (analog: L71–73 — unchanged, shown for reference):**
```typescript
// bee-atlas.ts L71–73 — these guards wrap all three filter paths; NO CHANGE NEEDED
private _filterGuard = makeStaleGuard<{ geojson: ...; ids: Set<string>; rowCount: number } | null>();
private _tableGuard  = makeStaleGuard<{ rows: OccurrenceRow[]; total: number }>();
private _listGuard   = makeStaleGuard<{ rows: OccurrenceRow[]; total: number; selectionCount: number | null }>();
```

---

### `src/bee-filter-controls.ts` — `TaxonToken`, `getSuggestions()`, `tokensToFilterState`, `filterStateToTokens`, `filterStatesEqual`

**Analog within same file:** existing token types and their handling in `tokensToFilterState` (L38–63); `getSuggestions` taxon branch (L136–144)

**Pattern 1 — Token type declaration (analog: L14):**
```typescript
// bee-filter-controls.ts L14 — TaxonToken shape to replace:
interface TaxonToken { type: 'taxon'; taxonName: string; taxonRank: 'family' | 'genus' | 'species' }
// After: taxonName/taxonRank → taxonId/taxonDisplayName; rank union expands to 8 values
```

**Pattern 2 — `tokenLabel` switch case for taxon (analog: L28):**
```typescript
// bee-filter-controls.ts L28 — current taxon label logic to replace:
case 'taxon': return t.taxonRank === 'species' ? t.taxonName : `${t.taxonName} (${t.taxonRank})`;
// After: return t.taxonDisplayName (the D-03 label is pre-built on the TaxonOption)
```

**Pattern 3 — `getSuggestions` taxon branch (analog: L136–144 — the section to modify):**
```typescript
// bee-filter-controls.ts L136–144 — CURRENT; token shape changes; label comes from opt.label
if (!tokens.some(t => t.type === 'taxon')) {
  let n = 0;
  for (const opt of taxaOptions) {
    if (opt.label.toLowerCase().includes(lower)) {
      results.push({ label: opt.label, token: { type: 'taxon', taxonName: opt.name, taxonRank: opt.rank } });
      if (++n >= 5) break;
    }
  }
}
// After: token becomes { type: 'taxon', taxonId: opt.taxonId, taxonDisplayName: opt.label }
// opt.label already holds the D-03 label string (built upstream in bee-atlas.ts)
// D-05 ordering is inherited from the sorted taxaOptions array — no change needed in getSuggestions
```

**Pattern 4 — `tokensToFilterState` taxon case (analog: L53):**
```typescript
// bee-filter-controls.ts L53 — taxon case to update:
case 'taxon': f.taxonName = t.taxonName; f.taxonRank = t.taxonRank; break;
// After: f.taxonId = t.taxonId; f.taxonDisplayName = t.taxonDisplayName; break;
```

**Pattern 5 — `filterStateToTokens` taxon branch (analog: L67–69):**
```typescript
// bee-filter-controls.ts L67–69 — update field names:
if (f.taxonName && f.taxonRank) {
  tokens.push({ type: 'taxon', taxonName: f.taxonName, taxonRank: f.taxonRank });
}
// After: if (f.taxonId !== null) { tokens.push({ type: 'taxon', taxonId: f.taxonId, taxonDisplayName: f.taxonDisplayName }); }
```

**Pattern 6 — `filterStatesEqual` taxon fields (analog: L84–85):**
```typescript
// bee-filter-controls.ts L84–85 — update field references:
return a.taxonName === b.taxonName
  && a.taxonRank === b.taxonRank
  && ...
// After: a.taxonId === b.taxonId (single field; taxonDisplayName is display-only, not a filter key)
```

**Pattern 7 — `FilterState` blank in `tokensToFilterState` (analog: L39–49):**
```typescript
// bee-filter-controls.ts L39–49 — blank FilterState literal; update taxon fields:
const f: FilterState = {
  taxonName: null, taxonRank: null,
  yearFrom: null, yearTo: null,
  months: new Set(),
  ...
};
// After: taxonId: null, taxonDisplayName: null (replacing taxonName + taxonRank)
```

---

### `src/url-state.ts` — `buildParams` taxon encode + `parseParams` taxon decode

**Analog within same file:** `yr0`/`yr1` encode/decode pattern (L61–62, L128–131); `sel` bounds decode (L210–225); `hasFilter` inclusion guard (L166–170)

**Pattern 1 — Integer param encode (analog: L61–62):**
```typescript
// url-state.ts L61–62 — shows the integer encode pattern
if (filter.yearFrom !== null) params.set('yr0', String(filter.yearFrom));
if (filter.yearTo   !== null) params.set('yr1', String(filter.yearTo));
// taxon encode follows same shape:
// if (filter.taxonId !== null) params.set('taxon', String(filter.taxonId));
```
Replace the two-param taxon block at L57–60 with the single-param integer form.

**Pattern 2 — `parseInt` with `isNaN` guard (analog: L128–131):**
```typescript
// url-state.ts L128–131 — exact model for the new integer taxon= decode
const yearFromRaw = parseInt(p.get('yr0') ?? '', 10);
const yearFrom = isNaN(yearFromRaw) ? null : yearFromRaw;
```
New taxon decode adds the `String(asInt) === taxonRaw` roundtrip check to detect integer format.

**Pattern 3 — Legacy taxon decode (analog: L120–126 — the block being replaced):**
```typescript
// url-state.ts L120–126 — CURRENT; shows the both-must-be-present guard pattern
const taxonName = p.get('taxon') ?? null;
const rawRank   = p.get('taxonRank') ?? null;
const taxonRank = (['family', 'genus', 'species'] as const).includes(rawRank as any)
  ? rawRank as 'family' | 'genus' | 'species' : null;
const resolvedTaxonName = (taxonName && taxonRank) ? taxonName : null;
const resolvedTaxonRank = (taxonName && taxonRank) ? taxonRank : null;
```
Replace with integer-vs-string heuristic; store `pendingLegacyTaxon` for non-integer values.

**Pattern 4 — `hasFilter` guard / selective result inclusion (analog: L166–185):**
```typescript
// url-state.ts L166–185 — `hasFilter` check before including result.filter
const hasFilter = resolvedTaxonName !== null || yearFrom !== null || yearTo !== null
  || months.size > 0 || ...;
if (hasFilter) {
  result.filter = {
    taxonName: resolvedTaxonName,
    taxonRank: resolvedTaxonRank,
    yearFrom,
    ...
  };
}
// After: `hasFilter` checks taxonId !== null instead; result.filter includes taxonId + taxonDisplayName
```

**Pattern 5 — Multi-step float validation (analog: L109–116):**
```typescript
// url-state.ts L109–116 — model for the new integer+roundtrip validation
const x = parseFloat(p.get('x') ?? '');
...
const lonValid  = isFinite(x) && x >= -180 && x <= 180;
if (lonValid && latValid && zoomValid) { result.view = ...; }
// taxon integer validation mirrors: const asInt = parseInt(taxonRaw, 10); !isNaN(asInt) && String(asInt) === taxonRaw
```

---

### `src/bee-occurrence-detail.ts` — name rendering (D-07 cache lookup by `taxon_id`)

**Analog within same file:** existing `row.scientificName` conditional at L188; `@property` prop-pass pattern (L47)

**Pattern 1 — Existing name render with no-determination fallback (L188 — the line to replace):**
```typescript
// bee-occurrence-detail.ts L188 — CURRENT; treat scientificName as already-gone (D-07)
<a href="https://ecdysis.org/..." ...>${row.scientificName ? row.scientificName : html`<span class="no-determination">No determination</span>`}</a>
// After: look up name from taxon cache prop; null → same no-determination span
```

**Pattern 2 — `@property({ attribute: false })` prop declaration (analog: L47):**
```typescript
// bee-occurrence-detail.ts L47 — model for adding taxonCache prop
@property({ attribute: false }) occurrences: OccurrenceRow[] = [];
// Add: @property({ attribute: false }) taxonCache: Map<number, { rank: string; name: string }> | null = null;
```

**Pattern 3 — Prop threading from bee-atlas → bee-pane → bee-occurrence-detail:**
The architecture invariant (CLAUDE.md: "pure presenters receive state as properties") means `taxonCache` flows as a property down the component tree. The existing `occurrences` prop shows the exact prop-threading shape already in use.

---

### `src/sqlite.ts` + `src/sqlite-worker.ts` — lazy taxon-cache fetch (D-08 `'load-taxa'` message)

**Analog: `loadOccurrenceGeoJSON` + `'build-geojson'` handler — the exact template to copy**

**Pattern 1 — `loadOccurrenceGeoJSON` in `sqlite.ts` (L74–81 — copy this for `loadTaxaCache`):**
```typescript
// sqlite.ts L74–81 — geo_blob lazy fetch; taxon cache fetch is structurally identical
export function loadOccurrenceGeoJSON(): Promise<ArrayBuffer> {
  const worker = _ensureWorker();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const id = _nextId++;
    _pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    worker.postMessage({ kind: 'build-geojson', id });
  });
}
// New function copies this: postMessage({ kind: 'load-taxa', id })
// Returns Promise<Array<{ taxon_id: number; rank: string; name: string; lineage_path: string | null }>>
// Uses the 'exec-result' plumbing (rows + columns) rather than the ArrayBuffer transfer path
```

**Pattern 2 — `_pending` map and response dispatch in `sqlite.ts` (L8, L31–48):**
```typescript
// sqlite.ts L8 — pending map; 'load-taxa' uses the same map and the existing 'exec-result' path
const _pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; cb?: ExecCallback }>();

// sqlite.ts L31–43 — 'exec-result' dispatch; the taxa query can reuse this path
} else if (msg.kind === 'exec-result') {
  const p = _pending.get(msg.id!);
  if (!p) return;
  _pending.delete(msg.id!);
  if (p.cb) {
    for (const row of (msg.rows ?? [])) p.cb(row as unknown[], msg.columns ?? []);
  }
  p.resolve(undefined);
}
// Alternative: fire the taxa query via the existing sqlite3.exec proxy (getDB().sqlite3.exec)
// immediately after tablesReady in bee-atlas._loadSummaryFromSQLite — no new worker message needed.
// This is simpler: the exec path already handles row callbacks; no new worker branch required.
```

**Pattern 3 — `'build-geojson'` handler in `sqlite-worker.ts` (L81–92):**
```typescript
// sqlite-worker.ts L81–92 — worker-side lazy handler
} else if (kind === 'build-geojson') {
  const buf = _geoBuffer;
  _geoBuffer = null;
  if (buf == null) {
    self.postMessage({ kind: 'exec-error', id, message: 'geo buffer already consumed or not yet ready' });
    return;
  }
  (self as any).postMessage({ kind: 'geojson-result', id, buffer: buf }, [buf]);
}
```
The taxa handler is simpler: no pre-buffered result, no transfer — just run the SQL and post `exec-result`. If the planner uses the existing `exec` path (no new worker message), this pattern is not needed for taxa.

**Pattern 4 — `'exec'` message handler in worker (L69–80) — the simpler path:**
```typescript
// sqlite-worker.ts L69–80 — the existing exec path; taxa query can go through this unchanged
if (kind === 'exec') {
  try {
    const rows: unknown[][] = [];
    let columns: string[] = [];
    await sqlite3.exec(db, sql, (rowValues: unknown[], columnNames: string[]) => {
      if (columns.length === 0) columns = columnNames;
      rows.push([...rowValues]);
    });
    self.postMessage({ kind: 'exec-result', id, rows, columns });
  } catch (err: any) {
    self.postMessage({ kind: 'exec-error', id, message: err?.message ?? String(err) });
  }
}
// Recommendation: use this path (not a new 'load-taxa' kind) for the taxa query.
// bee-atlas._loadSummaryFromSQLite already calls sqlite3.exec via getDB() — just add
// the taxa query there as another sequential await block, same as county options (L390–393).
```

**Pattern 5 — `self.onmessage` registration after `tables-ready` post (L67, L95):**
```typescript
// sqlite-worker.ts L67 + L95 — `self.onmessage` is set BEFORE `tables-ready` is posted
self.onmessage = async (e: MessageEvent) => { ... };  // L67
self.postMessage({ kind: 'tables-ready', logs });     // L95
// This ordering is the contract: any 'exec' sent from main thread after 'tables-ready'
// will be handled. The taxa query in _loadSummaryFromSQLite sends via the exec path
// after tablesReady resolves — correctly sequenced.
```

---

## Shared Patterns

### `sqlite3.exec` Row Callback Convention
**Source:** `src/filter.ts` (L160–168), `src/bee-atlas.ts` (L340–351)
**Apply to:** All new `sqlite3.exec` calls (taxa query, `_taxonCache` build)

```typescript
// Standard row callback — Object.fromEntries with columnNames map
(rowValues: unknown[], columnNames: string[]) => {
  const obj = Object.fromEntries(columnNames.map((col: string, i: number) => [col, rowValues[i]]));
  rows.push(obj as SomeType);
}
// For single-column queries (county/ecoregion pattern):
(rowValues: unknown[]) => { results.push(rowValues[0] as string); }
```

### Race Guard Invariant
**Source:** `src/stale-guard.ts` (L1–14), `src/bee-atlas.ts` (L71–73)
**Apply to:** No change needed — `_filterGuard` already wraps `queryVisibleGeoJSON` which calls `buildFilterSQL`. Swapping the WHERE clause inside `buildFilterSQL` requires zero guard changes.

```typescript
// stale-guard.ts L7–14
export function makeStaleGuard<T>(): (fn: () => Promise<T>) => Promise<Guarded<T>> {
  let generation = 0;
  return async (fn) => {
    const gen = ++generation;
    const result = await fn();
    return gen === generation ? { result } : null;
  };
}
```

### `tablesReady` Boot Path Guard
**Source:** `src/sqlite.ts` (L15–17), `src/bee-atlas.ts` (L334–335)
**Apply to:** Any new async SQLite query in `_loadSummaryFromSQLite`

```typescript
// sqlite.ts L15–17 — the promise to await before any exec
export const tablesReady: Promise<void> = new Promise(resolve => {
  _tablesReadyResolve = resolve;
});
// bee-atlas.ts L334–336 — pattern for taxa query: await tablesReady is already done
// at the top of _loadSummaryFromSQLite; sequential exec blocks below it inherit this.
```

### Vitest Mock Pattern for sqlite.ts
**Source:** `src/tests/filter.test.ts` (L6–10)
**Apply to:** Any new test file testing functions that import from `filter.ts` or `sqlite.ts`

```typescript
// filter.test.ts L6–10 — mock sqlite module for unit tests
vi.mock('../sqlite.ts', () => ({
  getDB: vi.fn(() => Promise.resolve({ sqlite3: {}, db: 0 })),
  loadOccurrencesTable: vi.fn(() => Promise.resolve()),
  tablesReady: Promise.resolve(),
}));
```

### `emptyFilter()` Test Helper
**Source:** `src/tests/filter.test.ts` (L16–30), `src/tests/url-state.test.ts` (L6–20)
**Apply to:** All new test cases; update `taxonName/taxonRank` → `taxonId/taxonDisplayName` in both files' `emptyFilter()` helper

```typescript
// filter.test.ts L16–30 — update this helper when FilterState shape changes
function emptyFilter(): FilterState {
  return {
    taxonName: null,
    taxonRank: null,
    yearFrom: null,
    yearTo: null,
    months: new Set(),
    selectedCounties: new Set(),
    selectedEcoregions: new Set(),
    selectedCollectors: [],
    elevMin: null,
    elevMax: null,
    selectedPlace: null,
  };
}
```

### `buildFilterSQL` Test Shape
**Source:** `src/tests/filter.test.ts` (L40–56)
**Apply to:** New taxon descendant clause tests; mirrors existing assert pattern

```typescript
// filter.test.ts L40–44 — exact test shape to replicate for taxonId clause
test('taxon family: occurrenceWhere contains family clause', () => {
  const f = { ...emptyFilter(), taxonName: 'Apidae', taxonRank: 'family' as const };
  const { occurrenceWhere } = buildFilterSQL(f);
  expect(occurrenceWhere).toBe("family = 'Apidae'");
});
// New test copies this shape with taxonId: 47219 and asserts the instr() subquery string
```

---

## No Analog Found

All modified files have strong internal analogs. No file requires falling back to RESEARCH.md patterns.

---

## Metadata

**Analog search scope:** `src/` (all TypeScript source files directly referenced in CONTEXT.md canonical refs)
**Files read:** `filter.ts`, `bee-atlas.ts` (targeted sections), `bee-filter-controls.ts`, `url-state.ts`, `bee-occurrence-detail.ts`, `sqlite.ts`, `sqlite-worker.ts`, `stale-guard.ts`, `src/tests/filter.test.ts`, `src/tests/url-state.test.ts`
**Pattern extraction date:** 2026-06-02
