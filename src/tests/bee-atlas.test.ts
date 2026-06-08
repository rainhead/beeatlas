import { test, expect, describe, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  }));
  return {
    default: {
      accessToken: '',
      Map: MapMock,
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

  test('SEL-07: _onSelectionDrawn sets _selectionBounds and calls _runListQuery', () => {
    const methodStart = src.indexOf('private async _onSelectionDrawn(');
    const nextPrivate = src.indexOf('\n  private ', methodStart + 1);
    const methodBody = src.slice(methodStart, nextPrivate > methodStart ? nextPrivate : undefined);
    // Plan 109-02: _onSelectionDrawn now sets _selectionBounds (not clears it) and calls _runListQuery
    expect(methodBody).toContain('this._selectionBounds = e.detail');
    expect(methodBody).toContain('_runListQuery');
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
