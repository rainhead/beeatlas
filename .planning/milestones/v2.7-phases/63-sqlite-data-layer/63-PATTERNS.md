# Phase 63: SQLite Data Layer - Pattern Map

**Mapped:** 2026-04-17
**Files analyzed:** 3 (all modifications to existing files)
**Analogs found:** 3 / 3 (each file is its own analog — modifications in place)

## File Classification

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|-----------|----------------|---------------|
| `frontend/src/sqlite.ts` | service | file-I/O | itself (rename + restructure) | exact |
| `frontend/src/filter.ts` | service | CRUD | itself (query rewrites) | exact |
| `frontend/src/tests/filter.test.ts` | test | request-response | itself (destructuring updates) | exact |

## Pattern Assignments

### `frontend/src/sqlite.ts` (service, file-I/O)

**Analog:** itself — rename `loadAllTables` → `loadOccurrencesTable`, collapse two table definitions into one.

**Current imports pattern** (lines 1-4) — unchanged:
```typescript
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs';
import * as SQLite from 'wa-sqlite';
import { MemoryVFS } from 'wa-sqlite/src/examples/MemoryVFS.js';
import { asyncBufferFromUrl, parquetReadObjects } from 'hyparquet';
```

**Serialized exec queue** (lines 24-34) — must be preserved verbatim:
```typescript
let _execQueue: Promise<void> = Promise.resolve();
function _serializedExec(
  origExec: SQLiteAPI['exec'],
  db: number,
  sql: string,
  callback?: (rowValues: unknown[], columnNames: string[]) => void
): Promise<void> {
  const next = _execQueue.then(() => (origExec as any)(db, sql, callback));
  _execQueue = next.then(() => {}, () => {});
  return next;
}
```

**tablesReady signal** (lines 15-18) — keep exactly, resolve after single table loaded:
```typescript
let _tablesReadyResolve: (() => void) | null = null;
export const tablesReady: Promise<void> = new Promise(resolve => {
  _tablesReadyResolve = resolve;
});
```

**CREATE TABLE pattern to replace** — the new `occurrences` table must match the authoritative column list from `scripts/validate-schema.mjs` lines 23-35:
```
// specimen-side (null for sample-only rows)
ecdysis_id, catalog_number, scientificName, recordedBy, fieldNumber,
genus, family, floralHost,
host_observation_id, inat_host, inat_quality_grade,
modified, specimen_observation_id, elevation_m,
year, month,
// sample-side (null for specimen-only rows)
observation_id, observer, specimen_count, sample_id,
// unified (always populated via COALESCE)
lat, lon, date,
county, ecoregion_l3
```

**Parquet load pattern** (lines 103-112) — single file replaces two files:
```typescript
// OLD (two files):
const ecdysisFile = await asyncBufferFromUrl({ url: `${baseUrl}/ecdysis.parquet` });
const ecdysisRows = await parquetReadObjects({ file: ecdysisFile });
const samplesFile = await asyncBufferFromUrl({ url: `${baseUrl}/samples.parquet` });
const samplesRows = await parquetReadObjects({ file: samplesFile });
await _insertRows(sqlite3, db, 'ecdysis', ecdysisRows);
await _insertRows(sqlite3, db, 'samples', samplesRows);

// NEW pattern (single file):
const occFile = await asyncBufferFromUrl({ url: `${baseUrl}/occurrences.parquet` });
const occRows = await parquetReadObjects({ file: occFile });
await _insertRows(sqlite3, db, 'occurrences', occRows);
```

**Benchmark + tablesReady resolve block** (lines 113-128) — keep structure, update table name in first-query benchmark:
```typescript
if (_tablesReadyResolve) _tablesReadyResolve();
// ... benchmark logging ...
await sqlite3.exec(db, 'SELECT COUNT(*) FROM occurrences', (_vals: any) => { /* first-query benchmark */ });
```

**_insertRows helper** (lines 130-156) — unchanged, works for any table/column set:
```typescript
async function _insertRows(
  sqlite3: SQLiteAPI,
  db: number,
  table: string,
  rows: Record<string, unknown>[]
): Promise<void> {
  if (rows.length === 0) return;
  const cols = Object.keys(rows[0]!);
  const placeholders = cols.map(() => '?').join(', ');
  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`;

  await sqlite3.exec(db, 'BEGIN');
  for await (const stmt of sqlite3.statements(db, sql)) {
    for (const row of rows) {
      sqlite3.bind_collection(stmt, cols.map(c => {
        const v = row[c];
        if (v == null) return null;
        if (typeof v === 'bigint') return Number(v);
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        return v;
      }) as any);
      await sqlite3.step(stmt);
      sqlite3.reset(stmt);
    }
  }
  await sqlite3.exec(db, 'COMMIT');
}
```

---

### `frontend/src/filter.ts` (service, CRUD)

**Analog:** itself — `buildFilterSQL` returns `{ occurrenceWhere }` instead of `{ ecdysisWhere, samplesWhere }`. All query functions query `occurrences` table with `layerMode` discriminator clauses.

**Unchanged imports** (line 1):
```typescript
import { getDB, tablesReady } from './sqlite.ts';
```

**buildFilterSQL return type change** (line 225):
```typescript
// OLD:
export function buildFilterSQL(f: FilterState): { ecdysisWhere: string; samplesWhere: string }

// NEW:
export function buildFilterSQL(f: FilterState): { occurrenceWhere: string }
```

**buildFilterSQL internal pattern** — single clause array replaces dual arrays. Key changes by filter type:

- Taxon (old line 230-241): remove `samplesClauses.push('1 = 0')` — null semantics handle exclusion naturally (D-04)
- Year (old lines 244-251): use `year >= X` / `year <= X` directly — null for sample-only rows naturally excludes them (D-01)
- Month (old lines 254-258): use `month IN (...)` directly — null for sample-only rows naturally excludes them (D-01)
- County (old lines 261-265): single `county IN (...)` clause
- Ecoregion (old lines 268-272): single `ecoregion_l3 IN (...)` clause
- Collector (old lines 275-284): single OR clause (D-05):
  ```typescript
  const parts: string[] = [];
  if (recordedBys.length > 0) parts.push(`recordedBy IN (${recordedBys.join(',')})`);
  if (observers.length > 0) parts.push(`observer IN (${observers.join(',')})`);
  if (parts.length > 0) occurrenceClauses.push(`(${parts.join(' OR ')})`);
  ```
- Elevation (old lines 287-296): same patterns, applied once to unified `occurrenceClauses`

**buildFilterSQL final return** (old lines 298-300):
```typescript
// OLD:
const ecdysisWhere = ecdysisClauses.length > 0 ? ecdysisClauses.join(' AND ') : '1 = 1';
const samplesWhere = samplesClauses.length > 0 ? samplesClauses.join(' AND ') : '1 = 1';
return { ecdysisWhere, samplesWhere };

// NEW:
const occurrenceWhere = occurrenceClauses.length > 0 ? occurrenceClauses.join(' AND ') : '1 = 1';
return { occurrenceWhere };
```

**layerMode discriminator pattern** (D-02) — used in `queryTablePage`, `queryAllFiltered`, `queryVisibleIds`:
```typescript
// specimens mode: WHERE ecdysis_id IS NOT NULL AND <occurrenceWhere>
// samples mode:   WHERE observation_id IS NOT NULL AND <occurrenceWhere>
const discriminator = layerMode === 'specimens'
  ? 'ecdysis_id IS NOT NULL'
  : 'observation_id IS NOT NULL';
const fullWhere = `${discriminator} AND ${occurrenceWhere}`;
```

**queryAllFiltered** (lines 139-169) — update table name, WHERE clause, and SELECT columns:
```typescript
// OLD table selection:
const table = layerMode === 'specimens' ? 'ecdysis' : 'samples';
const where = layerMode === 'specimens' ? ecdysisWhere : samplesWhere;

// NEW:
const table = 'occurrences';
const where = `${layerMode === 'specimens' ? 'ecdysis_id IS NOT NULL' : 'observation_id IS NOT NULL'} AND ${occurrenceWhere}`;
```

The `selectCols` for specimens mode references `longitude`/`latitude` (old ecdysis columns) — update to `lon`/`lat` from unified schema (validate-schema.mjs lines 33-34).

**queryTablePage** (lines 171-211) — same discriminator + table rename pattern. The `strftime('%Y-%m-%d', date)` wrapping for samples date column remains valid since `date` is a unified column.

**queryFilteredCounts** (lines 310-330) — already only used `ecdysisWhere`; update table name:
```typescript
// OLD:
const { ecdysisWhere } = buildFilterSQL(f);
// ... FROM ecdysis WHERE ${ecdysisWhere}

// NEW:
const { occurrenceWhere } = buildFilterSQL(f);
// ... FROM occurrences WHERE ecdysis_id IS NOT NULL AND ${occurrenceWhere}
```

**queryVisibleIds** (lines 332-354) — return type stays `{ ecdysis: Set<string> | null; samples: Set<string> | null }` (D-07). Two queries against unified table:
```typescript
// OLD (two table queries):
const { ecdysisWhere, samplesWhere } = buildFilterSQL(f);
await sqlite3.exec(db, `SELECT ecdysis_id FROM ecdysis WHERE ${ecdysisWhere}`, ...);
await sqlite3.exec(db, `SELECT observation_id FROM samples WHERE ${samplesWhere}`, ...);

// NEW (two queries, one table):
const { occurrenceWhere } = buildFilterSQL(f);
await sqlite3.exec(db, `SELECT ecdysis_id FROM occurrences WHERE ecdysis_id IS NOT NULL AND ${occurrenceWhere}`, ...);
await sqlite3.exec(db, `SELECT observation_id FROM occurrences WHERE observation_id IS NOT NULL AND ${occurrenceWhere}`, ...);
```

Debug log pattern (old lines 338-339) — update to single WHERE:
```typescript
console.debug('[filter-sql] occurrence WHERE:', occurrenceWhere);
```

**await tablesReady pattern** (present in all async query functions, e.g. line 157) — unchanged:
```typescript
await tablesReady;
const { sqlite3, db } = await getDB();
```

---

### `frontend/src/tests/filter.test.ts` (test, request-response)

**Analog:** itself — update destructuring and remove tests that assert `samplesWhere === '1 = 0'`.

**Mock block** (lines 6-10) — rename `loadAllTables` to `loadOccurrencesTable`:
```typescript
vi.mock('../sqlite.ts', () => ({
  getDB: vi.fn(() => Promise.resolve({ sqlite3: {}, db: 0 })),
  loadOccurrencesTable: vi.fn(() => Promise.resolve()),  // was loadAllTables
  tablesReady: Promise.resolve(),
}));
```

**buildFilterSQL destructuring** — all call sites change from `{ ecdysisWhere, samplesWhere }` to `{ occurrenceWhere }`. Affected test blocks:

- line 33: `const { ecdysisWhere, samplesWhere } = buildFilterSQL(emptyFilter());`
- line 42: in `taxon family` test
- line 48: in `taxon genus` test
- line 55: in `taxon species` test
- line 62: in `yearFrom` test
- line 69: in `yearTo` test
- line 76: in `single month` test
- line 83: in `multiple months` test
- line 90: in `single county` test
- line 97: in `multiple counties` test
- line 104: in `ecoregion` test
- line 125: in combined filters test
- line 149: in elevation tests
- line 254: in single-quote escaping test

**Tests to remove** — any test asserting `samplesWhere === '1 = 0'` (D-04 removes ghost clause). Specific tests:
- line 44: `expect(samplesWhere).toBe('1 = 0');` (taxon family)
- line 50: `expect(samplesWhere).toBe('1 = 0');` (taxon genus)
- line 57: `expect(samplesWhere).toBe('1 = 0');` (taxon species)
- line 137: `expect(samplesWhere).toContain('1 = 0');` (combined filters)

**Tests to update** — year/month tests that asserted `strftime` on samplesWhere now assert the plain column on `occurrenceWhere` (D-01):
```typescript
// OLD (line 63-65):
expect(ecdysisWhere).toBe('year >= 2020');
expect(samplesWhere).toBe("CAST(strftime('%Y', date) AS INTEGER) >= 2020");

// NEW:
expect(occurrenceWhere).toBe('year >= 2020');
```

Same pattern for yearTo (lines 70-72), months (lines 77-79, 85-87), combined (lines 138-143).

**Tests that remain valid** (county, ecoregion, elevation, combined non-strftime assertions) — same SQL, just rename destructured variable.

**mockSQLite helper** (lines 288-303) — unchanged, works against any SQL string.

**queryTablePage tests** (lines 305-375) — no changes needed beyond the mock rename; the column assertions remain valid since unified schema contains all referenced columns.

---

## Shared Patterns

### tablesReady await guard
**Source:** `frontend/src/filter.ts` lines 157-158, 194-195, 314-315, 341-342
**Apply to:** All async query functions in `filter.ts`
```typescript
await tablesReady;
const { sqlite3, db } = await getDB();
```

### exec callback row collector
**Source:** `frontend/src/filter.ts` lines 162-165
**Apply to:** All `sqlite3.exec` calls that collect rows
```typescript
(rowValues: unknown[], columnNames: string[]) => {
  const obj: Record<string, unknown> = {};
  columnNames.forEach((col: string, i: number) => { obj[col] = rowValues[i]; });
  rows.push(obj);
}
```

### Single-quote SQL escaping
**Source:** `frontend/src/filter.ts` lines 231, 263, 270, 278, 281
**Apply to:** All string values interpolated into SQL in `buildFilterSQL`
```typescript
const escaped = value.replace(/'/g, "''");
```

### layerMode discriminator
**Source:** Decisions D-02, D-03 in CONTEXT.md
**Apply to:** `queryTablePage`, `queryAllFiltered`, `queryVisibleIds`, `queryFilteredCounts`
```typescript
const discriminator = layerMode === 'specimens'
  ? 'ecdysis_id IS NOT NULL'
  : 'observation_id IS NOT NULL';
```

---

## No Analog Found

None — all three files are modifications of existing files with clear existing patterns.

---

## Call Sites Outside Scope (Phase 63 must update)

These call `loadAllTables` by name in mocks — must rename to `loadOccurrencesTable` to keep tests passing:

| File | Line | Change |
|------|------|--------|
| `frontend/src/bee-atlas.ts` | 5, 267 | import rename + call site rename |
| `frontend/src/tests/filter.test.ts` | 8 | mock key rename |
| `frontend/src/tests/bee-atlas.test.ts` | 11 | mock key rename |
| `frontend/src/tests/bee-header.test.ts` | 6 | mock key rename |
| `frontend/src/tests/bee-filter-toolbar.test.ts` | 8 | mock key rename |
| `frontend/src/tests/bee-sidebar.test.ts` | 11 | mock key rename |
| `frontend/src/tests/bee-table.test.ts` | 6 | mock key rename |

---

## Metadata

**Analog search scope:** `frontend/src/`, `scripts/`
**Files scanned:** 4 (sqlite.ts, filter.ts, filter.test.ts, validate-schema.mjs) + grep for call sites
**Pattern extraction date:** 2026-04-17
