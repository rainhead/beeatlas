import { test, expect, describe, vi, beforeEach } from 'vitest';
import type { SearchStatus } from '../bee-header.ts';

// beeatlas-v66 — the search button in <bee-header>, successor to the label-number
// field that lived in <bee-pane>'s filter panel (beeatlas-8zs).
//
// Mounted rather than grepped: the whole contract is behavioral (the button opens a
// popover, Enter submits, editing retires the message, the header stays a pure
// presenter), and none of that is visible in the source text.
vi.mock('../sqlite.ts', () => ({
  getDB: vi.fn(() => Promise.resolve({ sqlite3: {}, db: 0 })),
  loadOccurrencesTable: vi.fn(() => Promise.resolve()),
  tablesReady: Promise.resolve(),
}));

vi.mock('../manifest.ts', () => ({
  resolveDataUrl: vi.fn(() => Promise.resolve(null)),
  loadFreshnessLabel: vi.fn(() => Promise.resolve(null)),
  loadBuildId: vi.fn(() => Promise.resolve(null)),
}));

await import('../bee-header.ts');

interface HeaderEl extends HTMLElement {
  searchEnabled: boolean;
  searchStatus: SearchStatus | null;
  updateComplete: Promise<unknown>;
}

const FIELD = 'input[aria-label="Find a specimen by its catalog or label number"]';

let header: HeaderEl;

async function mountHeader(searchEnabled = true): Promise<HeaderEl> {
  const el = document.createElement('bee-header') as HeaderEl;
  el.searchEnabled = searchEnabled;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

function searchButton(el: HeaderEl): HTMLButtonElement | null {
  return el.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Search"]');
}

async function openSearch(el: HeaderEl) {
  const btn = searchButton(el);
  expect(btn, 'the search button is rendered').not.toBeNull();
  btn!.click();
  await el.updateComplete;
}

function searchInput(el: HeaderEl): HTMLInputElement {
  const input = el.shadowRoot!.querySelector<HTMLInputElement>(FIELD);
  expect(input, 'the search field is rendered in the open popover').not.toBeNull();
  return input!;
}

async function type(el: HeaderEl, value: string) {
  const input = searchInput(el);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  await el.updateComplete;
}

async function pressEnter(el: HeaderEl) {
  searchInput(el).dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true })
  );
  await el.updateComplete;
}

beforeEach(async () => {
  document.body.innerHTML = '';
  header = await mountHeader();
});

describe('search is a header button, left of the account', () => {
  test('the field is behind the button, not always on screen', async () => {
    expect(header.shadowRoot!.querySelector(FIELD)).toBeNull();
    await openSearch(header);
    expect(searchInput(header)).not.toBeNull();
  });

  test('the search button sits before the account button in the trailing group', async () => {
    const buttons = [...header.shadowRoot!.querySelectorAll('.right-group button')];
    const searchIdx = buttons.findIndex(b => b.getAttribute('aria-label') === 'Search');
    const accountIdx = buttons.findIndex(b => b.classList.contains('account-btn'));
    expect(searchIdx).toBeGreaterThanOrEqual(0);
    expect(accountIdx).toBeGreaterThanOrEqual(0);
    expect(searchIdx).toBeLessThan(accountIdx);
  });

  test('a header that cannot answer a query shows no button', async () => {
    // The static pages (species/places/collectors) mount this header through
    // src/entries/bee-header.ts with no store behind it. A dead search button is
    // worse than none.
    document.body.innerHTML = '';
    const plain = await mountHeader(false);
    expect(searchButton(plain)).toBeNull();
  });

  test('opening search closes the account menu — both anchor to the same corner', async () => {
    header.shadowRoot!.querySelector<HTMLButtonElement>('.account-btn')!.click();
    await header.updateComplete;
    expect(header.shadowRoot!.querySelector('.account-popover')).not.toBeNull();

    await openSearch(header);
    expect(header.shadowRoot!.querySelector('.account-popover')).toBeNull();
    expect(header.shadowRoot!.querySelector('.search-popover')).not.toBeNull();
  });

  test('opening the account menu closes search', async () => {
    await openSearch(header);
    header.shadowRoot!.querySelector<HTMLButtonElement>('.account-btn')!.click();
    await header.updateComplete;
    expect(header.shadowRoot!.querySelector('.search-popover')).toBeNull();
  });

  test('a hit closes the popover — the answer lands in the surface it covers', async () => {
    await openSearch(header);
    await type(header, '2303966');
    header.searchStatus = { query: '2303966', kind: 'hit' };
    await header.updateComplete;

    expect(header.shadowRoot!.querySelector('.search-popover')).toBeNull();
    // ...and the next search starts from an empty field.
    await openSearch(header);
    expect(searchInput(header).value).toBe('');
  });

  test('a miss keeps the popover open — the message is all that came back', async () => {
    await openSearch(header);
    await type(header, '9999999');
    header.searchStatus = { query: '9999999', kind: 'miss' };
    await header.updateComplete;
    expect(header.shadowRoot!.querySelector('.search-popover')).not.toBeNull();
  });

  test('Escape closes the popover once the field is empty', async () => {
    await openSearch(header);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await header.updateComplete;
    expect(header.shadowRoot!.querySelector('.search-popover')).toBeNull();
  });
});

describe('the search field submits a query', () => {
  beforeEach(async () => {
    await openSearch(header);
  });

  test('Enter dispatches search-submit carrying what the user typed', async () => {
    const seen: string[] = [];
    header.addEventListener('search-submit', (e) => {
      seen.push((e as CustomEvent<{ query: string }>).detail.query);
    });

    await type(header, 'WSDA_2303966');
    expect(seen, 'typing alone must not fire a lookup').toEqual([]);

    await pressEnter(header);
    expect(seen).toEqual(['WSDA_2303966']);
  });

  test('the event escapes the shadow root so <bee-atlas> can hear it', async () => {
    const seen: Event[] = [];
    document.addEventListener('search-submit', (e) => seen.push(e));
    await type(header, '2303966');
    await pressEnter(header);
    expect(seen).toHaveLength(1);
  });

  test('a keystroke that is not Enter submits nothing', async () => {
    const seen: Event[] = [];
    header.addEventListener('search-submit', (e) => seen.push(e));
    await type(header, '230396');
    searchInput(header).dispatchEvent(
      new KeyboardEvent('keydown', { key: '6', bubbles: true, composed: true })
    );
    await header.updateComplete;
    expect(seen).toEqual([]);
  });

  test('the header stays a presenter — a search never emits filter-changed', async () => {
    const seen: Event[] = [];
    header.addEventListener('filter-changed', (e) => seen.push(e));
    await type(header, '2303966');
    await pressEnter(header);
    expect(seen).toEqual([]);
  });
});

describe('the status message tracks the field, not the clock', () => {
  beforeEach(async () => {
    await openSearch(header);
  });

  test('a reported miss is shown against the number that missed', async () => {
    await type(header, '9999999');
    header.searchStatus = { query: '9999999', kind: 'miss' };
    await header.updateComplete;
    expect(header.shadowRoot!.textContent).toContain('No specimen with number 9999999');
  });

  test('editing the number retires the message with no round-trip to the parent', async () => {
    await type(header, '9999999');
    header.searchStatus = { query: '9999999', kind: 'miss' };
    await header.updateComplete;
    expect(header.shadowRoot!.textContent).toContain('No specimen with number');

    await type(header, '999999');
    // searchStatus is untouched — the parent has not been asked anything yet.
    expect(header.searchStatus).toEqual({ query: '9999999', kind: 'miss' });
    expect(header.shadowRoot!.textContent).not.toContain('No specimen with number');
  });

  test('a stale miss from an earlier number does not haunt a different one', async () => {
    header.searchStatus = { query: '9999999', kind: 'miss' };
    await type(header, '2303966');
    expect(header.shadowRoot!.textContent).not.toContain('No specimen with number');
  });

  test('no message at all when nothing has missed', async () => {
    await type(header, '2303966');
    expect(header.shadowRoot!.textContent).not.toContain('No specimen with number');
  });

  test('Escape in a non-empty field clears it — and takes the message with it', async () => {
    await type(header, '9999999');
    header.searchStatus = { query: '9999999', kind: 'miss' };
    await header.updateComplete;

    searchInput(header).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true })
    );
    await header.updateComplete;

    expect(
      header.shadowRoot!.querySelector('.search-popover'),
      'the first Escape clears the field; it does not close the popover',
    ).not.toBeNull();
    expect(searchInput(header).value).toBe('');
    expect(header.shadowRoot!.textContent).not.toContain('No specimen with number');
  });
});

describe('a failure is not a miss', () => {
  beforeEach(async () => {
    await openSearch(header);
  });

  test('a failed lookup says so, and does not claim the number is absent', async () => {
    // The distinction the user acts on: "no specimen has this number" would send a
    // curator off to check their label, when in fact the lookup never ran — most
    // plausibly an offline cold-start with the wa-sqlite wasm uncached.
    await type(header, '2303966');
    header.searchStatus = { query: '2303966', kind: 'error' };
    await header.updateComplete;
    const text = header.shadowRoot!.textContent!;
    expect(text).toContain("Couldn't look that up just now");
    expect(text).not.toContain('No specimen with number');
  });

  test('editing the number retires the failure message too', async () => {
    await type(header, '2303966');
    header.searchStatus = { query: '2303966', kind: 'error' };
    await header.updateComplete;
    expect(header.shadowRoot!.textContent).toContain("Couldn't look that up");
    await type(header, '230396');
    expect(header.shadowRoot!.textContent).not.toContain("Couldn't look that up");
  });
});
