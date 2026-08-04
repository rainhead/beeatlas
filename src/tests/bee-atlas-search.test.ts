// beeatlas-8zs / beeatlas-v66 — <bee-atlas> answers a search submitted from the
// header with a SELECTION.
//
// A dedicated file (not an addition to bee-atlas.test.ts) because full-DOM mounting
// of <bee-atlas> needs an inert <bee-map> stub, which would conflict with that file's
// ARCH-02 assertions on the REAL BeeMap class — the sibling pattern already used by
// cache-state.test.ts and bee-atlas-auth.test.ts.
import { test, expect, describe, vi, beforeEach, afterEach } from 'vitest';
import { emptyFilterState, type CatalogLookupResult, type OccurrenceRow } from '../filter.ts';
import { buildSearchIndex } from '../search.ts';

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

vi.mock('maplibre-gl/dist/maplibre-gl.css?raw', () => ({ default: '' }));

vi.mock('../auth-client.ts', () => ({
  fetchWhoami: vi.fn(() => Promise.resolve({ authenticated: false, verified: true })),
  startSignIn: vi.fn(),
  signOut: vi.fn(),
  loadLastKnownIdentity: vi.fn(() => ({ authenticated: false, verified: false })),
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
    fitBounds: { west: number; south: number; east: number; north: number } | null = null;
    filterState: unknown = null;
    requestUserLocation() { /* inert */ }
  }
  return { BeeMap: BeeMapStub };
});

// The lookup itself is exercised for real in catalog-lookup.test.ts; here it is a
// seam, so each case can state exactly what the DB answered.
const mockLookup = vi.fn<(suffix: string, f: unknown) => Promise<CatalogLookupResult>>();
// The map query keeps its REAL implementation unless a case opts out. Only the
// camera-fit cases need to say what is on the map; everything else would rather the
// default path stayed untouched.
let geoOverride: (() => Promise<unknown>) | null = null;
vi.mock('../filter.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../filter.ts')>();
  return {
    ...actual,
    lookupByCatalogSuffix: (suffix: string, f: unknown) => mockLookup(suffix, f),
    queryVisibleGeoJSON: (f: unknown) =>
      geoOverride ? geoOverride() : actual.queryVisibleGeoJSON(f as never),
  };
});

/** A map query answering with points at the given [lon, lat] pairs. */
function pointsAt(coords: [number, number][]) {
  return async () => ({
    geojson: {
      type: 'FeatureCollection',
      features: coords.map(([lon, lat], i) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: { occId: `ecdysis:${i}`, recencyTier: 'earlier', tier: 'atlas' },
      })),
    },
    ids: new Set(coords.map((_, i) => `ecdysis:${i}`)),
    rowCount: coords.length,
  });
}

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
    searchStatus: { query: string; kind: 'hit' | 'miss' | 'error' } | null;
  };
}

function map(atlas: AtlasEl) {
  return atlas.shadowRoot.querySelector('bee-map') as HTMLElement & {
    selectedOccIds: Set<string> | null;
    viewState: { lon: number; lat: number; zoom: number } | null;
    filterState: ReturnType<typeof emptyFilterState>;
    boundaryMode: string;
    fitBounds: { west: number; south: number; east: number; north: number } | null;
  };
}

/**
 * Search the way <bee-header> does: ask for a ranking, then pick the top row.
 *
 * Deliberately the real two-event flow rather than a shortcut into the handler —
 * "Enter picks the first candidate" is the contract the header implements, and a
 * test that skipped the ranking could not catch a query that ranks to nothing.
 */
/**
 * Start a search but do NOT drain the microtasks — leaves the lookup in flight.
 *
 * ASSERTS that the query produced a candidate. Without that, a query which ranked to
 * nothing would quietly start no lookup at all, and every stale-guard case below
 * would pass by testing nothing: "the abandoned lookup must not select" is trivially
 * true when no lookup was ever abandoned.
 */
async function lookupNoSettle(atlas: AtlasEl, query: string) {
  const el = header(atlas);
  el.dispatchEvent(new CustomEvent('search-query', {
    bubbles: true, composed: true, detail: { query: query.trim() },
  }));
  await atlas.updateComplete;
  const candidate = (atlas as unknown as { _searchCandidates: unknown[] })._searchCandidates[0];
  expect(candidate, `"${query}" must rank to a candidate, or nothing goes in flight`).toBeDefined();
  el.dispatchEvent(new CustomEvent('search-pick', {
    bubbles: true, composed: true, detail: { candidate, query: query.trim() },
  }));
}

async function lookup(atlas: AtlasEl, query: string) {
  const el = header(atlas);
  el.dispatchEvent(new CustomEvent('search-query', {
    bubbles: true, composed: true, detail: { query: query.trim() },
  }));
  await atlas.updateComplete;
  const candidate = (atlas as unknown as { _searchCandidates: unknown[] })._searchCandidates[0];
  if (candidate !== undefined) {
    el.dispatchEvent(new CustomEvent('search-pick', {
      bubbles: true, composed: true, detail: { candidate, query: query.trim() },
    }));
  }
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await atlas.updateComplete;
}

beforeEach(async () => {
  mockLookup.mockReset();
  geoOverride = null;
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

    await lookupNoSettle(el!, '111');
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

    await lookupNoSettle(el!, '111');
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

    await lookupNoSettle(el!, '111');
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

// --- beeatlas-7nx.5 — a search result that names a VIEW ----------------------
//
// The counterpart to everything above. A label number resolves a RECORD, so it
// selects and the filter yields; a taxon, person, place, county or ecoregion names
// a SET, so it sets one filter dimension and leaves the rest alone (ADR 0028).
//
// The index is seeded directly: building it for real needs four async loaders and a
// populated DB, none of which is what these cases are about. Ranking itself is
// covered exhaustively in search.test.ts.
describe('a search result that names a view filters instead of selecting', () => {
  const COLLECTOR = { displayName: 'Roe, J.', recordedBy: 'Roe, J.', host_inat_login: 'beequeen' };

  function seedIndex(atlas: AtlasEl) {
    const holder = atlas as unknown as { _searchIndex: unknown };
    holder._searchIndex = buildSearchIndex({
      taxa: [{ taxonId: 42, name: 'Bombus', label: 'Bombus (genus)', rank: 'genus', weight: 4182, href: '/species/Bombus/' }],
      people: [{ collector: COLLECTOR, weight: 40, href: null }],
      places: [{ slug: 'asotin-creek-wildlife-area', name: 'Asotin Creek', landOwner: 'WDFW', weight: 148, href: '/places/asotin-creek-wildlife-area.html' }],
      counties: [{ name: 'King', weight: 900 }, { name: 'Whatcom', weight: 300 }],
      ecoregions: [{ name: 'Puget Lowland', weight: 500 }],
    });
  }

  beforeEach(() => seedIndex(el!));

  test('a taxon name sets the taxon filter and selects nothing', async () => {
    await lookup(el!, 'Bombus');
    expect(pane(el!).filterState.taxonId).toBe(42);
    expect(map(el!).selectedOccIds, 'a view is not a selection').toBeNull();
    expect(mockLookup, 'a name must never reach the catalog lookup').not.toHaveBeenCalled();
  });

  test('the chip is spelled the way the pane spells it', async () => {
    // Same label scheme as the autocomplete (buildTaxonLabel), so a chip from search
    // and a chip from the filter panel are indistinguishable.
    await lookup(el!, 'Bombus');
    expect(pane(el!).filterState.taxonDisplayName).toBe('Bombus (genus)');
  });

  test('a hit is reported, so the header can close its popover', async () => {
    await lookup(el!, 'Bombus');
    expect(header(el!).searchStatus).toEqual({ query: 'Bombus', kind: 'hit' });
  });

  test('a search COMPOSES — every dimension it did not name survives', async () => {
    const p = pane(el!);
    p.dispatchEvent(new CustomEvent('filter-changed', {
      bubbles: true, composed: true,
      detail: { ...emptyFilterState(), yearFrom: 2024, yearTo: 2024, selectedCounties: new Set(['Whatcom']) },
    }));
    await el!.updateComplete;

    await lookup(el!, 'Bombus');
    const f = pane(el!).filterState;
    expect(f.taxonId).toBe(42);
    expect(f.yearFrom, 'the year filter must survive a taxon search').toBe(2024);
    expect([...f.selectedCounties], 'an unnamed dimension is untouched').toEqual(['Whatcom']);
  });

  test('a search REPLACES the dimension it names', async () => {
    await lookup(el!, 'Whatcom');
    expect([...pane(el!).filterState.selectedCounties]).toEqual(['Whatcom']);
    await lookup(el!, 'King');
    expect([...pane(el!).filterState.selectedCounties], 'the second county, not both').toEqual(['King']);
  });

  test('a place sets the place filter, never bounds', async () => {
    await lookup(el!, 'Asotin Creek');
    expect(pane(el!).filterState.selectedPlace).toBe('asotin-creek-wildlife-area');
    expect(pane(el!).filterState.bounds, 'a place is a membership, not a box').toBeNull();
  });

  test('a person sets the collector filter', async () => {
    await lookup(el!, 'beequeen');
    expect(pane(el!).filterState.selectedCollectors).toEqual([COLLECTOR]);
  });

  test('a region search raises its boundary layer, as the filter panel does', async () => {
    await lookup(el!, 'King');
    expect(map(el!).boundaryMode).toBe('counties');
    await lookup(el!, 'Puget Lowland');
    expect(map(el!).boundaryMode).toBe('ecoregions');
    await lookup(el!, 'Asotin Creek');
    expect(map(el!).boundaryMode).toBe('places');
  });

  test('digits still mean a label number, whatever else is in the index', async () => {
    mockLookup.mockResolvedValue({ rows: [specimenRow()], hiddenByFilter: false });
    await lookup(el!, '2303966');
    expect(mockLookup).toHaveBeenCalledOnce();
    expect(pane(el!).filterState.taxonId, 'no view was applied').toBeNull();
  });

  test('a name nothing answers to is still a miss', async () => {
    await lookup(el!, 'Zzzzz');
    expect(header(el!).searchStatus).toEqual({ query: 'Zzzzz', kind: 'miss' });
    expect(pane(el!).filterState.taxonId).toBeNull();
  });
});

// --- beeatlas-7nx.1 — framing what the search found --------------------------
describe('a search frames its answer; the filter panel never does', () => {
  function seedIndex(atlas: AtlasEl) {
    (atlas as unknown as { _searchIndex: unknown })._searchIndex = buildSearchIndex({
      taxa: [{ taxonId: 42, name: 'Bombus', label: 'Bombus (genus)', rank: 'genus', weight: 4182, href: null }],
      people: [], places: [], counties: [{ name: 'King', weight: 9 }], ecoregions: [],
    });
  }
  beforeEach(() => seedIndex(el!));

  test('the camera is told the extent of what matched', async () => {
    geoOverride = pointsAt([[-122.3, 47.6], [-120.1, 46.2], [-121.0, 48.9]]);
    await lookup(el!, 'Bombus');
    expect(map(el!).fitBounds).toEqual({ west: -122.3, south: 46.2, east: -120.1, north: 48.9 });
  });

  test('one bad coordinate does not drag the camera off the answer (regression)', async () => {
    // A single iNat record in Arizona carries a Washington ecoregion, so a raw
    // min/max extent over that ecoregion's 4,676 records flew the camera to Nevada
    // at minimum zoom. Found by driving the app, not by a fixture.
    const wa: [number, number][] = Array.from({ length: 99 }, (_, i) => [-122 + (i % 10) * 0.4, 46 + (i % 10) * 0.2]);
    geoOverride = pointsAt([...wa, [-111.14, 33.28]]);
    await lookup(el!, 'Bombus');
    const fit = map(el!).fitBounds!;
    expect(fit.south, 'the Arizona outlier must not set the southern edge').toBeGreaterThan(40);
    expect(fit.east, 'nor the eastern one').toBeLessThan(-115);
  });

  test('a small result is framed exactly — nothing is trimmed off three records', async () => {
    // The trim is a COUNT that floors to zero under 50 points, so a handful of
    // records keeps its true extent rather than being clipped to its middle.
    geoOverride = pointsAt([[-122.3, 47.6], [-120.1, 46.2], [-121.0, 48.9]]);
    await lookup(el!, 'Bombus');
    expect(map(el!).fitBounds).toEqual({ west: -122.3, south: 46.2, east: -120.1, north: 48.9 });
  });

  test('a zero-match search leaves the viewport alone', async () => {
    // There is nothing to fly to, and a default view would cost the reader their
    // place in exchange for nothing.
    geoOverride = pointsAt([]);
    await lookup(el!, 'Bombus');
    expect(map(el!).fitBounds).toBeNull();
  });

  test('the same search twice frames twice', async () => {
    // fitBounds is a command, and Lit only notices a CHANGED property — an
    // identical extent must still be a new object or the second search silently
    // leaves a panned-away map where it is.
    geoOverride = pointsAt([[-122.3, 47.6]]);
    await lookup(el!, 'Bombus');
    const first = map(el!).fitBounds;
    await lookup(el!, 'Bombus');
    expect(map(el!).fitBounds).toEqual(first);
    expect(map(el!).fitBounds).not.toBe(first);
  });

  test('the FILTER PANEL does not move the camera', async () => {
    // The whole distinction ADR 0028 draws: search is a way into the data, the
    // panel refines a view you already have.
    geoOverride = pointsAt([[-122.3, 47.6], [-120.1, 46.2]]);
    pane(el!).dispatchEvent(new CustomEvent('filter-changed', {
      bubbles: true, composed: true,
      detail: { ...emptyFilterState(), selectedCounties: new Set(['King']) },
    }));
    for (let i = 0; i < 8; i++) await Promise.resolve();
    await el!.updateComplete;
    expect(map(el!).fitBounds).toBeNull();
  });

  test('a superseded search abandons its fit with it', async () => {
    // The intent is captured per-call and cleared at once. Read after the await, a
    // superseded query's intent would survive its early return and fire on the next
    // filter change — framing a result nobody asked to see.
    geoOverride = pointsAt([[-122.3, 47.6]]);
    await lookup(el!, 'Bombus');
    const framed = map(el!).fitBounds;

    geoOverride = pointsAt([[-119.0, 45.0], [-118.0, 49.0]]);
    pane(el!).dispatchEvent(new CustomEvent('filter-changed', {
      bubbles: true, composed: true,
      detail: { ...emptyFilterState(), selectedCounties: new Set(['King']) },
    }));
    for (let i = 0; i < 8; i++) await Promise.resolve();
    await el!.updateComplete;
    expect(map(el!).fitBounds, 'the panel change must not inherit the search fit').toBe(framed);
  });

  test('a label number still recentres rather than fitting', async () => {
    // ADR 0020 owns that path; it lands on ONE record and knows its zoom.
    mockLookup.mockResolvedValue({ rows: [specimenRow()], hiddenByFilter: false });
    await lookup(el!, '2303966');
    expect(map(el!).viewState).toEqual({ lat: 47.6, lon: -122.3, zoom: 12 });
  });
});
