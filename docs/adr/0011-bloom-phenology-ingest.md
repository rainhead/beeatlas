# ADR 0011: Bloom-Phenology Ingest — Sampled, Dual-Cadence, Static Aggregates

**Status:** Proposed (design; activation grill 2026-07-05)

---

## Context

The activation surface ("where should a new volunteer collect?") needs a per-place
*when-to-go* signal. Bee-collection dates alone are too sparse and collector-biased, and
they only exist where bees were already collected — exactly *not* the newcomer's frontier.
The robust signal is **angiosperm bloom timing**, which iNaturalist supplies indirectly:
plant observations are dense, and the distribution of `observed_on` across the year
approximates a taxon's bloom window. (The explicit Flowers/Fruits annotation, `term_id=12`,
is too sparsely assigned to depend on.)

The raw data is intractable to crawl exhaustively — WA has millions of plant observations,
and the API caps at 60 req/min, 200/page, and 10,000 records per query. The read path is
also **static-hosting only** (see [CLAUDE.md](../../CLAUDE.md) Constraints); we cannot serve
raw observations.

## Decision

**Ingest bloom phenology by random sampling, aggregate on `maderas`, publish static JSON,
and split it into two signals at two cadences.**

- **Sampling, not exhaustion.** To recover a taxon's bloom-timing *shape* we draw a few
  hundred observations via `sort=random` (confirmed supported by the iNat ES backend) and
  histogram their `observed_on`. A representative sample reproduces the seasonal
  distribution without paginating the full set. **Exhaustive fetch is the fallback for
  low-volume (rare/endemic) taxa**, where sampling would miss presence entirely.
- **Scope:** all angiosperms per place *plus* the full **target-host** set (curated +
  WA-endemic + specialist-bee hosts; see [CONTEXT.md](../../CONTEXT.md)). One dataset, two
  orientations: place-centric ("what blooms here, when") and host-centric ("where/when is
  this target plant, per county").
- **Location:** bounding-box query per place/county, then filter points against the exact
  polygon in DuckDB. Obscured coordinates add tolerable noise for showy angiosperms.
- **Two signals / two cadences:**
  - **Climatology** (slow) — the multi-year "typically blooms late May here" curve.
    Refreshed **monthly**, on its own script **decoupled from the nightly pipeline** (the
    heavy sampling crawl stays off the critical path). Grain: `place × week` and
    `target-host × county × week`.
  - **Nowcast** (fast) — a live "**blooming now**" flag. Scoped to **target hosts only**,
    growing-season-gated, a cheap recent-window (`d1` ≈ last 2 weeks) query that rides the
    **nightly** pipeline. This is the activation liveness hook.
- **Output:** static aggregate JSON (`place → bloom curves`, `target-host → county → curve`,
  plus current nowcast flags), consistent with the static read path.

## Considered Options

- **Exhaustive crawl of all WA plant observations** — rejected: intractable against API
  limits, and most of the volume is generalist noise a collector doesn't want. Sampling
  gives the same timing shape for a fraction of the requests.
- **Fold bloom into the nightly pipeline** — rejected for the climatology: it's a slow
  multi-year climatology, so nightly re-crawling wastes the API budget on the critical path.
  Only the cheap nowcast rides nightly.
- **Target-hosts-only ingest** (no all-angiosperm base) — rejected: the broad base
  future-proofs the place-centric view so places light up even for plants nobody has flagged
  as a target yet. Target hosts are the highlighted subset, not the whole dataset.
- **Depend on the Flowers/Fruits annotation** — rejected: too sparsely assigned; observation
  timing of showy angiosperms is the more reliable bloom proxy, with the annotation used only
  to sharpen the nowcast where present.

## Consequences

- Bloom timing on place pages can be **stale relative to the bee data** (monthly vs nightly);
  the nowcast flag is what carries freshness. This is deliberate.
- Random sampling yields reliable **timing** but not exhaustive **presence** — hence the
  exhaustive fallback for rare taxa; a rare host with few WA observations must not be silently
  dropped.
- A new external dependency on iNat's `sort=random` behavior; note it is not re-seeded across
  requests, so drawing genuinely different samples requires varying a seed.
- Phase 1 of the surface (place-page enrichment from existing occurrence data — `beeatlas-cyv`)
  ships *before* any of this, with no new ingest.
