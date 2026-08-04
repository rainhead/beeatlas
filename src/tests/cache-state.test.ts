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

vi.mock('maplibre-gl', async () => (await import('./helpers/maplibre-mock.ts')).maplibreMock());

vi.mock('maplibre-gl/dist/maplibre-gl.css?raw', () => ({ default: '' }));

vi.mock('../prime-orchestrator.ts', () => ({ computeReadyState: vi.fn() }));
vi.mock('../sw-registration.ts', () => ({}));

// Mock <bee-map> as an inert custom element so `<bee-atlas>` can mount in
// happy-dom without firstUpdated → `new maplibregl.Map()` → unhandled rejections
// (bee-map calls `boxZoom.disable()`, `getCanvasContainer()` etc. that the
// maplibre-gl stub above doesn't model). The cache-state tests don't exercise
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

  // beeatlas-66o — where the cache cannot outlive this browsing context, the menu
  // must not claim offline readiness.
  //
  // Two measured facts sit behind these cases. An installed iOS PWA has its own
  // storage bucket (beeatlas-93t, confirmed in both directions on iOS 18.7), so a
  // tab's cache never reaches the installed app. And WebKit deletes script-writable
  // storage — Service Worker cache included — after seven days of Safari use without
  // interaction on the site, exempting Home Screen apps because they keep their own
  // counter. "Offline-ready" is false on both counts there.
  test('ephemeral cache: ready reports what it can keep, not offline readiness', async () => {
    (el as any).cacheState = { ready: true, cached: ['a', 'b', 'c', 'd'], missing: [] };
    (el as any).cacheIsEphemeral = true;
    await (el as any).updateComplete;
    await openMenu();

    const text = el.shadowRoot!.querySelector('.account-popover')!.textContent!;
    expect(text).toMatch(/Cached for this visit/);
    expect(text, 'the claim it cannot keep').not.toMatch(/Offline-ready/);
  });

  test('ephemeral cache: the row points at installing, which is the actual fix', async () => {
    // Explains AND points, rather than only disclaiming — installing is the only
    // action that converts this into real offline. Mirrors the basemap row.
    (el as any).cacheState = { ready: true, cached: ['a'], missing: [] };
    (el as any).cacheIsEphemeral = true;
    await (el as any).updateComplete;
    await openMenu();

    const text = el.shadowRoot!.querySelector('.account-popover')!.textContent!;
    expect(text).toMatch(/Install the app/);
    expect(text, 'says why, not just what').toMatch(/7 days|installed app/);
  });

  test('a non-ephemeral context still gets the plain readiness claim', async () => {
    // Desktop and Android installed PWAs share the origin's storage, so there is no
    // caveat to give — gating this on iOS-in-a-tab is the whole point.
    (el as any).cacheState = { ready: true, cached: ['a'], missing: [] };
    (el as any).cacheIsEphemeral = false;
    await (el as any).updateComplete;
    await openMenu();

    const text = el.shadowRoot!.querySelector('.account-popover')!.textContent!;
    expect(text).toMatch(/Offline-ready/);
    expect(text).not.toMatch(/Cached for this visit/);
  });

  test('ephemeral only changes the READY message, not the in-progress ones', async () => {
    (el as any).cacheState = { ready: false, cached: [], missing: ['db'] };
    (el as any).cacheIsEphemeral = true;
    (el as any).offline = true;
    await (el as any).updateComplete;
    await openMenu();

    const text = el.shadowRoot!.querySelector('.account-popover')!.textContent!;
    expect(text).toMatch(/Finish on WiFi to complete cache/);
    expect(text).not.toMatch(/Cached for this visit/);
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
    // beeatlas-4uj: the build id is a property now, from the slim manifest, not a
    // compile-time define. Whoever mounts the header supplies it.
    (el as any).buildId = '4535cd0';
    await (el as any).updateComplete;
    await openMenu();

    const popover = el.shadowRoot!.querySelector('.account-popover')!;
    expect(popover.textContent).toMatch(/Source code/);
    expect(popover.textContent).toMatch(/Build 4535cd0/);
    expect(popover.querySelector('a.menu-row')!.getAttribute('href'))
      .toBe('https://github.com/rainhead/beeatlas');
  });

  test('with no build id, the row is omitted rather than showing a placeholder', async () => {
    // The static pages mount <bee-header> without fetching anything (its entry does
    // not import manifest.ts), so they have no build id to give — the same reason the
    // freshness row is absent there. Omitting beats inventing: "Build dev" or
    // "Build unknown" on a production page would be a claim, and a wrong one.
    (el as any).authState = null;
    (el as any).buildId = null;
    await (el as any).updateComplete;
    await openMenu();

    const popover = el.shadowRoot!.querySelector('.account-popover')!;
    expect(popover.textContent).toMatch(/Source code/);
    expect(popover.textContent).not.toMatch(/Build/);
  });

  // beeatlas-j96 folded freshness into the menu; the header itself never shows
  // it (the inline caption under the title outlived that fold by oversight).
  test('freshness renders as a menu row, never beside the title', async () => {
    (el as any).freshnessLabel = 'Today';
    await (el as any).updateComplete;

    expect(el.shadowRoot!.querySelector('.left-group')!.textContent).not.toMatch(/Today/);

    await openMenu();
    expect(el.shadowRoot!.querySelector('.account-popover')!.textContent).toMatch(/Today/);
  });

  test('no freshness row when freshnessLabel is null (D-11/D-12)', async () => {
    (el as any).freshnessLabel = null;
    await (el as any).updateComplete;
    await openMenu();

    expect(el.shadowRoot!.querySelector('.account-popover')!.textContent).not.toMatch(/Today|Data as of/);
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

  // --- beeatlas-d8j: taking the update ---------------------------------------
  //
  // The bug these pin: the tap used to post SKIP_WAITING and reload on the SAME TICK,
  // racing the new worker's activation. The old worker won that race and answered the
  // navigation from its own precached app shell, so the page came back unchanged. The
  // ORDER is the fix, so the order is what is asserted — "messageSkipWaiting was
  // called" (all the old test checked) stays true under the broken code.

  /** Stub window.location.reload and return the spy.
   *
   *  Deliberately NOT try/catch'd into an optional. The predecessor test guarded every
   *  reload assertion behind `if (reloadSpy)`, so had the stub ever stopped working the
   *  suite would have gone quietly vacuous while still reporting green — which is how a
   *  reload-ordering bug survived in a tested file. If this cannot stub, that is a real
   *  signal about the environment and the suite should say so. */
  const stubReload = (): ReturnType<typeof vi.fn> => {
    const spy = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: spy },
      configurable: true,
    });
    return spy;
  };

  /** A fake Workbox handle that records its `controlling` listeners so a test can fire
   *  control transfer when it chooses — which is what makes the race observable. */
  const fakeWorkbox = () => {
    const listeners: Array<() => void> = [];
    return {
      messageSkipWaiting: vi.fn(),
      addEventListener: vi.fn((_type: string, fn: () => void) => { listeners.push(fn); }),
      takeControl: () => listeners.forEach((fn) => fn()),
    };
  };

  const tapBanner = async (element: any) => {
    window.dispatchEvent(new CustomEvent('sw-update-available'));
    await element.updateComplete;
    const body = element.shadowRoot!.querySelector('.update-banner__body') as HTMLElement;
    expect(body).not.toBeNull();
    body.click();
    return body;
  };

  test('tap posts SKIP_WAITING but does NOT reload until the new worker takes control', async () => {
    const wb = fakeWorkbox();
    (window as any).__wb = wb;
    const reloadSpy = stubReload();

    await tapBanner(el);

    expect(wb.messageSkipWaiting).toHaveBeenCalledOnce();
    expect(wb.addEventListener).toHaveBeenCalledWith('controlling', expect.any(Function));
    // THE regression: reloading here is what served the old shell.
    expect(reloadSpy).not.toHaveBeenCalled();
    wb.takeControl();
    expect(reloadSpy).toHaveBeenCalledOnce();

    delete (window as any).__wb;
  });

  test('reloads anyway if control never transfers, so the button is never dead', async () => {
    // A stale banner (nothing actually waiting) or a message the worker never processes:
    // `controlling` never fires. Reloading on the old worker is the behaviour this
    // replaced — acceptable — whereas doing nothing at all would be a worse button.
    vi.useFakeTimers();
    try {
      const wb = fakeWorkbox();
      (window as any).__wb = wb;
      const reloadSpy = stubReload();

      await tapBanner(el);
      expect(reloadSpy).not.toHaveBeenCalled();
      vi.advanceTimersByTime(3000);
      expect(reloadSpy).toHaveBeenCalledOnce();

      // ...and the late arrival of control must not reload a second time.
      wb.takeControl();
      expect(reloadSpy).toHaveBeenCalledOnce();
      delete (window as any).__wb;
    } finally {
      vi.useRealTimers();
    }
  });

  test('with no service worker at all, the tap reloads immediately', async () => {
    // index.html mounts this same component with no SW registered (sw-registration.ts
    // is imported only by the /app entry), so there is no control transfer to wait for.
    delete (window as any).__wb;
    const reloadSpy = stubReload();

    await tapBanner(el);

    expect(reloadSpy).toHaveBeenCalledOnce();
  });

  test('a second tap while the first is in flight does not stack another reload', async () => {
    const wb = fakeWorkbox();
    (window as any).__wb = wb;
    const reloadSpy = stubReload();

    const body = await tapBanner(el);
    await (el as any).updateComplete;
    expect((body as HTMLButtonElement).disabled).toBe(true);

    body.click(); // ignored: disabled, and guarded regardless
    expect(wb.messageSkipWaiting).toHaveBeenCalledOnce();

    wb.takeControl();
    expect(reloadSpy).toHaveBeenCalledOnce();

    delete (window as any).__wb;
  });

  test('the header menu route is guarded too, not just the disabled button', async () => {
    // `cache-update-acted` (dispatched from the account menu) is wired to the SAME
    // handler as the banner (bee-atlas connectedCallback), so it re-enters even while
    // the banner button is disabled. Without the in-handler guard this stacks a second
    // `controlling` listener and a second timeout — which is why the guard cannot be
    // left to the button's disabled state alone.
    const wb = fakeWorkbox();
    (window as any).__wb = wb;
    const reloadSpy = stubReload();

    await tapBanner(el);
    el.dispatchEvent(new CustomEvent('cache-update-acted', { bubbles: true, composed: true }));

    expect(wb.messageSkipWaiting).toHaveBeenCalledOnce();
    expect(wb.addEventListener).toHaveBeenCalledOnce();

    wb.takeControl();
    expect(reloadSpy).toHaveBeenCalledOnce();

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
