import { test, expect, describe, vi, beforeEach } from 'vitest';
import type { SearchStatus } from '../bee-header.ts';
import type { SearchCandidate } from '../search.ts';

// beeatlas-v66 — the search button in <bee-header>, successor to the label-number
// field that lived in <bee-pane>'s filter panel (beeatlas-8zs).
//
// Mounted rather than grepped: the whole contract is behavioral (the button opens a
// popover, Enter submits, editing retires the message, the header stays a pure
// presenter), and none of that is visible in the source text.
vi.mock('../sqlite.ts', () => ({
  // exec is a no-op that yields no rows: <bee-atlas> boots filter-active now (the default
  // view hides the `other` tier, ADR 0041), so mounting it runs a map query straight away.
  // A bare `sqlite3: {}` made that an unhandled `sqlite3.exec is not a function` rejection.
  getDB: vi.fn(() => Promise.resolve({ sqlite3: { exec: vi.fn(() => Promise.resolve()) }, db: 0 })),
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
  searchCandidates: SearchCandidate[];
  searchCandidatesTruncated: boolean;
  updateComplete: Promise<unknown>;
}

const FIELD = 'input.search-input';

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

function rows(el: HeaderEl): HTMLButtonElement[] {
  return [...el.shadowRoot!.querySelectorAll<HTMLButtonElement>('.search-result')];
}

async function pressKey(el: HeaderEl, key: string, target: Element = searchInput(el)) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true }));
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

describe('the search field asks for candidates and reports a pick', () => {
  // The v66 seam (`search-submit`) is retired. The header ranks nothing and
  // resolves nothing: it asks for candidates as you type (`search-query`) and
  // reports the row you chose (`search-pick`). ADR 0028.
  const TAXON: SearchCandidate = {
    kind: 'taxon', taxonId: 42, key: 'taxon:42', label: 'Bombus (genus)',
    detail: 'genus', weight: 4182, href: '/species/Bombus/',
  };
  const LABEL: SearchCandidate = {
    kind: 'label', suffix: '2303966', key: 'label:2303966', label: '2303966',
    detail: null, weight: 0, href: null,
  };

  beforeEach(async () => {
    await openSearch(header);
  });

  async function offer(candidates: SearchCandidate[], truncated = false) {
    header.searchCandidates = candidates;
    header.searchCandidatesTruncated = truncated;
    await header.updateComplete;
  }

  test('every keystroke asks for a ranking — resolving is not deferred to Enter', async () => {
    const seen: string[] = [];
    header.addEventListener('search-query', (e) => {
      seen.push((e as CustomEvent<{ query: string }>).detail.query);
    });
    await type(header, 'Bom');
    await type(header, 'Bombus');
    expect(seen).toEqual(['Bom', 'Bombus']);
  });

  test('the query is asked trimmed', async () => {
    const seen: string[] = [];
    header.addEventListener('search-query', (e) => {
      seen.push((e as CustomEvent<{ query: string }>).detail.query);
    });
    await type(header, '  2303966 ');
    expect(seen).toEqual(['2303966']);
  });

  test('clicking a row reports that exact candidate', async () => {
    const seen: SearchCandidate[] = [];
    header.addEventListener('search-pick', (e) => {
      seen.push((e as CustomEvent<{ candidate: SearchCandidate }>).detail.candidate);
    });
    await type(header, 'Bombus');
    await offer([TAXON, LABEL]);
    rows(header)[0]!.click();
    await header.updateComplete;
    expect(seen).toEqual([TAXON]);
  });

  test('Enter with nothing highlighted picks the first candidate', async () => {
    // That is what the old bare submit meant, which is why search-submit had
    // nothing left to carry.
    const seen: SearchCandidate[] = [];
    header.addEventListener('search-pick', (e) => {
      seen.push((e as CustomEvent<{ candidate: SearchCandidate }>).detail.candidate);
    });
    await type(header, 'Bombus');
    await offer([TAXON, LABEL]);
    await pressEnter(header);
    expect(seen).toEqual([TAXON]);
  });

  test('ArrowDown moves the pick to the row it highlights', async () => {
    const seen: SearchCandidate[] = [];
    header.addEventListener('search-pick', (e) => {
      seen.push((e as CustomEvent<{ candidate: SearchCandidate }>).detail.candidate);
    });
    await type(header, 'Bombus');
    await offer([TAXON, LABEL]);
    await pressKey(header, 'ArrowDown');
    await pressKey(header, 'ArrowDown', rows(header)[0]!);
    rows(header)[1]!.click();
    await header.updateComplete;
    expect(seen).toEqual([LABEL]);
  });

  test('the pick carries the query, because a label row can still come back empty', async () => {
    const seen: { candidate: SearchCandidate; query: string }[] = [];
    header.addEventListener('search-pick', (e) => {
      seen.push((e as CustomEvent<{ candidate: SearchCandidate; query: string }>).detail);
    });
    await type(header, '2303966');
    await offer([LABEL]);
    await pressEnter(header);
    expect(seen[0]!.query).toBe('2303966');
  });

  test('the submit button picks — on a phone it is the only way to', async () => {
    // ADR 0021 kept this button even though the numeric keypad hint is now gone:
    // on touch a visible tap target beats a keyboard convention.
    const seen: SearchCandidate[] = [];
    header.addEventListener('search-pick', (e) => {
      seen.push((e as CustomEvent<{ candidate: SearchCandidate }>).detail.candidate);
    });
    await type(header, '2303966');
    await offer([LABEL]);
    header.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Submit search"]')!.click();
    await header.updateComplete;
    expect(seen).toEqual([LABEL]);
  });

  test('the submit button is dead until there is something to pick', async () => {
    const btn = () => header.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Submit search"]')!;
    expect(btn().disabled).toBe(true);
    await type(header, '  ');
    expect(btn().disabled, 'whitespace is not a query').toBe(true);
    await type(header, 'Bombus');
    expect(btn().disabled, 'nor is a query nothing answers to').toBe(true);
    await offer([TAXON]);
    expect(btn().disabled).toBe(false);
  });

  test('Enter picks nothing when nothing was offered', async () => {
    const seen: Event[] = [];
    header.addEventListener('search-pick', (e) => seen.push(e));
    await pressEnter(header);
    await type(header, 'Zzzz');
    await pressEnter(header);
    expect(seen).toEqual([]);
  });

  test('the events escape the shadow root so <bee-atlas> can hear them', async () => {
    const seen: string[] = [];
    document.addEventListener('search-query', () => seen.push('query'));
    document.addEventListener('search-pick', () => seen.push('pick'));
    await type(header, 'Bombus');
    await offer([TAXON]);
    await pressEnter(header);
    expect(seen).toEqual(['query', 'pick']);
  });

  test('the header stays a presenter — a search never emits filter-changed', async () => {
    const seen: Event[] = [];
    header.addEventListener('filter-changed', (e) => seen.push(e));
    await type(header, 'Bombus');
    await offer([TAXON]);
    await pressEnter(header);
    expect(seen).toEqual([]);
  });

  test('a row is a button, and its page link is a real link beside it', async () => {
    // NOT an ARIA listbox: an option cannot contain a focusable child, which is
    // exactly what the page link is (ADR 0028).
    await type(header, 'Bombus');
    await offer([TAXON, LABEL]);
    expect(header.shadowRoot!.querySelector('[role="listbox"]')).toBeNull();
    const link = header.shadowRoot!.querySelector<HTMLAnchorElement>('.search-result-link');
    expect(link!.getAttribute('href')).toBe('/species/Bombus/');
  });

  test('a candidate with no page gets no link, rather than a guessed one', async () => {
    await type(header, '2303966');
    await offer([LABEL]);
    expect(header.shadowRoot!.querySelector('.search-result-link')).toBeNull();
  });

  test('a truncated list says so', async () => {
    await type(header, 'b');
    await offer([TAXON], true);
    expect(header.shadowRoot!.textContent).toContain('More matches');
    await offer([TAXON], false);
    expect(header.shadowRoot!.textContent).not.toContain('More matches');
  });

  test('arrowing to a row picks THAT row, even when grouping reorders (regression)', async () => {
    // Rank order interleaves kinds; the rendered list groups them. Three sequences
    // used to be in play — the ranked array, the DOM, and _searchActive — so
    // arrowing to the ecoregion row and pressing Enter applied the TAXON that sat at
    // the same ranked index. Different thing, different kind, silently.
    const ECOREGION: SearchCandidate = {
      kind: 'ecoregion', name: 'Eastern Cascades', key: 'ecoregion:Eastern Cascades',
      label: 'Eastern Cascades', detail: null, weight: 4676, href: null,
    };
    const SECOND_TAXON: SearchCandidate = {
      kind: 'taxon', taxonId: 7, key: 'taxon:7', label: 'Andrena prunorum',
      detail: 'species', weight: 1192, href: null,
    };
    const picked: SearchCandidate[] = [];
    header.addEventListener('search-pick', (e) => {
      picked.push((e as CustomEvent<{ candidate: SearchCandidate }>).detail.candidate);
    });

    await type(header, 'an');
    // Ranked: taxon, ECOREGION, taxon — grouping moves the ecoregion to the END.
    await offer([TAXON, ECOREGION, SECOND_TAXON]);
    expect(rows(header).map(r => r.textContent!.trim().split('\n')[0]!.trim()))
      .toEqual(['Bombus (genus)', 'Andrena prunorum', 'Eastern Cascades']);

    // Walk to the LAST row on screen, which is the ecoregion.
    await pressKey(header, 'ArrowDown');
    await pressKey(header, 'ArrowDown', rows(header)[0]!);
    await pressKey(header, 'ArrowDown', rows(header)[1]!);
    rows(header)[2]!.click();
    await header.updateComplete;
    expect(picked).toEqual([ECOREGION]);
  });

  test('Enter picks the first row AS DISPLAYED, not the top-ranked candidate', async () => {
    const ECOREGION: SearchCandidate = {
      kind: 'ecoregion', name: 'E', key: 'ecoregion:E', label: 'E',
      detail: null, weight: 99, href: null,
    };
    const picked: SearchCandidate[] = [];
    header.addEventListener('search-pick', (e) => {
      picked.push((e as CustomEvent<{ candidate: SearchCandidate }>).detail.candidate);
    });
    await type(header, 'x');
    await offer([TAXON, ECOREGION]);
    await pressEnter(header);
    // Here the two orders agree; the point is that display order is what is consulted.
    expect(picked).toEqual([TAXON]);
  });

  test('with no row active the FIRST row stays in the tab sequence', async () => {
    // Roving tabindex: exactly one row must be tabbable. All -1 would send Tab from
    // the field past every row button and onto the first row's page LINK — reaching
    // the escape hatch before the primary action.
    await type(header, 'Bombus');
    await offer([TAXON, LABEL]);
    expect(rows(header).map(r => r.getAttribute('tabindex'))).toEqual(['0', '-1']);
  });

  test('a hit for an abandoned query does not close a newer search', async () => {
    // A label pick resolves asynchronously. If the reader retypes while it is in
    // flight, its late hit must not clear the query they are in the middle of.
    await type(header, '2303966');
    await offer([LABEL]);
    await type(header, 'Bombus');
    header.searchStatus = { query: '2303966', kind: 'hit' };
    await header.updateComplete;
    expect(searchInput(header).value, 'the newer query survives').toBe('Bombus');
  });

  test('a hit for the query in the field does close the popover', async () => {
    await type(header, '2303966');
    await offer([LABEL]);
    header.searchStatus = { query: '2303966', kind: 'hit' };
    await header.updateComplete;
    expect(header.shadowRoot!.querySelector('.search-input')).toBeNull();
  });

  test('Enter in an emptied field picks nothing, even with candidates still in hand', async () => {
    // The candidate list is cleared by whoever ranks it, one turn later; Enter in
    // that window must do what the disabled submit button does.
    const picked: Event[] = [];
    header.addEventListener('search-pick', (e) => picked.push(e));
    await type(header, 'Bombus');
    await offer([TAXON]);
    await type(header, '');
    await pressEnter(header);
    expect(picked).toEqual([]);
  });

  test('kind is a heading over the rows it explains', async () => {
    await type(header, 'Bombus');
    await offer([TAXON, LABEL]);
    const headings = [...header.shadowRoot!.querySelectorAll('.search-group-label')].map(h => h.textContent);
    expect(headings).toEqual(['Species and groups', 'Label number']);
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
    expect(header.shadowRoot!.textContent).toContain('Nothing matches 9999999');
  });

  test('editing the number retires the message with no round-trip to the parent', async () => {
    await type(header, '9999999');
    header.searchStatus = { query: '9999999', kind: 'miss' };
    await header.updateComplete;
    expect(header.shadowRoot!.textContent).toContain('Nothing matches');

    await type(header, '999999');
    // searchStatus is untouched — the parent has not been asked anything yet.
    expect(header.searchStatus).toEqual({ query: '9999999', kind: 'miss' });
    expect(header.shadowRoot!.textContent).not.toContain('Nothing matches');
  });

  test('a stale miss from an earlier number does not haunt a different one', async () => {
    header.searchStatus = { query: '9999999', kind: 'miss' };
    await type(header, '2303966');
    expect(header.shadowRoot!.textContent).not.toContain('Nothing matches');
  });

  test('no message at all when nothing has missed', async () => {
    await type(header, '2303966');
    expect(header.shadowRoot!.textContent).not.toContain('Nothing matches');
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
    expect(header.shadowRoot!.textContent).not.toContain('Nothing matches');
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
    expect(text).not.toContain('Nothing matches');
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
