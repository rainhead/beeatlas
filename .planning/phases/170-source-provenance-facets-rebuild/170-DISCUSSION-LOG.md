# Phase 170: Source → Provenance Facets Rebuild - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-26
**Phase:** 170-source-provenance-facets-rebuild
**Areas discussed:** Tier semantics (social reframe), "My" identity, source decomposition, `inat_obs` rename, symbology

---

## Tier semantics — provenance vs social

The roadmap framed the facet as "provenance tier" (data-quality / confidence). The user rejected
that framing: the tiers are **socially delimited** — "whose work is this."

**User's choice:** Three-tier social cut — **My specimens / Atlas specimens / Other occurrence
records.**
**Notes:** Reframes the whole phase. The facet name and semantics change; "provenance" wording in
ROADMAP/REQUIREMENTS is now stale (captured as D-10).

---

## "My specimens" identity on a no-auth static site

How does a static, no-auth site know who "me" is?

| Option | Description | Selected |
|--------|-------------|----------|
| Collector-page-only | "Mine" only meaningful on `/collector/<id>`; main map collapses to Atlas-vs-other | |
| Identity via URL/collector param everywhere | thread a `me=`/collector identity into the main map | |
| Saved/local identity | localStorage picks "me" globally | |
| Don't reify — design intent only | "Mine" is reached via the Collector facet; remember last ~3 collector selections | ✓ |

**User's choice:** Don't reify. "My specimens is something we design for, but isn't reified in the
design." Near-term ergonomics = remember the last ~3 Collector-dropdown selections.
**Notes:** Recent-3 Collector memory itself **deferred** out of 170.

---

## Decompose `source` — one facet or two; keep or replace the column

`source` is overloaded (social provenance + record type + platform/role). Replace it with one new
facet (social tier) or decompose into two orthogonal facets (tier + record_type)? Keep the `source`
column or replace it?

| Option | Description | Selected |
|--------|-------------|----------|
| Single flat tier list | collapse 5 → 2, one facet | |
| Two orthogonal facets, keep `source` column | smaller blast radius | |
| Two orthogonal facets, **replace** `source` with `tier` + `record_type` | cleaner model, bigger mart/contract change | ✓ |

**User's choice:** "replaced" — `source` fully replaced by `tier` + `record_type`.
**Notes:** Mapping confirmed: Atlas = {ecdysis, waba_specimen, waba_sample}; Other = {inat_expert,
checklist}. `waba_sample` → Atlas confirmed. Card stays record-type-driven (orthogonal to tier).

---

## `inat_obs` rename

The user flagged `inat_obs` as "dangerously ambiguous" — three of five arms are iNaturalist
observations.

**User's choice:** Rename the expert-obs `source`/`record_type` value to **`inat_expert`**. Rename
happens **in 170** (data leg). The shared `occ_id` prefix `inat_obs:` is **left as-is** — "I don't
see a problem with sharing the occ_id prefix."

---

## Symbology

Should the social tier drive map color, and what happens to the recency gradient?

**User's choice:** Tier drives color (Atlas pops / Other muted), with the partner-proposed
resolution accepted: **Atlas keeps the recency gradient** (liveness signal), **Other is muted**,
`checklist` folds into the muted treatment (loses its dedicated green).

---

## Claude's Discretion

- Exact `record_type` value spellings.
- Exact muted color/opacity for `other`; `tier=`/`src=` serialization format.
- Whether `record_type` rides on map-feature properties or only on detail rows.

## Deferred Ideas

- Recent-3 Collector-dropdown selections (near-term "find my work" ergonomics).
- Reified "My specimens" identity (`me=` param / localStorage / auth).
- occ_id / synthetic taxon-id cleanup (`inat_obs:` prefix sharing, dual IDs for one physical bee).
