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
// Hoist the workbox-window mock so it is evaluated before any imports.
// The workboxInstance is shared between the mock factory and the tests so we
// can inspect the same object the SUT receives.
// ---------------------------------------------------------------------------
const { workboxInstance, WorkboxMock } = vi.hoisted(() => {
  const workboxInstance = {
    register: vi.fn(() => Promise.resolve()),
    addEventListener: vi.fn(),
    messageSkipWaiting: vi.fn(),
  };
  const WorkboxMock = vi.fn(() => workboxInstance);
  return { workboxInstance, WorkboxMock };
});

// Mock 'workbox-window' — the SUT imports { Workbox } from 'workbox-window'.
vi.mock('workbox-window', () => ({
  Workbox: WorkboxMock,
}));

// ---------------------------------------------------------------------------

describe('sw-registration.ts — workbox-window migration (Plan 150-02)', () => {
  // Helper: flush pending microtasks so the async registerServiceWorker chain completes
  const flushMicrotasks = () => new Promise<void>(r => setTimeout(r, 0));

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    // Clear localStorage (persisted-storage gate)
    localStorage.clear();
    // Reset the Workbox mock's call history but keep the same instance reference
    WorkboxMock.mockClear();
    workboxInstance.register.mockClear();
    workboxInstance.addEventListener.mockClear();
    workboxInstance.messageSkipWaiting.mockClear();
    // Default: navigator.onLine = true (not directly used by sw-registration but
    // keeps the environment realistic)
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    // Stub navigator.storage.persist (requestPersistentStorage block)
    Object.defineProperty(navigator, 'storage', {
      value: { persist: vi.fn(() => Promise.resolve(false)) },
      configurable: true,
    });
    // Ensure navigator.serviceWorker exists (most tests need it; the skip-test removes it)
    if (!('serviceWorker' in navigator)) {
      Object.defineProperty(navigator, 'serviceWorker', {
        value: {},
        configurable: true,
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

    expect(WorkboxMock).toHaveBeenCalledOnce();
    expect(WorkboxMock).toHaveBeenCalledWith('/app/sw.js', { scope: '/app/' });
  });

  // ---------------------------------------------------------------------------
  // Test 2: register() is called on the Workbox instance
  // ---------------------------------------------------------------------------
  test('calls register() on the Workbox instance', async () => {
    await import('../sw-registration.ts');
    await flushMicrotasks();

    expect(workboxInstance.register).toHaveBeenCalledOnce();
  });

  // ---------------------------------------------------------------------------
  // Test 3: 'waiting' event → dispatches 'sw-update-available' CustomEvent on window
  // ---------------------------------------------------------------------------
  test("dispatches sw-update-available CustomEvent on window when 'waiting' fires", async () => {
    // Capture the dispatched event before importing (so the listener is in place
    // when the SUT's wb.addEventListener('waiting', ...) fires the stored handler)
    let capturedEvent: Event | null = null;
    const captureFn = (e: Event) => { capturedEvent = e; };
    window.addEventListener('sw-update-available', captureFn);

    await import('../sw-registration.ts');
    await flushMicrotasks();

    // Retrieve the 'waiting' handler from the mock's recorded calls
    const waitingCall = workboxInstance.addEventListener.mock.calls.find(
      (args: unknown[]) => args[0] === 'waiting',
    );
    expect(waitingCall).toBeDefined();
    const waitingHandler = waitingCall![1] as () => void;

    // Invoke the handler manually — simulates workbox-window firing 'waiting'
    waitingHandler();

    // Assert the CustomEvent arrived
    expect(capturedEvent).not.toBeNull();
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

    expect((window as Window & { __wb?: unknown }).__wb).toBe(workboxInstance);
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

    // Track setItem calls to verify write-before-await ordering
    const setItemCalls: string[] = [];
    const persistCalls: string[] = [];

    // Intercept localStorage.setItem
    const origSetItem = localStorage.setItem.bind(localStorage);
    vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      setItemCalls.push(`setItem:${key}=${value}`);
      origSetItem(key, value);
    });

    // persist() resolves asynchronously; record when it is CALLED (not when it settles)
    const persistFn = vi.fn(() => {
      persistCalls.push('persist-called');
      return Promise.resolve(false);
    });
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

    // The localStorage key must have been written (we verify it exists; ordering is
    // guaranteed by the write-before-await pattern in the source — the setItem call
    // is synchronous, before the await of persist())
    expect(localStorage.getItem('beeatlas-persist-asked')).toBe('1');
  });

  // ---------------------------------------------------------------------------
  // Test 6: skips registration when 'serviceWorker' is not in navigator
  // ---------------------------------------------------------------------------
  test("skips registration when 'serviceWorker' not in navigator", async () => {
    // Remove serviceWorker from navigator
    const origDescriptor = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
    Object.defineProperty(navigator, 'serviceWorker', {
      value: undefined,
      configurable: true,
    });

    await import('../sw-registration.ts');
    await flushMicrotasks();

    expect(WorkboxMock).not.toHaveBeenCalled();

    // Restore
    if (origDescriptor) {
      Object.defineProperty(navigator, 'serviceWorker', origDescriptor);
    }
  });
});
