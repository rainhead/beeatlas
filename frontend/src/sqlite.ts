import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs';
import * as SQLite from 'wa-sqlite';
import { MemoryVFS } from 'wa-sqlite/src/examples/MemoryVFS.js';
import { asyncBufferFromUrl, parquetReadObjects } from 'hyparquet';

type SQLiteAPI = ReturnType<typeof SQLite.Factory>;

let _dbPromise: Promise<{ sqlite3: SQLiteAPI; db: number }> | null = null;
let _benchmarkT0 = 0;

function _heapMB(): number {
  return ((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1_048_576;
}

let _tablesReadyResolve: (() => void) | null = null;
export const tablesReady: Promise<void> = new Promise(resolve => {
  _tablesReadyResolve = resolve;
});

// wa-sqlite's Asyncify-based step/prepare cannot handle concurrent calls on the
// same db — concurrent exec calls corrupt each other's return values (yielding
// SQLITE_OK=0 from step, which is never a valid step result). Serialize all exec
// calls through a microtask queue so only one runs at a time.
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

async function _init(): Promise<{ sqlite3: SQLiteAPI; db: number }> {
  const t0 = performance.now();
  const mem0 = _heapMB();
  const module = await SQLiteESMFactory();
  const sqlite3 = SQLite.Factory(module);
  const vfs = new MemoryVFS();
  sqlite3.vfs_register(vfs, true);
  const db = await sqlite3.open_v2(':memory:');
  const t1 = performance.now();
  const mem1 = _heapMB();
  console.log(`[BENCHMARK] WASM instantiate: ${(t1 - t0).toFixed(0)} ms | heap: ${mem0.toFixed(1)} -> ${mem1.toFixed(1)} MB`);
  _benchmarkT0 = t0;

  // Patch exec in-place so all callers (features.ts, filter.ts, bee-atlas.ts)
  // automatically get serialized access without any changes at call sites.
  const origExec = sqlite3.exec.bind(sqlite3);
  (sqlite3 as any).exec = (db: number, sql: string, cb?: any) =>
    _serializedExec(origExec, db, sql, cb);

  return { sqlite3, db };
}

export function getDB(): Promise<{ sqlite3: SQLiteAPI; db: number }> {
  if (!_dbPromise) _dbPromise = _init();
  return _dbPromise;
}

export async function loadOccurrencesTable(baseUrl: string): Promise<void> {
  const { sqlite3, db } = await getDB();

  await sqlite3.exec(db, `CREATE TABLE occurrences (
    ecdysis_id INTEGER,
    catalog_number TEXT,
    scientificName TEXT,
    recordedBy TEXT,
    fieldNumber TEXT,
    genus TEXT,
    family TEXT,
    floralHost TEXT,
    host_observation_id INTEGER,
    inat_host TEXT,
    inat_quality_grade TEXT,
    modified TEXT,
    specimen_observation_id INTEGER,
    elevation_m REAL,
    year INTEGER,
    month INTEGER,
    observation_id INTEGER,
    observer TEXT,
    specimen_count INTEGER,
    sample_id INTEGER,
    lat REAL,
    lon REAL,
    date TEXT,
    county TEXT,
    ecoregion_l3 TEXT
  )`);

  const occFile = await asyncBufferFromUrl({ url: `${baseUrl}/occurrences.parquet` });
  const occRows = await parquetReadObjects({ file: occFile });
  await _insertRows(sqlite3, db, 'occurrences', occRows);

  console.debug('SQLite table count: occurrences:', occRows.length);

  if (_tablesReadyResolve) _tablesReadyResolve();

  const tReady = performance.now();
  const mem2 = _heapMB();

  const tQueryStart = performance.now();
  await sqlite3.exec(db, 'SELECT COUNT(*) FROM occurrences', (_vals: any) => { /* first-query benchmark */ });
  const tQueryEnd = performance.now();

  console.log(
    `[BENCHMARK] tablesReady: ${(tReady - _benchmarkT0).toFixed(0)} ms total from init start`,
    `| heap after tables: ${mem2.toFixed(1)} MB`,
    `| first-query latency: ${(tQueryEnd - tQueryStart).toFixed(0)} ms`,
  );
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
  try {
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
  } catch (err) {
    await sqlite3.exec(db, 'ROLLBACK').catch(() => {});
    throw err;
  }
}
