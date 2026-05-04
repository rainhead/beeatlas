// Vite Rollup entry for the Eleventy-rendered /species/ page — see
// _pages/species.njk. Side-effect imports trigger @customElement(...)
// registration via Lit decorators. Plugin-vite's MPA mode auto-discovers
// this entry from the page's <script type="module"> tag and emits a
// separate _site/assets/species-*.js chunk (PAGE-09). No vite.config.ts
// changes required — verified by the existing bee-header-*.js chunk.
//
// The header lives here (not under src/species/) so the ARCH-04 boundary
// stays clean — see RESEARCH.md Open Question 4. Allowed import set is
// pinned by src/tests/arch.test.ts.

import '../bee-header.ts';
import '../species/bee-species-page.ts';
import '../species/bee-species-card.ts';
import '../species/bee-taxon-nav.ts';
import '../species/bee-species-filter.ts';
import '../species/seasonality-viz.ts';
