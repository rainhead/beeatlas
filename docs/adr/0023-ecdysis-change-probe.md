# ADR 0023: The Ecdysis loader asks whether the source moved before paying to rebuild it

**Status:** Accepted (implemented 2026-07-23 – 2026-07-31; issues beeatlas-29j, beeatlas-u15, stelis st-8bj)

---

## Context

`load_ecdysis` pulls dataset 44 as a bulk Symbiota ZIP, and the server builds that ZIP
on demand: ~2 minutes, the single dominant cost in the nightly. An mtime TTL
(`ECDYSIS_CACHE_TTL_SECONDS`, 6h) already spared same-day dev iteration, but the nightly
runs every 24h and so was always past it — it paid the full build every night, whether
or not a single record had changed.

The Symbiota download UI exposes no high-water-mark, so there was nothing to ask. But
Ecdysis's **v2 REST API** does, unauthenticated.

The stakes are asymmetric, and that asymmetry drives everything below. Skipping a
download that should have happened means the site serves a day-stale dataset —
recoverable, invisible, and therefore dangerous. Downloading when we needn't have costs
two minutes. So every ambiguity must resolve to "download".

## Decision

**Before paying for the ZIP, ask the v2 API two cheap questions about the same
population**, and reuse the cached ZIP only if neither answer moved.

- **total count** — catches deletions and net membership changes.
- **modified-since count** — catches adds and edits, via `dateLastModified`.

Scoped by `datasetID`, **not `collid`**: dataset 44 is a 46,090-record subset of WSUC
collection 164 (106,870), so a collection-scoped query would probe a different
population than the ZIP pulls. Confirmed empirically rather than assumed — the cached
ZIP's `occurrences.tab` has exactly 46,090 data rows, matching the API's `datasetID=44`
count, so the download POST's `taxontype`/`usethes`/`taxonFilterCode` params do not
narrow it further.

The baseline both signals compare against is a JSON sidecar beside the cached ZIP
(`44.probe.json`), recorded at download time. Three details in it are load-bearing:

**The modified-since baseline is the live count, not zero.** Every record already inside
the window is captured in the fresh ZIP, so "changed" means the count *grew past* this
number.

**`since` is backed off one day.** Day-boundary and timezone skew between us and the
server must never push a concurrent edit below the min bound.

**It is read BEFORE the download, and written only if that download succeeds.** The ZIP
build takes ~2 minutes; a record inserted during that window may or may not have made it
into the ZIP. Reading the signals first makes such a record read as *changed* on the next
run whichever way it went — the worst case becomes a redundant download rather than a
record the probe hides indefinitely. Withholding the write on failure matters just as
much: a failed download returns the *old* cached ZIP, and stamping a baseline that
describes the current source would licence skipping forever against a cache that never
caught up.

**The decision turns on equality, not growth.** Records deleted from inside the `since`
window shrink the count below the baseline; a shrunken count is still a change. Only the
*reported* quantity is clamped at zero, because "minus two records new" is nonsense to
report.

### What the probe tells Stelis

A `'boundary` loader that short-circuits never touches its outputs, so Stelis's output
comparison can only ever conclude "identical" — it cannot say *why*, and the skip would
otherwise be the loader reusing a cache behind Stelis's back.

So the loader reports for itself, via the cross-repo receipt contract Stelis defines
(stelis `st-8bj`): Stelis sets `STELIS_BOUNDARY_RECEIPT` on every boundary run, clears
any stale receipt first, and reads back
`{"unchanged": bool, "records": int|null, "since": string|null}` after a clean exit.
`--why`/`--explain` then surface "source unchanged, 0 records since \<date\>" as a
first-class build fact.

Silence is a valid answer, and deliberately so: no env var (run by hand) or no
conclusion (no baseline, API down) writes nothing, which Stelis reads as "the loader said
nothing" rather than an error. We report on the *changed* path too, so a real re-ingest
is distinguishable from a loader that never probed at all.

### Accepted blind spots

All three are rare, and all heal on the next full pull:

- A **re-edit of a record already inside the `since` window** — its `dateLastModified`
  stays `>= since`, so the count doesn't move. The window is only ~1 day wide.
- A **compensating replace** (N deleted + N inserted, total flat) whose inserts carry
  back-dated `dateLastModified`.
- Not a blind spot but worth naming: the probe says nothing about whether *our copy* is
  readable, so a matching baseline never resurrects a corrupt ZIP — validity is checked
  independently.

## Consequences

The nightly's ecdysis stage drops from 90–115s to ~58s on a day the source hasn't moved.
Verified in production 2026-07-31: the probe skipped, the reused ZIP loaded cleanly
(`LOADED`, no failed jobs), and Stelis independently confirmed the outputs identical.

Two escape hatches, at different altitudes. `ECDYSIS_CACHE_TTL_SECONDS=0` forces a
refetch. `ECDYSIS_SKIP_PROBE=0` reverts to download-every-time-past-TTL **and makes no
v2-API calls at all** — the switch would be reached for precisely when the API is what's
misbehaving, so a "revert" that kept querying it would be useless.

## Alternatives rejected

**`dateLastModifiedMin` alone.** Returns HTTP 500 — a loose `whereRaw` binding in
Ecdysis's `OccurrenceController.php:461` (verified live 2026-07-23). Every probe query
therefore pairs the min bound with a far-future max, turning it into a plain
"modified since" filter. This is a workaround for an upstream bug, not a design choice;
it lives in one function so there is a single home for that knowledge.

**The `dwcapubhandler` timestamp.** Its `IFNULL(modified, datelastmodified)` filter is
*staler* than the v2 API's `dateLastModified`, so the API is the correct source.

**Reading the baseline after the download.** Simpler, and wrong — see above.

**A `records`-quantified answer on the total-moved path.** Would cost a second query to
quantify a question already answered; the contract permits `records: null`, so we
short-circuit instead.
