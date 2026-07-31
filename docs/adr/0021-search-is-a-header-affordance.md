# ADR 0021: Search is a header affordance, and one query field serves every kind of thing

**Status:** Accepted (implemented 2026-07-31; issue beeatlas-v66)

Supersedes the *placement* decided implicitly by [ADR 0020](0020-catalog-lookup-selects-and-filters-yield.md). Everything ADR 0020 decided about what a label number *means* — selection, not filter; the filter yields; the match is the trailing digit run — stands unchanged.

---

## Context

ADR 0020 shipped the label-number lookup as a field at the top of `<bee-pane>`'s
filter panel. Using it revealed the placement was wrong on two counts.

It is not a filter, and it sat among filters wearing the filter-row costume — the
same icon-plus-input shape as taxon, collector and county. ADR 0020 argued at length
that a lookup is a *selection*, then put the control in the one surface on screen
that means "filter". The comment above the render method said as much in as many
words ("wears the filter-row costume, but is NOT a filter"), which is the sort of
thing a comment has to say when the layout is saying the opposite.

It is also not where anyone looks for search. The filter panel lives inside the
sidebar, which is a transient surface — collapsed by default, and replaced by the
detail card as soon as a record is selected. Search is a way *into* the data, so
hiding it inside a surface you reach after you already have data is backwards.

And the scope is about to grow. Label numbers are the first thing worth searching
for, not the last: taxa, places and people are all named things a user arrives
already knowing. A per-kind field in a filter panel does not survive that; a single
query field does.

## Decision

**Search is a button in `<bee-header>`, immediately left of the account button, and
it opens one query field that will come to serve every searchable kind.**

The field submits on Enter and the header knows nothing about what a query means.
It emits `search-submit {query}` and takes back a `searchStatus` — `{ query, kind:
'miss' | 'error' }` — which it renders only while its field still holds that exact
string, so editing retires the message with no round-trip. `<bee-atlas>` owns the
routing: today `_onSearchSubmit` sends every query to the catalog lookup; taxa,
places and people join it there. That is the whole reason the event is named
`search-submit` and not `catalog-lookup` — the seam is named for what it is
becoming, while the resolver behind it stays the one ADR 0020 built.

The state-ownership invariant is what forces this shape: `<bee-header>` is a pure
presenter on every page it appears on, and it must not learn to query wa-sqlite just
because it grew a text field.

### A hit is reported, not inferred

`searchStatus` carries `hit` alongside `miss` and `error`, and a hit closes the
popover and empties the field. The popover hangs over the sidebar — which is exactly
where a resolved specimen's detail card appears — so leaving it up covers the answer
the user just asked for. A miss or an error keeps it open, because the message is
then the only thing that came back.

The obvious cheaper design is for the header to infer success from the *absence* of
a failure. It cannot: "no status" is also the state before anything has been
searched for, and a presenter with no memory of what it submitted cannot tell those
apart. Reporting the hit costs one union member and makes the contract legible —
every submitted query gets an answer back.

### The button is gated, not universal

`searchEnabled` defaults to `false`; only `<bee-atlas>` sets it. The static pages
(species, places, collectors, taxon pages) mount the same header through
`src/entries/bee-header.ts` and have no client-side store behind them, so they would
get a button that could not answer. A dead affordance in the chrome of every page is
worse than no affordance.

Rejected for now: *make the static-page button navigate to `/index.html?q=…` and let
the app resolve it on load.* That is a real feature — it would make search genuinely
global — but it needs a query URL param, a resolve-on-boot path, and a decision about
what a species page should do with a taxon hit. Filed rather than smuggled in.

### Rejected alternatives

**Leave it in the filter panel and restyle it.** Fixes nothing: the panel is still
the wrong surface, and the control still has to be reached through the sidebar.

**An always-visible field in the header.** A permanent field costs horizontal space
the header does not have — the mobile layout is already at the point of wrapping the
trailing group at ~360px, with a title, four nav icons, and up to three trailing
buttons. A button that opens a popover costs one icon slot, the same as install.

**A separate popover shell for search.** There are already two popovers hanging off
`.right-group` (account menu, iOS A2HS). Search reuses `.cache-popover`, so there is
one surface, one dismissal pattern (outside click + Escape), one set of a11y
attributes. The two popovers are mutually exclusive: each toggle closes the other,
because both anchor to the same corner.

## Consequences

**Escape does two things, in the order a user means them.** Escape in a non-empty
field clears it; Escape in an empty field closes the popover. Following the plain
"Escape closes the dialog" rule would throw away a mistyped number and the popover
in one keystroke.

**`<bee-pane>` lost a property pair and a render method.** `catalogLookupMiss` and
`catalogLookupFailed` are gone from the pane, collapsed into the single
`searchStatus` the header takes. The pane's filter panel is now filters only, which
is what its name claims.

**The tests moved with the behaviour.** `bee-pane-catalog.test.ts` →
`bee-header-search.test.ts`, `bee-atlas-catalog.test.ts` →
`bee-atlas-search.test.ts`. The atlas-side cases are unchanged in substance — they
still assert selection, viewport recentring, the filter yield, the stale guard, and
miss-vs-error — because none of that was what moved.

**Search on the static pages is now a named gap**, not an accident. Anyone adding
it starts from `searchEnabled` and the rejected alternative above.
