// County / ecoregion presence filtering for the static /species/ tree (beeatlas-0of.2).
//
// PURE + DOM, no framework: /species/ is a build-time-rendered page whose only
// client JS is species-tree.ts, and this keeps it that way. No SQL engine, no
// occurrences.db (34 MB), no Lit — just a ~16 KB gzipped map fetched the first time
// someone actually picks a geography.
//
// The evidence bitmask is a WIRE FORMAT shared with data/taxon_presence_export.py.
// Change one and you must change both; the test asserts these exact numbers.
export const EV_SPECIMEN = 1;
export const EV_COMMUNITY = 2;
export const EV_CHECKLIST = 4;

export type Evidence = 'specimen' | 'community' | 'checklist-only';

/**
 * The node's OWN name element — `:scope >` so a <details> gets its summary's
 * label, never a descendant species' name. The badge is rendered by CSS
 * `content: attr(...)`, and attr() only reads attributes from the element the
 * pseudo-element belongs to, so the label must land HERE and not on the node.
 */
function nameEl(node: HTMLElement): HTMLElement | null {
  return node.querySelector<HTMLElement>(':scope > summary > .node-name')
    ?? node.querySelector<HTMLElement>(':scope > .node-name');
}

/** Badge text per evidence kind. Mirrors bee-taxa-tree.ts's EVIDENCE_LABEL. */
const EVIDENCE_LABEL: Record<Evidence, string> = {
  'specimen': 'Specimen',
  'community': 'Observed',
  'checklist-only': 'Checklist',
};

export interface PresencePayload {
  counties: Record<string, Record<string, number>>;
  ecoregions: Record<string, Record<string, number>>;
}

/**
 * Strongest evidence in the mask.
 *
 * Ordering is deliberately identical to evidenceOf() in src/taxa-tree.ts: the two
 * surfaces must not disagree about what "Megachile pugnata in King County" is
 * backed by. 'checklist-only' is the claim that carries weight — it means the
 * atlas has no specimen and no observation there, only a published county-range
 * assertion.
 */
export function evidenceFromMask(mask: number): Evidence {
  if (mask & EV_SPECIMEN) return 'specimen';
  if (mask & EV_COMMUNITY) return 'community';
  return 'checklist-only';
}

let _promise: Promise<PresencePayload | null> | null = null;

/**
 * Fetch the presence map once, lazily.
 *
 * Resolves null rather than throwing: a build that published no artifact, or a
 * browser that could not fetch it, must leave /species/ exactly as it is today
 * (a complete, unfiltered tree) rather than break the page. The caller disables
 * the pickers in that case.
 */
export async function loadPresence(
  resolveUrl: (key: string) => Promise<string | null>,
): Promise<PresencePayload | null> {
  if (_promise) return _promise;
  _promise = (async () => {
    try {
      const url = await resolveUrl('taxon_presence');
      if (!url) return null;
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const json = (await resp.json()) as unknown;
      if (json === null || typeof json !== 'object') return null;
      const p = json as PresencePayload;
      if (!p.counties || !p.ecoregions) return null;
      return p;
    } catch {
      return null;
    }
  })();
  return _promise;
}

/** Test-only: drop the cached fetch between cases. */
export function _resetPresence(): void { _promise = null; }

/**
 * Hide every tree node whose taxon is absent from `present`, and badge those that
 * remain with the evidence backing them THERE.
 *
 * DOES NOT TOUCH `hidden`. runFilter() is the single writer of visibility, and it
 * reads the `data-absent` marker this sets. Two passes both assigning `hidden`
 * cannot compose: whichever ran last won, and with an empty query runFilter's
 * reset (`node.hidden = false` on every node — CR-03) silently undid the whole
 * geography filter. Marking absence semantically and letting one pass compute
 * visibility from query AND absence is what makes them combine.
 *
 * A node with no data-taxon-id (an intermediate rank, or a species the artifact
 * has never heard of) survives only if a descendant does — computed bottom-up so
 * a genus whose species are all absent disappears with them.
 *
 * Returns the number of species left visible, for the empty-state message.
 */
export function applyPresence(
  root: ParentNode,
  present: Record<string, number> | null,
): number {
  const nodes = [...root.querySelectorAll<HTMLElement>('[data-rank]')];

  // No selection: clear absence + badges. Visibility is runFilter's to restore.
  if (present === null) {
    for (const node of nodes) {
      node.removeAttribute('data-absent');
      node.removeAttribute('data-presence');
      nameEl(node)?.removeAttribute('data-presence-label');
    }
    return nodes.filter((n) => n.dataset.rank === 'species').length;
  }

  // Bottom-up: children appear after their ancestors in document order, so walking
  // the list backwards means a parent is decided only once its subtree is.
  let visibleSpecies = 0;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i]!;
    const taxonId = node.dataset.taxonId;
    const mask = taxonId ? present[taxonId] : undefined;
    const selfPresent = mask !== undefined;
    const descendantVisible = node.querySelector('[data-rank]:not([data-absent])') !== null;

    if (selfPresent) {
      node.removeAttribute('data-absent');
      const evidence = evidenceFromMask(mask);
      node.dataset.presence = evidence;
      // The label rides on the NAME element as data: the badge is rendered by CSS
      // ::after, so the presence pass never inserts or removes elements that the
      // text filter is concurrently walking.
      const el = nameEl(node);
      if (el) el.dataset.presenceLabel = EVIDENCE_LABEL[evidence];
      if (node.dataset.rank === 'species') visibleSpecies++;
    } else if (descendantVisible) {
      // An ancestor of something present. Keep it, but say nothing about evidence:
      // a genus is not "specimen-backed here" merely because one species is.
      node.removeAttribute('data-absent');
      node.removeAttribute('data-presence');
      nameEl(node)?.removeAttribute('data-presence-label');
    } else {
      node.dataset.absent = '';
      node.removeAttribute('data-presence');
      nameEl(node)?.removeAttribute('data-presence-label');
    }
  }
  return visibleSpecies;
}
