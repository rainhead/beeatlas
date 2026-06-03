// Phase 133 — /species browse tree contract.
//
// Two kinds of test:
//   1. Source assertions (readFileSync) for the template markup (_pages/species.njk)
//      and the thin Vite entry (src/entries/species-index.ts) — structural guards
//      that run in the fast unit suite.
//   2. REAL happy-dom behavioral tests for the tree logic (src/species-tree.ts):
//      the rank toggle, the filter, ancestor auto-expand, and the reset path are
//      executed against a constructed DOM. These replace the earlier source-grep
//      "behavior" assertions, which passed even while the rendered feature was
//      broken (the default view showed empty families; gap closure 133).

import { describe, test, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  STORAGE_KEY,
  loadToggleState,
  saveToggleState,
  applyRankToggle,
  runFilter,
  initSpeciesTree,
} from '../species-tree.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('_pages/species.njk (Phase 133 — tree index, TREE-01/02/04)', () => {
  test('declares layout: default.njk and permalink: /species/index.html', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    expect(src).toMatch(/^---[\s\S]*layout:\s*default\.njk[\s\S]*---/);
    expect(src).toMatch(/permalink:\s*\/species\/index\.html/);
  });

  test('references species-index entry (not old species.ts)', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    expect(src).toMatch(/<script\s+type="module"\s+src="\/src\/entries\/species-index\.ts"/);
    expect(src).not.toContain('species.ts"');
  });

  test('contains taxon-page species-index wrapper class (unchanged dual class)', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    expect(src).toContain('class="taxon-page species-index"');
  });

  test('control bar: contains species-index-controls, species-filter, show-all-ranks', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    expect(src).toContain('class="species-index-controls"');
    expect(src).toMatch(/id="species-filter"/);
    expect(src).toMatch(/type="search"/);
    expect(src).toMatch(/aria-label="Filter taxa"/);
    expect(src).toMatch(/placeholder="Filter taxa…"/);
    expect(src).toMatch(/id="show-all-ranks"/);
  });

  test('filter-empty paragraph carries hidden and No taxa match with filter-query span and role=status', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    expect(src).toMatch(/id="filter-empty"[^>]*hidden/);
    expect(src).toContain('No taxa match');
    expect(src).toMatch(/id="filter-query"/);
    expect(src).toMatch(/role="status"/);
  });

  test('tree node markup: contains details class="tree-node, summary, node-name, node-counts, node-map, data-rank=', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    expect(src).toContain('details class="tree-node');
    expect(src).toContain('<summary>');
    expect(src).toContain('node-name');
    expect(src).toContain('node-counts');
    expect(src).toContain('node-map');
    expect(src).toContain('data-rank=');
  });

  test('intermediate ranks ship visible (no hidden attribute) so no-JS shows all ranks — gap 133 / CR-01', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    // The subfamily/tribe/subgenus <details> must NOT carry the `hidden` attribute:
    // hiding the wrapper with display:none buries the nested genera/species. The
    // rank skip is applied at runtime via the `rank-skipped` class (display:contents).
    expect(src).not.toMatch(/data-rank="subfamily"[^>]*\shidden/);
    expect(src).not.toMatch(/data-rank="tribe"[^>]*\shidden/);
    expect(src).not.toMatch(/data-rank="subgenus"[^>]*\shidden/);
  });

  test('count separator: source contains middle dot U+00B7 in a node-counts span', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    expect(src).toContain('·');
    expect(src).toContain('node-counts');
  });

  test('map affordance: contains taxonRank= and aria-label="Map: and world map glyph', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    expect(src).toContain('taxonRank=');
    expect(src).toMatch(/aria-label="Map:/);
    expect(src).toContain('\u{1F5FA}');
  });

  test('family is plain text: family-rank summary uses span.node-name (no <a>) for name, not a link', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    expect(src).toContain('<span class="node-name">');
    expect(src).toContain('<a class="node-name"');
  });

  test('subgenus URL uses node.genusName and does NOT contain /species/undefined/', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    expect(src).toContain('node.genusName');
    expect(src).not.toContain('/species/undefined/');
  });

  test('does NOT contain stale flat markup: no groupby("family"), .family-section, or old aria-label', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    expect(src).not.toContain('groupby("family")');
    expect(src).not.toContain('.family-section');
    expect(src).not.toContain('aria-label="Filter genera and species"');
  });

  test('does not contain <bee-species-page> or <bee-species-card> (URL-05)', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    expect(src).not.toContain('bee-species-page');
    expect(src).not.toContain('bee-species-card');
  });
});

describe('src/entries/species-index.ts (Phase 133 — thin Vite entry)', () => {
  test('imports index.css and taxon-pages.css side-effects (unchanged)', () => {
    const src = readFileSync(resolve(ROOT, 'src/entries/species-index.ts'), 'utf-8');
    expect(src).toContain("'../index.css'");
    expect(src).toContain("'../styles/taxon-pages.css'");
  });

  test('delegates behavior to species-tree and initializes on load', () => {
    const src = readFileSync(resolve(ROOT, 'src/entries/species-index.ts'), 'utf-8');
    expect(src).toContain("from '../species-tree.ts'");
    expect(src).toContain('initSpeciesTree()');
  });
});

describe('src/styles/taxon-pages.css (browse-tree affordances — structural guards)', () => {
  // CSS rendering can't run under happy-dom (no layout); these guard the two
  // gap-closure fixes from silent regression. Visual correctness is human-verified.
  const css = readFileSync(resolve(ROOT, 'src/styles/taxon-pages.css'), 'utf-8');

  test('restores a disclosure triangle on tree summaries (flex layout drops the native marker)', () => {
    // A visible expand affordance is required — the node name is a link, so it
    // cannot also serve as the expander.
    expect(css).toMatch(/\.tree-node > summary::before\s*{[^}]*content:\s*'▸'/);
    expect(css).toMatch(/details\.tree-node\[open\] > summary::before\s*{[^}]*content:\s*'▾'/);
  });

  test('rank-toggle label reserves its border space so checking it does not reflow', () => {
    // Base rule carries a transparent border + padding; the checked rule only
    // changes the border color (no size change → no layout shift).
    expect(css).toMatch(/\.rank-toggle-label\s*{[^}]*border:\s*1px solid transparent/);
    expect(css).toMatch(/rank-toggle-label:has\(#show-all-ranks:checked\)\s*{[^}]*border-color:/);
  });
});

describe('src/species-tree.ts (security invariants — source guards)', () => {
  const src = readFileSync(resolve(ROOT, 'src/species-tree.ts'), 'utf-8');

  test('localStorage value compared with strict === "1" (no eval / JSON.parse of value) — T-133-08', () => {
    expect(src).toContain("=== '1'");
    expect(src).not.toMatch(/eval\s*\(/);
    const jsonParseGetItem = src
      .split('\n')
      .filter((l) => l.includes('JSON.parse') && l.includes('getItem'));
    expect(jsonParseGetItem).toHaveLength(0);
  });

  test('empty-state query echoed via textContent, never innerHTML — T-133-07', () => {
    expect(src).toContain('.textContent');
    // Guard the actual sink (a `.innerHTML` property access), not the word in a
    // comment — matching the bare word is exactly the false positive that let the
    // original broken behavior pass review.
    expect(src).not.toMatch(/\.innerHTML\b/);
  });
});

// ---------------------------------------------------------------------------
// Real DOM behavior (happy-dom). A representative two-family fixture mirroring
// the template's nesting: family > subfamily > tribe > genus > (ul) species.
// ---------------------------------------------------------------------------

function buildTree(): HTMLElement {
  const root = document.createElement('article');
  root.className = 'taxon-page species-index';
  root.innerHTML = `
    <div class="species-index-controls">
      <input type="search" id="species-filter" aria-label="Filter taxa">
      <label class="rank-toggle-label">
        <input type="checkbox" id="show-all-ranks"> Show all ranks
      </label>
    </div>
    <p id="filter-empty" hidden role="status">No taxa match "<span id="filter-query"></span>".</p>

    <details class="tree-node tree-node--family" data-rank="family" data-name="andrenidae">
      <summary><span class="node-name">Andrenidae</span></summary>
      <details class="tree-node tree-node--subfamily" data-rank="subfamily" data-name="andreninae">
        <summary><a class="node-name">Andreninae</a></summary>
        <details class="tree-node tree-node--tribe" data-rank="tribe" data-name="andrenini">
          <summary><a class="node-name">Andrenini</a></summary>
          <details class="tree-node tree-node--genus" data-rank="genus" data-name="andrena">
            <summary><a class="node-name">Andrena</a></summary>
            <ul class="species-list">
              <li data-rank="species" data-name="andrena aculeata"><a class="node-name">Andrena aculeata</a></li>
            </ul>
          </details>
        </details>
      </details>
    </details>

    <details class="tree-node tree-node--family" data-rank="family" data-name="apidae">
      <summary><span class="node-name">Apidae</span></summary>
      <details class="tree-node tree-node--subfamily" data-rank="subfamily" data-name="apinae">
        <summary><a class="node-name">Apinae</a></summary>
        <details class="tree-node tree-node--genus" data-rank="genus" data-name="bombus">
          <summary><a class="node-name">Bombus</a></summary>
          <ul class="species-list">
            <li data-rank="species" data-name="bombus vosnesenskii"><a class="node-name">Bombus vosnesenskii</a></li>
          </ul>
        </details>
      </details>
    </details>
  `;
  return root;
}

const byName = (root: ParentNode, name: string) =>
  root.querySelector<HTMLElement>(`[data-name="${name}"]`)!;

describe('species-tree — rank toggle (D-03, CR-01)', () => {
  let root: HTMLElement;
  beforeEach(() => {
    root = buildTree();
  });

  test('default OFF skips intermediate ranks via class+open, NOT the hidden attribute', () => {
    applyRankToggle(root, false);
    for (const rank of ['subfamily', 'tribe', 'subgenus']) {
      for (const el of root.querySelectorAll<HTMLElement>(`[data-rank="${rank}"]`)) {
        expect(el.classList.contains('rank-skipped')).toBe(true);
        expect((el as HTMLDetailsElement).open).toBe(true);
        // Crucially NOT display:none — that buried the descendants (the CR-01 bug).
        expect(el.hidden).toBe(false);
      }
    }
  });

  test('default OFF leaves genera and species un-hidden (family → genus → species visible)', () => {
    applyRankToggle(root, false);
    expect(byName(root, 'andrena').hidden).toBe(false);
    expect(byName(root, 'andrena aculeata').hidden).toBe(false);
    expect(byName(root, 'bombus').hidden).toBe(false);
  });

  test('toggle ON removes the rank-skip so intermediate ranks render as nodes', () => {
    applyRankToggle(root, false);
    applyRankToggle(root, true);
    for (const el of root.querySelectorAll<HTMLElement>('[data-rank="subfamily"],[data-rank="tribe"]')) {
      expect(el.classList.contains('rank-skipped')).toBe(false);
    }
  });
});

describe('species-tree — filter + auto-expand (D-09 / TREE-03, CR-02)', () => {
  let root: HTMLElement;
  beforeEach(() => {
    root = buildTree();
    applyRankToggle(root, false);
  });

  test('matching a genus hides non-matches and reveals the match path', () => {
    const showEmpty = runFilter(root, 'bombus', false);
    expect(showEmpty).toBe(false);
    expect(byName(root, 'bombus').hidden).toBe(false);
    expect(byName(root, 'andrena').hidden).toBe(true);
    // Ancestor family of the match is revealed AND opened (CR-02: .hidden cleared, not just .open).
    const apidae = byName(root, 'apidae') as HTMLDetailsElement;
    expect(apidae.hidden).toBe(false);
    expect(apidae.open).toBe(true);
    // The skipped intermediate ancestor is opened so the match shows through it.
    expect((byName(root, 'apinae') as HTMLDetailsElement).open).toBe(true);
    // Non-matching family is hidden.
    expect(byName(root, 'andrenidae').hidden).toBe(true);
  });

  test('a deep species match opens AND un-hides every ancestor <details>', () => {
    runFilter(root, 'aculeata', false);
    expect(byName(root, 'andrena aculeata').hidden).toBe(false);
    for (const name of ['andrena', 'andrenini', 'andreninae', 'andrenidae']) {
      const el = byName(root, name) as HTMLDetailsElement;
      expect(el.open).toBe(true);
      expect(el.hidden).toBe(false);
    }
  });

  test('clearing the filter restores every rank (CR-03 — no stale hidden nodes)', () => {
    runFilter(root, 'bombus', false);
    expect(byName(root, 'andrena').hidden).toBe(true); // hidden by the filter
    const showEmpty = runFilter(root, '', false);
    expect(showEmpty).toBe(false);
    for (const el of root.querySelectorAll<HTMLElement>('[data-rank]')) {
      expect(el.hidden).toBe(false);
    }
    // Intermediate ranks are re-skipped after reset.
    expect(byName(root, 'andreninae').classList.contains('rank-skipped')).toBe(true);
  });
});

describe('species-tree — empty state + toggle-respecting filter (D-09 lean)', () => {
  let root: HTMLElement;
  beforeEach(() => {
    root = buildTree();
    applyRankToggle(root, false);
  });

  test('zero matches returns true (show empty state); a match returns false', () => {
    expect(runFilter(root, 'zzzzz', false)).toBe(true);
    expect(runFilter(root, 'bombus', false)).toBe(false);
    expect(runFilter(root, '', false)).toBe(false);
  });

  test('with toggle OFF an intermediate-only name does not match; with ON it does', () => {
    expect(runFilter(root, 'andreninae', false)).toBe(true); // subfamily skipped → not matched
    runFilter(root, '', false);
    applyRankToggle(root, true);
    expect(runFilter(root, 'andreninae', true)).toBe(false); // now a displayed rank → matches
  });
});

describe('species-tree — localStorage persistence (D-04, T-133-08/09)', () => {
  function fakeStorage(initial: Record<string, string> = {}): Storage {
    const map = new Map(Object.entries(initial));
    return {
      getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
      clear: () => map.clear(),
      key: (i: number) => [...map.keys()][i] ?? null,
      get length() {
        return map.size;
      },
    } as Storage;
  }

  test('load returns true only for stored "1"; any other value or absent is false', () => {
    expect(loadToggleState(fakeStorage({ [STORAGE_KEY]: '1' }))).toBe(true);
    expect(loadToggleState(fakeStorage({ [STORAGE_KEY]: '0' }))).toBe(false);
    expect(loadToggleState(fakeStorage({ [STORAGE_KEY]: 'true' }))).toBe(false);
    expect(loadToggleState(fakeStorage())).toBe(false);
  });

  test('save writes "1"/"0"; a throwing store degrades silently to default OFF', () => {
    const store = fakeStorage();
    saveToggleState(true, store);
    expect(store.getItem(STORAGE_KEY)).toBe('1');
    saveToggleState(false, store);
    expect(store.getItem(STORAGE_KEY)).toBe('0');

    const throwing = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    } as unknown as Storage;
    expect(loadToggleState(throwing)).toBe(false);
    expect(() => saveToggleState(true, throwing)).not.toThrow();
  });
});

describe('species-tree — initSpeciesTree wiring + XSS guard (T-133-07)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('typing into the filter echoes the query as TEXT only (no HTML injection)', () => {
    const root = buildTree();
    document.body.appendChild(root);
    try {
      initSpeciesTree(root);
      const input = root.querySelector<HTMLInputElement>('#species-filter')!;
      const payload = '<img src=x onerror=alert(1)>';
      input.value = payload;
      input.dispatchEvent(new Event('input'));

      const querySpan = root.querySelector<HTMLElement>('#filter-query')!;
      const emptyMsg = root.querySelector<HTMLElement>('#filter-empty')!;
      // Empty state shown (no taxon matches the payload).
      expect(emptyMsg.hidden).toBe(false);
      // Echoed as text, not parsed into elements.
      expect(querySpan.textContent).toBe(payload);
      expect(querySpan.childElementCount).toBe(0);
      expect(querySpan.querySelector('img')).toBeNull();
    } finally {
      root.remove();
    }
  });

  test('initial load applies persisted ON state to the checkbox and reveals ranks', () => {
    localStorage.setItem(STORAGE_KEY, '1');
    const root = buildTree();
    initSpeciesTree(root);
    const toggle = root.querySelector<HTMLInputElement>('#show-all-ranks')!;
    expect(toggle.checked).toBe(true);
    expect(byName(root, 'andreninae').classList.contains('rank-skipped')).toBe(false);
  });
});
