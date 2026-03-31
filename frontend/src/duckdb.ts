import * as duckdb from '@duckdb/duckdb-wasm';
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import { DuckDBDataProtocol } from '@duckdb/duckdb-wasm';

const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
  mvp: { mainModule: duckdb_wasm,    mainWorker: mvp_worker },
  eh:  { mainModule: duckdb_wasm_eh, mainWorker: eh_worker  },
};

let _dbPromise: Promise<duckdb.AsyncDuckDB> | null = null;

async function _init(): Promise<duckdb.AsyncDuckDB> {
  const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
  const worker = new Worker(bundle.mainWorker!);
  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  return db;
}

export function getDuckDB(): Promise<duckdb.AsyncDuckDB> {
  if (!_dbPromise) _dbPromise = _init();
  return _dbPromise;
}

export async function loadAllTables(db: duckdb.AsyncDuckDB, baseUrl: string): Promise<void> {
  // Load parquet tables via HTTP URL registration
  for (const [tableName, file] of [['ecdysis', 'ecdysis.parquet'], ['samples', 'samples.parquet']] as const) {
    await db.registerFileURL(file, `${baseUrl}/${file}`, DuckDBDataProtocol.HTTP, false);
    const conn = await db.connect();
    await conn.query(`CREATE TABLE ${tableName} AS SELECT * FROM '${file}'`);
    await conn.close();
  }

  // Load GeoJSON tables via spatial extension
  const conn = await db.connect();
  try {
    await conn.query('INSTALL spatial');
    await conn.query('LOAD spatial');
    await conn.query(`CREATE TABLE counties AS SELECT * FROM '${baseUrl}/counties.geojson'`);
    await conn.query(`CREATE TABLE ecoregions AS SELECT * FROM '${baseUrl}/ecoregions.geojson'`);
  } catch (error) {
    console.warn('Spatial extension failed, falling back to read_json_auto:', error);
    await conn.query(`CREATE TABLE counties AS SELECT * FROM read_json_auto('${baseUrl}/counties.geojson')`);
    await conn.query(`CREATE TABLE ecoregions AS SELECT * FROM read_json_auto('${baseUrl}/ecoregions.geojson')`);
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
}
