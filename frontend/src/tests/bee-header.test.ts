import { test, expect, describe, vi } from 'vitest';

// Mock heavy modules that have module-level side effects incompatible with happy-dom
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

describe('HDR: bee-header property interface', () => {
  test('BeeHeader has @property declarations for layerMode and viewMode', async () => {
    const { BeeHeader } = await import('../bee-header.ts');
    const props = (BeeHeader as unknown as { elementProperties: Map<string, unknown> }).elementProperties;
    expect(props.has('layerMode')).toBe(true);
    expect(props.has('viewMode')).toBe(true);
  });

  test('BeeHeader is registered as bee-header custom element', async () => {
    await import('../bee-header.ts');
    const el = document.createElement('bee-header');
    expect(el.tagName.toLowerCase()).toBe('bee-header');
  });
});

describe('HDR: bee-header event emission', () => {
  test('clicking inactive Samples tab dispatches layer-changed with detail "samples"', async () => {
    await import('../bee-header.ts');
    const el = document.createElement('bee-header') as any;
    el.layerMode = 'specimens';
    document.body.appendChild(el);
    await el.updateComplete;

    let receivedEvent: CustomEvent | null = null;
    el.addEventListener('layer-changed', (e: CustomEvent) => {
      receivedEvent = e;
    });

    const shadow = el.shadowRoot!;
    const buttons = shadow.querySelectorAll('button.tab-btn');
    const samplesBtn = Array.from<Element>(buttons).find(
      (b) => b.textContent?.trim() === 'Samples'
    ) as HTMLButtonElement | undefined;
    expect(samplesBtn).toBeDefined();
    samplesBtn!.click();

    expect(receivedEvent).not.toBeNull();
    expect(receivedEvent!.detail).toBe('samples');

    document.body.removeChild(el);
  });

  test('clicking already-active Specimens tab does NOT dispatch layer-changed', async () => {
    await import('../bee-header.ts');
    const el = document.createElement('bee-header') as any;
    el.layerMode = 'specimens';
    document.body.appendChild(el);
    await el.updateComplete;

    let eventCount = 0;
    el.addEventListener('layer-changed', () => {
      eventCount++;
    });

    const shadow = el.shadowRoot!;
    const buttons = shadow.querySelectorAll('button.tab-btn');
    const specimensBtn = Array.from<Element>(buttons).find(
      (b) => b.textContent?.trim() === 'Specimens'
    ) as HTMLButtonElement | undefined;
    expect(specimensBtn).toBeDefined();
    specimensBtn!.click();

    expect(eventCount).toBe(0);

    document.body.removeChild(el);
  });

  test('clicking inactive Table view button dispatches view-changed with detail "table"', async () => {
    await import('../bee-header.ts');
    const el = document.createElement('bee-header') as any;
    el.viewMode = 'map';
    document.body.appendChild(el);
    await el.updateComplete;

    let receivedEvent: CustomEvent | null = null;
    el.addEventListener('view-changed', (e: CustomEvent) => {
      receivedEvent = e;
    });

    const shadow = el.shadowRoot!;
    const tableBtn = shadow.querySelector('button[aria-label="Table view"]') as HTMLButtonElement | null;
    expect(tableBtn).not.toBeNull();
    tableBtn!.click();

    expect(receivedEvent).not.toBeNull();
    expect(receivedEvent!.detail).toBe('table');

    document.body.removeChild(el);
  });
});

describe('HDR: disabled placeholder tabs', () => {
  test('Species and Plants tabs have disabled attribute', async () => {
    await import('../bee-header.ts');
    const el = document.createElement('bee-header') as any;
    document.body.appendChild(el);
    await el.updateComplete;

    const shadow = el.shadowRoot!;
    // Find all tab buttons (from inline-tabs; disabled ones should have the disabled attribute)
    const allButtons = shadow.querySelectorAll('button.tab-btn');
    const speciesBtn = Array.from<Element>(allButtons).find(
      (b) => b.textContent?.trim() === 'Species'
    ) as HTMLButtonElement | undefined;
    const plantsBtn = Array.from<Element>(allButtons).find(
      (b) => b.textContent?.trim() === 'Plants'
    ) as HTMLButtonElement | undefined;

    expect(speciesBtn).toBeDefined();
    expect(plantsBtn).toBeDefined();
    expect(speciesBtn!.disabled).toBe(true);
    expect(plantsBtn!.disabled).toBe(true);

    document.body.removeChild(el);
  });
});

describe('HDR: hamburger menu', () => {
  test('a <details> element exists in shadow DOM', async () => {
    await import('../bee-header.ts');
    const el = document.createElement('bee-header') as any;
    document.body.appendChild(el);
    await el.updateComplete;

    const shadow = el.shadowRoot!;
    const details = shadow.querySelector('details');
    expect(details).not.toBeNull();

    document.body.removeChild(el);
  });

  test('a <summary> element exists inside <details>', async () => {
    await import('../bee-header.ts');
    const el = document.createElement('bee-header') as any;
    document.body.appendChild(el);
    await el.updateComplete;

    const shadow = el.shadowRoot!;
    const summary = shadow.querySelector('details summary');
    expect(summary).not.toBeNull();

    document.body.removeChild(el);
  });
});
