completed: 2026-06-08
---
title: Apply the shared quantify() pluralization utility across remaining web copy
priority: low
source: phase-132-human-verify
created: 2026-06-03
---

Phase 132 introduced a single pluralization utility (`src/lib/quantify.js`,
registered as the Eleventy `quantify` filter in `eleventy.config.js`) after the
human-verify surfaced "1 genera" on the subfamily page. The utility was applied to
the **taxon-page family** that Phase 132 touched: `_pages/subfamily.njk`,
`genus.njk`, `subgenus.njk`, `tribe.njk` (count + metadata copy).

To reach the user's goal of "a single utility used consistently across web copy,"
sweep the remaining count-noun copy onto `quantify()`:
- `_pages/species-detail.njk` — "N specimens · N community observations · N counties ·
  N ecoregions", "N checklist records" (lines ~41, 43, 46).
- `_pages/places.njk` and `_pages/place-detail.njk` — "N specimens".
- Any client-side TS that renders counts (e.g. map/sidebar/table copy in `src/`).
  `quantify`/`pluralize` are plain ESM exports importable from TS.

Mechanical, low-risk; each surface is covered by `npm run build` + vitest. Irregular
plurals already handled by passing an explicit plural (e.g. `quantify(n,"genus","genera")`,
`quantify(n,"county","counties")`, `quantify(n,"species","species")`). Out of Phase
132 scope beyond the taxon-page family.
