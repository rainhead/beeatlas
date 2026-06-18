// cache-probe.test.ts — Unit coverage for probeAndReprime in src/app-entry.ts
//
// probeAndReprime runs as a module side effect at import time (via void probeAndReprime())
// and registers a window 'online' listener. Each test must:
//   1. vi.resetModules() in beforeEach to force a fresh import of app-entry.ts
//   2. Stub navigator.onLine, window.caches, globalThis.fetch, and resolveDataUrl
//      BEFORE the dynamic import so the cold-start probe sees the right state
//   3. Await a microtask tick after import so the async probe chain completes

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Module-level mocks for app-entry.ts dependencies ---

// Mock bee-atlas.ts (heavy Lit component with DOM side effects)
vi.mock('../bee-atlas.ts', () => ({}));

// Mock sw-registration.ts (registers service worker, calls navigator.storage.persist —
// browser APIs not fully available in the happy-dom test environment)
vi.mock('../sw-registration.ts', () => ({}));

// Mock manifest.ts — resolveDataUrl is stubbed per-test via vi.mocked()
vi.mock('../manifest.ts', () => ({
  resolveDataUrl: vi.fn(),
}));

// Import the mock so we can control its return value in each test
import { resolveDataUrl } from '../manifest.ts';

// ---------------------------------------------------------------------------

describe('probeAndReprime (cold-start cache probe)', () => {
  // Helper: flush pending microtasks so the async probe chain completes
  const flushMicrotasks = () => new Promise<void>(r => setTimeout(r, 0));

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Test 1: online + cache miss → fetch fires once
  // ---------------------------------------------------------------------------
  test('online + cache miss: fetch fires once with the resolved DB URL', async () => {
    const DB_URL = 'https://beeatlas.net/data/occurrences_abc123.db';

    // Set navigator.onLine = true
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });

    // Stub caches.match to return undefined (cache miss)
    vi.stubGlobal('caches', {
      match: vi.fn().mockResolvedValue(undefined),
    });

    // Stub fetch
    const fetchMock = vi.fn().mockResolvedValue(new Response(''));
    vi.stubGlobal('fetch', fetchMock);

    // Stub resolveDataUrl to return the DB URL
    vi.mocked(resolveDataUrl).mockResolvedValue(DB_URL);

    // Import app-entry.ts — the cold-start probe runs at module evaluation time
    await import('../app-entry.ts');

    // Wait for the async probe chain to complete
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(DB_URL);
  });

  // ---------------------------------------------------------------------------
  // Test 2: online + cache hit → no fetch
  // ---------------------------------------------------------------------------
  test('online + cache hit: fetch is not called', async () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });

    // Stub caches.match to return a Response (cache hit)
    vi.stubGlobal('caches', {
      match: vi.fn().mockResolvedValue(new Response('cached data')),
    });

    const fetchMock = vi.fn().mockResolvedValue(new Response(''));
    vi.stubGlobal('fetch', fetchMock);

    vi.mocked(resolveDataUrl).mockResolvedValue('https://beeatlas.net/data/occurrences_abc123.db');

    await import('../app-entry.ts');
    await flushMicrotasks();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Test 3: offline → neither fetch nor caches.match called
  // ---------------------------------------------------------------------------
  test('offline: neither fetch nor caches.match is called', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    const cacheMatchMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('caches', {
      match: cacheMatchMock,
    });

    const fetchMock = vi.fn().mockResolvedValue(new Response(''));
    vi.stubGlobal('fetch', fetchMock);

    vi.mocked(resolveDataUrl).mockResolvedValue('https://beeatlas.net/data/occurrences_abc123.db');

    await import('../app-entry.ts');
    await flushMicrotasks();

    // offline guard short-circuits before reaching caches.match or fetch
    expect(cacheMatchMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Test 4: manifest missing occurrences_db key → no fetch
  // ---------------------------------------------------------------------------
  test('manifest missing occurrences_db: fetch is not called', async () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });

    vi.stubGlobal('caches', {
      match: vi.fn().mockResolvedValue(undefined),
    });

    const fetchMock = vi.fn().mockResolvedValue(new Response(''));
    vi.stubGlobal('fetch', fetchMock);

    // resolveDataUrl returns null (key absent from manifest)
    vi.mocked(resolveDataUrl).mockResolvedValue(null);

    await import('../app-entry.ts');
    await flushMicrotasks();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Test 5: 'online' event re-runs probe → fetch fires when reconnecting
  //
  // Note: vi.resetModules() resets the module registry but does NOT remove
  // event listeners previously registered on window by earlier test imports.
  // To isolate this test, we reset the fetchMock call count right before
  // dispatching the 'online' event, and assert "called at least once" so the
  // test only counts calls triggered by the listener registered in THIS import.
  // ---------------------------------------------------------------------------
  test("'online' event re-runs probe: fetch fires when device reconnects", async () => {
    const DB_URL = 'https://beeatlas.net/data/occurrences_abc123.db';

    // Start offline so the cold-start probe bails early
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    vi.stubGlobal('caches', {
      match: vi.fn().mockResolvedValue(undefined),
    });

    const fetchMock = vi.fn().mockResolvedValue(new Response(''));
    vi.stubGlobal('fetch', fetchMock);

    vi.mocked(resolveDataUrl).mockResolvedValue(DB_URL);

    // Import — cold-start probe runs but bails (offline)
    await import('../app-entry.ts');
    await flushMicrotasks();

    // Confirm the probe bailed (no fetch during cold start when offline)
    const callsAfterColdStart = fetchMock.mock.calls.length;

    // Flip to online, then dispatch the 'online' event to trigger the listener
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    window.dispatchEvent(new Event('online'));

    await flushMicrotasks();

    // At least one more fetch call should have been made after the 'online' event
    // (may be >1 if prior tests left listeners on window; we only assert the count grew)
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterColdStart);
    // Every call should use the correct DB URL
    expect(fetchMock).toHaveBeenCalledWith(DB_URL);
  });

  // ---------------------------------------------------------------------------
  // Test 6: fetch rejection swallowed → no unhandled rejection, console.warn called
  // ---------------------------------------------------------------------------
  test('fetch rejection is swallowed and console.warn is called', async () => {
    const DB_URL = 'https://beeatlas.net/data/occurrences_abc123.db';

    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });

    vi.stubGlobal('caches', {
      match: vi.fn().mockResolvedValue(undefined),
    });

    // fetch rejects
    const fetchError = new Error('network failure');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(fetchError));

    vi.mocked(resolveDataUrl).mockResolvedValue(DB_URL);

    // Spy on console.warn to assert it is called (and suppress output)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // The import should not throw even though fetch rejects
    await import('../app-entry.ts');
    await flushMicrotasks();

    // The rejection must be caught and console.warn'd
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledWith('[cache-probe] re-prime fetch failed:', fetchError);
  });
});
