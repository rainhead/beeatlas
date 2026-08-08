---
name: Species photo curation as an expert feature
description: Curators choose and annotate species photos on the site; automatic selection fills gaps and proposes candidates; label vocabulary drives both curation filters and comparative browsing
type: project
trigger_condition: When the write layer has an expert/curator role, and automatic photo scoring is in the seeder rather than in scratch tooling
planted_date: 2026-08-08
---

Which photos belong on a `/species/…` page is not a problem that gets solved once. It is
open-ended in two ways at the same time, and conflating them is what made the first attempts
fail.

**Mechanically** open-ended: new observations arrive, licenses change, better photos of a
species appear. Any selection is provisional.

**Epistemically** open-ended, which matters more: *we are still learning what makes a good
photo* — for a particular species, for a group, and in general. Peter's own preferences
sharpened over a single afternoon of review (from "biggest bee in frame" toward "shows the
most body parts", and from "oblique is a last resort" to "oblique is often the most useful
single view"). A system that treats photo choice as a fixed objective will encode whatever
we believed on the day it was written.

So the design goal is not a better algorithm. It is **a loop**: curators decide, the system
records what they did *and why*, and that record improves the automatic proposals.

## The shape

- **Automatic selection fills where nobody has curated.** 630 species is far more than any
  volunteer will hand-pick. Machine selection is the floor, not the ceiling, and it must
  never overwrite curation (the marker already exists — ADR 0031 §4, respected by
  `scripts/photo-pipeline/apply-swaps.mjs`).
- **Automatic selection proposes to curators.** The expensive part of curation is not
  deciding, it is *finding* — the pool for one species can be hundreds of licensed photos
  across dozens of observations. Ranked, labelled candidates turn hours into minutes.
  Measured: for *Osmia montana*, 79 candidates across 27 observations, of which the seeder
  could see 19 observations and took one photo from each.
- **Labels are the filter, not the output.** A curator wants "show me the wing venation
  shots", "show me faces". The labels earn their place by making a large pool navigable —
  which is a lower accuracy bar than labelling shipped photos, because a wrong filter costs
  a scroll rather than a false claim on a public page.
- **Curators write publicly visible notes.** "Note the appressed hairs on T4." This is the
  half of the value no automatic system produces: it says *why this photo*, in the voice of
  someone who knows the group. It also converts a reference photo into a teaching one.
- **Every change is recorded with its reason.** Not just the diff — the rationale. That
  corpus is the training signal for better proposals, and it is the only honest evaluation
  set for whether the automatic side is improving.

## What we already know works, and what does not

Measured 2026-08-08 against blind human labels (see beeatlas-g9f, beeatlas-ekk):

| signal | result |
|---|---|
| part visibility, 0–3 per part | 98% within-one agreement, Spearman **0.70** against Peter's judgement — beats subject fraction's 0.52 |
| wing venation traceable | +22 to +24 points over baseline, stable across opposite prompts, conservative |
| bee localization / subject fraction | reliable; ~0.3% miss rate over 1,070 photos |
| **camera angle** (dorsal/lateral/…) | **46% against a 32% baseline — does not work.** Two opposite prompts each collapsed ~90% of photos into whichever class the prompt emphasised. Prompt wording is not the lever. |

That last row is the important one for this feature: **three of the four slate views Peter
named (lateral habitus, dorsal habitus, frontal) are angle-defined, and angle is the part
machines cannot currently do.** Either curators supply the angle labels — which is a good
use of a curator, and cheap once the candidate is already in front of them — or the
vocabulary shifts toward what is measurable (parts visible, venation traceable), or a
future model does better and the harness (`scripts/photo-pipeline/score-views.mjs`) is
there to re-measure it in minutes.

## The label vocabulary is shared with browsing

Peter, on a roll: the same labels should drive **comparative browse pages**. Show wing
venation for every genus side by side; show abdominal hairs for each species in a subgenus
next to one another. That is a different feature, but it is the *same vocabulary and the
same annotations*, and it changes the value calculation: labels that would be marginal for
picking three photos become the substrate for a browsing mode that nothing else offers.

It also sharpens what the labels must be. A comparative grid needs labels that mean the
same thing across taxa — "wing venation, traceable" travels; "good photo" does not.

## Rank matters, and the objective changes with it

- **Species page** — the question is *can you see every part*. Part coverage answers it.
- **Genus or subgenus page** — the question is *can you see the range*. Coverage is wrong
  here: three photos reaching full part coverage may be three photos of one species
  standing in for a genus. iNat shows a 3×3 grid for subgenus and higher for this reason.
  `canonical_name` is already on every scored candidate, so "maximise distinct species" is
  computable today.

This matters more than it looks, because **the taxa most likely to need higher-rank pages
are the ones where identification terminates above species** — *Dialictus*, *Melanosmia*,
*Eumelissodes*, *Seladonia*, *Neolarra*. For those, a genus page is not a fallback; it is
the correct destination, and saying so is informative rather than apologetic
(see beeatlas-3ed).

## The tension underneath

Peter, 2026-08-08: *"all WABA specimens show up on the map. If people collected flies or
wasps, that's data. This is the tension showing between beeatlas.net as a tool to support
volunteer activity, and beeatlas.net as a public atlas of Washington bees."*

This is adjacent to the two halves ([two-halves.md](../two-halves.md)) but not identical.
The two halves divide *surfaces* — retrospective reference versus prospective personal
work. This divides the *same record*: a fly a volunteer collected is a genuine contribution
on the work surface and noise on the learning surface. Neither treatment is wrong; they are
answers to different questions about one row.

It surfaced concretely here twice. A candidate pull built from `occurrences.parquet`
included `diptera`, `hymenoptera` at order rank, and several wasp genera — junk for a bee
atlas, real data for a volunteer's contribution record. And 39 bee taxa carrying 1,117
candidate photos have no page at all, because the species universe is built from Ecdysis
specimen records; a bee documented only by photographs is invisible.

Curation is where this tension has to be resolved rather than deferred, because a curator
is explicitly acting for the *public atlas* reading. The volunteer's record stays whole; the
species page shows what a reader needs.

## Related

- **beeatlas-6oh** — interactive species photo curation (add, remove, reorder). This seed is
  the shape that epic grows into once labels and proposals exist.
- **beeatlas-ekk** — selection ranks by faves; the coverage objective that replaces it.
- **beeatlas-an8** — tier 1 excludes the ecdysis specimen arm.
- **beeatlas-3ed** — taxa known only from iNat observations get no page.
- **beeatlas-g9f** — the label vocabulary, and the angle measurement that failed.
- **ADR 0031** — a species photo is a reference, not a prize. Still the governing decision;
  this seed extends it from *how photos are chosen* to *who chooses and how we learn*.
