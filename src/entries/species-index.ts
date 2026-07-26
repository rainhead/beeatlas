// Vite Rollup entry for the Eleventy-rendered species index page — see
// _pages/species.njk (expandable taxonomy tree, type-to-filter, rank toggle).
// No Lit registrations — the index is plain HTML with DOM event listeners.
// Plugin-vite MPA mode auto-discovers this entry from the page's
// <script type="module"> tag and emits a separate species-index-<hash>.js chunk.
// No vite.config.ts changes required.
//
// The tree behavior lives in ../species-tree.ts (a pure DOM module with no
// side-effect imports) so it can be unit-tested under happy-dom. This entry only
// pulls in the page styles + shared header and kicks off initialization.
import '../index.css';
import '../styles/taxon-pages.css';
import '../bee-header.ts';
import { initSpeciesTree } from '../species-tree.ts';
import { applyPresence, loadPresence } from '../species-presence.ts';
import { resolveDataUrl } from '../manifest.ts';

// The presence API is injected rather than imported inside species-tree.ts so that
// module stays a pure DOM unit, testable under happy-dom with no fetch or manifest.
initSpeciesTree(document, {
  load: () => loadPresence((key) => resolveDataUrl(key as 'taxon_presence')),
  apply: applyPresence,
});
