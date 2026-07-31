# ADR 0020: A label-number lookup is a selection, and an active filter yields to it

**Status:** Accepted (implemented 2026-07-31; issue beeatlas-8zs)

---

## Context

A curator holding a physical specimen reads a number off its label —
`WSDA_2303966` — and wants that record on screen. Until now the only route was to
open the map or table and construct a filter that happened to contain it, which is
slow, and non-obvious enough that nobody did it.

The data was never the problem. `catalog_number` is a contracted column on
`marts/occurrences`, already carried into the client's `OccurrenceRow`. The corpus
is uniform: every catalogued row is `WSDA_<7-or-8 digits>`, one prefix throughout,
and the digit suffixes are 1:1 with `catalog_number` — 46,090 distinct suffixes over
46,090 distinct catalog numbers, no collisions. A bare integer names exactly one
record, and every one of them has coordinates. So this was an entry-point problem.

Two things had to be decided: what *kind* of state a resolved number produces, and
what happens when the answer is a record the current view excludes.

## Decision

**The lookup produces a SELECTION, and when an active filter would hide the
resolved record, the filter is cleared.**

### 1. Selection, not filter

Phase 999.8 drew the line the codebase still holds: a bounding box is a *filter*
(`FilterState.bounds`), an individual record is a *selection* (`selectedOccIds`). A
label number names one record, so it selects. Concretely: `<bee-pane>` emits
`catalog-lookup`, `<bee-atlas>` resolves the number to an `occ_id` and opens the
same detail card a map click would.

The alternative — a `catalogNumber` field on `FilterState` — was rejected on both
meaning and cost. Meaning: "show only this record" is not a view of the data, it is
a pointer at one row, and a filter that always returns exactly one thing is a
selection wearing the wrong hat. Cost: every filter dimension is a REQUIRED
`FilterState` field, so adding one means touching every literal in the codebase, the
URL codec, `isFilterActive`, and the CSV filename builder — for a control that would
never combine with any other filter anyway.

### 2. The filter yields when it would hide the answer

`queryListPage` intersects the selection with the active filter, which is right for
a map click (you can only click what is drawn) and wrong here: the user reached past
the view to name a record directly. Left alone, a Bombus filter plus a lookup of a
*Lasioglossum* label would show "1 selected" over an empty card, and no point on the
map — a dead end whose cause is invisible.

So the lookup resolves **corpus-wide**, and reports back whether the active filter
admits the match. If it does not, `<bee-atlas>` resets `_filterState` to
`emptyFilterState()` and the specimen is reachable. A filter that already admits the
record is left untouched, so a curator working inside a collector or county filter
keeps it.

Rejected: *report "found, but hidden by your filters" and stop* — honest, but it
fails the one-step criterion the issue exists to satisfy, and it puts the burden of
a state conflict on the user. Also rejected: *resolve only within the filter*, which
answers "no specimen with that number" about a number that is demonstrably in the
corpus. The filter is a browsing aid; the label number is an assertion about a
physical object in the user's hand. The assertion wins, and the previous filter is
one Back press away in history.

### 3. The match is the trailing digit run

The pipeline already has an identity notion for this — `regexp_extract(
catalog_number, '[0-9]+$', 0)`, which is how specimens join to iNat's WABA
catalog-suffix field (`int_ecdysis_catalog_suffixes.sql`,
`int_ecdysis_base.sql:42`). The client matches the same thing, but wa-sqlite ships
no `REGEXP`, so it is spelled in string arithmetic: the last *n* characters equal
the typed digits, **and** the character before them is not a digit. The second
clause is the whole point — a bare `LIKE '%2303966'` also matches `WSDA_12303966`.
No such pair exists in the corpus today, which is precisely why the guard needs a
test rather than a coincidence.

A bare integer is deliberately **not** overloaded to also mean `ecdysis:<n>`.
`ecdysis_id` and catalog suffix are different numbers over overlapping ranges;
conflating them would resolve silently to a real but wrong specimen.

## Consequences

**It works offline for free, and that is structural, not lucky.** The lookup runs
against the same client-side wa-sqlite store the list query uses — verified in UAT
to issue zero network requests. The read path stays 100% static; there is no lookup
endpoint to add later.

**The clear is visible, not silent.** Clearing the filter empties the taxon and
collector inputs the user can see, drops the chips, and rewrites the URL — the state
change announces itself in the same surface that caused it.

**One shared empty-filter factory now exists.** `emptyFilterState()` in
`src/filter.ts` replaced the two byte-identical literals in `bee-atlas.ts` and
`bee-map.ts`. Adding a filter dimension still means adding a required field, but the
number of literals that must grow it in the same commit is now one.

**Scope held to the catalog suffix.** `fieldNumber` is not searchable this way, and
no other identifier is. Revisit if users ask.
