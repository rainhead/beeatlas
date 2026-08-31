# 0041 — "Other records" are an overlay, not the default view

Date: 2026-08-31
Status: Accepted
Supersedes nothing; refines the tier facet introduced in Phase 170 ([domain-model.md](../domain-model.md))

## Context

The `tier` facet answers *whose work is this?* — `atlas` is the Bee Atlas community's own
collecting, `other` is expert iNaturalist observations plus published literature. Both tiers were
shown on arrival, and the two are close to the same size: 49,996 atlas records against 50,966
other ones on the 2026-08-31 build. Half of what a first-time visitor saw was somebody else's data,
rendered muted but clustered together with the community's work, and the clusters counted both.

That misrepresents what the product is. BeeAtlas is a record of what the Atlas's own collectors
found; other people's records are context you call up when you want it — a check on coverage, a
second opinion on a range — not the thing you arrive in the middle of.

The tier state was already a filter dimension with a URL param (`tier=`), so the question was only
what an absent param means.

## Decision

**The default view hides the `other` tier.** `tier=` absent from the URL now means the default
view — Atlas work only — rather than "no tier filter". `defaultHiddenTiers()` in
[`src/url-state.ts`](../../src/url-state.ts) is the single spelling of it.

Three consequences follow, and each was a choice:

**Show-everything has to say so out loud.** Because absence means the default, an empty hidden-tier
set is serialised explicitly as `tier=atlas,other`. Without that, ticking "Other records" on and
sharing the link would hand the reader back a view without them.

**The empty filter is not the default filter.** `emptyFilterState()` keeps meaning "show absolutely
everything" and stays what the catalog-number lookup resets to when the record it found is being
hidden — including hidden by the default tier. `defaultFilterState()` is the new starting point.
Conflating the two would make a catalog search for an expert observation silently find nothing.

**"A filter is active" splits in two.** `isFilterActive` stays true for the default state — the tier
really is excluded, so the SQL, the map query and the is-this-record-hidden check must all see it.
A second predicate, `isFilterNarrowed`, asks the reader's question — *have you narrowed this
yourself?* — and is what lights the collapsed pane's filter affordance. A light that is on the
moment you arrive tells nobody anything.

## Consequences

- Old links that carry no `tier=` now open on the default view rather than on everything. Legacy
  `src=` links that named arms from both tiers still mean everything: they are parsed to an
  explicit empty hidden set rather than being folded back into the default.
- Every cold start runs the map's filter query, because the default state is filter-active. The map
  applies the tier cut to its own feature set as well (`_visibleByTier` in `bee-map.ts`), so the
  view is correct before that query lands.
- The CSV of an unnarrowed view is still named `occurrences-all-<date>.csv`. The tier facet
  contributes no filename segment, the same as bounds-only, months-only and place-only filters
  already did (WR-03). Left as it was rather than changed here.

## Rejected alternatives

**Leave the tier default alone and teach the map to mute `other` harder.** Symbology already mutes
it (D-08). Muting is not the problem — presence in the cluster counts is, and no amount of styling
fixes a count.

**Seed the default but keep "empty means no filter" for the URL.** Every session would then open
carrying `tier=atlas`, the filter affordance would be lit permanently, and show-everything would
still be unshareable. The URL noise buys nothing.

**Drop the `other` tier from the map entirely and reach it only from species pages.** Too far: the
overlay is genuinely useful for coverage questions, and it is one checkbox away.
