// beeatlas-8zs / beeatlas-v66 — <bee-atlas> answers a search submitted from the
// header with a SELECTION.
//
// A dedicated file (not an addition to bee-atlas.test.ts) because full-DOM mounting
// of <bee-atlas> needs an inert <bee-map> stub, which would conflict with that file's
// ARCH-02 assertions on the REAL BeeMap class — the sibling pattern already used by
// cache-state.test.ts and bee-atlas-auth.test.ts.
import { test, expect, describe, vi, beforeEach, afterEach } from 'vitest';
import { emptyFilterState, type CatalogLookupResult, type OccurrenceRow } from '../filter.ts';

vi.mock('../sqlite.ts', () => ({
  getDB: vi.fn(() => Promise.resolve({ sqlite3: { exec: vi.fn(() => Promise.resolve()) }, db: 0 })),
  loadOccurrencesTable: vi.fn(() => Promise.resolve()),
  tablesReady: Promise.resolve(),
}));

vi.mock('../features.ts', () => ({
  loadOccurrenceGeoJSON: vi.fn(() => Promise.resolve({
    geojson: { type: 'FeatureCollection', features: [] },
    summary: { totalSpecimens: 0, speciesCount: 0, genusCount: 0, familyCount: 0, earliestYear: 0, latestYear: 0 },
    taxaOptions: [],
  })),
}));

vi.mock('mapbox-gl/dist/mapbox-gl.css?raw', () => ({ default: '' }));

vi.mock('../auth-client.ts', () => ({
  fetchWhoami: vi.fn(() => Promise.resolve({ authenticated: false })),
  startSignIn: vi.fn(),
  signOut: vi.fn(),
}));

// Inert <bee-map>: these tests read the state <bee-atlas> hands DOWN to the map,
// not the map's own behavior.
vi.mock('../bee-map.ts', async () => {
  const { LitElement } = await import('lit');
  const { customElement } = await import('lit/decorators.js');
  @customElement('bee-map')
  class BeeMapStub extends LitElement {
    boundaryMode: string = 'off';
    visibleIds: unknown = null;
    filteredGeoJSON: unknown = null;
    selectedOccIds: Set<string> | null = null;
    countyOptions: string[] = [];
    ecoregionOptions: string[] = [];
    viewState: { lon: number; lat: number; zoom: number } | null = null;
    filterState: unknown = null;
    requestUserLocation() { /* inert */ }
  }
  return { BeeMap: BeeMapStub };
});

// The lookup itself is exercised for real in catalog-lookup.test.ts; here it is a
// seam, so each case can state exactly what the DB answered.
const mockLookup = vi.fn<(suffix: string, f: unknown) => Promise<CatalogLookupResult>>();
vi.mock('../filter.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../filter.ts')>();
  return {
    ...actual,
    lookupByCatalogSuffix: (suffix: string, f: unknown) => mockLookup(suffix, f),
  };
});

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

/** A specimen row as the lookup would return it. */
function specimenRow(over: Partial<OccurrenceRow> = {}): OccurrenceRow {
  return {
    taxon_id: 101, lat: 47.6, lon: -122.3, date: '2024-06-01',
    county: 'King', ecoregion_l3: null, ecdysis_id: 5001,
    catalog_number: 'WSDA_2303966', recordedBy: 'A. Collector', fieldNumber: null,
    floralHost: null, host_observation_id: null, inat_host: null,
    inat_quality_grade: null, modified: null, specimen_observation_id: null,
    elevation_m: null, elevation_dem_m: null, year: 2024, month: 6, observation_id: null,
    host_inat_login: null, is_provisional: false,
    specimen_inat_quality_grade: null, specimen_count: null, sample_id: null,
    sample_host: null, checklist_id: null, verbatim_name: null, locality: null,
    collapsed_count: null, tier: 'atlas', record_type: 'specimen', image_url: null,
    obs_url: null, user_login: null, license: null,
    display_name: 'Bombus vosnesenskii', display_rank: 'species',
    ...over,
  };
}

interface AtlasEl extends HTMLElement {
  updateComplete: Promise<boolean>;
  shadowRoot: ShadowRoot;
}

let el: AtlasEl | null = null;

async function mountAtlas(): Promise<AtlasEl> {
  await import('../bee-atlas.ts');
  const node = document.createElement('bee-atlas') as AtlasEl;
  document.body.appendChild(node);
  await node.updateComplete;
  return node;
}

function pane(atlas: AtlasEl) {
  return atlas.shadowRoot.querySelector('bee-pane') as HTMLElement & {
    filterState: ReturnType<typeof emptyFilterState>;
    paneState: string;
  };
}

/** The search surface: <bee-header> submits the query and shows what came of it. */
function header(atlas: AtlasEl) {
  return atlas.shadowRoot.querySelector('bee-header') as HTMLElement & {
    searchEnabled: boolean;
    searchStatus: { query: string; kind: 'miss' | 'error' } | null;
  };
}

function map(atlas: AtlasEl) {
  return atlas.shadowRoot.querySelector('bee-map') as HTMLElement & {
    selectedOccIds: Set<string> | null;
    viewState: { lon: number; lat: number; zoom: number } | null;
    filterState: ReturnType<typeof emptyFilterState>;
  };
}

/** Fire the lookup the way <bee-header> does, then let the async handler settle. */
async function lookup(atlas: AtlasEl, query: string) {
  header(atlas).dispatchEvent(new CustomEvent('search-submit', {
    bubbles: true, composed: true, detail: { query },
  }));
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await atlas.updateComplete;
}

beforeEach(async () => {
  mockLookup.mockReset();
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
  // <bee-atlas> writes selection + filter into the URL and restores them on mount,
  // so a leftover query string would seed the next case's state. Start each mount
  // from a bare URL.
  window.history.replaceState({}, '', '/index.html');
  document.body.innerHTML = '';
  el = await mountAtlas();
});

afterEach(() => {
  if (el && el.isConnected) el.remove();
  el = null;
  vi.unstubAllGlobals();
});

describe('a resolved label number selects the specimen', () => {
  beforeEach(() => {
    mockLookup.mockResolvedValue({ rows: [specimenRow()], hiddenByFilter: false });
  });

  test('the normalized suffix — not the raw typing — is what gets looked up', async () => {
    await lookup(el!, '  WSDA_2303966 ');
    expect(mockLookup).toHaveBeenCalledOnce();
    expect(mockLookup.mock.calls[0]![0]).toBe('2303966');
  });

  test('the specimen becomes the selection and the pane opens on its detail card', async () => {
    await lookup(el!, '2303966');
    expect(map(el!).selectedOccIds).toEqual(new Set(['ecdysis:5001']));
    expect(pane(el!).paneState).toBe('list');
  });

  test('the map centres on the specimen — a label number carries no sense of place', async () => {
    await lookup(el!, '2303966');
    expect(map(el!).viewState).toEqual({ lat: 47.6, lon: -122.3, zoom: 12 });
  });

  test('a user already zoomed in closer is not pulled back out', async () => {
    // Simulate a settled viewport at z15, the way <bee-map> reports one.
    map(el!).dispatchEvent(new CustomEvent('view-moved', {
      bubbles: true, composed: true, detail: { lon: -122.3, lat: 47.6, zoom: 15 },
    }));
    await el!.updateComplete;
    await lookup(el!, '2303966');
    expect(map(el!).viewState!.zoom).toBe(15);
  });

  test('the hit is reported back, so the header can close its popover over the answer', async () => {
    await lookup(el!, '2303966');
    expect(header(el!).searchStatus).toEqual({ query: '2303966', kind: 'hit' });
  });
});

describe('an active filter yields when it would hide the specimen', () => {
  test('a filter that excludes the match is cleared so the specimen is reachable', async () => {
    mockLookup.mockResolvedValue({ rows: [specimenRow()], hiddenByFilter: true });

    // Put a taxon filter up the way <bee-pane> does.
    pane(el!).dispatchEvent(new CustomEvent('filter-changed', {
      bubbles: true, composed: true,
      detail: { ...emptyFilterState(), taxonId: 100, taxonDisplayName: 'Bombus' },
    }));
    await el!.updateComplete;
    expect(map(el!).filterState.taxonId).toBe(100);

    await lookup(el!, '2303966');
    expect(map(el!).filterState.taxonId).toBeNull();
    expect(map(el!).selectedOccIds).toEqual(new Set(['ecdysis:5001']));
  });

  test('a filter that already admits the match is left alone', async () => {
    mockLookup.mockResolvedValue({ rows: [specimenRow()], hiddenByFilter: false });

    pane(el!).dispatchEvent(new CustomEvent('filter-changed', {
      bubbles: true, composed: true,
      detail: { ...emptyFilterState(), taxonId: 100, taxonDisplayName: 'Bombus' },
    }));
    await el!.updateComplete;

    await lookup(el!, '2303966');
    expect(map(el!).filterState.taxonId).toBe(100);
  });
});

describe('a lookup that resolves nothing changes nothing', () => {
  test('an unknown number is reported back to the field as a miss', async () => {
    mockLookup.mockResolvedValue({ rows: [], hiddenByFilter: false });
    await lookup(el!, '9999999');
    expect(header(el!).searchStatus).toEqual({ query: '9999999', kind: 'miss' });
    expect(map(el!).selectedOccIds).toBeNull();
  });

  test('unparseable input never reaches the DB', async () => {
    await lookup(el!, 'Bombus');
    expect(mockLookup).not.toHaveBeenCalled();
    expect(header(el!).searchStatus).toEqual({ query: 'Bombus', kind: 'miss' });
  });

  test('a miss does not clear an active filter', async () => {
    mockLookup.mockResolvedValue({ rows: [], hiddenByFilter: false });
    pane(el!).dispatchEvent(new CustomEvent('filter-changed', {
      bubbles: true, composed: true,
      detail: { ...emptyFilterState(), taxonId: 100, taxonDisplayName: 'Bombus' },
    }));
    await el!.updateComplete;

    await lookup(el!, '9999999');
    expect(map(el!).filterState.taxonId).toBe(100);
  });

  test('a failed query reports a FAILURE, never a miss', async () => {
    // A miss asserts "no specimen has that number". A failure means we never found
    // out. Reporting the second as the first tells the user their specimen does not
    // exist when it may well — and the likeliest cause is an offline cold-start, where
    // tablesReady/getDB reject because the wa-sqlite wasm is not cached.
    mockLookup.mockRejectedValue(new Error('no such column: catalog_number'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await lookup(el!, '2303966');
    expect(header(el!).searchStatus).toEqual({ query: '2303966', kind: 'error' });
    expect(map(el!).selectedOccIds).toBeNull();
  });

  test('a recovered query clears a previous failure', async () => {
    mockLookup.mockRejectedValue(new Error('db not ready'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await lookup(el!, '2303966');
    expect(header(el!).searchStatus).toEqual({ query: '2303966', kind: 'error' });
    mockLookup.mockResolvedValue({ rows: [], hiddenByFilter: false });
    await lookup(el!, '2303966');
    expect(header(el!).searchStatus).toEqual({ query: '2303966', kind: 'miss' });
  });

  test('a superseded lookup cannot clobber a newer one (WR-02 stale guard)', async () => {
    // Two fast Enters: the first resolves LAST. Without a generation guard its result
    // lands after the second's and selects the wrong specimen — the failure mode
    // CLAUDE.md's "Filter race guard" invariant exists to prevent.
    const slow: CatalogLookupResult = { rows: [specimenRow({ ecdysis_id: 111 })], hiddenByFilter: false };
    const fast: CatalogLookupResult = { rows: [specimenRow({ ecdysis_id: 222 })], hiddenByFilter: false };
    let releaseSlow!: (v: CatalogLookupResult) => void;
    mockLookup
      .mockImplementationOnce(() => new Promise<CatalogLookupResult>(res => { releaseSlow = res; }))
      .mockResolvedValueOnce(fast);

    header(el!).dispatchEvent(new CustomEvent('search-submit', {
      bubbles: true, composed: true, detail: { query: '111' },
    }));
    await lookup(el!, '222');
    expect(map(el!).selectedOccIds).toEqual(new Set(['ecdysis:222']));

    releaseSlow(slow);
    for (let i = 0; i < 8; i++) await Promise.resolve();
    await el!.updateComplete;
    expect(map(el!).selectedOccIds).toEqual(new Set(['ecdysis:222']));
  });

  test('a malformed submission supersedes the lookup still in flight', async () => {
    // The generation guard used to be bumped only for queries worth looking up, so
    // a good number followed by a malformed one left the first lookup live: it
    // landed late, replaced the miss the user was looking at, and moved the map to
    // a specimen they had already moved on from.
    const slow: CatalogLookupResult = { rows: [specimenRow({ ecdysis_id: 111 })], hiddenByFilter: false };
    let releaseSlow!: (v: CatalogLookupResult) => void;
    mockLookup.mockImplementationOnce(() => new Promise<CatalogLookupResult>(res => { releaseSlow = res; }));

    header(el!).dispatchEvent(new CustomEvent('search-submit', {
      bubbles: true, composed: true, detail: { query: '111' },
    }));
    await lookup(el!, 'Bombus');
    expect(header(el!).searchStatus).toEqual({ query: 'Bombus', kind: 'miss' });

    releaseSlow(slow);
    for (let i = 0; i < 8; i++) await Promise.resolve();
    await el!.updateComplete;
    expect(map(el!).selectedOccIds, 'the abandoned lookup must not select').toBeNull();
    expect(header(el!).searchStatus).toEqual({ query: 'Bombus', kind: 'miss' });
  });

  test('an empty submission supersedes the lookup still in flight', async () => {
    const slow: CatalogLookupResult = { rows: [specimenRow({ ecdysis_id: 111 })], hiddenByFilter: false };
    let releaseSlow!: (v: CatalogLookupResult) => void;
    mockLookup.mockImplementationOnce(() => new Promise<CatalogLookupResult>(res => { releaseSlow = res; }));

    header(el!).dispatchEvent(new CustomEvent('search-submit', {
      bubbles: true, composed: true, detail: { query: '111' },
    }));
    await lookup(el!, '');

    releaseSlow(slow);
    for (let i = 0; i < 8; i++) await Promise.resolve();
    await el!.updateComplete;
    expect(map(el!).selectedOccIds).toBeNull();
    expect(header(el!).searchStatus).toBeNull();
  });

  test('an empty submission is a no-op, not a miss', async () => {
    await lookup(el!, '   ');
    expect(mockLookup).not.toHaveBeenCalled();
    expect(header(el!).searchStatus).toBeNull();
  });
});
