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

vi.mock('../sqlite.ts', () => ({
  getDB: vi.fn(() => Promise.resolve({ sqlite3: {}, db: 0 })),
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

describe('DECOMP-02: bee-specimen-detail property interface', () => {
  test('BeeSpecimenDetail has @property declaration for samples', async () => {
    const { BeeSpecimenDetail } = await import('../bee-specimen-detail.ts');
    const props = (BeeSpecimenDetail as unknown as { elementProperties: Map<string, unknown> }).elementProperties;
    expect(props.has('samples')).toBe(true);
  });

  test('bee-specimen-detail.ts does NOT contain @state()', () => {
    const src = readFileSync(resolve(__dirname, '../bee-specimen-detail.ts'), 'utf-8');
    expect(src).not.toMatch(/@state\(\)/);
  });
});

describe('DECOMP-03: bee-sample-detail property interface', () => {
  test('BeeSampleDetail has @property declaration for sampleEvent', async () => {
    const { BeeSampleDetail } = await import('../bee-sample-detail.ts');
    const props = (BeeSampleDetail as unknown as { elementProperties: Map<string, unknown> }).elementProperties;
    expect(props.has('sampleEvent')).toBe(true);
  });

  test('bee-sample-detail.ts does NOT contain @state()', () => {
    const src = readFileSync(resolve(__dirname, '../bee-sample-detail.ts'), 'utf-8');
    expect(src).not.toMatch(/@state\(\)/);
  });

  test('bee-sample-detail.ts does NOT contain this.selectedSampleEvent = null', () => {
    const src = readFileSync(resolve(__dirname, '../bee-sample-detail.ts'), 'utf-8');
    expect(src).not.toMatch(/this\.selectedSampleEvent\s*=\s*null/);
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

  test('bee-sidebar.ts contains bee-specimen-detail sub-component tag', () => {
    const src = readFileSync(resolve(__dirname, '../bee-sidebar.ts'), 'utf-8');
    expect(src).toMatch(/bee-specimen-detail/);
  });

  test('bee-sidebar.ts contains bee-sample-detail sub-component tag', () => {
    const src = readFileSync(resolve(__dirname, '../bee-sidebar.ts'), 'utf-8');
    expect(src).toMatch(/bee-sample-detail/);
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

describe('bee-specimen-detail render', () => {
  test('renders sample data into shadow DOM', async () => {
    const { BeeSpecimenDetail } = await import('../bee-specimen-detail.ts');

    const el = new BeeSpecimenDetail();
    el.samples = [
      {
        year: 2023,
        month: 6,
        recordedBy: 'J. Smith',
        fieldNumber: 'WA-2023-001',
        species: [
          { name: 'Bombus occidentalis', occid: '12345', hostObservationId: null, floralHost: null },
          { name: 'Andrena milwaukeensis', occid: '12346', hostObservationId: 99001, floralHost: 'Salix' },
        ],
        elevation_m: null,
      },
    ];

    // Attach to DOM so Lit renders into shadowRoot
    document.body.appendChild(el);
    await el.updateComplete;

    const shadow = el.shadowRoot!;
    const text = shadow.textContent ?? '';

    expect(text).toContain('J. Smith');
    expect(text).toContain('WA-2023-001');
    expect(text).toContain('Bombus occidentalis');
    expect(text).toContain('Andrena milwaukeensis');

    // Verify a link to ecdysis exists
    const links = shadow.querySelectorAll('a[href*="ecdysis.org"]');
    expect(links.length).toBeGreaterThanOrEqual(2);

    // Verify iNat link for species with hostObservationId
    const inatLinks = shadow.querySelectorAll('a[href*="inaturalist.org"]');
    expect(inatLinks.length).toBeGreaterThanOrEqual(1);

    document.body.removeChild(el);
  });

  test('renders "No determination" for specimen with empty name', async () => {
    const { BeeSpecimenDetail } = await import('../bee-specimen-detail.ts');

    const el = new BeeSpecimenDetail();
    el.samples = [
      {
        year: 2024,
        month: 3,
        recordedBy: 'A. Collector',
        fieldNumber: 'WA-2024-001',
        species: [
          { name: '', occid: '5611752', hostObservationId: null, floralHost: null },
          { name: 'Bombus vosnesenskii', occid: '5611753', hostObservationId: null, floralHost: null },
        ],
        elevation_m: null,
      },
    ];

    document.body.appendChild(el);
    await el.updateComplete;

    const shadow = el.shadowRoot!;
    const text = shadow.textContent ?? '';

    expect(text).toContain('No determination');
    expect(text).toContain('Bombus vosnesenskii');

    document.body.removeChild(el);
  });

  test('renders no sample divs when samples is empty', async () => {
    const { BeeSpecimenDetail } = await import('../bee-specimen-detail.ts');

    const el = new BeeSpecimenDetail();
    el.samples = [];

    document.body.appendChild(el);
    await el.updateComplete;

    const shadow = el.shadowRoot!;
    const sampleDivs = shadow.querySelectorAll('.sample');
    expect(sampleDivs.length).toBe(0);

    document.body.removeChild(el);
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

  test('BeeSidebar only has samples and selectedSampleEvent properties', async () => {
    const { BeeSidebar } = await import('../bee-sidebar.ts');
    const props = (BeeSidebar as unknown as { elementProperties: Map<string, unknown> }).elementProperties;
    expect(props.has('samples')).toBe(true);
    expect(props.has('selectedSampleEvent')).toBe(true);
    expect(props.has('layerMode')).toBe(false);
    expect(props.has('viewMode')).toBe(false);
    expect(props.has('summary')).toBe(false);
    expect(props.has('activeFeedEntries')).toBe(false);
  });
});

describe('FRONT-01: specimen photo link rendering', () => {
  test('renders camera emoji link when specimenObservationId is present', async () => {
    const { BeeSpecimenDetail } = await import('../bee-specimen-detail.ts');
    const el = new BeeSpecimenDetail();
    el.samples = [
      {
        year: 2023, month: 6, recordedBy: 'J. Smith', fieldNumber: 'WA-2023-001',
        species: [
          { name: 'Bombus occidentalis', occid: '12345', hostObservationId: 99001, floralHost: 'Salix', specimenObservationId: 55555 },
        ],
        elevation_m: null,
      },
    ];
    document.body.appendChild(el);
    await el.updateComplete;
    const shadow = el.shadowRoot!;
    const cameraLinks = shadow.querySelectorAll('a[href="https://www.inaturalist.org/observations/55555"]');
    expect(cameraLinks.length).toBe(1);
    expect(cameraLinks.item(0)!.textContent).toContain('📷');
    expect(cameraLinks.item(0)!.getAttribute('target')).toBe('_blank');
    document.body.removeChild(el);
  });

  test('renders no camera link when specimenObservationId is null', async () => {
    const { BeeSpecimenDetail } = await import('../bee-specimen-detail.ts');
    const el = new BeeSpecimenDetail();
    el.samples = [
      {
        year: 2023, month: 6, recordedBy: 'J. Smith', fieldNumber: 'WA-2023-001',
        species: [
          { name: 'Bombus occidentalis', occid: '12345', hostObservationId: 99001, floralHost: 'Salix', specimenObservationId: null },
        ],
        elevation_m: null,
      },
    ];
    document.body.appendChild(el);
    await el.updateComplete;
    const shadow = el.shadowRoot!;
    // Should have the host observation link but NOT a camera emoji link
    const allInatLinks = shadow.querySelectorAll('a[href*="inaturalist.org/observations"]');
    // Only the host observation link (99001), no specimen photo link
    expect(allInatLinks.length).toBe(1);
    expect(allInatLinks.item(0)!.getAttribute('href')).toContain('99001');
    document.body.removeChild(el);
  });

  test('renders camera link even when hostObservationId is null', async () => {
    const { BeeSpecimenDetail } = await import('../bee-specimen-detail.ts');
    const el = new BeeSpecimenDetail();
    el.samples = [
      {
        year: 2023, month: 6, recordedBy: 'J. Smith', fieldNumber: 'WA-2023-001',
        species: [
          { name: 'Andrena milwaukeensis', occid: '12346', hostObservationId: null, floralHost: null, specimenObservationId: 77777 },
        ],
        elevation_m: null,
      },
    ];
    document.body.appendChild(el);
    await el.updateComplete;
    const shadow = el.shadowRoot!;
    const cameraLinks = shadow.querySelectorAll('a[href="https://www.inaturalist.org/observations/77777"]');
    expect(cameraLinks.length).toBe(1);
    expect(cameraLinks.item(0)!.textContent).toContain('📷');
    // The "iNat: —" placeholder should still appear for the missing host observation
    const text = shadow.textContent ?? '';
    expect(text).toContain('iNat: —');
    document.body.removeChild(el);
  });
});

describe('ELEV-05: bee-specimen-detail elevation display', () => {
  test('shows elevation row when elevation_m is non-null', async () => {
    const { BeeSpecimenDetail } = await import('../bee-specimen-detail.ts');
    const el = new BeeSpecimenDetail();
    el.samples = [{
      year: 2023, month: 6,
      recordedBy: 'J. Smith', fieldNumber: 'WA-2023-001',
      elevation_m: 1219,
      species: [{ name: 'Bombus occidentalis', occid: '12345', hostObservationId: null, floralHost: null, specimenObservationId: null }],
    }];
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.shadowRoot!.textContent).toContain('1219 m');
    expect(el.shadowRoot!.textContent).toContain('Elevation');
    document.body.removeChild(el);
  });

  test('omits elevation row when elevation_m is null', async () => {
    const { BeeSpecimenDetail } = await import('../bee-specimen-detail.ts');
    const el = new BeeSpecimenDetail();
    el.samples = [{
      year: 2023, month: 6,
      recordedBy: 'J. Smith', fieldNumber: 'WA-2023-001',
      elevation_m: null,
      species: [{ name: 'Bombus occidentalis', occid: '12345', hostObservationId: null, floralHost: null, specimenObservationId: null }],
    }];
    document.body.appendChild(el);
    await el.updateComplete;
    const text = el.shadowRoot!.textContent ?? '';
    expect(text).not.toContain('Elevation');
    document.body.removeChild(el);
  });
});

describe('ELEV-06: bee-sample-detail elevation display', () => {
  test('shows elevation when elevation_m is non-null', async () => {
    const { BeeSampleDetail } = await import('../bee-sample-detail.ts');
    const el = new BeeSampleDetail();
    el.sampleEvent = {
      observation_id: 1, observer: 'J. Smith', date: '2023-06-01',
      specimen_count: 3, sample_id: null, coordinate: [0, 0],
      elevation_m: 1219,
    };
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.shadowRoot!.textContent).toContain('1219 m');
    document.body.removeChild(el);
  });

  test('omits elevation when elevation_m is null', async () => {
    const { BeeSampleDetail } = await import('../bee-sample-detail.ts');
    const el = new BeeSampleDetail();
    el.sampleEvent = {
      observation_id: 1, observer: 'J. Smith', date: '2023-06-01',
      specimen_count: 3, sample_id: null, coordinate: [0, 0],
      elevation_m: null,
    };
    document.body.appendChild(el);
    await el.updateComplete;
    const text = el.shadowRoot!.textContent ?? '';
    expect(text).not.toContain(' m');
    document.body.removeChild(el);
  });
});
