// The "Show all ranks" rank model, shared by BOTH taxonomy trees:
//   - the static /species/ browse tree (species-tree.ts, _pages/species.njk)
//   - the map app's taxa pane (bee-taxa-tree.ts)
//
// WHY ITS OWN MODULE. The pane reuses this logic rather than reimplementing it, so
// the two trees cannot drift on what "skip intermediate ranks" means or on where
// the preference is stored. But importing it from species-tree.ts pulled the whole
// static page's module — filter, pickers, init wiring — into the SPA's dependency
// graph, and Rollup then emitted `species-tree-<hash>.js` as a chunk the ROOT page
// references. That broke the IDX-02 code-splitting guarantee
// (build-output.data.test.ts: the species chunk must stay split out from `/`).
// Splitting the shared part out fixes the chunking without duplicating the model.
//
// Rank model (load-bearing): intermediate ranks (subfamily/tribe/subgenus) are
// "skipped" in the default view by adding the `rank-skipped` class (CSS:
// display:contents + summary hidden) and forcing the wrapper <details> open, so
// the genera/species nested inside render directly under the family. We never use
// the `hidden` attribute (display:none) to skip a rank — that would bury the whole
// subtree, hiding the genera/species too. (CR-01)

// D-04: one localStorage key for the "Show all ranks" boolean, shared across both
// surfaces so the preference follows the reader. Value is the string "1" (ON) or
// "0" / absent (OFF). Never eval'd or JSON.parse'd.
export const STORAGE_KEY = 'beeatlas.speciesTree.showAllRanks';

export const INTERMEDIATE_SELECTOR =
  '[data-rank="subfamily"],[data-rank="tribe"],[data-rank="subgenus"]';
export const INTERMEDIATE_RANKS = new Set(['subfamily', 'tribe', 'subgenus']);

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
