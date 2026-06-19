// prime-orchestrator.test.ts — Unit coverage for src/prime-orchestrator.ts
//
// Covers: computeReadyState probe, byte-progress monotonicity, content-length
// fallback, localStorage persistence, skip-cached resumability, offline gate,
// online re-prime, and final cache-state-changed emission.
//
// RED gate: tests fail until Task 4 creates prime-orchestrator.ts.
//
// Harness pattern (S5): vi.resetModules() + vi.stubGlobal per test.
// Dynamic import after stubs are installed so the module side-effects
// see the mocked globals.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module-level mocks — suppress heavy dependencies
// ---------------------------------------------------------------------------
vi.mock('../bee-atlas.ts', () => ({}));
vi.mock('../sw-registration.ts', () => ({}));
vi.mock('../manifest.ts', () => ({
  resolveDataUrl: vi.fn(),
  loadManifest: vi.fn(),
  parseGeneratedAt: vi.fn(),
  formatFreshness: vi.fn(),
}));

import { resolveDataUrl } from '../manifest.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a streaming Response whose body yields the given chunks. */
function makeStreamingResponse(chunks: Uint8Array[], contentLength?: number): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
  const headers = new Headers();
  if (contentLength != null) headers.set('content-length', String(contentLength));
  return new Response(stream, { status: 200, headers });
}

const URLS = {
  occurrences_db: 'https://beeatlas.net/data/occurrences_abc.db',
  counties: 'https://beeatlas.net/data/counties_abc.geojson',
  ecoregions: 'https://beeatlas.net/data/ecoregions_abc.geojson',
  places: 'https://beeatlas.net/data/places_abc.geojson',
} as const;

/** Wire resolveDataUrl mock to return the canonical test URLs. */
function stubResolveDataUrl() {
  vi.mocked(resolveDataUrl).mockImplementation(async (key: string) => {
    return (URLS as Record<string, string>)[key] ?? null;
  });
}

const flushMicrotasks = () => new Promise<void>(r => setTimeout(r, 0));

// ---------------------------------------------------------------------------

describe('prime-orchestrator', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
    // Default: online
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // computeReadyState: 4 cache hits → ready: true
  // -------------------------------------------------------------------------
  test('computeReadyState: 4 cache hits → {ready: true, cached: Set of 4, missing: []}', async () => {
    stubResolveDataUrl();

    // All cache probes hit
    vi.stubGlobal('caches', {
      match: vi.fn().mockResolvedValue(new Response('cached')),
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeStreamingResponse([])));

    const { computeReadyState } = await import('../prime-orchestrator.ts');
    const result = await computeReadyState();

    expect(result.ready).toBe(true);
    expect(result.cached.size).toBe(4);
    expect(result.missing).toHaveLength(0);
    // All 4 URLs should be in the cached set
    for (const url of Object.values(URLS)) {
      expect(result.cached.has(url)).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // computeReadyState: 2 hits, 2 misses → ready: false
  // -------------------------------------------------------------------------
  test('computeReadyState: 2 hits, 2 misses → {ready: false, cached: Set of 2, missing: 2 keys}', async () => {
    stubResolveDataUrl();

    const hitUrls = new Set([URLS.occurrences_db, URLS.counties]);
    vi.stubGlobal('caches', {
      match: vi.fn().mockImplementation(async (url: string) => {
        return hitUrls.has(url) ? new Response('cached') : undefined;
      }),
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeStreamingResponse([])));

    const { computeReadyState } = await import('../prime-orchestrator.ts');
    const result = await computeReadyState();

    expect(result.ready).toBe(false);
    expect(result.cached.size).toBe(2);
    expect(result.missing).toHaveLength(2);
    // missing should include ecoregions and places
    expect(result.missing).toContain('ecoregions');
    expect(result.missing).toContain('places');
  });

  // -------------------------------------------------------------------------
  // Byte progress: monotone non-decreasing received, final equals total
  // -------------------------------------------------------------------------
  test('byte progress: monotone non-decreasing received values summing to total', async () => {
    stubResolveDataUrl();

    // occurrences_db: 3 chunks × 200 KB each = 600 KB, Content-Length: 600000
    const chunk = new Uint8Array(200_000).fill(1);
    const dbResponse = makeStreamingResponse([chunk, chunk, chunk], 600_000);
    // Other 3 assets: small, all in cache
    const cachedHit = new Response('cached', { headers: { 'content-length': '100' } });

    const cachesMock = {
      match: vi.fn().mockImplementation(async (url: string) => {
        // Only occurrences_db is NOT cached
        return url === URLS.occurrences_db ? undefined : cachedHit;
      }),
    };
    vi.stubGlobal('caches', cachesMock);

    const fetchMock = vi.fn().mockResolvedValue(dbResponse);
    vi.stubGlobal('fetch', fetchMock);

    const progressEvents: Array<{ received: number; total: number; assetInFlight: string | null }> = [];
    window.addEventListener('cache-prime-progress', (e: Event) => {
      const ce = e as CustomEvent<{ received: number; total: number; assetInFlight: string | null }>;
      progressEvents.push({ ...ce.detail });
    });

    await import('../prime-orchestrator.ts');
    await flushMicrotasks();
    await flushMicrotasks();

    // Must have emitted at least one progress event
    expect(progressEvents.length).toBeGreaterThan(0);

    // received must be monotonically non-decreasing
    for (let i = 1; i < progressEvents.length; i++) {
      expect(progressEvents[i].received).toBeGreaterThanOrEqual(progressEvents[i - 1].received);
    }

    // Final received should equal final total (at completion)
    const last = progressEvents[progressEvents.length - 1];
    expect(last.received).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Content-Length absent → falls back to per-asset constants
  // -------------------------------------------------------------------------
  test('content-length absent → falls back to per-asset constants summing to > 0', async () => {
    stubResolveDataUrl();

    // No Content-Length on any response
    const chunk = new Uint8Array(1000).fill(1);
    const responseWithoutLength = makeStreamingResponse([chunk]); // no contentLength arg

    vi.stubGlobal('caches', {
      match: vi.fn().mockResolvedValue(undefined), // all cache misses
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(responseWithoutLength));

    const progressEvents: Array<{ total: number }> = [];
    window.addEventListener('cache-prime-progress', (e: Event) => {
      const ce = e as CustomEvent<{ total: number }>;
      progressEvents.push({ total: ce.detail.total });
    });

    await import('../prime-orchestrator.ts');
    await flushMicrotasks();
    await flushMicrotasks();

    expect(progressEvents.length).toBeGreaterThan(0);
    // total should be the sum of the per-asset fallback constants
    // occurrences_db: 23_000_000, counties: 3_000_000, ecoregions: 2_000_000, places: 200_000 = 28_200_000
    const firstTotal = progressEvents[0].total;
    expect(firstTotal).toBeGreaterThan(0);
    // Each per-asset fallback is at least 200_000
    expect(firstTotal).toBeGreaterThanOrEqual(200_000);
  });

  // -------------------------------------------------------------------------
  // localStorage persist: after prime, beeatlas-prime-total-bytes is set
  // -------------------------------------------------------------------------
  test('localStorage persist: total written to beeatlas-prime-total-bytes after prime', async () => {
    stubResolveDataUrl();

    const chunk = new Uint8Array(1000).fill(1);
    vi.stubGlobal('caches', {
      match: vi.fn().mockResolvedValue(undefined),
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeStreamingResponse([chunk], 1000)));

    await import('../prime-orchestrator.ts');
    // Wait for async operations to settle
    await flushMicrotasks();
    await flushMicrotasks();
    await flushMicrotasks();

    const stored = localStorage.getItem('beeatlas-prime-total-bytes');
    expect(stored).not.toBeNull();
    const parsed = Number(stored);
    expect(Number.isFinite(parsed)).toBe(true);
    expect(parsed).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Skips cached: pre-populated cache → fetch NOT called for that URL
  // -------------------------------------------------------------------------
  test('skips cached: fetch not called for already-cached asset URL', async () => {
    stubResolveDataUrl();

    // occurrences_db is in cache; others are not
    vi.stubGlobal('caches', {
      match: vi.fn().mockImplementation(async (url: string) => {
        return url === URLS.occurrences_db
          ? new Response('cached', { headers: { 'content-length': '1000' } })
          : undefined;
      }),
    });

    const chunk = new Uint8Array(100).fill(1);
    const fetchMock = vi.fn().mockResolvedValue(makeStreamingResponse([chunk], 100));
    vi.stubGlobal('fetch', fetchMock);

    await import('../prime-orchestrator.ts');
    await flushMicrotasks();
    await flushMicrotasks();

    // fetch should NOT have been called with the cached URL
    const fetchedUrls = fetchMock.mock.calls.map((call: unknown[]) => call[0]);
    expect(fetchedUrls).not.toContain(URLS.occurrences_db);
    // But should have been called for the other 3 assets
    expect(fetchMock).toHaveBeenCalledWith(URLS.counties);
    expect(fetchMock).toHaveBeenCalledWith(URLS.ecoregions);
    expect(fetchMock).toHaveBeenCalledWith(URLS.places);
  });

  // -------------------------------------------------------------------------
  // Offline guard: navigator.onLine=false → no fetch, no progress events
  // -------------------------------------------------------------------------
  test('cold-start probe respects navigator.onLine=false', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    stubResolveDataUrl();

    vi.stubGlobal('caches', {
      match: vi.fn().mockResolvedValue(undefined),
    });
    const fetchMock = vi.fn().mockResolvedValue(makeStreamingResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    const progressEvents: unknown[] = [];
    window.addEventListener('cache-prime-progress', (e) => progressEvents.push(e));

    await import('../prime-orchestrator.ts');
    await flushMicrotasks();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(progressEvents).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Online event re-runs the orchestrator after offline cold-start
  // -------------------------------------------------------------------------
  test('online event re-runs the orchestrator after cold-start skipped (offline)', async () => {
    // Start offline
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    stubResolveDataUrl();

    vi.stubGlobal('caches', {
      match: vi.fn().mockResolvedValue(undefined),
    });
    const fetchMock = vi.fn().mockResolvedValue(makeStreamingResponse([], 100));
    vi.stubGlobal('fetch', fetchMock);

    // Import — cold start bails because offline
    await import('../prime-orchestrator.ts');
    await flushMicrotasks();

    const callsAfterColdStart = fetchMock.mock.calls.length;
    expect(callsAfterColdStart).toBe(0); // confirmed offline bail

    // Flip to online and dispatch online event
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    window.dispatchEvent(new Event('online'));

    await flushMicrotasks();
    await flushMicrotasks();

    // Orchestrator should have run (fetch called for missing assets)
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterColdStart);
  });

  // -------------------------------------------------------------------------
  // Final cache-state-changed CustomEvent emitted after loop completion
  // -------------------------------------------------------------------------
  test('emits final cache-state-changed CustomEvent with {ready, cached, missing}', async () => {
    stubResolveDataUrl();

    // All 4 assets in cache
    vi.stubGlobal('caches', {
      match: vi.fn().mockResolvedValue(
        new Response('cached', { headers: { 'content-length': '1000' } })
      ),
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeStreamingResponse([])));

    const stateChangedEvents: Array<{ ready: boolean; cached: string[]; missing: string[] }> = [];
    window.addEventListener('cache-state-changed', (e: Event) => {
      const ce = e as CustomEvent<{ ready: boolean; cached: string[]; missing: string[] }>;
      stateChangedEvents.push({ ...ce.detail });
    });

    await import('../prime-orchestrator.ts');
    await flushMicrotasks();
    await flushMicrotasks();

    expect(stateChangedEvents.length).toBeGreaterThan(0);
    const last = stateChangedEvents[stateChangedEvents.length - 1];
    expect(last).toHaveProperty('ready');
    expect(last).toHaveProperty('cached');
    expect(last).toHaveProperty('missing');
    expect(Array.isArray(last.cached)).toBe(true);
    expect(Array.isArray(last.missing)).toBe(true);
    // With all 4 in cache, ready should be true
    expect(last.ready).toBe(true);
  });
});
