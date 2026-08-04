// Taxonomic tree of the current filter's result set (beeatlas-0of.1).
//
// PURE MODULE: no DOM, no database, no Lit. It turns two flat query results into
// a nested tree, so the shape logic is unit-testable without a browser or a 34 MB
// SQLite file. The query lives in filter.ts (it needs the connection and the
// schema probes); the rendering lives in bee-taxa-tree.ts.
//
// The tree is built from taxa.lineage_path, a materialized path of taxon_ids
// ending with the taxon itself: Bombus fervidus is
//   /630955/47221/199939/538883/52775/538902/1266534/52774/
// Ancestors are therefore derivable without a recursive query — read the path,
// keep the ids whose rank we display, nest in path order.

/** A row of the per-taxon aggregate over the filtered occurrence set. */
export interface TaxonAgg {
  taxon_id: number;
  rank: string;
  name: string;
  lineage_path: string | null;
  /** Occurrences backed by a catalogued or photographed specimen. */
  specimen_count: number;
  /** Occurrences from community observation (iNat expert feed, sample obs). */
  community_count: number;
  /** Occurrences asserted only by a published county checklist. */
  checklist_count: number;
}

/** What kind of evidence backs a taxon IN THE CURRENT GEOGRAPHY. */
export type Evidence = 'specimen' | 'community' | 'checklist-only';

export interface TaxonNode {
  taxonId: number;
  rank: string;
  name: string;
  specimenCount: number;
  communityCount: number;
  checklistCount: number;
  /** Evidence for this node INCLUDING its descendants — see rollUp(). */
  evidence: Evidence;
  children: TaxonNode[];
}

// Ranks the tree renders. Anything else in a lineage_path (order, suborder,
// phylum, superfamily, subtribe, complex, subspecies) is passed over: the
// /species/ tree renders family→…→species and this pane mirrors it, so the two
// surfaces read the same way. Intermediate ranks are PRESENT but collapsed by
// default via species-tree.ts's rank-skipped mechanism — they are not dropped
// here, or "Show all ranks" would have nothing to reveal.
export const DISPLAY_RANKS = ['family', 'subfamily', 'tribe', 'genus', 'subgenus', 'species'] as const;
const DISPLAY_RANK_SET = new Set<string>(DISPLAY_RANKS);

/** Rank order for sorting siblings that somehow differ in rank. */
const RANK_INDEX = new Map(DISPLAY_RANKS.map((r, i) => [r as string, i]));

/**
 * Evidence for a single taxon's own counts.
 *
 * Deliberately ordered strongest-first: a taxon with even one specimen reads as
 * specimen-backed. 'checklist-only' is the claim that matters — it means the
 * atlas has no specimen and no observation here, only a published county-level
 * assertion, and it is exactly the population an elevation bound removes.
 */
export function evidenceOf(specimen: number, community: number, checklist: number): Evidence {
  if (specimen > 0) return 'specimen';
  if (community > 0) return 'community';
  void checklist;
  return 'checklist-only';
}

/** Ids along a lineage path, root-first, restricted to ranks we display. */
function pathIds(lineagePath: string | null): number[] {
  if (!lineagePath) return [];
  return lineagePath
    .split('/')
    .filter((s) => s.length > 0)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));
}

/**
 * Build the nested tree.
 *
 * @param aggs   one row per taxon that actually has occurrences in the filtered set
 * @param taxaById  rank+name for EVERY id referenced by any lineage_path — the
 *                  ancestors, which have no occurrences of their own and so do
 *                  not appear in `aggs`
 *
 * Counts on an ancestor are the SUM of its descendants: a family's "12 specimens"
 * must mean twelve specimens of bees in that family, not twelve records whose
 * determination stopped at family. A taxon determined only to genus contributes
 * its own counts at the genus node, which is why aggs rows are added at their own
 * depth rather than only at the leaves.
 */
export function buildTaxaTree(
  aggs: TaxonAgg[],
  taxaById: Map<number, { rank: string; name: string }>,
): TaxonNode[] {
  const nodes = new Map<number, TaxonNode>();
  const childIds = new Map<number, Set<number>>();
  const roots = new Set<number>();

  const ensure = (id: number): TaxonNode | null => {
    const existing = nodes.get(id);
    if (existing) return existing;
    const meta = taxaById.get(id);
    // An id we have no metadata for cannot be placed or labelled. Skipping it
    // keeps its DESCENDANTS attached to the nearest known ancestor rather than
    // dropping a whole subtree because one intermediate row was missing.
    if (!meta || !DISPLAY_RANK_SET.has(meta.rank)) return null;
    const node: TaxonNode = {
      taxonId: id,
      rank: meta.rank,
      name: meta.name,
      specimenCount: 0,
      communityCount: 0,
      checklistCount: 0,
      evidence: 'checklist-only',
      children: [],
    };
    nodes.set(id, node);
    return node;
  };

  for (const agg of aggs) {
    // The path already ends with the taxon itself; fall back to the bare id for a
    // taxon with no lineage_path so it still appears rather than vanishing.
    const ids = pathIds(agg.lineage_path);
    const chain = (ids.length > 0 ? ids : [agg.taxon_id])
      .map(ensure)
      .filter((n): n is TaxonNode => n !== null);
    if (chain.length === 0) continue;

    for (let i = 0; i < chain.length; i++) {
      const node = chain[i]!;
      // Every node on the chain accumulates the counts, so ancestors total their
      // descendants (see docstring).
      node.specimenCount += agg.specimen_count;
      node.communityCount += agg.community_count;
      node.checklistCount += agg.checklist_count;

      const parent = chain[i - 1];
      if (parent) {
        let kids = childIds.get(parent.taxonId);
        if (!kids) { kids = new Set(); childIds.set(parent.taxonId, kids); }
        kids.add(node.taxonId);
      } else {
        roots.add(node.taxonId);
      }
    }
  }

  for (const [parentId, kids] of childIds) {
    const parent = nodes.get(parentId);
    if (!parent) continue;
    parent.children = [...kids].map((id) => nodes.get(id)!).filter(Boolean);
  }

  for (const node of nodes.values()) {
    node.evidence = evidenceOf(node.specimenCount, node.communityCount, node.checklistCount);
    sortChildren(node);
  }

  const rootNodes = [...roots].map((id) => nodes.get(id)!).filter(Boolean);
  return sortNodes(rootNodes);
}

function sortNodes(list: TaxonNode[]): TaxonNode[] {
  return list.sort((a, b) => {
    const ra = RANK_INDEX.get(a.rank) ?? 99;
    const rb = RANK_INDEX.get(b.rank) ?? 99;
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });
}

function sortChildren(node: TaxonNode): void {
  sortNodes(node.children);
}

/** Total taxa in the tree, counted at a given rank (default: species). */
export function countAtRank(nodes: TaxonNode[], rank: string = 'species'): number {
  let n = 0;
  const walk = (list: TaxonNode[]) => {
    for (const node of list) {
      if (node.rank === rank) n++;
      walk(node.children);
    }
  };
  walk(nodes);
  return n;
}
