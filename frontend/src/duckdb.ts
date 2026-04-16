import type * as DuckDBTypes from '@duckdb/duckdb-wasm';
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

let _dbPromise: Promise<DuckDBTypes.AsyncDuckDB> | null = null;
let _benchmarkT0 = 0;

function _heapMB(): number {
  return ((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1_048_576;
}

let _tablesReadyResolve: (() => void) | null = null;
export const tablesReady: Promise<void> = new Promise(resolve => {
  _tablesReadyResolve = resolve;
});

async function _init(): Promise<DuckDBTypes.AsyncDuckDB> {
  const t0 = performance.now();
  const mem0 = _heapMB();
  const duckdb = await import('@duckdb/duckdb-wasm');
  const MANUAL_BUNDLES: DuckDBTypes.DuckDBBundles = {
    mvp: { mainModule: duckdb_wasm,    mainWorker: mvp_worker },
    eh:  { mainModule: duckdb_wasm_eh, mainWorker: eh_worker  },
  };
  const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
  const worker = new Worker(bundle.mainWorker!);
  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  const t1 = performance.now();
  const mem1 = _heapMB();
  console.log(`[BENCHMARK] WASM instantiate: ${(t1 - t0).toFixed(0)} ms | heap: ${mem0.toFixed(1)} -> ${mem1.toFixed(1)} MB`);
  _benchmarkT0 = t0;
  return db;
}

export function getDuckDB(): Promise<DuckDBTypes.AsyncDuckDB> {
  if (!_dbPromise) _dbPromise = _init();
  return _dbPromise;
}

export async function loadAllTables(db: DuckDBTypes.AsyncDuckDB, baseUrl: string): Promise<void> {
  const { DuckDBDataProtocol } = await import('@duckdb/duckdb-wasm');
  // Load parquet tables via HTTP URL registration
  for (const [tableName, file] of [['ecdysis', 'ecdysis.parquet'], ['samples', 'samples.parquet']] as const) {
    await db.registerFileURL(file, `${baseUrl}/${file}`, DuckDBDataProtocol.HTTP, false);
    const conn = await db.connect();
    await conn.query(`CREATE TABLE ${tableName} AS SELECT * FROM '${file}'`);
    await conn.close();
  }

  // Fetch GeoJSON via browser fetch and register as buffers — DuckDB WASM spatial extension
  // can't read registered URL files, and read_json_auto doesn't recognise .geojson extension
  const [countiesBytes, ecoregionsBytes] = await Promise.all([
    fetch(`${baseUrl}/counties.geojson`).then(r => r.arrayBuffer()).then(b => new Uint8Array(b)),
    fetch(`${baseUrl}/ecoregions.geojson`).then(r => r.arrayBuffer()).then(b => new Uint8Array(b)),
  ]);
  await db.registerFileBuffer('counties.geojson', countiesBytes);
  await db.registerFileBuffer('ecoregions.geojson', ecoregionsBytes);

  // Load GeoJSON as flat JSON — no spatial extension needed in Phase 30 (no geometry queries yet)
  const conn = await db.connect();
  try {
    await conn.query('LOAD json');
    await conn.query(`CREATE TABLE counties AS SELECT * FROM read_json('counties.geojson')`);
    await conn.query(`CREATE TABLE ecoregions AS SELECT * FROM read_json('ecoregions.geojson')`);
  } finally {
    await conn.close();
  }

  // Log table counts for debugging
  const countConn = await db.connect();
  const ecdysisCount = await countConn.query('SELECT COUNT(*) as n FROM ecdysis');
  const samplesCount = await countConn.query('SELECT COUNT(*) as n FROM samples');
  const countiesCount = await countConn.query('SELECT COUNT(*) as n FROM counties');
  const ecoregionsCount = await countConn.query('SELECT COUNT(*) as n FROM ecoregions');
  console.debug('DuckDB table counts:',
    'ecdysis:', ecdysisCount.toArray()[0]?.toJSON(),
    'samples:', samplesCount.toArray()[0]?.toJSON(),
    'counties:', countiesCount.toArray()[0]?.toJSON(),
    'ecoregions:', ecoregionsCount.toArray()[0]?.toJSON(),
  );
  await countConn.close();

  if (_tablesReadyResolve) _tablesReadyResolve();

  const tReady = performance.now();
  const mem2 = _heapMB();

  const tQueryStart = performance.now();
  const qConn = await db.connect();
  await qConn.query('SELECT COUNT(*) FROM ecdysis');
  await qConn.close();
  const tQueryEnd = performance.now();

  console.log(
    `[BENCHMARK] tablesReady: ${(tReady - _benchmarkT0).toFixed(0)} ms total from init start`,
    `| heap after tables: ${mem2.toFixed(1)} MB`,
    `| first-query latency: ${(tQueryEnd - tQueryStart).toFixed(0)} ms`,
  );
}
