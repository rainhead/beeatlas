# ADR 0014: Species Page Information Hierarchy

**Status:** Accepted (2026-07-18)

## Context

The species detail page had grown by accretion. A review of
`/species/Bombus/fervidus/` found that the two things a visitor most wants —
where and when a bee occurs — were the only blocks on the page with no
headings, while the page's headline numbers (specimens, community
observations, counties, ecoregions) sat in a muted 0.85rem run-on line,
visually quieter than the trait labels beneath them.

Three of the decisions taken in response change conventions recorded
elsewhere, so they are captured here rather than left implicit in a diff.

## Decision

### 1. The seasonality sample-size scale is a count, not stars

`src/species/seasonality-viz.ts` carried a header block marked
**"Threshold conventions (BeeSearch, locked)"** whose VIZ-05 line specified
star glyphs for sample size: `*` (20–49), `**` (50–99), `***` (100–999),
`****` (≥1000).

That scale is **superseded**. The chart now states the count literally
("Based on 89 dated records.").

Rationale: the stars rendered on the page with no key anywhere near them —
nothing on the page, in a caption, or in a legend told a reader that `**`
meant 50–99 records. An unexplained glyph is not a weaker version of the
information; it is noise that a reader must ignore. The count is shorter to
read, exact rather than bucketed, and needs no key.

The "locked" marker meant the *thresholds* were not to drift casually
between components (BeeSearch parity), not that the presentation could never
change. The 5-record bars/fallback threshold (VIZ-02) is untouched and
remains locked.

### 2. The chart's caption belongs to the component

The page briefly gated a "bar height is records per month" caption on
`month_histogram | sum >= 5`, duplicating the component's VIZ-02 threshold in
the template. If the component's threshold ever moved, the page would caption
a chart that was not drawn.

The caption now renders inside `seasonality-viz`, in the bar branch only. The
page supplies the year span via the `yearRange` property — the page owns which
years to name, the component owns whether there is a chart to explain.

### 3. A nominotypical subgenus is dropped from the breadcrumb

The breadcrumb now walks the full taxonomic ladder (family → subfamily →
tribe → genus → subgenus → epithet), reusing the existing `hasPage` tagging so
ranks without a generated page render as plain text rather than dead links.

One rung is deliberately omitted: a subgenus whose name repeats its genus
verbatim. `Andrena / Andrena` reads as a rendering fault rather than as
taxonomy, and costs a reader more attention than the rung returns. This is an
editorial call and it is a real departure from "show the full ladder" — hence
recording it. The rung is suppressed only on exact equality with the genus
name; every other subgenus, generated page or not, still appears.

### 4. Checklist-only species show checklist records, not four zeros

A species listed on the WA Bee Atlas checklist with no occurrences scored 0 on
all four headline stats. Four zero tiles bury the one number that does exist,
so for those species the stat row shows **Checklist records** instead, with a
sentence stating plainly that no specimens or community observations are in
the atlas yet. Species with occurrences are unaffected; a species that is both
gains a fifth tile.

## Consequences

- `docs/lessons-learned.md` and any future component reading the star scale
  must not reintroduce it; the count is the contract.
- `seasonality-viz` now has a presentational property (`yearRange`). It still
  performs no computation beyond scaling and layout (VIZ-04 holds).
- Breadcrumb construction moved to `_data/species.js` as `sp.crumbs`
  (`[{label, href}]`, `href: null` when no page exists). Templates render one
  uniform loop; the rank-by-rank branching is gone.
- The suppressed-subgenus rule is one line in that builder, so reversing it is
  a one-line change if the omission ever proves confusing.

## Rejected alternatives

- **Keep the stars and add a legend.** Costs a legend line to explain a
  bucketed approximation of a number we already have exactly.
- **Keep per-rank breadcrumb branching in the template.** Three near-identical
  `{% if rank %}…{% if rankHasPage %}` blocks; adding a rank meant a fourth.
- **Hide the breadcrumb rung for every subgenus.** Loses real taxonomic
  information for the majority (non-nominotypical) case.
