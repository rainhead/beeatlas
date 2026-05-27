import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs';
import * as SQLite from 'wa-sqlite';
import { MemoryVFS } from 'wa-sqlite/src/examples/MemoryVFS.js';
import { parquetReadObjects } from 'hyparquet';
import { resolveDataUrl } from './manifest.ts';
import type { FeatureCollection, Point, Feature } from 'geojson';

type SQLiteAPI = ReturnType<typeof SQLite.Factory>;

// Inlined from occurrence.ts / style.ts — pure functions with no DOM/SQLite deps.
function _occId(row: Record<string, unknown>): string | null {
  if (row.ecdysis_id != null) return `ecdysis:${row.ecdysis_id}`;
  if (row.observation_id != null) return `inat:${row.observation_id}`;
  if (row.specimen_observation_id != null) return `inat_obs:${row.specimen_observation_id}`;
  return null;
}
function _recencyTier(year: number): 'thisYear' | 'lastYear' | 'earlier' {
  const y = new Date().getFullYear();
  if (year >= y) return 'thisYear';
  if (year >= y - 1) return 'lastYear';
  return 'earlier';
}

interface OccurrenceProperties { occId: string; recencyTier: string; source: string }
interface DataSummary { totalSpecimens: number; speciesCount: number; genusCount: number; familyCount: number; earliestYear: number; latestYear: number }
interface TaxonOption { label: string; name: string; rank: 'family' | 'genus' | 'species' }

function _buildGeoJSON(rows: Record<string, unknown>[]): {
  geojson: FeatureCollection<Point, OccurrenceProperties>;
  summary: DataSummary;
  taxaOptions: TaxonOption[];
} {
  const features: Feature<Point, OccurrenceProperties>[] = [];
  const species = new Set<string>();
  const genera = new Set<string>();
  const families = new Set<string>();
  let minYear = Infinity, maxYear = -Infinity;

  for (const row of rows) {
    if (row.lat == null || row.lon == null) continue;
    const occId = _occId(row);
    if (occId == null) continue;

    const year = Number(row.year);

    if (row.ecdysis_id != null) {
      const s = row.scientificName as string;
      const g = row.genus as string;
      const fam = row.family as string;
      if (s) species.add(s);
      if (g) genera.add(g);
      if (fam) families.add(fam);
      if (year < minYear) minYear = year;
      if (year > maxYear) maxYear = year;
    }

    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [Number(row.lon), Number(row.lat)] },
      properties: { occId, recencyTier: _recencyTier(year), source: String(row.source ?? '') },
    });
  }

  const summary: DataSummary = {
    totalSpecimens: features.filter(f => f.properties.occId.startsWith('ecdysis:')).length,
    speciesCount: species.size,
    genusCount: genera.size,
    familyCount: families.size,
    earliestYear: minYear === Infinity ? 0 : minYear,
    latestYear: maxYear === -Infinity ? 0 : maxYear,
  };

  const taxaOptions: TaxonOption[] = [
    ...[...families].sort().map(v => ({ label: `${v} (family)`, name: v, rank: 'family' as const })),
    ...[...genera].sort().map(v => ({ label: `${v} (genus)`, name: v, rank: 'genus' as const })),
    ...[...species].filter(v => !(genera.has(v) && !v.includes(' '))).sort().map(v => ({ label: v, name: v, rank: 'species' as const })),
  ];

  return { geojson: { type: 'FeatureCollection', features }, summary, taxaOptions };
}

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

let _geoJSON: ReturnType<typeof _buildGeoJSON> | null = null;

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

  const tGeo0 = performance.now();
  _geoJSON = _buildGeoJSON(occRows as Record<string, unknown>[]);
  const tGeo1 = performance.now();
  logs.push(`[BENCHMARK] GeoJSON build (worker): ${(tGeo1 - tGeo0).toFixed(0)} ms | features: ${_geoJSON.geojson.features.length}`);

  const tInsert0 = performance.now();
  await _insertRows(sqlite3, db, 'occurrences', occRows as Record<string, unknown>[]);
  const tInsert1 = performance.now();
  logs.push(
    `[BENCHMARK] INSERT loop: ${(tInsert1 - tInsert0).toFixed(0)} ms | batches: ${Math.ceil(occRows.length / INSERT_BATCH)}`,
  );

  const tReady = performance.now();
  logs.push(`[BENCHMARK] worker tablesReady: ${(tReady - t0).toFixed(0)} ms total`);

  self.onmessage = async (e: MessageEvent) => {
    const { kind, id, sql } = e.data as { kind: string; id: number; sql: string };
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
    } else if (kind === 'build-geojson') {
      const result = _geoJSON;
      _geoJSON = null; // free memory — main thread takes ownership
      self.postMessage({ kind: 'geojson-result', id, result });
    }
  };

  self.postMessage({ kind: 'tables-ready', logs });
})();
