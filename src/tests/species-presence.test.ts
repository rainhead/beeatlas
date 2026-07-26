import { test, expect, describe, beforeEach, vi } from 'vitest';
import {
  EV_CHECKLIST, EV_COMMUNITY, EV_SPECIMEN,
  applyPresence, evidenceFromMask, loadPresence, _resetPresence,
} from '../species-presence.ts';

// A miniature /species/ tree in the same markup species.njk emits: nested
// <details data-rank data-taxon-id> with species as <li> in a ul.species-list.
function tree(): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = `
    <details class="tree-node tree-node--family" data-rank="family" data-name="apidae" data-taxon-id="47221">
      <summary><span class="node-name">Apidae</span></summary>
      <details class="tree-node tree-node--genus" data-rank="genus" data-name="bombus" data-taxon-id="52775">
        <summary><span class="node-name">Bombus</span></summary>
        <ul class="species-list">
          <li data-rank="species" data-name="bombus fervidus" data-taxon-id="52774">
            <a class="node-name">Bombus fervidus</a></li>
          <li data-rank="species" data-name="bombus vosnesenskii" data-taxon-id="57689">
            <a class="node-name">Bombus vosnesenskii</a></li>
        </ul>
      </details>
      <details class="tree-node tree-node--genus" data-rank="genus" data-name="apis" data-taxon-id="47219">
        <summary><span class="node-name">Apis</span></summary>
        <ul class="species-list">
          <li data-rank="species" data-name="apis mellifera" data-taxon-id="47220">
            <a class="node-name">Apis mellifera</a></li>
        </ul>
      </details>
    </details>`;
  document.body.appendChild(root);
  return root;
}

// applyPresence marks absence; runFilter is what turns that into `hidden` (one
// writer of visibility — see species-presence.ts). Assert on the marker.
const vis = (root: ParentNode) =>
  [...root.querySelectorAll<HTMLElement>('[data-rank]')]
    .filter((n) => !n.hasAttribute('data-absent')).map((n) => n.dataset.name);

beforeEach(() => { document.body.innerHTML = ''; _resetPresence(); vi.restoreAllMocks(); });

describe('evidenceFromMask', () => {
  test('reports the strongest evidence present', () => {
    expect(evidenceFromMask(EV_SPECIMEN)).toBe('specimen');
    expect(evidenceFromMask(EV_SPECIMEN | EV_CHECKLIST)).toBe('specimen');
    expect(evidenceFromMask(EV_COMMUNITY)).toBe('community');
    expect(evidenceFromMask(EV_COMMUNITY | EV_CHECKLIST)).toBe('community');
    expect(evidenceFromMask(EV_CHECKLIST)).toBe('checklist-only');
  });

  test('the bit values are the wire format shared with the Python export', () => {
    // data/taxon_presence_export.py hardcodes these; a silent change on one side
    // would mislabel every badge rather than fail.
    expect([EV_SPECIMEN, EV_COMMUNITY, EV_CHECKLIST]).toEqual([1, 2, 4]);
  });

  test('ordering matches taxa-tree.ts so the two surfaces cannot disagree', async () => {
    const { evidenceOf } = await import('../taxa-tree.ts');
    expect(evidenceFromMask(EV_SPECIMEN | EV_COMMUNITY)).toBe(evidenceOf(1, 1, 0));
    expect(evidenceFromMask(EV_COMMUNITY | EV_CHECKLIST)).toBe(evidenceOf(0, 1, 1));
    expect(evidenceFromMask(EV_CHECKLIST)).toBe(evidenceOf(0, 0, 1));
  });
});

describe('applyPresence', () => {
  test('hides taxa absent from the selected geography', () => {
    const root = tree();
    applyPresence(root, { '52774': EV_SPECIMEN });
    expect(vis(root)).toEqual(['apidae', 'bombus', 'bombus fervidus']);
  });

  test('keeps ancestors of a present taxon, and drops empty branches', () => {
    // Apis has no present species, so the whole Apis branch goes; Apidae stays
    // because Bombus survives beneath it.
    const root = tree();
    applyPresence(root, { '52774': EV_SPECIMEN });
    const names = vis(root);
    expect(names).toContain('apidae');
    expect(names).not.toContain('apis');
    expect(names).not.toContain('apis mellifera');
  });

  test('badges each present taxon with its evidence THERE', () => {
    const root = tree();
    applyPresence(root, { '52774': EV_SPECIMEN, '57689': EV_CHECKLIST });
    const f = root.querySelector<HTMLElement>('[data-taxon-id="52774"]')!;
    const v = root.querySelector<HTMLElement>('[data-taxon-id="57689"]')!;
    expect(f.dataset.presence).toBe('specimen');
    expect(v.dataset.presence).toBe('checklist-only');
    // The BADGE TEXT lives on the node's own .node-name, because CSS attr() reads
    // only from the element its ::after decorates. Setting it on the node rendered
    // an empty pill — caught by running the page, not by the unit tests.
    const label = (n: HTMLElement) =>
      (n.querySelector<HTMLElement>(':scope > summary > .node-name')
        ?? n.querySelector<HTMLElement>(':scope > .node-name'))?.dataset.presenceLabel;
    expect(label(f)).toBe('Specimen');
    expect(label(v)).toBe('Checklist');
  });

  test('an ancestor is NOT badged from its descendants evidence', () => {
    // A genus is not "specimen-backed in King County" just because one species is;
    // only taxa the artifact names directly carry a badge.
    const root = tree();
    applyPresence(root, { '52774': EV_SPECIMEN });
    const genus = root.querySelector<HTMLElement>('[data-taxon-id="52775"]')!;
    expect(genus.hidden).toBe(false);
    expect(genus.dataset.presence).toBeUndefined();
  });

  test('a genus present in its own right IS badged', () => {
    const root = tree();
    applyPresence(root, { '52775': EV_COMMUNITY });
    const genus = root.querySelector<HTMLElement>('[data-taxon-id="52775"]')!;
    expect(genus.dataset.presence).toBe('community');
  });

  test('null selection restores the whole tree and clears badges', () => {
    const root = tree();
    applyPresence(root, { '52774': EV_SPECIMEN });
    const restored = applyPresence(root, null);
    expect(vis(root)).toHaveLength(6);  // family + 2 genera + 3 species
    expect(restored).toBe(3);
    expect(root.querySelectorAll('[data-presence]')).toHaveLength(0);
    expect(root.querySelectorAll('[data-absent]')).toHaveLength(0);
  });

  test('marks absence without removing nodes, and without writing hidden', () => {
    // Two passes both assigning `hidden` cannot compose — runFilter's empty-query
    // reset would undo this one. Absence is a marker; visibility is runFilter's.
    const root = tree();
    applyPresence(root, { '52774': EV_SPECIMEN });
    expect(root.querySelectorAll('[data-rank]')).toHaveLength(6);
    const apis = root.querySelector<HTMLElement>('[data-taxon-id="47219"]')!;
    expect(apis.hasAttribute('data-absent')).toBe(true);
    expect(apis.hidden).toBe(false);
  });

  test('an empty geography hides everything but keeps the tree intact', () => {
    const root = tree();
    const n = applyPresence(root, {});
    expect(n).toBe(0);
    expect(vis(root)).toEqual([]);
    expect(root.querySelectorAll('[data-rank]')).toHaveLength(6);
  });

  test('returns the visible species count for the summary line', () => {
    const root = tree();
    expect(applyPresence(root, { '52774': EV_SPECIMEN, '47220': EV_CHECKLIST })).toBe(2);
  });
});

describe('loadPresence', () => {
  test('returns null when the build published no artifact', async () => {
    expect(await loadPresence(async () => null)).toBeNull();
  });

  test('returns null on a failed fetch rather than throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false }) as Response));
    expect(await loadPresence(async () => '/data/taxon_presence.json')).toBeNull();
  });

  test('returns null on a malformed payload', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [1, 2] }) as unknown as Response));
    expect(await loadPresence(async () => '/data/x.json')).toBeNull();
  });

  test('fetches once and caches', async () => {
    const payload = { counties: { King: { '52774': 1 } }, ecoregions: {} };
    const f = vi.fn(async () => ({ ok: true, json: async () => payload }) as unknown as Response);
    vi.stubGlobal('fetch', f);
    const a = await loadPresence(async () => '/data/x.json');
    const b = await loadPresence(async () => '/data/x.json');
    expect(a).toEqual(payload);
    expect(b).toBe(a);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('composition with the text filter (the bug this shape prevents)', () => {
  test('an empty query does not resurrect taxa the geography excluded', async () => {
    // runFilter's CR-03 reset used to set hidden=false on EVERY node, so selecting
    // a county badged the tree but hid nothing. Visibility must be computed from
    // absence AND query, by one pass.
    const { runFilter } = await import('../species-tree.ts');
    const root = tree();
    applyPresence(root, { '52774': EV_SPECIMEN });
    runFilter(root, '', true);
    const shown = [...root.querySelectorAll<HTMLElement>('[data-rank]')].filter((n) => !n.hidden);
    expect(shown.map((n) => n.dataset.name)).toEqual(['apidae', 'bombus', 'bombus fervidus']);
  });

  test('a text match inside an excluded branch stays excluded', async () => {
    const { runFilter } = await import('../species-tree.ts');
    const root = tree();
    applyPresence(root, { '52774': EV_SPECIMEN });   // Apis excluded
    runFilter(root, 'apis', true);                    // …but typed for
    const shown = [...root.querySelectorAll<HTMLElement>('[data-rank]')].filter((n) => !n.hidden);
    expect(shown.map((n) => n.dataset.name)).not.toContain('apis');
    expect(shown.map((n) => n.dataset.name)).not.toContain('apis mellifera');
  });

  test('clearing the geography restores what the text filter allows', async () => {
    const { runFilter } = await import('../species-tree.ts');
    const root = tree();
    applyPresence(root, { '52774': EV_SPECIMEN });
    applyPresence(root, null);
    runFilter(root, '', true);
    expect([...root.querySelectorAll<HTMLElement>('[data-rank]')].filter((n) => !n.hidden)).toHaveLength(6);
  });
});
