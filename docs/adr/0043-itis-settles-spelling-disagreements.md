# 0043 — ITIS settles spelling disagreements between name sources

Date: 2026-10-16
Status: Accepted
Related: [ADR 0030](0030-what-a-species-is-vs-what-to-ask-inat.md) (our synonymy is a curatorial call, separate from iNat's), [ADR 0032](0032-species-universe-includes-expert-identified-observations.md) (expert iNat observations are an arm of the species universe)

## Context

Every join in the pipeline is on the species **name**, after synonyms are applied (ADR 0030). A name spelled two ways is therefore two species, whatever taxon ID either spelling resolves to.

The commonest cause is Latin gender agreement. When a species moves between genera, an adjectival epithet changes its ending to match the new genus: Cockerell described *Halictus aspilurus*, and in the neuter *Lasioglossum* it becomes *L. aspilurum*. Whether an epithet is an adjective (which changes) or a noun (which does not) is a judgement call, and our sources make it differently. Ecdysis determinations and the WA checklist often keep the original ending. iNaturalist, GBIF, Bee-Gap and Fowler's host-plant list each make their own choices.

An audit on 2026-10-16 found 19 such names in WA species. In the worst case, *Lasioglossum aspilurum*, the species page counted the 11 Ecdysis specimens filed as *aspilurus* and dropped the 8 expert-identified iNat observations filed as *aspilurum*, along with their photos and their Bee-Gap nesting record. Five other species had two pages each (*L. zephyrus*, *L. zonulus*, *L. allonotus*, *Melissodes semilupinus*, *M. metenuus*). Several more lost their traits because Bee-Gap or Fowler spelled them differently from the checklist.

The sources do not agree with each other, so no single source's spelling can be adopted wholesale:

| name | ITIS | iNat | GBIF |
|---|---|---|---|
| *L. aspilurum* | aspilurum | aspilurum | aspilurum |
| *L. zephyrus* | zephyrus | zephyrus | zephyrum |
| *L. heterorhinus* | heterorhinus | heterorhinum | heterorhinum |
| *L. allonotus* | allonotus | both, as two active species | allonotum |

## Decision

**When our sources spell one species differently, the name ITIS marks valid is the one we keep.** Each other spelling becomes a row in [`occurrence_synonyms.csv`](../../data/dbt/seeds/occurrence_synonyms.csv) that cites the ITIS TSN. That seed already feeds every arm of `int_combined`, the checklist staging model, and the trait and host-plant joins, so one row repairs the species row, the occurrence counts, the seasonality, the photos and the traits together.

ITIS is chosen because it records a verdict on each spelling, valid or invalid with a pointer to the valid name, rather than only a preferred form. It is also the authority the project already cites, in `curated_taxon_ids.csv` for *Osmia phaceliae*.

Where ITIS is out of date on the genus, the spelling follows the genus we use. ITIS still files *Epimelissodes obliqua* under *Svastra*. Under *Epimelissodes*, which we and iNat use, the epithet is *obliquus*.

The photo manifest (`content/species-photos.toml`) is keyed by the kept name. When two entries are merged, curator-chosen photos go first.

## Consequences

- A species page's URL follows the kept name, so the old URL for a folded spelling stops resolving. The curator decided not to keep redirects.
- A new source can bring back a variant spelling. When a species page looks thin, or a source's traits fail to join, look for a second spelling of the same epithet first.
- iNat taxon IDs still come from iNat for the kept name. *L. allonotus* now resolves to iNat 1588473, not to iNat's duplicate *allonotum* taxon 1447898.

## Rejected alternatives

- **Follow iNat's spelling.** It is where most of our records come from, but iNat holds duplicate taxa for some of these names (*allonotum* and *allonotus*), and it disagrees with ITIS on others.
- **Follow GBIF's backbone.** GBIF consistently prefers the neuter ending in *Lasioglossum*, including for epithets ITIS treats as nouns.
- **Match names on their stems, ignoring the ending.** This would merge real, distinct species: *Andrena nigra* and *A. nigrae* are both valid.
