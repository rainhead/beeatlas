import { test, expect, describe, vi, beforeEach } from 'vitest';

// Mock heavy modules
vi.mock('../duckdb.ts', () => ({
  getDuckDB: vi.fn(() => Promise.resolve({})),
  loadAllTables: vi.fn(() => Promise.resolve()),
  tablesReady: Promise.resolve(),
}));

vi.mock('../filter.ts', () => ({
  queryTablePage: vi.fn(() => Promise.resolve({ rows: [], total: 0 })),
  SPECIMEN_COLUMNS: { year: 'year', species: 'scientificName' },
  SAMPLE_COLUMNS: { date: 'date', observer: 'observer' },
  isFilterActive: vi.fn(() => false),
  queryVisibleIds: vi.fn(() => Promise.resolve({ ecdysis: null, samples: null })),
  buildFilterSQL: vi.fn(() => ({ ecdysisWhere: '1=1', samplesWhere: '1=1' })),
}));

vi.mock('../features.ts', () => ({
  EcdysisSource: vi.fn().mockImplementation(() => ({
    once: vi.fn(), on: vi.fn(), getFeatures: vi.fn(() => []), un: vi.fn(),
  })),
  SampleSource: vi.fn().mockImplementation(() => ({
    once: vi.fn(), on: vi.fn(), getFeatures: vi.fn(() => []), un: vi.fn(),
  })),
}));

vi.mock('../region-layer.ts', () => ({
  regionLayer: {
    setVisible: vi.fn(), setSource: vi.fn(), setStyle: vi.fn(),
    changed: vi.fn(), getFeatures: vi.fn(() => Promise.resolve([])),
  },
  countySource: { once: vi.fn(), getFeatures: vi.fn(() => []), loadFeatures: vi.fn() },
  ecoregionSource: { once: vi.fn(), getFeatures: vi.fn(() => []), loadFeatures: vi.fn() },
  makeRegionStyleFn: vi.fn(() => vi.fn()),
  boundaryStyle: {},
  selectedBoundaryStyle: {},
}));

// Helper to create a bee-table element with specified properties
async function createBeeTable(props: {
  rows?: object[];
  rowCount?: number;
  layerMode?: 'specimens' | 'samples';
  page?: number;
  sortColumn?: string;
  sortDir?: 'asc' | 'desc';
  loading?: boolean;
}) {
  const { BeeTable } = await import('../bee-table.ts');
  const el = new BeeTable() as InstanceType<typeof BeeTable> & HTMLElement;
  if (props.rows !== undefined) (el as any).rows = props.rows;
  if (props.rowCount !== undefined) (el as any).rowCount = props.rowCount;
  if (props.layerMode !== undefined) (el as any).layerMode = props.layerMode;
  if (props.page !== undefined) (el as any).page = props.page;
  if (props.sortColumn !== undefined) (el as any).sortColumn = props.sortColumn;
  if (props.sortDir !== undefined) (el as any).sortDir = props.sortDir;
  if (props.loading !== undefined) (el as any).loading = props.loading;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

describe('TABLE-01: bee-table column headers', () => {
  test('renders 6 specimen column headers when layerMode is specimens', async () => {
    const el = await createBeeTable({ layerMode: 'specimens', rows: [], rowCount: 100 });
    const headers = el.shadowRoot!.querySelectorAll('th');
    const labels = Array.from(headers).map(th => th.textContent?.replace(/[\u2191\u2193\u2195]/g, '').trim());
    expect(labels.filter(Boolean)).toContain('Species');
    expect(labels.filter(Boolean)).toContain('Collector');
    expect(labels.filter(Boolean)).toContain('Date');
    expect(labels.filter(Boolean)).toContain('County');
    expect(labels.filter(Boolean)).toContain('Ecoregion');
    expect(labels.filter(Boolean)).toContain('Field #');
    expect(headers.length).toBe(6);
    document.body.removeChild(el);
  });

  test('renders 6 sample column headers when layerMode is samples', async () => {
    const el = await createBeeTable({ layerMode: 'samples', rows: [], rowCount: 100 });
    const headers = el.shadowRoot!.querySelectorAll('th');
    const labels = Array.from(headers).map(th => th.textContent?.replace(/[\u2191\u2193\u2195]/g, '').trim());
    expect(labels.filter(Boolean)).toContain('Observer');
    expect(labels.filter(Boolean)).toContain('Date');
    expect(labels.filter(Boolean)).toContain('Specimens');
    expect(labels.filter(Boolean)).toContain('Sample ID');
    expect(labels.filter(Boolean)).toContain('County');
    expect(labels.filter(Boolean)).toContain('Ecoregion');
    expect(headers.length).toBe(6);
    document.body.removeChild(el);
  });
});

describe('TABLE-02: bee-table row count indicator', () => {
  test('shows "Showing 1-100 of 3,847 specimens" for page=1, rowCount=3847, layerMode=specimens', async () => {
    const el = await createBeeTable({ layerMode: 'specimens', rowCount: 3847, page: 1 });
    const label = el.shadowRoot!.querySelector('.row-count');
    expect(label?.textContent).toMatch(/Showing 1[–\u2013]100 of 3,847 specimens/);
    document.body.removeChild(el);
  });

  test('shows "Showing 101-200 of 500 samples" for page=2, rowCount=500, layerMode=samples', async () => {
    const el = await createBeeTable({ layerMode: 'samples', rowCount: 500, page: 2 });
    const label = el.shadowRoot!.querySelector('.row-count');
    expect(label?.textContent).toMatch(/Showing 101[–\u2013]200 of 500 samples/);
    document.body.removeChild(el);
  });

  test('shows "Showing 401-427 of 427 specimens" for last page (page=5, rowCount=427)', async () => {
    const el = await createBeeTable({ layerMode: 'specimens', rowCount: 427, page: 5 });
    const label = el.shadowRoot!.querySelector('.row-count');
    expect(label?.textContent).toMatch(/Showing 401[–\u2013]427 of 427 specimens/);
    document.body.removeChild(el);
  });
});

describe('TABLE-03: bee-table pagination controls', () => {
  test('Prev button is disabled when page=1', async () => {
    const el = await createBeeTable({ page: 1, rowCount: 200 });
    const prevBtn = el.shadowRoot!.querySelector('[aria-label="Previous page"]') as HTMLButtonElement;
    expect(prevBtn?.disabled).toBe(true);
    document.body.removeChild(el);
  });

  test('Next button is disabled when page*100 >= rowCount (page=4, rowCount=400)', async () => {
    const el = await createBeeTable({ page: 4, rowCount: 400 });
    const nextBtn = el.shadowRoot!.querySelector('[aria-label="Next page"]') as HTMLButtonElement;
    expect(nextBtn?.disabled).toBe(true);
    document.body.removeChild(el);
  });

  test('Next button is enabled when page*100 < rowCount (page=1, rowCount=101)', async () => {
    const el = await createBeeTable({ page: 1, rowCount: 101 });
    const nextBtn = el.shadowRoot!.querySelector('[aria-label="Next page"]') as HTMLButtonElement;
    expect(nextBtn?.disabled).toBe(false);
    document.body.removeChild(el);
  });
});

describe('TABLE-04: bee-table sort events', () => {
  test('clicking active sort column header dispatches sort-changed with reversed direction', async () => {
    const el = await createBeeTable({ sortColumn: 'species', sortDir: 'desc', rowCount: 100 });
    const sortChangedPromise = new Promise<CustomEvent>(resolve => {
      el.addEventListener('sort-changed', (e) => resolve(e as CustomEvent));
    });
    const headers = el.shadowRoot!.querySelectorAll('th button');
    const speciesHeader = Array.from(headers).find(btn => btn.textContent?.includes('Species'));
    (speciesHeader as HTMLElement)?.click();
    const event = await sortChangedPromise;
    expect(event.detail.column).toBe('species');
    expect(event.detail.dir).toBe('asc');  // reversed from 'desc'
    document.body.removeChild(el);
  });

  test('clicking inactive column header dispatches sort-changed with that column and dir=asc', async () => {
    const el = await createBeeTable({ sortColumn: 'year', sortDir: 'desc', rowCount: 100 });
    const sortChangedPromise = new Promise<CustomEvent>(resolve => {
      el.addEventListener('sort-changed', (e) => resolve(e as CustomEvent));
    });
    const headers = el.shadowRoot!.querySelectorAll('th button');
    const speciesHeader = Array.from(headers).find(btn => btn.textContent?.includes('Species'));
    (speciesHeader as HTMLElement)?.click();
    const event = await sortChangedPromise;
    expect(event.detail.column).toBe('species');
    expect(event.detail.dir).toBe('asc');
    document.body.removeChild(el);
  });
});

describe('TABLE-05: bee-table page events', () => {
  test('clicking Next dispatches page-changed with page+1', async () => {
    const el = await createBeeTable({ page: 1, rowCount: 200 });
    const pageChangedPromise = new Promise<CustomEvent>(resolve => {
      el.addEventListener('page-changed', (e) => resolve(e as CustomEvent));
    });
    const nextBtn = el.shadowRoot!.querySelector('[aria-label="Next page"]') as HTMLButtonElement;
    nextBtn?.click();
    const event = await pageChangedPromise;
    expect(event.detail.page).toBe(2);
    document.body.removeChild(el);
  });

  test('clicking Prev dispatches page-changed with page-1', async () => {
    const el = await createBeeTable({ page: 3, rowCount: 300 });
    const pageChangedPromise = new Promise<CustomEvent>(resolve => {
      el.addEventListener('page-changed', (e) => resolve(e as CustomEvent));
    });
    const prevBtn = el.shadowRoot!.querySelector('[aria-label="Previous page"]') as HTMLButtonElement;
    prevBtn?.click();
    const event = await pageChangedPromise;
    expect(event.detail.page).toBe(2);
    document.body.removeChild(el);
  });
});

describe('TABLE-06: bee-table empty and loading states', () => {
  test('shows empty state message when rows is empty and rowCount is 0', async () => {
    const el = await createBeeTable({ rows: [], rowCount: 0, layerMode: 'specimens', loading: false });
    const emptyState = el.shadowRoot!.querySelector('.empty-state');
    expect(emptyState).not.toBeNull();
    expect(emptyState?.textContent).toMatch(/No specimens match the current filters/);
    document.body.removeChild(el);
  });
});

describe('TABLE-07: bee-table accessibility', () => {
  test('cells have title attribute matching cell text content', async () => {
    const specimenRows = [{
      scientificName: 'Bombus vosnesenskii',
      recordedBy: 'Jane Smith',
      year: 2023,
      month: 6,
      county: 'King',
      ecoregion_l3: 'Cascades',
      fieldNumber: 'JS-001',
    }];
    const el = await createBeeTable({ rows: specimenRows, rowCount: 1, layerMode: 'specimens', page: 1 });
    const firstCell = el.shadowRoot!.querySelector('tbody td') as HTMLElement;
    expect(firstCell?.getAttribute('title')).toBe(firstCell?.textContent?.trim());
    document.body.removeChild(el);
  });

  test('active sort column header has aria-sort="ascending"', async () => {
    const el = await createBeeTable({ sortColumn: 'species', sortDir: 'asc', rowCount: 100 });
    const headers = el.shadowRoot!.querySelectorAll('th');
    const speciesHeader = Array.from(headers).find(th => th.textContent?.includes('Species'));
    expect(speciesHeader?.getAttribute('aria-sort')).toBe('ascending');
    document.body.removeChild(el);
  });

  test('active sort column header has aria-sort="descending"', async () => {
    const el = await createBeeTable({ sortColumn: 'species', sortDir: 'desc', rowCount: 100 });
    const headers = el.shadowRoot!.querySelectorAll('th');
    const speciesHeader = Array.from(headers).find(th => th.textContent?.includes('Species'));
    expect(speciesHeader?.getAttribute('aria-sort')).toBe('descending');
    document.body.removeChild(el);
  });

  test('inactive column headers have aria-sort="none"', async () => {
    const el = await createBeeTable({ sortColumn: 'year', sortDir: 'desc', rowCount: 100 });
    const headers = el.shadowRoot!.querySelectorAll('th');
    const speciesHeader = Array.from(headers).find(th => th.textContent?.includes('Species'));
    expect(speciesHeader?.getAttribute('aria-sort')).toBe('none');
    document.body.removeChild(el);
  });

  test('row count label is wrapped in aria-live="polite" span', async () => {
    const el = await createBeeTable({ rowCount: 100, page: 1 });
    const ariaLive = el.shadowRoot!.querySelector('[aria-live="polite"]');
    expect(ariaLive).not.toBeNull();
    document.body.removeChild(el);
  });
});
