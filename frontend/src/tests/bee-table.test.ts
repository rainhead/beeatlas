import { test, expect, describe, vi } from 'vitest';

// Mock heavy modules
vi.mock('../sqlite.ts', () => ({
  getDB: vi.fn(() => Promise.resolve({ sqlite3: {}, db: 0 })),
  loadOccurrencesTable: vi.fn(() => Promise.resolve()),
  tablesReady: Promise.resolve(),
}));

vi.mock('../filter.ts', () => ({
  queryTablePage: vi.fn(() => Promise.resolve({ rows: [], total: 0 })),
  OCCURRENCE_COLUMNS: ['lat', 'lon', 'date', 'county', 'ecoregion_l3', 'ecdysis_id', 'catalog_number', 'scientificName', 'recordedBy', 'fieldNumber', 'genus', 'family', 'floralHost', 'host_observation_id', 'inat_host', 'inat_quality_grade', 'modified', 'specimen_observation_id', 'elevation_m', 'year', 'month', 'observation_id', 'observer', 'specimen_count', 'sample_id'],
  isFilterActive: vi.fn(() => false),
  queryVisibleIds: vi.fn(() => Promise.resolve(null)),
  SpecimenSortBy: undefined,
}));

vi.mock('../features.ts', () => ({
  OccurrenceSource: vi.fn().mockImplementation(() => ({
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
  page?: number;
  loading?: boolean;
  sortBy?: 'date' | 'modified';
}) {
  const { BeeTable } = await import('../bee-table.ts');
  const el = new BeeTable() as InstanceType<typeof BeeTable> & HTMLElement;
  if (props.rows !== undefined) (el as any).rows = props.rows;
  if (props.rowCount !== undefined) (el as any).rowCount = props.rowCount;
  if (props.page !== undefined) (el as any).page = props.page;
  if (props.loading !== undefined) (el as any).loading = props.loading;
  if (props.sortBy !== undefined) (el as any).sortBy = props.sortBy;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

describe('TABLE-01: bee-table column headers', () => {
  test('renders 10 occurrence column headers', async () => {
    const el = await createBeeTable({ rows: [], rowCount: 100 });
    const headers = el.shadowRoot!.querySelectorAll('th');
    const labels = Array.from(headers).map(th => th.textContent?.trim() ?? '');
    expect(labels.some(l => l.includes('Date'))).toBe(true);
    expect(labels.some(l => l.includes('Species'))).toBe(true);
    expect(labels.some(l => l.includes('Collector'))).toBe(true);
    expect(labels.some(l => l.includes('Observer'))).toBe(true);
    expect(labels.some(l => l.includes('County'))).toBe(true);
    expect(labels.some(l => l.includes('Ecoregion'))).toBe(true);
    expect(labels.some(l => l.includes('Elev'))).toBe(true);
    expect(labels.some(l => l.includes('Field #'))).toBe(true);
    expect(labels.some(l => l.includes('Modified'))).toBe(true);
    expect(labels.some(l => l.includes('Photo'))).toBe(true);
    expect(headers.length).toBe(10);
    document.body.removeChild(el);
  });
});

describe('TABLE-02: bee-table row count indicator', () => {
  test('shows "Showing 1-100 of 3,847 occurrences" for page=1, rowCount=3847', async () => {
    const el = await createBeeTable({ rowCount: 3847, page: 1 });
    const label = el.shadowRoot!.querySelector('.row-count');
    expect(label?.textContent).toMatch(/Showing 1[–\u2013]100 of 3,847 occurrences/);
    document.body.removeChild(el);
  });

  test('shows "Showing 101-200 of 500 occurrences" for page=2, rowCount=500', async () => {
    const el = await createBeeTable({ rowCount: 500, page: 2 });
    const label = el.shadowRoot!.querySelector('.row-count');
    expect(label?.textContent).toMatch(/Showing 101[–\u2013]200 of 500 occurrences/);
    document.body.removeChild(el);
  });

  test('shows "Showing 401-427 of 427 occurrences" for last page (page=5, rowCount=427)', async () => {
    const el = await createBeeTable({ rowCount: 427, page: 5 });
    const label = el.shadowRoot!.querySelector('.row-count');
    expect(label?.textContent).toMatch(/Showing 401[–\u2013]427 of 427 occurrences/);
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
    const el = await createBeeTable({ rows: [], rowCount: 0, loading: false });
    const emptyState = el.shadowRoot!.querySelector('.empty-state');
    expect(emptyState).not.toBeNull();
    expect(emptyState?.textContent).toMatch(/No occurrences match the current filters/);
    document.body.removeChild(el);
  });
});

describe('TABLE-07: bee-table accessibility', () => {
  test('cells have title attribute matching cell text content', async () => {
    const occurrenceRows = [{
      scientificName: 'Bombus vosnesenskii',
      recordedBy: 'Jane Smith',
      observer: null,
      year: 2023,
      month: 6,
      county: 'King',
      ecoregion_l3: 'Cascades',
      fieldNumber: 'JS-001',
      modified: '2025-03-13',
      date: '2023-06-15',
      elevation_m: null,
      specimen_observation_id: null,
    }];
    const el = await createBeeTable({ rows: occurrenceRows, rowCount: 1, page: 1 });
    const firstCell = el.shadowRoot!.querySelector('tbody td') as HTMLElement;
    expect(firstCell?.getAttribute('title')).toBe(firstCell?.textContent?.trim());
    document.body.removeChild(el);
  });

  test('row count label is wrapped in aria-live="polite" span', async () => {
    const el = await createBeeTable({ rowCount: 100, page: 1 });
    const ariaLive = el.shadowRoot!.querySelector('[aria-live="polite"]');
    expect(ariaLive).not.toBeNull();
    document.body.removeChild(el);
  });
});

describe('TABLE-08: bee-table sort controls', () => {
  test('sortBy=date shows sort indicator (\u25BC) on Date header', async () => {
    const el = await createBeeTable({ rows: [], rowCount: 100, sortBy: 'date' });
    const headers = Array.from(el.shadowRoot!.querySelectorAll('th'));
    const dateHeader = headers.find(th => th.textContent?.includes('Date'));
    expect(dateHeader).not.toBeUndefined();
    expect(dateHeader!.textContent).toContain('\u25BC');
    // Modified header should NOT show indicator
    const modifiedHeader = headers.find(th => th.textContent?.includes('Modified'));
    expect(modifiedHeader!.textContent).not.toContain('\u25BC');
    document.body.removeChild(el);
  });

  test('sortBy=modified shows sort indicator (\u25BC) on Modified header', async () => {
    const el = await createBeeTable({ rows: [], rowCount: 100, sortBy: 'modified' });
    const headers = Array.from(el.shadowRoot!.querySelectorAll('th'));
    const modifiedHeader = headers.find(th => th.textContent?.includes('Modified'));
    expect(modifiedHeader).not.toBeUndefined();
    expect(modifiedHeader!.textContent).toContain('\u25BC');
    // Date header should NOT show indicator
    const dateHeader = headers.find(th => th.textContent?.includes('Date'));
    expect(dateHeader!.textContent).not.toContain('\u25BC');
    document.body.removeChild(el);
  });

  test('clicking Modified header dispatches sort-changed event with { sortBy: "modified" }', async () => {
    const el = await createBeeTable({ rows: [], rowCount: 100, sortBy: 'date' });
    const sortChangedPromise = new Promise<CustomEvent>(resolve => {
      el.addEventListener('sort-changed', (e) => resolve(e as CustomEvent));
    });
    const headers = Array.from(el.shadowRoot!.querySelectorAll('th'));
    const modifiedHeader = headers.find(th => th.textContent?.includes('Modified')) as HTMLElement;
    modifiedHeader?.click();
    const event = await sortChangedPromise;
    expect(event.detail.sortBy).toBe('modified');
    document.body.removeChild(el);
  });
});
