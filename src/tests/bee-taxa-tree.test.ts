import { test, expect, describe, beforeEach } from 'vitest';
import { buildTaxaTree } from '../taxa-tree.ts';
import type { TaxonAgg, TaxonNode } from '../taxa-tree.ts';

// bee-taxa-tree is a pure presenter with no DB or map dependencies, so it mounts
// without the mock scaffolding bee-atlas needs.

const TAXA = new Map<number, { rank: string; name: string }>([
  [47221, { rank: 'family', name: 'Apidae' }],
  [199939, { rank: 'subfamily', name: 'Apinae' }],
  [538883, { rank: 'tribe', name: 'Bombini' }],
  [52775, { rank: 'genus', name: 'Bombus' }],
  [538902, { rank: 'subgenus', name: 'Pyrobombus' }],
  [52774, { rank: 'species', name: 'Bombus fervidus' }],
  [57689, { rank: 'species', name: 'Bombus vosnesenskii' }],
]);
const P = '/47221/199939/538883/52775/538902/';

function agg(id: number, counts: Partial<Pick<TaxonAgg, 'specimen_count' | 'community_count' | 'checklist_count'>>): TaxonAgg {
  const meta = TAXA.get(id)!;
  return {
    taxon_id: id, rank: meta.rank, name: meta.name, lineage_path: `${P}${id}/`,
    specimen_count: 0, community_count: 0, checklist_count: 0, ...counts,
  };
}

function sampleTree(): TaxonNode[] {
  return buildTaxaTree(
    [agg(52774, { specimen_count: 3, community_count: 1 }), agg(57689, { checklist_count: 2 })],
    TAXA,
  );
}

async function mount(props: Partial<{
  tree: TaxonNode[]; loading: boolean; speciesCount: number;
  excludedForNoElevation: number; filterActive: boolean;
}>) {
  const { BeeTaxaTree } = await import('../bee-taxa-tree.ts');
  const el = new BeeTaxaTree() as InstanceType<typeof BeeTaxaTree> & HTMLElement;
  Object.assign(el, props);
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); });

describe('bee-taxa-tree — markup contract', () => {
  test('emits the same data-rank/data-name attributes as _pages/species.njk', async () => {
    // Load-bearing: species-tree.ts's applyRankToggle selects intermediate ranks by
    // these exact attributes. Diverge and the rank toggle silently stops working.
    const el = await mount({ tree: sampleTree(), speciesCount: 2 });
    const sr = el.shadowRoot!;
    expect(sr.querySelector('details[data-rank="family"]')?.getAttribute('data-name')).toBe('apidae');
    expect(sr.querySelector('details[data-rank="genus"]')).toBeTruthy();
    expect(sr.querySelector('details[data-rank="subgenus"]')).toBeTruthy();
    expect(sr.querySelectorAll('li[data-rank="species"]')).toHaveLength(2);
  });

  test('species are <li> inside ul.species-list, matching the static tree', async () => {
    const el = await mount({ tree: sampleTree(), speciesCount: 2 });
    const list = el.shadowRoot!.querySelector('ul.species-list');
    expect(list).toBeTruthy();
    expect(list!.querySelectorAll('li[data-rank="species"]').length).toBe(2);
  });

  test('CR-01: rank-skipping never sets the hidden attribute', async () => {
    // hidden is display:none, which would bury the genera and species nested inside
    // a skipped wrapper — the whole subtree would vanish instead of being promoted.
    const el = await mount({ tree: sampleTree(), speciesCount: 2 });
    const sr = el.shadowRoot!;
    const skipped = sr.querySelectorAll('.rank-skipped');
    expect(skipped.length).toBeGreaterThan(0);
    for (const node of skipped) expect((node as HTMLElement).hidden).toBe(false);
    // …and the species beneath them are still in the tree.
    expect(sr.querySelectorAll('li[data-rank="species"]')).toHaveLength(2);
  });

  test('intermediate ranks are skipped by default and revealed by the toggle', async () => {
    const el = await mount({ tree: sampleTree(), speciesCount: 2 });
    const sr = el.shadowRoot!;
    const subgenus = sr.querySelector('[data-rank="subgenus"]')!;
    expect(subgenus.classList.contains('rank-skipped')).toBe(true);

    const cb = sr.querySelector<HTMLInputElement>('.controls input[type=checkbox]')!;
    cb.checked = true;
    cb.dispatchEvent(new Event('change'));
    await el.updateComplete;
    expect(sr.querySelector('[data-rank="subgenus"]')!.classList.contains('rank-skipped')).toBe(false);
    // Persisted under the SAME key the /species/ page uses, so the preference
    // follows the reader between the two surfaces.
    expect(localStorage.getItem('beeatlas.speciesTree.showAllRanks')).toBe('1');
  });
});

describe('bee-taxa-tree — evidence badges (D-01)', () => {
  test('badges each taxon by its strongest evidence in this filter', async () => {
    const el = await mount({ tree: sampleTree(), speciesCount: 2 });
    const rows = [...el.shadowRoot!.querySelectorAll('li[data-rank="species"]')].map((li) => ({
      name: li.querySelector('.node-name')!.textContent!.trim(),
      badge: li.querySelector('.node-badge')!.textContent!.trim(),
    }));
    expect(rows).toEqual([
      { name: 'Bombus fervidus', badge: 'Specimen' },
      { name: 'Bombus vosnesenskii', badge: 'Checklist' },
    ]);
  });

  test('a checklist-only badge carries an explanatory title, not a bare word', async () => {
    const el = await mount({ tree: sampleTree(), speciesCount: 2 });
    const badge = [...el.shadowRoot!.querySelectorAll('.node-badge')]
      .find((b) => b.textContent!.trim() === 'Checklist')!;
    expect(badge.getAttribute('title')).toMatch(/published county checklist/i);
  });
});

describe('bee-taxa-tree — elevation disclosure (D-02 survivor)', () => {
  test('absent when no elevation bound removed anything', async () => {
    const el = await mount({ tree: sampleTree(), speciesCount: 2, excludedForNoElevation: 0 });
    expect(el.shadowRoot!.querySelector('.disclosure')).toBeNull();
  });

  test('names the provenance, not a generic missing-data caveat', async () => {
    const el = await mount({ tree: sampleTree(), speciesCount: 2, excludedForNoElevation: 3 });
    const text = el.shadowRoot!.querySelector('.disclosure')!.textContent!.replace(/\s+/g, ' ');
    expect(text).toMatch(/3 taxa/);
    expect(text).toMatch(/county-level checklist/i);
  });

  test('reads grammatically for a single excluded taxon', async () => {
    const el = await mount({ tree: sampleTree(), speciesCount: 2, excludedForNoElevation: 1 });
    const text = el.shadowRoot!.querySelector('.disclosure')!.textContent!.replace(/\s+/g, ' ');
    expect(text).toMatch(/1 taxon is not shown/);
  });

  test('species and taxon counts use their irregular plurals', async () => {
    const el = await mount({ tree: sampleTree(), speciesCount: 17, excludedForNoElevation: 3 });
    const sr = el.shadowRoot!;
    expect(sr.querySelector('.summary-line')!.textContent).toContain('17 species');
    expect(sr.querySelector('.summary-line')!.textContent).not.toContain('speciess');
    expect(sr.querySelector('.disclosure')!.textContent).not.toContain('taxons');
  });
});

describe('bee-taxa-tree — interaction', () => {
  test('clicking a taxon emits taxon-selected so the filter can refine', async () => {
    const el = await mount({ tree: sampleTree(), speciesCount: 2 });
    const events: unknown[] = [];
    el.addEventListener('taxon-selected', (e) => events.push((e as CustomEvent).detail));
    el.shadowRoot!.querySelector<HTMLButtonElement>('li[data-rank="species"] .node-name')!.click();
    expect(events).toEqual([{ taxonId: 52774, name: 'Bombus fervidus', rank: 'species' }]);
  });

  test('the event escapes the shadow root (composed + bubbles) to reach bee-atlas', async () => {
    const el = await mount({ tree: sampleTree(), speciesCount: 2 });
    const seen: unknown[] = [];
    document.addEventListener('taxon-selected', (e) => seen.push((e as CustomEvent).detail));
    el.shadowRoot!.querySelector<HTMLButtonElement>('details[data-rank="genus"] > summary .node-name')!.click();
    expect(seen).toHaveLength(1);
    expect((seen[0] as { rank: string }).rank).toBe('genus');
  });

  test('empty result set says so rather than rendering a blank pane', async () => {
    const el = await mount({ tree: [], filterActive: true });
    expect(el.shadowRoot!.textContent).toMatch(/No taxa match the current filter/i);
  });

  test('loading state is distinct from empty', async () => {
    const el = await mount({ tree: [], loading: true });
    expect(el.shadowRoot!.textContent).toMatch(/Loading/);
  });
});
