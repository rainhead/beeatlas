# Phase 165: Duplicate occurrence rows sharing one occ_id across int_combined source arms - Context

**Gathered:** 2026-06-24
**Status:** Ready for planning

<domain>
## Phase Boundary

The roadmap framed this as a duplicate-rendering bug (one `occ_id` listing twice
in the sidebar / D-04 chip). **Discussion reframed it: the duplicate is a
*symptom* of domain/data-model drift, not a rendering nit.** This phase therefore
delivers two things:

1. **Document the domain + data model** of the `int_combined` source arms and the
   `is_provisional` concept — written for *humans* first (`docs/domain-model.md`,
   linked from `CLAUDE.md`), so the meaning of each arm and ID is no longer
   inferred from the SQL.
2. **Correct the model to match the documented intent** — redefine the
   "provisional" arm and fix the catalog-number match gap that misfiles records,
   which is what produces the colliding `occ_id` rows in the first place.

**In scope:** the model doc; redefining the provisional arm on *project
membership*; fixing the Ecdysis catalog-number match so records like the
motivating example resolve correctly; whatever dedup follows naturally from the
corrected model.

**Out of scope (deferred):** the roadmap's original options (a)/(b)/(c) as
*display-layer* dedup strategies — they paper over the model bug and are
superseded by "fix the model." See Deferred Ideas.
</domain>

<decisions>
## Implementation Decisions

### Semantic model (the core open question)
- **D-01:** When the *same physical iNat observation* enters via two arms and
  collides on one synthetic `occ_id`, it is semantically **one occurrence**
  (collapse), not two records to de-dup at display time. But — see D-05 — in the
  motivating case the collision should never occur once the model is corrected,
  because the record is misfiled, not legitimately dual-arm.

### Where to fix
- **D-02:** Collapse/correctness belongs at the **data layer (`int_combined` /
  upstream intermediates)**, not as repeated `DISTINCT`/`GROUP BY` in the ~6
  frontend query builders. One corrected model fixes every surface (list, detail,
  map, places, CSV) at once. (Query-layer dedup — the Phase 160 WR-01 pattern —
  is explicitly *not* the chosen approach here.)

### Canonical domain model to document (`docs/domain-model.md`)
- **D-03 — `is_provisional` / "provisional" / "sample":** A provisional record is
  an observation that is a **member of the WABA "plant images & sample IDs" iNat
  project** (`https://www.inaturalist.org/projects/washington-bee-atlas-waba-plant-images-sample-ids-1854c0dc-0780-41e9-93f7-1f582b4df096`).
  These are **floral-host / sample observations** (plant images carrying sample
  IDs), have **no Ecdysis record**, no label numbers, and **by definition never
  join other sources**. `is_provisional` must be keyed on **project membership**,
  not on "WABA catalog-field obs not yet matched to Ecdysis" (the current
  implementation — see D-04).
- **D-04 — current implementation drift (the bug):** Today the pipeline defines
  "WABA" as *any iNat obs carrying the WABA catalog-number field* (`field:WABA=`,
  field 18116 — `data/waba_pipeline.py`), i.e. **bee specimen** observations. ARM
  2 / `is_provisional` (`int_provisional_waba_ids`) is then "those catalog-field
  obs *not matched* to an Ecdysis catalog record." That is a different population
  from D-03 (bee specimens, not plant/sample images) and is the root cause.
  Project membership IS already ingested (`data/projects_pipeline.py` →
  `observations__observation_projects`), so D-03 is implementable.
- **D-05 — the motivating example (`320276469`):** This is a **bee observation
  that should match an Ecdysis record by label/catalog number** but did not, so it
  fell into the mis-defined provisional arm (ecdysis_id NULL → `inat_obs:<id>`)
  and collided with its own expert `inat_obs` (ARM 3) row. It is **not a
  provisional record.** With the corrected model + a working catalog match it
  resolves to an `ecdysis:` row and the collision disappears. The fix is the
  match, not display dedup.

### Arm taxonomy to write down (humans first)
- **D-06:** Document each `int_combined` arm and what real-world thing it
  represents: ARM 1 ecdysis (catalogued specimens, FULL OUTER JOIN with samples),
  ARM 2 provisional (per D-03), ARM 3 expert `inat_obs`, ARM 4 checklist. Include
  the `occIdFromRow` ID-prefix vocabulary (`ecdysis:`/`inat:`/`inat_obs:`/
  `checklist:`) and the priority order that is positionally coupled across
  `src/occurrence.ts`, `src/filter.ts` `OCC_ID_SQL_CASE`, and
  `data/dbt/models/marts/occurrence_places.sql`.

### Doc location
- **D-07:** `docs/domain-model.md` (standalone, human-readable), **linked from
  `CLAUDE.md`**. Not an ADR, not buried in `CLAUDE.md`'s Domain Vocabulary — this
  is reference material for human collaborators as much as for LLMs.

### Column reconciliation (per-column, NOT a blanket precedence)
- **D-08:** Reconciliation, *if* any legitimate cross-arm merge remains after the
  model correction, is decided **column by column**, not by a single
  winning-arm precedence. Classify each column as: (a) *mutually exclusive* — one
  arm is always NULL → plain `COALESCE`/union, no decision (e.g. `image_url`,
  `obs_url`, `user_login`, `license`, `floralHost` from `inat_obs`;
  `specimen_inat_*`, `specimen_count`, `sample_id`, `sample_host`,
  `host_inat_login`, `host_observation_id` from the sample/specimen side); (b)
  *derived from the merged identity* — recomputed, never arm-picked (e.g.
  `is_provisional` is a function of project membership / Ecdysis presence,
  not a value to inherit from an arm); (c) *genuinely conflicting* — needs an
  explicit per-column rule (research must enumerate from real data; candidates:
  `source`, `canonical_name`/`taxon_id` if a WABA specimen-photo ID disagrees with
  the expert iNat ID). Do **not** assume blanket "Ecdysis > inat_obs > waba"; that
  was rejected.

### Regression guard
- **D-09:** Add a guard so future arms (Phase 161 WDFW, more sample/specimen
  linkage) cannot silently reintroduce duplicate `occ_id` rows — preferred form is
  a **dbt uniqueness assertion on `occ_id`** at the mart layer (research to confirm
  feasibility against the contract). The selected fix is data-layer, so the test
  belongs there too.

### Three-category model (REFINED during planning discussion, 2026-06-24 — supersedes the "accept regression" framing)
Research (HIGH confidence, verified vs. live DuckDB) showed the original "redefine
provisional → drop the rest" plan would silently remove **33 real WABA bee
specimens** (catalog # + iNat photo, no Ecdysis record yet; 28 of them from **2024**
— a standing ~2-year lag, not transient) from the public map. The D-05 catalog-match
fix rescues only **1** of the 34. Per the `CLAUDE.md` Domain Vocabulary ("Specimen …
may be represented by an iNat observation, an Ecdysis record, both, or neither"),
these are first-class **specimens** awaiting cataloguing — not provisional samples.
Decision: **keep them, modeled as their own category.** Final model the planner MUST
target:

| # | Category | `source` | `is_provisional` | occ_id |
|---|----------|----------|------------------|--------|
| 1 | Catalogued specimen (Ecdysis ± iNat) | `ecdysis` | FALSE | `ecdysis:N` |
| 2 | **iNat-photo specimen, pre-Ecdysis** (the 33) | **`waba_specimen` (NEW value)** | **FALSE** | `inat_obs:N` |
| 3 | Provisional sample (the ~28 plant/sample project members) | `waba_sample` | TRUE | `inat:N` |
| 4 | Expert observation (research-grade iNat) | `inat_obs` | FALSE | `inat_obs:N` |
| 5 | Checklist | `checklist` | FALSE | `checklist:N` |

- **D-10 — keep the 33 specimens:** Do NOT drop them. They get their own arm/source
  `waba_specimen`, `is_provisional=FALSE`. occ_id stays `inat_obs:<bee_obs_id>`. Verified
  no `inat_obs` (ARM 3) overlap except `320276469`, which the D-05 `MIN()` fix moves to
  `ecdysis:` — so category 2 collides with nothing.
- **D-11 — `waba_sample` is samples ONLY:** "There should be no specimens in
  `waba_sample`." The corrected `waba_sample` (provisional) arm contains ONLY the ~28
  WABA plant-images/sample-IDs project members (`is_provisional=TRUE`). This refines
  D-03: D-03's project-membership definition applies to the **provisional sample** arm
  (category 3); the bee specimens move to category 2, they are NOT deleted.
- **D-12 — `waba_specimen` source value:** new `source` value `waba_specimen` for
  category 2, parallel to `waba_sample` in the `waba_*` family.
- **D-13 — this is a FRONTEND change too (not data-only):** add `waba_specimen` to the
  `SourceKey` union + `VALID_SOURCES` (`src/url-state.ts`, `src/filter.ts`), a new
  source-toggle entry (`src/bee-pane.ts` — the `src=` filter Phase 164 just touched),
  and a badge/predicate as needed (`src/bee-occurrence-detail.ts`). The existing
  `waba_sample` toggle's meaning shifts to "provisional samples." Keep the
  `occIdFromRow` priority + `OCC_ID_SQL_CASE` unchanged (occ_ids are unaffected).
  NOTE: the RESEARCH.md "no frontend change / accept regression" recommendation is
  SUPERSEDED by D-10..D-13.

### Claude's Discretion
- Exact dbt restructuring: the new category-2 `waba_specimen` arm (rework of the
  current bee-specimen ARM 2 minus matched obs) vs. the new category-3 provisional
  arm (project-membership anti-join `int_samples_base`) — planner's call, but both
  must exist.
- The precise mechanics of the catalog-number match fix (D-05 — remove `MIN()` in
  `int_waba_link`) — research/plan.
- Badge styling / label copy for the new `waba_specimen` source in the UI.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Domain & data model (the subject of this phase)
- `CLAUDE.md` — existing Domain Vocabulary (Specimen / Sample / Floral host /
  Observation / Occurrence record / Collection event) and Architecture
  Invariants (ID format `ecdysis:<int>` / `inat:<int>`). The new
  `docs/domain-model.md` must stay consistent with and be linked from here.
- `data/dbt/models/intermediate/int_combined.sql` — the 4-arm UNION ALL; ARM 2 is
  the provisional arm under correction.
- `data/dbt/models/intermediate/int_provisional_waba_ids.sql` — current
  (mis-defined) provisional set: WABA-field obs NOT in `int_matched_waba_ids`.
- `data/dbt/models/intermediate/int_specimen_obs_base.sql` — projection of WABA
  observations (bee specimens) feeding ARM 2.
- `data/dbt/models/intermediate/int_matched_waba_ids.sql` and
  `data/dbt/models/intermediate/int_waba_link.sql` — the Ecdysis catalog-number
  match path (the gap in D-05 lives here).
- `data/waba_pipeline.py` — defines "WABA" as `field:WABA=` (catalog field 18116),
  NOT project membership (the drift in D-04).
- `data/projects_pipeline.py` + `inaturalist_data.observations__observation_projects`
  — where iNat project membership is ingested (enables D-03).

### Synthetic occ_id (positionally coupled — change together)
- `src/occurrence.ts` (`occIdFromRow`, `parseOccId`, predicates) §23-59.
- `src/filter.ts` `OCC_ID_SQL_CASE` §108-114 and the list/selection query
  builders (~§191, 242, 433, 521, 542, 599).
- `data/dbt/models/marts/occurrence_places.sql` — bridge join keys mirror the
  same ID priority.

### Prior-art precedent
- Phase 160 WR-01 — `COUNT(DISTINCT occ_id)` / `SELECT DISTINCT` query-layer dedup
  for per-place counts/maps. Cited as the pattern we are **not** using here
  (we fix the model instead). See `.planning/PROJECT.md` v5.2 entry.

### Doc to create
- `docs/domain-model.md` — NEW (this phase). Human-first model reference, linked
  from `CLAUDE.md`. Pattern precedent for a docs/ artifact: `docs/adr/0001-mapbox-basemap-cache.md`.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `data/projects_pipeline.py` already loads iNat project membership into
  `inaturalist_data.observations__observation_projects` — the data needed to
  redefine "provisional" by project membership (D-03) exists; no new ingestion.
- `src/occurrence.ts` is the single owner of the ID-prefix vocabulary; the model
  doc should reference it as the authoritative TS definition.

### Established Patterns
- `int_combined` is materialized as a TABLE (not view) to avoid re-evaluating the
  UNION ALL on every spatial join — any restructuring must preserve this.
- The `marts/occurrences` dbt contract (36 cols as of Phase 160) is the schema
  gate; a new uniqueness test (D-09) and any column changes go through
  `bash data/dbt/run.sh build`. See `project_schema_validation` /
  `project_occurrences_contract_release_sequence` memories for the release
  sequence (data-before-code; deadlock risk against stale S3).

### Integration Points
- The ID priority is coupled across `src/occurrence.ts`, `src/filter.ts`, and
  `occurrence_places.sql` (D-06) — if the model correction touches arm columns
  that feed `occIdFromRow`, all three must move together.
</code_context>

<specifics>
## Specific Ideas

- Provisional = members of the WABA "plant images & sample IDs" iNat project
  (exact URL captured in D-03). This is the single most load-bearing fact for the
  model doc and the arm correction.
- The model doc is explicitly for **humans to understand**, not just LLM context —
  drives the `docs/domain-model.md` + `CLAUDE.md` link choice over an ADR.
</specifics>

<deferred>
## Deferred Ideas

- **Display-layer dedup (roadmap options a/b/c).** Original framing —
  (a) dedupe list/selection query by `occ_id`, (b) distinct `occ_id`s per arm,
  (c) merge at int_combined as a pure rendering fix. Superseded by "fix the
  model" (D-01..D-05). Keep only as a fallback if research shows a legitimate
  same-physical-record-in-two-arms case survives the correction.
- **"Same specimen, two different occ_ids" (distinct from this phase).** A matched
  bee specimen resolves to `ecdysis:` while the same iNat obs pulled as an expert
  observation resolves to `inat_obs:` — two *different* ids for arguably one
  physical bee (no collision, so not this bug). The model doc should note it;
  whether to unify is a separate question for a future phase (relates to
  `project_taxon_id_milestone`).
- **None of the above are scope creep into new product capability** — they are
  narrower/adjacent data-model questions noted so they aren't lost.

</deferred>

---

*Phase: 165-duplicate-occurrence-rows-shared-occ-id*
*Context gathered: 2026-06-24*
