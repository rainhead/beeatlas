import { test, expect, describe } from 'vitest';
import { buildParams, parseParams } from '../url-state.ts';
import type { FilterState } from '../filter.ts';
import type { SelectionState } from '../url-state.ts';

function emptyFilter(): FilterState {
  return {
    taxonName: null,
    taxonRank: null,
    yearFrom: null,
    yearTo: null,
    months: new Set(),
    selectedCounties: new Set(),
    selectedEcoregions: new Set(),
    selectedCollectors: [],
    elevMin: null,
    elevMax: null,
  };
}

const defaultView = { lon: -120.5, lat: 47.3, zoom: 8 };
const defaultSelection: SelectionState = { type: 'ids', ids: [] };
const defaultUi = { layerMode: 'specimens' as const, boundaryMode: 'off' as const, viewMode: 'map' as const };

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
    const selection: SelectionState = { type: 'ids', ids: ['ecdysis:123', 'ecdysis:456'] };
    const params = buildParams(defaultView, emptyFilter(), selection, defaultUi);
    expect(params.get('o')).toBe('ecdysis:123,ecdysis:456');
    const result = parseParams(params.toString());
    expect(result.selection).toEqual({ type: 'ids', ids: ['ecdysis:123', 'ecdysis:456'] });
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

  test('inat: prefixed single ID round-trips (D-05)', () => {
    const selection: SelectionState = { type: 'ids', ids: ['inat:5678'] };
    const params = buildParams(defaultView, emptyFilter(), selection, defaultUi);
    expect(params.get('o')).toBe('inat:5678');
    const result = parseParams(params.toString());
    expect(result.selection).toEqual({ type: 'ids', ids: ['inat:5678'] });
  });

  test('mixed ecdysis+inat IDs round-trip (D-05)', () => {
    const selection: SelectionState = { type: 'ids', ids: ['ecdysis:123', 'inat:456'] };
    const params = buildParams(defaultView, emptyFilter(), selection, defaultUi);
    expect(params.get('o')).toBe('ecdysis:123,inat:456');
    const result = parseParams(params.toString());
    expect(result.selection).toEqual({ type: 'ids', ids: ['ecdysis:123', 'inat:456'] });
  });

  test('cluster centroid encodes as @lon,lat,r (D-06)', () => {
    const selection: SelectionState = { type: 'cluster', lon: -120.5123, lat: 47.4567, radiusM: 312 };
    const params = buildParams(defaultView, emptyFilter(), selection, defaultUi);
    expect(params.get('o')).toBe('@-120.5123,47.4567,312');
    const result = parseParams(params.toString());
    expect(result.selection).toEqual({ type: 'cluster', lon: -120.5123, lat: 47.4567, radiusM: 312 });
  });

  test('cluster with fractional radiusM rounds up (D-06)', () => {
    const selection: SelectionState = { type: 'cluster', lon: -120.0, lat: 47.0, radiusM: 100.7 };
    const params = buildParams(defaultView, emptyFilter(), selection, defaultUi);
    expect(params.get('o')).toBe('@-120.0000,47.0000,101');
  });

  test('invalid @lon,lat,r with out-of-range lon: selection undefined', () => {
    const result = parseParams('o=@999,47,100');
    expect(result.selection).toBeUndefined();
  });

  test('invalid @lon,lat,r with out-of-range lat: selection undefined', () => {
    const result = parseParams('o=@-120,999,100');
    expect(result.selection).toBeUndefined();
  });

  test('invalid @lon,lat,r with negative radiusM: selection undefined', () => {
    const result = parseParams('o=@-120,47,-5');
    expect(result.selection).toBeUndefined();
  });

  test('empty ids selection: o param absent', () => {
    const selection: SelectionState = { type: 'ids', ids: [] };
    const params = buildParams(defaultView, emptyFilter(), selection, defaultUi);
    expect(params.has('o')).toBe(false);
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
      selectedCollectors: [],
      elevMin: null,
      elevMax: null,
    };
    const selection: SelectionState = { type: 'ids', ids: ['ecdysis:999'] };
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

    expect(result.selection).toEqual({ type: 'ids', ids: ['ecdysis:999'] });

    expect(result.ui!.layerMode).toBe('samples');
    expect(result.ui!.boundaryMode).toBe('counties');
    expect(result.ui!.viewMode).toBe('table');

    expect(result.filter!.elevMin).toBeNull();
    expect(result.filter!.elevMax).toBeNull();
  });
});

describe('elevation param round-trip', () => {
  test('elevMin: round-trips as elev_min', () => {
    const filter = { ...emptyFilter(), elevMin: 500 };
    const params = buildParams(defaultView, filter, defaultSelection, defaultUi);
    expect(params.get('elev_min')).toBe('500');
    const result = parseParams(params.toString());
    expect(result.filter?.elevMin).toBe(500);
  });

  test('elevMax: round-trips as elev_max', () => {
    const filter = { ...emptyFilter(), elevMax: 1500 };
    const params = buildParams(defaultView, filter, defaultSelection, defaultUi);
    expect(params.get('elev_max')).toBe('1500');
    const result = parseParams(params.toString());
    expect(result.filter?.elevMax).toBe(1500);
  });

  test('both set: both params present and round-trip', () => {
    const filter = { ...emptyFilter(), elevMin: 500, elevMax: 1500 };
    const params = buildParams(defaultView, filter, defaultSelection, defaultUi);
    expect(params.get('elev_min')).toBe('500');
    expect(params.get('elev_max')).toBe('1500');
    const result = parseParams(params.toString());
    expect(result.filter?.elevMin).toBe(500);
    expect(result.filter?.elevMax).toBe(1500);
  });

  test('neither set: elev_min and elev_max params absent', () => {
    const params = buildParams(defaultView, emptyFilter(), defaultSelection, defaultUi);
    expect(params.has('elev_min')).toBe(false);
    expect(params.has('elev_max')).toBe(false);
  });

  test('invalid elev_min (non-numeric): parses to null', () => {
    const result = parseParams('elev_min=abc');
    expect(result.filter?.elevMin ?? null).toBeNull();
  });

  test('elevMin alone triggers hasFilter: result.filter is defined', () => {
    const result = parseParams('elev_min=500');
    expect(result.filter).toBeDefined();
    expect(result.filter!.elevMin).toBe(500);
    expect(result.filter!.elevMax).toBeNull();
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
