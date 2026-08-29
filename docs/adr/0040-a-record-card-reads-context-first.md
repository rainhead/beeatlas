# 0040 — A record card reads context first, and there is only one card

Date: 2026-08-27
Status: Accepted
Issues: beeatlas-1jk5

## Context

`<bee-occurrence-detail>` renders six kinds of record. The specimen path groups
by date, then collector, then lists species. The other five — sample-only,
provisional, awaiting-catalogue, community observation, checklist — each had
their own render method, and each chose its own line order:

| variant | order as written |
| --- | --- |
| sample-only | date · observer · host · count |
| provisional | **determination** · date · observer · count |
| awaiting-catalogue | **determination** · date · observer · provenance |
| community observation | **determination** · date · observer · host · photo |
| checklist | **determination** · observer · date · locality · count · provenance |

Nothing enforced agreement, so there was none: three led with the determination,
two with the date, and the checklist card put the observer above the date for no
reason anyone recorded. The divergence was invisible while each state had to be
found by driving the app; putting all of them on one page (ADR 0039) made it
obvious at a glance.

## Decision

**Order is a property of the card, not of the record type.** One
`_renderRecordCard` owns it; the five variants supply slots — `determination`,
`attribution`, `extras` — and choose nothing about arrangement.

**The order is context first: WHEN and WHERE, then WHO, then WHAT, then what
qualifies it.**

A record's identity is the collecting event. The determination is a *claim*
about that event — one that changes when a specimen is re-determined, while the
event does not. Leading with the claim inverts that, and it read especially
badly in a list, where the eye wants the shared context once and the varying
part beneath it. The specimen path already read this way; now everything does.

Two consequences of the same principle:

- **A place rides the date line of the group it belongs to** — computed per
  date group, not per list. The date line speaks for the records under it and no
  further: a list spanning two ecoregions shares nothing overall, but each group
  still sits in one place. A standalone card is its own group, so its places are
  always on its date line and it never shows a chip.
- **"no host" is gone.** It appeared on the majority of specimen lines —
  `Osmia lignaria · no host` — spending the longest phrase on the line to say
  nothing. Absence reads as absence. The quality badge survives a missing host,
  because it qualifies the observation, not the plant.

## Amendment, same day — attribution has one source too

The first bug the unified card surfaced was the same defect one slot down. Each
variant reached for its own person column: `user_login` for community
observations, `host_inat_login` for samples, `recordedBy` for checklist. The
`waba_specimen` arm sets `user_login` to NULL, so all 54 of those records named
nobody on screen — while `marts/occurrences` had the answer the whole time.

`collector_inat_login` IS that answer: a host-first
`COALESCE(host_inat_login, specimen_inat_login, user_login)` computed once in
`int_combined` (2026-06-24, host-first since 2026-06-28) precisely so the arms
cannot disagree. The frontend simply never selected it.

**Every card attributes through `collectorLabel(row)`** (`src/occurrence.ts`):
`recordedBy` when present — a name as the collector wrote it beats a handle —
otherwise `@` + `collector_inat_login`, otherwise null, which the caller renders
as "unknown" rather than inventing an attribution. The specimen path groups on
the same label, so records known only by login stop collapsing into one
"unknown" heap (~4,900 of them).

`collector_inat_login` is SELECTed through a `pragma_table_info` probe, the
shape `elevation_dem_m` established: on a cached DB predating the column it is
selected as `NULL`, so the row keeps its shape and attribution degrades to
`recordedBy` instead of emptying the sidebar with "no such column".

Still open: `@mylodon` is a handle where a name would read better. The
login→display-name resolution already exists for collector pages and note
bylines; wiring it in means passing that map down to the presenter, and is
tracked separately (beeatlas-8a7r) rather than smuggled into this change.

## Rejected alternatives

- **Keep five renderers, add a lint or a review checklist.** The drift was not
  caused by carelessness; it was caused by five places being allowed to differ.
- **Determination first, everywhere.** Defensible for a single card viewed
  alone, and wrong for the list the component actually renders: the determination
  is the varying part, and repeating context above each one is what the grouping
  already avoids.
- **A shared *layout* but per-variant ordering hooks.** That is the current
  situation with extra ceremony.

## Consequences

- A new record type supplies slots; it cannot invent an order.
- `src/tests/bee-occurrence-detail.test.ts` asserts the line order for every
  variant, and `/design/occurrence-detail.html` shows them stacked, where a
  disagreement is visible without reading any code.
- `.inat-id-label` became `.record-determination`: the class names a role in the
  card, not the source that happened to introduce it.
