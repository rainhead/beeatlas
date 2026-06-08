import { test, expect, describe } from 'vitest';
import { buildParams, parseParams } from '../url-state.ts';
import type { FilterState } from '../filter.ts';
import type { SelectionState, ParsedParams } from '../url-state.ts';

function emptyFilter(): FilterState {
  return {
    taxonId: null,
    taxonDisplayName: null,
    yearFrom: null,
    yearTo: null,
    months: new Set(),
    selectedCounties: new Set(),
    selectedEcoregions: new Set(),
    selectedCollectors: [],
    elevMin: null,
    elevMax: null,
    selectedPlace: null,
  };
}

const defaultView = { lon: -120.5, lat: 47.3, zoom: 8 };
const defaultSelection: SelectionState = { type: 'ids', ids: [] };
const defaultUi = { boundaryMode: 'off' as const, paneState: 'collapsed' as const };

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

  test('taxon: integer taxonId round-trips as taxon= param', () => {
    const filter = { ...emptyFilter(), taxonId: 52775, taxonDisplayName: 'Bombus (genus)' };
    const params = buildParams(defaultView, filter, defaultSelection, defaultUi);
    expect(params.get('taxon')).toBe('52775');
    expect(params.has('taxonRank')).toBe(false);
    const result = parseParams(params.toString());
    expect(result.filter?.taxonId).toBe(52775);
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

  test('boundaryMode=counties: serialized as bm=counties', () => {
    const ui = { boundaryMode: 'counties' as const, paneState: 'collapsed' as const };
    const params = buildParams(defaultView, emptyFilter(), defaultSelection, ui);
    expect(params.get('bm')).toBe('counties');
    const result = parseParams(params.toString());
    expect(result.ui?.boundaryMode).toBe('counties');
  });

  test('boundaryMode=off (default): bm param is absent', () => {
    const params = buildParams(defaultView, emptyFilter(), defaultSelection, defaultUi);
    expect(params.has('bm')).toBe(false);
  });

  test('paneState=table: serialized as pane=table', () => {
    const ui = { boundaryMode: 'off' as const, paneState: 'table' as const };
    const params = buildParams(defaultView, emptyFilter(), defaultSelection, ui);
    expect(params.get('pane')).toBe('table');
    const result = parseParams(params.toString());
    expect(result.ui?.paneState).toBe('table');
  });

  test('paneState=collapsed (default): pane param is absent', () => {
    const params = buildParams(defaultView, emptyFilter(), defaultSelection, defaultUi);
    expect(params.has('pane')).toBe(false);
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

  test('inat_obs: prefixed single ID round-trips', () => {
    const selection: SelectionState = { type: 'ids', ids: ['inat_obs:13098974'] };
    const params = buildParams(defaultView, emptyFilter(), selection, defaultUi);
    expect(params.get('o')).toBe('inat_obs:13098974');
    const result = parseParams(params.toString());
    expect(result.selection).toEqual({ type: 'ids', ids: ['inat_obs:13098974'] });
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
      taxonId: 52775,
      taxonDisplayName: 'Bombus (genus)',
      yearFrom: 2020,
      yearTo: 2023,
      months: new Set([3, 6, 9]),
      selectedCounties: new Set(['King', 'Pierce']),
      selectedEcoregions: new Set(['Cascades']),
      selectedCollectors: [],
      elevMin: null,
      elevMax: null,
      selectedPlace: null,
    };
    const selection: SelectionState = { type: 'ids', ids: ['ecdysis:999'] };
    const ui = { boundaryMode: 'counties' as const, paneState: 'table' as const };

    const params = buildParams(view, filter, selection, ui);
    const result = parseParams(params.toString());

    expect(result.view!.lon).toBeCloseTo(-120.5, 4);
    expect(result.view!.lat).toBeCloseTo(47.3, 4);
    expect(result.view!.zoom).toBeCloseTo(8, 2);

    expect(result.filter!.taxonId).toBe(52775);
    expect(result.filter!.yearFrom).toBe(2020);
    expect(result.filter!.yearTo).toBe(2023);
    expect(result.filter!.months).toEqual(new Set([3, 6, 9]));
    expect(result.filter!.selectedCounties).toEqual(new Set(['King', 'Pierce']));
    expect(result.filter!.selectedEcoregions).toEqual(new Set(['Cascades']));

    expect(result.selection).toEqual({ type: 'ids', ids: ['ecdysis:999'] });

    expect(result.ui!.boundaryMode).toBe('counties');
    expect(result.ui!.paneState).toBe('table');

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

  test('elevMin=0 (sea level): round-trips as 0 not null', () => {
    const result = parseParams('elev_min=0');
    expect(result.filter?.elevMin).toBe(0);
  });

  test('elevMin alone triggers hasFilter: result.filter is defined', () => {
    const result = parseParams('elev_min=500');
    expect(result.filter).toBeDefined();
    expect(result.filter!.elevMin).toBe(500);
    expect(result.filter!.elevMax).toBeNull();
  });
});

describe('MAP-04: checklist layer URL param (cl=1)', () => {
  test('checklistVisible=true: cl param is "1"', () => {
    const ui = { boundaryMode: 'off' as const, paneState: 'collapsed' as const, checklistVisible: true };
    const params = buildParams(defaultView, emptyFilter(), defaultSelection, ui);
    expect(params.get('cl')).toBe('1');
  });

  test('checklistVisible=false (default): cl param is absent', () => {
    const params = buildParams(defaultView, emptyFilter(), defaultSelection, defaultUi);
    expect(params.has('cl')).toBe(false);
  });

  test('cl=1 parses to checklistVisible: true in result.ui', () => {
    const result = parseParams('cl=1');
    expect(result.ui?.checklistVisible).toBe(true);
  });

  test('cl absent: checklistVisible is absent or false in result.ui', () => {
    const result = parseParams('bm=counties');
    expect(result.ui?.checklistVisible ?? false).toBe(false);
  });

  test('cl=1 + bm=counties: both round-trip together', () => {
    const ui = { boundaryMode: 'counties' as const, paneState: 'collapsed' as const, checklistVisible: true };
    const params = buildParams(defaultView, emptyFilter(), defaultSelection, ui);
    const result = parseParams(params.toString());
    expect(result.ui?.boundaryMode).toBe('counties');
    expect(result.ui?.checklistVisible).toBe(true);
  });

  test('cl=0 (not "1"): checklistVisible is false', () => {
    const result = parseParams('cl=0');
    expect(result.ui?.checklistVisible ?? false).toBe(false);
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

  test('taxon= non-integer (legacy name): result.filter is undefined (legacy resolution is async)', () => {
    // Legacy name format is stored for async resolution; doesn't produce a synchronous filter result
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

  test('taxonRank without taxon: taxonId absent from filter', () => {
    const result = parseParams('taxonRank=genus&yr0=2020');
    // taxon absent but yearFrom is present so filter object exists
    expect(result.filter?.taxonId).toBeNull();
    expect(result.filter?.yearFrom).toBe(2020);
  });

  test('invalid pane param (pane=invalid): paneState defaults to collapsed', () => {
    const result = parseParams('pane=invalid');
    // result.ui may be undefined (all defaults) — paneState is collapsed in both cases
    expect(result.ui?.paneState ?? 'collapsed').toBe('collapsed');
  });

  test('legacy view=table: paneState is table (legacy alias)', () => {
    const result = parseParams('view=table');
    expect(result.ui).toBeDefined();
    expect(result.ui!.paneState).toBe('table');
  });
});

describe('place filter param', () => {
  test('buildParams with selectedPlace emits place= param', () => {
    const filter = { ...emptyFilter(), selectedPlace: 'ebeys-landing' };
    const params = buildParams(defaultView, filter, defaultSelection, defaultUi);
    expect(params.get('place')).toBe('ebeys-landing');
  });

  test('buildParams with selectedPlace=null does not emit place= param', () => {
    const params = buildParams(defaultView, emptyFilter(), defaultSelection, defaultUi);
    expect(params.has('place')).toBe(false);
  });

  test('parseParams with place= sets selectedPlace and forces boundaryMode=places (D-01)', () => {
    const result = parseParams('place=ebeys-landing');
    expect(result.filter?.selectedPlace).toBe('ebeys-landing');
    expect(result.ui?.boundaryMode).toBe('places');
  });

  test('parseParams with place=+ bm=counties still returns boundaryMode=places (D-01 precedence)', () => {
    const result = parseParams('place=ebeys-landing&bm=counties');
    expect(result.filter?.selectedPlace).toBe('ebeys-landing');
    expect(result.ui?.boundaryMode).toBe('places');
  });

  test('parseParams with bm=ecoregions and no place= returns ecoregions, no selectedPlace implication', () => {
    const result = parseParams('bm=ecoregions');
    expect(result.ui?.boundaryMode).toBe('ecoregions');
    expect(result.filter?.selectedPlace ?? null).toBeNull();
  });

  test('full round-trip: selectedPlace + boundaryMode=places encode and decode', () => {
    const filter = { ...emptyFilter(), selectedPlace: 'ebeys-landing' };
    const ui = { boundaryMode: 'places' as const, paneState: 'collapsed' as const };
    const params = buildParams(defaultView, filter, defaultSelection, ui);
    const result = parseParams(params.toString());
    expect(result.filter?.selectedPlace).toBe('ebeys-landing');
    expect(result.ui?.boundaryMode).toBe('places');
  });
});

describe('MAP-03: source filter URL param (src=)', () => {
  test('hiddenSources={ecdysis}: src param lists the three visible sources (D-11: 4-source universe)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ui = { boundaryMode: 'off' as const, paneState: 'collapsed' as const,
                 hiddenSources: new Set(['ecdysis'] as const) } as any;
    const params = buildParams(defaultView, emptyFilter(), defaultSelection, ui);
    // After Plan 03 ships: VALID_SOURCES = {ecdysis, waba_sample, inat_obs, checklist}
    // hiddenSources={ecdysis} → visible = {waba_sample, inat_obs, checklist} (sorted)
    expect(params.get('src')).toBe('checklist,inat_obs,waba_sample');
  });

  test('hiddenSources empty (default): src param is absent', () => {
    const params = buildParams(defaultView, emptyFilter(), defaultSelection, defaultUi);
    expect(params.has('src')).toBe(false);
  });

  test('src=ecdysis parses to hiddenSources of non-ecdysis sources (3 hidden — 4-source universe)', () => {
    const result = parseParams('src=ecdysis');
    // After Plan 03: VALID_SOURCES has 4 members; complement of {ecdysis} = {inat_obs, waba_sample, checklist}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result.ui as any)?.hiddenSources).toEqual(new Set(['inat_obs', 'waba_sample', 'checklist']));
  });

  test('src=ecdysis hides exactly 3 sources — VALID_SOURCES universe has 4 members (D-11)', () => {
    const result = parseParams('src=ecdysis');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hidden: Set<string> = (result.ui as any)?.hiddenSources ?? new Set();
    expect(hidden.size).toBe(3);
  });

  test('two hidden sources: src lists the two visible sources (4-source universe)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ui = { boundaryMode: 'off' as const, paneState: 'collapsed' as const,
                 hiddenSources: new Set(['inat_obs', 'ecdysis'] as const) } as any;
    const params = buildParams(defaultView, emptyFilter(), defaultSelection, ui);
    // After Plan 03: visible = {waba_sample, checklist} (sorted)
    expect(params.get('src')).toBe('checklist,waba_sample');
  });

  test('src=checklist round-trip: buildParams encodes checklist-only visible set, parseParams recovers 3 hidden (D-11)', () => {
    // After Plan 03 ships: only checklist is visible → hiddenSources = {ecdysis, inat_obs, waba_sample}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ui = { boundaryMode: 'off' as const, paneState: 'collapsed' as const,
                 hiddenSources: new Set(['ecdysis', 'inat_obs', 'waba_sample'] as const) } as any;
    const params = buildParams(defaultView, emptyFilter(), defaultSelection, ui);
    // src= should contain 'checklist' (the only visible source)
    expect(params.get('src')).toContain('checklist');
    // parseParams of that string should hide the other three
    const result = parseParams(params.toString());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result.ui as any)?.hiddenSources).toEqual(new Set(['ecdysis', 'inat_obs', 'waba_sample']));
  });

  test('invalid source value in src= is filtered out (4-source complement)', () => {
    const result = parseParams('src=ecdysis,bogus_source');
    // After Plan 03: complement of {ecdysis} = {inat_obs, waba_sample, checklist}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result.ui as any)?.hiddenSources).toEqual(new Set(['inat_obs', 'waba_sample', 'checklist']));
  });

  test('src=ecdysis alone triggers result.ui (hasFilter condition)', () => {
    const result = parseParams('src=ecdysis');
    expect(result.ui).toBeDefined();
  });
});

describe('bounds selection (SEL-06)', () => {
  test('bounds round-trip: encodes as sel=west,south,east,north with toFixed(4)', () => {
    const selection: SelectionState = { type: 'bounds', west: -122.3456, south: 47.1234, east: -122.1234, north: 47.5678 };
    const params = buildParams(defaultView, emptyFilter(), selection, defaultUi);
    expect(params.get('sel')).toBe('-122.3456,47.1234,-122.1234,47.5678');
    const result = parseParams(params.toString());
    expect(result.selection).toEqual({ type: 'bounds', west: -122.3456, south: 47.1234, east: -122.1234, north: 47.5678 });
  });

  test('bounds with positive longitudes: toFixed(4) applied (e.g. 120 becomes "120.0000")', () => {
    const selection: SelectionState = { type: 'bounds', west: 120, south: 30, east: 121, north: 31 };
    const params = buildParams(defaultView, emptyFilter(), selection, defaultUi);
    expect(params.get('sel')).toBe('120.0000,30.0000,121.0000,31.0000');
    const result = parseParams(params.toString());
    expect(result.selection).toEqual({ type: 'bounds', west: 120, south: 30, east: 121, north: 31 });
  });

  test('bounds does NOT emit o= — params.has("o") is false when selection.type === "bounds"', () => {
    const selection: SelectionState = { type: 'bounds', west: -122.3456, south: 47.1234, east: -122.1234, north: 47.5678 };
    const params = buildParams(defaultView, emptyFilter(), selection, defaultUi);
    expect(params.has('o')).toBe(false);
    expect(params.has('sel')).toBe(true);
  });

  test('sel= does NOT emit when selection.type === "ids" (empty)', () => {
    const selection: SelectionState = { type: 'ids', ids: [] };
    const params = buildParams(defaultView, emptyFilter(), selection, defaultUi);
    expect(params.has('sel')).toBe(false);
  });

  test('sel= does NOT emit when selection.type === "cluster"', () => {
    const selection: SelectionState = { type: 'cluster', lon: -120.5, lat: 47.3, radiusM: 500 };
    const params = buildParams(defaultView, emptyFilter(), selection, defaultUi);
    expect(params.has('sel')).toBe(false);
  });

  test('malformed sel: not four values — selection undefined', () => {
    const result = parseParams('sel=not,four,values');
    expect(result.selection).toBeUndefined();
  });

  test('out-of-range west (999): selection undefined', () => {
    const result = parseParams('sel=999,47,-120,48');
    expect(result.selection).toBeUndefined();
  });

  test('out-of-range north (999): selection undefined', () => {
    const result = parseParams('sel=-122,47,-121,999');
    expect(result.selection).toBeUndefined();
  });

  test('south >= north (inverted/degenerate): selection undefined', () => {
    const result = parseParams('sel=-122,48,-121,47');
    expect(result.selection).toBeUndefined();
  });

  test('non-finite value (NaN west): selection undefined', () => {
    const result = parseParams('sel=NaN,47,-121,48');
    expect(result.selection).toBeUndefined();
  });

  test('combined params: bounds selection + filter coexist on round-trip (SEL-06)', () => {
    const selection: SelectionState = { type: 'bounds', west: -122.3456, south: 47.1234, east: -122.1234, north: 47.5678 };
    const filter = { ...emptyFilter(), taxonId: 52775, taxonDisplayName: 'Bombus (genus)' };
    const params = buildParams(defaultView, filter, selection, defaultUi);
    expect(params.get('sel')).toBe('-122.3456,47.1234,-122.1234,47.5678');
    expect(params.get('taxon')).toBe('52775');
    const result = parseParams(params.toString());
    expect(result.selection).toEqual({ type: 'bounds', west: -122.3456, south: 47.1234, east: -122.1234, north: 47.5678 });
    expect(result.filter?.taxonId).toBe(52775);
  });
});

describe('MFILT-03: taxon URL integer encode + legacy back-compat decode', () => {
  test('buildParams sets taxon= to String(taxonId) and never sets taxonRank', () => {
    const filter: FilterState = { ...emptyFilter(), taxonId: 52775, taxonDisplayName: 'Bombus (genus)' };
    const params = buildParams(defaultView, filter, defaultSelection, defaultUi);
    expect(params.get('taxon')).toBe('52775');
    expect(params.has('taxonRank')).toBe(false);
  });

  test('parseParams on ?taxon=52775 yields filter.taxonId === 52775 with no pending-legacy', () => {
    const result: ParsedParams = parseParams('taxon=52775');
    expect(result.filter?.taxonId).toBe(52775);
    expect(result.pendingLegacyTaxon).toBeUndefined();
  });

  test('round-trip: parseParams(buildParams({taxonId:52775})) recovers taxonId === 52775', () => {
    const filter: FilterState = { ...emptyFilter(), taxonId: 52775, taxonDisplayName: 'Bombus (genus)' };
    const params = buildParams(defaultView, filter, defaultSelection, defaultUi);
    const result: ParsedParams = parseParams(params.toString());
    expect(result.filter?.taxonId).toBe(52775);
  });

  test('parseParams on ?taxon=Bombus&taxonRank=genus stores pending-legacy, no taxonId', () => {
    const result: ParsedParams = parseParams('taxon=Bombus&taxonRank=genus');
    // Non-integer taxon → no synchronous taxonId
    expect(result.filter).toBeUndefined();
    // But pendingLegacyTaxon is populated for async resolution
    expect(result.pendingLegacyTaxon).toBeDefined();
    expect(result.pendingLegacyTaxon?.name).toBe('Bombus');
    expect(result.pendingLegacyTaxon?.rank).toBe('genus');
  });

  test('year-only params still round-trip unchanged (MFILT-03)', () => {
    const filter: FilterState = { ...emptyFilter(), yearFrom: 2020, yearTo: 2022 };
    const params = buildParams(defaultView, filter, defaultSelection, defaultUi);
    const result: ParsedParams = parseParams(params.toString());
    expect(result.filter?.yearFrom).toBe(2020);
    expect(result.filter?.yearTo).toBe(2022);
    expect(result.filter?.taxonId).toBeNull();
    expect(result.pendingLegacyTaxon).toBeUndefined();
  });
});
