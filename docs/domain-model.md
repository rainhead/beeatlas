# BeeAtlas Occurrence Data Model

A reference for the five `int_combined` occurrence categories, the social-provenance **tier** and
**record_type** facets (Phase 170), the `is_provisional` definition, the synthetic `occ_id` prefix
vocabulary, and the same-occurrence identity rule. Written for human readers; cross-references
authoritative source files rather than duplicating them.

For the canonical vocabulary definitions (Specimen, Sample, Floral host, Observation, Occurrence
record, Collection event), see [CONTEXT.md](../CONTEXT.md).

---

## The Social-Provenance Facets: `tier` + `record_type` (Phase 170)

Before Phase 170, a single overloaded `source` enum conflated three independent things: social
provenance ("whose work is this"), record type, and platform/role. Phase 170 **removed `source`**
from `marts/occurrences` and replaced it with two orthogonal materialized columns:

- **`tier`** — the **social** cut: *whose work is this?* The reified values are **`atlas`** (the WA
  Bee Atlas community's own work) and **`other`** (expert observations + published literature).
  The user's full mental model is three tiers — **My specimens / Atlas / Other** — but only the two
  viewer-independent tiers are reified; "Mine" is reached via the orthogonal Collector facet, not a
  third tier (no auth on a static site). `tier` drives the **map filter, URL param, and symbology**.
- **`record_type`** — the per-arm record nature. `tier` drives filter/symbology; `record_type`
  drives the **detail card** (5 card variants need the 5-value record_type — a 2-value tier cannot
  select them). They are **orthogonal in the UI** even though `tier = f(record_type)` in the data.

The arm → tier → record_type mapping is materialized **once**, in the five `int_combined.sql` arm
SELECTs — downstream SQL/URL/UI never recompute it.

| Arm | `tier` | `record_type` |
|-----|--------|---------------|
| ecdysis | `atlas` | `specimen` |
| waba_specimen | `atlas` | `waba_specimen` |
| waba_sample | `atlas` | `provisional_sample` |
| inat_obs (renamed) | `other` | `inat_expert` |
| checklist | `other` | `checklist` |

> **Naming note (D-06/D-07):** the old `inat_obs` source value was misleading (three of the five
> arms are literally iNaturalist observations), so its **record_type value is renamed `inat_expert`**.
> The shared **`occ_id` prefix literal `inat_obs:` is independent and UNCHANGED** — it is the
> occurrence-identity prefix (shared by `waba_specimen` and the expert-obs arm via
> `specimen_observation_id`), not the record_type. Only the record_type value moved.

> **Symbology (D-08):** `atlas` records keep the **recency gradient** (fresh community work pops —
> the liveness/togetherness signal); `other` records render **muted** (a desaturated grey-blue).
> `checklist` loses its former dedicated green and folds into the muted `other` treatment.

The map filter (`hiddenTiers`), the `tier=` URL param (with `src=` legacy back-compat that folds
the old 5 sources to 2 tiers, lossy by design), and the `properties.tier` map-feature attribute
all consume `tier`. The detail card (`bee-occurrence-detail.ts`) dispatches on `record_type`.

---

## The Five Occurrence Categories

`data/dbt/models/intermediate/int_combined.sql` is a UNION ALL of five source arms. Each row
in `marts/occurrences` comes from exactly one arm. (The legacy `source` column was decomposed into
`tier` + `record_type` in Phase 170 — see the facets section above.)

| # | arm (`record_type`) | `tier` | `is_provisional` | `occ_id` prefix | Real-world thing |
|---|---------------------|--------|-----------------|-----------------|-----------------|
| 1 | `specimen` (ecdysis) | `atlas` | FALSE | `ecdysis:N` | Catalogued specimen with an Ecdysis record |
| 2 | `waba_specimen` | `atlas` | FALSE | `inat_obs:N` | iNat-photo bee specimen, WABA catalog #, no Ecdysis record yet |
| 3 | `provisional_sample` (waba_sample) | `atlas` | TRUE | `inat:N` | Provisional sample / floral-host observation from the WABA plant-images project |
| 4 | `inat_expert` (was `inat_obs`) | `other` | FALSE | `inat_obs:N` | Expert research-grade iNaturalist observation |
| 5 | `checklist` | `other` | FALSE | `checklist:N` | Museum / collection checklist record (Bartholomew et al. 2024) |

### Category 1 — `ecdysis`: catalogued specimen

A physical bee with an Ecdysis (entomological collections DB) record. ARM 1 is a FULL OUTER
JOIN of `int_ecdysis_base` and `int_samples_base`: an Ecdysis specimen may or may not be
linked to a WABA iNat observation. Coordinated via `host_observation_id` (the plant obs that
represents the sample the bee came from). `occ_id = ecdysis:N` where N is the Ecdysis numeric ID.

### Category 2 — `waba_specimen`: iNat-photo specimen awaiting cataloguing

WABA collectors photo their bees in iNaturalist before (sometimes long before) the specimen is
catalogued in Ecdysis. These observations carry the WABA catalog-number field (`field_id=18116`)
but have no matching Ecdysis record yet. As of 2026-06-24, ~33 such observations exist, ~28 of
them from 2024 — a standing lag of roughly two years, not an error.

ARM 3 in `int_combined` sources from `int_specimen_obs_base` WHERE `waba_obs_id NOT IN
int_matched_waba_ids`. `is_provisional=FALSE` — these are first-class specimens, not provisional
samples. `occ_id = inat_obs:N` (via `specimen_observation_id`). The `obs_url` field surfaces the
iNaturalist observation link. A `waba_specimen` row transitions to `ecdysis` once its Ecdysis
record is uploaded and the nightly pipeline runs.

### Category 3 — `waba_sample`: provisional sample

A floral-host / sample observation that is a member of the WABA "Plant images/Sample IDs"
iNaturalist project (`project_id=166376`,
`https://www.inaturalist.org/projects/washington-bee-atlas-waba-plant-images-sample-ids-1854c0dc-0780-41e9-93f7-1f582b4df096`)
but **lacks a specimen-count OFV** — meaning it has not yet been linked as a full sample record
in `int_samples_base`.

`is_provisional=TRUE`. `occ_id = inat:N` (via `observation_id`). The plant observation carries
no bee species, so `canonical_name` and `taxon_id` are NULL (safe per D-08). These rows are
genuinely provisional: once the sample metadata is completed (specimen count OFV added), the
observation moves into `int_samples_base` and this record transitions to a sample linked via an
`ecdysis` ARM 1 row.

**No specimens here**: category 3 contains only plant/sample images. Bee specimens belong to
categories 1 or 2.

### Category 4 — `inat_expert` (was `inat_obs`): expert observation

iNaturalist observations of bees that a trusted identifier has looked at (not WABA collecting
work). The arm's upstream is the live v2 API loader `data/inat_expert_pipeline.py`
(beeatlas-iek cutover, 2026-08-12 — it retired the hand-refreshed CSV export and its recorded
command `data/raw/inat_expert_obs.sh`, recoverable from git history). The `ident_user_id`
filter derives from the curated identifier register's `is_expert` rows, which
[ADR 0033](adr/0033-trust-an-expert-unless-an-expert-disagrees.md) designates as the single
authority on expert status.

Two things the name overstates. The roster feeds iNat's `ident_user_id`, a filter on **who
identified** the observation — the observer can be anyone (4,766 distinct observers in the
2026-05 snapshot), and an identification by a roster member does **not** mean they agreed with
the community taxon, which is the name we ingest. There is also no quality-grade filter; the
roster is the filter. (The per-identification detail the loader now ingests is what closes
this gap — the trusted-taxon model reads actual assertions, not roster membership.)
Trust semantics for these observations — requiring the expert's *actual asserted taxon*, not
mere roster contact — are defined by [ADR 0033](adr/0033-trust-an-expert-unless-an-expert-disagrees.md)
(expert-trust-with-veto); see "Identifications and Determination Trust" below.

Sourced from a separate `inat_obs_data` pipeline. `tier = other`, `record_type = inat_expert`
(renamed from `inat_obs` in Phase 170, D-06 — role-named). `occ_id = inat_obs:N` (the occ_id
prefix is unchanged, D-07). These carry `image_url`, `obs_url`, `user_login`, and `license`
fields that other categories lack.

### Category 5 — `checklist`: museum/collection records

The Bartholomew et al. 2024 Washington state bee checklist. Sourced from a committed CSV via
`int_checklist_dedup_status`. `occ_id = checklist:N` (ObjectID). Carries `verbatim_name`,
`locality`, and `collapsed_count`; coordinates and date-precision vary.

---

## The `is_provisional` Definition (Corrected — Phase 165)

**`is_provisional = TRUE` means:** the observation is a member of the WABA "Plant images/Sample
IDs" iNaturalist project (`project_id=166376`) and lacks a specimen-count OFV. See category 3.

**`is_provisional = FALSE`** covers every other category — including `waba_specimen` (category 2),
which are real specimens NOT provisional samples. Do not equate `!is_provisional` with "has an
Ecdysis record" — categories 2, 4, and 5 are all non-provisional without an Ecdysis record.

The old (pre-Phase-165) drift defined "provisional" as any WABA catalog-field observation not
yet matched to an Ecdysis record. That definition misclassified bee specimens as provisional
samples and caused `occ_id` collisions (Shapes A and B). It was corrected in Plan 02 of Phase 165.

---

## The `occIdFromRow` ID-Prefix Vocabulary

See `src/occurrence.ts` as the **authoritative TypeScript definition** — the priority order and
prefix literals live there. Do not restate the CASE logic in other layers; reference the source.

The four prefixes, in priority order:

| Priority | Prefix | Numeric ID comes from | Set when |
|----------|--------|-----------------------|----------|
| 1 | `ecdysis:N` | `ecdysis_id` | Row has an Ecdysis specimen record |
| 2 | `inat:N` | `observation_id` | Row is a sample/provisional observation (no ecdysis_id) |
| 3 | `inat_obs:N` | `specimen_observation_id` | Row is a waba_specimen or inat_obs (no ecdysis_id, no observation_id) |
| 4 | `checklist:N` | `checklist_id` | Row is a checklist record (all three above are NULL) |

### Positional coupling — change all three together

The ID-prefix vocabulary is positionally coupled across three files. When the column mapping or
priority order changes, **all three must change in the same commit**:

1. `src/occurrence.ts` — `occIdFromRow` and `parseOccId` (TypeScript, authoritative)
2. `src/filter.ts` — `OCC_ID_SQL_CASE` (SQL CASE expression, must mirror `occIdFromRow`)
3. `data/dbt/models/marts/occurrence_places.sql` — bridge join key (mirrors the same priority)

---

## When Are Two Rows the Same Occurrence?

**Same `occ_id` = same occurrence.** After Phase 165's model correction, each row in
`marts/occurrences` has a unique `occ_id` — the dbt uniqueness test
(`test_no_duplicate_occ_ids`) enforces this at `severity: warn` (targeting `severity: error`
once the Shape C residual is resolved).

### Known deferred cases

**Same physical bee, two different `occ_id` values.** A matched Ecdysis specimen resolves to
`ecdysis:N`; if the same bee was also observed as an expert iNat observation, that row resolves
to `inat_obs:M`. These are two different IDs for arguably one physical bee. No collision (the
IDs don't clash), so this is not the current bug — but it is a known open question deferred to
a future phase (see `project_taxon_id_milestone` in project memory).

**Shape C — OFV fan-out (backlog).** Observations 6317352 and 6317353 share an Ecdysis
`occ_id` pair due to a duplicate `field_id=9963` OFV row in `inaturalist_data.observations__ofvs`
for obs 288589692. This causes `int_samples_base` to fan out two rows, resulting in two
`ecdysis:` rows with the same ID. Surfaced (severity: warn) by the Phase 165 uniqueness test;
root cause is separate from the catalog-match gap fixed in Phase 165. Fix: deduplicate
`field_id=9963` OFVs in `stg_inat__ofvs` or `int_samples_base`.

---

## Identifications and Determination Trust (ADR 0033)

An **Identification** is a person asserting a taxon for an occurrence record — a
**cross-source** concept: the same person identifying a bee on iNat and determining its Ecdysis
specimen has made one identification, recorded twice (the sources join via
`specimen_observation_id`). The trust rule is *trust an expert, unless an expert disagrees*:
expert assertions establish trust, only expert disagreement vetoes it (rank-scoped — a
species-level dispute leaves genus trust intact), Ecdysis determinations are trusted by
ingestion provenance, and non-expert disagreement surfaces for curation instead of vetoing.
Full semantics, evidence, and rejected alternatives:
[ADR 0033](adr/0033-trust-an-expert-unless-an-expert-disagrees.md).

Facts about the Ecdysis identification data that any consumer must respect (verified
2026-08-11, beeatlas-0o1):

- **The occurrence record is the determination of record.** 532 specimens have zero
  *current* rows in `ecdysis_data.identifications` yet publish with names that exist only on
  `occurrences`; 6+6 further rows disagree between the tables (reconciliation artifacts). Read
  determinations from `occurrences`; the identifications table is attribution and supersession
  history.
- **Exactly one current identification per specimen** — a supersession chain, not a vote
  record. Corroboration of an Ecdysis determination can only come from the linked iNat
  observation's identifications.
- **No anonymous determinations.** Every current identification bearing a real taxon name is
  attributed to a named person (28,920) or the "Nomenclatural Adjustment" process actor (17).
  The 'undetermined' placeholder rows and the process actor are sentinels, excluded in the
  identifications-arm intermediate (`int_ecdysis_identifications`) — NOT at staging, which stays
  unfiltered so `int_id_modified`'s MAX(modified) sees every row (beeatlas-fc4).
- **`taxon_rank` is empty on all rows** — rank derives from name shape
  (`data/canonical_name.py`), including `Lasioglossum (Dialictus)` parenthetical-subgenus forms.

The trusted-taxon model is BUILT (beeatlas-xs1, 2026-08-12): `int_trusted_taxon` computes the
per-record trusted taxon over current expert assertions — today the Ecdysis determination of
record per specimen (29,474 records), with hedged qualifiers resolved by the hedge-target rule
(ADR 0033 item 9: `Lasioglossum cf. pacatum` asserts the *L. viridatum* species complex, not
bare *Lasioglossum*). The chain is `int_identification_events` (qualifier parsing) →
`int_taxon_resolution`/`int_taxon_nodes` (local lineage from `taxa.csv.gz`) →
`int_identification_assertions` (anchors, slash LCAs) → `int_trusted_taxon` (chain/LCA
aggregation, self-disagreement exclusion). The agreement semantics are pinned by dbt unit
tests (the executable spec in `intermediate/schema.yml`). The iNat arm is LIVE (beeatlas-9sy,
2026-08-12): `data/inat_expert_pipeline.py` ingests the expert feed + specimen-linked
observations with per-row identification detail from the v2 API (id_above cursor — the API's
10k pagination window forbids page numbers; roster read from the identifier register;
incremental on updated_at after the initial sweep), and identifications attach to occurrence
rows via `int_observation_occ_ids` (specimen photo → `ecdysis:N`, arm-3/4 → `inat_obs:N`;
plant/sample observations deliberately excluded). First live run: 58,737 records with a
trusted taxon, 9,028 multi-expert, 26 expert disputes resolved rank-scoped, 0 expert
self-disagreements. The output PUBLISHES as `marts/occurrence_trust` →
`occurrence_trust.parquet` (beeatlas-nyr) — a contract-enforced mart keyed by `occ_id`
(same synthetic identity as `occurrence_places` / `occIdFromRow`), separate from
`marts/occurrences` by decision ([ADR 0034](adr/0034-occurrence-trust-stays-a-separate-artifact.md)); a record
qualifies for query taxon T iff T ∈ `trusted_ancestor_or_self`, and a missing row means
"no trust computed", never distrust. Consumers: the photo-pipeline gate (repointed
2026-08-12, beeatlas-vsrh — `scripts/photo-pipeline/trust-gate.mjs` keeps its JS rule only
as the fallback for candidates newer than the artifact, verified decision-identical on
4,921 shared candidates by `trust-artifact-diff.mjs`) and display claims (beeatlas-kmxs).
Arm 4's mart upstream is the live API loader (beeatlas-iek, done 2026-08-12).

---

## Pipeline Lag: `waba_specimen` Is Transient

A WABA bee specimen with a catalog number but no Ecdysis record appears as category 2
(`waba_specimen`) until its Ecdysis record is uploaded. This is a standing ~2-year lag as of
2026-06-24 (28 of the 33 specimens are from 2024). These are **not errors** and **not
provisional samples** — they are first-class specimens awaiting cataloguing. The `waba_specimen`
category exists to keep them visible on the map during the lag.

Once the Ecdysis record is uploaded and the nightly pipeline runs, the row transitions from
`waba_specimen` (occ_id `inat_obs:N`) to the `specimen` record_type (occ_id `ecdysis:M`). This is
a change in both `record_type` and `occ_id`, so any saved URL containing `o=inat_obs:N` will no
longer resolve to that specimen after the transition. (Both rows stay in `tier=atlas` — the social
tier is unchanged through the transition.)

---

*Phase 165 — duplicate-occurrence-rows-shared-occ-id (2026-06-24)*
*Phase 170 — source → tier + record_type facets (2026-06-27)*
*Authoritative source for `occIdFromRow` vocabulary: `src/occurrence.ts`*
*Authoritative source for the arm → tier → record_type mapping: `data/dbt/models/intermediate/int_combined.sql`*
