# ADR 0030: What a species *is* and what we *ask iNat about* are two different taxon IDs

**Status:** Accepted (implemented 2026-08-06; issue beeatlas-vy3)

---

## Context

BeeAtlas applies its own synonymy. `occurrence_synonyms.csv` folds junior names into
accepted ones, and every arm of `int_combined` routes through `int_synonyms` before
re-resolving `taxon_id` from the post-synonymy name. That machinery works: folding
*Bombus californicus* into *B. fervidus* (commit f732dfe2) moved all 1,489 occurrences
onto one taxon and collapsed two species rows into one everywhere in the app.

iNaturalist does not share our synonymy. It keeps *californicus* (124420) and
*fervidus* (52774) as separate species under a **`Bombus fervidus` complex**
(1266534). Our fold is a curatorial call; theirs is a different one. Both are
defensible, and neither side is going to move.

Locally this costs nothing, because every join is on **name**, post-synonymy. The
cost appears the moment we send a `taxon_id` *out* to the iNat API. There,
`canonical_to_taxon_id` hands us the species-rank id for the accepted name — and that
id names only *part* of the concept we folded:

| taxon | WA research-grade observations |
|---|---|
| `1266534` *B. fervidus* **complex** | 1,254 |
| `52774` *B. fervidus* s.s. (what the bridge returns) | 198 |
| `124420` *B. californicus* | 1,055 |

Photo seeding queries 52774 and sees 16% of Washington's material. It finds too few
license-clean photos, falls through to its global top-up, and lands on an Illinois
observation — the failure that opened beeatlas-zd7. The bridge was not wrong; it was
answering a different question than the one being asked of it.

### The audit, and why the obvious rules are all wrong

61 of our 630 species sit inside an iNat complex. Two tempting general rules both
fail:

**"Prefer the parent complex."** Wrong for 60 of the 61. Most of these complexes are
hard-to-identify species *groups*, not merged concepts: *Nomada semisuavis* sits in a
`Nomada vegana` complex with 45 sibling species. A photo drawn from it could be any
of them.

**"Derive the query set from `occurrence_synonyms`."** Also wrong, and silently.
Expanding each accepted name to itself plus every name folded into it looks
principled, but *B. lapponicus* — which we fold into *B. sylvicola* because Nearctic
material under that name is sylvicola — resolves on iNat to a **six-species complex**
containing Palearctic *monticola*, *johanseni*, *glacialis* and *konradini*. The
derived rule would put European bumblebee photos on a Washington species page.

The two folds look identical in the seed file and mean opposite things. *californicus*
is "these are one species"; *lapponicus* is "that name means something else here."
No mechanical rule separates them, because the distinction is taxonomic judgment.

Checking the three real splits against Washington data confirms only one needs
anything:

| our species | iNat complex | WA: complex vs. narrow | verdict |
|---|---|---|---|
| *B. fervidus* | 1266534 (fervidus + californicus) | 1,254 vs. 198 | **complex matches our concept** |
| *A. subtilior* | 1581466 (subtilior + texanus) | 304 vs. 304 | narrow is right |

| *B. sylvicola* | 1653702 (+ 5 Palearctic spp.) | 20 vs. 20 | narrow is right |

For the latter two the complex adds nothing in Washington and adds *wrong* species
globally.

The *A. subtilior* row is not a numerical coincidence, which matters because a
coincidence could drift. **All PNW *Agapostemon texanus* are in fact *A. subtilior***
(Peter, 2026-08-06) — true texanus does not occur here, and iNat's own data agrees:
narrow texanus (1581468) has **zero** research-grade records in Washington and zero
across OR/ID/BC, against 858 subtilior over the same area. The complex can therefore
never hold a regional record the narrow species misses, so querying narrow subtilior is
correct by range rather than by luck.

## Decision

**Separate the two questions. `canonical_to_taxon_id` answers "what taxon is this
species"; a new `inat_query_taxa.csv` answers "what taxon do we ask iNat about", and
only where the two differ.**

### 1. A curated seed, not a derived one

`data/dbt/seeds/inat_query_taxa.csv` — `canonical_name, taxon_id, note` — with one
row today:

```
bombus fervidus,1266534,"Bombus fervidus complex … 52774 holds only 198 of
Washington's 1,254 research-grade complex records"
```

Absence means "use the bridge", so 629 of 630 species are untouched and the default
stays the safe one. A row is added only where our synonymy merges taxa iNat keeps
apart **and** the merged concept has a faithful iNat taxon. The `note` column carries
what it costs to get the row wrong, because a future reader will otherwise see a bare
integer and have no way to tell a considered choice from a typo.

The seed is read as raw CSV by `scripts/seed-species-photos.mjs`, not `ref()`'d — the
seeder runs against the ingestion schemas and must not require a dbt build.

### 2. The query taxon may be a complex; the identity taxon may not

This is the reason the two cannot share a column. `curated_taxon_ids.csv` feeds the
bridge, and the bridge's ids become occurrence `taxon_id`s and the taxa pane's tree.
Putting 1266534 there would file every fervidus occurrence under a complex and render
a complex as if it were a species. Nothing in `inat_query_taxa.csv` ever reaches an
occurrence.

### 3. The complex, not the enumerated pair

For fervidus we query 1266534 rather than `52774,124420`. The complex's membership
*is* our concept, and letting iNat maintain it means a future subspecies or
re-circumscription is picked up rather than silently missed. The tradeoff is accepted
deliberately: if iNat adds a child that we would *not* fold, it enters our photo pool
unreviewed. That is a live risk for exactly one species, and the seed's `note` is
where the next curator will look.

## Consequences

- Photo selection for fervidus draws on 1,254 WA records instead of 198. The
  out-of-region fallback that produced the Illinois photos should stop firing for this
  species; beeatlas-zd7 still owns the selection criteria themselves.
- **Any new outbound iNat query must resolve through this seed, not the bridge
  directly.** Today `seed-species-photos.mjs` is the only such caller. beeatlas-iek
  (fetch the expert feed from the API instead of a committed CSV) will be the second,
  and inherits this requirement.
- Local joins are unaffected. Every arm still resolves on post-synonymy *name*, so the
  occurrence data keeps a single species-rank `taxon_id` per species.
- The audit is done and recorded above; it does not need repeating per synonym. It
  *does* need redoing if we adopt a fold where the old name survives on iNat as
  something other than a complex.

## Alternatives rejected

- **Change the bridge for fervidus.** Breaks the taxa pane and files occurrences under
  a complex — see §2.
- **Query the parent complex whenever one exists.** Wrong for 60 of 61 species; a
  `Nomada vegana` complex photo could be any of 45 species.
- **Derive query sets from `occurrence_synonyms`.** Puts Palearctic *B. monticola*
  photos on *B. sylvicola* — see Context.
- **Follow iNat and un-fold californicus.** Rejected: the fold is the atlas's
  curatorial call, already shipped and verified, and it is what makes the species page
  and taxa pane coherent. This ADR makes our fold survive contact with their taxonomy
  rather than abandoning it.
