# ADR 0028: A search result names a record or a view — a record is selected, a view is filtered

**Status:** Proposed (issue beeatlas-7nx)

Builds on [ADR 0021](0021-search-is-a-header-affordance.md), which put one query field in
the header and left `_onSearchSubmit` as a router with exactly one route. This record
decides what the other routes mean. [ADR 0020](0020-catalog-lookup-selects-and-filters-yield.md)
is unchanged: a label number is still a selection, and an active filter still yields to it.

---

## Context

ADR 0021 shipped the header field knowing it was unfinished — "taxa, places and people
are all named things a user arrives already knowing", and the event was deliberately
named `search-submit` rather than `catalog-lookup` so they could join it later. Joining
them raises three questions the earlier record explicitly deferred: how results rank
across kinds, what a taxon hit *does* given that ADR 0020 spent its length arguing a
lookup is a selection and not a filter, and whether a place sets bounds or a place
filter.

A label number is the easy case and it hid the hard one. It resolves to at most one
record, so "submit and get an answer" was a complete interaction. A name does not:
`bomb` is a genus, thirty species, and possibly a collector. Search has to be able to
show more than one answer and let the reader choose.

## Decision

**Every search result names either a record or a view. A record is *selected*; a view
is *filtered*.**

That single sentence answers two of the three deferred questions.

- A **label number** names one record → selection, filter yields. ADR 0020, untouched.
- A **taxon**, a **person**, a **place**, a **county**, an **ecoregion** each name a
  *set* of records → each sets its own dimension of `FilterState`.

So a place sets the **place filter, not bounds**. `bounds` is a box the user drew;
a place is a polygon the record is a member of, and the `occurrence_places` bridge
already answers membership exactly ([ADR 0006](0006-many-to-many-place-model.md),
`filter.ts:449`). Resolving a place to its bounding box would silently re-admit every
record in the box that is not in the place, and would re-admit the checklist rows that
`filter.ts:530` deliberately drops for every sub-county geometry — a park-sized box
around downtown Seattle would answer with 683 county-placeholder records.

### The camera is not the filter

Fitting the map to the answer is a *camera* move, not a filter change, and the two are
decided separately. Search moves the camera to whatever it just applied; the filter
panel does not. That is the honest difference between the two surfaces — ADR 0021 called
search "a way *into* the data", while the panel refines a view you already have — and
ADR 0020 already set the precedent, recentring the map on a resolved label number
because "a label number carries no hint of where the record is". A taxon name carries no
hint either. `Bombus fervidus` has three records in Okanogan County; applying that filter
without moving would leave the reader looking at an empty screen and concluding search
is broken.

The extent comes from the filter query that runs anyway — `queryVisibleGeoJSON` already
returns every matching feature — so fitting costs no extra query. **Zero matches means no
extent, and no camera move**: there is nothing to fly to, and jumping to a default view
would destroy the reader's place in exchange for nothing.

### A search composes with the filter it lands on, and replaces only the dimension it names

Searching `Bombus` with a year and a county already set gives *Bombus, that year, in that
county*. Search never clears a dimension it did not name. Within the dimension it does
name it **replaces**: searching one county after another shows the second county, not
both. One rule, no per-dimension special cases, and the second search behaves like the
first.

This is a different rule from the label-number yield, and deliberately so. The yield
exists because a *selection* can be hidden by a filter — `queryListPage` intersects the
two, so selecting a filtered-out record shows "1 selected" over an empty card. A filter
cannot be hidden by another filter; it can only compose to zero, which is a legible
answer rather than a broken screen. Composing to zero is still worth saying out loud, so
the popover reports the resulting record count on the row before it is picked.

### Names resolve as you type; numbers still resolve on submit

The popover becomes a combobox. Every keystroke re-ranks an in-memory index and shows
candidates; Enter or a click applies the highlighted one.

This is affordable because every corpus already sits in memory in `<bee-atlas>` —
`_taxaOptions`, `_countyOptions`, `_ecoregionOptions`, `_collectorOptions` — so matching
is pure JS over arrays and no SQL runs per keystroke. Only places are missing, and they
are loaded inside `<bee-pane>` today (`bee-pane.ts:911`), which is a state-ownership
violation on its own terms; hoisting `places.json` up to `<bee-atlas>` fixes that and
feeds search in the same move.

A **numeric query is exempt**. `parseCatalogSuffix` returning non-null means the query
is a label number and nothing else can match it, so the list holds exactly one
speculative row — *look up WSDA_2303966* — and the `substr` scan over the occurrence
table runs only when that row is picked. The existing miss/error/hit path survives
unchanged behind it, which is why `SearchStatus` keeps all three members and its rule of
rendering only while the field still holds the same string.

That row is not an exception to the thesis. It names a record — *the* record carrying
that number — and naming a record is not the same as having fetched one. Every other
kind is named by something already in memory, so the distinction never shows; here it
does, and the cost is that a label row is the one row that can still come back empty.
That is what `miss` is for, and why it is reported rather than inferred.

### Ranking is match quality, then weight — kind is not a ranking key

1. **Syntax decides the kind when it can.** Digits ⇒ label number, exclusively.
2. **Names score by match quality**: exact 3, prefix of the whole name or of any word
   within it 2 (so `vosnesenskii` finds *Bombus vosnesenskii* and `smith` finds
   *Smith, J.*), substring 1, no match drops.
3. **Ties break by weight** — the record count behind the thing. Taxa carry occurrence
   counts, places carry `specimen_count`/`sample_count`, collectors carry a row count.
4. **Then by label, then by a stable per-thing key** (`<kind>:<id>`), ascending. Label
   alone is not a total order — a county and an ecoregion can carry the same name —
   and two rows that swap places between renders move under the reader's cursor.

Kind is deliberately *not* a ranking key. A well-attested collector should outrank a
one-record subgenus, and any fixed kind order gets that wrong in one direction or the
other. Kind becomes a group heading in the list, where it explains a row instead of
ordering it. The list is capped, and a truncated list says so rather than presenting a
silent top-N as the whole answer.

### The page link is an attribute of a row, not a row of its own

Species, place and collector pages exist and hold what the map cannot — traits,
phenology, notes, collection history. A result row therefore carries a trailing link to
its page when one exists.

Making that a *second row* per thing was rejected: it doubles every ranking question, and
it makes a missing page invisible rather than merely absent. Page existence is not
derivable — `src/taxon-pages.ts` exists precisely because it isn't ("/species/Apidae/
does not exist… 20 of 646 Anthophila taxa with occurrences have no page at all"), and
counties and ecoregions have no pages at all. As an attribute the link is simply absent
where there is no page; as a row it would be a hole in a ranked list.

So one row is one thing, with one primary verb — *apply* — and an escape hatch that
leaves the app. What applying does is the thesis: a record row selects, a view row
filters. The reader does not choose between the two, because the thing they picked
already decided it.

### The list is buttons in a dialog, not a listbox

The popover is already `role="dialog"` and already holds buttons (ADR 0021 reused the
`.cache-popover` shell for exactly this kind of consistency). A row is a `<button>` plus,
where a page exists, an `<a>`. An ARIA listbox cannot contain focusable children, so
listbox semantics would force the page link into a keyboard modifier that nothing
announces. Real semantics beat a combobox costume: Tab reaches the link, Enter applies
the filter, and arrow keys move focus between rows by a roving `tabindex`.

The two-stage Escape from ADR 0021 stands — Escape in a non-empty field clears it,
Escape in an empty field closes the popover.

### `search-submit` is retired, and the seam is finally the right shape

The header emits `search-query {query}` on input and `search-pick {candidate}` on
choice; `<bee-atlas>` sends back a ranked `SearchCandidate[]`, **the flag saying the
list was capped**, and the same `searchStatus`. The flag is part of the contract and
not a presenter detail: only the ranker knows how many matches it dropped, and a
top-N presented as the whole answer tells a reader their thing is not in the data. Enter with nothing highlighted picks the first candidate, which is what
the old submit meant, so `search-submit` has nothing left to carry.

A candidate is **declarative data, never a closure** — a discriminated union over kind
plus the payload that identifies the thing, with `label`, `detail`, `weight`, and
`href`. `<bee-atlas>` owns one `_applySearchCandidate` that switches on kind. The header
must not carry behaviour across that boundary; ADR 0021's reason still holds, that
`<bee-header>` is a pure presenter on every page it appears on and must not learn to
query wa-sqlite because it grew a text field.

Ranking lives in a pure `src/search.ts` so it is testable without mounting anything.
`<bee-atlas>` computes the candidates rather than pushing the raw index down to the
header, because the index does not exist until the DB loads, and because a future kind
(notes, over `api.beeatlas.net`) is genuinely async. The property must be able to arrive
late whatever the kind.

### Rejected alternatives

**Submit, then show a list.** Keeps today's discrete submit and only lists when the query
is ambiguous. Fewer moving parts, but the common case — a name — costs Enter plus a
click, and "ambiguous" has to be defined before the reader can see what the options were.

**Replace the whole filter on every hit.** Uniform with the label-number yield and never
lands on an empty screen, but it silently discards panel work, and that discard is not
undoable: filter changes are written with `replaceState`, so Back cannot recover it
(ADR 0020's note on the yield).

**Rank by kind, taxa first.** Legible and wrong. It answers a query that exactly names a
prolific collector with a subgenus nobody has recorded twice.

**Index places with no records.** `<bee-pane>` already excludes them from its options
(`bee-pane.ts:922`), and a place filter that can only ever produce an empty map is a
result that punishes being picked. They stay out of the index; their pages remain
reachable from `/places.html`.

## Consequences

**`FilterState` gains no field.** Every kind search can apply already has a dimension —
`taxonId`, `selectedCollectors`, `selectedPlace`, `selectedCounties`,
`selectedEcoregions`. Search is a second way to set what the panel sets, which is what
makes "search composes" cheap; the chips the panel renders are also how a reader sees
what a search just did.

**`<bee-map>` gains a way to be told an extent.** `_viewState` is `{lat, lon, zoom}` and
cannot express "fit these bounds with padding". A `fitBounds` property on `<bee-map>` is
a new presenter input, capped at a maximum zoom so a single record does not slam to
street level.

**`places.json` moves up to `<bee-atlas>`.** `<bee-pane>` receives place options as a
property like every other option list, which is what the state-ownership invariant asked
for in the first place.

**`inputmode="numeric"` goes.** ADR 0021 predicted this ("it will, when search grows to
names") and pre-decided the consequence: keep the submit button anyway, because on touch
a visible tap target beats a keyboard convention.

**Search on the static pages is still a named gap.** Nothing here changes
`searchEnabled`, and the `/index.html?q=…` alternative ADR 0021 filed stays filed.
