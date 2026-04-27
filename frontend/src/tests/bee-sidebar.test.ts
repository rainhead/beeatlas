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

describe('DECOMP-01: bee-filter-controls property interface', () => {
  test('BeeFilterControls has @property declarations for required inputs', async () => {
    const { BeeFilterControls } = await import('../bee-filter-controls.ts');
    const props = (BeeFilterControls as unknown as { elementProperties: Map<string, unknown> }).elementProperties;
    expect(props.has('filterState')).toBe(true);
    expect(props.has('taxaOptions')).toBe(true);
    expect(props.has('countyOptions')).toBe(true);
    expect(props.has('ecoregionOptions')).toBe(true);
    expect(props.has('summary')).toBe(true);
  });

  test('bee-filter-controls.ts contains filter-changed event string', () => {
    const src = readFileSync(resolve(__dirname, '../bee-filter-controls.ts'), 'utf-8');
    expect(src).toMatch(/'filter-changed'/);
  });

  test('bee-filter-controls.ts does NOT hold taxon filter state as @state (only _taxonInputText allowed)', () => {
    const src = readFileSync(resolve(__dirname, '../bee-filter-controls.ts'), 'utf-8');
    // _taxonInputText is allowed; _taxonName, _taxonRank are not
    expect(src).not.toMatch(/@state\(\)\s+private\s+_taxonName/);
    expect(src).not.toMatch(/@state\(\)\s+private\s+_taxonRank/);
  });

  test('bee-filter-controls.ts does NOT hold year/month/county/ecoregion filter state as @state', () => {
    const src = readFileSync(resolve(__dirname, '../bee-filter-controls.ts'), 'utf-8');
    expect(src).not.toMatch(/@state\(\)\s+private\s+_yearFrom/);
    expect(src).not.toMatch(/@state\(\)\s+private\s+_yearTo/);
    expect(src).not.toMatch(/@state\(\)\s+private\s+_months/);
    expect(src).not.toMatch(/@state\(\)\s+private\s+_selectedCounties/);
    expect(src).not.toMatch(/@state\(\)\s+private\s+_selectedEcoregions/);
  });
});

describe('DECOMP-02: bee-occurrence-detail property interface', () => {
  test('BeeOccurrenceDetail has @property declaration for occurrences', async () => {
    const { BeeOccurrenceDetail } = await import('../bee-occurrence-detail.ts');
    const props = (BeeOccurrenceDetail as unknown as { elementProperties: Map<string, unknown> }).elementProperties;
    expect(props.has('occurrences')).toBe(true);
  });

  test('bee-occurrence-detail.ts does NOT contain @state()', async () => {
    const src = (await import('node:fs')).readFileSync(
      (await import('node:path')).resolve(__dirname, '../bee-occurrence-detail.ts'), 'utf-8');
    expect(src).not.toMatch(/@state\(\)/);
  });
});

describe('DECOMP-04: bee-sidebar is thin layout shell', () => {
  // These tests will FAIL until Plan 02 completes.
  // That is expected and correct — they serve as a red-to-green target for Plan 02.

  test('bee-sidebar.ts does NOT contain filter-by-taxon input markup', () => {
    const src = readFileSync(resolve(__dirname, '../bee-sidebar.ts'), 'utf-8');
    expect(src).not.toMatch(/placeholder.*Filter by taxon/);
  });

  test('bee-sidebar.ts does NOT contain filter-by-county input markup', () => {
    const src = readFileSync(resolve(__dirname, '../bee-sidebar.ts'), 'utf-8');
    expect(src).not.toMatch(/placeholder.*Filter by county/);
  });

  test('bee-sidebar.ts does NOT contain filter-by-ecoregion input markup', () => {
    const src = readFileSync(resolve(__dirname, '../bee-sidebar.ts'), 'utf-8');
    expect(src).not.toMatch(/placeholder.*Filter by ecoregion/);
  });

  test('bee-sidebar.ts does NOT contain species-list markup', () => {
    const src = readFileSync(resolve(__dirname, '../bee-sidebar.ts'), 'utf-8');
    expect(src).not.toMatch(/class="species-list"/);
  });

  test('bee-sidebar.ts does NOT contain sample-dot-detail markup', () => {
    const src = readFileSync(resolve(__dirname, '../bee-sidebar.ts'), 'utf-8');
    expect(src).not.toMatch(/sample-dot-detail/);
  });

  test('bee-sidebar.ts does NOT contain filter handler methods', () => {
    const src = readFileSync(resolve(__dirname, '../bee-sidebar.ts'), 'utf-8');
    expect(src).not.toMatch(/_onTaxonInput|_onYearFromChange|_onMonthChange/);
  });

  test('bee-sidebar.ts does NOT contain detail render methods', () => {
    const src = readFileSync(resolve(__dirname, '../bee-sidebar.ts'), 'utf-8');
    expect(src).not.toMatch(/_renderDetail|_renderSampleDotDetail/);
  });

  test('bee-sidebar.ts does NOT contain bee-filter-controls sub-component tag', () => {
    const src = readFileSync(resolve(__dirname, '../bee-sidebar.ts'), 'utf-8');
    expect(src).not.toMatch(/bee-filter-controls/);
  });

  test('bee-sidebar.ts contains bee-occurrence-detail sub-component tag', () => {
    const src = readFileSync(resolve(__dirname, '../bee-sidebar.ts'), 'utf-8');
    expect(src).toMatch(/bee-occurrence-detail/);
  });

  test('bee-sidebar.ts does NOT contain bee-specimen-detail sub-component tag', () => {
    const src = readFileSync(resolve(__dirname, '../bee-sidebar.ts'), 'utf-8');
    expect(src).not.toMatch(/bee-specimen-detail/);
  });

  test('bee-sidebar.ts does NOT contain bee-sample-detail sub-component tag', () => {
    const src = readFileSync(resolve(__dirname, '../bee-sidebar.ts'), 'utf-8');
    expect(src).not.toMatch(/bee-sample-detail/);
  });
});

describe('DECOMP-04-RACE: bee-atlas _runFilterQuery race guard', () => {
  const src = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');

  test('bee-atlas.ts declares _filterQueryGeneration field (at least 3 occurrences)', () => {
    const matches = src.match(/_filterQueryGeneration/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(3);
  });

  test('bee-atlas.ts contains the generation guard that discards stale results', () => {
    expect(src).toMatch(/if \(generation !== this\._filterQueryGeneration\) return/);
  });
});

describe('SIDE-01/SIDE-02: sidebar is detail-only with close button', () => {
  test('bee-sidebar.ts does NOT contain _renderToggle method', () => {
    const src = readFileSync(resolve(__dirname, '../bee-sidebar.ts'), 'utf-8');
    expect(src).not.toMatch(/_renderToggle/);
  });

  test('bee-sidebar.ts does NOT contain _renderViewToggle method', () => {
    const src = readFileSync(resolve(__dirname, '../bee-sidebar.ts'), 'utf-8');
    expect(src).not.toMatch(/_renderViewToggle/);
  });

  test('bee-sidebar.ts does NOT contain _renderSummary method', () => {
    const src = readFileSync(resolve(__dirname, '../bee-sidebar.ts'), 'utf-8');
    expect(src).not.toMatch(/_renderSummary/);
  });

  test('bee-sidebar.ts does NOT contain _renderRecentSampleEvents method', () => {
    const src = readFileSync(resolve(__dirname, '../bee-sidebar.ts'), 'utf-8');
    expect(src).not.toMatch(/_renderRecentSampleEvents/);
  });

  test('bee-sidebar.ts does NOT contain _renderFeedsSection method', () => {
    const src = readFileSync(resolve(__dirname, '../bee-sidebar.ts'), 'utf-8');
    expect(src).not.toMatch(/_renderFeedsSection/);
  });

  test('bee-sidebar.ts contains close button with aria-label', () => {
    const src = readFileSync(resolve(__dirname, '../bee-sidebar.ts'), 'utf-8');
    expect(src).toMatch(/aria-label="Close detail panel"/);
  });

  test('bee-sidebar.ts dispatches close event from _onCloseClick', () => {
    const src = readFileSync(resolve(__dirname, '../bee-sidebar.ts'), 'utf-8');
    expect(src).toMatch(/_onCloseClick/);
    expect(src).toMatch(/new CustomEvent\('close'/);
  });

  test('bee-atlas.ts conditionally renders bee-sidebar based on _sidebarOpen', () => {
    const src = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');
    expect(src).toMatch(/_sidebarOpen/);
  });

  test('bee-atlas.ts does NOT contain activeFeedEntries', () => {
    const src = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');
    expect(src).not.toMatch(/_activeFeedEntries/);
  });

  test('bee-atlas.ts does NOT contain _onFilteredSummaryComputed', () => {
    const src = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');
    expect(src).not.toMatch(/_onFilteredSummaryComputed/);
  });

  test('BeeSidebar has occurrences property and does NOT have samples or selectedSampleEvent', async () => {
    const { BeeSidebar } = await import('../bee-sidebar.ts');
    const props = (BeeSidebar as unknown as { elementProperties: Map<string, unknown> }).elementProperties;
    expect(props.has('occurrences')).toBe(true);
    expect(props.has('samples')).toBe(false);
    expect(props.has('selectedSampleEvent')).toBe(false);
    expect(props.has('layerMode')).toBe(false);
    expect(props.has('viewMode')).toBe(false);
    expect(props.has('summary')).toBe(false);
    expect(props.has('activeFeedEntries')).toBe(false);
  });
});

describe('SID-01/SID-02: bee-occurrence-detail render branches', () => {
  // Provisional row fixture per 067-UI-SPEC.md
  const provisionalRow = {
    lat: 47.6, lon: -122.3, date: '2024-06-15',
    county: 'King', ecoregion_l3: null,
    ecdysis_id: null, catalog_number: null,
    scientificName: null, recordedBy: null, fieldNumber: null,
    genus: null, family: null, floralHost: null,
    host_observation_id: null, inat_host: null, inat_quality_grade: null,
    modified: null,
    specimen_observation_id: 12345678,
    elevation_m: 320, year: 2024, month: 6,
    observation_id: null,
    host_inat_login: 'fieldcollector',
    specimen_count: 3, sample_id: null,
    is_provisional: true,
    specimen_inat_taxon_name: 'Bombus mixtus',
    specimen_inat_quality_grade: 'needs_id',
  };

  // Sample-only row fixture (ecdysis_id null, is_provisional false)
  const sampleOnlyRow = {
    lat: 47.6, lon: -122.3, date: '2024-07-10',
    county: 'King', ecoregion_l3: null,
    ecdysis_id: null, catalog_number: null,
    scientificName: null, recordedBy: null, fieldNumber: null,
    genus: null, family: null, floralHost: null,
    host_observation_id: null, inat_host: null, inat_quality_grade: null,
    modified: null,
    specimen_observation_id: null,
    elevation_m: null, year: 2024, month: 7,
    observation_id: 99999,
    host_inat_login: 'sampler',
    specimen_count: 2, sample_id: 42,
    is_provisional: false,
    specimen_inat_taxon_name: null,
    specimen_inat_quality_grade: null,
  };

  test('SID-02: provisional row renders .inat-id-label with "iNat ID:" and WABA observation link', async () => {
    const { BeeOccurrenceDetail } = await import('../bee-occurrence-detail.ts');
    const el = document.createElement('bee-occurrence-detail') as InstanceType<typeof BeeOccurrenceDetail>;
    document.body.appendChild(el);
    el.occurrences = [provisionalRow] as typeof el.occurrences;
    await el.updateComplete;

    const shadow = el.shadowRoot!;
    const label = shadow.querySelector('.inat-id-label');
    expect(label).not.toBeNull();
    expect(label!.textContent).toContain('iNat ID:');

    const links = shadow.querySelectorAll('a');
    const wabaLink = [...links].find(a => a.href.includes('12345678'));
    expect(wabaLink).not.toBeUndefined();
    expect(wabaLink!.textContent!.trim()).toBe('View WABA observation');

    document.body.removeChild(el);
  });

  test('SID-01: sample-only row renders "identification pending" in .event-count', async () => {
    const { BeeOccurrenceDetail } = await import('../bee-occurrence-detail.ts');
    const el = document.createElement('bee-occurrence-detail') as InstanceType<typeof BeeOccurrenceDetail>;
    document.body.appendChild(el);
    el.occurrences = [sampleOnlyRow] as typeof el.occurrences;
    await el.updateComplete;

    const shadow = el.shadowRoot!;
    const countEl = shadow.querySelector('.event-count');
    expect(countEl).not.toBeNull();
    expect(countEl!.textContent).toContain('identification pending');

    document.body.removeChild(el);
  });
});
