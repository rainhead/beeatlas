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
  test('bee-pane.ts declares a filter-btn CSS class (collapsed floating button)', () => {
    expect(src).toMatch(/\.filter-btn\b/);
  });

  test('bee-pane.ts renders filter-btn in collapsed state', () => {
    // filter-btn appears in the collapsed branch of render()
    expect(src).toMatch(/class=\$\{['"]filter-btn/);
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

describe('PANE-05: list state filter controls + occurrence detail', () => {
  test('bee-pane.ts defines _renderWhat method', () => {
    expect(src).toMatch(/_renderWhat\s*\(/);
  });

  test('bee-pane.ts defines _renderWho method', () => {
    expect(src).toMatch(/_renderWho\s*\(/);
  });

  test('bee-pane.ts defines _renderWhere method', () => {
    expect(src).toMatch(/_renderWhere\s*\(/);
  });

  test('bee-pane.ts defines _renderWhen method', () => {
    expect(src).toMatch(/_renderWhen\s*\(/);
  });

  test('bee-pane.ts calls all four filter render methods inside _renderListContent', () => {
    const listContentBody = src.match(/_renderListContent\s*\([^)]*\)[^{]*\{[\s\S]*?\n\s{0,4}\}/);
    expect(listContentBody).not.toBeNull();
    const body = listContentBody![0];
    expect(body).toMatch(/this\._renderWhat\s*\(\)/);
    expect(body).toMatch(/this\._renderWho\s*\(\)/);
    expect(body).toMatch(/this\._renderWhere\s*\(\)/);
    expect(body).toMatch(/this\._renderWhen\s*\(\)/);
  });

  test('bee-pane.ts renders bee-occurrence-detail from listRows in list content', () => {
    const listContentBody = src.match(/_renderListContent\s*\([^)]*\)[^{]*\{[\s\S]*?\n\s{0,4}\}/);
    expect(listContentBody).not.toBeNull();
    const body = listContentBody![0];
    // Plan 03: occurrences prop replaced by listRows
    expect(body).toMatch(/<bee-occurrence-detail[\s\S]*?\.occurrences=\$\{this\.listRows\}/);
    // Guard: shows hint when listRows is empty
    const hasGuard = /listRows\.length\s*===\s*0/.test(body) || /listRows\s*\?/.test(body);
    expect(hasGuard).toBe(true);
  });

  test('bee-pane.ts dispatches filter-changed event', () => {
    expect(src).toMatch(/new CustomEvent[^)]*['"]filter-changed['"]/);
  });

  test('bee-pane.ts implements updated(changed: PropertyValues) sync', () => {
    expect(src).toMatch(/updated\s*\(\s*changed\s*:\s*PropertyValues/);
  });

  test('bee-pane.ts resyncs the taxon input on a display-name-only change (MFILT-03 URL restore)', () => {
    // URL restore sets taxonId first (no label), then backfills the label from the
    // cache. The taxon-sync guard must react to the label change even when taxonId is
    // unchanged, or "Species or group" stays empty. Assert the guard is not taxonId-only.
    expect(src).toMatch(/incomingTaxonDisplay\s*!==\s*localTaxonDisplay/);
    expect(src).toMatch(/f\.taxonId\s*!==\s*localTaxonId\s*\|\|\s*incomingTaxonDisplay\s*!==\s*localTaxonDisplay/);
  });

  test('bee-pane.ts contains _ensurePlaceNamesLoaded with resolveDataUrl call', () => {
    expect(src).toMatch(/_ensurePlaceNamesLoaded/);
    expect(src).toMatch(/resolveDataUrl\(['"]places_meta['"]\)/);
  });

  test('bee-pane.ts FilterChangedEvent detail contains all required fields', () => {
    const emitFilterBody = src.match(/_emitFilter\s*\([^)]*\)[^{]*\{[\s\S]*?\n\s{0,4}\}/);
    expect(emitFilterBody).not.toBeNull();
    const body = emitFilterBody![0];
    expect(body).toMatch(/taxonId/);
    expect(body).toMatch(/taxonDisplayName/);
    expect(body).toMatch(/yearFrom/);
    expect(body).toMatch(/yearTo/);
    expect(body).toMatch(/months/);
    expect(body).toMatch(/selectedCounties/);
    expect(body).toMatch(/selectedEcoregions/);
    expect(body).toMatch(/selectedCollectors/);
    expect(body).toMatch(/elevMin/);
    expect(body).toMatch(/elevMax/);
    expect(body).toMatch(/selectedPlace/);
  });

  test('bee-pane.ts list content stub is removed', () => {
    expect(src).not.toMatch(/List content \(Plan 02 fills in/);
  });
});

describe('PANE-V2: bee-pane v2 collapsed button and selection banner', () => {
  test('collapsed button is active when filterActive || selectionCount > 0', () => {
    // The active class expression must include both conditions
    expect(src).toMatch(/filterActive.*selectionCount|selectionCount.*filterActive/);
  });
  test('bee-pane.ts has .pane-close CSS class', () => {
    expect(src).toMatch(/\.pane-close\b/);
  });
  test('bee-pane.ts has .selection-banner CSS class', () => {
    expect(src).toMatch(/\.selection-banner\b/);
  });
  test('bee-pane.ts has listRows, listPage, listRowCount, listLoading properties', () => {
    expect(src).toMatch(/listRows/);
    expect(src).toMatch(/listPage\b/);
    expect(src).toMatch(/listRowCount/);
    expect(src).toMatch(/listLoading/);
  });
  test('bee-pane.ts has selectionCount property', () => {
    expect(src).toMatch(/selectionCount/);
  });
  test('bee-pane.ts does NOT have occurrences property', () => {
    // occurrences property was removed in Phase 109
    // Match @property(...) followed by optional whitespace then the property name 'occurrences'
    expect(src).not.toMatch(/@property[^)]*\)\s+occurrences\b/);
  });
});

describe('MAP-01: checklist toggle in filter panel', () => {
  test('bee-pane.ts has _showChecklist @state field', () => {
    expect(src).toMatch(/_showChecklist/);
  });

  test('bee-pane.ts renders "Checklist records" label text', () => {
    expect(src).toMatch(/Checklist records/);
  });

  test('bee-pane.ts dispatches checklist-layer-changed event', () => {
    expect(src).toMatch(/new CustomEvent\(['"]checklist-layer-changed['"]/);
  });

  test('bee-pane.ts checklist item uses aria-label', () => {
    expect(src).toMatch(/aria-label=["']\$\{l\.label\}["']/);
  });

  test('bee-pane.ts calls _renderSources inside _renderListContent', () => {
    const listContentBody = src.match(/_renderListContent\s*\([^)]*\)[^{]*\{[\s\S]*?\n\s{0,4}\}/);
    expect(listContentBody).not.toBeNull();
    expect(listContentBody![0]).toMatch(/this\._renderSources\s*\(\)/);
  });
});

describe('MAP-02: source filter row in bee-pane', () => {
  test('bee-pane.ts declares hiddenSources @property', () => {
    expect(src).toMatch(/@property[\s\S]{0,50}hiddenSources/);
  });
  test('bee-pane.ts dispatches source-filter-changed event', () => {
    expect(src).toMatch(/new CustomEvent\(['"]source-filter-changed['"]/);
  });
  test('bee-pane.ts contains _renderSources method', () => {
    expect(src).toMatch(/_renderSources\s*\(/);
  });
  test('bee-pane.ts has checkbox for ecdysis source', () => {
    expect(src).toMatch(/ecdysis/);
  });
  test('bee-pane.ts has checkbox for inat_obs source', () => {
    expect(src).toMatch(/inat_obs/);
  });
  test('bee-pane.ts has checkbox for waba_sample source', () => {
    expect(src).toMatch(/waba_sample/);
  });
});
