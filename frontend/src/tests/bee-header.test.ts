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

describe('HDR: bee-header property interface', () => {
  test('BeeHeader has @property declaration for viewMode', async () => {
    const { BeeHeader } = await import('../bee-header.ts');
    const props = (BeeHeader as unknown as { elementProperties: Map<string, unknown> }).elementProperties;
    expect(props.has('viewMode')).toBe(true);
    expect(props.has('layerMode')).toBe(false);
  });

  test('BeeHeader is registered as bee-header custom element', async () => {
    await import('../bee-header.ts');
    const el = document.createElement('bee-header');
    expect(el.tagName.toLowerCase()).toBe('bee-header');
  });

  test('bee-header.ts does NOT contain layerMode, _onLayerClick, or layer-changed', () => {
    const src = readFileSync(resolve(__dirname, '../bee-header.ts'), 'utf-8');
    expect(src).not.toMatch(/layerMode/);
    expect(src).not.toMatch(/_onLayerClick/);
    expect(src).not.toMatch(/layer-changed/);
  });
});

describe('HDR: bee-header event emission', () => {
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

  test('clicking active Map view button does NOT dispatch view-changed', async () => {
    await import('../bee-header.ts');
    const el = document.createElement('bee-header') as any;
    el.viewMode = 'map';
    document.body.appendChild(el);
    await el.updateComplete;

    let eventCount = 0;
    el.addEventListener('view-changed', () => { eventCount++; });

    const shadow = el.shadowRoot!;
    const mapBtn = shadow.querySelector('button[aria-label="Map view"]') as HTMLButtonElement | null;
    expect(mapBtn).not.toBeNull();
    mapBtn!.click();

    expect(eventCount).toBe(0);
    document.body.removeChild(el);
  });
});
