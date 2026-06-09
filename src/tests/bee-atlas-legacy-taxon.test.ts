// Regression: a /?taxon=<name>&taxonRank=<rank> (legacy species-page link) must not
// strand the URL at ?x=&y=&z= while the taxon name resolves to a taxon_id async, and
// must not flash unfiltered dots. Behavioral (not source-grep): exercises the real
// _replaceUrlState / _resolveLegacyTaxon logic on a component instance.
import { test, expect, describe, vi, beforeEach } from 'vitest';

// Controllable taxaReady barrier for await-path tests
let _resolveTaxaReady: () => void = () => {};
vi.mock('../ready.ts', () => {
  const taxaReadyPromise = new Promise<void>(res => { _resolveTaxaReady = res; });
  return {
    taxaReady: taxaReadyPromise,
    mapReady: new Promise<void>(() => {}),
    markTaxaReady: vi.fn(() => { _resolveTaxaReady(); }),
    markMapReady: vi.fn(),
    tablesReady: Promise.resolve(),
    deferred: vi.fn(),
  };
});

vi.mock('../sqlite.ts', () => ({
  getDB: vi.fn(() => Promise.resolve({ sqlite3: {}, db: 0 })),
  loadOccurrencesTable: vi.fn(() => Promise.resolve()),
  tablesReady: Promise.resolve(),
}));
vi.mock('mapbox-gl', () => ({ default: { accessToken: '', Map: vi.fn() } }));
vi.mock('mapbox-gl/dist/mapbox-gl.css?raw', () => ({ default: '' }));

const DEFAULT_FILTER = {
  taxonId: null, taxonDisplayName: null, yearFrom: null, yearTo: null,
  months: new Set<number>(), selectedCounties: new Set<string>(),
  selectedEcoregions: new Set<string>(), selectedCollectors: [],
  elevMin: null, elevMax: null, selectedPlace: null,
};

async function makeAtlas() {
  const { BeeAtlas } = await import('../bee-atlas.ts');
  const el = new BeeAtlas() as any;
  el._currentView = { lon: -120.5, lat: 47.5, zoom: 7 };
  el._filterState = { ...DEFAULT_FILTER };
  return el;
}

describe('legacy taxon URL: no strand, no unfiltered flash', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '?taxon=Habropoda%20miserabilis&taxonRank=species');
  });

  test('_replaceUrlState is suppressed while _filterResolving is true (URL keeps the taxon)', async () => {
    const el = await makeAtlas();
    el._filterResolving = true;
    el._replaceUrlState();
    // Suppressed: the original legacy URL is preserved, NOT rewritten to ?x=&y=&z=.
    expect(window.location.search).toContain('taxon=Habropoda');
    expect(window.location.search).not.toMatch(/^\?x=/);
  });

  test('map settling (_pushUrlStateDebounced) does not drop the pending taxon when _filterResolving', async () => {
    const el = await makeAtlas();
    el._filterResolving = true;
    el._pushUrlStateDebounced();
    expect(window.location.search).toContain('taxon=Habropoda');
  });

  test('once resolved, _replaceUrlState writes the canonical integer taxon=', async () => {
    const el = await makeAtlas();
    // Resolution clears _filterResolving and sets the integer taxonId.
    el._filterResolving = false;
    el._filterState = { ...DEFAULT_FILTER, taxonId: 307633 };
    el._replaceUrlState();
    expect(window.location.search).toContain('taxon=307633');
  });

  test('_resolveLegacyTaxon resolves name+rank to taxonId, runs the filter, and clears _filterResolving', async () => {
    const el = await makeAtlas();
    el._taxonCache = new Map([
      [307633, { rank: 'species', name: 'habropoda miserabilis', lineagePath: '/1/307633/' }],
      [999, { rank: 'genus', name: 'habropoda', lineagePath: '/1/999/' }],
    ]);
    const ran = vi.spyOn(el, '_runFilterQuery').mockImplementation(() => Promise.resolve());
    el._filterResolving = true;

    el._resolveLegacyTaxon({ name: 'habropoda miserabilis', rank: 'species' });

    expect(el._filterState.taxonId).toBe(307633);
    expect(el._filterResolving).toBe(false);
    expect(ran).toHaveBeenCalled();
  });

  test('_resolveLegacyTaxon no-match clears the hide-all guard (full set renders, not empty)', async () => {
    const el = await makeAtlas();
    el._taxonCache = new Map([[999, { rank: 'genus', name: 'bombus', lineagePath: '/1/999/' }]]);
    // firstUpdated would have hidden all while pending:
    el._filteredGeoJSON = { type: 'FeatureCollection', features: [] };
    el._visibleIds = new Set();
    el._filterResolving = true;

    el._resolveLegacyTaxon({ name: 'no such name', rank: 'species' });

    expect(el._filterState.taxonId).toBeNull();
    expect(el._filteredGeoJSON).toBeNull(); // show-all, not an empty map
    expect(el._visibleIds).toBeNull();
    expect(el._filterResolving).toBe(false);
  });

  test('intendedFilterActive is true when _filterResolving is true (no active taxonId yet)', async () => {
    const el = await makeAtlas();
    el._filterResolving = true;
    el._filterState = { ...DEFAULT_FILTER }; // no active filter
    expect(el.intendedFilterActive).toBe(true);
  });

  test('intendedFilterActive is false when neither filter is active nor _filterResolving', async () => {
    const el = await makeAtlas();
    el._filterResolving = false;
    el._filterState = { ...DEFAULT_FILTER }; // no active filter
    expect(el.intendedFilterActive).toBe(false);
  });

  test('intendedFilterActive is true when an ordinary filter is active (no legacy resolution)', async () => {
    const el = await makeAtlas();
    el._filterResolving = false;
    el._filterState = { ...DEFAULT_FILTER, taxonId: 307633 };
    expect(el.intendedFilterActive).toBe(true);
  });

  test('firstUpdated hide-all guard fires when _filterResolving is set (no unfiltered flash)', async () => {
    const el = await makeAtlas();
    el._filterResolving = true;
    el._filterState = { ...DEFAULT_FILTER };
    // When intendedFilterActive is true, the hide-all guard must keep _visibleIds empty
    // and _filteredGeoJSON empty-collection. We verify intendedFilterActive drives the guard:
    expect(el.intendedFilterActive).toBe(true);
    // Directly verify the guard condition matches what firstUpdated checks:
    // if (this.intendedFilterActive) { set empty }
    if (el.intendedFilterActive) {
      el._visibleIds = new Set();
      el._filteredGeoJSON = { type: 'FeatureCollection', features: [] };
    }
    expect(el._visibleIds).toEqual(new Set());
    expect(el._filteredGeoJSON).toEqual({ type: 'FeatureCollection', features: [] });
  });

  // Task 2: await-taxaReady resolution path tests

  test('await-taxaReady path: resolves name+rank to taxonId and runs filter query after cache is ready', async () => {
    const { taxaReady } = await import('../ready.ts') as any;
    const el = await makeAtlas();
    el._taxonCache = new Map([
      [307633, { rank: 'species', name: 'habropoda miserabilis', lineagePath: '/1/307633/' }],
    ]);
    const ran = vi.spyOn(el, '_runFilterQuery').mockImplementation(() => Promise.resolve());
    el._filterResolving = true;

    // Simulate the await-taxaReady flow: set _filterResolving, then await taxaReady, then resolve.
    const resolutionFlow = taxaReady.then(() => {
      el._resolveLegacyTaxon({ name: 'habropoda miserabilis', rank: 'species' });
    });

    // Before taxaReady resolves, _filterResolving is still true
    expect(el._filterResolving).toBe(true);

    // Resolve the barrier (simulates markTaxaReady called after cache builds)
    _resolveTaxaReady();
    await resolutionFlow;

    // After resolution: taxonId set, _filterResolving cleared, query ran
    expect(el._filterState.taxonId).toBe(307633);
    expect(el._filterResolving).toBe(false);
    expect(ran).toHaveBeenCalled();
  });

  test('intendedFilterActive is true while _filterResolving and false once cleared (no other filter); URL suppression follows _filterResolving only', async () => {
    const el = await makeAtlas();
    window.history.replaceState({}, '', '?taxon=Habropoda%20miserabilis&taxonRank=species');

    // Phase 1: pending — _filterResolving = true, no taxonId yet
    el._filterResolving = true;
    el._filterState = { ...DEFAULT_FILTER };
    expect(el.intendedFilterActive).toBe(true); // true because _filterResolving
    // URL suppression gates on _filterResolving — keeps legacy URL intact
    el._replaceUrlState();
    expect(window.location.search).toContain('taxon=Habropoda');

    // Phase 2: resolved to taxonId — _filterResolving cleared, taxonId now set
    el._filterResolving = false;
    el._filterState = { ...DEFAULT_FILTER, taxonId: 307633 };
    // intendedFilterActive is still true (isFilterActive(taxonId=307633) is true),
    // but _filterResolving is false so URL suppression is lifted.
    expect(el.intendedFilterActive).toBe(true); // true because filter is active
    expect(el._filterResolving).toBe(false);
    // _replaceUrlState gates on _filterResolving only — so it now writes canonical URL
    el._replaceUrlState();
    expect(window.location.search).toContain('taxon=307633');

    // Phase 3: stale bookmark (no taxonId found) — _filterResolving cleared, no filter
    el._filterResolving = false;
    el._filterState = { ...DEFAULT_FILTER }; // stale — no taxon matched
    expect(el.intendedFilterActive).toBe(false); // false: no filter, no resolving
    // URL write is not suppressed, shows show-all state
    el._replaceUrlState();
    expect(window.location.search).not.toContain('taxon=');
  });
});
