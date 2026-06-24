# BeeAtlas Occurrence Data Model

A reference for the five `int_combined` occurrence categories, the `is_provisional` definition,
the synthetic `occ_id` prefix vocabulary, and the same-occurrence identity rule. Written for
human readers; cross-references authoritative source files rather than duplicating them.

For the canonical vocabulary definitions (Specimen, Sample, Floral host, Observation, Occurrence
record, Collection event), see [CLAUDE.md § Domain Vocabulary](../CLAUDE.md).

---

## The Five Occurrence Categories

`data/dbt/models/intermediate/int_combined.sql` is a UNION ALL of five source arms. Each row
in `marts/occurrences` comes from exactly one arm.

| # | `source` value | `is_provisional` | `occ_id` prefix | Real-world thing |
|---|---------------|-----------------|-----------------|-----------------|
| 1 | `ecdysis` | FALSE | `ecdysis:N` | Catalogued specimen with an Ecdysis record |
| 2 | `waba_specimen` | FALSE | `inat_obs:N` | iNat-photo bee specimen, WABA catalog #, no Ecdysis record yet |
| 3 | `waba_sample` | TRUE | `inat:N` | Provisional sample / floral-host observation from the WABA plant-images project |
| 4 | `inat_obs` | FALSE | `inat_obs:N` | Expert research-grade iNaturalist observation |
| 5 | `checklist` | FALSE | `checklist:N` | Museum / collection checklist record (Bartholomew et al. 2024) |

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

### Category 4 — `inat_obs`: expert observation

Research-grade iNaturalist observations of bees submitted by experts (not WABA collectors).
Sourced from a separate `inat_obs_data` pipeline. `occ_id = inat_obs:N`. These carry
`image_url`, `obs_url`, `user_login`, and `license` fields that other categories lack.

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

## Pipeline Lag: `waba_specimen` Is Transient

A WABA bee specimen with a catalog number but no Ecdysis record appears as category 2
(`waba_specimen`) until its Ecdysis record is uploaded. This is a standing ~2-year lag as of
2026-06-24 (28 of the 33 specimens are from 2024). These are **not errors** and **not
provisional samples** — they are first-class specimens awaiting cataloguing. The `waba_specimen`
category exists to keep them visible on the map during the lag.

Once the Ecdysis record is uploaded and the nightly pipeline runs, the row transitions from
`waba_specimen` (occ_id `inat_obs:N`) to `ecdysis` (occ_id `ecdysis:M`). This is a change in
both `source` and `occ_id`, so any saved URL containing `o=inat_obs:N` will no longer resolve
to that specimen after the transition.

---

*Phase 165 — duplicate-occurrence-rows-shared-occ-id (2026-06-24)*
*Authoritative source for `occIdFromRow` vocabulary: `src/occurrence.ts`*
*Authoritative source for `int_combined` arms: `data/dbt/models/intermediate/int_combined.sql`*
