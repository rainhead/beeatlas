// Client behavior for the /species browse tree (see _pages/species.njk):
//   - "Show all ranks" toggle (D-03), persisted in one localStorage key (D-04)
//   - type-to-filter across the currently-displayed rank set, with ancestor
//     auto-expand (D-09 / TREE-03)
//
// Pure DOM module: no CSS or custom-element imports, so it is unit-testable under
// happy-dom. The Vite entry (entries/species-index.ts) wires the side-effect
// imports and calls initSpeciesTree() on load.
//
// Rank model (load-bearing): intermediate ranks (subfamily/tribe/subgenus) are
// "skipped" in the default view by adding the `rank-skipped` class (CSS:
// display:contents + summary hidden) and forcing the wrapper <details> open, so
// the genera/species nested inside render directly under the family. We never use
// the `hidden` attribute (display:none) to skip a rank — that would bury the whole
// subtree, hiding the genera/species too.

// D-04: one localStorage key for the "Show all ranks" boolean. Value is the string
// "1" (ON) or "0" / absent (OFF). Never eval'd or JSON.parse'd.
export const STORAGE_KEY = 'beeatlas.speciesTree.showAllRanks';

const INTERMEDIATE_SELECTOR =
  '[data-rank="subfamily"],[data-rank="tribe"],[data-rank="subgenus"]';
const INTERMEDIATE_RANKS = new Set(['subfamily', 'tribe', 'subgenus']);

// T-133-08 + T-133-09: strict compare, try/catch for private-mode / quota-exceeded.
export function loadToggleState(storage: Storage = localStorage): boolean {
  try {
    return storage.getItem(STORAGE_KEY) === '1';
  } catch {
    // localStorage unavailable (private mode, storage quota) — default OFF.
    return false;
  }
}

export function saveToggleState(value: boolean, storage: Storage = localStorage): void {
  try {
    storage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    // Ignore write failures (private mode / quota) — toggle still works for the session.
  }
}

// Reveal (showAll) or skip the intermediate-rank wrappers across the whole tree.
// Skipping uses the `rank-skipped` class + forces the <details> open; it must NOT
// touch the `hidden` attribute (see module header — CR-01).
export function applyRankToggle(root: ParentNode, showAll: boolean): void {
  for (const el of root.querySelectorAll<HTMLElement>(INTERMEDIATE_SELECTOR)) {
    if (showAll) {
      el.classList.remove('rank-skipped');
    } else {
      el.classList.add('rank-skipped');
      if (el instanceof HTMLDetailsElement) el.open = true;
    }
  }
}

// Open AND un-hide every [data-rank] ancestor so a deep filter match is actually
// revealed. Setting .open alone (CR-02) leaves an ancestor that an earlier filter
// pass hid at display:none, so the match never shows.
export function openAncestors(el: HTMLElement): void {
  let parent = el.parentElement;
  while (parent) {
    if (parent.matches?.('[data-rank]')) {
      parent.hidden = false;
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
    for (const node of nodes) node.hidden = false;
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
      node.hidden = false;
      continue;
    }
    const name = (node.dataset.name ?? '').toLowerCase();
    // Match word beginnings only: "fer" hits "Bombus fervidus" but not "Apis
    // mellifera". The full-name startsWith also lets a multi-word query like
    // "bombus fer" match "Bombus fervidus".
    if (name.startsWith(query) || name.split(/\s+/).some((word) => word.startsWith(query))) {
      node.hidden = false;
      openAncestors(node);
      anyVisible = true;
    } else {
      node.hidden = true;
    }
  }
  return !anyVisible;
}

// Wire the controls and apply the persisted rank-toggle state. `root` defaults to
// document; tests pass a detached container.
export function initSpeciesTree(root: ParentNode = document): void {
  const rankToggle = root.querySelector<HTMLInputElement>('#show-all-ranks');
  const input = root.querySelector<HTMLInputElement>('#species-filter');
  const emptyMsg = root.querySelector<HTMLElement>('#filter-empty');
  const querySpan = root.querySelector<HTMLElement>('#filter-query');

  // Apply persisted state on load (default OFF skips intermediate ranks).
  const initial = loadToggleState();
  if (rankToggle) rankToggle.checked = initial;
  applyRankToggle(root, initial);

  function update(): void {
    const showAll = rankToggle ? rankToggle.checked : false;
    const raw = input?.value ?? '';
    const showEmpty = runFilter(root, raw, showAll);
    // Empty-state echo: T-133-07 — textContent only, never innerHTML.
    if (querySpan) querySpan.textContent = raw.trim();
    if (emptyMsg) emptyMsg.hidden = !showEmpty;
  }

  rankToggle?.addEventListener('change', () => {
    saveToggleState(rankToggle.checked);
    update();
  });
  input?.addEventListener('input', update);
}
