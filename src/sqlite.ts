// Inline the worker into the main bundle (base64) so its script needs NO network
// fetch to start. iOS Safari does not reliably serve a dedicated/module worker's
// script through the service worker offline (the worker lives at /assets/, outside
// the /app SW scope), so a separate worker-script request fails on an offline
// cold-start and tablesReady hangs forever. Inlining removes that fetch entirely
// (Phase 151 iOS offline fix).
import SqliteWorker from './sqlite-worker.ts?worker&inline';
// Resolve the engine binary's hashed asset URL on the MAIN thread (where
// import.meta.url is a real http(s) URL) and hand it to the inline worker, whose
// own blob: origin can't resolve /assets/ URLs (Phase 151 iOS offline fix).
import wasmUrl from 'wa-sqlite/dist/wa-sqlite.wasm?url';

type ExecCallback = (rowValues: unknown[], columnNames: string[]) => void;
type SQLiteAPI = { exec: (db: number, sql: string, cb?: ExecCallback) => Promise<void> };
type WorkerMsg = { kind: string; id?: number; rows?: unknown[][]; columns?: string[]; message?: string; logs?: string[]; result?: unknown; buffer?: ArrayBuffer };

let _worker: Worker | null = null;
let _workerT0 = 0;
let _nextId = 1;
const _pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; cb?: ExecCallback }>();

function _heapMB(): number {
  return ((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1_048_576;
}

let _tablesReadyResolve: (() => void) | null = null;
export const tablesReady: Promise<void> = new Promise(resolve => {
  _tablesReadyResolve = resolve;
});

function _ensureWorker(): Worker {
  if (_worker) return _worker;
  _workerT0 = performance.now();
  _worker = new SqliteWorker();
  // Hand the worker its wasm URL (absolute) before it instantiates the engine.
  // The message is queued until the worker's top-level listener is attached.
  _worker.postMessage({ kind: 'worker-init', wasmUrl: new URL(wasmUrl, location.href).href });
  _worker.onmessage = (e: MessageEvent) => {
    const msg = e.data as WorkerMsg;
    if (msg.kind === 'tables-ready') {
      for (const line of (msg.logs ?? [])) console.log(line);
      const elapsed = (performance.now() - _workerT0).toFixed(0);
      const heap = _heapMB().toFixed(1);
      console.log(`[BENCHMARK] worker boot (main-thread wall time): ${elapsed} ms | main-thread heap: ${heap} MB`);
      _tablesReadyResolve?.();
    } else if (msg.kind === 'exec-result') {
      const p = _pending.get(msg.id!);
      if (!p) return;
      _pending.delete(msg.id!);
      if (p.cb) {
        for (const row of (msg.rows ?? [])) p.cb(row as unknown[], msg.columns ?? []);
      }
      p.resolve(undefined);
    } else if (msg.kind === 'exec-error') {
      const p = _pending.get(msg.id!);
      if (!p) return;
      _pending.delete(msg.id!);
      p.reject(new Error(msg.message));
    } else if (msg.kind === 'init-error') {
      // Worker init failed (wasm/DB/manifest). tablesReady stays unresolved by design
      // (callers await it), but surface the cause so it isn't a silent hang (Phase 151).
      console.error('[sqlite] worker init-error:', msg.message);
    } else if (msg.kind === 'geojson-result') {
      const p = _pending.get(msg.id!);
      if (!p) return;
      _pending.delete(msg.id!);
      p.resolve(msg.buffer as ArrayBuffer);
    }
  };
  _worker.onerror = (e) => console.error('[sqlite-worker] error', e);
  return _worker;
}

export function getDB(): Promise<{ sqlite3: SQLiteAPI; db: number }> {
  const worker = _ensureWorker();
  const sqlite3: SQLiteAPI = {
    exec(_db: number, sql: string, cb?: ExecCallback): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        const id = _nextId++;
        _pending.set(id, { resolve: () => resolve(), reject, cb });
        worker.postMessage({ kind: 'exec', id, sql });
      });
    },
  };
  return Promise.resolve({ sqlite3, db: 0 });
}

export async function loadOccurrencesTable(): Promise<void> {
  _ensureWorker();
  await tablesReady;
}

export function loadOccurrenceGeoJSON(): Promise<ArrayBuffer> {
  const worker = _ensureWorker();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const id = _nextId++;
    _pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    worker.postMessage({ kind: 'build-geojson', id });
  });
}
