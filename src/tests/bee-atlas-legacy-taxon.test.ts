// Regression: a /?taxon=<name>&taxonRank=<rank> (legacy species-page link) must not
// strand the URL at ?x=&y=&z= while the taxon name resolves to a taxon_id async, and
// must not flash unfiltered dots. Behavioral (not source-grep): exercises the real
// _replaceUrlState / _resolveLegacyTaxon logic on a component instance.
import { test, expect, describe, vi, beforeEach } from 'vitest';

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

  test('_replaceUrlState is suppressed while a legacy taxon is pending (URL keeps the taxon)', async () => {
    const el = await makeAtlas();
    el._pendingLegacyTaxon = { name: 'habropoda miserabilis', rank: 'species' };
    el._replaceUrlState();
    // Suppressed: the original legacy URL is preserved, NOT rewritten to ?x=&y=&z=.
    expect(window.location.search).toContain('taxon=Habropoda');
    expect(window.location.search).not.toMatch(/^\?x=/);
  });

  test('map settling (_pushUrlStateDebounced) does not drop the pending taxon', async () => {
    const el = await makeAtlas();
    el._pendingLegacyTaxon = { name: 'habropoda miserabilis', rank: 'species' };
    el._pushUrlStateDebounced();
    expect(window.location.search).toContain('taxon=Habropoda');
  });

  test('once resolved, _replaceUrlState writes the canonical integer taxon=', async () => {
    const el = await makeAtlas();
    // Resolution clears the pending marker and sets the integer taxonId.
    el._pendingLegacyTaxon = null;
    el._filterState = { ...DEFAULT_FILTER, taxonId: 307633 };
    el._replaceUrlState();
    expect(window.location.search).toContain('taxon=307633');
  });

  test('_resolveLegacyTaxon resolves name+rank to taxonId, runs the filter, and writes the URL', async () => {
    const el = await makeAtlas();
    el._taxonCache = new Map([
      [307633, { rank: 'species', name: 'habropoda miserabilis', lineagePath: '/1/307633/' }],
      [999, { rank: 'genus', name: 'habropoda', lineagePath: '/1/999/' }],
    ]);
    const ran = vi.spyOn(el, '_runFilterQuery').mockImplementation(() => Promise.resolve());
    el._pendingLegacyTaxon = { name: 'habropoda miserabilis', rank: 'species' };

    el._resolveLegacyTaxon({ name: 'habropoda miserabilis', rank: 'species' });

    expect(el._filterState.taxonId).toBe(307633);
    expect(el._pendingLegacyTaxon).toBeNull();
    expect(ran).toHaveBeenCalled();
  });

  test('_resolveLegacyTaxon no-match clears the hide-all guard (full set renders, not empty)', async () => {
    const el = await makeAtlas();
    el._taxonCache = new Map([[999, { rank: 'genus', name: 'bombus', lineagePath: '/1/999/' }]]);
    // firstUpdated would have hidden all while pending:
    el._filteredGeoJSON = { type: 'FeatureCollection', features: [] };
    el._visibleIds = new Set();
    el._pendingLegacyTaxon = { name: 'no such name', rank: 'species' };

    el._resolveLegacyTaxon({ name: 'no such name', rank: 'species' });

    expect(el._filterState.taxonId).toBeNull();
    expect(el._filteredGeoJSON).toBeNull(); // show-all, not an empty map
    expect(el._visibleIds).toBeNull();
  });
});
