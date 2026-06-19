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

    constructor(...args: unknown[]) {
      mocks.constructorCalls.push(args);
      this.register = mocks.instance.register;
      this.addEventListener = mocks.instance.addEventListener;
      this.messageSkipWaiting = mocks.instance.messageSkipWaiting;
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
    // Clear localStorage (persisted-storage gate)
    localStorage.clear();
    // Reset mock state
    mocks.constructorCalls.length = 0;
    mocks.instance.register.mockClear();
    mocks.instance.addEventListener.mockClear();
    mocks.instance.messageSkipWaiting.mockClear();
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
  });

  // ---------------------------------------------------------------------------
  // Test 1: Workbox constructor is called with the correct arguments
  // ---------------------------------------------------------------------------
  test('imports Workbox and instantiates it with /app/sw.js + scope /app/', async () => {
    await import('../sw-registration.ts');
    await flushMicrotasks();

    expect(mocks.constructorCalls).toHaveLength(1);
    expect(mocks.constructorCalls[0]).toEqual(['/app/sw.js', { scope: '/app/' }]);
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
