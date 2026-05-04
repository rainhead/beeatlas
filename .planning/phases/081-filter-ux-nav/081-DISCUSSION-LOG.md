# Phase 81: Filter UX & Nav — Discussion Log

**Date:** 2026-05-04
**Mode:** /gsd-discuss-phase 81 (default)

## Areas Selected for Discussion

User selected (multi-select): **Filter→count compute**, **Multi-select widget**, **Geo-multi seasonality**.
User skipped: **buildSpaTaxonLink home** — resolved by Claude (D-05) via ARCH-04 constraint analysis.

## Questions Asked

### Q1 — Compute model
*How should filtered 'N records' per card be computed and delivered?*

Options:
- **Coordinator computes (Recommended)** ← user selected
- Cards self-compute
- Coordinator computes + sets opacity

Note: cards retain local opacity logic from `filteredCount === 0`; only the count map is centrally computed. Locked as D-01.

### Q2 — Geo combine
*When BOTH counties and ecoregions are selected, how should the per-card count combine them?*

Options:
- **Union (sum), then month-mask (Recommended)** ← user selected
- Intersect (county AND ecoregion)
- Counties take precedence

Locked as D-02. Approximation noted: per-month `max()` is an OR-deduplicating proxy; exact OR would require crossed slices (deferred).

### Q3 — Multi-select widget
*Which multi-select widget for county (~39 options) and ecoregion-l3 (~9 options)?*

Options:
- **Checkbox list in `<details>` popover (Recommended)** ← user selected
- Native `<select multiple>`
- Combobox with chips

Locked as D-03. Aligns with NAV-05's `<details>` aesthetic.

### Q4 — Viz slice
*When multiple counties or ecoregions are selected, what 12-vector does `<seasonality-viz>` draw?*

Options:
- **Same union rule as count (Recommended)** ← user selected
- Show `_total`, dim out-of-month bars
- Render only when exactly one geo

Locked as D-04. Coordinator computes the 12-vector once and feeds it to both the count badge and the viz, ensuring badge and chart agree.

## Claude's Discretion (resolved without asking)

- **D-05 `buildSpaTaxonLink` home:** new `src/lib/spa-link.ts`. Reasoning: ARCH-04 forbids `src/species/**` from importing `src/url-state.ts` (transitively pulls `src/filter.ts`). A new shared module avoids the violation while keeping LINK-04's contract documentation in `src/url-state.ts`.
- **D-06 New `src/species/url-state.ts`** for species-page URL params, disjoint from SPA's `src/url-state.ts`. Two files, two contracts, two routes.
- **D-07 Breadcrumb pill row + clear-all** — straightforward derivation of FILT-06/FILT-07; no decision to surface.

## Deferred Ideas Captured

See `081-CONTEXT.md` `<deferred>` section. Notable: crossed county×ecoregion slices (Phase 78 pipeline work), full responsive design pass (Phase 82), card visual polish (`/gsd-ui-phase 81`).

## Scope-Creep Redirects

None. User stayed within Phase 81 boundary throughout.

---

*Discussion captured 2026-05-04 via /gsd-discuss-phase 81*
