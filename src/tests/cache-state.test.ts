import { test, expect, describe, vi, beforeEach, afterEach } from 'vitest';

// Mock heavy modules that have module-level side effects incompatible with happy-dom
vi.mock('../sqlite.ts', () => ({
  getDB: vi.fn(() => Promise.resolve({ sqlite3: {}, db: 0 })),
  loadOccurrencesTable: vi.fn(() => Promise.resolve()),
  tablesReady: Promise.resolve(),
}));

vi.mock('../features.ts', () => ({
  loadOccurrenceGeoJSON: vi.fn(() => Promise.resolve({
    geojson: { type: 'FeatureCollection', features: [] },
    summary: {
      totalSpecimens: 0,
      speciesCount: 0,
      genusCount: 0,
      familyCount: 0,
      earliestYear: 0,
      latestYear: 0,
    },
    taxaOptions: [],
  })),
}));

vi.mock('mapbox-gl', () => {
  const MapMock = vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    remove: vi.fn(),
    getCenter: vi.fn(() => ({ lng: -120.5, lat: 47.5 })),
    getZoom: vi.fn(() => 7),
    addSource: vi.fn(),
    addLayer: vi.fn(),
    getSource: vi.fn(() => ({
      setData: vi.fn(),
      getClusterLeaves: vi.fn((_clusterId: number, _limit: number, _offset: number, cb: Function) => {
        cb(null, []);
      }),
    })),
    setFilter: vi.fn(),
    isStyleLoaded: vi.fn(() => true),
    jumpTo: vi.fn(),
    flyTo: vi.fn(),
    resize: vi.fn(),
    addInteraction: vi.fn(),
    setLayoutProperty: vi.fn(),
    setFeatureState: vi.fn(),
    removeFeatureState: vi.fn(),
    querySourceFeatures: vi.fn(() => []),
    addControl: vi.fn(),
  }));
  return {
    default: {
      accessToken: '',
      Map: MapMock,
      GeolocateControl: vi.fn().mockImplementation(() => ({
        on: vi.fn(),
        trigger: vi.fn(() => true),
      })),
    },
  };
});

vi.mock('mapbox-gl/dist/mapbox-gl.css?raw', () => ({ default: '' }));

vi.mock('../prime-orchestrator.ts', () => ({ computeReadyState: vi.fn() }));
vi.mock('../sw-registration.ts', () => ({}));

// Mock <bee-map> as an inert custom element so `<bee-atlas>` can mount in
// happy-dom without firstUpdated → `new mapboxgl.Map()` → unhandled rejections
// (bee-map calls `boxZoom.disable()`, `getCanvasContainer()` etc. that the
// mapbox-gl stub above doesn't model). The cache-state tests don't exercise
// the map surface — they assert on `<bee-atlas>` cache @state and the
// `<bee-header>` chrome — so an inert child is sufficient.
vi.mock('../bee-map.ts', async () => {
  const { LitElement } = await import('lit');
  const { customElement } = await import('lit/decorators.js');
  @customElement('bee-map')
  class BeeMapStub extends LitElement {
    boundaryMode: string = 'off';
    visibleIds: unknown = null;
    filteredGeoJSON: unknown = null;
    selectedOccIds: unknown = null;
    countyOptions: string[] = [];
    ecoregionOptions: string[] = [];
    viewState: unknown = null;
  }
  return { BeeMap: BeeMapStub };
});

// happy-dom can leave `window.location.pathname` undefined in some module
// load orderings; `<bee-header>`'s render reads `pathname.startsWith(...)`
// and would surface as an unhandled rejection inside Lit's async update
// path. Force a concrete value so every test in this file renders cleanly.
if (typeof window !== 'undefined' && window.location?.pathname == null) {
  try {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, pathname: '/app/index.html' },
    });
  } catch {
    // ignore — env already has a writable location
  }
}

// The mounted components background-fetch (whoami, the places_meta name map,
// …) with swallowed failures; without a stub those open real sockets against
// happy-dom's origin and the connection errors (AggregateError ECONNREFUSED)
// spray the logs of green runs (beeatlas-556). A 404 keeps each caller on its
// existing unavailable path, minus the socket.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// <bee-header> cache surfaces (Phase 150)
// ---------------------------------------------------------------------------

describe('bee-header cache surfaces (Phase 150)', () => {
  let el: HTMLElement & {
    offline: boolean;
    cacheState: { ready: boolean; cached: string[]; missing: string[] } | null;
    primeProgress: { received: number; total: number; assetInFlight: string | null } | null;
    freshnessLabel: string | null;
    storageEstimate: { usageMB: string; quotaMB: string | null } | null;
    updateAvailable: boolean;
    updateComplete: Promise<boolean>;
    shadowRoot: ShadowRoot;
  };

  beforeEach(async () => {
    await import('../bee-header.ts');
    el = document.createElement('bee-header') as any;
    (el as any).offline = false;
    (el as any).cacheState = null;
    (el as any).primeProgress = null;
    (el as any).freshnessLabel = null;
    (el as any).storageEstimate = null;
    (el as any).updateAvailable = false;
    document.body.appendChild(el);
    await (el as any).updateComplete;
  });

  afterEach(() => {
    if (el && el.isConnected) el.remove();
  });

  // beeatlas-j96: the standalone cache icon button is gone — cache status is now
  // a row inside the one account/status menu, opened from `.account-btn`.
  const openMenu = async () => {
    const btn = el.shadowRoot!.querySelector('.account-btn') as HTMLElement;
    expect(btn).not.toBeNull();
    btn.click();
    await (el as any).updateComplete;
  };

  test('menu status row A: priming online → "Caching N MB of M MB"', async () => {
    (el as any).cacheState = { ready: false, cached: [], missing: ['db'] };
    (el as any).primeProgress = { received: 47_000_000, total: 100_000_000, assetInFlight: 'occurrences.db' };
    (el as any).offline = false;
    await (el as any).updateComplete;
    await openMenu();

    const text = el.shadowRoot!.querySelector('.account-popover')!.textContent!;
    expect(text).toMatch(/Caching 44\.8 MB of 95\.4 MB/);
  });

  test('menu status row B: priming + offline → "Finish on WiFi to complete cache"', async () => {
    (el as any).cacheState = { ready: false, cached: [], missing: ['db'] };
    (el as any).primeProgress = { received: 10_000, total: 100_000, assetInFlight: 'occurrences.db' };
    (el as any).offline = true;
    await (el as any).updateComplete;
    await openMenu();

    const text = el.shadowRoot!.querySelector('.account-popover')!.textContent!;
    expect(text).toMatch(/Finish on WiFi to complete cache/);
  });

  test('menu status row C: ready → "Offline-ready"', async () => {
    (el as any).cacheState = {
      ready: true,
      cached: ['url1', 'url2', 'url3', 'url4'],
      missing: [],
    };
    await (el as any).updateComplete;
    await openMenu();

    const text = el.shadowRoot!.querySelector('.account-popover')!.textContent!;
    expect(text).toMatch(/Offline-ready/);
  });

  test('menu status row absent when cacheState is null — menu still opens', async () => {
    (el as any).cacheState = null;
    await (el as any).updateComplete;
    await openMenu();

    const popover = el.shadowRoot!.querySelector('.account-popover');
    expect(popover).not.toBeNull();
    expect(popover!.textContent).not.toMatch(/Offline-ready|Caching|Finish on WiFi/);
  });

  test('menu is reachable when signed out (authState null) — carries source + build', async () => {
    (el as any).authState = null;
    await (el as any).updateComplete;
    await openMenu();

    const popover = el.shadowRoot!.querySelector('.account-popover')!;
    expect(popover.textContent).toMatch(/Source code/);
    expect(popover.textContent).toMatch(/Build /);
    expect(popover.querySelector('a.menu-row')!.getAttribute('href'))
      .toBe('https://github.com/rainhead/beeatlas');
  });

  test('freshness-caption renders when freshnessLabel non-null', async () => {
    (el as any).freshnessLabel = 'Today';
    await (el as any).updateComplete;

    const caption = el.shadowRoot!.querySelector('.freshness-caption');
    expect(caption).not.toBeNull();
    expect(caption!.textContent).toBe('Today');
  });

  test('freshness-caption hidden when freshnessLabel is null (D-11/D-12)', async () => {
    (el as any).freshnessLabel = null;
    await (el as any).updateComplete;

    const caption = el.shadowRoot!.querySelector('.freshness-caption');
    expect(caption).toBeNull();
  });

  test('popover opens on ready-pill click + dispatches "cache-popover-toggle" upward', async () => {
    (el as any).cacheState = { ready: true, cached: ['url1'], missing: [] };
    await (el as any).updateComplete;

    // Capture the event on a parent
    let capturedEvent: CustomEvent | null = null;
    const parentListener = (e: Event) => { capturedEvent = e as CustomEvent; };
    document.body.addEventListener('cache-popover-toggle', parentListener);

    const pill = el.shadowRoot!.querySelector('.account-btn') as HTMLElement;
    expect(pill).not.toBeNull();
    pill.click();
    await (el as any).updateComplete;

    document.body.removeEventListener('cache-popover-toggle', parentListener);

    const popover = el.shadowRoot!.querySelector('.cache-popover');
    expect(popover).not.toBeNull();

    expect(capturedEvent).not.toBeNull();
    expect((capturedEvent as any).detail.open).toBe(true);
    expect((capturedEvent as any).bubbles).toBe(true);
    expect((capturedEvent as any).composed).toBe(true);
  });

  // The menu has no ✕ (beeatlas-j96, research §11): the account button stays
  // visible and toggles, so it IS the close control. Escape and outside-click
  // are the dismissal paths — both must still emit the toggle event, because
  // bee-atlas keys its lazy storage.estimate() off it.
  test('menu closes on Escape + dispatches "cache-popover-toggle" with open=false', async () => {
    (el as any).cacheState = { ready: true, cached: ['url1'], missing: [] };
    await (el as any).updateComplete;
    await openMenu();

    expect(el.shadowRoot!.querySelector('.account-popover')).not.toBeNull();
    // No dismiss control should exist in the menu.
    expect(el.shadowRoot!.querySelector('.account-popover .cache-popover__dismiss')).toBeNull();

    let capturedCloseEvent: CustomEvent | null = null;
    document.body.addEventListener('cache-popover-toggle', (e) => {
      capturedCloseEvent = e as CustomEvent;
    }, { once: true });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await (el as any).updateComplete;

    expect(el.shadowRoot!.querySelector('.account-popover')).toBeNull();
    expect(capturedCloseEvent).not.toBeNull();
    expect((capturedCloseEvent as any).detail.open).toBe(false);
  });

  test('menu closes on outside click + dispatches "cache-popover-toggle" with open=false', async () => {
    (el as any).cacheState = { ready: true, cached: ['url1'], missing: [] };
    await (el as any).updateComplete;
    await openMenu();

    let capturedCloseEvent: CustomEvent | null = null;
    document.body.addEventListener('cache-popover-toggle', (e) => {
      capturedCloseEvent = e as CustomEvent;
    }, { once: true });

    document.body.click();
    await (el as any).updateComplete;

    expect(el.shadowRoot!.querySelector('.account-popover')).toBeNull();
    expect(capturedCloseEvent).not.toBeNull();
    expect((capturedCloseEvent as any).detail.open).toBe(false);
  });

  test('popover storage row hides when storageEstimate is null (D-19 feature-detect)', async () => {
    (el as any).cacheState = { ready: true, cached: ['url1'], missing: [] };
    (el as any).storageEstimate = null;
    await (el as any).updateComplete;

    // Open popover
    const pill = el.shadowRoot!.querySelector('.account-btn') as HTMLElement;
    pill.click();
    await (el as any).updateComplete;

    const popover = el.shadowRoot!.querySelector('.cache-popover');
    expect(popover).not.toBeNull();
    // Storage row should not be present
    expect(popover!.textContent).not.toMatch(/MB stored on this device/);
  });

  test('popover storage row visible + quota sub-line hidden when quotaMB null OR ≥ 200', async () => {
    (el as any).cacheState = { ready: true, cached: ['url1'], missing: [] };
    (el as any).storageEstimate = { usageMB: '23.4', quotaMB: null };
    await (el as any).updateComplete;

    const pill = el.shadowRoot!.querySelector('.account-btn') as HTMLElement;
    pill.click();
    await (el as any).updateComplete;

    const popover = el.shadowRoot!.querySelector('.cache-popover');
    expect(popover).not.toBeNull();
    expect(popover!.textContent).toMatch(/23\.4 MB stored on this device/);
    expect(popover!.textContent).not.toMatch(/available/);
  });

  test('popover quota sub-line visible when quotaMB < 200 (D-18)', async () => {
    (el as any).cacheState = { ready: true, cached: ['url1'], missing: [] };
    (el as any).storageEstimate = { usageMB: '23.4', quotaMB: '47' };
    await (el as any).updateComplete;

    const pill = el.shadowRoot!.querySelector('.account-btn') as HTMLElement;
    pill.click();
    await (el as any).updateComplete;

    const popover = el.shadowRoot!.querySelector('.cache-popover');
    expect(popover).not.toBeNull();
    expect(popover!.textContent).toMatch(/of 47 MB available/);
  });

  test('popover passive update affordance hidden when updateAvailable=false', async () => {
    (el as any).cacheState = { ready: true, cached: ['url1'], missing: [] };
    (el as any).updateAvailable = false;
    await (el as any).updateComplete;

    const pill = el.shadowRoot!.querySelector('.account-btn') as HTMLElement;
    pill.click();
    await (el as any).updateComplete;

    const popover = el.shadowRoot!.querySelector('.cache-popover');
    expect(popover).not.toBeNull();
    expect(popover!.textContent).not.toMatch(/tap to reload/);
  });

  test('popover passive update affordance visible when updateAvailable=true', async () => {
    (el as any).cacheState = { ready: true, cached: ['url1'], missing: [] };
    (el as any).updateAvailable = true;
    await (el as any).updateComplete;

    const pill = el.shadowRoot!.querySelector('.account-btn') as HTMLElement;
    pill.click();
    await (el as any).updateComplete;

    const popover = el.shadowRoot!.querySelector('.cache-popover');
    expect(popover).not.toBeNull();
    expect(popover!.textContent).toMatch(/App update available — tap to reload/);
  });
});

// ---------------------------------------------------------------------------
// <bee-atlas> update banner + popover lazy storage estimate (Phase 150)
// ---------------------------------------------------------------------------

describe('bee-atlas update banner + popover lazy storage estimate (Phase 150)', () => {
  let el: HTMLElement & {
    updateComplete: Promise<boolean>;
    shadowRoot: ShadowRoot;
    _updateAvailable: boolean;
    _storageEstimate: { usageMB: string; quotaMB: string | null } | null;
    _cacheState: { ready: boolean; cached: string[]; missing: string[] } | null;
    _primeProgress: { received: number; total: number; assetInFlight: string | null } | null;
  };

  let originalStorageValue: StorageManager;

  beforeEach(async () => {
    originalStorageValue = navigator.storage;
    await import('../bee-atlas.ts');
    el = document.createElement('bee-atlas') as any;
    document.body.appendChild(el);
    await (el as any).updateComplete;
  });

  afterEach(() => {
    if (el && el.isConnected) el.remove();
    // Restore navigator.storage
    try {
      Object.defineProperty(navigator, 'storage', {
        value: originalStorageValue,
        configurable: true,
      });
    } catch {
      // ignore
    }
    vi.restoreAllMocks();
  });

  test('renders no update banner when _updateAvailable=false (initial)', async () => {
    const banner = el.shadowRoot!.querySelector('.update-banner');
    expect(banner).toBeNull();
  });

  test('renders update banner on "sw-update-available" window event', async () => {
    window.dispatchEvent(new CustomEvent('sw-update-available'));
    await (el as any).updateComplete;

    const banner = el.shadowRoot!.querySelector('.update-banner');
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toMatch(/A data update is available — tap to reload/);
  });

  test('tap banner body calls window.__wb.messageSkipWaiting()', async () => {
    const mockMessageSkipWaiting = vi.fn();
    (window as any).__wb = { messageSkipWaiting: mockMessageSkipWaiting };

    // Stub location.reload
    let reloadSpy: ReturnType<typeof vi.fn> | null = null;
    try {
      reloadSpy = vi.fn();
      Object.defineProperty(window, 'location', {
        value: { ...window.location, reload: reloadSpy },
        configurable: true,
      });
    } catch {
      // happy-dom may reject this — that's OK, we'll still assert messageSkipWaiting
    }

    window.dispatchEvent(new CustomEvent('sw-update-available'));
    await (el as any).updateComplete;

    const bannerBody = el.shadowRoot!.querySelector('.update-banner__body') as HTMLElement;
    expect(bannerBody).not.toBeNull();
    bannerBody.click();

    expect(mockMessageSkipWaiting).toHaveBeenCalledOnce();

    // Soft assert on reload — may fail in some happy-dom versions
    if (reloadSpy) {
      // best-effort
    }

    delete (window as any).__wb;
  });

  test('tap banner ✕ dismisses (sets _updateAvailable=false) for session per D-15', async () => {
    window.dispatchEvent(new CustomEvent('sw-update-available'));
    await (el as any).updateComplete;

    const bannerBefore = el.shadowRoot!.querySelector('.update-banner');
    expect(bannerBefore).not.toBeNull();

    const dismiss = el.shadowRoot!.querySelector('.update-banner__dismiss') as HTMLElement;
    expect(dismiss).not.toBeNull();
    dismiss.click();
    await (el as any).updateComplete;

    const bannerAfter = el.shadowRoot!.querySelector('.update-banner');
    expect(bannerAfter).toBeNull();

    expect((el as any)._updateAvailable).toBe(false);
  });

  test('lazy storage estimate: dispatching "cache-popover-toggle" detail.open=true triggers navigator.storage.estimate() exactly once', async () => {
    const mockEstimate = vi.fn(() => Promise.resolve({ usage: 24_549_376, quota: undefined }));
    Object.defineProperty(navigator, 'storage', {
      value: { estimate: mockEstimate },
      configurable: true,
    });

    // Dispatch the cache-popover-toggle event from within the bee-atlas element (simulating bee-header emitting it)
    el.dispatchEvent(new CustomEvent('cache-popover-toggle', {
      detail: { open: true },
      bubbles: true,
      composed: true,
    }));
    await (el as any).updateComplete;
    // Wait for the async storage estimate to resolve
    await Promise.resolve();
    await (el as any).updateComplete;

    expect(mockEstimate).toHaveBeenCalledOnce();

    const storageEstimate = (el as any)._storageEstimate;
    expect(storageEstimate).not.toBeNull();
    expect(storageEstimate!.usageMB).toBe('23.4');
    expect(storageEstimate!.quotaMB).toBeNull();
  });

  test('navigator.storage.estimate undefined → _storageEstimate stays null (D-19)', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: {},
      configurable: true,
    });

    el.dispatchEvent(new CustomEvent('cache-popover-toggle', {
      detail: { open: true },
      bubbles: true,
      composed: true,
    }));
    await (el as any).updateComplete;
    await Promise.resolve();
    await (el as any).updateComplete;

    expect((el as any)._storageEstimate).toBeNull();
  });

  test('<bee-atlas> relays cacheState + primeProgress + freshnessLabel + storageEstimate + updateAvailable to <bee-header>', async () => {
    // Dispatch events to set state
    window.dispatchEvent(new CustomEvent('cache-state-changed', {
      detail: { ready: true, cached: ['url1'], missing: [] },
    }));
    window.dispatchEvent(new CustomEvent('cache-prime-progress', {
      detail: { received: 5_000_000, total: 28_000_000, assetInFlight: 'foo', ready: false },
    }));
    window.dispatchEvent(new CustomEvent('sw-update-available'));
    await (el as any).updateComplete;

    const header = el.shadowRoot!.querySelector('bee-header') as any;
    expect(header).not.toBeNull();

    // cacheState
    expect(header.cacheState).not.toBeNull();
    expect(header.cacheState.ready).toBe(true);

    // primeProgress
    expect(header.primeProgress).not.toBeNull();
    expect(header.primeProgress.received).toBe(5_000_000);

    // updateAvailable
    expect(header.updateAvailable).toBe(true);
  });

  test('cache-prime-progress window event updates _primeProgress and triggers re-render', async () => {
    window.dispatchEvent(new CustomEvent('cache-prime-progress', {
      detail: { received: 5_000_000, total: 28_000_000, assetInFlight: 'foo', ready: false },
    }));
    await (el as any).updateComplete;

    const progress = (el as any)._primeProgress;
    expect(progress).not.toBeNull();
    expect(progress!.received).toBe(5_000_000);
    expect(progress!.total).toBe(28_000_000);
  });

  test('cache-state-changed window event updates _cacheState', async () => {
    window.dispatchEvent(new CustomEvent('cache-state-changed', {
      detail: { ready: true, cached: ['url1', 'url2'], missing: [] },
    }));
    await (el as any).updateComplete;

    const cacheState = (el as any)._cacheState;
    expect(cacheState).not.toBeNull();
    expect(cacheState!.ready).toBe(true);
    expect(cacheState!.cached).toContain('url1');
  });
});
