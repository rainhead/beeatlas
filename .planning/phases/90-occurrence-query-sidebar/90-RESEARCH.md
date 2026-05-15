# Phase 90: Occurrence Query & Sidebar - Research

**Researched:** 2026-05-14
**Domain:** SQLite bounds query, LitElement state wiring, sidebar open path
**Confidence:** HIGH

## Summary

Phase 90 closes the gesture loop opened by Phase 89. When `bee-atlas` receives a `selection-drawn` event it must (1) query SQLite for all occurrences whose `lat`/`lon` fall inside the bounding box AND pass the current active filter, (2) open the sidebar showing the matched rows via `bee-occurrence-detail`, and (3) do nothing if the result is empty.

The implementation lives entirely in `bee-atlas.ts` and `filter.ts`. No changes are needed to `bee-map.ts` (it already emits `selection-drawn`), `bee-sidebar.ts`, or `bee-occurrence-detail.ts`. The query follows the exact same pattern as `_restoreClusterSelection` already present in `bee-atlas.ts`: issue a SQLite `exec` call using `OCCURRENCE_COLUMNS`, apply a lat/lon bounding box `BETWEEN` clause, and combine it with the existing `buildFilterSQL` WHERE clause.

A new exported function `queryOccurrencesByBounds` belongs in `filter.ts` alongside the existing `queryAllFiltered`, `queryTablePage`, and `queryVisibleIds` functions. It takes `FilterState` plus the four bounding-box numbers and returns `OccurrenceRow[]`. This keeps all SQL logic in `filter.ts` and avoids a raw `exec` call in `bee-atlas.ts`.

The sidebar open path is already understood: set `_selectedOccurrences` and `_sidebarOpen = true`. The existing `import('./bee-sidebar.ts')` lazy-load guard must be included (same as `_onOccurrenceClick`). `_selectedOccIds` should be populated from the matched rows to enable the halo overlay recompute in `bee-map`.

**Primary recommendation:** Add `queryOccurrencesByBounds(f, bounds)` to `filter.ts`, call it from `_onSelectionDrawn` in `bee-atlas.ts`, and open the sidebar only when the result is non-empty.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEL-03 | On drag release, occurrences whose lat/lon fall within the rectangle bounds AND pass current active filters are identified | `buildFilterSQL` produces the filter WHERE clause; add a `lat BETWEEN south AND north AND lon BETWEEN west AND east` clause on top; verified pattern from `_restoreClusterSelection` |
| SEL-04 | Sidebar opens showing the matched occurrences (same `bee-occurrence-detail` presentation as a cluster click) | Identical to `_onOccurrenceClick` path: set `_selectedOccurrences`, `_selectedOccIds`, `_sidebarOpen = true`, import bee-sidebar.ts |
| SEL-05 | If zero filter-passing occurrences fall within the bounds, the sidebar is not opened | Guard: `if (rows.length === 0) return;` before opening sidebar |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Bounds + filter SQL query | filter.ts (data layer) | — | All SQLite logic lives in filter.ts by project convention; bee-atlas.ts never calls exec directly |
| Selection state ownership | bee-atlas (coordinator) | — | CLAUDE.md invariant: bee-atlas owns all reactive state |
| Sidebar open/close | bee-atlas (coordinator) | — | bee-atlas sets `_sidebarOpen`, `_selectedOccurrences`, `_selectedOccIds` |
| Occurrence detail rendering | bee-occurrence-detail (presenter) | bee-sidebar (presenter) | Pure presenters; receive data via properties |
| Halo overlay recompute | bee-map (presenter) | — | Reacts to `selectedOccIds` property change; no new work needed |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| wa-sqlite | (installed) | SQLite WASM engine; `exec` with callback | Project SQL engine since v2.6 |
| lit | ^3.2.1 | LitElement, `@state()`, `html` template | Project standard for all components |

No new dependencies. [VERIFIED: package.json, sqlite.ts, filter.ts]

## Architecture Patterns

### System Architecture Diagram

```
bee-map emits 'selection-drawn' { west, south, east, north }
         |
         v
bee-atlas._onSelectionDrawn(e)
         |
         v
filter.queryOccurrencesByBounds(filterState, bounds)
         |
         +-- await tablesReady
         |
         +-- getDB()
         |
         +-- sqlite3.exec(db,
         |     SELECT <OCCURRENCE_COLUMNS>
         |     FROM occurrences
         |     WHERE <buildFilterSQL WHERE>
         |       AND lat BETWEEN south AND north
         |       AND lon BETWEEN west AND east
         |     ORDER BY date DESC
         |   )
         |
         v
     result: OccurrenceRow[]
         |
    empty? --> return (no sidebar, no error)
         |
    non-empty:
         |
         v
bee-atlas:
  _selectedOccurrences = rows.sort(date DESC)
  _selectedOccIds = rows.map(id)
  _selectedCluster = null
  import('./bee-sidebar.ts')
  _sidebarOpen = true
  (no URL push in Phase 90 — Phase 91 adds sel= param)
         |
         v
bee-sidebar renders <bee-occurrence-detail .occurrences>
```

### Recommended Project Structure

No new files. Changes confined to:
- `src/filter.ts` — add `queryOccurrencesByBounds` export
- `src/bee-atlas.ts` — expand `_onSelectionDrawn` stub
- `src/tests/bee-atlas.test.ts` — add SEL-03/04/05 static-grep blocks

### Pattern 1: Bounds Query with Filter Intersection

**What:** Combine `buildFilterSQL`'s WHERE clause with four `BETWEEN` clauses for lat/lon.

**When to use:** Any time a spatial bounding box must intersect with the active filter.

**Example:**
```typescript
// Source: src/filter.ts (queryAllFiltered / buildFilterSQL patterns)
// + src/bee-atlas.ts _restoreClusterSelection (BETWEEN pattern)

export async function queryOccurrencesByBounds(
  f: FilterState,
  bounds: { west: number; south: number; east: number; north: number }
): Promise<OccurrenceRow[]> {
  const { occurrenceWhere } = buildFilterSQL(f);
  const { west, south, east, north } = bounds;
  // Bounds are numbers from map.unproject() — no SQL injection risk
  const boundsClause = `lat BETWEEN ${south} AND ${north} AND lon BETWEEN ${west} AND ${east}`;
  const colList = OCCURRENCE_COLUMNS.join(', ');

  await tablesReady;
  const { sqlite3, db } = await getDB();
  const rows: OccurrenceRow[] = [];
  await sqlite3.exec(db,
    `SELECT ${colList} FROM occurrences WHERE (${occurrenceWhere}) AND ${boundsClause} ORDER BY date DESC, recordedBy ASC`,
    (rowValues: unknown[], columnNames: string[]) => {
      rows.push(Object.fromEntries(columnNames.map((col, i) => [col, rowValues[i]])) as unknown as OccurrenceRow);
    }
  );
  return rows;
}
```

[VERIFIED: buildFilterSQL, OCCURRENCE_COLUMNS, tablesReady, getDB — all sourced from filter.ts and sqlite.ts local files]

### Pattern 2: Opening the Sidebar from bee-atlas

**What:** Mirror `_onOccurrenceClick` exactly — set selection state, lazy-import bee-sidebar, set `_sidebarOpen = true`.

**Example:**
```typescript
// Source: src/bee-atlas.ts _onOccurrenceClick (lines 589-604)

private async _onSelectionDrawn(e: CustomEvent<{ west: number; south: number; east: number; north: number }>) {
  this._selectionBounds = e.detail;
  const rows = await queryOccurrencesByBounds(this._filterState, e.detail);
  if (rows.length === 0) return;          // SEL-05: no sidebar on empty result

  import('./bee-sidebar.ts');             // lazy-load guard (same as _onOccurrenceClick)
  this._selectedOccurrences = rows.sort((a, b) => b.date.localeCompare(a.date));
  // Build occId list for halo overlay (bee-map reacts to selectedOccIds)
  this._selectedOccIds = rows.map(r =>
    r.ecdysis_id != null ? `ecdysis:${r.ecdysis_id}` : `inat:${Number(r.observation_id)}`
  );
  this._selectedCluster = null;
  this._sidebarOpen = true;
  // Phase 91 will call _pushUrlState() here with sel= param
}
```

[VERIFIED: _onOccurrenceClick pattern in bee-atlas.ts; _selectedOccIds id-building pattern in _restoreClusterSelection]

### Pattern 3: ID Construction from OccurrenceRow

**What:** Each occurrence is identified by either an Ecdysis integer ID (`ecdysis:<n>`) or an iNat observation ID (`inat:<n>`). The canonical form is used throughout `selectedOccIds` and the URL state.

**Example:**
```typescript
// Source: bee-atlas.ts _restoreClusterSelection (lines 902-906) [VERIFIED: local file]
const restoredIds = filtered.map(obj =>
  obj.ecdysis_id != null ? `ecdysis:${obj.ecdysis_id}` : `inat:${Number(obj.observation_id)}`
);
```

### Pattern 4: async handler on `_onSelectionDrawn`

`_onSelectionDrawn` is currently a synchronous method. To call `queryOccurrencesByBounds`, it must become `async`. This matches the existing pattern of other async handlers in `bee-atlas.ts` (`_runFilterQuery`, `_loadSummaryFromSQLite`, `_restoreClusterSelection` — all `async`). Lit does not require event handlers to return a promise; `async` is safe.

The `@ts-ignore` comment above `_selectionBounds` in Phase 89 was intentional (suppresses `noUnusedLocals`). After Phase 90 reads `_selectionBounds` in the query call, the suppress comment can be removed.

### Anti-Patterns to Avoid

- **Inlining SQLite `exec` calls in `bee-atlas.ts`:** All SQL belongs in `filter.ts`. `bee-atlas.ts` has two raw `exec` calls in `_loadSummaryFromSQLite` and `_loadCollectorOptions` but these are complex aggregation/options queries. For occurrence row queries, `filter.ts` is the right place.
- **Forgetting the race guard:** `_runFilterQuery` uses `_filterQueryGeneration` to discard stale results. The bounds query is user-initiated (not filter-driven) and always supersedes itself; a simple async/await without a generation guard is correct — the prior selection will be overwritten by the new one.
- **Forgetting `import('./bee-sidebar.ts')`:** The sidebar is lazily loaded. Without this import, the sidebar component may not be registered when `_sidebarOpen` becomes true, producing an unknown element.
- **Setting `_selectedCluster` instead of nulling it:** When opening sidebar from a bounding box, `_selectedCluster` must be set to `null` so the URL state (Phase 91) and the halo overlay get the correct signal.
- **Not removing the `@ts-ignore`:** The suppress comment was added in Phase 89 because `_selectionBounds` had no readers. Phase 90 adds a reader; the comment should be removed to keep `noUnusedLocals` enforcement active.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Filter WHERE clause | Custom SQL string | `buildFilterSQL(filterState)` | Already handles all 9 filter dimensions, SQL escaping, null semantics |
| lat/lon column types | Custom spatial index | SQLite `BETWEEN` on REAL columns | Whole WA state fits in ~14k rows; table scan is sub-millisecond |
| Row deserialization | Custom column mapping | `Object.fromEntries(columnNames.map(...))` as OccurrenceRow | Established pattern in queryTablePage/queryAllFiltered |

**Key insight:** The bounds query is 5 lines of SQL on top of an already-working filter query infrastructure.

## Common Pitfalls

### Pitfall 1: Bounds Cover the Antimeridian (lon wrap-around)
**What goes wrong:** A rectangle drawn near the western edge of WA could theoretically span the antimeridian (west ~= -180, east ~= +179). The `lon BETWEEN west AND east` clause would return zero rows because west > east numerically.
**Why it happens:** WA is at lon ~-125 to -116; no realistic rectangle drawn on the WA map would cross the antimeridian. `map.unproject()` produces values in the WA range.
**How to avoid:** Accept the limitation for Phase 90 — anti-meridian handling is not a real-world concern for WA coordinates. Document as a known limitation if needed.
**Warning signs:** Zero rows returned from a clearly populated area near the western coast.

### Pitfall 2: `_onSelectionDrawn` Fires with Old `_filterState`
**What goes wrong:** If filter changes while the async query is in flight, results may reflect the old filter state.
**Why it happens:** `_filterState` is read at call time; the query is async and reads SQLite after the await.
**How to avoid:** Capture `filterState` at the call site before the await: `const f = this._filterState;` then pass `f` to `queryOccurrencesByBounds`. This is the same snapshot pattern used in `_runFilterQuery`.
**Warning signs:** Results from bounds query don't match what's visible on the map after a quick filter change.

### Pitfall 3: Sidebar Stays Open After Rectangle Produces No Results
**What goes wrong:** If a new shift-drag produces zero results, the prior sidebar (from a cluster click or previous rectangle) may remain open with stale data.
**Why it happens:** The `if (rows.length === 0) return;` early exit leaves previous state intact.
**How to avoid:** On `_onSelectionDrawn`, always clear prior selection state before the async query. Set `_selectedOccurrences = null`, `_selectedOccIds = null`, `_selectedCluster = null`, `_sidebarOpen = false` at the top of the handler (synchronously), then run the async query. If results are empty the sidebar stays closed. If non-empty, reopen with the new results.
**Warning signs:** Drawing a rectangle over an empty part of the map leaves the sidebar open with old results.

### Pitfall 4: The `@ts-ignore` Comment Must Be Removed
**What goes wrong:** If the `@ts-ignore` comment on line 55 of `bee-atlas.ts` (suppressing `noUnusedLocals` for `_selectionBounds`) is left in after Phase 90 adds a reader, it silently masks any future type errors on that line.
**Why it happens:** The comment was added intentionally in Phase 89 to suppress `noUnusedLocals` for a Phase-90-owned field.
**How to avoid:** Remove the `// @ts-ignore` and the comment above it as part of Phase 90.
**Warning signs:** `tsc --noEmit` would pass even if `_selectionBounds` had a type error, because the ignore suppresses it.

## Code Examples

### Verified: `buildFilterSQL` signature
```typescript
// Source: src/filter.ts line 204 [VERIFIED: local file]
export function buildFilterSQL(f: FilterState): { occurrenceWhere: string }
```

### Verified: `OCCURRENCE_COLUMNS` array
```typescript
// Source: src/filter.ts lines 56-63 [VERIFIED: local file]
export const OCCURRENCE_COLUMNS = [
  'lat', 'lon', 'date', 'county', 'ecoregion_l3',
  'ecdysis_id', 'catalog_number', 'scientificName', 'recordedBy', 'fieldNumber',
  // ... 28 columns total
] as const;
```

### Verified: `_restoreClusterSelection` lat/lon BETWEEN pattern
```typescript
// Source: src/bee-atlas.ts lines 880-885 [VERIFIED: local file]
await sqlite3.exec(db, `
  SELECT ${colList}
  FROM occurrences
  WHERE lat BETWEEN ${lat - dLat} AND ${lat + dLat}
    AND lon BETWEEN ${lon - dLon} AND ${lon + dLon}
`, ...)
```

### Verified: Current `_onSelectionDrawn` stub in bee-atlas.ts
```typescript
// Source: src/bee-atlas.ts lines 655-658 [VERIFIED: local file]
private _onSelectionDrawn(e: CustomEvent<{ west: number; south: number; east: number; north: number }>) {
  this._selectionBounds = e.detail;
  /* Phase 90: dispatch SQLite bounds query and open sidebar with matched occurrences. */
}
```

### Verified: `_onOccurrenceClick` as structural analog
```typescript
// Source: src/bee-atlas.ts lines 589-604 [VERIFIED: local file]
private _onOccurrenceClick(e: ...) {
  import('./bee-sidebar.ts');
  this._selectedOccurrences = e.detail.occurrences.sort((a, b) => b.date.localeCompare(a.date));
  this._selectedOccIds = e.detail.occIds;
  if (e.detail.centroid && e.detail.radiusM != null) {
    this._selectedCluster = { ... };
  } else {
    this._selectedCluster = null;
  }
  this._sidebarOpen = true;
  // ...
}
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | An async `_onSelectionDrawn` handler is safe in Lit — no synchronous constraint | Architecture Patterns 4 | If Lit requires sync handlers, the query logic needs to be in a separate method called from the handler; easy to fix |
| A2 | All lat/lon values in the occurrences table are non-null (rows have valid WA coordinates) | Common Pitfalls | If some rows have null lat/lon, `lat BETWEEN` will correctly exclude them via NULL semantics — no bug |

**If this table is empty:** All claims in this research were verified or cited.

## Open Questions

None for Phase 90. SEL-06 and SEL-07 (URL state for `sel=` param) are explicitly Phase 91 scope.

## Environment Availability

Step 2.6: SKIPPED — no external dependencies beyond already-installed packages.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.2 |
| Config file | vitest.config.ts |
| Quick run command | `npm test -- --run` |
| Full suite command | `npm test -- --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEL-03 | `filter.ts` exports `queryOccurrencesByBounds`; it uses `buildFilterSQL` + bounds clauses | unit (static grep) | `npm test -- --run` | ❌ Wave 0 |
| SEL-03 | `bee-atlas.ts` calls `queryOccurrencesByBounds` in `_onSelectionDrawn` | unit (static grep) | `npm test -- --run` | ❌ Wave 0 |
| SEL-04 | `bee-atlas.ts` sets `_sidebarOpen = true` and `_selectedOccurrences` in `_onSelectionDrawn` path | unit (static grep) | `npm test -- --run` | ❌ Wave 0 |
| SEL-05 | `bee-atlas.ts` guards sidebar open with `rows.length === 0` check | unit (static grep) | `npm test -- --run` | ❌ Wave 0 |

All four tests follow the project's static-grep pattern (read source file with `readFileSync`, assert regex presence).

### Sampling Rate
- **Per task commit:** `npm test -- --run`
- **Per wave merge:** `npm test -- --run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] Add `SEL-03` describe block in `src/tests/bee-atlas.test.ts` — asserts `queryOccurrencesByBounds` export in `filter.ts` and call in `bee-atlas.ts`
- [ ] Add `SEL-04` describe block — asserts `_sidebarOpen = true` assignment reachable from `_onSelectionDrawn` path
- [ ] Add `SEL-05` describe block — asserts `rows.length === 0` guard before sidebar open

## Security Domain

Phase 90 introduces a lat/lon bounding box into a SQLite query. The bounds come from `map.unproject()` which returns floating-point numbers derived from the Mapbox map's internal projection — they are not user-typed strings. They are embedded as numeric literals in the SQL string (no quotes, no interpolation risk). This matches the identical pattern in `_restoreClusterSelection` which uses `${lat - dLat}`, `${lon - dLon}` directly in SQL. No new injection surface exists.

No authentication, session management, access control, or cryptography is involved. ASVS V5 input validation is satisfied by using numeric literals (not string parameters).

## Sources

### Primary (HIGH confidence)
- `src/bee-atlas.ts` — `_onOccurrenceClick`, `_restoreClusterSelection`, `_selectionBounds` stub [VERIFIED: local file]
- `src/filter.ts` — `buildFilterSQL`, `OCCURRENCE_COLUMNS`, `queryAllFiltered`, `queryVisibleIds`, `OccurrenceRow` [VERIFIED: local file]
- `src/sqlite.ts` — `getDB`, `tablesReady`, `_serializedExec` [VERIFIED: local file]
- `src/bee-sidebar.ts` — accepts `occurrences: OccurrenceRow[] | null` via property [VERIFIED: local file]
- `src/tests/bee-atlas.test.ts` — static-grep test pattern [VERIFIED: local file]
- `.planning/phases/89-rectangle-drawing/89-VERIFICATION.md` — Phase 89 complete; `_selectionBounds`, `@selection-drawn`, `_onSelectionDrawn` stub confirmed [VERIFIED: local file]

### Secondary (MEDIUM confidence)
- `src/bee-atlas.ts` `_onOccurrenceClick` — structural analog for sidebar open path [VERIFIED: local file]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all existing infrastructure verified
- Architecture (query pattern): HIGH — direct analog in `_restoreClusterSelection`
- Sidebar open path: HIGH — direct analog in `_onOccurrenceClick`
- Pitfalls: HIGH — derived from direct code inspection of the existing handler

**Research date:** 2026-05-14
**Valid until:** 2026-06-14 (stable codebase; 30-day window appropriate)
