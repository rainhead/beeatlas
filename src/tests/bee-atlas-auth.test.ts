// 178-07 gap fix regression: the map-page <bee-atlas> mounts its own <bee-header>
// (src/bee-atlas.ts) alongside the standalone-page controller (src/entries/bee-header.ts).
// This file verifies the map-page instance is wired the same way: authState populated
// from fetchWhoami on mount, sign-in dispatches startSignIn, sign-out dispatches
// signOut()+re-fetch. A dedicated file (not an addition to bee-atlas.test.ts) is used
// because full-DOM mounting of <bee-atlas> requires an inert <bee-map> stub (project
// memory: feedback_bee_atlas_test_mounting) which would conflict with bee-atlas.test.ts's
// ARCH-02 test asserting on the REAL BeeMap class's @property declarations — mirrors the
// existing sibling pattern already used by cache-state.test.ts for the same reason.
import { test, expect, describe, vi, beforeEach, afterEach } from 'vitest';

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

// Mock <bee-map> as an inert custom element so `<bee-atlas>` can mount in
// happy-dom without firstUpdated → `new mapboxgl.Map()` → unhandled rejections
// (bee-map calls `boxZoom.disable()`, `getCanvasContainer()` etc. that the
// mapbox-gl stub above doesn't model). These auth-wiring tests don't exercise the
// map surface, so an inert child is sufficient (pattern copied from cache-state.test.ts).
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

const mockFetchWhoami = vi.fn();
const mockStartSignIn = vi.fn();
const mockSignOut = vi.fn();
vi.mock('../auth-client.ts', () => ({
  fetchWhoami: (...args: unknown[]) => mockFetchWhoami(...args),
  startSignIn: (...args: unknown[]) => mockStartSignIn(...args),
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

// happy-dom can leave `window.location.pathname` undefined in some module
// load orderings; `<bee-header>`'s render reads `pathname.startsWith(...)`
// and would surface as an unhandled rejection inside Lit's async update
// path (mirrors cache-state.test.ts).
if (typeof window !== 'undefined' && window.location?.pathname == null) {
  try {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, pathname: '/index.html' },
    });
  } catch {
    // ignore — env already has a writable location
  }
}

describe('bee-atlas map-page <bee-header> auth wiring (178-07 gap fix)', () => {
  let el: (HTMLElement & { updateComplete: Promise<boolean>; shadowRoot: ShadowRoot }) | null = null;

  beforeEach(() => {
    mockFetchWhoami.mockReset();
    mockStartSignIn.mockReset();
    mockSignOut.mockReset();
    // auth-client is module-mocked above, but the mounted <bee-atlas> also
    // background-fetches data (places_meta name map, …) with swallowed
    // failures; unstubbed, those open real sockets and the connection errors
    // (AggregateError ECONNREFUSED) spray the logs of green runs
    // (beeatlas-556). A 404 keeps each caller on its unavailable path.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
  });

  afterEach(() => {
    if (el && el.isConnected) el.remove();
    el = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('on mount, fetchWhoami is called and its result flows to <bee-header>.authState', async () => {
    mockFetchWhoami.mockResolvedValue({ authenticated: true, login: 'rainhead', role: 'author', isAuthor: true });

    await import('../bee-atlas.ts');
    el = document.createElement('bee-atlas') as any;
    document.body.appendChild(el!);
    await el!.updateComplete;

    expect(mockFetchWhoami).toHaveBeenCalledOnce();

    // Allow the fire-and-forget fetchWhoami().then(...) microtask to settle and
    // trigger the @state re-render.
    await Promise.resolve();
    await Promise.resolve();
    await el!.updateComplete;

    const header = el!.shadowRoot!.querySelector('bee-header') as any;
    expect(header).not.toBeNull();
    expect(header.authState).toEqual({ authenticated: true, login: 'rainhead', role: 'author', isAuthor: true });
  });

  test('anonymous whoami result flows through as {authenticated:false}', async () => {
    mockFetchWhoami.mockResolvedValue({ authenticated: false });

    await import('../bee-atlas.ts');
    el = document.createElement('bee-atlas') as any;
    document.body.appendChild(el!);
    await el!.updateComplete;
    await Promise.resolve();
    await Promise.resolve();
    await el!.updateComplete;

    const header = el!.shadowRoot!.querySelector('bee-header') as any;
    expect(header.authState).toEqual({ authenticated: false });
  });

  test('"sign-in" event dispatched from <bee-header> calls startSignIn(window.location.href)', async () => {
    mockFetchWhoami.mockResolvedValue({ authenticated: false });

    await import('../bee-atlas.ts');
    el = document.createElement('bee-atlas') as any;
    document.body.appendChild(el!);
    await el!.updateComplete;

    const header = el!.shadowRoot!.querySelector('bee-header') as HTMLElement;
    expect(header).not.toBeNull();
    header.dispatchEvent(new CustomEvent('sign-in', { bubbles: true, composed: true }));

    expect(mockStartSignIn).toHaveBeenCalledOnce();
    expect(mockStartSignIn).toHaveBeenCalledWith(window.location.href);
  });

  test('"sign-out" event dispatched from <bee-header> calls signOut() then re-fetches whoami', async () => {
    mockFetchWhoami
      .mockResolvedValueOnce({ authenticated: true, login: 'rainhead', role: 'author', isAuthor: true })
      .mockResolvedValueOnce({ authenticated: false });
    mockSignOut.mockResolvedValue(undefined);

    await import('../bee-atlas.ts');
    el = document.createElement('bee-atlas') as any;
    document.body.appendChild(el!);
    await el!.updateComplete;
    await Promise.resolve();
    await Promise.resolve();
    await el!.updateComplete;

    const header = el!.shadowRoot!.querySelector('bee-header') as HTMLElement;
    header.dispatchEvent(new CustomEvent('sign-out', { bubbles: true, composed: true }));

    expect(mockSignOut).toHaveBeenCalledOnce();

    // The signOut().then(fetchWhoami).then(setState) chain is a 3-hop async
    // sequence feeding a Lit @state re-render; poll until it settles rather
    // than counting microtasks (deterministic, avoids the settle race).
    await vi.waitFor(() => {
      expect(mockFetchWhoami).toHaveBeenCalledTimes(2);
      const headerNow = el!.shadowRoot!.querySelector('bee-header') as any;
      expect(headerNow.authState).toEqual({ authenticated: false });
    });
  });

  test('disconnectedCallback removes sign-in/sign-out listeners (no state leak after removal)', async () => {
    mockFetchWhoami.mockResolvedValue({ authenticated: false });

    await import('../bee-atlas.ts');
    el = document.createElement('bee-atlas') as any;
    document.body.appendChild(el!);
    await el!.updateComplete;

    el!.remove();

    mockStartSignIn.mockClear();
    el!.dispatchEvent(new CustomEvent('sign-in', { bubbles: true, composed: true }));
    expect(mockStartSignIn).not.toHaveBeenCalled();
  });
});
