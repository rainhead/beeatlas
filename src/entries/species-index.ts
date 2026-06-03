// Vite Rollup entry for the Eleventy-rendered species index page — see
// _pages/species.njk (expandable taxonomy tree, type-to-filter, rank toggle).
// No Lit registrations — the index is plain HTML with DOM event listeners.
// Plugin-vite MPA mode auto-discovers this entry from the page's
// <script type="module"> tag and emits a separate species-index-<hash>.js chunk.
// No vite.config.ts changes required.
import '../index.css';
import '../styles/taxon-pages.css';
import '../bee-header.ts';

// D-04: one localStorage key for the "Show all ranks" boolean toggle.
// Value is the string "1" (ON) or "0" / absent (OFF). Never eval'd or JSON.parse'd.
const STORAGE_KEY = 'beeatlas.speciesTree.showAllRanks';

// T-133-08 + T-133-09: strict compare, try/catch for private-mode / quota-exceeded.
function loadToggleState(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // localStorage unavailable (private mode, storage quota) — default OFF.
    return false;
  }
}

function saveToggleState(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    // Ignore write failures (private mode / quota) — toggle still works for the session.
  }
}

// applyRankToggle: show/hide intermediate rank nodes (subfamily/tribe/subgenus).
// D-03: all-or-nothing toggle across the whole tree.
const rankToggle = document.getElementById('show-all-ranks') as HTMLInputElement | null;

function applyRankToggle(showAll: boolean): void {
  for (const el of document.querySelectorAll<HTMLElement>(
    '[data-rank="subfamily"],[data-rank="tribe"],[data-rank="subgenus"]'
  )) {
    el.hidden = !showAll;
  }
  if (rankToggle) rankToggle.checked = showAll;
}

rankToggle?.addEventListener('change', () => {
  const showAll = rankToggle.checked;
  applyRankToggle(showAll);
  saveToggleState(showAll);
  // When toggling OFF with an active filter, re-run filter to hide newly-revealed nodes.
  runFilter();
});

// Apply persisted state on load.
applyRankToggle(loadToggleState());

// openAncestors: walk up the DOM and open every ancestor <details> so the matched
// node is visible without manual expansion (D-09 / TREE-03).
function openAncestors(el: HTMLElement): void {
  let parent = el.parentElement;
  while (parent) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
    parent = parent.parentElement;
  }
}

const input = document.getElementById('species-filter') as HTMLInputElement | null;
const emptyMsg = document.getElementById('filter-empty') as HTMLElement | null;

function runFilter(): void {
  if (!input) return;
  const rawQuery = input.value.trim();
  const query = rawQuery.toLowerCase();

  if (!query) {
    // Empty query: restore rank-toggle-driven visibility, hide empty state.
    applyRankToggle(rankToggle ? rankToggle.checked : loadToggleState());
    if (emptyMsg) emptyMsg.hidden = true;
    return;
  }

  let anyVisible = false;

  // Filter across the currently-displayed rank set (D-09 lean: do NOT pierce
  // nodes hidden by the rank toggle). Iterate every [data-rank] node and
  // match against dataset.name (always lowercased in HTML by the template).
  for (const node of document.querySelectorAll<HTMLElement>('[data-rank]')) {
    // Skip nodes already hidden by the rank toggle (respect toggle — D-09).
    if (node.hidden && node.dataset.rank !== 'species' && node.dataset.rank !== 'genus' && node.dataset.rank !== 'family') {
      // Intermediate rank node hidden by toggle — leave it hidden, skip matching.
      continue;
    }
    const name = (node.dataset.name ?? '').toLowerCase();
    const match = name.includes(query);
    if (match) {
      node.hidden = false;
      openAncestors(node);
      anyVisible = true;
    } else {
      // Only hide nodes not already hidden by rank toggle (avoid revealing them).
      node.hidden = true;
    }
  }

  // Empty-state: T-133-07 — textContent only, never innerHTML.
  if (emptyMsg) {
    emptyMsg.hidden = anyVisible;
    const querySpan = document.getElementById('filter-query');
    if (querySpan) querySpan.textContent = rawQuery;
  }
}

input?.addEventListener('input', runFilter);
