// Vite Rollup entry for Eleventy-rendered taxon pages — see
// _pages/species-detail.njk and _pages/genus.njk.
// Side-effect registrations trigger @customElement(...) via Lit decorators.
// Plugin-vite MPA mode auto-discovers this entry from the pages'
// <script type="module"> tag and emits a separate taxon-page chunk.
// No vite.config.ts changes required.
//
// This is a strict subset of src/entries/species.ts — the heavier
// coordinator components are omitted so the taxon-page chunk stays lean.
import '../index.css';
import '../styles/taxon-pages.css';
import '../bee-header.ts';
import '../species/seasonality-viz.ts';
import '../species/photo-gallery.ts';
import '../bee-notes.ts';
