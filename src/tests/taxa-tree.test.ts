import { test, expect, describe } from 'vitest';
import { buildTaxaTree, evidenceOf, countAtRank, DISPLAY_RANKS } from '../taxa-tree.ts';
import type { TaxonAgg } from '../taxa-tree.ts';

// Real ids and paths from public/data/occurrences.db, trimmed to the display ranks:
//   47221 Apidae (family) / 199939 Apinae (subfamily) / 538883 Bombini (tribe)
//   52775 Bombus (genus) / 538902 Thoracobombus (subgenus) / 52774 B. fervidus (species)
const TAXA = new Map<number, { rank: string; name: string }>([
  [630955, { rank: 'order', name: 'Hymenoptera' }],
  [47221, { rank: 'family', name: 'Apidae' }],
  [199939, { rank: 'subfamily', name: 'Apinae' }],
  [538883, { rank: 'tribe', name: 'Bombini' }],
  [52775, { rank: 'genus', name: 'Bombus' }],
  [538902, { rank: 'subgenus', name: 'Thoracobombus' }],
  [52774, { rank: 'species', name: 'Bombus fervidus' }],
  [57689, { rank: 'species', name: 'Bombus vosnesenskii' }],
  [4444, { rank: 'family', name: 'Megachilidae' }],
  [5555, { rank: 'genus', name: 'Megachile' }],
  [6666, { rank: 'species', name: 'Megachile pugnata' }],
]);

const BOMBUS_PATH = '/630955/47221/199939/538883/52775/';
const FERVIDUS_PATH = '/630955/47221/199939/538883/52775/538902/52774/';
const VOSNESENSKII_PATH = '/630955/47221/199939/538883/52775/538902/57689/';
const PUGNATA_PATH = '/630955/4444/5555/6666/';

function agg(over: Partial<TaxonAgg> & Pick<TaxonAgg, 'taxon_id'>): TaxonAgg {
  const meta = TAXA.get(over.taxon_id)!;
  return {
    rank: meta.rank,
    name: meta.name,
    lineage_path: null,
    specimen_count: 0,
    community_count: 0,
    checklist_count: 0,
    ...over,
  };
}

describe('evidenceOf', () => {
  test('any specimen wins', () => {
    expect(evidenceOf(1, 99, 99)).toBe('specimen');
  });
  test('no specimen but community observation', () => {
    expect(evidenceOf(0, 1, 99)).toBe('community');
  });
  test('checklist assertion only', () => {
    expect(evidenceOf(0, 0, 1)).toBe('checklist-only');
  });
  test('a taxon with no evidence at all still reads checklist-only, never crashes', () => {
    expect(evidenceOf(0, 0, 0)).toBe('checklist-only');
  });
});

describe('buildTaxaTree — shape', () => {
  test('nests family > subfamily > tribe > genus > subgenus > species from lineage_path', () => {
    const tree = buildTaxaTree(
      [agg({ taxon_id: 52774, lineage_path: FERVIDUS_PATH, specimen_count: 3 })],
      TAXA,
    );
    expect(tree).toHaveLength(1);
    const family = tree[0]!;
    expect([family.rank, family.name]).toEqual(['family', 'Apidae']);

    const chain: string[] = [];
    let node = family;
    while (node) {
      chain.push(node.rank);
      node = node.children[0]!;
    }
    expect(chain).toEqual(['family', 'subfamily', 'tribe', 'genus', 'subgenus', 'species']);
  });

  test('drops ranks above family (order/phylum are not rendered)', () => {
    const tree = buildTaxaTree(
      [agg({ taxon_id: 52774, lineage_path: FERVIDUS_PATH, specimen_count: 1 })],
      TAXA,
    );
    expect(tree.map((n) => n.rank)).toEqual(['family']);
    expect(DISPLAY_RANKS).not.toContain('order');
  });

  test('siblings share one parent rather than duplicating the chain', () => {
    const tree = buildTaxaTree(
      [
        agg({ taxon_id: 52774, lineage_path: FERVIDUS_PATH, specimen_count: 1 }),
        agg({ taxon_id: 57689, lineage_path: VOSNESENSKII_PATH, specimen_count: 1 }),
      ],
      TAXA,
    );
    expect(tree).toHaveLength(1);
    const subgenus = tree[0]!.children[0]!.children[0]!.children[0]!.children[0]!;
    expect(subgenus.rank).toBe('subgenus');
    expect(subgenus.children.map((c) => c.name)).toEqual(['Bombus fervidus', 'Bombus vosnesenskii']);
  });

  test('separate families are separate roots, sorted by name', () => {
    const tree = buildTaxaTree(
      [
        agg({ taxon_id: 6666, lineage_path: PUGNATA_PATH, checklist_count: 1 }),
        agg({ taxon_id: 52774, lineage_path: FERVIDUS_PATH, specimen_count: 1 }),
      ],
      TAXA,
    );
    expect(tree.map((n) => n.name)).toEqual(['Apidae', 'Megachilidae']);
  });
});

describe('buildTaxaTree — counts roll up', () => {
  test('an ancestor totals its descendants', () => {
    const tree = buildTaxaTree(
      [
        agg({ taxon_id: 52774, lineage_path: FERVIDUS_PATH, specimen_count: 3, community_count: 1 }),
        agg({ taxon_id: 57689, lineage_path: VOSNESENSKII_PATH, specimen_count: 2, checklist_count: 5 }),
      ],
      TAXA,
    );
    const family = tree[0]!;
    expect(family.specimenCount).toBe(5);
    expect(family.communityCount).toBe(1);
    expect(family.checklistCount).toBe(5);
  });

  test('a genus-level determination contributes at the genus, not at a species', () => {
    // A record identified only to Bombus must still be counted — and must not
    // invent a species node.
    const tree = buildTaxaTree(
      [agg({ taxon_id: 52775, lineage_path: BOMBUS_PATH, specimen_count: 7 })],
      TAXA,
    );
    const genus = tree[0]!.children[0]!.children[0]!.children[0]!;
    expect(genus.rank).toBe('genus');
    expect(genus.specimenCount).toBe(7);
    expect(genus.children).toEqual([]);
    expect(countAtRank(tree, 'species')).toBe(0);
  });

  test('evidence on an ancestor reflects the strongest evidence beneath it', () => {
    // Genus has one checklist-only species and one specimen-backed species. The
    // genus is specimen-backed; the checklist-only species keeps its own badge.
    const tree = buildTaxaTree(
      [
        agg({ taxon_id: 52774, lineage_path: FERVIDUS_PATH, checklist_count: 4 }),
        agg({ taxon_id: 57689, lineage_path: VOSNESENSKII_PATH, specimen_count: 2 }),
      ],
      TAXA,
    );
    const genus = tree[0]!.children[0]!.children[0]!.children[0]!;
    const subgenus = genus.children[0]!;
    expect(genus.evidence).toBe('specimen');
    const [fervidus, vosnesenskii] = subgenus.children;
    expect(fervidus!.evidence).toBe('checklist-only');
    expect(vosnesenskii!.evidence).toBe('specimen');
  });
});

describe('buildTaxaTree — robustness', () => {
  test('a taxon with no lineage_path still appears', () => {
    const tree = buildTaxaTree([agg({ taxon_id: 52775, specimen_count: 1 })], TAXA);
    expect(tree.map((n) => n.name)).toEqual(['Bombus']);
  });

  test('an unknown ancestor id does not drop the subtree beneath it', () => {
    // 999999 has no row in taxaById — a real possibility if the taxa table lags
    // the occurrences table. The species must still render under Apidae.
    const tree = buildTaxaTree(
      [agg({ taxon_id: 52774, lineage_path: '/47221/999999/52775/538902/52774/', specimen_count: 1 })],
      TAXA,
    );
    expect(tree[0]!.name).toBe('Apidae');
    expect(countAtRank(tree, 'species')).toBe(1);
  });

  test('empty input yields an empty tree, not a throw', () => {
    expect(buildTaxaTree([], TAXA)).toEqual([]);
  });

  test('the same taxon appearing twice is merged, not duplicated', () => {
    const tree = buildTaxaTree(
      [
        agg({ taxon_id: 52774, lineage_path: FERVIDUS_PATH, specimen_count: 1 }),
        agg({ taxon_id: 52774, lineage_path: FERVIDUS_PATH, community_count: 2 }),
      ],
      TAXA,
    );
    expect(countAtRank(tree, 'species')).toBe(1);
    expect(tree[0]!.specimenCount).toBe(1);
    expect(tree[0]!.communityCount).toBe(2);
  });
});

describe('countAtRank', () => {
  test('counts species across the whole tree', () => {
    const tree = buildTaxaTree(
      [
        agg({ taxon_id: 52774, lineage_path: FERVIDUS_PATH, specimen_count: 1 }),
        agg({ taxon_id: 57689, lineage_path: VOSNESENSKII_PATH, specimen_count: 1 }),
        agg({ taxon_id: 6666, lineage_path: PUGNATA_PATH, specimen_count: 1 }),
      ],
      TAXA,
    );
    expect(countAtRank(tree, 'species')).toBe(3);
    expect(countAtRank(tree, 'genus')).toBe(2);
    expect(countAtRank(tree, 'family')).toBe(2);
  });
});
