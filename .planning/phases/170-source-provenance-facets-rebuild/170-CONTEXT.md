# Phase 170: Source → Provenance Facets Rebuild - Context

**Gathered:** 2026-06-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the overloaded `source` enum with **orthogonal facets** across the model and its three
coupled frontend consumers. The headline reframe from discussion: the organizing cut is **social,
not provenance** — "whose work is this" — even though the roadmap/requirements still call it
"provenance tier." `source` today conflates three independent things (social provenance, record
type, and platform/role); this phase decomposes them.

Delivered in 170:
- The `source` column is **removed** from `marts/occurrences` and replaced by two columns:
  `tier` (`atlas` / `other`) and `record_type` (the renamed per-arm vocabulary).
- The `inat_obs` source value is **renamed `inat_expert`** (it is misleading — three of the five
  arms are literally iNaturalist observations).
- The filter's organizing primitive becomes the **`tier`** facet (`hiddenSources` → `hiddenTiers`),
  with a `tier=` URL param and `src=` legacy back-compat.
- Map symbology is driven by `tier`; the detail card is driven by `record_type` (orthogonal).
- The `occ_id` positional coupling is preserved and asserted by a test; the frontend ships as one
  atomic commit (PROV-03).

NOT in this phase: any reified "My specimens" identity (auth, `me=` param, localStorage) — see
Deferred. The "mine / Atlas / other" three-way cut is a design *intent*; only the viewer-independent
part (`atlas` / `other`) is reified.
</domain>

<decisions>
## Implementation Decisions

### Social-tier facet (the reframe)
- **D-01:** The new facet is **social, not provenance** — "whose work is this." The user's mental
  model is three tiers: **My specimens / Atlas specimens / Other occurrence records.** Only the two
  viewer-independent tiers are reified in 170; "Mine" is design intent only.
- **D-02:** Reified tier values: **`atlas`** and **`other`**. The 5 arms map:
  | Arm (renamed) | `tier` | `record_type` (drives card) |
  |---|---|---|
  | `ecdysis` | `atlas` | specimen |
  | `waba_specimen` | `atlas` | specimen (pre-catalog) |
  | `waba_sample` | `atlas` | provisional sample |
  | `inat_expert` (was `inat_obs`) | `other` | expert observation |
  | `checklist` | `other` | literature record |
- **D-03:** `waba_sample` → **`atlas`** (it is a provisional floral-host sample, not a specimen, but
  socially it is Atlas work). Confirmed.

### Decompose `source` → two columns (REPLACE, not retain)
- **D-04:** `source` is **fully replaced** in `marts/occurrences` by `tier` + `record_type`. This is
  a dbt contract change (drop `source`, add two columns) — so the **data-before-code release
  sequence** applies (see canonical refs). `data/dbt/models/marts/occurrence_places.sql` and any
  pipeline source-consumers update in the data leg; the feature `properties.source` becomes
  `properties.tier` (+ `record_type` where the card needs it).
- **D-05:** `tier` is a coarser grouping derivable from `record_type`, but is materialized as its own
  column so the filter SQL/URL never has to know the arm→tier mapping. They are *orthogonal in the
  UI* (filter by one without the other) even though `tier = f(record_type)` in the data.

### Rename `inat_obs` → `inat_expert`
- **D-06:** The `source`/`record_type` value `inat_obs` is renamed **`inat_expert`** (role-named).
  Rename happens **in 170**, in the data leg (`int_combined.sql` arm + downstream), shipped
  data-before-code with D-04.
- **D-07:** The shared **`occ_id` prefix `inat_obs:`** (used by both `waba_specimen` and the
  expert-obs arm via `specimen_observation_id`) is **left as-is** — sharing the prefix is not a
  problem. (Note: the *occ_id prefix* literal `inat_obs:` is independent of the renamed *record_type*
  value; only the record_type value changes.)

### Symbology (`style.ts`)
- **D-08:** `tier` drives the **color family**, recency still modulates *within* Atlas:
  - **`atlas`** records keep the **recency gradient** (fresh community work pops — the liveness /
    togetherness signal this milestone is built around).
  - **`other`** records render **muted / neutral**; `checklist` folds into that muted treatment
    rather than keeping its own green.

### Detail card (`bee-occurrence-detail.ts`)
- **D-09:** The card stays **`record_type`-driven** (orthogonal to tier). A 2-value tier cannot pick
  the 5 card variants (checklist ≠ expert-obs ≠ specimen ≠ provisional sample ≠ pre-catalog
  specimen), so the card consumes `record_type` (+ existing `is_provisional` / `isSpecimenBacked`
  predicates), not `tier`.

### Requirement-wording drift (flagged, not silently ignored)
- **D-10:** PROV-02 says "filter, symbology, **and the detail card** are driven by provenance tier."
  Per D-09 the **card is record-type-driven**, not tier-driven, because the facets are orthogonal.
  Filter + URL + symbology are tier-driven. The "provenance" naming is also superseded by the social
  framing (D-01). Planner/verifier should read PROV-02 in light of this decomposition; a light
  REQUIREMENTS/ROADMAP wording touch-up to "social-provenance facet (tier) + record_type" is
  in-scope housekeeping if convenient.

### Atomic commit + coupling test (PROV-03, unchanged)
- **D-11:** Preserve the `occ_id` positional coupling and add the Vitest assertion comparing the
  CASE-branch priority order across `src/occurrence.ts` (`occIdFromRow`), `src/filter.ts`
  (`OCC_ID_SQL_CASE`), and `data/dbt/models/marts/occurrence_places.sql`. Frontend changes ship as
  one atomic commit; the data-leg contract change ships first (D-04).

### Claude's Discretion
- Exact `record_type` value spellings (e.g. `specimen` vs `ecdysis_specimen`, `waba_specimen`,
  `waba_sample`/`provisional_sample`, `inat_expert`, `checklist`) — planner picks names that drive
  the card cleanly and keep the migration legible.
- Exact muted color/opacity for `other` records and the `tier=` / `src=` serialization format
  (mirror the existing `src=` visible-set encoding in `url-state.ts`).
- Whether `record_type` is also materialized as a `properties.record_type` on map features or only
  carried on detail rows (driven by what the card needs vs map weight).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Domain model & vocabulary
- `docs/domain-model.md` — the five `int_combined` categories, `is_provisional` definition, the
  `occ_id` prefix vocabulary, and the same-occurrence identity rule. **This phase's reframe
  supersedes its "provenance" framing with a social one; the `inat_obs` arm is renamed
  `inat_expert`. Update this doc as part of 170.**
- `CLAUDE.md` § Domain Vocabulary — Specimen / Sample / Floral host / Observation / Occurrence record.

### Release discipline (MANDATORY — D-04/D-06 are a contract change)
- `.planning/` memory `project_occurrences_contract_release_sequence` — shipping an
  occurrences-schema change deadlocks two release gates against stale S3; fix = **data-before-code
  order** + one-time `SKIP_INTEGRATION_GATE=1` nightly.
- `.planning/` memory `project_schema_validation` — the dbt contract on `marts/occurrences` is the
  gate; steps for changing an occurrences column.
- `CLAUDE.md` § Known State — dbt contract (36 cols as of Phase 160) enforced at every
  `bash data/dbt/run.sh build`.

### The three coupled consumers + occ_id coupling
- `src/occurrence.ts` — `occIdFromRow` / `parseOccId` (authoritative occ_id prefix vocabulary).
- `src/filter.ts` — `OCC_ID_SQL_CASE`, `hiddenSources`/`VALID_SOURCES` SQL clause, feature
  `properties.source` (→ becomes `properties.tier`).
- `data/dbt/models/marts/occurrence_places.sql` — bridge join-key CASE (third coupled site).
- `data/dbt/models/intermediate/int_combined.sql` — the 5 source arms (where `inat_obs` →
  `inat_expert` and where `tier`/`record_type` are projected).
- `src/style.ts` — `_occurrencePointPaint` `match ['get','source']` symbology (D-08).
- `src/bee-occurrence-detail.ts` — card variant switch on `source`/`isProvisional` (D-09).
- `src/bee-pane.ts` — `_renderSources()` filter toggles (→ tier toggles).
- `src/url-state.ts` — `src=` serialization (→ `tier=` + `src=` back-compat).
- `src/bee-atlas.ts` — `FilterState` ownership, `hiddenSources` plumbing, `_onSourceFilterChanged`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `FilterState` + `_filterQueryGeneration` race guard + `isFilterActive` already model a hidden-set
  filter dimension; `hiddenTiers` follows the exact `hiddenSources` shape (Set, empty = show all).
- `url-state.ts` already encodes the *visible* subset for `src=` (`VALID_SOURCES.filter(!hidden)`);
  `tier=` mirrors that, and `src=` back-compat parses legacy tokens → maps each old source token to
  its tier (D-02 table) when computing `hiddenTiers`.
- `bee-pane._renderSources()` is a flat checkbox list — collapses 5 toggles → 2 tier toggles.

### Established Patterns
- **Positional coupling ships atomically** (geo_blob↔features.ts, occ_id across 3 files) — PROV-03's
  atomic-commit requirement is the house style, now with an explicit cross-file Vitest assertion.
- **`<bee-atlas>` owns reactive state**; `bee-map`/`bee-pane` are pure presenters — the tier filter
  flows the same `.hiddenSources`→`.hiddenTiers` property + upward `CustomEvent` path.
- **FilterState required-field contract** (`project_filterstate_required_field_contract`): renaming
  `hiddenSources`→`hiddenTiers` touches every FilterState literal (incl. bee-map default); run
  `tsc --noEmit` as the post-merge gate.

### Integration Points
- Data leg first: `int_combined.sql` (+ staging arms) project `tier`/`record_type`, drop `source`;
  contract bump; `occurrence_places.sql` updated; nightly with `SKIP_INTEGRATION_GATE=1` once.
- Code leg (atomic): `filter.ts` SQL + properties, `style.ts`, `bee-occurrence-detail.ts`,
  `bee-pane.ts`, `url-state.ts`, `bee-atlas.ts`, the occ_id-coupling Vitest test, `docs/domain-model.md`.

</code_context>

<specifics>
## Specific Ideas

- The social framing directly serves the v6.0 core value ("liveness and togetherness among
  participants"): Atlas work is vivid + recency-graded; external records recede. D-08 is the visual
  embodiment of that.
- "My specimens" is reached via the orthogonal **Collector** facet (already a facet per PROV-01),
  not a new tier — kept honest about the no-auth static-site constraint.

</specifics>

<deferred>
## Deferred Ideas

- **Recent-3 Collector selections** — make the Collector dropdown remember the last ~3 selections so
  a user re-finds "their own" specimens in one tap. This is the near-term path to a felt "My
  specimens" without reifying identity. Explicitly deferred out of 170 to keep it focused.
- **Reified "My specimens" identity** — any `me=` URL param / localStorage / auth that makes "mine"
  a first-class third tier. Design intent only for now.
- **occ_id / synthetic taxon-id cleanup** — the `inat_obs:` prefix sharing and same-physical-bee dual
  IDs remain open (`project_taxon_id_milestone`); untouched here by D-07.

</deferred>

---

*Phase: 170-source-provenance-facets-rebuild*
*Context gathered: 2026-06-26*
