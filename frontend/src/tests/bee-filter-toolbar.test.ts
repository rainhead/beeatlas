import { readFileSync } from 'fs';
import { resolve } from 'path';
import { test, expect, describe, vi } from 'vitest';

// Mock heavy modules that have module-level side effects incompatible with happy-dom
vi.mock('../sqlite.ts', () => ({
  getDB: vi.fn(() => Promise.resolve({ sqlite3: {}, db: 0 })),
  loadOccurrencesTable: vi.fn(() => Promise.resolve()),
  tablesReady: Promise.resolve(),
}));

vi.mock('../features.ts', () => ({
  OccurrenceSource: vi.fn().mockImplementation(() => ({
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

describe('FILT-08: bee-filter-toolbar property interface', () => {
  test('BeeFilterToolbar has @property declarations for filterState, taxaOptions, countyOptions, ecoregionOptions, collectorOptions, summary, layerMode', async () => {
    const { BeeFilterToolbar } = await import('../bee-filter-toolbar.ts');
    const props = (BeeFilterToolbar as unknown as { elementProperties: Map<string, unknown> }).elementProperties;
    expect(props.has('filterState')).toBe(true);
    expect(props.has('taxaOptions')).toBe(true);
    expect(props.has('countyOptions')).toBe(true);
    expect(props.has('ecoregionOptions')).toBe(true);
    expect(props.has('collectorOptions')).toBe(true);
    expect(props.has('summary')).toBe(true);
    expect(props.has('layerMode')).toBe(true);
  });
});

describe('FILT-08: bee-filter-toolbar structure', () => {
  test('bee-filter-toolbar.ts source contains bee-filter-controls sub-component tag', () => {
    const src = readFileSync(resolve(__dirname, '../bee-filter-toolbar.ts'), 'utf-8');
    expect(src).toMatch(/bee-filter-controls/);
  });

  test('bee-filter-toolbar.ts source contains role="toolbar"', () => {
    const src = readFileSync(resolve(__dirname, '../bee-filter-toolbar.ts'), 'utf-8');
    expect(src).toMatch(/role="toolbar"/);
  });
});

describe('FILT-09: csv-download event', () => {
  test('bee-filter-toolbar.ts source contains csv-download event string', () => {
    const src = readFileSync(resolve(__dirname, '../bee-filter-toolbar.ts'), 'utf-8');
    expect(src).toMatch(/csv-download/);
  });

  test('bee-filter-toolbar.ts source contains a download icon button', () => {
    const src = readFileSync(resolve(__dirname, '../bee-filter-toolbar.ts'), 'utf-8');
    expect(src).toMatch(/download-btn/);
  });
});
