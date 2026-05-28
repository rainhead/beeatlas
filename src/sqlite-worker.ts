import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs';
import * as SQLite from 'wa-sqlite';
import { MemoryVFS } from 'wa-sqlite/src/examples/MemoryVFS.js';
import { resolveDataUrl } from './manifest.ts';
import type { FeatureCollection, Point, Feature } from 'geojson';

function _recencyTier(year: number): 'thisYear' | 'lastYear' | 'earlier' {
  const y = new Date().getFullYear();
  if (year >= y) return 'thisYear';
  if (year >= y - 1) return 'lastYear';
  return 'earlier';
}

interface OccurrenceProperties { occId: string; recencyTier: string; source: string }
interface DataSummary { totalSpecimens: number; speciesCount: number; genusCount: number; familyCount: number; earliestYear: number; latestYear: number }
interface TaxonOption { label: string; name: string; rank: 'family' | 'genus' | 'species' }

// Build GeoJSON from SQL result rows. Column order must match GEO_SQL below:
// 0:lat, 1:lon, 2:ecdysis_id, 3:observation_id, 4:specimen_observation_id,
// 5:year, 6:scientificName, 7:genus, 8:family, 9:source
function _buildGeoJSONFromSQL(
  sqlRows: unknown[][],
): {
  geojson: FeatureCollection<Point, OccurrenceProperties>;
  summary: DataSummary;
  taxaOptions: TaxonOption[];
} {
  const features: Feature<Point, OccurrenceProperties>[] = [];
  const species = new Set<string>();
  const genera = new Set<string>();
  const families = new Set<string>();
  let minYear = Infinity, maxYear = -Infinity;

  for (const r of sqlRows) {
    const lat = r[0] as number | null;
    const lon = r[1] as number | null;
    if (lat == null || lon == null) continue;

    const ecdysis_id = r[2];
    const observation_id = r[3];
    const specimen_observation_id = r[4];
    const year = Number(r[5]);
    const scientificName = r[6] as string | null;
    const genus = r[7] as string | null;
    const family = r[8] as string | null;
    const source = r[9] as string | null;

    let occId: string | null = null;
    if (ecdysis_id != null) occId = `ecdysis:${ecdysis_id}`;
    else if (observation_id != null) occId = `inat:${observation_id}`;
    else if (specimen_observation_id != null) occId = `inat_obs:${specimen_observation_id}`;
    if (occId == null) continue;

    if (ecdysis_id != null) {
      if (scientificName) species.add(scientificName);
      if (genus) genera.add(genus);
      if (family) families.add(family);
      if (year < minYear) minYear = year;
      if (year > maxYear) maxYear = year;
    }

    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: { occId, recencyTier: _recencyTier(year), source: source ?? '' },
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

const GEO_SQL =
  'SELECT lat, lon, ecdysis_id, observation_id, specimen_observation_id, ' +
  'year, scientificName, genus, family, source ' +
  'FROM occurrences WHERE lat IS NOT NULL AND lon IS NOT NULL';

let _geoJSON: ReturnType<typeof _buildGeoJSONFromSQL> | null = null;

(async () => {
  const t0 = performance.now();
  const module = await SQLiteESMFactory();
  const sqlite3 = SQLite.Factory(module);
  const vfs = new MemoryVFS();
  sqlite3.vfs_register(vfs, true);
  const t1 = performance.now();
  const logs: string[] = [
    `[BENCHMARK] WASM instantiate: ${(t1 - t0).toFixed(0)} ms`,
  ];

  // Resolve manifest URL — hard fail if missing (pipeline guarantees it exists).
  const occurrencesDbUrl = await resolveDataUrl('occurrences_db');
  if (occurrencesDbUrl == null) throw new Error('manifest is missing occurrences_db key');

  // Fetch the pre-built SQLite database.
  const tFetch0 = performance.now();
  const resp = await fetch(occurrencesDbUrl);
  const buffer = await resp.arrayBuffer();
  const tFetch1 = performance.now();
  logs.push(
    `[BENCHMARK] fetch occurrences.db: ${(tFetch1 - tFetch0).toFixed(0)} ms | ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB raw`,
  );

  // Seed MemoryVFS: insert a file entry before open_v2 so it finds an existing DB.
  // MemoryVFS.xOpen looks up mapNameToFile; if found, it reuses the entry instead of creating a blank file.
  const DB_NAME = 'occurrences.db';
  (vfs as any).mapNameToFile.set(DB_NAME, {
    name: DB_NAME,
    flags: 0x2, // SQLITE_OPEN_READWRITE — avoids DELETEONCLOSE in xClose
    size: buffer.byteLength,
    data: buffer,
  });

  const tOpen0 = performance.now();
  const db = await sqlite3.open_v2(DB_NAME);
  const tOpen1 = performance.now();
  logs.push(`[BENCHMARK] open_v2 (preloaded VFS): ${(tOpen1 - tOpen0).toFixed(0)} ms`);

  // Build GeoJSON via SQL — no parquet fetch or hyparquet needed.
  // Column order: 0:lat, 1:lon, 2:ecdysis_id, 3:observation_id, 4:specimen_observation_id,
  // 5:year, 6:scientificName, 7:genus, 8:family, 9:source
  const tGeo0 = performance.now();
  const geoRows: unknown[][] = [];
  await sqlite3.exec(db, GEO_SQL, (rowValues: unknown[]) => {
    geoRows.push([...rowValues]);
  });
  const tGeo1 = performance.now();
  logs.push(`[BENCHMARK] SQL geo query: ${(tGeo1 - tGeo0).toFixed(0)} ms | ${geoRows.length} rows`);

  const tBuild0 = performance.now();
  _geoJSON = _buildGeoJSONFromSQL(geoRows);
  const tBuild1 = performance.now();
  logs.push(`[BENCHMARK] GeoJSON build: ${(tBuild1 - tBuild0).toFixed(0)} ms | features: ${_geoJSON.geojson.features.length}`);

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
