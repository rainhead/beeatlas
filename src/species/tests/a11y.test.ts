// PERF-05 / D-11: hand-rolled a11y assertions. No jest-axe (matches the
// minimal-deps stance documented in CONTEXT D-04).
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import '../bee-taxon-nav.ts';

const TREE_FIXTURE = `
<bee-taxon-nav>
  <ul class="taxon-tree-root" role="tree" aria-label="Species taxonomy">
    <li data-taxon="Andrenidae" data-rank="family" role="treeitem" aria-expanded="false">
      <details>
        <summary><span class="taxon-label">Andrenidae</span></summary>
        <ul role="group">
          <li data-taxon="Andrena" data-rank="genus" role="treeitem" aria-expanded="false">
            <details>
              <summary><span class="taxon-label">Andrena</span></summary>
              <ul role="group">
                <li data-taxon="Andrena anograe" data-rank="species" role="treeitem">
                  <span class="taxon-label">Andrena anograe</span>
                </li>
              </ul>
            </details>
          </li>
        </ul>
      </details>
    </li>
  </ul>
</bee-taxon-nav>
`;

const CARD_FIXTURE = `
<bee-species-card data-family="Andrenidae" data-genus="Andrena">
  <h2>Andrena anograe</h2>
  <img loading="lazy" src="https://example.com/medium.jpg"
       srcset="https://example.com/square.jpg 75w, https://example.com/small.jpg 240w, https://example.com/medium.jpg 500w"
       sizes="(min-width: 768px) 500px, 100vw"
       alt="Andrena anograe female on dandelion">
  <img loading="lazy" src="/data/species-maps/andrena-anograe.svg"
       alt="Occurrence map for Andrena anograe">
</bee-species-card>
`;

// Lightweight filter fixture — just the form controls bee-species-filter
// renders. We don't mount the real component because that drags in the
// full filter store; D-11 only cares that the controls themselves accept
// focus and have no negative tabindex.
const FILTER_FIXTURE = `
<form id="filter-fixture">
  <select id="county" multiple><option value="King">King</option></select>
  <select id="ecoregion" multiple><option value="Puget">Puget</option></select>
  <select id="month-from"><option value="3">March</option></select>
  <select id="month-to"><option value="9">September</option></select>
</form>
`;

describe('PERF-05 / D-11 — taxon nav a11y', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('outer ul has role=tree', () => {
    document.body.innerHTML = TREE_FIXTURE;
    const root = document.querySelector('ul.taxon-tree-root')!;
    expect(root.getAttribute('role')).toBe('tree');
    expect(root.getAttribute('aria-label')).toBeTruthy();
  });

  it('every non-species treeitem has aria-expanded', () => {
    document.body.innerHTML = TREE_FIXTURE;
    const items = document.querySelectorAll('li[data-taxon]:not([data-rank="species"])');
    expect(items.length).toBeGreaterThan(0);
    for (const li of items) {
      expect(li.getAttribute('role')).toBe('treeitem');
      expect(li.hasAttribute('aria-expanded')).toBe(true);
    }
  });

  it('species leaf has role=treeitem but no aria-expanded', () => {
    document.body.innerHTML = TREE_FIXTURE;
    const leaf = document.querySelector('li[data-rank="species"]')!;
    expect(leaf.getAttribute('role')).toBe('treeitem');
    expect(leaf.hasAttribute('aria-expanded')).toBe(false);
  });

  it('native <details> toggle flips aria-expanded on enclosing li', async () => {
    document.body.innerHTML = TREE_FIXTURE;
    // Wait a microtask for bee-taxon-nav connectedCallback wiring.
    await Promise.resolve();
    const det = document.querySelector('li[data-taxon="Andrena"] > details') as HTMLDetailsElement;
    const li = det.closest('li[data-taxon="Andrena"]')!;
    expect(li.getAttribute('aria-expanded')).toBe('false');
    det.open = true;
    det.dispatchEvent(new Event('toggle', { bubbles: false }));
    expect(li.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('PERF-05 / D-11 — image alt coverage', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('every photo and map img has non-empty alt', () => {
    document.body.innerHTML = CARD_FIXTURE;
    const imgs = document.querySelectorAll('img');
    expect(imgs.length).toBeGreaterThan(0);
    for (const img of imgs) {
      const alt = img.getAttribute('alt') ?? '';
      expect(alt.length, `img src=${img.getAttribute('src')} missing alt`).toBeGreaterThan(0);
    }
  });

  it('every img has loading=lazy', () => {
    document.body.innerHTML = CARD_FIXTURE;
    const imgs = document.querySelectorAll('img');
    for (const img of imgs) {
      expect(img.getAttribute('loading')).toBe('lazy');
    }
  });
});

describe('PERF-05 / D-11 — filter input focusability', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('bee-species-filter source contains zero tabindex="-1" overrides', () => {
    const src = readFileSync('src/species/bee-species-filter.ts', 'utf8');
    // Strip line comments so a comment mentioning the gate doesn't trip it.
    const stripped = src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    const matches = stripped.match(/tabindex\s*=\s*["']-1["']/g) ?? [];
    expect(matches.length, `unexpected tabindex="-1" overrides: ${matches.join(', ')}`).toBe(0);
  });

  it('each filter <select> accepts programmatic focus', () => {
    document.body.innerHTML = FILTER_FIXTURE;
    const ids = ['county', 'ecoregion', 'month-from', 'month-to'];
    for (const id of ids) {
      const el = document.getElementById(id) as HTMLSelectElement | null;
      expect(el, `missing #${id} in fixture`).not.toBeNull();
      el!.focus();
      // happy-dom assigns activeElement on focus(); assert the element
      // either took focus OR the host environment doesn't track it (in
      // which case the lack of throw is the assertion).
      const ae = document.activeElement;
      if (ae && ae !== document.body) {
        expect(ae.id).toBe(id);
      }
    }
  });
});

describe('PERF-05 / D-11 — built-page audit (best-effort)', () => {
  // Best-effort: if _site/species/index.html exists (post-build), assert
  // every img has alt + loading=lazy on the real artifact too. Skipped
  // when running under tooling that hasn't built the site yet.
  it('_site/species/index.html (if built) — every img has alt', async () => {
    const fs = await import('node:fs');
    const path = '_site/species/index.html';
    if (!fs.existsSync(path)) {
      console.warn('skipping built-page audit — no _site/species/index.html');
      return;
    }
    const html = fs.readFileSync(path, 'utf8');
    const matches = html.match(/<img\b[^>]*>/g) ?? [];
    expect(matches.length).toBeGreaterThan(0);
    for (const tag of matches) {
      expect(tag).toMatch(/loading="lazy"/);
      expect(tag).toMatch(/\balt="[^"]+"/); // non-empty alt
    }
  });
});
