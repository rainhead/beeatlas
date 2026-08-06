# ADR 0031: A species photo is a reference image, not a prize-winner

**Status:** Accepted (implemented 2026-08-06; issue beeatlas-zd7)

---

## Context

`content/species-photos.toml` was seeded once, by `scripts/seed-species-photos.mjs`,
under criteria that optimize for the wrong thing. The failure that exposed it: every
photo on the *Bombus fervidus* page came from **one** Illinois observation of a
strikingly unusual individual.

That is three independent defects wearing one coat.

**Faves select against typicality.** `order_by=votes` ranks by iNat faves. A bee gets
faved for being remarkable — an aberrant colour form, a dramatic composition. A
reference photo needs the opposite: the individual a person is most likely to be
holding. Ranking by faves is a selection pressure pointed directly away from that.

**One observation could eat the whole quota.** `extractPhotos` walked every photo
*within* an observation before advancing to the next, so a single observation carrying
three licensed photos filled all three slots. This was not an edge case: **276 of the
374 multi-photo species (74%)** drew every photo from one observation. Three angles on
one bee is one reference photo, repeated.

**Region preference had no floor.** The tiering was Washington, then *global*, with
nothing in between and no limit on how far afield it would reach. One thin WA result
and the next photo could come from anywhere on the continent.

Two further problems surfaced while fixing these, both of which had been silently
suppressing photos:

**A casing mismatch dropped 104 of 630 species.** The taxon-id map keys on
`COALESCE(checklist.scientificName, occurrences.canonical_name)`, so a checklist
species gets properly-cased `Bombus fervidus` while an occurrence-only species falls
back to the **lowercase** canonical name. `species.json` is properly cased throughout.
An exact-string lookup therefore missed 104 species — *Apis mellifera*, *Bombus
impatiens*, *Megachile rotundata*, and *Bombus fervidus* itself. They were recorded as
`no_taxon_id` and written as empty entries, which on a species page is indistinguishable
from "iNaturalist has no licensed photo of this bee". This is why the ADR 0030 override
alone would not have fixed fervidus.

**The obvious "prefer specimen observations" is a trap.** The issue proposed preferring
photos from our specimen arm. But a `specimen` row's `observation_id` is the **sample**
observation — the *flower* the bee was collected from. Seeding from it would put plant
photographs on bee species pages. The bee is on `specimen_observation_id`, carried by
the `inat_expert` and `waba_specimen` arms.

## Decision

**Select for the typical determinable individual from our region, by constraining the
pool rather than by changing what ranks within it.**

### 1. At most one photo per observation

Non-negotiable, and the single highest-value rule: it is what makes three photos mean
three bees. Later tiers exclude the observations earlier tiers already used, since the
regional tiers are nested.

### 2. Four region tiers, each consulted only if the ones above cannot fill the quota

| tier | source | why |
|---|---|---|
| 1 | our expert-vetted WA bee observations | an expert already put a name on it |
| 2 | iNat, Washington (46) | in-region, research-grade |
| 3 | iNat, PNW — OR (10), ID (22), BC (7085) | a PNW bee stands in for a WA one |
| 4 | iNat, global | last resort, not second resort |

Tier 1 draws on `specimen_observation_id` from the `inat_expert` / `waba_specimen`
arms — 28,890 observations covering 294 species, 198 of them with three or more. For
hard genera where research-grade community IDs are unreliable, this is a materially
better determination than iNat's own.

Tier 1 deliberately applies **no `quality_grade` filter**, unlike tiers 2–4. Research
grade means two agreeing community IDs; an expert determination carried by our own arms
is the stronger claim, so a `needs_id` observation here is still a determined bee.
Filtering on research grade would discard exactly the records this tier exists to reach.
One of the three shipped *B. fervidus* photos (obs 129186130, Wenatchee) is `needs_id`
for this reason.

### 3. `order_by=votes` is retained, deliberately

Faves reward the unusual individual — but they also reward focus, lighting, and framing,
and nothing else available does. The fix is to constrain *what votes ranks over* rather
than to abandon the quality signal: within an already-regional, vetted-first pool where
no single observation can dominate, votes selects for the best photograph among
ordinary local bees instead of for the most striking bee on the continent.

The evidence that this is sufficient: the three photos now chosen for *B. fervidus* are
Okanogan County, Richland, and Royal City — all Washington, all research-grade, with
**1, 1, and 3 faves**. The pathology was never votes alone.

### 4. `--reselect` overwrites machine-seeded entries, never curator-touched ones

`mergeFillOnly` never overwrites, so re-selection needs an explicit opt-in. D-01
("humans always win") survives it: an entry with a non-empty `description`, or a caption
on any photo, is skipped. The seeder only ever writes empty strings into both, so
anything non-empty came from a person. No entry was curator-touched at the time of this
re-selection — the manifest was entirely machine-seeded — but the rule has to hold for
the next run.

### 5. Curator comments are harvested and put back, because `description` is not the
### only place people write

The re-selection run deleted the file's only piece of human reasoning: a five-line
comment above the orphan `Agapostemon texanus` entry, explaining that its
`validate-species` warning is expected and that the entry was **left as-is pending a
curation call**. `isCuratorTouched` did not protect it, and could not have —
`@iarna/toml` discards comments on parse, so they never reach the manifest object at
all. Every previous run would have destroyed them too; this was simply the first run
since anyone wrote one.

So comment blocks anchored above a `[species."NAME"]` header are lifted off the raw text
before the rewrite and reattached after it, on every write including checkpoints. A
comment whose species has left the manifest is reported rather than dropped.

The general lesson, which is the reason this is in the record at all: a "humans always
win" rule that inspects only the *parsed* structure will silently eat whatever the
parser discards. Ask what the parse drops before trusting the guard.

## Consequences

- Photo selection now costs up to 4 API calls per species instead of 2. At the ≥1 req/s
  floor (PHOTO-07) a full re-selection is roughly half an hour. It is a manual,
  out-of-CI operation, so this is a non-issue.
- **A swallowed HTTP 429 is indistinguishable from "no licensed photo"** — both yield an
  empty entry. A full `--reselect` must therefore be diffed against the previous
  manifest for species that *lost* all photos, rather than trusted on its exit code.
- Tier 1 depends on `public/data/occurrences.parquet`. Absent, it is skipped with a
  warning and selection starts at tier 2 rather than failing.
- The criteria live in the script's header comment, which is the thing a future editor
  actually reads; this record holds the reasoning and the rejected alternatives.

## Alternatives rejected

- **`order_by=random`.** Removes the aberrance pressure completely, and with it every
  signal of photographic quality. The median research-grade bee photo is a distant,
  blurry speck; a page full of them is worse than a page of striking-but-atypical bees.
- **Votes, sampled down the ranking** (take observations at ranks 1, 15, 30). Steps away
  from the faved tail while keeping some quality signal, but the stride is arbitrary and
  unjustifiable to a future reader. Constraining the pool achieves the same end with a
  rule that can be stated.
- **Prefer the specimen arm's `observation_id`.** What the issue literally proposed; it
  would seed flower photographs. See Context.
- **A curated hero photo per species.** The real answer for a few hundred flagship
  species, and not excluded by this — `--reselect` already protects curator-touched
  entries. It is not a substitute for making the automated path pick sane defaults for
  the long tail.
