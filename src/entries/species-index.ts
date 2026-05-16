// Vite Rollup entry for the Eleventy-rendered species index page — see
// _pages/species.njk (family→genus grouping, type-to-filter input).
// No Lit registrations — the index is plain HTML with a single input event listener.
// Plugin-vite MPA mode auto-discovers this entry from the page's
// <script type="module"> tag and emits a separate species-index-<hash>.js chunk.
// No vite.config.ts changes required.
import '../index.css';
import '../styles/taxon-pages.css';
import '../bee-header.ts';

const input = document.getElementById('species-filter') as HTMLInputElement | null;
const emptyMsg = document.getElementById('filter-empty') as HTMLElement | null;

input?.addEventListener('input', () => {
  const query = input.value.trim().toLowerCase();
  let anyVisible = false;
  for (const section of document.querySelectorAll<HTMLElement>('.family-section')) {
    let sectionVisible = false;
    for (const row of section.querySelectorAll<HTMLElement>('.genus-row')) {
      const genusName = (row.dataset.genus ?? '').toLowerCase();
      let rowVisible = false;
      for (const li of row.querySelectorAll<HTMLElement>('li[data-name]')) {
        const match = !query || (li.dataset.name ?? '').includes(query) || genusName.includes(query);
        li.hidden = !match;
        if (match) rowVisible = true;
      }
      row.hidden = !rowVisible;
      if (rowVisible) sectionVisible = true;
    }
    section.hidden = !sectionVisible;
    if (sectionVisible) anyVisible = true;
  }
  if (emptyMsg) {
    emptyMsg.hidden = anyVisible || !query;
    const querySpan = document.getElementById('filter-query');
    if (querySpan) querySpan.textContent = input.value.trim();
  }
});
