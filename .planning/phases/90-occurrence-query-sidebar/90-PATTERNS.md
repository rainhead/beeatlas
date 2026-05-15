# Phase 90: Occurrence Query & Sidebar — Pattern Map

**Mapped:** 2026-05-14
**Files analyzed:** 3 (2 modified, 1 modified)
**Analogs found:** 3 / 3

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/filter.ts` | service | CRUD (SQLite query) | `src/filter.ts` `queryAllFiltered` / `queryVisibleIds` | exact — add new export alongside existing query functions |
| `src/bee-atlas.ts` | coordinator | request-response | `src/bee-atlas.ts` `_onOccurrenceClick` | exact — same sidebar-open path |
| `src/tests/bee-atlas.test.ts` | test | — | `src/tests/bee-atlas.test.ts` existing SEL-01/SEL-02 describe blocks | exact — same static-grep pattern |

## Pattern Assignments

### `src/filter.ts` — add `queryOccurrencesByBounds` export (service, CRUD)

**Analog:** `queryAllFiltered` (lines 126–146) and `queryVisibleIds` (lines 301–319) in the same file.

**Imports pattern** — these are already in `filter.ts` lines 1–1; the new function uses the same imports:
```typescript
import { getDB, tablesReady } from './sqlite.ts';
```
All other symbols (`OCCURRENCE_COLUMNS`, `OccurrenceRow`, `FilterState`, `buildFilterSQL`) are already defined earlier in the same file — no new imports needed.

**Core query pattern** (modeled on `queryAllFiltered` lines 126–146, with bounds clause from `_restoreClusterSelection` in `bee-atlas.ts` lines 879–886):
```typescript
export async function queryOccurrencesByBounds(
  f: FilterState,
  bounds: { west: number; south: number; east: number; north: number }
): Promise<OccurrenceRow[]> {
  const { occurrenceWhere } = buildFilterSQL(f);
  const { west, south, east, north } = bounds;
  const boundsClause = `lat BETWEEN ${south} AND ${north} AND lon BETWEEN ${west} AND ${east}`;
  const selectCols = OCCURRENCE_COLUMNS.join(', ');

  await tablesReady;
  const { sqlite3, db } = await getDB();
  const rows: OccurrenceRow[] = [];
  await sqlite3.exec(db,
    `SELECT ${selectCols} FROM occurrences WHERE (${occurrenceWhere}) AND ${boundsClause} ORDER BY date DESC, recordedBy ASC`,
    (rowValues: unknown[], columnNames: string[]) => {
      rows.push(Object.fromEntries(columnNames.map((col, i) => [col, rowValues[i]])) as unknown as OccurrenceRow);
    }
  );
  return rows;
}
```

**Row deserialization pattern** — copy from `_restoreClusterSelection` (bee-atlas.ts line 885):
```typescript
rows.push(Object.fromEntries(columnNames.map((col: string, i: number) => [col, rowValues[i]])) as unknown as OccurrenceRow);
```
Note: `queryTablePage` uses a two-step `forEach` variant (lines 183–186); either works. The `Object.fromEntries(map)` single-line form from `_restoreClusterSelection` is preferred for concision.

**Placement:** Insert after `queryVisibleIds` (line 319), before any future exports. Keep alongside the other exported query functions — this is the project convention (all SQLite query functions live in `filter.ts`).

---

### `src/bee-atlas.ts` — expand `_onSelectionDrawn` stub (coordinator, request-response)

**Analog:** `_onOccurrenceClick` (lines 589–604, same file).

**Import to add** — `queryOccurrencesByBounds` must be added to the existing `filter.ts` import on line 3:
```typescript
// Current line 3 (excerpt):
import { type FilterState, ..., queryAllFiltered, buildCsvFilename, type OccurrenceRow, OCCURRENCE_COLUMNS, type SpecimenSortBy } from './filter.ts';

// After Phase 90 — add queryOccurrencesByBounds to the named imports list
import { ..., queryOccurrencesByBounds } from './filter.ts';
```

**`@ts-ignore` removal** — lines 54–55 must be removed as part of this task:
```typescript
// DELETE these two lines:
  // Phase 90 will read _selectionBounds to query occurrences in the drawn rectangle
  // @ts-ignore -- intentionally unused until Phase 90 wires the SQLite bounds query
```

**Synchronous state-clear before async query** (Pitfall 3 from RESEARCH.md; mirrors `_onMapClickEmpty` pattern at lines 660–681):
```typescript
// Clear prior selection state synchronously before the async query.
// Prevents stale sidebar from persisting when a new rect produces zero results.
this._selectedOccurrences = null;
this._selectedOccIds = null;
this._selectedCluster = null;
this._sidebarOpen = false;
```

**Filter state snapshot** (Pitfall 2 from RESEARCH.md; mirrors `_runFilterQuery` line 330 — read `_filterState` before the first `await`):
```typescript
const f = this._filterState;  // snapshot before first await
```

**Core handler pattern** (modeled exactly on `_onOccurrenceClick` lines 589–604):
```typescript
private async _onSelectionDrawn(e: CustomEvent<{ west: number; south: number; east: number; north: number }>) {
  this._selectionBounds = e.detail;
  // Synchronous clear (Pitfall 3)
  this._selectedOccurrences = null;
  this._selectedOccIds = null;
  this._selectedCluster = null;
  this._sidebarOpen = false;

  const f = this._filterState;  // snapshot before first await (Pitfall 2)
  const rows = await queryOccurrencesByBounds(f, e.detail);
  if (rows.length === 0) return;  // SEL-05: no sidebar on empty result

  import('./bee-sidebar.ts');  // lazy-load guard (same as _onOccurrenceClick line 590)
  this._selectedOccurrences = rows.sort((a, b) => b.date.localeCompare(a.date));
  this._selectedOccIds = rows.map(r =>
    r.ecdysis_id != null ? `ecdysis:${r.ecdysis_id}` : `inat:${Number(r.observation_id)}`
  );
  this._selectedCluster = null;
  this._sidebarOpen = true;
  // Phase 91 will call this._pushUrlState() here with sel= param
}
```

**ID construction pattern** — copy from `_restoreClusterSelection` lines 902–903 (same file):
```typescript
const restoredIds = filtered.map(obj =>
  obj.ecdysis_id != null ? `ecdysis:${obj.ecdysis_id}` : `inat:${Number(obj.observation_id)}`
);
```

---

### `src/tests/bee-atlas.test.ts` — add SEL-03/04/05 describe blocks (test)

**Analog:** Every existing `describe` block in this file — they all follow the same static-grep pattern. Closest match is `SEL-01` (lines 305–329) and `SEL-02` (lines 331–352) which also test Phase 89 selection behavior.

**File-read pattern** (lines 132–133, used identically in SIDE-01, VIEW-02, HALO-01, SEL-01, SEL-02):
```typescript
const src = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');
```
For tests that assert on `filter.ts`, use:
```typescript
const src = readFileSync(resolve(__dirname, '../filter.ts'), 'utf-8');
```

**Static-grep test structure** (lines 133–140 as template):
```typescript
describe('SEL-03: queryOccurrencesByBounds in filter.ts', () => {
  test('filter.ts exports queryOccurrencesByBounds', () => {
    const src = readFileSync(resolve(__dirname, '../filter.ts'), 'utf-8');
    expect(src).toMatch(/export async function queryOccurrencesByBounds/);
  });

  test('filter.ts calls buildFilterSQL inside queryOccurrencesByBounds', () => {
    const src = readFileSync(resolve(__dirname, '../filter.ts'), 'utf-8');
    expect(src).toMatch(/buildFilterSQL/);
    expect(src).toMatch(/BETWEEN.*AND.*BETWEEN/);
  });

  test('bee-atlas.ts calls queryOccurrencesByBounds in _onSelectionDrawn', () => {
    const src = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');
    expect(src).toMatch(/queryOccurrencesByBounds/);
    expect(src).toMatch(/_onSelectionDrawn/);
  });
});

describe('SEL-04: sidebar open on non-empty bounds result', () => {
  const src = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');

  test('bee-atlas.ts sets _sidebarOpen = true reachable from _onSelectionDrawn', () => {
    expect(src).toMatch(/this\._sidebarOpen\s*=\s*true/);
  });

  test('bee-atlas.ts sets _selectedOccurrences in _onSelectionDrawn path', () => {
    expect(src).toMatch(/this\._selectedOccurrences\s*=\s*rows/);
  });
});

describe('SEL-05: sidebar not opened on empty bounds result', () => {
  const src = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');

  test('bee-atlas.ts guards sidebar open with rows.length === 0 check', () => {
    expect(src).toMatch(/rows\.length\s*===\s*0/);
  });
});
```

**Placement:** Append after the last existing `describe` block (`SEL-02` ends at line 352). Do not insert between existing describes.

---

## Shared Patterns

### Filter State Snapshot Before Async
**Source:** `src/bee-atlas.ts` `_runFilterQuery` line 330
**Apply to:** `_onSelectionDrawn` in `bee-atlas.ts`
```typescript
// Snapshot _filterState at call site before the first await to prevent
// stale-filter results if the user changes filters while the query is in flight.
const f = this._filterState;
```

### Lazy Sidebar Import Guard
**Source:** `src/bee-atlas.ts` `_onOccurrenceClick` line 590
**Apply to:** `_onSelectionDrawn` in `bee-atlas.ts`
```typescript
import('./bee-sidebar.ts');  // lazy-load; must precede _sidebarOpen = true
```

### ID Construction from OccurrenceRow
**Source:** `src/bee-atlas.ts` `_restoreClusterSelection` lines 902–903
**Apply to:** `_onSelectionDrawn` in `bee-atlas.ts`, and `queryOccurrencesByBounds` caller
```typescript
r.ecdysis_id != null ? `ecdysis:${r.ecdysis_id}` : `inat:${Number(r.observation_id)}`
```

### SQLite exec + OccurrenceRow deserialization
**Source:** `src/bee-atlas.ts` `_restoreClusterSelection` lines 879–886; `src/filter.ts` `queryAllFiltered` lines 137–145
**Apply to:** `queryOccurrencesByBounds` in `filter.ts`
```typescript
await sqlite3.exec(db, `SELECT ${selectCols} FROM occurrences WHERE ...`,
  (rowValues: unknown[], columnNames: string[]) => {
    rows.push(Object.fromEntries(columnNames.map((col, i) => [col, rowValues[i]])) as unknown as OccurrenceRow);
  }
);
```

### Synchronous State Clear Before Async Handler
**Source:** `src/bee-atlas.ts` `_onMapClickEmpty` (lines 660–681 clears selection state)
**Apply to:** `_onSelectionDrawn` in `bee-atlas.ts` — must clear `_selectedOccurrences`, `_selectedOccIds`, `_selectedCluster`, `_sidebarOpen` synchronously before the first `await`

## No Analog Found

None. All three files have direct analogs in the codebase.

## Metadata

**Analog search scope:** `src/filter.ts`, `src/bee-atlas.ts`, `src/tests/bee-atlas.test.ts`
**Files scanned:** 3 source files read in full
**Pattern extraction date:** 2026-05-14
