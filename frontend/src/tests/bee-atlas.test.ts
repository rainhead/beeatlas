import { test, expect, describe, vi } from 'vitest';
import { readFileSync } from 'node:fs';
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

vi.mock('../region-layer.ts', () => ({
  loadBoundaries: vi.fn(),
  makeRegionStyleFn: vi.fn(() => vi.fn()),
}));

vi.mock('mapbox-gl', () => {
  const MapMock = vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    remove: vi.fn(),
    getCenter: vi.fn(() => ({ lng: -120.5, lat: 47.5 })),
    getZoom: vi.fn(() => 7),
    addSource: vi.fn(),
    addLayer: vi.fn(),
    getSource: vi.fn(() => ({ setData: vi.fn() })),
    setFilter: vi.fn(),
    isStyleLoaded: vi.fn(() => true),
    jumpTo: vi.fn(),
    flyTo: vi.fn(),
    resize: vi.fn(),
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

  test('bee-sidebar.ts does not import bee-map or bee-atlas', () => {
    const sidebarSource = readFileSync(resolve(__dirname, '../bee-sidebar.ts'), 'utf-8');
    expect(sidebarSource).not.toMatch(/from\s+['"]\.\/bee-map/);
    expect(sidebarSource).not.toMatch(/from\s+['"]\.\/bee-atlas/);
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

  test('bee-atlas.ts declares _sidebarOpen as @state()', () => {
    expect(src).toMatch(/@state\(\)\s+private\s+_sidebarOpen/);
  });

  test('bee-atlas.ts sets _sidebarOpen = true in _onSpecimenClick', () => {
    expect(src).toMatch(/this\._sidebarOpen\s*=\s*true/);
  });

  test('bee-atlas.ts sets _sidebarOpen = false in _onClose', () => {
    expect(src).toMatch(/this\._sidebarOpen\s*=\s*false/);
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

  test('bee-atlas.ts contains bee-table element (replaces table-slot placeholder)', () => {
    expect(src).toMatch(/<bee-table/);
  });

  test('bee-atlas.ts contains bee-table CSS rule in static styles (replaces .table-slot)', () => {
    expect(src).toMatch(/bee-table\s*\{/);
  });

  test('bee-atlas.ts declares _viewMode as @state field', () => {
    expect(src).toMatch(/@state\(\)\s+private\s+_viewMode/);
  });

  test('bee-atlas.ts _onPopState restores _viewMode from URL', () => {
    expect(src).toMatch(/this\._viewMode\s*=\s*parsed\.ui\?\.viewMode\s*\?\?\s*'map'/);
  });
});
