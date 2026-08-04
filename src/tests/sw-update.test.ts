// sw-update.test.ts — Wave 0 unit coverage for the workbox-window migration in
// src/sw-registration.ts (Plan 150-02, D-13).
//
// Pattern S5 (mocked-globals dynamic-import harness) — modelled on cache-probe.test.ts.
// Each test must:
//   1. vi.resetModules() in beforeEach to force a fresh import of sw-registration.ts
//   2. Stub the workbox-window module and globals (navigator.serviceWorker,
//      navigator.storage, localStorage) BEFORE the dynamic import so the SUT
//      sees the right state at module-evaluation time
//   3. Await a microtask tick after import so the async registerServiceWorker chain completes

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Hoist all mock state so it is accessible both inside the vi.mock() factory
// and in test bodies. vi.hoisted() runs before module evaluation; vi.mock()
// factories also run in the hoisted phase, so they can safely close over
// variables declared via vi.hoisted().
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => {
  const instance = {
    register: vi.fn(() => Promise.resolve()),
    addEventListener: vi.fn(),
    messageSkipWaiting: vi.fn(),
    update: vi.fn(() => Promise.resolve()),
  };
  // Track constructor calls: each element is the args array passed to `new Workbox()`
  const constructorCalls: unknown[][] = [];
  return { instance, constructorCalls };
});

// Mock 'workbox-window' — the SUT imports { Workbox } from 'workbox-window'.
// Using a real class so that `new Workbox(...)` works without TypeErrors.
vi.mock('workbox-window', () => {
  class Workbox {
    register: () => Promise<void>;
    addEventListener: (...args: unknown[]) => void;
    messageSkipWaiting: () => void;

    update: () => Promise<void>;

    constructor(...args: unknown[]) {
      mocks.constructorCalls.push(args);
      this.register = mocks.instance.register;
      this.addEventListener = mocks.instance.addEventListener;
      this.messageSkipWaiting = mocks.instance.messageSkipWaiting;
      this.update = mocks.instance.update;
    }
  }
  return { Workbox };
});

// ---------------------------------------------------------------------------

describe('sw-registration.ts — workbox-window migration (Plan 150-02)', () => {
  // Helper: flush pending microtasks so the async registerServiceWorker chain completes
  const flushMicrotasks = () => new Promise<void>(r => setTimeout(r, 0));

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    // The update-check cooldown is wall-clock, so time is driven by hand.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // Clear localStorage (persisted-storage gate)
    localStorage.clear();
    // Reset mock state
    mocks.constructorCalls.length = 0;
    mocks.instance.register.mockClear();
    mocks.instance.addEventListener.mockClear();
    mocks.instance.messageSkipWaiting.mockClear();
    mocks.instance.update.mockClear();
    // Clean up any window.__wb from previous test
    delete (window as Window & { __wb?: unknown }).__wb;
    // Default: navigator.onLine = true
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    // Stub navigator.storage.persist (requestPersistentStorage block)
    Object.defineProperty(navigator, 'storage', {
      value: { persist: vi.fn(() => Promise.resolve(false)) },
      configurable: true,
    });
    // Ensure navigator.serviceWorker exists (most tests need it; the skip-test removes it)
    if (!Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')) {
      Object.defineProperty(navigator, 'serviceWorker', {
        value: {},
        configurable: true,
        writable: true,
      });
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // Test 1: Workbox constructor is called with the correct arguments
  // ---------------------------------------------------------------------------
  test('imports Workbox and instantiates it with /sw.js + scope /', async () => {
    // ADR 0029: the app is at the root, so the worker is too. Scope `/` is not
    // incidental — a script at /app/sw.js cannot claim it, and an app at `/` cannot
    // be controlled without it.
    await import('../sw-registration.ts');
    await flushMicrotasks();

    expect(mocks.constructorCalls).toHaveLength(1);
    expect(mocks.constructorCalls[0]).toEqual(['/sw.js', { scope: '/' }]);
  });

  // -------------------------------------------------------------------------
  // The migration off /app/ (ADR 0029). Two registrations can coexist and the
  // narrower scope wins, so the old worker would keep answering /app/ from its own
  // precache — including the old shell and the old bundle — indefinitely.
  // -------------------------------------------------------------------------
  test('unregisters the legacy /app/ registration and leaves the root one alone', async () => {
    const legacy = { scope: 'https://beeatlas.net/app/', unregister: vi.fn(async () => true) };
    const current = { scope: 'https://beeatlas.net/', unregister: vi.fn(async () => true) };
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { getRegistrations: vi.fn(async () => [legacy, current]) },
      configurable: true,
      writable: true,
    });

    await import('../sw-registration.ts');
    await flushMicrotasks();

    expect(legacy.unregister).toHaveBeenCalledOnce();
    expect(current.unregister, 'the root registration is the one we just made').not.toHaveBeenCalled();
  });

  test('a browser that rejects getRegistrations still registers', async () => {
    // It rejects in some private-browsing modes. The cleanup is best-effort — the
    // 404 on the vanished /app/sw.js drops the old registration anyway — but a
    // throw here must not take the registration down with it.
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { getRegistrations: vi.fn(async () => { throw new Error('denied'); }) },
      configurable: true,
      writable: true,
    });

    await import('../sw-registration.ts');
    await flushMicrotasks();

    expect(mocks.instance.register).toHaveBeenCalledOnce();
  });

  // ---------------------------------------------------------------------------
  // Test 2: register() is called on the Workbox instance
  // ---------------------------------------------------------------------------
  test('calls register() on the Workbox instance', async () => {
    await import('../sw-registration.ts');
    await flushMicrotasks();

    expect(mocks.instance.register).toHaveBeenCalledOnce();
  });

  // ---------------------------------------------------------------------------
  // Test 3: 'waiting' event → dispatches 'sw-update-available' CustomEvent on window
  // ---------------------------------------------------------------------------
  test("dispatches sw-update-available CustomEvent on window when 'waiting' fires", async () => {
    // Capture the dispatched event before importing (so the listener is in place
    // when the SUT's wb.addEventListener('waiting', ...) fires the stored handler)
    let capturedEvent: Event | undefined;
    const captureFn = (e: Event) => { capturedEvent = e; };
    window.addEventListener('sw-update-available', captureFn);

    await import('../sw-registration.ts');
    await flushMicrotasks();

    // Retrieve the 'waiting' handler from the mock's recorded calls
    const waitingCall = mocks.instance.addEventListener.mock.calls.find(
      (args: unknown[]) => args[0] === 'waiting',
    );
    expect(waitingCall).toBeDefined();
    const waitingHandler = waitingCall![1] as () => void;

    // Invoke the handler manually — simulates workbox-window firing 'waiting'
    waitingHandler();

    // Assert the CustomEvent arrived
    expect(capturedEvent).toBeDefined();
    const ce = capturedEvent as CustomEvent;
    expect(ce.type).toBe('sw-update-available');
    expect(ce.bubbles).toBe(true);
    expect(ce.composed).toBe(true);

    window.removeEventListener('sw-update-available', captureFn);
  });

  // ---------------------------------------------------------------------------
  // Test 4: Workbox instance is stored on window.__wb
  // ---------------------------------------------------------------------------
  test('stores the Workbox instance on window.__wb', async () => {
    await import('../sw-registration.ts');
    await flushMicrotasks();

    const wb = (window as Window & { __wb?: unknown }).__wb;
    expect(wb).toBeDefined();
    // The wb instance should have the methods from our mock
    expect(typeof (wb as { register?: unknown }).register).toBe('function');
    expect(typeof (wb as { addEventListener?: unknown }).addEventListener).toBe('function');
    expect(typeof (wb as { messageSkipWaiting?: unknown }).messageSkipWaiting).toBe('function');
  });

  // ---------------------------------------------------------------------------
  // Noticing a new version without a force-quit.
  //
  // register() checks once per page load, and an installed PWA is not reloaded
  // the way a tab is — so without this the only reliable way to pick up a new
  // version is to force-quit and relaunch, which is not a thing to ask of someone
  // in a field.
  // ---------------------------------------------------------------------------
  const flushAll = async () => { await flushMicrotasks(); await flushMicrotasks(); };

  // Counts are RELATIVE, deliberately. `vi.resetModules()` gives each test a fresh
  // module, but the document/window listeners the previous ones attached are still
  // there and have no teardown hook — so one dispatch fires every accumulated
  // listener set. Asserting "went up" / "did not go up" across a single dispatch is
  // true regardless of how many are attached, and it is also the property that
  // actually matters.
  const bumped = async (fire: () => void): Promise<boolean> => {
    const before = mocks.instance.update.mock.calls.length;
    fire();
    await flushAll();
    return mocks.instance.update.mock.calls.length > before;
  };
  const visible = (state: 'visible' | 'hidden') =>
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  const past = () => vi.setSystemTime(Date.now() + 20 * 60 * 1000);

  test('returning to the foreground checks for an update', async () => {
    await import('../sw-registration.ts');
    await flushAll();
    visible('visible');
    past();

    expect(await bumped(() => document.dispatchEvent(new Event('visibilitychange')))).toBe(true);
  });

  test('going to the BACKGROUND checks nothing', async () => {
    await import('../sw-registration.ts');
    await flushAll();
    visible('hidden');
    past();

    expect(await bumped(() => document.dispatchEvent(new Event('visibilitychange')))).toBe(false);
  });

  test('app switching is throttled — visibilitychange fires constantly', async () => {
    await import('../sw-registration.ts');
    await flushAll();
    visible('visible');

    past();
    expect(await bumped(() => document.dispatchEvent(new Event('visibilitychange')))).toBe(true);
    // Immediately again: every listener is now inside its cooldown.
    expect(await bumped(() => document.dispatchEvent(new Event('visibilitychange')))).toBe(false);
    // …and again once the cooldown has passed.
    past();
    expect(await bumped(() => document.dispatchEvent(new Event('visibilitychange')))).toBe(true);
  });

  test('OFFLINE, the foreground check is not made at all', async () => {
    // The whole reason registration itself defers: /sw.js is deliberately never
    // precached, so offline this request cannot be served — and on iOS a failed
    // request inside an installed app raises the system "Turn On Wi-Fi" modal over
    // a map that is working perfectly. This app is used where there is no signal; a
    // poll that raises a modal there is worse than never updating.
    await import('../sw-registration.ts');
    await flushAll();
    visible('visible');
    past();
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    expect(await bumped(() => document.dispatchEvent(new Event('visibilitychange')))).toBe(false);
  });

  test('reconnecting checks for an update — it is the moment one can be fetched', async () => {
    await import('../sw-registration.ts');
    await flushAll();
    past();

    expect(await bumped(() => window.dispatchEvent(new Event('online')))).toBe(true);
  });

  test('a rejected update check is swallowed — onLine is a hint, not a guarantee', async () => {
    mocks.instance.update.mockRejectedValue(new Error('captive portal'));
    await import('../sw-registration.ts');
    await flushAll();
    visible('visible');
    past();

    expect(() => document.dispatchEvent(new Event('visibilitychange'))).not.toThrow();
    await flushAll();
    mocks.instance.update.mockResolvedValue(undefined);
  });

  // ---------------------------------------------------------------------------
  // Test 5: requestPersistentStorage() side-effect (149 D-12) is preserved
  //
  // Asserts:
  //   - navigator.storage.persist is called once when the key is unset
  //   - localStorage.setItem('beeatlas-persist-asked', '1') happens BEFORE
  //     the persist() await returns (write-before-await semantics)
  // ---------------------------------------------------------------------------
  test('preserves requestPersistentStorage() side-effect (149 D-12)', async () => {
    // Ensure the key is NOT set so requestPersistentStorage proceeds
    localStorage.removeItem('beeatlas-persist-asked');

    // persist() resolves asynchronously; record when it is CALLED (not when it settles)
    const persistFn = vi.fn(() => Promise.resolve(false));
    Object.defineProperty(navigator, 'storage', {
      value: { persist: persistFn },
      configurable: true,
    });

    await import('../sw-registration.ts');
    await flushMicrotasks();
    // Give the async requestPersistentStorage a tick to complete
    await flushMicrotasks();

    // persist must have been called once
    expect(persistFn).toHaveBeenCalledOnce();

    // The localStorage key must have been written (ordering is guaranteed by
    // write-before-await pattern in the source — setItem is synchronous, before await)
    expect(localStorage.getItem('beeatlas-persist-asked')).toBe('1');
  });

  // ---------------------------------------------------------------------------
  // Test 6: skips registration when 'serviceWorker' is not in navigator
  // ---------------------------------------------------------------------------
  test("skips registration when 'serviceWorker' not in navigator", async () => {
    // The `'serviceWorker' in navigator` check requires the property to be
    // completely absent. We achieve this by stubbing the global `navigator`
    // with an object that omits the serviceWorker key entirely.
    const fakeNavigator = Object.create(
      Object.getPrototypeOf(navigator),
      // Copy all own enumerable properties except serviceWorker
      Object.fromEntries(
        Object.getOwnPropertyNames(navigator)
          .filter(k => k !== 'serviceWorker')
          .map(k => [k, Object.getOwnPropertyDescriptor(navigator, k)!]),
      ),
    );
    vi.stubGlobal('navigator', fakeNavigator);

    await import('../sw-registration.ts');
    await flushMicrotasks();

    // The Workbox constructor must NOT have been called
    expect(mocks.constructorCalls).toHaveLength(0);
  });
});

// beeatlas-mas: the api.mapbox.com route outlived the thing it cached by two
// days and the cache it filled outlived it on real devices. ADR 0001 superseded
// by ADR 0026.
describe('no Mapbox surface remains in the service worker', () => {
  const swSrc = readFileSync(resolve(__dirname, '../sw.ts'), 'utf-8');

  test('sw.ts has no executable reference to api.mapbox.com', () => {
    // The hostname is still NAMED in the comment explaining the removal — that
    // comment is the point — so strip comments before asserting.
    const code = swSrc.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(code).not.toContain('api.mapbox.com');
    expect(code).not.toContain('StaleWhileRevalidate');
  });

  test('sw.ts deletes the orphaned mapbox-basemap cache on activate', () => {
    expect(swSrc).toMatch(/addEventListener\(\s*'activate'/);
    expect(swSrc).toMatch(/caches\.delete\(\s*'mapbox-basemap'\s*\)/);
  });

  test('the delete is inside waitUntil, so activation cannot finish before it', () => {
    const activate = swSrc.slice(swSrc.indexOf("addEventListener('activate'"));
    expect(activate.slice(0, 300)).toMatch(/waitUntil\(/);
  });
});
