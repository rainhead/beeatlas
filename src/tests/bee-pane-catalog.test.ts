import { test, expect, describe, vi, beforeEach } from 'vitest';
import { emptyFilterState } from '../filter.ts';

// beeatlas-8zs — the catalog-number field in <bee-pane>.
//
// Mounted rather than grepped: the field's whole contract is behavioral (Enter
// submits, editing retires the miss message, the pane stays a pure presenter),
// and none of that is visible in the source text.
vi.mock('../sqlite.ts', () => ({
  getDB: vi.fn(() => Promise.resolve({ sqlite3: {}, db: 0 })),
  loadOccurrencesTable: vi.fn(() => Promise.resolve()),
  tablesReady: Promise.resolve(),
}));

vi.mock('../manifest.ts', () => ({
  resolveDataUrl: vi.fn(() => Promise.resolve(null)),
  loadFreshnessLabel: vi.fn(() => Promise.resolve(null)),
}));

await import('../bee-pane.ts');

interface PaneEl extends HTMLElement {
  paneState: string;
  filterState: ReturnType<typeof emptyFilterState>;
  catalogLookupMiss: string | null;
  updateComplete: Promise<unknown>;
}

let pane: PaneEl;

async function mountPane(): Promise<PaneEl> {
  const el = document.createElement('bee-pane') as PaneEl;
  el.filterState = emptyFilterState();
  el.paneState = 'list';
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

function catalogInput(el: PaneEl): HTMLInputElement {
  const input = el.shadowRoot!.querySelector<HTMLInputElement>(
    'input[aria-label="Find a specimen by its catalog or label number"]'
  );
  expect(input, 'catalog lookup input is rendered in the list pane').not.toBeNull();
  return input!;
}

async function type(el: PaneEl, value: string) {
  const input = catalogInput(el);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  await el.updateComplete;
}

async function pressEnter(el: PaneEl) {
  catalogInput(el).dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true })
  );
  await el.updateComplete;
}

beforeEach(async () => {
  document.body.innerHTML = '';
  pane = await mountPane();
});

describe('the catalog-number field submits a lookup', () => {
  test('Enter dispatches catalog-lookup carrying what the user typed', async () => {
    const seen: string[] = [];
    pane.addEventListener('catalog-lookup', (e) => {
      seen.push((e as CustomEvent<{ query: string }>).detail.query);
    });

    await type(pane, 'WSDA_2303966');
    expect(seen, 'typing alone must not fire a lookup').toEqual([]);

    await pressEnter(pane);
    expect(seen).toEqual(['WSDA_2303966']);
  });

  test('the event escapes the shadow root so <bee-atlas> can hear it', async () => {
    const seen: Event[] = [];
    document.addEventListener('catalog-lookup', (e) => seen.push(e));
    await type(pane, '2303966');
    await pressEnter(pane);
    expect(seen).toHaveLength(1);
  });

  test('a keystroke that is not Enter submits nothing', async () => {
    const seen: Event[] = [];
    pane.addEventListener('catalog-lookup', (e) => seen.push(e));
    await type(pane, '230396');
    catalogInput(pane).dispatchEvent(
      new KeyboardEvent('keydown', { key: '6', bubbles: true, composed: true })
    );
    await pane.updateComplete;
    expect(seen).toEqual([]);
  });

  test('the field is a SELECTION affordance — it never emits filter-changed', async () => {
    const seen: Event[] = [];
    pane.addEventListener('filter-changed', (e) => seen.push(e));
    await type(pane, '2303966');
    await pressEnter(pane);
    expect(seen).toEqual([]);
  });
});

describe('the miss message tracks the field, not the clock', () => {
  test('a reported miss is shown against the number that missed', async () => {
    await type(pane, '9999999');
    pane.catalogLookupMiss = '9999999';
    await pane.updateComplete;
    expect(pane.shadowRoot!.textContent).toContain('No specimen with number 9999999');
  });

  test('editing the number retires the message with no round-trip to the parent', async () => {
    await type(pane, '9999999');
    pane.catalogLookupMiss = '9999999';
    await pane.updateComplete;
    expect(pane.shadowRoot!.textContent).toContain('No specimen with number');

    await type(pane, '999999');
    // catalogLookupMiss is untouched — the parent has not been asked anything yet.
    expect(pane.catalogLookupMiss).toBe('9999999');
    expect(pane.shadowRoot!.textContent).not.toContain('No specimen with number');
  });

  test('a stale miss from an earlier number does not haunt a different one', async () => {
    pane.catalogLookupMiss = '9999999';
    await type(pane, '2303966');
    expect(pane.shadowRoot!.textContent).not.toContain('No specimen with number');
  });

  test('no message at all when nothing has missed', async () => {
    await type(pane, '2303966');
    expect(pane.shadowRoot!.textContent).not.toContain('No specimen with number');
  });

  test('the clear button empties the field and takes the message with it', async () => {
    await type(pane, '9999999');
    pane.catalogLookupMiss = '9999999';
    await pane.updateComplete;

    const clear = pane.shadowRoot!.querySelector<HTMLButtonElement>(
      'button[aria-label="Clear label number"]'
    );
    expect(clear).not.toBeNull();
    clear!.click();
    await pane.updateComplete;

    expect(catalogInput(pane).value).toBe('');
    expect(pane.shadowRoot!.textContent).not.toContain('No specimen with number');
  });
});
