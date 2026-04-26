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

describe('FILTER-PANEL: bee-filter-panel property interface', () => {
  test('BeeFilterPanel has @property declarations for filterState, taxaOptions, countyOptions, ecoregionOptions, collectorOptions, summary', async () => {
    const { BeeFilterPanel } = await import('../bee-filter-panel.ts');
    const props = (BeeFilterPanel as unknown as { elementProperties: Map<string, unknown> }).elementProperties;
    expect(props.has('filterState')).toBe(true);
    expect(props.has('taxaOptions')).toBe(true);
    expect(props.has('countyOptions')).toBe(true);
    expect(props.has('ecoregionOptions')).toBe(true);
    expect(props.has('collectorOptions')).toBe(true);
    expect(props.has('summary')).toBe(true);
  });
});

describe('FILTER-PANEL: bee-filter-panel source structure', () => {
  test('bee-filter-panel.ts source registers custom element tag bee-filter-panel', () => {
    const src = readFileSync(resolve(__dirname, '../bee-filter-panel.ts'), 'utf-8');
    expect(src).toMatch(/@customElement\(['"]bee-filter-panel['"]\)/);
  });

  test('bee-filter-panel.ts source contains isFilterActive import', () => {
    const src = readFileSync(resolve(__dirname, '../bee-filter-panel.ts'), 'utf-8');
    expect(src).toMatch(/isFilterActive/);
  });

  test('bee-filter-panel.ts source contains active CSS class for filter-btn', () => {
    const src = readFileSync(resolve(__dirname, '../bee-filter-panel.ts'), 'utf-8');
    expect(src).toMatch(/filter-btn.*active|active.*filter-btn/);
  });

  test('bee-filter-panel.ts source contains four section headers (What, Who, Where, When)', () => {
    const src = readFileSync(resolve(__dirname, '../bee-filter-panel.ts'), 'utf-8');
    expect(src).toMatch(/What/);
    expect(src).toMatch(/Who/);
    expect(src).toMatch(/Where/);
    expect(src).toMatch(/When/);
  });
});

describe('FILTER-PANEL: bee-filter-controls localStorage removal', () => {
  test('bee-filter-controls.ts source does not contain localStorage', () => {
    const src = readFileSync(resolve(__dirname, '../bee-filter-controls.ts'), 'utf-8');
    expect(src).not.toMatch(/localStorage/);
  });

  test('bee-filter-controls.ts source does not contain RECENTS_KEY', () => {
    const src = readFileSync(resolve(__dirname, '../bee-filter-controls.ts'), 'utf-8');
    expect(src).not.toMatch(/RECENTS_KEY/);
  });

  test('bee-filter-controls.ts source does not contain saveRecentToken', () => {
    const src = readFileSync(resolve(__dirname, '../bee-filter-controls.ts'), 'utf-8');
    expect(src).not.toMatch(/saveRecentToken/);
  });
});

describe('FILTER-PANEL: bee-atlas integration', () => {
  test('bee-atlas.ts source imports bee-filter-panel, not bee-filter-toolbar', () => {
    const src = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');
    expect(src).toMatch(/import.*bee-filter-panel/);
    expect(src).not.toMatch(/import.*bee-filter-toolbar/);
  });

  test('bee-atlas.ts source renders bee-filter-panel element', () => {
    const src = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');
    expect(src).toMatch(/bee-filter-panel/);
  });

  test('bee-atlas.ts source does not render bee-filter-toolbar element', () => {
    const src = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');
    expect(src).not.toMatch(/<bee-filter-toolbar/);
  });
});
