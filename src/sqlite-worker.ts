import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs';
import * as SQLite from 'wa-sqlite';
import { MemoryVFS } from 'wa-sqlite/src/examples/MemoryVFS.js';
import { parquetReadObjects } from 'hyparquet';
import { resolveDataUrl } from './manifest.ts';

type SQLiteAPI = ReturnType<typeof SQLite.Factory>;

function _escapeSqlValue(v: unknown): string {
  if (v == null) return 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'bigint') return String(Number(v));
  if (v instanceof Date) return `'${v.toISOString().slice(0, 10)}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

const INSERT_BATCH = 500;

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

async function _insertRows(
  sqlite3: SQLiteAPI,
  db: number,
  table: string,
  rows: Record<string, unknown>[]
): Promise<void> {
  if (rows.length === 0) return;
  const cols = Object.keys(rows[0]!);
  const colList = cols.join(', ');
  await sqlite3.exec(db, 'BEGIN');
  try {
    for (let i = 0; i < rows.length; i += INSERT_BATCH) {
      const batch = rows.slice(i, i + INSERT_BATCH);
      const values = batch.map(row =>
        '(' + cols.map(c => _escapeSqlValue(row[c])).join(',') + ')'
      ).join(',');
      await sqlite3.exec(db, `INSERT INTO ${table} (${colList}) VALUES ${values}`);
    }
    await sqlite3.exec(db, 'COMMIT');
  } catch (err) {
    await sqlite3.exec(db, 'ROLLBACK').catch(() => {});
    throw err;
  }
}

(async () => {
  const t0 = performance.now();
  const module = await SQLiteESMFactory();
  const sqlite3 = SQLite.Factory(module);
  const vfs = new MemoryVFS();
  sqlite3.vfs_register(vfs, true);
  const db = await sqlite3.open_v2(':memory:');
  const t1 = performance.now();
  const logs: string[] = [
    `[BENCHMARK] WASM instantiate: ${(t1 - t0).toFixed(0)} ms`,
  ];

  const origExec = sqlite3.exec.bind(sqlite3);
  (sqlite3 as any).exec = (db: number, sql: string, cb?: any) =>
    _serializedExec(origExec, db, sql, cb);

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
    host_inat_login TEXT,
    specimen_count INTEGER,
    sample_id INTEGER,
    sample_host TEXT,
    specimen_inat_taxon_name TEXT,
    specimen_inat_quality_grade TEXT,
    is_provisional INTEGER,
    canonical_name TEXT,
    lat REAL,
    lon REAL,
    date TEXT,
    county TEXT,
    ecoregion_l3 TEXT,
    place_slug TEXT,
    source TEXT,
    image_url TEXT,
    obs_url TEXT,
    user_login TEXT,
    license TEXT
  )`);

  const tFetch0 = performance.now();
  const resp = await fetch((await resolveDataUrl('occurrences'))!);
  const buffer = await resp.arrayBuffer();
  const file = { byteLength: buffer.byteLength, slice: (start: number, end: number) => buffer.slice(start, end) };
  const tParse0 = performance.now();
  const occRows = await parquetReadObjects({ file });
  const tParse1 = performance.now();
  logs.push(
    `[BENCHMARK] fetch: ${(tParse0 - tFetch0).toFixed(0)} ms | parquet parse: ${(tParse1 - tParse0).toFixed(0)} ms | rows: ${occRows.length}`,
  );

  const tInsert0 = performance.now();
  await _insertRows(sqlite3, db, 'occurrences', occRows);
  const tInsert1 = performance.now();
  logs.push(
    `[BENCHMARK] INSERT loop: ${(tInsert1 - tInsert0).toFixed(0)} ms | batches: ${Math.ceil(occRows.length / INSERT_BATCH)}`,
  );

  const tReady = performance.now();
  logs.push(`[BENCHMARK] worker tablesReady: ${(tReady - t0).toFixed(0)} ms total`);

  self.onmessage = async (e: MessageEvent) => {
    const { kind, id, sql } = e.data as { kind: string; id: number; sql: string };
    if (kind !== 'exec') return;
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
  };

  self.postMessage({ kind: 'tables-ready', logs });
})();
