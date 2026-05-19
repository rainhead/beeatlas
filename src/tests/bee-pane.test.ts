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
    summary: { totalSpecimens: 0, speciesCount: 0, genusCount: 0, familyCount: 0, earliestYear: 0, latestYear: 0 },
    taxaOptions: [],
  })),
}));

const src = readFileSync(resolve(__dirname, '../bee-pane.ts'), 'utf-8');

describe('PANE-01: persistent toggle button', () => {
  test('bee-pane.ts declares a toggle-btn CSS class', () => {
    expect(src).toMatch(/\.toggle-btn\b/);
  });

  test('bee-pane.ts renders toggle button outside paneState conditionals', () => {
    // toggle-btn must appear in render() output before the first list-state conditional
    expect(src).toMatch(/class="toggle-btn"/);
    // Assert toggle-btn appears in render() before paneState === 'list' conditional
    expect(src).toMatch(/render\(\)[\s\S]*?class="toggle-btn"[\s\S]*?paneState === 'list'/);
  });
});

describe('PANE-02: toggle button dispatches pane-collapse / pane-expand-list', () => {
  test('bee-pane.ts contains _onToggle handler', () => {
    expect(src).toMatch(/_onToggle\s*\(/);
  });

  test('bee-pane.ts dispatches pane-expand-list', () => {
    expect(src).toMatch(/new CustomEvent\(['"]pane-expand-list['"]/);
  });

  test('bee-pane.ts dispatches pane-collapse', () => {
    expect(src).toMatch(/new CustomEvent\(['"]pane-collapse['"]/);
  });

  test('bee-pane.ts toggle dispatch branches on paneState collapsed', () => {
    expect(src).toMatch(/paneState === ['"]collapsed['"]/);
  });
});

describe('PANE-03: expand button in list state', () => {
  test('bee-pane.ts declares expand-btn CSS class', () => {
    expect(src).toMatch(/\.expand-btn\b/);
  });

  test('bee-pane.ts dispatches pane-expand-table', () => {
    expect(src).toMatch(/new CustomEvent\(['"]pane-expand-table['"]/);
  });

  test('bee-pane.ts contains _onExpand handler', () => {
    expect(src).toMatch(/_onExpand\s*\(/);
  });
});

describe('PANE-04: shrink button in table state', () => {
  test('bee-pane.ts declares shrink-btn CSS class', () => {
    expect(src).toMatch(/\.shrink-btn\b/);
  });

  test('bee-pane.ts dispatches pane-shrink-list', () => {
    expect(src).toMatch(/new CustomEvent\(['"]pane-shrink-list['"]/);
  });

  test('bee-pane.ts contains _onShrink handler', () => {
    expect(src).toMatch(/_onShrink\s*\(/);
  });
});

describe('PANE-06: expand button hidden on mobile', () => {
  test('bee-pane.ts contains max-aspect-ratio:1 media query', () => {
    expect(src).toMatch(/@media[^{]*max-aspect-ratio:\s*1/);
  });

  test('bee-pane.ts hides expand-btn inside the mobile media query', () => {
    const mediaBlock = src.match(/@media[^{]*max-aspect-ratio:\s*1[\s\S]*?\}\s*\}/);
    expect(mediaBlock).not.toBeNull();
    expect(mediaBlock![0]).toMatch(/\.expand-btn[\s\S]*?display:\s*none/);
  });
});

describe('TABLE-01: bee-table embedded without event interception', () => {
  test('bee-pane.ts imports bee-table', () => {
    expect(src).toMatch(/import\s+['"]\.\/bee-table\.ts['"]/);
  });

  test('bee-pane.ts renders bee-table element', () => {
    expect(src).toMatch(/<bee-table\b/);
  });

  test('bee-pane.ts has no @page-changed listener on bee-table', () => {
    const beTableElement = src.match(/<bee-table[\s\S]*?>/);
    expect(beTableElement).not.toBeNull();
    expect(beTableElement![0]).not.toMatch(/@page-changed/);
  });

  test('bee-pane.ts has no @sort-changed listener on bee-table', () => {
    const beTableElement = src.match(/<bee-table[\s\S]*?>/);
    expect(beTableElement).not.toBeNull();
    expect(beTableElement![0]).not.toMatch(/@sort-changed/);
  });

  test('bee-pane.ts has no @row-pan listener on bee-table', () => {
    const beTableElement = src.match(/<bee-table[\s\S]*?>/);
    expect(beTableElement).not.toBeNull();
    expect(beTableElement![0]).not.toMatch(/@row-pan/);
  });

  test('bee-pane.ts has no @download-csv listener on bee-table', () => {
    const beTableElement = src.match(/<bee-table[\s\S]*?>/);
    expect(beTableElement).not.toBeNull();
    expect(beTableElement![0]).not.toMatch(/@download-csv/);
  });

  test('bee-pane.ts has no @toggle-filter listener on bee-table', () => {
    const beTableElement = src.match(/<bee-table[\s\S]*?>/);
    expect(beTableElement).not.toBeNull();
    expect(beTableElement![0]).not.toMatch(/@toggle-filter/);
  });
});

describe('sibling isolation (ARCH-03 equivalent)', () => {
  test('bee-pane.ts does not have a runtime (non-type) import of bee-atlas', () => {
    expect(src).not.toMatch(/^import\s+(?!type\s).*['"]\.\/bee-atlas\.ts['"]/m);
  });

  test('bee-pane.ts does not have a runtime import of bee-filter-panel', () => {
    expect(src).not.toMatch(/^import\s+(?!type\s).*['"]\.\/bee-filter-panel\.ts['"]/m);
  });

  test('bee-pane.ts does not have a runtime import of bee-sidebar runtime side-effects', () => {
    expect(src).not.toMatch(/^import\s+['"]\.\/bee-sidebar\.ts['"]/m);
  });
});
