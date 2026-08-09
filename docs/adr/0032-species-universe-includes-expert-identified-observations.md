# 0032 — The species universe includes expert-identified observations

Date: 2026-08-08
Status: Accepted
Issue: beeatlas-3ed

## Context

`int_species_universe` built taxon rows from a FULL OUTER JOIN of exactly two
arms: checklist species (Bartholomew et al. 2024) and Ecdysis occurrence
aggregates. iNat expert observations (the `inat_expert` arm of `int_combined`)
entered only as a LEFT-JOINed count — they could decorate an existing row but
never create one.

Consequence: a taxon documented only by expert-identified iNat observations was
invisible on the site, however well determined. Measured against
occurrences.parquet: 56 bee taxa, ~3,965 records —

- 41 single-word taxa (mostly subgenus-rank determinations: pyrobombus 1,897,
  dialictus 605, zadontomerus 466, …; plus the genera Neolarra and
  Epimelissodes) — these are precisely the photo-hard groups where genus or
  subgenus is the *terminal* determination, so they can never acquire a
  specimen-backed species row;
- 15 binomials (Triepeolus verbesinae, Nomada vegana, Lasioglossum
  aspilurum, …) — real species with expert determinations and no specimen.

This was the third filter found in one week excluding exactly the material it
most needed (with beeatlas-an8's record_type filter and the research-grade
photo filter).

## Decision

1. **The iNat expert observation aggregate is a third arm of the species
   universe FULL OUTER JOIN.** No new selection and no new class of
   observation: it is the same `inat_obs_data.observations` source (roster
   filter on who identified, occurrence synonymy applied) that already fed
   `inat_obs_count`. The existing bee-family gate is the contamination
   filter: non-bee occurrences riding the inat_expert arm resolve to a
   non-bee family (or none) and never enter the universe. Lineage backfill
   via the taxon bridge places single-word subgenus names under their parent
   genus (dialictus → Lasioglossum/Dialictus) — verified: all 56 taxa resolve
   with bee families.

2. **iNat observation dates feed `first/last_occurrence_date` and
   `month_histogram`, site-wide.** The flight-season histogram is now the
   element-wise sum of all three arms (ecdysis + checklist + iNat), so
   existing species' seasonality bars change too. "All evidence" beats a
   histogram whose meaning varies by page; seasonality.json (built from
   occurrences.parquet) already included the iNat arm, so this also removes
   an inconsistency between the two seasonality sources.

3. **No new display class.** iNat-only taxa are ordinary rows whose records
   happen to all be one existing record_type. Pages convey the evidence
   basis through the counts they already render ("0 specimens · 6 community
   observations"); the genus/subgenus display filters widen from
   `occurrence_count > 0` to include `inat_obs_count > 0`, matching the
   `isMapped` predicate that already governed swatch colors. A side effect
   that is really a correction: checklist species that also have iNat
   observations (the Chelostoma phaceliae case documented in
   `_data/species.js`) move from the "checklist-only" bucket to the record-
   bearing list, and genus/subgenus "records" totals now count Ecdysis +
   iNat records — the same sum the species page always used for its "View N
   records on the atlas" link.

## Rejected alternatives

- **A "photograph-based taxon" display category** (caption/bucket parallel to
  checklist-only). Rejected as inventing a class the domain model already
  expresses per record; the checklist-only analogy would also *understate*
  the evidence, since these records plot on the map with dates and
  coordinates.
- **≥N independent identifications at the queried rank as an ingestion
  filter.** Proposed on the issue, but that rule concerns *photo selection*
  for higher-rank pages (replacing quality_grade=research, which is
  structurally unattainable for terminal genus-level IDs). It is filed
  separately against the photo-pipeline; the universe uses the existing
  roster-filtered arm as-is.
- **Rolling subgenus-rank determinations up to their genus.** They stay as
  their own rows: lineage backfill files them under the right genus and
  subgenus, where they roll into existing genus/subgenus pages as the
  established "Genus sp." unresolved entries.

## Deployment note

species.json/species.parquet grow ~630 → 683 rows (+8.4%), outside the
integration gate's +5% band. The first nightly after this lands needs the
documented one-time `SKIP_INTEGRATION_GATE=1` (same procedure as the
occurrences-contract release sequence). The frontend changes are
backward-compatible with the published species.json, so code can ship first.
