# Phase 60: wa-sqlite Integration — Research

**Researched:** 2026-04-16
**Domain:** wa-sqlite (WebAssembly SQLite), hyparquet (Parquet reading), browser-side data layer migration
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Rewrite DuckDB-specific SQL expressions to SQLite-compatible equivalents in both `filter.ts` and `bee-atlas.ts`.
  - `year(date::TIMESTAMP)` → `CAST(strftime('%Y', date) AS INTEGER)`
  - `month(date::TIMESTAMP)` → `CAST(strftime('%m', date) AS INTEGER)`
  - `strftime(date, '%Y-%m-%d')` → `strftime('%Y-%m-%d', date)` (argument order reversed)
- **D-02:** Rewrite SQL in BOTH `filter.ts` AND `bee-atlas.ts` in this phase.
- **D-03:** User wants to review the plan before execution. Planner must produce a plan for user sign-off.
- **D-04:** Do NOT load counties or ecoregions into SQLite. They are OpenLayers GeoJSON only.
- **D-05:** Add `hyparquet` as a dependency. Use it to read parquet files as JS row arrays, then INSERT into wa-sqlite via batched transactions.
- **D-06:** Batch size and transaction strategy are Claude's discretion — optimize for init latency.

### Claude's Discretion

- New module name and file (`sqlite.ts` replacing `duckdb.ts`, or different name)
- Export surface of the new module (whether to preserve getDuckDB/tablesReady names or introduce a cleaner API)
- Result object format (wa-sqlite returns plain JS, not Apache Arrow — callers need updating)
- wa-sqlite package variant (which build/VFS to use for in-memory operation)
- Batch insert size

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

</user_constraints>

---

## Summary

Phase 60 replaces `frontend/src/duckdb.ts` with a new `sqlite.ts` module using two libraries: `wa-sqlite` (WebAssembly SQLite in-browser) and `hyparquet` (Parquet file reader). The migration path is: fetch parquet files via hyparquet → insert rows into wa-sqlite in-memory database → expose a compatible query API for callers. No user-visible changes result; the phase is purely an internal implementation swap.

The most significant implementation work is threefold: (1) writing the new `sqlite.ts` module with init/load/query API, (2) updating all callers (`features.ts`, `filter.ts`, `bee-atlas.ts`) from the Apache Arrow result API (`.toArray().map(r => r.toJSON())`) to plain JavaScript arrays returned by wa-sqlite's `exec` callback or `statements` iterator, and (3) rewriting the four DuckDB-specific SQL expressions (`year()`, `month()`, `strftime()` arg order) to SQLite-compatible syntax.

The wa-sqlite sync build (`wa-sqlite.mjs` + `MemoryVFS`) is the right choice: in-memory operation needs no async VFS, Vite handles the `.wasm` file via `new URL(...)` resolution automatically, and the sync build is simpler and faster. hyparquet's `parquetReadObjects` gives plain `Record<string, any>[]` rows that map directly to INSERT values.

**Primary recommendation:** Use `wa-sqlite/dist/wa-sqlite.mjs` (sync build) with `MemoryVFS` from `wa-sqlite/src/examples/MemoryVFS.js` for pure in-memory operation. Batch inserts using BEGIN/COMMIT transactions of ~500 rows each. Export a clean API surface (getDB, tablesReady, loadAllTables) with the same name pattern as the module being replaced.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Parquet fetching | Frontend (browser) | — | Static files served from CDN/dev server; fetched via `asyncBufferFromUrl` |
| Row deserialization | Frontend (browser) | — | hyparquet reads parquet bytes into JS objects in the browser |
| In-memory SQL storage | Frontend (browser) | — | wa-sqlite runs SQLite WASM in the browser, no server involvement |
| SQL query execution | Frontend (browser) | — | All queries run locally against the in-memory wa-sqlite DB |
| OL feature loading | Frontend (browser) | — | features.ts builds OL features from query results |
| Filter SQL building | Frontend (browser) | — | filter.ts builds WHERE clauses, executes against wa-sqlite |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| wa-sqlite | 1.0.0 | WebAssembly SQLite in browser | The canonical browser SQLite WASM library with VFS abstractions; maintained by rhashimoto; used by PowerSync and others |
| hyparquet | 1.25.6 | Parquet file reading in JS | Pure-JS parquet parser, no WASM, browser-native; already considered in project memory |

[VERIFIED: npm registry — `npm view wa-sqlite version` returned `1.0.0`; `npm view hyparquet version` returned `1.25.6`]

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| wa-sqlite MemoryVFS | (bundled in wa-sqlite) | Synchronous in-memory VFS | Use when all data fits in JS heap and no persistence is needed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `wa-sqlite/dist/wa-sqlite.mjs` (sync) | `wa-sqlite/dist/wa-sqlite-async.mjs` (asyncify) | Async build needed only for async VFS (IndexedDB, OPFS). Sync build is simpler and faster for in-memory use. |
| `MemoryVFS` | Default SQLite memory (no VFS registration) | Either works for in-memory. MemoryVFS is documented as "faster than the default filesystem" per the source comment. |
| `parquetReadObjects` | `parquetRead` with rowFormat: 'object' | `parquetReadObjects` is the convenience wrapper; equivalent result, less boilerplate. |

**Installation:**
```bash
npm install wa-sqlite hyparquet
```

---

## Architecture Patterns

### System Architecture Diagram

```
DATA_BASE_URL/ecdysis.parquet
DATA_BASE_URL/samples.parquet
        |
        v
  asyncBufferFromUrl()   [hyparquet]
        |
        v
  parquetReadObjects()   [hyparquet]
        |   => Record<string, any>[]
        v
  BEGIN TRANSACTION      [wa-sqlite]
  INSERT INTO ecdysis ... (batch ~500 rows)
  INSERT INTO samples ... (batch ~500 rows)
  COMMIT
        |
        v
  tablesReady.resolve()
        |
        +-----> features.ts: EcdysisSource/SampleSource
        |         sqlite3.exec(db, SELECT ..., callback)
        |
        +-----> filter.ts: queryVisibleIds / queryTablePage / etc.
        |         sqlite3.exec(db, SELECT WHERE ..., callback)
        |
        +-----> bee-atlas.ts: _loadSummaryFromSQLite / _loadCollectorOptions
                  sqlite3.exec(db, SELECT ..., callback)
```

### Recommended Project Structure

No new directories needed. One file rename/replace:

```
frontend/src/
├── sqlite.ts           # NEW — replaces duckdb.ts
├── duckdb.ts           # REPLACED by sqlite.ts (kept until Phase 61 removes it)
├── filter.ts           # MODIFIED — SQL dialect rewrites + caller API update
├── bee-atlas.ts        # MODIFIED — SQL dialect rewrites + caller API update
└── features.ts         # MODIFIED — caller API update (no SQL rewrite needed)
```

### Pattern 1: wa-sqlite Module Initialization (Sync Build + MemoryVFS)

**What:** Load the WASM module, create a Factory, register MemoryVFS, open an in-memory DB.
**When to use:** Whenever no persistence is needed and all data fits in memory.

```typescript
// Source: https://github.com/rhashimoto/wa-sqlite (verified via Context7)
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs';
import * as SQLite from 'wa-sqlite';
import { MemoryVFS } from 'wa-sqlite/src/examples/MemoryVFS.js';

async function initSQLite() {
  const module = await SQLiteESMFactory();
  const sqlite3 = SQLite.Factory(module);

  const vfs = new MemoryVFS();
  sqlite3.vfs_register(vfs, /* makeDefault */ true);

  const db = await sqlite3.open_v2(':memory:');
  return { sqlite3, db };
}
```

**Important:** `MemoryVFS` is synchronous. It must be used with the sync build (`wa-sqlite.mjs`), not the async build (`wa-sqlite-async.mjs`). The sync build uses `new URL('wa-sqlite.wasm', import.meta.url)` which Vite resolves correctly at build time — no extra Vite config needed.

### Pattern 2: hyparquet Row Reading

**What:** Fetch a parquet file from URL and read all rows as plain JS objects.
**When to use:** Loading parquet files in the browser.

```typescript
// Source: https://github.com/hyparam/hyparquet (verified via Context7)
import { asyncBufferFromUrl, parquetReadObjects } from 'hyparquet';

const file = await asyncBufferFromUrl({ url: `${baseUrl}/ecdysis.parquet` });
const rows: Record<string, unknown>[] = await parquetReadObjects({ file });
```

`parquetReadObjects` returns `Promise<Record<string, any>[]>`. Each record has column names as keys. Values are JS primitives (numbers, strings, null, BigInt for 64-bit integers).

### Pattern 3: Batched INSERT Transactions

**What:** Insert rows in batches inside BEGIN/COMMIT blocks for performance.
**When to use:** Loading large datasets into SQLite.

```typescript
// Source: wa-sqlite prepared statements pattern (verified via Context7)
const BATCH_SIZE = 500;

await sqlite3.exec(db, 'BEGIN');
let batchCount = 0;
for await (const stmt of sqlite3.statements(db, `INSERT INTO ecdysis VALUES (?, ?, ...)`)) {
  for (const row of rows) {
    sqlite3.bind_collection(stmt, [row.ecdysis_id, row.longitude, ...]);
    await sqlite3.step(stmt);
    sqlite3.reset(stmt);
    batchCount++;
    if (batchCount % BATCH_SIZE === 0) {
      await sqlite3.exec(db, 'COMMIT');
      await sqlite3.exec(db, 'BEGIN');
    }
  }
}
await sqlite3.exec(db, 'COMMIT');
```

**Alternative (simpler):** Use a single transaction wrapping all rows:

```typescript
await sqlite3.exec(db, 'BEGIN');
for await (const stmt of sqlite3.statements(db, `INSERT INTO ecdysis VALUES (?,...)`)) {
  for (const row of rows) {
    sqlite3.bind_collection(stmt, [row.ecdysis_id, ...]);
    await sqlite3.step(stmt);
    sqlite3.reset(stmt);
  }
}
await sqlite3.exec(db, 'COMMIT');
```

A single transaction wrapping all rows of one table is the simplest approach and will be fast enough for these dataset sizes (thousands of rows, not millions).

### Pattern 4: Querying — Plain JS Results (No Arrow)

**What:** Execute a SELECT and collect results as `Record<string, unknown>[]`.
**When to use:** Replacing all `conn.query(sql).toArray().map(r => r.toJSON())` call sites.

```typescript
// Source: wa-sqlite exec API (verified via Context7)
const rows: Record<string, unknown>[] = [];
await sqlite3.exec(db, `SELECT ecdysis_id, longitude FROM ecdysis WHERE 1=1`,
  (rowValues, columnNames) => {
    const obj: Record<string, unknown> = {};
    columnNames.forEach((col, i) => { obj[col] = rowValues[i]; });
    rows.push(obj);
  }
);
```

For parameterized queries (with user-supplied values), use `statements` + `bind_collection`:

```typescript
// Source: wa-sqlite prepared statements (verified via Context7)
const results: Record<string, unknown>[] = [];
for await (const stmt of sqlite3.statements(db, `SELECT * FROM ecdysis WHERE family = ?`)) {
  sqlite3.bind_collection(stmt, [familyName]);
  while (await sqlite3.step(stmt) === SQLite.SQLITE_ROW) {
    const values = sqlite3.row(stmt);
    const cols = sqlite3.column_names(stmt);
    const obj: Record<string, unknown> = {};
    cols.forEach((col, i) => { obj[col] = values[i]; });
    results.push(obj);
  }
}
```

Note: The existing `filter.ts` and `bee-atlas.ts` queries build WHERE clauses with string interpolation (with SQL-injection-safe escaping already in place). These can continue using `sqlite3.exec(db, sql, callback)` — prepared statement binding is not required for these paths.

### Pattern 5: Exposing a Stable Module API

The new `sqlite.ts` must export an API that all callers (`features.ts`, `filter.ts`, `bee-atlas.ts`) can use. The `tablesReady` promise is the critical startup gate — all callers await it before querying.

**Recommended export surface:**

```typescript
// sqlite.ts exports
export const tablesReady: Promise<void>;
export function getDB(): Promise<{ sqlite3: SQLiteAPI; db: number }>;
export async function loadAllTables(baseUrl: string): Promise<void>;
```

This breaks the existing `getDuckDB()` → `db.connect()` → `conn.query()` → `conn.close()` pattern. wa-sqlite uses a persistent `db` handle (number) without connection objects. There is no `connect()`/`close()` per query — the db handle stays open.

### Anti-Patterns to Avoid

- **Using the async build for in-memory use:** `wa-sqlite-async.mjs` requires an async VFS. MemoryVFS is synchronous. Use `wa-sqlite.mjs` (sync build) with MemoryVFS.
- **Calling `db.connect()` on wa-sqlite:** wa-sqlite has no connection pool model. The db handle returned by `open_v2` is used directly. Callers that follow the DuckDB `conn = await db.connect()` / `conn.close()` pattern must be refactored.
- **Expecting Arrow result format from wa-sqlite:** wa-sqlite returns plain JS arrays via callback, not Apache Arrow `Table`. All `.toArray().map(r => r.toJSON())` call sites must be replaced.
- **INSERT without transactions:** Each individual INSERT is an implicit transaction in SQLite, making bulk loads very slow (often 100x slower than a single wrapped transaction).
- **Leaving DuckDB imports in filter.ts/bee-atlas.ts:** Even after `sqlite.ts` is created, `filter.ts` and `bee-atlas.ts` must be updated to import from `sqlite.ts`, not `duckdb.ts`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parquet decoding | Custom byte parser | `hyparquet.parquetReadObjects` | Parquet encoding (RLE, dictionary, delta, etc.) is complex; hyparquet handles all column types |
| In-memory SQLite | Custom query engine | `wa-sqlite + MemoryVFS` | SQL parsing, query planning, and index management are non-trivial; wa-sqlite wraps the real SQLite C engine |
| Row-to-object conversion | Column-index loops | `sqlite3.exec` callback with `columnNames` | exec passes both values and column names in the callback — trivial to zip into an object |

---

## SQL Dialect Rewrites (Exhaustive)

This section documents every DuckDB-specific SQL expression found in `filter.ts` and `bee-atlas.ts` that must be rewritten for SQLite.

### filter.ts — buildFilterSQL (lines 242–247)

| Location | DuckDB Expression | SQLite Replacement |
|----------|-------------------|-------------------|
| `filter.ts:242` | `year(date::TIMESTAMP) >= ${f.yearFrom}` | `CAST(strftime('%Y', date) AS INTEGER) >= ${f.yearFrom}` |
| `filter.ts:245` | `year(date::TIMESTAMP) <= ${f.yearTo}` | `CAST(strftime('%Y', date) AS INTEGER) <= ${f.yearTo}` |
| `filter.ts:251` | `month(date::TIMESTAMP) IN (${monthList})` | `CAST(strftime('%m', date) AS INTEGER) IN (${monthList})` |

### filter.ts — queryAllFiltered (line 153)

| Location | DuckDB Expression | SQLite Replacement |
|----------|-------------------|-------------------|
| `filter.ts:153` | `strftime(date, '%Y-%m-%d') as date` | `strftime('%Y-%m-%d', date) as date` |

### filter.ts — queryTablePage (line 188)

| Location | DuckDB Expression | SQLite Replacement |
|----------|-------------------|-------------------|
| `filter.ts:188` | `strftime(${col}, '%Y-%m-%d') as ${col}` | `strftime('%Y-%m-%d', ${col}) as ${col}` |

### bee-atlas.ts — no DuckDB SQL functions

The queries in `_loadSummaryFromDuckDB`, `_loadCollectorOptions`, and `_restoreSelectionSamples` use only standard SQL (COUNT, DISTINCT, MIN, MAX, GROUP BY, JOIN, WHERE). No DuckDB-specific function rewrites needed in bee-atlas.ts. The `::TIMESTAMP` cast does not appear in bee-atlas.ts.

**Summary:** All 5 expression rewrites are in `filter.ts`. `bee-atlas.ts` has no SQL dialect changes — only caller API updates.

---

## Caller API Update Map

Every call site in the codebase that uses the DuckDB connection/query/Arrow chain must be updated:

### features.ts

| Pattern to Replace | Replacement |
|--------------------|-------------|
| `await tablesReady` | `await tablesReady` (same export name from sqlite.ts) |
| `const db = await getDuckDB()` | `const { sqlite3, db } = await getDB()` |
| `conn = await db.connect()` | (remove — no connection objects in wa-sqlite) |
| `const table = await conn.query(sql)` | collect via `exec` callback |
| `table.toArray().flatMap(row => { const obj = row.toJSON(); ... })` | iterate rows from exec callback directly |
| `if (conn) await conn.close()` | (remove) |

### filter.ts

Same connection pattern replacement, plus SQL dialect rewrites listed above. Functions affected: `queryAllFiltered`, `queryTablePage`, `queryFilteredCounts`, `queryVisibleIds`.

Import line `import { getDuckDB, tablesReady } from './duckdb.ts'` → `import { getDB, tablesReady } from './sqlite.ts'`

### bee-atlas.ts

Same connection pattern replacement. Functions affected: `_loadSummaryFromDuckDB`, `_loadCollectorOptions`, `_restoreSelectionSamples`, plus the init call at line 267.

Import line `import { getDuckDB, loadAllTables, tablesReady } from './duckdb.ts'` → `import { getDB, loadAllTables, tablesReady } from './sqlite.ts'`

The init call becomes: `loadAllTables(DATA_BASE_URL).then(() => { ... })`

---

## Test Mock Updates

All test files mock `'../duckdb.ts'` at the module level:

- `frontend/src/tests/bee-atlas.test.ts` — mocks `duckdb.ts` with `getDuckDB`, `loadAllTables`, `tablesReady`
- `frontend/src/tests/filter.test.ts` — mocks `duckdb.ts` with `getDuckDB`, `loadAllTables`, `tablesReady`

If the new module is `sqlite.ts` and exports `getDB` instead of `getDuckDB`, both mock paths and mock shapes must be updated:

```typescript
// OLD
vi.mock('../duckdb.ts', () => ({
  getDuckDB: vi.fn(() => Promise.resolve({})),
  loadAllTables: vi.fn(() => Promise.resolve()),
  tablesReady: Promise.resolve(),
}));

// NEW (if exporting getDB + loadAllTables + tablesReady from sqlite.ts)
vi.mock('../sqlite.ts', () => ({
  getDB: vi.fn(() => Promise.resolve({ sqlite3: {}, db: 0 })),
  loadAllTables: vi.fn(() => Promise.resolve()),
  tablesReady: Promise.resolve(),
}));
```

All 165 existing tests are mock-based and do not exercise SQL execution — the SQL rewrites are not covered by existing tests. This is expected and acceptable per the CONTEXT.md analysis.

---

## Benchmark Instrumentation

The `BENCHMARK.md` wa-sqlite column must be filled at the end of the phase. The column header already says "Phase 61 after migration" — the planner should note this is being filled in Phase 60 (the actual migration phase). Metrics to capture (same methodology as Phase 59):

- WASM instantiate time: from `SQLiteESMFactory()` call start to `Factory(module)` return
- tablesReady total time: from init start to `_tablesReadyResolve()` call
- First-query latency: `SELECT COUNT(*) FROM ecdysis` after tablesReady
- Heap before init: `performance.memory.usedJSHeapSize` before `SQLiteESMFactory()`
- Heap after instantiate: after `Factory(module)` + `open_v2`
- Heap after tablesReady: after all INSERT batches complete

---

## Common Pitfalls

### Pitfall 1: Using Async Build with Sync VFS

**What goes wrong:** Importing `wa-sqlite-async.mjs` with `MemoryVFS` causes runtime errors because the async build's Asyncify instrumentation conflicts with synchronous VFS implementations.
**Why it happens:** wa-sqlite has two distinct WASM builds: sync (`wa-sqlite.mjs`) and asyncified (`wa-sqlite-async.mjs`). MemoryVFS is synchronous.
**How to avoid:** Always pair `wa-sqlite.mjs` with `MemoryVFS`; use `wa-sqlite-async.mjs` only with async VFS implementations (IDBBatchAtomicVFS, OPFSCoopSyncVFS).
**Warning signs:** "Asyncify state assertion failed" or similar WASM runtime errors on db.open_v2.

### Pitfall 2: Forgetting to Reset Prepared Statements Between Rows

**What goes wrong:** INSERT only inserts the first row; subsequent rows are silently skipped.
**Why it happens:** `sqlite3.step(stmt)` executes one row. After SQLITE_DONE, you must call `sqlite3.reset(stmt)` before re-binding and re-stepping.
**How to avoid:** Always call `sqlite3.reset(stmt)` after `await sqlite3.step(stmt)` within a `statements` for-await loop when re-using the same statement.
**Warning signs:** Table shows row count of 1 after loading thousands of parquet rows.

### Pitfall 3: BigInt Values from hyparquet

**What goes wrong:** Parquet files with INT64 columns (e.g. `specimen_observation_id`, `host_observation_id`) produce `BigInt` values in JavaScript, not `Number`. SQLite bind functions handle BigInt correctly, but callers doing `Number(obj.specimen_observation_id)` must handle the case where the value is `null | bigint | number`.
**Why it happens:** JavaScript `Number` cannot represent all 64-bit integers; hyparquet returns `BigInt` for large integers.
**How to avoid:** Use `obj.specimen_observation_id != null ? Number(obj.specimen_observation_id) : null` (already used in existing code for Arrow results — the same guard works for hyparquet BigInt output).
**Warning signs:** `[object BigInt]` appearing in feature properties or query results.

### Pitfall 4: strftime Date Format With SQLite Date Strings

**What goes wrong:** `strftime('%Y', date)` returns `NULL` if the `date` column contains ISO strings without a time component (e.g. `'2023-06-15'`).
**Why it happens:** SQLite's `strftime` accepts 'YYYY-MM-DD' date strings, but only recognizes them as dates when they match its recognized formats. Bare date strings (`'2023-06-15'`) are accepted.
**How to avoid:** The existing `date` column in both tables already stores ISO date strings. `strftime('%Y', date)` works correctly for these. The DuckDB pattern `year(date::TIMESTAMP)` cast is unnecessary in SQLite.
**Warning signs:** Year/month filters return no results despite data existing.

### Pitfall 5: Vite and WASM Asset Resolution

**What goes wrong:** `wa-sqlite.wasm` is not found at runtime in the built app.
**Why it happens:** The `wa-sqlite.mjs` file uses `new URL('wa-sqlite.wasm', import.meta.url)` for WASM loading — a pattern Vite recognizes and rewrites automatically to a hashed asset URL. No extra Vite config is needed.
**How to avoid:** Import `wa-sqlite.mjs` as a static ESM import (not via dynamic `import()` with string concatenation). Vite's static URL analysis handles `new URL(...)` patterns.
**Warning signs:** 404 for `.wasm` file in the network tab after `npm run build`.

---

## Code Examples

### Complete sqlite.ts Init Pattern

```typescript
// Source: wa-sqlite Context7 docs + MemoryVFS source inspection
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs';
import * as SQLite from 'wa-sqlite';
import { MemoryVFS } from 'wa-sqlite/src/examples/MemoryVFS.js';
import { asyncBufferFromUrl, parquetReadObjects } from 'hyparquet';

type SQLiteAPI = ReturnType<typeof SQLite.Factory>;

let _dbPromise: Promise<{ sqlite3: SQLiteAPI; db: number }> | null = null;

let _tablesReadyResolve: (() => void) | null = null;
export const tablesReady: Promise<void> = new Promise(resolve => {
  _tablesReadyResolve = resolve;
});

async function _init(): Promise<{ sqlite3: SQLiteAPI; db: number }> {
  const module = await SQLiteESMFactory();
  const sqlite3 = SQLite.Factory(module);
  const vfs = new MemoryVFS();
  sqlite3.vfs_register(vfs, true);
  const db = await sqlite3.open_v2(':memory:');
  return { sqlite3, db };
}

export function getDB(): Promise<{ sqlite3: SQLiteAPI; db: number }> {
  if (!_dbPromise) _dbPromise = _init();
  return _dbPromise;
}

export async function loadAllTables(baseUrl: string): Promise<void> {
  const { sqlite3, db } = await getDB();

  // Create tables
  await sqlite3.exec(db, `CREATE TABLE ecdysis (...)`);
  await sqlite3.exec(db, `CREATE TABLE samples (...)`);

  // Load ecdysis
  const ecdysisFile = await asyncBufferFromUrl({ url: `${baseUrl}/ecdysis.parquet` });
  const ecdysisRows = await parquetReadObjects({ file: ecdysisFile });
  await _insertRows(sqlite3, db, 'ecdysis', ecdysisRows);

  // Load samples
  const samplesFile = await asyncBufferFromUrl({ url: `${baseUrl}/samples.parquet` });
  const samplesRows = await parquetReadObjects({ file: samplesFile });
  await _insertRows(sqlite3, db, 'samples', samplesRows);

  if (_tablesReadyResolve) _tablesReadyResolve();
}

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
      sqlite3.bind_collection(stmt, cols.map(c => row[c] ?? null) as any);
      await sqlite3.step(stmt);
      sqlite3.reset(stmt);
    }
  }
  await sqlite3.exec(db, 'COMMIT');
}
```

### Exec-Based Query (Replacing Arrow Pattern)

```typescript
// Replaces: conn.query(sql).toArray().map(r => r.toJSON())
// Source: wa-sqlite exec API
async function queryRows(sql: string): Promise<Record<string, unknown>[]> {
  const { sqlite3, db } = await getDB();
  const rows: Record<string, unknown>[] = [];
  await sqlite3.exec(db, sql, (rowValues, columnNames) => {
    const obj: Record<string, unknown> = {};
    columnNames.forEach((col, i) => { obj[col] = rowValues[i]; });
    rows.push(obj);
  });
  return rows;
}
```

---

## Environment Availability

Step 2.6: All dependencies are npm packages installed at build time. No external services, CLI tools, or databases required. wa-sqlite and hyparquet will be installed during the task that adds them to package.json.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| wa-sqlite | sqlite.ts init | Not yet installed | 1.0.0 (npm) | — (required) |
| hyparquet | sqlite.ts loadAllTables | Not yet installed | 1.25.6 (npm) | — (required) |
| Node.js + npm | package install | ✓ | (project standard) | — |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 |
| Config file | `frontend/vite.config.ts` (test section) |
| Quick run command | `cd frontend && npm test` |
| Full suite command | `cd frontend && npm test` |

### Phase Requirements → Test Map

| Behavior | Test Type | Automated Command | Coverage |
|----------|-----------|-------------------|----------|
| `@duckdb/duckdb-wasm` not imported | Static analysis / grep | `grep -r 'duckdb-wasm' frontend/src --include='*.ts'` should return 0 results | Manual verify |
| All 165 tests pass | Unit (mock-based) | `cd frontend && npm test` | ✅ existing suite |
| TypeScript compiles cleanly | Type check | `cd frontend && npx tsc --noEmit` | Manual verify |
| SQL rewrites correct (strftime, year, month) | Unit | `cd frontend && npm test` (filter.test.ts tests buildFilterSQL) | Partially — tests check SQL string output |
| wa-sqlite queries execute correctly | Integration (manual) | Run `npm run dev`, exercise filters in browser | Manual only |

**Note:** The existing test suite mocks the database module at the module level. This means the SQL rewrites are not covered by automated tests — they are verified manually via `npm run dev` in the browser. This is acceptable given the phase's explicit "no SQL tests" characteristic identified in the CONTEXT.md.

### Sampling Rate

- **Per task commit:** `cd frontend && npm test` (165 tests, ~700ms)
- **Per wave merge:** `cd frontend && npm test && npx tsc --noEmit`
- **Phase gate:** Full suite green + TypeScript clean before `/gsd-verify-work`

### Wave 0 Gaps

None — existing test infrastructure covers all automated requirements. SQL correctness is verified manually.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `MemoryVFS` is compatible with the sync `wa-sqlite.mjs` build (not async) | Standard Stack / Pitfalls | Low — confirmed via source code inspection; MemoryVFS uses synchronous xOpen/xRead/xWrite methods, consistent with sync VFS interface |
| A2 | hyparquet `parquetReadObjects` returns `null` for NULL parquet values (not `undefined`) | Code Examples | Low — NULL handling checked in existing caller code; if `undefined`, existing `?? null` guards handle it |
| A3 | `strftime('%Y', '2023-06-15')` returns `'2023'` in SQLite (bare date strings work without TIMESTAMP cast) | SQL Dialect Rewrites | Low — SQLite date string format is well-documented; YYYY-MM-DD is a recognized SQLite date format |

---

## Open Questions

1. **CREATE TABLE column types for ecdysis and samples**
   - What we know: Column names are defined in `filter.ts` (SPECIMEN_COLUMNS, SAMPLE_COLUMNS) and `features.ts` (SELECT lists). Types can be inferred from usage.
   - What's unclear: Whether parquet files have additional columns beyond what the queries use; whether SQLite column affinity matters for the specific queries.
   - Recommendation: Use `TEXT` for strings, `REAL` for floats, `INTEGER` for integers, `INTEGER` for booleans. SQLite is lenient with type affinity — a permissive CREATE TABLE is fine. The planner should inspect the full column list from existing SELECT statements in `features.ts` and `bee-atlas.ts`.

2. **BENCHMARK.md column header says "Phase 61 after migration" but this is Phase 60**
   - What we know: The benchmark was set up in Phase 59 anticipating Phase 61 as the migration phase; Phase 60 is actually the migration.
   - What's unclear: Whether to update the column header label or just fill in the numbers as-is.
   - Recommendation: Update the column header to "wa-sqlite (Phase 60 migration)" when filling in numbers.

---

## Sources

### Primary (HIGH confidence)
- `/rhashimoto/wa-sqlite` via Context7 — init pattern, MemoryVFS, exec API, prepared statements, transaction management
- `/hyparam/hyparquet` via Context7 — asyncBufferFromUrl, parquetReadObjects API
- npm registry (`npm view wa-sqlite version`, `npm view hyparquet version`) — current versions confirmed
- `wa-sqlite` npm package source inspection (`npm pack` + `tar`) — confirmed `dist/` contains `wa-sqlite.mjs`, `wa-sqlite.wasm`, `wa-sqlite-async.mjs`, `wa-sqlite-async.wasm`; `src/examples/MemoryVFS.js` confirmed synchronous implementation

### Secondary (MEDIUM confidence)
- `wa-sqlite/dist/wa-sqlite.mjs` source inspection — confirmed `new URL('wa-sqlite.wasm', import.meta.url)` pattern (Vite-compatible)

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions confirmed via npm registry; package structure confirmed via source inspection
- Architecture: HIGH — based on direct source file analysis of all callers and wa-sqlite API docs
- Pitfalls: HIGH — derived from direct source/API analysis, not web search speculation
- SQL rewrites: HIGH — all rewrite sites identified via grep of actual source files; SQLite strftime is well-documented

**Research date:** 2026-04-16
**Valid until:** 2026-05-16 (stable libraries; wa-sqlite 1.0.0 is a stable release)
