import { test, expect, describe } from 'vitest';
import { buildParams, parseParams } from '../url-state.ts';
import type { FilterState } from '../filter.ts';

function emptyFilter(): FilterState {
  return {
    taxonName: null,
    taxonRank: null,
    yearFrom: null,
    yearTo: null,
    months: new Set(),
    selectedCounties: new Set(),
    selectedEcoregions: new Set(),
  };
}

const defaultView = { lon: -120.5, lat: 47.3, zoom: 8 };
const defaultSelection = { occurrenceIds: [] as string[] };
const defaultUi = { layerMode: 'specimens' as const, boundaryMode: 'off' as const, viewMode: 'map' as const, sortColumn: 'year' as const, sortDir: 'desc' as const };

describe('buildParams -> parseParams round-trip', () => {
  test('view: lon/lat/zoom round-trips within toFixed precision', () => {
    const view = { lon: -120.5, lat: 47.3, zoom: 8 };
    const params = buildParams(view, emptyFilter(), defaultSelection, defaultUi);
    const result = parseParams(params.toString());
    expect(result.view).toBeDefined();
    expect(result.view!.lon).toBeCloseTo(-120.5, 4);
    expect(result.view!.lat).toBeCloseTo(47.3, 4);
    expect(result.view!.zoom).toBeCloseTo(8, 2);
  });

  test('taxon+rank: genus round-trips', () => {
    const filter = { ...emptyFilter(), taxonName: 'Bombus', taxonRank: 'genus' as const };
    const params = buildParams(defaultView, filter, defaultSelection, defaultUi);
    expect(params.get('taxon')).toBe('Bombus');
    expect(params.get('taxonRank')).toBe('genus');
    const result = parseParams(params.toString());
    expect(result.filter?.taxonName).toBe('Bombus');
    expect(result.filter?.taxonRank).toBe('genus');
  });

  test('yearFrom: round-trips as yr0', () => {
    const filter = { ...emptyFilter(), yearFrom: 2020 };
    const params = buildParams(defaultView, filter, defaultSelection, defaultUi);
    expect(params.get('yr0')).toBe('2020');
    const result = parseParams(params.toString());
    expect(result.filter?.yearFrom).toBe(2020);
  });

  test('yearTo: round-trips as yr1', () => {
    const filter = { ...emptyFilter(), yearTo: 2023 };
    const params = buildParams(defaultView, filter, defaultSelection, defaultUi);
    expect(params.get('yr1')).toBe('2023');
    const result = parseParams(params.toString());
    expect(result.filter?.yearTo).toBe(2023);
  });

  test('months: round-trips sorted', () => {
    const filter = { ...emptyFilter(), months: new Set([3, 7, 11]) };
    const params = buildParams(defaultView, filter, defaultSelection, defaultUi);
    expect(params.get('months')).toBe('3,7,11');
    const result = parseParams(params.toString());
    expect(result.filter?.months).toEqual(new Set([3, 7, 11]));
  });

  test('occurrenceIds: round-trips comma-separated', () => {
    const selection = { occurrenceIds: ['ecdysis:123', 'ecdysis:456'] };
    const params = buildParams(defaultView, emptyFilter(), selection, defaultUi);
    expect(params.get('o')).toBe('ecdysis:123,ecdysis:456');
    const result = parseParams(params.toString());
    expect(result.selection?.occurrenceIds).toEqual(['ecdysis:123', 'ecdysis:456']);
  });

  test('layerMode=samples: serialized as lm=samples', () => {
    const ui = { layerMode: 'samples' as const, boundaryMode: 'off' as const, viewMode: 'map' as const };
    const params = buildParams(defaultView, emptyFilter(), defaultSelection, ui);
    expect(params.get('lm')).toBe('samples');
    const result = parseParams(params.toString());
    expect(result.ui?.layerMode).toBe('samples');
  });

  test('layerMode=specimens (default): lm param is absent', () => {
    const params = buildParams(defaultView, emptyFilter(), defaultSelection, defaultUi);
    expect(params.has('lm')).toBe(false);
  });

  test('boundaryMode=counties: serialized as bm=counties', () => {
    const ui = { layerMode: 'specimens' as const, boundaryMode: 'counties' as const, viewMode: 'map' as const };
    const params = buildParams(defaultView, emptyFilter(), defaultSelection, ui);
    expect(params.get('bm')).toBe('counties');
    const result = parseParams(params.toString());
    expect(result.ui?.boundaryMode).toBe('counties');
  });

  test('boundaryMode=off (default): bm param is absent', () => {
    const params = buildParams(defaultView, emptyFilter(), defaultSelection, defaultUi);
    expect(params.has('bm')).toBe(false);
  });

  test('viewMode=table: serialized as view=table', () => {
    const ui = { layerMode: 'specimens' as const, boundaryMode: 'off' as const, viewMode: 'table' as const };
    const params = buildParams(defaultView, emptyFilter(), defaultSelection, ui);
    expect(params.get('view')).toBe('table');
    const result = parseParams(params.toString());
    expect(result.ui?.viewMode).toBe('table');
  });

  test('viewMode=map (default): view param is absent', () => {
    const params = buildParams(defaultView, emptyFilter(), defaultSelection, defaultUi);
    expect(params.has('view')).toBe(false);
  });

  test('selectedCounties: round-trips as counties param', () => {
    const filter = { ...emptyFilter(), selectedCounties: new Set(['King', 'Pierce']) };
    const params = buildParams(defaultView, filter, defaultSelection, defaultUi);
    const result = parseParams(params.toString());
    expect(result.filter?.selectedCounties).toEqual(new Set(['King', 'Pierce']));
  });

  test('selectedEcoregions: round-trips as ecor param', () => {
    const filter = { ...emptyFilter(), selectedEcoregions: new Set(['Cascades']) };
    const params = buildParams(defaultView, filter, defaultSelection, defaultUi);
    const result = parseParams(params.toString());
    expect(result.filter?.selectedEcoregions).toEqual(new Set(['Cascades']));
  });
});

describe('combined round-trip', () => {
  test('all fields set simultaneously preserve all values', () => {
    const view = { lon: -120.5, lat: 47.3, zoom: 8 };
    const filter: FilterState = {
      taxonName: 'Bombus',
      taxonRank: 'genus',
      yearFrom: 2020,
      yearTo: 2023,
      months: new Set([3, 6, 9]),
      selectedCounties: new Set(['King', 'Pierce']),
      selectedEcoregions: new Set(['Cascades']),
    };
    const selection = { occurrenceIds: ['ecdysis:999'] };
    const ui = { layerMode: 'samples' as const, boundaryMode: 'counties' as const, viewMode: 'table' as const };

    const params = buildParams(view, filter, selection, ui);
    const result = parseParams(params.toString());

    expect(result.view!.lon).toBeCloseTo(-120.5, 4);
    expect(result.view!.lat).toBeCloseTo(47.3, 4);
    expect(result.view!.zoom).toBeCloseTo(8, 2);

    expect(result.filter!.taxonName).toBe('Bombus');
    expect(result.filter!.taxonRank).toBe('genus');
    expect(result.filter!.yearFrom).toBe(2020);
    expect(result.filter!.yearTo).toBe(2023);
    expect(result.filter!.months).toEqual(new Set([3, 6, 9]));
    expect(result.filter!.selectedCounties).toEqual(new Set(['King', 'Pierce']));
    expect(result.filter!.selectedEcoregions).toEqual(new Set(['Cascades']));

    expect(result.selection!.occurrenceIds).toEqual(['ecdysis:999']);

    expect(result.ui!.layerMode).toBe('samples');
    expect(result.ui!.boundaryMode).toBe('counties');
    expect(result.ui!.viewMode).toBe('table');
  });
});

describe('validation and rejection', () => {
  test('invalid lon (x=999): result.view is undefined', () => {
    const result = parseParams('x=999&y=47&z=8');
    expect(result.view).toBeUndefined();
  });

  test('invalid lat (y=999): result.view is undefined', () => {
    const result = parseParams('x=-120&y=999&z=8');
    expect(result.view).toBeUndefined();
  });

  test('invalid zoom (z=50): result.view is undefined', () => {
    const result = parseParams('x=-120&y=47&z=50');
    expect(result.view).toBeUndefined();
  });

  test('taxon without taxonRank: result.filter is undefined (no valid filter fields)', () => {
    const result = parseParams('taxon=Bombus');
    expect(result.filter).toBeUndefined();
  });

  test('out-of-range months (0 and 13): only valid month 7 survives', () => {
    const result = parseParams('months=0,7,13');
    expect(result.filter!.months).toEqual(new Set([7]));
  });

  test('empty view params: result.view is undefined', () => {
    const result = parseParams('');
    expect(result.view).toBeUndefined();
  });

  test('taxonRank without taxon: taxonName absent from filter', () => {
    const result = parseParams('taxonRank=genus&yr0=2020');
    // taxon absent but yearFrom is present so filter object exists
    expect(result.filter?.taxonName).toBeNull();
    expect(result.filter?.taxonRank).toBeNull();
    expect(result.filter?.yearFrom).toBe(2020);
  });

  test('invalid view param (view=grid): viewMode defaults to map', () => {
    const result = parseParams('view=grid');
    // result.ui may be undefined (all defaults) — viewMode is map in both cases
    expect(result.ui?.viewMode ?? 'map').toBe('map');
  });

  test('view=table with no lm/bm: result.ui is defined with viewMode=table', () => {
    const result = parseParams('view=table');
    expect(result.ui).toBeDefined();
    expect(result.ui!.viewMode).toBe('table');
  });
});

describe('sort param round-trip', () => {
  test('default sort (year/desc): sort and dir params are absent', () => {
    const params = buildParams(defaultView, emptyFilter(), defaultSelection, defaultUi);
    expect(params.has('sort')).toBe(false);
    expect(params.has('dir')).toBe(false);
  });

  test('non-default sortColumn: sort param is included', () => {
    const ui = { ...defaultUi, sortColumn: 'species' };
    const params = buildParams(defaultView, emptyFilter(), defaultSelection, ui);
    expect(params.get('sort')).toBe('species');
  });

  test('non-default sortDir=asc: dir param is included', () => {
    const ui = { ...defaultUi, sortDir: 'asc' as const };
    const params = buildParams(defaultView, emptyFilter(), defaultSelection, ui);
    expect(params.get('dir')).toBe('asc');
  });

  test('both non-default: sort=county&dir=asc both present', () => {
    const ui = { ...defaultUi, sortColumn: 'county', sortDir: 'asc' as const };
    const params = buildParams(defaultView, emptyFilter(), defaultSelection, ui);
    expect(params.get('sort')).toBe('county');
    expect(params.get('dir')).toBe('asc');
  });

  test('parseParams with no sort/dir: returns sortColumn=year, sortDir=desc (defaults)', () => {
    const result = parseParams('');
    expect(result.ui?.sortColumn ?? 'year').toBe('year');
    expect(result.ui?.sortDir ?? 'desc').toBe('desc');
  });

  test('parseParams with sort=species&dir=asc: returns correct values', () => {
    const result = parseParams('sort=species&dir=asc');
    expect(result.ui).toBeDefined();
    expect(result.ui!.sortColumn).toBe('species');
    expect(result.ui!.sortDir).toBe('asc');
  });

  test('parseParams with invalid dir value: sortDir falls back to desc', () => {
    const result = parseParams('sort=county&dir=invalid');
    expect(result.ui!.sortDir).toBe('desc');
  });

  test('round-trip: buildParams -> parseParams preserves non-default sort state', () => {
    const ui = { ...defaultUi, sortColumn: 'collector', sortDir: 'asc' as const };
    const params = buildParams(defaultView, emptyFilter(), defaultSelection, ui);
    const result = parseParams(params.toString());
    expect(result.ui!.sortColumn).toBe('collector');
    expect(result.ui!.sortDir).toBe('asc');
  });
});
