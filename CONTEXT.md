# CONTEXT.md — Domain Language

Shared vocabulary for BeeAtlas. Use these terms precisely — ambiguity here has caused confusion before. Update this file whenever a term is coined, sharpened, or deprecated. The deeper occurrence data model (five source arms, `tier`/`record_type` facets, `occ_id` vocabulary, identity rule) lives in [docs/domain-model.md](docs/domain-model.md).

## Core Objects

- **Specimen** — a physical bee, the real-world thing. May be represented by an iNat observation (photo posted by collector), an Ecdysis record, both, or neither for months after collection.
- **Sample** — all bees collected off one floral host, by one person, on one day, at one place. Represented by an iNat observation (usually of the plant; occasionally a blank record when bees were collected off a non-plant substrate). Carries sample ID (sequential per person per day) and bee count as metadata.
- **Sample host** (a.k.a. *floral host*) — the plant a sample was collected from, identified by the iNat observation that represents the sample. The *retrospective* host — what bees were actually collected on. Contrast **target host**.
- **Target host** — a plant volunteers are directed to *seek out* because collecting on it is likely to yield wanted bees; the *prospective* counterpart to the sample host. The set is drawn from curated project-leader lists, Washington-endemic native plants, and the hosts of specialist bees.
- **Observation** — a record on iNaturalist. Could represent a specimen (photo posted by collector), a floral host (plant ID), or a sample (collection record with sample ID + bee count metadata).
- **Occurrence record** — any data record of a bee occurrence: an iNat observation or an Ecdysis record.
- **Collection event** — a scheduled group outing; implicitly yields many samples from multiple people. No data record exists for events yet.

## People

- **Collector** — a volunteer, identified by their iNat handle (**self-identified, no auth** — the work half runs on public data). Resolved host-first: `COALESCE(specimen_inat_login, host_inat_login, user_login)` (the sample owner wins over a third-party specimen-photo poster). `display_name` = most-recent `recordedBy`.
- **Roles: reader / author / curator** (v8.0 write layer) — reading is open; authoring notes is allowlist-gated; a curator can take content down without a deploy.
- **Community note** — a free-text note contributed by an author against a species (`canonical_name`), shown on that species page. Named for who writes them, not what they contain: the content is often natural history, but nomenclature, identification tips, and local status are equally in scope. Supersedes the earlier UI label "natural history notes", which described only the commonest case. The stored entity is a **note**; "community notes" is the section as a reader sees it.

## Provenance Facets (the social cut)

The full arm→`tier`→`record_type` mapping, symbology, and URL params live in [docs/domain-model.md](docs/domain-model.md). The vocabulary:

- **`tier`** — *whose work is this?* Two reified values: **`atlas`** (WABA's own work) and **`other`** (expert observations + published literature). Drives the map filter and symbology.
- **`record_type`** — the per-arm record nature (5 values). Drives the detail card. Orthogonal to `tier` in the UI, though `tier = f(record_type)` in the data.
- **The three-tier mental model** — users think *My specimens / Atlas / Other*, but only `atlas`/`other` are reified. **"Mine" is reached via the orthogonal Collector facet, never a third tier** (no auth on a static site) — this drives the whole work half.
- **`source` is retired** — the old overloaded enum that conflated social provenance, record type, and platform. Decomposed into `tier` + `record_type` (Phase 170); do not reintroduce it as a UI primitive.

## Occurrence Identity

Priority order, prefix literals, the positional-coupling rule, and the same-occurrence rule are in [docs/domain-model.md](docs/domain-model.md) and authoritative in `src/occurrence.ts`. The vocabulary:

- **`occ_id`** — synthetic per-occurrence ID, `{prefix}:N` (`ecdysis:`/`inat:`/`inat_obs:`/`checklist:`). **Same `occ_id` = same occurrence.**
- **`is_provisional`** — TRUE only for a WABA plant-images observation lacking a specimen-count OFV. Do **not** equate `!is_provisional` with "has an Ecdysis record."
- **`waba_specimen`** — an iNat-photo bee specimen catalogued in WABA but not yet in Ecdysis; transient (a standing ~2-year lag), transitions to `ecdysis` once catalogued.

## Places

- **Place** (data model) vs **Region** (map-UI label) — same thing, two names. Places are hand-curated in `content/places.toml`. Sources: counties, ecoregions, curated places, WDFW wildlife areas, WTA hike corridors (linear features → ~250m buffer).
- **Wilderness** (no-collect overlay) — a *distinct* Regions overlay, NOT a Place: designated federal wilderness where collecting is prohibited (the semantic inverse of a permitted Place). Sourced from PAD-US, WA-scoped, Olympic Wilderness carved out (BeeAtlas has a collecting relationship with Olympic NP). Display-only red warning layer — no `FilterState` dimension, no place membership. See [ADR 0012](docs/adr/0012-wilderness-no-collect-overlay.md).
- **Many-to-many membership** — an occurrence belongs to *every* place it falls within, via the `occurrence_places` bridge on `occ_id`. One-place-per-occurrence was an implementation artifact, not domain truth (see [ADR 0006](docs/adr/0006-many-to-many-place-model.md)).

## Individuals (deferred)

- **Same physical bee, two `occ_id`s** — a matched Ecdysis specimen (`ecdysis:N`) and its expert iNat observation (`inat_obs:M`) are two IDs for arguably one bee. No collision, so not a bug; a known open question deferred to a future phase.

## Upstream Sources

- **Ecdysis** — the entomological collections database; the authoritative specimen catalog (arm 1).
- **iNaturalist** — observation platform; source of samples, WABA-photo specimens, and expert observations (arms 2–4). WABA collectors photograph bees here before cataloguing.
- **Bartholomew et al. 2024** — the Washington state bee checklist (arm 5), a committed CSV.
