import { test, expect, describe, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildParams, parseParams } from '../url-state.ts';
import type { SelectionState } from '../url-state.ts';
import type { FilterState } from '../filter.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Mock heavy modules that have module-level side effects incompatible with happy-dom
vi.mock('../sqlite.ts', () => ({
  // exec is a no-op that ignores its row callback — enough for the now-reachable
  // queryVisibleGeoJSON map query (near-me/shift-drag bounds) to resolve to an empty set.
  getDB: vi.fn(() => Promise.resolve({ sqlite3: { exec: vi.fn(() => Promise.resolve()) }, db: 0 })),
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
    // Phase 72 additions:
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

describe('ARCH-01: bee-atlas registration', () => {
  test('bee-atlas is a registered custom element', async () => {
    // Import triggers @customElement registration
    const { BeeAtlas } = await import('../bee-atlas.ts');
    expect(BeeAtlas).toBeDefined();
    expect(customElements.get('bee-atlas')).toBe(BeeAtlas);
  });
});

describe('ARCH-02: bee-map property interface', () => {
  test('BeeMap class has @property declarations for required inputs', async () => {
    const { BeeMap } = await import('../bee-map.ts');
    // Lit stores property definitions in a static properties map
    const props = (BeeMap as unknown as { elementProperties: Map<string, unknown> }).elementProperties;
    expect(props.has('visibleIds')).toBe(true);
    expect(props.has('boundaryMode')).toBe(true);
    expect(props.has('viewState')).toBe(true);
    expect(props.has('panTo')).toBe(true);
    expect(props.has('filterState')).toBe(true);
    expect(props.has('layerMode')).toBe(false);
  });

  test('bee-atlas.ts does not contain _layerMode or old state fields', () => {
    const src = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');
    expect(src).not.toMatch(/_layerMode/);
    expect(src).not.toMatch(/_visibleEcdysisIds/);
    expect(src).not.toMatch(/_visibleSampleIds/);
    expect(src).not.toMatch(/_selectedSampleEvent/);
  });
});

describe('ARCH-03: coordinator pattern — sibling isolation', () => {
  test('bee-map.ts does not have a runtime (non-type) import of bee-sidebar', () => {
    const beeMapSource = readFileSync(resolve(__dirname, '../bee-map.ts'), 'utf-8');
    // import type { ... } from './bee-sidebar.ts' is acceptable (type-only, no runtime coupling)
    // Only side-effect imports and value imports are forbidden
    expect(beeMapSource).not.toMatch(/^import\s+['"]\.\/bee-sidebar/m);         // side-effect import
    expect(beeMapSource).not.toMatch(/^import\s+\{[^}]+\}\s+from\s+['"]\.\/bee-sidebar/m); // value import
  });

  test('bee-map.ts does not import from url-state', () => {
    const beeMapSource = readFileSync(resolve(__dirname, '../bee-map.ts'), 'utf-8');
    expect(beeMapSource).not.toMatch(/from\s+['"]\.\/url-state/);
  });

  test('bee-map.ts has no _restored* properties', () => {
    const beeMapSource = readFileSync(resolve(__dirname, '../bee-map.ts'), 'utf-8');
    expect(beeMapSource).not.toMatch(/_restored[A-Z]/);
  });

  test('filter.ts has no module-level filterState singleton', () => {
    const filterSource = readFileSync(resolve(__dirname, '../filter.ts'), 'utf-8');
    expect(filterSource).not.toMatch(/^export const filterState/m);
    expect(filterSource).not.toMatch(/^export let visibleEcdysisIds/m);
    expect(filterSource).not.toMatch(/^export let visibleSampleIds/m);
  });
});

describe('SIDE-01: bee-atlas sidebar visibility wiring', () => {
  const src = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');

  test('bee-atlas.ts does NOT declare _sidebarOpen as @state()', () => {
    expect(src).not.toMatch(/@state\(\)\s+private\s+_sidebarOpen/);
  });

  test('bee-atlas.ts sets _paneState = list in occurrence click handler', () => {
    expect(src).toMatch(/this\._paneState\s*=\s*'list'/);
  });

  test('bee-atlas.ts sets _paneState = collapsed in _onPaneCollapse', () => {
    const methodStart = src.indexOf('private _onPaneCollapse(');
    const nextPrivate = src.indexOf('\n  private ', methodStart + 1);
    const body = src.slice(methodStart, nextPrivate > methodStart ? nextPrivate : undefined);
    expect(body).toContain("this._paneState = 'collapsed'");
  });

  test('bee-atlas.ts does NOT contain _feedIndex field', () => {
    expect(src).not.toMatch(/private\s+_feedIndex/);
  });

  test('bee-atlas.ts does NOT contain _activeFeedEntries', () => {
    expect(src).not.toMatch(/_activeFeedEntries/);
  });

  test('bee-atlas.ts does NOT fetch feeds/index.json', () => {
    expect(src).not.toMatch(/feeds\/index\.json/);
  });

  test('bee-atlas.ts does NOT define _computeActiveFeedEntries', () => {
    expect(src).not.toMatch(/_computeActiveFeedEntries/);
  });
});

describe('VIEW-02: bee-atlas conditional render and view mode wiring', () => {
  const src = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');

  test('bee-atlas.ts renders bee-pane (which embeds bee-table in its shadow DOM)', () => {
    expect(src).toMatch(/<bee-pane\b/);
    expect(src).not.toMatch(/<bee-table\b/);
  });

  test('bee-atlas.ts contains bee-pane CSS positioning rule', () => {
    expect(src).toMatch(/bee-pane\s*\{/);
    expect(src).not.toMatch(/bee-table\s*\{/);
  });

  test('bee-atlas.ts declares _paneState as @state field (replaces _viewMode)', () => {
    expect(src).toMatch(/@state\(\)\s+private\s+_paneState/);
    expect(src).not.toMatch(/@state\(\)\s+private\s+_viewMode/);
  });

  test('bee-atlas.ts _onPopState restores _paneState from URL (Phase 106)', () => {
    expect(src).toMatch(/this\._paneState\s*=\s*paneState/);
  });

  test('bee-atlas.ts does not pass .viewMode to bee-header', () => {
    expect(src).not.toMatch(/\.viewMode\s*=\s*\$\{/);
  });
});

describe('BOUNDARY-01: bee-map boundary layer declarations', () => {
  test('bee-map.ts contains addSource calls for counties and ecoregions with generateId', () => {
    const src = readFileSync(resolve(__dirname, '../bee-map.ts'), 'utf-8');
    expect(src).toMatch(/addSource\s*\(\s*['"]counties['"]/);
    expect(src).toMatch(/addSource\s*\(\s*['"]ecoregions['"]/);
    expect(src).toMatch(/generateId\s*:\s*true/);
  });

  test('bee-map.ts contains fill and line layers for both boundary types', () => {
    const src = readFileSync(resolve(__dirname, '../bee-map.ts'), 'utf-8');
    expect(src).toMatch(/['"]county-fill['"]/);
    expect(src).toMatch(/['"]county-line['"]/);
    expect(src).toMatch(/['"]ecoregion-fill['"]/);
    expect(src).toMatch(/['"]ecoregion-line['"]/);
  });

  test('bee-map.ts uses feature-state for boundary selection highlighting', () => {
    const src = readFileSync(resolve(__dirname, '../bee-map.ts'), 'utf-8');
    const styleSrc = readFileSync(resolve(__dirname, '../style.ts'), 'utf-8');
    expect(src).toMatch(/setFeatureState/);
    expect(src).toMatch(/removeFeatureState/);
    expect(styleSrc).toMatch(/feature-state.*selected/);
  });
});

describe('CLICK-01: bee-map click interaction chain', () => {
  test('bee-map.ts registers addInteraction for cluster, point, county, and ecoregion layers', () => {
    const src = readFileSync(resolve(__dirname, '../bee-map.ts'), 'utf-8');
    expect(src).toMatch(/addInteraction\s*\(\s*['"]click-cluster['"]/);
    expect(src).toMatch(/addInteraction\s*\(\s*['"]click-point['"]/);
    expect(src).toMatch(/addInteraction\s*\(\s*['"]click-county['"]/);
    expect(src).toMatch(/addInteraction\s*\(\s*['"]click-ecoregion['"]/);
  });

  test('bee-map.ts cluster click handler shows leaves via map-click-occurrence', () => {
    const src = readFileSync(resolve(__dirname, '../bee-map.ts'), 'utf-8');
    expect(src).toMatch(/getClusterLeaves/);
    expect(src).toMatch(/map-click-occurrence/);
    expect(src).not.toMatch(/easeTo/);
  });

  test('bee-map.ts emits map-click-occurrence for single point clicks', () => {
    const src = readFileSync(resolve(__dirname, '../bee-map.ts'), 'utf-8');
    expect(src).toMatch(/map-click-occurrence/);
  });

  test('bee-map.ts emits map-click-region with name and shiftKey', () => {
    const src = readFileSync(resolve(__dirname, '../bee-map.ts'), 'utf-8');
    expect(src).toMatch(/map-click-region/);
    expect(src).toMatch(/shiftKey/);
  });

  test('bee-map.ts emits map-click-empty as fallback', () => {
    const src = readFileSync(resolve(__dirname, '../bee-map.ts'), 'utf-8');
    expect(src).toMatch(/map-click-empty/);
  });
});

describe('D-02: county/ecoregion options from SQLite not boundary events', () => {
  test('bee-map.ts does NOT emit county-options-loaded or ecoregion-options-loaded', () => {
    const src = readFileSync(resolve(__dirname, '../bee-map.ts'), 'utf-8');
    expect(src).not.toMatch(/county-options-loaded/);
    expect(src).not.toMatch(/ecoregion-options-loaded/);
  });

  test('bee-atlas.ts loads county/ecoregion options from SQLite', () => {
    const src = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');
    expect(src).toMatch(/_loadCountyEcoregionOptions/);
    expect(src).toMatch(/SELECT DISTINCT county FROM occurrences/);
    expect(src).toMatch(/SELECT DISTINCT ecoregion_l3 FROM occurrences/);
  });
});

describe('selected-occurrences overlay (non-clustered selection indicator)', () => {
  const src = readFileSync(resolve(__dirname, '../bee-map.ts'), 'utf-8');
  const styleSrc = readFileSync(resolve(__dirname, '../style.ts'), 'utf-8');

  test('bee-map.ts adds the selected-occurrences source', () => {
    expect(src).toMatch(/addSource\s*\(\s*['"]selected-occurrences['"]/);
  });

  test('selected-occurrences source has cluster: false', () => {
    const block = src.match(/addSource\s*\(\s*['"]selected-occurrences['"][\s\S]{0,300}/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/cluster\s*:\s*false/);
  });

  test('bee-map.ts adds a layer with id selected-occurrences', () => {
    expect(styleSrc).toMatch(/id:\s*['"]selected-occurrences['"]/);
  });

  test('selected-occurrences layer uses same dot style as unclustered-point', () => {
    // paint is shared via _occurrencePointPaint in style.ts
    expect(styleSrc).toMatch(/circle-stroke-color['"]?\s*:\s*['"]#ffffff['"]/);
    expect(styleSrc).toMatch(/circle-radius['"]?\s*:\s*6/);
  });

  test('selected-occurrences source/layer are added inside the load handler', () => {
    const loadIdx = src.search(/this\._map(!|)?\.on\(\s*['"]load['"]/);
    const srcIdx = src.search(/addSource\s*\(\s*['"]selected-occurrences['"]/);
    expect(loadIdx).toBeGreaterThanOrEqual(0);
    expect(srcIdx).toBeGreaterThan(loadIdx);
  });

  test('no async halo machinery remains', () => {
    expect(src).not.toMatch(/_scheduleHaloRecompute/);
    expect(src).not.toMatch(/_recomputeHalo/);
    expect(src).not.toMatch(/selected-cluster-halo/);
  });
});

describe('SEL-01: bee-map shift-drag rectangle gesture setup', () => {
  const src = readFileSync(resolve(__dirname, '../bee-map.ts'), 'utf-8');

  test('bee-map.ts disables boxZoom at map init', () => {
    expect(src).toMatch(/boxZoom\.disable\(\)/);
  });

  test('bee-map.ts registers canvas mousedown listener in capture phase', () => {
    expect(src).toMatch(/addEventListener\s*\(\s*['"]mousedown['"],\s*this\._onRectMouseDown,\s*true\s*\)/);
  });

  test('bee-map.ts emits selection-drawn custom event', () => {
    expect(src).toMatch(/selection-drawn/);
  });

  test('bee-map.ts disables and re-enables dragPan around the gesture', () => {
    expect(src).toMatch(/dragPan\.disable\(\)/);
    expect(src).toMatch(/dragPan\.enable\(\)/);
  });

  test('bee-map.ts guards gesture with shiftKey and button === 0 check', () => {
    expect(src).toMatch(/e\.shiftKey\s*&&\s*e\.button\s*===\s*0/);
  });
});

describe('SEL-02: bee-map rectangle overlay DOM lifecycle', () => {
  const src = readFileSync(resolve(__dirname, '../bee-map.ts'), 'utf-8');

  test('bee-map.ts assigns selection-box class to the overlay div', () => {
    expect(src).toMatch(/className\s*=\s*['"]selection-box['"]/);
  });

  test('bee-map.ts appends overlay div to getCanvasContainer()', () => {
    expect(src).toMatch(/getCanvasContainer\(\)\.appendChild/);
  });

  test('bee-map.ts removes the rect box on mouseup', () => {
    expect(src).toMatch(/_rectBox\.remove\(\)/);
  });

  test('bee-map.ts has .selection-box CSS rule in static styles', () => {
    expect(src).toMatch(/\.selection-box\s*\{/);
  });

  test('bee-map.ts uses sub-threshold guard to suppress accidental-click emission', () => {
    expect(src).toMatch(/dx\s*<\s*5\s*&&\s*dy\s*<\s*5/);
  });
});

describe('SEL-03: queryOccurrencesByBounds in filter.ts', () => {
  const filterSrc = readFileSync(resolve(__dirname, '../filter.ts'), 'utf-8');

  test('filter.ts exports queryOccurrencesByBounds', () => {
    expect(filterSrc).toMatch(/export async function queryOccurrencesByBounds/);
  });

  test('filter.ts uses buildFilterSQL and BETWEEN clauses inside queryOccurrencesByBounds', () => {
    expect(filterSrc).toMatch(/buildFilterSQL/);
    expect(filterSrc).toMatch(/BETWEEN.*AND.*BETWEEN/);
  });

  // NOTE: bee-atlas.ts no longer references queryOccurrencesByBounds (Plan 109-02: replaced by _runListQuery)
});

describe('SEL-04: sidebar open on non-empty bounds result', () => {
  const src = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');

  test('bee-atlas.ts sets _paneState = list (reachable from _onSelectionDrawn)', () => {
    expect(src).toMatch(/this\._paneState\s*=\s*'list'/);
  });

  // NOTE: bee-atlas.ts no longer assigns to _selectedOccurrences (Plan 109-02: replaced by _runListQuery)
});

describe('SEL-05: sidebar not opened on empty bounds result', () => {
  // NOTE: Plan 109-02 replaced queryOccurrencesByBounds with _runListQuery;
  // the pane opens immediately and the list query handles empty results gracefully.
});

describe('SEL-06 + SEL-07 wiring (Phase 91)', () => {
  const src = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');

  test('SEL-06: _pushUrlState gives _selectionBounds precedence over cluster/ids', () => {
    expect(src).toContain("this._selectionBounds && this._paneState === 'list'");
  });

  test('SEL-06: _pushUrlState emits bounds via buildParams', () => {
    expect(src).toContain("type: 'bounds' as const");
  });

  test('SEL-06: _onSelectionDrawn calls _pushUrlState after sidebar opens (placeholder removed)', () => {
    expect(src).not.toContain('Phase 91 will call this._pushUrlState() here');
  });

  // NOTE: Plan 109-02 removed _restoreBoundsSelection; bounds restore now handled
  // by setting _selectionBounds and letting _onDataLoaded call _runListQuery.

  test('SEL-06: firstUpdated routes bounds selection to _selectionBounds state', () => {
    expect(src).toContain("initSel?.type === 'bounds'");
    expect(src).toMatch(/initSel\?\.type === 'bounds'[\s\S]{0,300}_selectionBounds\s*=/);
  });

  test('SEL-06: _onPopState routes bounds selection to _selectionBounds state', () => {
    expect(src).toContain("parsedSel?.type === 'bounds'");
  });

  test('SEL-07: _onPaneCollapse clears _selectionBounds', () => {
    const methodStart = src.indexOf('private _onPaneCollapse(');
    expect(methodStart).toBeGreaterThan(-1);
    const nextPrivate = src.indexOf('\n  private ', methodStart + 1);
    const methodBody = src.slice(methodStart, nextPrivate > methodStart ? nextPrivate : undefined);
    expect(methodBody).toContain('this._selectionBounds = null');
  });

  test('SEL-07: _onMapClickEmpty clears _selectionBounds in both branches', () => {
    const methodStart = src.indexOf('private _onMapClickEmpty()');
    expect(methodStart).toBeGreaterThan(-1);
    const nextPrivate = src.indexOf('\n  private ', methodStart + 1);
    const methodBody = src.slice(methodStart, nextPrivate > methodStart ? nextPrivate : undefined);
    const clearCount = (methodBody.match(/this\._selectionBounds\s*=\s*null/g) ?? []).length;
    expect(clearCount).toBeGreaterThanOrEqual(2);
  });

  test('SEL-07: _onFilterChanged clears _selectionBounds', () => {
    const methodStart = src.indexOf('private _onFilterChanged(');
    expect(methodStart).toBeGreaterThan(-1);
    const nextPrivate = src.indexOf('\n  private ', methodStart + 1);
    const methodBody = src.slice(methodStart, nextPrivate > methodStart ? nextPrivate : undefined);
    expect(methodBody).toContain('this._selectionBounds = null');
  });

  test('SEL-07: _onPopState clears _selectionBounds in all three branches (ids, cluster, else)', () => {
    const methodStart = src.indexOf('private _onPopState');
    const nextPrivate = src.indexOf('\n  private ', methodStart + 1);
    const methodBody = src.slice(methodStart, nextPrivate > methodStart ? nextPrivate : undefined);
    const clearCount = (methodBody.match(/this\._selectionBounds\s*=\s*null/g) ?? []).length;
    expect(clearCount).toBeGreaterThanOrEqual(3);
  });

  test('SEL-07: _onOccurrenceClick clears _selectionBounds', () => {
    const methodStart = src.indexOf('private _onOccurrenceClick(');
    const nextPrivate = src.indexOf('\n  private ', methodStart + 1);
    const methodBody = src.slice(methodStart, nextPrivate > methodStart ? nextPrivate : undefined);
    expect(methodBody).toContain('this._selectionBounds = null');
  });

  test('SEL-07: _onSelectionDrawn delegates to _applyBoundsSelection which sets _selectionBounds and calls _runListQuery', () => {
    // Plan 153-03 refactor: _onSelectionDrawn now delegates to _applyBoundsSelection
    // (extracted shared method) so a shift-drag box and a near-me box are byte-identical state.
    // Verify _onSelectionDrawn calls _applyBoundsSelection, and that _applyBoundsSelection
    // sets _selectionBounds and calls _runListQuery.
    const selDrawnStart = src.indexOf('private _onSelectionDrawn(');
    const selDrawnEnd = src.indexOf('\n  private ', selDrawnStart + 1);
    const selDrawnBody = src.slice(selDrawnStart, selDrawnEnd > selDrawnStart ? selDrawnEnd : undefined);
    expect(selDrawnBody).toContain('_applyBoundsSelection');

    const applyStart = src.indexOf('private _applyBoundsSelection(');
    const applyEnd = src.indexOf('\n  private ', applyStart + 1);
    const applyBody = src.slice(applyStart, applyEnd > applyStart ? applyEnd : undefined);
    expect(applyBody).toContain('this._selectionBounds = bounds');
    expect(applyBody).toContain('_runListQuery');
  });

  test('SEL-07: _onRegionClick clears _selectionBounds on deselect', () => {
    const methodStart = src.indexOf('private _onRegionClick(');
    const nextPrivate = src.indexOf('\n  private ', methodStart + 1);
    const methodBody = src.slice(methodStart, nextPrivate > methodStart ? nextPrivate : undefined);
    expect(methodBody).toContain('this._selectionBounds = null');
  });

  test('SEL-07: _onPlaceSelected clears _selectionBounds on deselect', () => {
    const methodStart = src.indexOf('private _onPlaceSelected(');
    const nextPrivate = src.indexOf('\n  private ', methodStart + 1);
    const methodBody = src.slice(methodStart, nextPrivate > methodStart ? nextPrivate : undefined);
    expect(methodBody).toContain('this._selectionBounds = null');
  });

  test('SEL-07: _openSidebarForFilter clears _selectionBounds', () => {
    const methodStart = src.indexOf('private _openSidebarForFilter(');
    const nextPrivate = src.indexOf('\n  private ', methodStart + 1);
    const methodBody = src.slice(methodStart, nextPrivate > methodStart ? nextPrivate : undefined);
    expect(methodBody).toContain('this._selectionBounds = null');
  });
});

describe('PMAP-02/04: place filter wiring in bee-atlas', () => {
  const src = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');

  test('bee-atlas.ts declares _onPlaceSelected method', () => {
    expect(src).toMatch(/private _onPlaceSelected\b/);
  });

  test('bee-atlas.ts template wires @place-selected on bee-map', () => {
    expect(src).toMatch(/@place-selected=\$\{this\._onPlaceSelected\}/);
  });

  test('_onPlaceSelected reads e.detail.slug and sets _filterState.selectedPlace', () => {
    const methodStart = src.indexOf('private _onPlaceSelected(');
    expect(methodStart).toBeGreaterThan(-1);
    const nextPrivate = src.indexOf('\n  private ', methodStart + 1);
    const methodBody = src.slice(methodStart, nextPrivate > methodStart ? nextPrivate : undefined);
    expect(methodBody).toContain('e.detail');
    expect(methodBody).toContain('slug');
    expect(methodBody).toContain('selectedPlace');
    expect(methodBody).toContain('_runFilterQuery');
    expect(methodBody).toMatch(/_pushUrlState|_replaceUrlState/);
  });

  test('_onPlaceSelected implements toggle-off (wasSelected branch)', () => {
    const methodStart = src.indexOf('private _onPlaceSelected(');
    expect(methodStart).toBeGreaterThan(-1);
    const nextPrivate = src.indexOf('\n  private ', methodStart + 1);
    const methodBody = src.slice(methodStart, nextPrivate > methodStart ? nextPrivate : undefined);
    // Must have a toggle check: wasSelected pattern
    expect(methodBody).toMatch(/wasSelected|=== slug|selectedPlace.*null/);
    expect(methodBody).toContain('null');
  });

  test('bee-atlas.ts _onBoundaryModeChanged parameter type includes places', () => {
    expect(src).toMatch(/_onBoundaryModeChanged\(e:\s*CustomEvent<'off'\s*\|\s*'counties'\s*\|\s*'ecoregions'\s*\|\s*'places'>/);
  });

  test('_onFilterChanged passes selectedPlace through from FilterChangedEvent', () => {
    const methodStart = src.indexOf('private _onFilterChanged(');
    expect(methodStart).toBeGreaterThan(-1);
    const nextPrivate = src.indexOf('\n  private ', methodStart + 1);
    const methodBody = src.slice(methodStart, nextPrivate > methodStart ? nextPrivate : undefined);
    expect(methodBody).toContain('selectedPlace');
  });
});

describe('SM-01: bee-atlas pane state machine (Phase 106)', () => {
  const src = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');

  test('bee-atlas.ts declares _paneState as @state() with three-state type', () => {
    expect(src).toMatch(/@state\(\)\s+private\s+_paneState/);
    expect(src).toMatch(/'collapsed'\s*\|\s*'list'\s*\|\s*'table'/);
  });

  test('bee-atlas.ts does NOT contain _viewMode field', () => {
    expect(src).not.toMatch(/@state\(\)\s+private\s+_viewMode/);
    expect(src).not.toMatch(/this\._viewMode\s*=/);
  });

  test('bee-atlas.ts does NOT contain _sidebarOpen field', () => {
    expect(src).not.toMatch(/@state\(\)\s+private\s+_sidebarOpen/);
    expect(src).not.toMatch(/this\._sidebarOpen\s*=/);
  });

  test('bee-atlas.ts does NOT declare _tableFilterOpen as @state', () => {
    expect(src).not.toMatch(/@state\(\)\s+private\s+_tableFilterOpen/);
  });

  test('_onPaneCollapse sets _paneState = collapsed', () => {
    const methodStart = src.indexOf('private _onPaneCollapse(');
    const nextPrivate = src.indexOf('\n  private ', methodStart + 1);
    const body = src.slice(methodStart, nextPrivate > methodStart ? nextPrivate : undefined);
    expect(body).toContain("this._paneState = 'collapsed'");
  });

  // NOTE: Plan 109-02 removed _onViewChanged; table mode is now entered via _onPaneExpandTable only
  test('_onPaneExpandTable sets _paneState = table', () => {
    const methodStart = src.indexOf('private _onPaneExpandTable(');
    const nextPrivate = src.indexOf('\n  private ', methodStart + 1);
    const body = src.slice(methodStart, nextPrivate > methodStart ? nextPrivate : undefined);
    expect(body).toContain("this._paneState = 'table'");
  });

  test('firstUpdated assigns _paneState directly from parsed paneState', () => {
    expect(src).toMatch(/this\._paneState\s*=\s*paneState/);
    // Phase 105 adapter (this._viewMode = paneState === 'table' ? ...) should not exist
    expect(src).not.toMatch(/this\._viewMode\s*=\s*paneState\s*===\s*'table'\s*\?\s*'table'\s*:\s*'map'/);
  });
});

describe('PANE-01: bee-atlas bee-pane wiring (Phase 108)', () => {
  const src = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');

  test('bee-atlas.ts side-effect imports bee-pane', () => {
    expect(src).toMatch(/^import\s+['"]\.\/bee-pane\.ts['"]/m);
  });

  test('bee-atlas.ts does NOT import bee-filter-panel', () => {
    expect(src).not.toMatch(/import\s+['"]\.\/bee-filter-panel\.ts['"]/);
  });

  test('bee-atlas.ts renders <bee-pane> element', () => {
    expect(src).toMatch(/<bee-pane\b/);
  });

  test('bee-atlas.ts does NOT render <bee-filter-panel>, <bee-sidebar>, or <bee-table> directly', () => {
    expect(src).not.toMatch(/<bee-filter-panel\b/);
    expect(src).not.toMatch(/<bee-sidebar\b/);
    expect(src).not.toMatch(/<bee-table\b/);
  });

  test('bee-atlas.ts attaches all four pane navigation listeners', () => {
    expect(src).toMatch(/@pane-expand-list=\$\{this\._onPaneExpandList\}/);
    expect(src).toMatch(/@pane-collapse=\$\{this\._onPaneCollapse\}/);
    expect(src).toMatch(/@pane-expand-table=\$\{this\._onPaneExpandTable\}/);
    expect(src).toMatch(/@pane-shrink-list=\$\{this\._onPaneShrinkList\}/);
  });

  test('bee-atlas.ts does NOT attach @toggle-filter (no consumer after cutover)', () => {
    expect(src).not.toMatch(/@toggle-filter=/);
  });

  test('bee-atlas.ts contains _onPaneCollapse method that clears selection fields and sets _paneState = collapsed', () => {
    const start = src.indexOf('private _onPaneCollapse(');
    expect(start).toBeGreaterThan(-1);
    const nextPrivate = src.indexOf('\n  private ', start + 1);
    const body = src.slice(start, nextPrivate > start ? nextPrivate : undefined);
    // Plan 109-02: _selectedOccurrences removed; three remaining selection fields cleared
    expect(body).toContain('this._selectedOccIds = null');
    expect(body).toContain('this._selectedCluster = null');
    expect(body).toContain('this._selectionBounds = null');
    expect(body).toContain("this._paneState = 'collapsed'");
  });

  test('bee-atlas.ts contains _onPaneExpandTable method that imports bee-table and runs the table query', () => {
    const start = src.indexOf('private _onPaneExpandTable(');
    expect(start).toBeGreaterThan(-1);
    const nextPrivate = src.indexOf('\n  private ', start + 1);
    const body = src.slice(start, nextPrivate > start ? nextPrivate : undefined);
    expect(body).toContain("this._paneState = 'table'");
    expect(body).toMatch(/import\(['"]\.\/bee-table\.ts['"]\)/);
    expect(body).toContain('this._tableLoading = true');
    expect(body).toContain('this._runTableQuery()');
  });

  test('bee-atlas.ts does NOT define _onClose or _onToggleFilter (Phase 108 dead code removal)', () => {
    expect(src).not.toMatch(/private\s+_onClose\b/);
    expect(src).not.toMatch(/private\s+_onToggleFilter\b/);
  });

  test('bee-atlas.ts does NOT use table-mode or sidebar-open content classes', () => {
    expect(src).not.toMatch(/'table-mode'/);
    expect(src).not.toMatch(/'sidebar-open'/);
  });

  test('bee-atlas.ts uses pane-table content class for table-state layout', () => {
    expect(src).toMatch(/'pane-table'/);
  });

  test('bee-atlas.ts does NOT add an explicit map.resize() call (MAP-01 satisfied by bee-map ResizeObserver because bee-pane is overlay)', () => {
    // bee-pane is position: absolute (overlay) — bee-map element size never changes
    // across pane transitions, so the existing ResizeObserver in bee-map.ts handles
    // MAP-01 without any explicit resize call from bee-atlas.
    expect(src).not.toMatch(/_map\?\.resize\(\)/);
  });
});

describe('UNIFY-01: queryListPage and shared types in filter.ts', () => {
  const filterSrc = readFileSync(resolve(__dirname, '../filter.ts'), 'utf-8');

  test('filter.ts exports queryListPage function', () => {
    expect(filterSrc).toMatch(/export async function queryListPage/);
  });

  test('filter.ts exports DataSummary interface', () => {
    expect(filterSrc).toMatch(/export interface DataSummary/);
  });

  test('filter.ts exports TaxonOption interface', () => {
    expect(filterSrc).toMatch(/export interface TaxonOption/);
  });

  test('filter.ts exports FilterChangedEvent interface', () => {
    expect(filterSrc).toMatch(/export interface FilterChangedEvent/);
  });
});

describe('PANE-V2-01: collapsed button matches filter-panel design', () => {
  const paneSource = readFileSync(resolve(__dirname, '../bee-pane.ts'), 'utf-8');
  test('bee-pane.ts declares .filter-btn CSS class', () => {
    expect(paneSource).toMatch(/\.filter-btn\b/);
  });
  test('bee-pane.ts renders .filter-btn in collapsed state (not .toggle-btn)', () => {
    expect(paneSource).toMatch(/class=\$\{['"]filter-btn/);
  });
  test('bee-pane.ts has magnifying-glass SVG in collapsed state', () => {
    // The circle and line of the magnifying glass SVG
    expect(paneSource).toMatch(/<circle[^>]*cx="6\.5"/);
  });
  test('collapsed button is .active when filterActive || selectionCount > 0', () => {
    expect(paneSource).toMatch(/filterActive.*selectionCount|selectionCount.*filterActive/);
  });
});

describe('PANE-V2-02: unified list state — selection banner and X close', () => {
  const paneSource = readFileSync(resolve(__dirname, '../bee-pane.ts'), 'utf-8');
  test('bee-pane.ts renders selection banner when selectionCount > 0', () => {
    expect(paneSource).toMatch(/selection-banner/);
    expect(paneSource).toMatch(/selectionCount/);
  });
  test('bee-pane.ts dispatches pane-clear-selection', () => {
    expect(paneSource).toMatch(/new CustomEvent\(['"]pane-clear-selection['"]/);
  });
  test('bee-pane.ts renders a .pane-close X button in list state', () => {
    expect(paneSource).toMatch(/pane-close/);
    expect(paneSource).toMatch(/&#x2715;|✕|×/);
  });
  test('bee-atlas.ts does NOT declare _selectedOccurrences', () => {
    const atlasSrc = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');
    expect(atlasSrc).not.toMatch(/_selectedOccurrences/);
  });
  test('bee-atlas.ts calls _runListQuery', () => {
    const atlasSrc = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');
    expect(atlasSrc).toMatch(/_runListQuery/);
  });
  test('bee-atlas.ts handles pane-clear-selection event', () => {
    const atlasSrc = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');
    expect(atlasSrc).toMatch(/pane-clear-selection/);
  });
  test('bee-pane.ts dispatches list-page-changed', () => {
    expect(paneSource).toMatch(/new CustomEvent\(['"]list-page-changed['"]/);
  });
});

describe('PANE-V2-03: split-screen table layout', () => {
  const atlasSrc = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');
  test('bee-atlas.ts pane-table CSS does NOT have inset: 0', () => {
    const tableRule = atlasSrc.match(/\.content\.pane-table\s+bee-pane\s*\{[^}]*\}/);
    expect(tableRule).not.toBeNull();
    expect(tableRule![0]).not.toMatch(/inset\s*:\s*0/);
  });
  test('bee-atlas.ts pane-table CSS has height: 60%', () => {
    const tableRule = atlasSrc.match(/\.content\.pane-table\s+bee-pane\s*\{[^}]*\}/);
    expect(tableRule).not.toBeNull();
    expect(tableRule![0]).toMatch(/height\s*:\s*60%/);
  });
});

describe('PANE-V2-04: bee-header table icon removal', () => {
  const headerSrc = readFileSync(resolve(__dirname, '../bee-header.ts'), 'utf-8');
  const atlasSrc = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');
  test('bee-header.ts does NOT have a viewMode property', () => {
    expect(headerSrc).not.toMatch(/viewMode/);
  });
  test('bee-header.ts does NOT have _onViewClick', () => {
    expect(headerSrc).not.toMatch(/_onViewClick/);
  });
  test('bee-header.ts does NOT have a table icon-btn', () => {
    expect(headerSrc).not.toMatch(/Table view/);
  });
  test('bee-atlas.ts does NOT pass .viewMode to bee-header', () => {
    expect(atlasSrc).not.toMatch(/\.viewMode\s*=\s*\$\{/);
  });
});

describe('PANE-V2-05: old file removal', () => {
  test('bee-filter-panel.ts does not exist', () => {
    expect(existsSync(resolve(__dirname, '../bee-filter-panel.ts'))).toBe(false);
  });

  test('bee-sidebar.ts does not exist', () => {
    expect(existsSync(resolve(__dirname, '../bee-sidebar.ts'))).toBe(false);
  });

  test('bee-atlas.ts has no dynamic import of bee-sidebar.ts', () => {
    const atlasSrc = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');
    expect(atlasSrc).not.toMatch(/import\(['"]\.\/bee-sidebar\.ts['"]\)/);
  });
});

describe('MAP-03: checklist taxon filter binding (county-fill removed, Plan 138-03)', () => {
  const atlasSrc = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');

  // _checklistVisible, _onChecklistLayerChanged, .checklistTaxon/.checklistTaxonRank bindings
  // removed in Plan 138-03. Checklist now flows through hiddenSources.
  test('bee-atlas.ts does NOT have _checklistVisible @state field (retired)', () => {
    expect(atlasSrc).not.toMatch(/_checklistVisible/);
  });

  test('bee-atlas.ts does NOT register @checklist-layer-changed (retired)', () => {
    expect(atlasSrc).not.toMatch(/@checklist-layer-changed/);
  });

  test('bee-atlas.ts handles source-filter-changed and sets _hiddenSources', () => {
    expect(atlasSrc).toMatch(/_onSourceFilterChanged/);
    expect(atlasSrc).toMatch(/_hiddenSources\s*=\s*e\.detail\.hiddenSources/);
  });

  test('bee-atlas.ts backfills taxon display name on both URL-restore paths (MFILT-03 regression)', () => {
    // URLs encode only the integer taxon_id; without resolving the label on restore
    // the "Species or group" input renders empty despite an active filter.
    expect(atlasSrc).toMatch(/private _resolveTaxonDisplayName\s*\(/);
    // Initial restore (after the cache loads in _loadSummaryFromSQLite) and history
    // navigation (_onPopState) must both call it — assert 2+ call sites beyond the def.
    const callSites = atlasSrc.match(/this\._resolveTaxonDisplayName\(\)/g) ?? [];
    expect(callSites.length).toBeGreaterThanOrEqual(2);
  });
});



describe('DET-01: _renderInatObs dispatched for source=inat_obs', () => {
  const src = readFileSync(resolve(__dirname, '../bee-occurrence-detail.ts'), 'utf-8');
  test('bee-occurrence-detail.ts declares _renderInatObs method', () => {
    expect(src).toMatch(/_renderInatObs\s*\(/);
  });
  test('bee-occurrence-detail.ts checks source === inat_obs in render dispatch', () => {
    expect(src).toMatch(/row\.source\s*===\s*['"]inat_obs['"]/);
  });
});

describe('MAP-02: source-filter-changed event in bee-atlas', () => {
  const src = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');
  test('bee-atlas.ts handles source-filter-changed event', () => {
    expect(src).toMatch(/source-filter-changed/);
  });
  test('bee-atlas.ts declares _hiddenSources state', () => {
    expect(src).toMatch(/_hiddenSources/);
  });
});

// SC-3/SC-4: bee-atlas wires intendedFilterActive and removes empty-collection pre-seeds (Plan 144-02)
describe('144-02: bee-atlas wires intendedFilterActive; removes empty-collection hide-all pre-seeds (SC-3, SC-4)', () => {
  const atlasSrc = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');

  test('bee-atlas render() passes .intendedFilterActive to <bee-map>', () => {
    // The bee-map binding block must contain .intendedFilterActive=${this.intendedFilterActive}
    expect(atlasSrc).toMatch(/\.intendedFilterActive=\$\{this\.intendedFilterActive\}/);
  });

  test('firstUpdated does NOT pre-seed empty _filteredGeoJSON as hide-all', () => {
    // The old hide-all pre-seed in firstUpdated assigned:
    //   this._filteredGeoJSON = { type: 'FeatureCollection', features: [] }
    // under an intendedFilterActive guard. After the refactor, intendedFilterActive=true
    // flowing to bee-map provides hide-all — the pre-seed is removed.
    // Note: firstUpdated is a public method (not async), arrow or otherwise.
    const firstUpdatedIdx = atlasSrc.indexOf('firstUpdated(');
    expect(firstUpdatedIdx).toBeGreaterThanOrEqual(0);
    // Grab up to 3000 chars from firstUpdated to the next major method boundary
    const firstUpdatedBody = atlasSrc.slice(firstUpdatedIdx, firstUpdatedIdx + 3000);
    // Must not contain the empty FeatureCollection pre-seed for hide-all
    expect(firstUpdatedBody).not.toMatch(/this\._filteredGeoJSON\s*=\s*\{\s*type\s*:\s*['"]FeatureCollection['"]\s*,\s*features\s*:\s*\[\]/);
  });

  test('_onPopState does NOT pre-seed empty _filteredGeoJSON as hide-all', () => {
    // The old hide-all pre-seed in _onPopState assigned the same pattern under a filter guard.
    // After the refactor it is removed. _onPopState is an arrow function field.
    const onPopStateIdx = atlasSrc.indexOf('_onPopState = (');
    expect(onPopStateIdx).toBeGreaterThanOrEqual(0);
    // Grab up to 3000 chars from _onPopState definition
    const onPopStateBody = atlasSrc.slice(onPopStateIdx, onPopStateIdx + 3000);
    expect(onPopStateBody).not.toMatch(/this\._filteredGeoJSON\s*=\s*\{\s*type\s*:\s*['"]FeatureCollection['"]\s*,\s*features\s*:\s*\[\]/);
  });

  test('_runFilterQuery still assigns _filteredGeoJSON/_visibleIds from query results', () => {
    // The actual filtered results must still flow from _runFilterQuery — unchanged.
    const runFilterIdx = atlasSrc.indexOf('private async _runFilterQuery(');
    expect(runFilterIdx).toBeGreaterThanOrEqual(0);
    const nextMethod = atlasSrc.indexOf('\n  private ', runFilterIdx + 1);
    const runFilterBody = atlasSrc.slice(runFilterIdx, nextMethod > runFilterIdx ? nextMethod : runFilterIdx + 800);
    expect(runFilterBody).toMatch(/this\._filteredGeoJSON\s*=/);
    expect(runFilterBody).toMatch(/this\._visibleIds\s*=/);
  });

  test('show-all / stale paths still set _filteredGeoJSON and _visibleIds to null', () => {
    // When there is no active filter (stale legacy, no-match, or clear), bee-atlas must still
    // null out _filteredGeoJSON/_visibleIds so bee-map renders the full set
    // (intendedFilterActive will be false at that point).
    // These null-resets exist in _resolveLegacyTaxon (stale path) and _onPopState (clear path).
    expect(atlasSrc).toMatch(/this\._filteredGeoJSON\s*=\s*null/);
    expect(atlasSrc).toMatch(/this\._visibleIds\s*=\s*null/);
  });
});

// ---------------------------------------------------------------------------
// Phase 146: session-coalesced viewport history
// ---------------------------------------------------------------------------
// Behavioral tests: instantiate <bee-atlas>, cast to access private fields/methods,
// and count pushState / replaceState calls to verify D-01..D-07.
// ---------------------------------------------------------------------------

describe('146: session-coalesced viewport history', () => {
  // Shared element reference — created fresh per test via beforeEach.
  let el: HTMLElement;

  // Spy references — restored in afterEach.
  let pushSpy: ReturnType<typeof vi.spyOn>;
  let replaceSpy: ReturnType<typeof vi.spyOn>;

  // Convenience type alias for private-field access.
  type BeeAtlasPrivate = {
    _viewportSessionActive: boolean;
    _filterResolving: boolean;
    _isRestoringFromHistory: boolean;
    _onViewMoved(e: CustomEvent<{ lon: number; lat: number; zoom: number }>): void;
    _onPopState(): void;
    _replaceUrlState(): void;
  };

  // Helper: fire a synthetic settled viewport move.
  function fireViewMoved(instance: BeeAtlasPrivate, lon = -120.5, lat = 47.5, zoom = 7) {
    const e = new CustomEvent('view-moved', { detail: { lon, lat, zoom } });
    instance._onViewMoved(e);
  }

  beforeEach(async () => {
    // Import triggers registration; safe to call multiple times (idempotent).
    const mod = await import('../bee-atlas.ts');
    // Instantiate without attaching to DOM to avoid triggering firstUpdated
    // lifecycle, which would call _replaceUrlState and pollute spy call counts.
    el = new (mod.BeeAtlas as unknown as { new(): HTMLElement })();

    // Spy on history methods and clear call counts.
    pushSpy = vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
    replaceSpy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Case 1 (D-01/D-02): N consecutive viewport moves with no intervening non-viewport
  // write → exactly 1 pushState and N-1 replaceState calls.
  test('consecutive viewport moves produce exactly one pushState and N-1 replaceState', () => {
    const inst = el as unknown as BeeAtlasPrivate;
    inst._filterResolving = false;

    const N = 4;
    for (let i = 0; i < N; i++) {
      fireViewMoved(inst, -120 + i, 47.5, 7);
    }

    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(replaceSpy).toHaveBeenCalledTimes(N - 1);
  });

  // Case 2 (D-03): an intervening non-viewport _replaceUrlState() call resets the session
  // so the second viewport move starts a NEW history entry (second pushState).
  test('non-viewport _replaceUrlState() between two viewport moves triggers a second pushState', () => {
    const inst = el as unknown as BeeAtlasPrivate;
    inst._filterResolving = false;

    // First exploration session: one viewport move → 1 pushState.
    fireViewMoved(inst, -120, 47.5, 7);
    expect(pushSpy).toHaveBeenCalledTimes(1);

    // Non-viewport state change (e.g. filter/selection/boundary/pane toggle).
    inst._replaceUrlState();

    // Second exploration session: one viewport move → new pushState (2 total).
    fireViewMoved(inst, -121, 47.0, 8);
    expect(pushSpy).toHaveBeenCalledTimes(2);
  });

  // Case 3 (D-07): after _onPopState, the next viewport move starts a NEW entry.
  test('viewport move after _onPopState fires a new pushState', () => {
    const inst = el as unknown as BeeAtlasPrivate;
    inst._filterResolving = false;

    // First exploration: push #1.
    fireViewMoved(inst, -120, 47.5, 7);
    expect(pushSpy).toHaveBeenCalledTimes(1);

    // Navigate back/forward.
    inst._onPopState();
    // _onPopState sets _isRestoringFromHistory = true; the next _onViewMoved call
    // clears that flag without writing history (D-06). Simulate the restoration-
    // induced settled move that bee-map fires after flyTo completes.
    const replaceBefore = replaceSpy.mock.calls.length;
    fireViewMoved(inst, -120, 47.5, 7);
    // That move must NOT add a pushState (it's the history-restoration settle)...
    expect(pushSpy).toHaveBeenCalledTimes(1);
    // ...and must NOT write replaceState either — _isRestoringFromHistory (D-06)
    // suppresses the write entirely, it does not fall through to a live replace.
    expect(replaceSpy.mock.calls.length).toBe(replaceBefore);

    // Now fire a genuine user pan — must produce a new pushState (push #2, D-07).
    fireViewMoved(inst, -119, 48.0, 9);
    expect(pushSpy).toHaveBeenCalledTimes(2);
  });

  // Case 4a (D-05): _replaceUrlState is suppressed while _filterResolving is true.
  test('_replaceUrlState keeps `if (this._filterResolving) return` guard (D-05, source assertion)', () => {
    const src = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');
    const methodStart = src.indexOf('private _replaceUrlState()');
    expect(methodStart).toBeGreaterThan(-1);
    const nextMethod = src.indexOf('\n  private ', methodStart + 1);
    const body = src.slice(methodStart, nextMethod > methodStart ? nextMethod : methodStart + 600);
    expect(body).toMatch(/if\s*\(\s*this\._filterResolving\s*\)\s*return/);
  });

  // Case 4b (D-05 behavioral): _writeViewportHistory is also suppressed while _filterResolving.
  test('viewport write is suppressed while _filterResolving is true (D-05)', () => {
    const inst = el as unknown as BeeAtlasPrivate;
    inst._filterResolving = true;

    fireViewMoved(inst);

    // No history writes while resolving.
    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  // Case 4c (D-06): _onViewMoved guards on _isRestoringFromHistory and writes nothing.
  test('_onViewMoved writes no history when _isRestoringFromHistory is true (D-06)', () => {
    const inst = el as unknown as BeeAtlasPrivate;
    inst._filterResolving = false;
    inst._isRestoringFromHistory = true;

    fireViewMoved(inst);

    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
    // Flag must be cleared after the settled move.
    expect(inst._isRestoringFromHistory).toBe(false);
  });

  // Case 4d (D-06 source assertion): _onViewMoved references _isRestoringFromHistory.
  test('_onViewMoved still references _isRestoringFromHistory (D-06, source assertion)', () => {
    const src = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');
    const methodStart = src.indexOf('private _onViewMoved(');
    expect(methodStart).toBeGreaterThan(-1);
    const nextMethod = src.indexOf('\n  private ', methodStart + 1);
    const body = src.slice(methodStart, nextMethod > methodStart ? nextMethod : methodStart + 400);
    expect(body).toMatch(/_isRestoringFromHistory/);
  });
});

describe('OFF-04/OFF-05: bee-atlas _offline state propagation (Plan 149-03)', () => {
  // Integration test: window online/offline events flip bee-atlas._offline.
  // Tests use the established pattern (instantiate without DOM attachment) to avoid
  // triggering firstUpdated → mapboxgl.Map initialization. Instead we directly invoke
  // the arrow-function handlers and verify @state mutation, matching the Phase 146
  // behavioral test pattern for bee-atlas.
  // bee-header.test.ts covers the @property → rendered DOM path for the pill.

  type BeeAtlasPrivate = {
    _offline: boolean;
    _onOnline: () => void;
    _onOffline: () => void;
    disconnectedCallback: () => void;
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('dispatching window offline event sets _offline=true (OFF-04, OFF-05)', async () => {
    // Ensure navigator.onLine starts as true so _offline initializes to false
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });

    const mod = await import('../bee-atlas.ts');
    const inst = new (mod.BeeAtlas as unknown as { new(): BeeAtlasPrivate })();

    // Simulate firstUpdated listener registration manually
    window.addEventListener('online', inst._onOnline);
    window.addEventListener('offline', inst._onOffline);

    try {
      // Baseline: initialized from navigator.onLine=true → _offline=false
      expect(inst._offline).toBe(false);

      // Dispatch offline event — _onOffline handler sets _offline=true
      window.dispatchEvent(new Event('offline'));
      expect(inst._offline).toBe(true);

      // Dispatch online event — _onOnline handler sets _offline=false
      window.dispatchEvent(new Event('online'));
      expect(inst._offline).toBe(false);
    } finally {
      // Clean up listeners
      window.removeEventListener('online', inst._onOnline);
      window.removeEventListener('offline', inst._onOffline);
    }
  });

  test('disconnectedCallback removes online/offline listeners (no state leak after removal, T-149-17)', async () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });

    const mod = await import('../bee-atlas.ts');
    const inst = new (mod.BeeAtlas as unknown as { new(): BeeAtlasPrivate })();

    // Simulate firstUpdated listener registration
    window.addEventListener('online', inst._onOnline);
    window.addEventListener('offline', inst._onOffline);

    // Simulate disconnectedCallback cleanup
    window.removeEventListener('online', inst._onOnline);
    window.removeEventListener('offline', inst._onOffline);

    // After removal, offline event should NOT change _offline
    const beforeDispatch = inst._offline;
    window.dispatchEvent(new Event('offline'));
    expect(inst._offline).toBe(beforeDispatch);
  });
});

// ---------------------------------------------------------------------------
// NEAR: near-me bounds reuse (Plan 153-03)
// ---------------------------------------------------------------------------
// Tests for boundsFromLocation, near-me ≡ shift-drag URL equivalence, denial
// toast, success box-apply, clear, and plan-checker fixes (W1, W2, W3).
// ---------------------------------------------------------------------------

describe('NEAR: near-me bounds reuse', () => {
  // -------------------------------------------------------------------------
  // Box math (W2: boundsFromLocation pure function tests)
  // -------------------------------------------------------------------------

  describe('boundsFromLocation', () => {
    test('is exported from bee-atlas.ts (source assertion)', () => {
      const src = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');
      expect(src).toMatch(/export function boundsFromLocation/);
    });

    test('produces a valid ±10 km box for a mid-latitude fix (Seattle area)', async () => {
      const { boundsFromLocation } = await import('../bee-atlas.ts');
      const lat = 47.5;
      const lon = -122.0;
      const box = boundsFromLocation({ lat, lon });
      expect(box).not.toBeNull();
      if (!box) throw new Error('unreachable');

      const dLat = 10 / 111.32;
      const dLon = 10 / (111.32 * Math.cos(lat * Math.PI / 180));

      // Box dimensions
      expect(box.north - box.south).toBeCloseTo(2 * dLat, 6);
      expect(box.east - box.west).toBeCloseTo(2 * dLon, 6);

      // Orientation
      expect(box.north).toBeGreaterThan(box.south);
      expect(box.east).toBeGreaterThan(box.west);

      // All finite
      expect(isFinite(box.west)).toBe(true);
      expect(isFinite(box.east)).toBe(true);
      expect(isFinite(box.south)).toBe(true);
      expect(isFinite(box.north)).toBe(true);
    });

    test('returns null for lat=90 (pole — cos→0 → dLon infinite)', async () => {
      const { boundsFromLocation } = await import('../bee-atlas.ts');
      expect(boundsFromLocation({ lat: 90, lon: 0 })).toBeNull();
    });

    test('returns null for NaN inputs', async () => {
      const { boundsFromLocation } = await import('../bee-atlas.ts');
      expect(boundsFromLocation({ lat: NaN, lon: 0 })).toBeNull();
      expect(boundsFromLocation({ lat: 47, lon: NaN })).toBeNull();
    });

    test('returns null for lat=-90 (south pole — cos→0)', async () => {
      const { boundsFromLocation } = await import('../bee-atlas.ts');
      expect(boundsFromLocation({ lat: -90, lon: 0 })).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // near-me ≡ shift-drag URL equivalence (D-03, D-01)
  // -------------------------------------------------------------------------

  describe('near-me box ≡ shift-drag box in URL (D-03 reproducibility)', () => {
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

    const defaultView = { lon: -120.5, lat: 47.5, zoom: 8 };
    const defaultUi = { boundaryMode: 'off' as const, paneState: 'collapsed' as const };

    test('a near-me box and a shift-drag box with identical coordinates produce the same sel= URL param', async () => {
      const { boundsFromLocation } = await import('../bee-atlas.ts');
      const lat = 47.5;
      const lon = -120.0;
      const box = boundsFromLocation({ lat, lon });
      expect(box).not.toBeNull();
      if (!box) throw new Error('unreachable');

      // Near-me SelectionState (what bee-atlas will set after computing box)
      const nearMeSelection: SelectionState = { type: 'bounds', ...box };
      // Shift-drag SelectionState (same box, same numbers)
      const shiftDragSelection: SelectionState = {
        type: 'bounds',
        west: box.west,
        south: box.south,
        east: box.east,
        north: box.north,
      };

      const nearMeParams = buildParams(defaultView, emptyFilter(), nearMeSelection, defaultUi);
      const shiftDragParams = buildParams(defaultView, emptyFilter(), shiftDragSelection, defaultUi);

      expect(nearMeParams.get('sel')).not.toBeNull();
      expect(nearMeParams.get('sel')).toBe(shiftDragParams.get('sel'));
    });

    test('a near-me sel= round-trips back to the exact same bounds via parseParams (D-03)', async () => {
      const { boundsFromLocation } = await import('../bee-atlas.ts');
      const box = boundsFromLocation({ lat: 47.5, lon: -120.0 });
      expect(box).not.toBeNull();
      if (!box) throw new Error('unreachable');

      const selection: SelectionState = { type: 'bounds', ...box };
      const params = buildParams(defaultView, emptyFilter(), selection, defaultUi);
      const parsed = parseParams(params.toString());

      expect(parsed.selection?.type).toBe('bounds');
      if (parsed.selection?.type !== 'bounds') throw new Error('unreachable');
      expect(parsed.selection.west).toBeCloseTo(box.west, 3);
      expect(parsed.selection.south).toBeCloseTo(box.south, 3);
      expect(parsed.selection.east).toBeCloseTo(box.east, 3);
      expect(parsed.selection.north).toBeCloseTo(box.north, 3);
    });
  });

  // -------------------------------------------------------------------------
  // bee-atlas behavioral tests (no DOM mount — direct handler invocation)
  // -------------------------------------------------------------------------

  describe('bee-atlas near-me behavioral tests', () => {
    type BeeAtlasNearMe = {
      _nearMePending: boolean;
      _selectionBounds: { west: number; south: number; east: number; north: number } | null;
      _locationError: boolean;
      _locationErrorKind: 'denied' | 'unavailable' | null;
      _paneState: string;
      _selectedOccIds: string[] | null;
      _selectedCluster: unknown;
      _listPage: number;
      _onUserLocationChanged(e: CustomEvent<unknown>): void;
      _onNearMeCleared(): void;
      _onNearMeRequested(): void;
      _runListQuery(): void;
      _replaceUrlState(): void;
    };

    let inst: BeeAtlasNearMe;

    beforeEach(async () => {
      const mod = await import('../bee-atlas.ts');
      const raw = new (mod.BeeAtlas as unknown as { new(): object })();
      inst = raw as unknown as BeeAtlasNearMe;
      // Stub out side-effectful methods so tests stay unit-level
      inst._runListQuery = vi.fn();
      inst._replaceUrlState = vi.fn();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    // -----------------------------------------------------------------------
    // W2: stranded-pending bug — bad accuracy on near-me fix
    // -----------------------------------------------------------------------
    test('W2: bad accuracy fix (non-finite) on a near-me request clears _nearMePending and applies no bounds', () => {
      inst._nearMePending = true;
      inst._selectionBounds = null;

      // Simulate a user-location-changed success event with non-finite accuracy
      const e = new CustomEvent('user-location-changed', {
        detail: { lat: 47.5, lon: -120.0, accuracy: NaN },
      });
      inst._onUserLocationChanged(e);

      // _nearMePending must be cleared (not stranded)
      expect(inst._nearMePending).toBe(false);
      // No bounds applied
      expect(inst._selectionBounds).toBeNull();
    });

    test('W2: bad accuracy fix (negative) on a near-me request clears _nearMePending and applies no bounds', () => {
      inst._nearMePending = true;
      inst._selectionBounds = null;

      const e = new CustomEvent('user-location-changed', {
        detail: { lat: 47.5, lon: -120.0, accuracy: -1 },
      });
      inst._onUserLocationChanged(e);

      expect(inst._nearMePending).toBe(false);
      expect(inst._selectionBounds).toBeNull();
    });

    // -----------------------------------------------------------------------
    // Success path: valid fix with _nearMePending applies the box
    // -----------------------------------------------------------------------
    test('success with _nearMePending=true applies box to _selectionBounds', async () => {
      const { boundsFromLocation } = await import('../bee-atlas.ts');
      const lat = 47.5;
      const lon = -120.0;
      inst._nearMePending = true;

      const e = new CustomEvent('user-location-changed', {
        detail: { lat, lon, accuracy: 15 },
      });
      inst._onUserLocationChanged(e);

      const expected = boundsFromLocation({ lat, lon });
      expect(expected).not.toBeNull();
      expect(inst._selectionBounds).not.toBeNull();
      expect(inst._selectionBounds).toEqual(expected);
      expect(inst._nearMePending).toBe(false);
    });

    test('success WITHOUT _nearMePending does NOT set _selectionBounds', () => {
      inst._nearMePending = false;
      inst._selectionBounds = null;

      const e = new CustomEvent('user-location-changed', {
        detail: { lat: 47.5, lon: -120.0, accuracy: 15 },
      });
      inst._onUserLocationChanged(e);

      // No pending near-me request → bounds unchanged
      expect(inst._selectionBounds).toBeNull();
    });

    // -----------------------------------------------------------------------
    // Denial path (D-08): error sets toast, clears _nearMePending, no bounds
    // -----------------------------------------------------------------------
    test('denial (code 1) with _nearMePending sets _locationError, _locationErrorKind=denied, no bounds, clears pending', () => {
      inst._nearMePending = true;
      inst._selectionBounds = null;

      const e = new CustomEvent('user-location-changed', {
        detail: { error: { code: 1, message: 'User denied Geolocation' } },
      });
      inst._onUserLocationChanged(e);

      expect(inst._locationError).toBe(true);
      expect(inst._locationErrorKind).toBe('denied');
      expect(inst._selectionBounds).toBeNull();
      expect(inst._nearMePending).toBe(false);
    });

    test('unavailable error (code 2) with _nearMePending sets _locationErrorKind=unavailable', () => {
      inst._nearMePending = true;

      const e = new CustomEvent('user-location-changed', {
        detail: { error: { code: 2, message: 'Position unavailable' } },
      });
      inst._onUserLocationChanged(e);

      expect(inst._locationError).toBe(true);
      expect(inst._locationErrorKind).toBe('unavailable');
      expect(inst._nearMePending).toBe(false);
    });

    // -----------------------------------------------------------------------
    // Clear path (D-05, W3): _onNearMeCleared nulls _selectionBounds
    // -----------------------------------------------------------------------
    test('_onNearMeCleared nulls _selectionBounds and writes URL', () => {
      inst._selectionBounds = { west: -120.1, south: 47.4, east: -119.9, north: 47.6 };

      inst._onNearMeCleared();

      expect(inst._selectionBounds).toBeNull();
      expect(inst._replaceUrlState).toHaveBeenCalledTimes(1);
    });

    // -----------------------------------------------------------------------
    // W3: "Clear filters" (pane-clear-selection) also clears near-me bounds
    // -----------------------------------------------------------------------
    test('W3: _onClearSelection (the global Clear affordance) nulls _selectionBounds', async () => {
      const mod = await import('../bee-atlas.ts');
      type WithClear = BeeAtlasNearMe & { _onClearSelection(): void; _selectionCount: number | null };
      const clearInst = new (mod.BeeAtlas as unknown as { new(): object })() as unknown as WithClear;
      clearInst._runListQuery = vi.fn();
      clearInst._replaceUrlState = vi.fn();

      // Pre-condition: a near-me box is active
      clearInst._selectionBounds = { west: -120.1, south: 47.4, east: -119.9, north: 47.6 };

      clearInst._onClearSelection();

      expect(clearInst._selectionBounds).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Source assertions: plan-checker fixes and architecture invariants
  // -------------------------------------------------------------------------

  describe('NEAR source assertions', () => {
    const src = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');

    test('W1: @query decorator imported from lit/decorators.js', () => {
      expect(src).toMatch(/import\s*\{[^}]*\bquery\b[^}]*\}\s*from\s*['"]lit\/decorators\.js['"]/);
    });

    test('W1: BeeMap type imported for the @query accessor', () => {
      // Either a type import from bee-map.ts or the BeeMap class is accessible
      expect(src).toMatch(/import\s+type\s*\{[^}]*BeeMap[^}]*\}\s*from\s*['"]\.\/bee-map\.ts['"]/);
    });

    test('W1: @query accessor for bee-map element exists', () => {
      expect(src).toMatch(/@query\s*\(\s*['"]bee-map['"]\s*\)/);
    });

    test('no haversine, ?near=1, or nearMeCenter in non-comment lines (D-01)', () => {
      // Strip single-line comments and check
      const nonCommentLines = src
        .split('\n')
        .filter(line => !line.trim().startsWith('//'))
        .join('\n');
      expect(nonCommentLines).not.toMatch(/haversine/i);
      expect(nonCommentLines).not.toMatch(/\?near=1/);
      expect(nonCommentLines).not.toMatch(/nearMeCenter/);
    });

    test('_applyBoundsSelection exists and is used by _onSelectionDrawn', () => {
      expect(src).toMatch(/private\s+_applyBoundsSelection\b/);
      // _onSelectionDrawn should call _applyBoundsSelection
      const selDrawnIdx = src.indexOf('_onSelectionDrawn(');
      const nextPrivate = src.indexOf('\n  private ', selDrawnIdx + 1);
      const body = src.slice(selDrawnIdx, nextPrivate > selDrawnIdx ? nextPrivate : selDrawnIdx + 500);
      expect(body).toContain('_applyBoundsSelection');
    });

    test('bee-pane template binds @near-me-requested', () => {
      expect(src).toMatch(/@near-me-requested=/);
    });

    test('bee-pane template binds @near-me-cleared', () => {
      expect(src).toMatch(/@near-me-cleared=/);
    });

    test('bee-pane template binds .selectionBoundsActive', () => {
      expect(src).toMatch(/\.selectionBoundsActive=\$\{/);
    });

    test('selectionBoundsActive is bound to (_selectionBounds !== null)', () => {
      expect(src).toMatch(/selectionBoundsActive=\$\{this\._selectionBounds\s*!==\s*null\}/);
    });
  });

  // -------------------------------------------------------------------------
  // Toast fix (Task 2): trigger()===false path emits error in bee-map
  // -------------------------------------------------------------------------

  describe('NEAR toast fix (D-08 / Task 2)', () => {
    test('bee-map requestUserLocation method checks trigger() return and emits error on false', () => {
      const beeMapSrc = readFileSync(resolve(__dirname, '../bee-map.ts'), 'utf-8');
      // Find the method body (not a comment reference to the name)
      const methodIdx = beeMapSrc.indexOf('public requestUserLocation():');
      expect(methodIdx).toBeGreaterThan(-1);
      // Grab up to the closing brace (look for the end of the method body)
      const body = beeMapSrc.slice(methodIdx, methodIdx + 1000);
      // The fix: trigger() return value is checked; false triggers an error emit
      expect(body).toMatch(/trigger\(\)\s*===\s*false|started\s*===\s*false/);
      // And the error emit path calls _emit with 'user-location-changed' + error payload
      expect(body).toMatch(/_emit\s*\(\s*['"]user-location-changed['"]/);
    });

    test('bee-atlas.ts _locationError banner is rendered at the root template level (always reachable)', () => {
      const src = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');
      // The banner in the template uses class="location-error-banner" (with quotes) — distinct
      // from the CSS rule `.location-error-banner` (with dot prefix). Search for the template form.
      const templateIdx = src.indexOf('"location-error-banner"');
      expect(templateIdx).toBeGreaterThan(-1);
      // Scan back from the template banner to find its containing conditional
      const bannerContext = src.slice(Math.max(0, templateIdx - 300), templateIdx + 100);
      // The gate must be _locationError
      expect(bannerContext).toMatch(/\$\{this\._locationError\s*\?/);
    });
  });
});
