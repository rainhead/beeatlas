import { test, expect, describe, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Mock heavy modules that have module-level side effects incompatible with happy-dom
vi.mock('../duckdb.ts', () => ({
  getDuckDB: vi.fn(() => Promise.resolve({})),
  loadAllTables: vi.fn(() => Promise.resolve()),
  tablesReady: Promise.resolve(),
}));

vi.mock('../features.ts', () => ({
  EcdysisSource: vi.fn().mockImplementation(() => ({
    once: vi.fn(),
    on: vi.fn(),
    getFeatures: vi.fn(() => []),
    un: vi.fn(),
  })),
  SampleSource: vi.fn().mockImplementation(() => ({
    once: vi.fn(),
    on: vi.fn(),
    getFeatures: vi.fn(() => []),
    un: vi.fn(),
  })),
}));

vi.mock('../region-layer.ts', () => ({
  regionLayer: {
    setVisible: vi.fn(),
    setSource: vi.fn(),
    setStyle: vi.fn(),
    changed: vi.fn(),
    getFeatures: vi.fn(() => Promise.resolve([])),
  },
  countySource: {
    once: vi.fn(),
    getFeatures: vi.fn(() => []),
    loadFeatures: vi.fn(),
  },
  ecoregionSource: {
    once: vi.fn(),
    getFeatures: vi.fn(() => []),
    loadFeatures: vi.fn(),
  },
  makeRegionStyleFn: vi.fn(() => vi.fn()),
  boundaryStyle: {},
  selectedBoundaryStyle: {},
}));

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
    expect(props.has('layerMode')).toBe(true);
    expect(props.has('boundaryMode')).toBe(true);
    expect(props.has('visibleEcdysisIds')).toBe(true);
    expect(props.has('visibleSampleIds')).toBe(true);
    expect(props.has('viewState')).toBe(true);
    expect(props.has('panTo')).toBe(true);
    expect(props.has('filterState')).toBe(true);
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

describe('DISC-02: feed index fetch and activeFeedEntries computation', () => {
  const src = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');

  test('bee-atlas.ts declares _feedIndex as a private field', () => {
    expect(src).toMatch(/private\s+_feedIndex/);
  });

  test('bee-atlas.ts declares _activeFeedEntries as @state()', () => {
    expect(src).toMatch(/@state\(\)\s+private\s+_activeFeedEntries/);
  });

  test('bee-atlas.ts fetches feeds/index.json', () => {
    expect(src).toMatch(/feeds\/index\.json/);
  });

  test('bee-atlas.ts defines _computeActiveFeedEntries method', () => {
    expect(src).toMatch(/private\s+_computeActiveFeedEntries/);
  });

  test('bee-atlas.ts passes activeFeedEntries to bee-sidebar', () => {
    expect(src).toMatch(/\.activeFeedEntries=\$\{this\._activeFeedEntries\}/);
  });

  test('bee-atlas.ts calls _computeActiveFeedEntries in _onFilterChanged', () => {
    // Extract _onFilterChanged method body and check it calls _computeActiveFeedEntries
    expect(src).toMatch(/this\._computeActiveFeedEntries\(\)/);
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

  test('bee-atlas.ts listens for view-changed event on bee-sidebar', () => {
    expect(src).toMatch(/@view-changed=\$\{this\._onViewChanged\}/);
  });

  test('bee-atlas.ts passes viewMode property to bee-sidebar', () => {
    expect(src).toMatch(/\.viewMode=\$\{this\._viewMode\}/);
  });

  test('bee-atlas.ts _onPopState restores _viewMode from URL', () => {
    expect(src).toMatch(/this\._viewMode\s*=\s*parsed\.ui\?\.viewMode\s*\?\?\s*'map'/);
  });
});
