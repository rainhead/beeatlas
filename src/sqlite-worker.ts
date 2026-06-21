import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs';
import * as SQLite from 'wa-sqlite';
import { MemoryVFS } from 'wa-sqlite/src/examples/MemoryVFS.js';
import { resolveDataUrl } from './manifest.ts';

// The wasm engine URL is resolved on the MAIN thread and handed in via a one-time
// 'worker-init' message. This worker is bundled inline (a blob: origin), where the
// worker's own import.meta.url cannot resolve /assets/ URLs — so we must not derive
// the wasm URL here (Phase 151 iOS offline fix).
let _resolveWasmUrl: (url: string) => void;
const _wasmUrlReady: Promise<string> = new Promise((r) => { _resolveWasmUrl = r; });
self.addEventListener('message', function _initListener(e: MessageEvent) {
  const d = e.data as { kind?: string; wasmUrl?: string };
  if (d?.kind === 'worker-init' && d.wasmUrl) {
    self.removeEventListener('message', _initListener);
    _resolveWasmUrl(d.wasmUrl);
  }
});

const GEO_BLOB_SQL = 'SELECT data FROM geo_blob';

let _geoBuffer: ArrayBuffer | null = null;

(async () => {
  const t0 = performance.now();
  const wasmUrl = await _wasmUrlReady;
  // Provide the wasm bytes ourselves from Cache Storage instead of letting
  // Emscripten fetch the binary. iOS Safari does not serve a worker's subresource
  // fetches through the service worker offline, so Emscripten's default fetch of
  // the precached wasm fails on an offline cold-start. caches.match reads Cache
  // Storage directly in a worker (no SW interception needed); ignoreSearch matches
  // the precache key, which carries a ?__WB_REVISION__ query (Phase 151).
  const module = await SQLiteESMFactory({
    // Override Emscripten's default wasm-path resolution: in an inline (blob:)
    // worker its built-in resolver derives a broken blob: URL and throws
    // "Invalid URL" during factory init. Hand it the real asset URL instead.
    locateFile: () => wasmUrl,
    instantiateWasm: (
      imports: WebAssembly.Imports,
      receiveInstance: (instance: WebAssembly.Instance, module?: WebAssembly.Module) => void,
    ) => {
      void (async () => {
        let resp: Response | undefined;
        if (typeof caches !== 'undefined') resp = await caches.match(wasmUrl, { ignoreSearch: true });
        if (!resp) resp = await fetch(wasmUrl);
        const bytes = await resp.arrayBuffer();
        const { instance, module: mod } = await WebAssembly.instantiate(bytes, imports);
        receiveInstance(instance, mod);
      })();
      return {}; // async path: exports delivered via receiveInstance
    },
  });
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

  // Load the pre-built SQLite database. Read from Cache Storage FIRST (populated by
  // the page-side prime), falling back to the network. This worker runs at /assets/…,
  // outside the /app service-worker scope, so a bare fetch() bypasses the SW and would
  // fail offline; caches.match() works regardless of SW control (Phase 151 offline fix).
  const tFetch0 = performance.now();
  let resp: Response | undefined;
  if (typeof caches !== 'undefined') {
    resp = (await caches.match(occurrencesDbUrl, { cacheName: 'data-artifacts' }))
      ?? (await caches.match(occurrencesDbUrl));
  }
  if (!resp) resp = await fetch(occurrencesDbUrl);
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

  // Single-row query — exactly one WASM→JS callback. Data pre-serialized at build time.
  const tGeo0 = performance.now();
  let geoJsonStr = '[]';
  await sqlite3.exec(db, GEO_BLOB_SQL, (row: unknown[]) => {
    geoJsonStr = row[0] as string;
  });
  const tGeo1 = performance.now();
  logs.push(`[BENCHMARK] SQL geo agg query: ${(tGeo1 - tGeo0).toFixed(0)} ms`);

  const tEncode0 = performance.now();
  const encoded = new TextEncoder().encode(geoJsonStr);
  _geoBuffer = encoded.buffer;
  const tEncode1 = performance.now();
  logs.push(`[BENCHMARK] TextEncoder.encode: ${(tEncode1 - tEncode0).toFixed(0)} ms | ${(_geoBuffer.byteLength / 1024 / 1024).toFixed(1)} MB`);

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
      const buf = _geoBuffer;
      _geoBuffer = null; // transfer ownership — buf.byteLength will be 0 in worker after postMessage
      if (buf == null) {
        self.postMessage({ kind: 'exec-error', id, message: 'geo buffer already consumed or not yet ready' });
        return;
      }
      // Transfer zero-copy — include buf in the transfer list (second arg)
      // Cast to any to use the two-argument postMessage form (transfer list) supported by workers.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (self as any).postMessage({ kind: 'geojson-result', id, buffer: buf }, [buf]);
    }
  };

  self.postMessage({ kind: 'tables-ready', logs });
})().catch((err: unknown) => {
  // Without this, any failure in worker init (wasm, DB, or manifest fetch) is
  // swallowed: tablesReady never resolves and the page hangs on the "Loading…"
  // curtain with no clue why. Surface it so it's diagnosable (Phase 151).
  // Surface name + message explicitly — err.stack alone is minified frames (`d@blob:…`)
  // that say nothing. The message (e.g. a WebAssembly CompileError or a fetch 404 text)
  // is the diagnosable part.
  const name = err instanceof Error ? err.name : 'UnknownError';
  const detail = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  const message = `${name}: ${detail}`;
  console.error('[sqlite-worker] init failed:', message, '\nstack:', stack);
  self.postMessage({ kind: 'init-error', message });
});
