---
name: Comparative photo browse by label
description: Browse one labelled view across many taxa — wing venation for every genus side by side, abdominal hairs across a subgenus — using the curation label vocabulary
type: project
trigger_condition: When species photos carry view/part labels from curation, and enough taxa have a labelled photo for a given view to make a grid worth showing
planted_date: 2026-08-08
---

Species pages answer "what does *this* bee look like". They cannot answer the question a
person actually has in front of a specimen: **"how does this differ from its neighbours?"**

Peter, 2026-08-08: *"those same labels should be available in species browse pages … so you
can, say, show wing venation for every genus one next to the other, or abdominal hairs for
each species in a subgenus next to one another."*

That is a browsing mode nothing else offers. iNaturalist shows many photos of one taxon;
keys show drawings of characters; neither shows **one character across many taxa, from real
photographs of the local fauna**.

## Why this rides on curation rather than preceding it

The labels come from [species photo curation](species-photo-curation.md). This feature is
the reason to invest in them beyond picking three photos:

- Choosing photos needs labels to be *roughly* right — a wrong filter costs a scroll.
- A comparative grid needs labels to mean **the same thing across taxa**. "Wing venation,
  traceable" travels between *Andrena* and *Nomada*; "good photo" does not.

So the grid is what disciplines the vocabulary. A label that cannot be compared across taxa
is not pulling its weight.

## Shape

- Pick a **view or character** (wing venation, face, dorsal habitus, scutellum) and a
  **taxonomic scope** (all genera; species within one subgenus; a place's checklist).
- Render a grid: one photo per taxon, same character, captioned with the taxon and the
  photographer.
- Curator notes travel with the photo — "note the appressed hairs on T4" is exactly the
  caption a comparative grid wants, and it is written by someone who knows the group.

## What already exists

- Part-visibility scoring is measured and works (Spearman 0.70 against expert judgement,
  98% within-one) — so "which photos show the wing well enough to compare" is computable
  today. See `scripts/photo-pipeline/`.
- **Camera angle is not** (46% against a 32% baseline). A grid of "lateral view across a
  subgenus" needs angle labels, and today those must come from curators. A grid of "wing
  venation across a genus" does not, and is buildable from what we can already measure.
  That asymmetry suggests which grid to build first.

## Open questions

- Is the unit a **character** (venation, punctation, T4 hairs) or a **view** (lateral,
  frontal)? Peter's examples mix both, and they behave differently: views are properties of
  the photograph, characters are properties of the animal that a photograph may or may not
  reveal.
- What happens where a taxon has no photo with that label — omit, or show the gap? Showing
  gaps is honest and doubles as a curation worklist.
- Does this belong on genus/subgenus pages (a grid of children), on a standalone browse
  surface, or both?

## Related

- **species-photo-curation.md** — the seed this depends on; same vocabulary, same labels.
- **beeatlas-g9f** — label vocabulary and the angle measurement.
- **beeatlas-ceh** — the species page photo gallery this would sit alongside.
