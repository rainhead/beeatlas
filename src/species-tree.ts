// Client behavior for the /species browse tree (see _pages/species.njk):
//   - "Show all ranks" toggle, persisted in one localStorage key
//   - type-to-filter across the currently-displayed rank set, with ancestor
//     auto-expand (D-09 / TREE-03)
//
// Pure DOM module: no CSS or custom-element imports, so it is unit-testable under
// happy-dom. The Vite entry (entries/species-index.ts) wires the side-effect
// imports and calls initSpeciesTree() on load.
//
// The rank model itself lives in ./rank-toggle.ts — it is shared with the map
// app's taxa pane, and keeping it here made the SPA pull this whole module into a
// chunk the root page references (see that file's header, and IDX-02).
import {
  INTERMEDIATE_RANKS, applyRankToggle, loadToggleState, saveToggleState,
} from './rank-toggle.ts';

// Re-exported so existing importers and tests keep their current entry point.
export { STORAGE_KEY, applyRankToggle, loadToggleState, saveToggleState } from './rank-toggle.ts';


// Open AND un-hide every [data-rank] ancestor so a deep filter match is actually
// revealed. Setting .open alone leaves an ancestor that an earlier filter
// pass hid at display:none, so the match never shows.
export function openAncestors(el: HTMLElement): void {
  let parent = el.parentElement;
  while (parent) {
    if (parent.matches?.('[data-rank]')) {
      // Never reveal a branch the geography filter excluded (beeatlas-0of.2):
      // a text match inside an absent subtree must not drag its ancestors back.
      if (!parent.hasAttribute('data-absent')) parent.hidden = false;
      if (parent instanceof HTMLDetailsElement) parent.open = true;
    }
    parent = parent.parentElement;
  }
}

// Filter the tree by scientific name across the currently-displayed rank set.
// Returns true when the empty state should show (non-empty query, zero matches).
export function runFilter(root: ParentNode, rawQuery: string, showAll: boolean): boolean {
  const query = rawQuery.trim().toLowerCase();
  const nodes = root.querySelectorAll<HTMLElement>('[data-rank]');

  if (!query) {
    // Reset: clear every filter-applied hide on ALL ranks, then re-apply the rank
    // toggle. CR-03 — the old reset only re-ran the rank toggle, so family/genus/
    // species hidden by a prior filter pass stayed hidden until a full reload.
    //
    // `data-absent` (beeatlas-0of.2) survives the reset: it is the GEOGRAPHY
    // filter's decision, not this one's. Clearing it here is what made selecting a
    // county appear to do nothing — the badges landed but every taxon stayed
    // visible, because this loop un-hid them a moment later.
    for (const node of nodes) node.hidden = node.hasAttribute('data-absent');
    applyRankToggle(root, showAll);
    return false;
  }

  let anyVisible = false;
  for (const node of nodes) {
    const rank = node.dataset.rank ?? '';
    // Respect the toggle (D-09 lean): when OFF, intermediate ranks are skipped —
    // they are neither matched nor hidden, so they stay transparent and their
    // descendant matches show through them.
    if (!showAll && INTERMEDIATE_RANKS.has(rank)) {
      node.hidden = node.hasAttribute('data-absent');
      continue;
    }
    const name = (node.dataset.name ?? '').toLowerCase();
    // Match word beginnings only: "fer" hits "Bombus fervidus" but not "Apis
    // mellifera". The full-name startsWith also lets a multi-word query like
    // "bombus fer" match "Bombus fervidus".
    // A node outside the selected geography can never match, whatever is typed.
    const absent = node.hasAttribute('data-absent');
    if (!absent
        && (name.startsWith(query) || name.split(/\s+/).some((word) => word.startsWith(query)))) {
      node.hidden = false;
      openAncestors(node);
      anyVisible = true;
    } else {
      node.hidden = true;
    }
  }
  return !anyVisible;
}

// Geography pickers (beeatlas-0of.2). Kept in this module so the presence filter
// and the text filter share one `update()` — two independent passes over the same
// [data-rank] nodes would fight over the `hidden` attribute, each undoing the
// other's decisions.
//
// The presence pass runs FIRST and the text filter second, so typing narrows within
// the chosen geography rather than resurrecting taxa the geography excluded.
export interface PresenceApi {
  load: () => Promise<{ counties: Record<string, Record<string, number>>;
                        ecoregions: Record<string, Record<string, number>> } | null>;
  apply: (root: ParentNode, present: Record<string, number> | null) => number;
}

// Wire the controls and apply the persisted rank-toggle state. `root` defaults to
// document; tests pass a detached container.
export function initSpeciesTree(root: ParentNode = document, presence?: PresenceApi): void {
  const rankToggle = root.querySelector<HTMLInputElement>('#show-all-ranks');
  const input = root.querySelector<HTMLInputElement>('#species-filter');
  const emptyMsg = root.querySelector<HTMLElement>('#filter-empty');
  const querySpan = root.querySelector<HTMLElement>('#filter-query');

  // Apply persisted state on load (default OFF skips intermediate ranks).
  const initial = loadToggleState();
  if (rankToggle) rankToggle.checked = initial;
  applyRankToggle(root, initial);

  const countySel = root.querySelector<HTMLSelectElement>('#presence-county');
  const ecoSel = root.querySelector<HTMLSelectElement>('#presence-ecoregion');
  const note = root.querySelector<HTMLElement>('#presence-note');
  const summary = root.querySelector<HTMLElement>('#presence-summary');
  const atlasLink = root.querySelector<HTMLAnchorElement>('#presence-atlas-link');

  // The presence map for the CURRENT selection, or null when nothing is selected.
  let selected: Record<string, number> | null = null;

  // Species visible under the geography alone (before any typed query) — the
  // number the summary line reports.
  let presentSpecies = 0;

  // The per-node counts rendered by the template are STATEWIDE totals. With a
  // geography selected they sit next to a filtered tree and read as counts for
  // that area, which they are not — and the presence artifact deliberately
  // carries no per-place counts (they cost 10 KB gzipped and break its budget).
  // Rather than show a number that means something other than what it appears to,
  // hide them while a geography is active; the evidence badge still says what
  // backs each taxon THERE, and the atlas link has exact numbers.
  const treeRoot = (root as Document).querySelector?.('.species-index')
    ?? (root as unknown as HTMLElement);
  function setCountsVisibility(active: boolean): void {
    (treeRoot as HTMLElement)?.classList?.[active ? 'add' : 'remove']('presence-active');
  }

  function update(): void {
    const showAll = rankToggle ? rankToggle.checked : false;
    const raw = input?.value ?? '';
    // Geography first, text second — see PresenceApi above.
    if (presence) presentSpecies = presence.apply(root, selected);
    const showEmpty = runFilter(root, raw, showAll);
    // Empty-state echo: T-133-07 — textContent only, never innerHTML.
    if (querySpan) querySpan.textContent = raw.trim();
    if (emptyMsg) emptyMsg.hidden = !showEmpty;
  }

  async function onPlaceChange(which: 'county' | 'ecoregion'): Promise<void> {
    if (!presence) return;
    // One axis at a time: county AND ecoregion together would read as an
    // intersection the artifact cannot answer honestly (a taxon present in both
    // is not necessarily present in their overlap). Selecting one clears the other.
    if (which === 'county' && ecoSel) ecoSel.value = '';
    if (which === 'ecoregion' && countySel) countySel.value = '';

    const county = countySel?.value ?? '';
    const eco = ecoSel?.value ?? '';
    const name = county || eco;

    if (!name) {
      selected = null;
      setCountsVisibility(false);
      if (note) note.hidden = true;
      update();
      return;
    }

    const payload = await presence.load();
    if (!payload) {
      // No artifact: leave the tree complete and say nothing rather than filter
      // to an empty page. The pickers are disabled below when this happens.
      selected = null;
      setCountsVisibility(false);
      if (note) note.hidden = true;
      update();
      return;
    }
    selected = (county ? payload.counties[county] : payload.ecoregions[eco]) ?? {};
    setCountsVisibility(true);
    update();

    if (summary) {
      // Report SPECIES, not every entry in the map: the artifact also carries
      // genus and subgenus rows, so "214 taxa" sat beside 156 visible species and
      // read as a discrepancy. presence.apply returns what is actually shown.
      const n = presentSpecies;
      const where = county ? `${county} County` : eco;
      summary.textContent =
        `${n} ${n === 1 ? 'species' : 'species'} recorded in ${where}.`;
    }
    if (atlasLink) {
      const param = county ? `counties=${encodeURIComponent(county)}`
                           : `ecor=${encodeURIComponent(eco)}`;
      atlasLink.href = `/?${param}&pane=taxa`;
    }
    if (note) note.hidden = false;
  }

  rankToggle?.addEventListener('change', () => {
    saveToggleState(rankToggle.checked);
    update();
  });
  input?.addEventListener('input', update);
  countySel?.addEventListener('change', () => { void onPlaceChange('county'); });
  ecoSel?.addEventListener('change', () => { void onPlaceChange('ecoregion'); });

  // Probe once so a build without the artifact disables the controls instead of
  // offering a picker that silently does nothing.
  if (presence && (countySel || ecoSel)) {
    void presence.load().then((payload) => {
      if (payload) return;
      for (const sel of [countySel, ecoSel]) {
        if (!sel) continue;
        sel.disabled = true;
        sel.title = 'Geography filtering is unavailable in this build';
      }
    });
  }
}
