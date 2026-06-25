---
title: Rebuild occurrence `source` into orthogonal facets
priority: medium
source: gsd-explore-2026-06-24
created: 2026-06-24
resolves_phase: 170
---

Replace the single mutually-exclusive `source` category (five `int_combined` arms — see
`docs/domain-model.md`) with the **orthogonal facets** a volunteer actually reasons in:
*collector, place, taxon, time,* and *provenance/attribution tier* (mine → project's →
community's). `source` flattens overlapping subsets and leaks pipeline plumbing into the UI.

This is the **substrate** for the "me and my progress" work surface
(`.planning/seeds/me-and-my-progress.md`): the data must be expressible as collector-attributed
**occurrence–sample pairs** with an **ID-status lifecycle**, which `source` obscures. See
`.planning/notes/work-vs-learning-two-halves.md` for the full reframe.

## Surface (the three `source` consumers + the model)

1. **Filter** — `src/filter.ts` (`o.source IN (...)`, `properties.source`) + `src/bee-map.ts`
   (`hiddenSources.has(...)`). The toggle / `src=` URL path.
2. **Detail card** — `src/bee-occurrence-detail.ts` switches on `row.source` to pick the variant.
3. **Map symbology** — `src/style.ts` `_occurrencePointPaint` `match ['get','source']`.
4. **Model** — whether facets are derived at the dbt layer (new columns) or query-time in the
   frontend. Note the positional coupling documented in `docs/domain-model.md` (occIdFromRow
   vocabulary across `src/occurrence.ts` / `src/filter.ts` / `occurrence_places.sql`).

## Open before planning

- Does "provenance tier" replace `source` 1:1, or do facets (e.g. has-specimen, is-provisional,
  collector-is-me) become independent booleans? → resolve via `/gsd-discuss-phase`.
- Keep `src=` URL back-compat? (legacy deep links exist.)

Not yet scheduled to a milestone. Likely Phase 1 of the "work surface" milestone, or a standalone
refactor milestone preceding it. Start with `/gsd-discuss-phase` once promoted.
