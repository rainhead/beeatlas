/**
 * prime-orchestrator.ts — Page-side cache prime engine + ready probe + online re-prime
 *
 * Responsibilities (CONTEXT D-02 / D-03 / D-04 / D-06):
 *   D-02: Page-side orchestrator — iterates 4 known asset URLs, fetches each via
 *         Response.body.getReader(), emits byte-progress CustomEvents on window.
 *         SW's CacheFirst handler caches the clone in its own waitUntil(); page
 *         reads and discards the original stream (no cloning needed on this side).
 *   D-03: Prime denominator = occurrences_db + counties + ecoregions + places (4 assets).
 *   D-04: Total discovered from Content-Length; fallback to per-asset constants if absent.
 *         Reconciled total persisted to localStorage['beeatlas-prime-total-bytes'].
 *   D-06: Ready is computed by probing caches.match() — cache is the source of truth.
 *
 * Emits (RESEARCH Patterns 1 + 5, §Composite event payload):
 *   window 'cache-prime-progress' (CachePrimeProgressDetail) — during streaming
 *   window 'cache-state-changed'  (CacheStateChangedDetail)  — after loop completes
 *
 * Side effects registered at module load (PATTERNS.md S3):
 *   void primeAll()  — cold-start prime
 *   window.addEventListener('online', ...) — re-prime on reconnect
 */

import { resolveDataUrl } from './manifest.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_NAME = 'data-artifacts';
const STORAGE_KEY = 'beeatlas-prime-total-bytes';
const ASSET_KEYS = ['occurrences_db', 'counties', 'ecoregions', 'places'] as const;
type AssetKey = typeof ASSET_KEYS[number];

/** Per-asset fallback byte estimates when Content-Length header is absent (RESEARCH Pitfall 2). */
const FALLBACK_BYTES: Record<AssetKey, number> = {
  occurrences_db: 23_000_000,
  counties: 3_000_000,
  ecoregions: 2_000_000,
  places: 200_000,
};

/** Throttle progress events to ~every 100 KB (D-discretion). */
const REPORT_EVERY = 100_000;

// ---------------------------------------------------------------------------
// Exported interfaces
// ---------------------------------------------------------------------------

export interface CachePrimeProgressDetail {
  received: number;           // total bytes received across all assets so far
  total: number;              // sum of content-lengths (or fallbacks) across all assets
  assetInFlight: string | null; // URL currently being streamed; null when idle
  ready: boolean;             // computed by computeReadyState() after each asset completes
}

export interface CacheStateChangedDetail {
  ready: boolean;
  cached: string[];  // URLs that hit (serialized from Set for CustomEvent transport)
  missing: string[]; // asset keys that didn't resolve or didn't hit
}

// ---------------------------------------------------------------------------
// computeReadyState — cache-as-truth ready probe (RESEARCH Pattern 5)
// ---------------------------------------------------------------------------

export async function computeReadyState(): Promise<{
  ready: boolean;
  cached: Set<string>;
  missing: string[];
}> {
  const cached = new Set<string>();
  const missing: string[] = [];
  for (const key of ASSET_KEYS) {
    const url = await resolveDataUrl(key);
    if (!url) { missing.push(key); continue; }
    const hit = await caches.match(url, { cacheName: CACHE_NAME });
    if (hit) cached.add(url);
    else missing.push(key);
  }
  return { ready: missing.length === 0, cached, missing };
}

// ---------------------------------------------------------------------------
// primeAsset — fetch one asset, count bytes, report progress (RESEARCH Pattern 1)
// ---------------------------------------------------------------------------

interface RunState {
  received: number;
  total: number;
}

async function primeAsset(
  key: AssetKey,
  url: string,
  runState: RunState,
  onProgress: (assetUrl: string, received: number, total: number) => void,
): Promise<void> {
  // Cache-as-truth: skip if already cached (resumability — RESEARCH Pitfall 3)
  const cached = await caches.match(url, { cacheName: CACHE_NAME });
  if (cached) {
    const cachedLength = Number(cached.headers.get('content-length')) || FALLBACK_BYTES[key];
    runState.received += cachedLength;
    onProgress(url, runState.received, runState.total);
    return;
  }

  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`prime: ${url} → ${res.status}`);
  }

  // CRITICAL: Workbox's CacheFirst already cloned the response in the SW and is
  // draining the clone into Cache Storage via waitUntil(). We are free to read
  // and discard the original stream. The body must not be consumed again after
  // this reader loop — it will be fully drained.
  const assetFallback = FALLBACK_BYTES[key];
  const assetTotal = Number(res.headers.get('content-length')) || assetFallback;
  // Reconcile total: replace the fallback estimate with the discovered size
  runState.total = runState.total - FALLBACK_BYTES[key] + assetTotal;

  const reader = res.body.getReader();
  let lastReported = runState.received;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    runState.received += value.byteLength;
    if (runState.received - lastReported >= REPORT_EVERY) {
      onProgress(url, runState.received, runState.total);
      lastReported = runState.received;
    }
  }
  // Mandatory final tick at end-of-asset
  onProgress(url, runState.received, runState.total);
}

// ---------------------------------------------------------------------------
// primeAll — orchestrator loop (PATTERNS.md S3 + S4)
// ---------------------------------------------------------------------------

let _primePromise: Promise<void> | null = null;

async function primeAll(): Promise<void> {
  if (_primePromise) return _primePromise;

  _primePromise = (async () => {
    // Bail if Cache Storage is unavailable (non-SW browsers)
    if (!('caches' in window)) return;
    // Bail if offline — 'online' listener will re-trigger (D-07)
    if (!navigator.onLine) return;

    // Resolve all 4 asset URLs upfront
    const entries: Array<[AssetKey, string]> = [];
    for (const key of ASSET_KEYS) {
      const url = await resolveDataUrl(key);
      if (url) entries.push([key, url]);
    }

    // Seed total: recover persisted total from localStorage (D-04)
    const sumFallbacks = ASSET_KEYS.reduce((s, k) => s + FALLBACK_BYTES[k], 0);
    const stored = localStorage.getItem(STORAGE_KEY);
    const recoveredTotal = stored ? Number(stored) : NaN;
    const initialTotal = Number.isFinite(recoveredTotal) && recoveredTotal > 0
      ? recoveredTotal
      : sumFallbacks;

    const runState: RunState = { received: 0, total: initialTotal };

    // Track current asset in flight for the progress event detail
    let currentAssetUrl: string | null = null;

    const onProgress = (assetUrl: string, received: number, total: number) => {
      const detail: CachePrimeProgressDetail = {
        received,
        total,
        assetInFlight: currentAssetUrl,
        ready: false, // will be updated after loop; mid-stream we don't re-probe
      };
      window.dispatchEvent(new CustomEvent<CachePrimeProgressDetail>('cache-prime-progress', {
        detail,
        bubbles: true,
        composed: true,
      }));
    };

    for (const [key, url] of entries) {
      currentAssetUrl = url;
      try {
        await primeAsset(key, url, runState, onProgress);
      } catch (err) {
        console.warn('[prime-orchestrator] asset fetch failed:', url, err);
        // Continue — 'online' listener will retry; emit partial progress
      }
    }

    // After all assets: reconcile total to max(received, sumFallbacks)
    runState.total = Math.max(runState.received, sumFallbacks);

    // Persist the reconciled total (D-04)
    localStorage.setItem(STORAGE_KEY, String(runState.total));

    // Final progress event with assetInFlight: null (idle)
    const readyState = await computeReadyState();
    window.dispatchEvent(new CustomEvent<CachePrimeProgressDetail>('cache-prime-progress', {
      detail: {
        received: runState.received,
        total: runState.total,
        assetInFlight: null,
        ready: readyState.ready,
      },
      bubbles: true,
      composed: true,
    }));

    // Final cache-state-changed event (CONTEXT D-06; arrays for CustomEvent transport)
    const detail: CacheStateChangedDetail = {
      ready: readyState.ready,
      cached: [...readyState.cached],
      missing: readyState.missing,
    };
    window.dispatchEvent(new CustomEvent<CacheStateChangedDetail>('cache-state-changed', {
      detail,
      bubbles: true,
      composed: true,
    }));
  })().finally(() => {
    _primePromise = null;
  });

  return _primePromise;
}

// ---------------------------------------------------------------------------
// Module side-effects (PATTERNS.md S3)
// ---------------------------------------------------------------------------

// Cold-start prime
void primeAll();

// Re-prime on reconnect (handles field flow: opened offline, later gets WiFi)
window.addEventListener('online', () => { void primeAll(); });
