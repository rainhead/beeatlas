# Phase 126: Taxon IDs - Context

**Gathered:** 2026-05-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Expose the iNat taxon ID that the existing resolution machinery already produces as a **non-null `taxon_id INTEGER` column** on both `species.parquet` (TID-01) and `occurrences.parquet` (TID-02), and link taxon pages to `https://www.inaturalist.org/taxa/{taxon_id}` (TID-03).

**This phase does NOT build resolution** — `resolve_taxon_ids.py` → `inaturalist_data.canonical_to_taxon_id` bridge → `stg_inat__canonical_to_taxon_id` already resolves every name (currently **0 unresolved**, `lineage_unresolved.csv` is header-only). `int_species_universe.sql` already LEFT JOINs the bridge but does not `SELECT` the `taxon_id`. The work is: surface the column through the intermediate models → marts → contracts → export → frontend, and make the non-null guarantee enforce itself.

</domain>

<decisions>
## Implementation Decisions

### Non-null guarantee (TID-01 / TID-02)
- **D-01:** `taxon_id` is declared **`NOT NULL`** in the dbt contract (`data/dbt/models/marts/schema.yml`) on **both** marts. The build hard-fails on any unresolved row — chosen deliberately over excluding rows or sentinel values, matching the project's contract-enforced-at-build culture.
- **D-02:** Enforcement is a **pre-build resolution gate**: before the dbt build, verify every name in the resolution union resolves to a `taxon_id`. Any unresolved name is written to `data/lineage_unresolved.csv` and the step **exits non-zero with an actionable message** naming the offenders. The `NOT NULL` contract constraint (D-01) is the belt-and-suspenders backstop. Rationale: the pipeline runs nightly via cron on maderas — a bare dbt constraint error is hard to diagnose at the log; the gate fails fast and points at the fix.
- **Operational consequence (call out to planner):** nightly data freshness is now coupled to iNat name resolution. A single new unresolvable canonical name blocks the entire nightly ship until a human resolves it (re-run `resolve_taxon_ids` / `--refresh-lineage`, or add a synonym). This is the accepted tradeoff. Phase 127 (Inactive Taxon Remapping) adds the auto-remap + triage-report safety net on top of this gate.

### Occurrence taxon_id semantics (TID-02)
- **D-03:** `occurrences.taxon_id` is the **species-rollup** taxon — the `taxon_id` of the species the occurrence rolls up to via its (synonymized) `canonical_name`. Guarantees **`occurrences.taxon_id == species.taxon_id`** for the same species, so any occurrence maps cleanly to its species page.
- **D-04:** The **WABA arm** (`source = waba_sample`, ~37 rows) has NULL `canonical_name`. It must **derive a canonical_name** (from its taxon name) and resolve through the **same bridge** — NOT use `waba.taxon__id` directly. WABA falls under the same hard-fail gate (D-02). Rationale: consistency over convenience; `waba.taxon__id` may sit at a finer rank (subspecies) and wouldn't match a species row.
- **D-09 (resolves RD-03, user decision 2026-05-31):** Of the 37 WABA provisional rows, **4 are non-bee bycatch** (`Cicindela pugetana` ×2, `Cleridae`, `Encopognathus` — confirmed via ancestry check in `taxa.csv.gz`). They have no species-level bee taxon_id and cannot resolve through the iNat bridge. **Decision: exclude these non-bee rows from `occurrences.parquet`** via a curated `KNOWN_NON_BEES` exclusion set keyed on `specimen_inat_taxon_name`, applied at the WABA arm before the resolution gate. **D-01 stays strict** — `taxon_id` is NOT NULL for every row that remains. The gate must **report** excluded rows (not silently drop them) so new bycatch surfaces. The remaining 33 WABA rows derive a canonical_name via `lower(trim(first_two_tokens))` and resolve through the bridge. The `KNOWN_NON_BEES` set must be maintained as new bycatch appears (an unresolved bee name still hard-fails the gate as designed; only known non-bees are excluded).

### iNat link presentation (TID-03)
- **D-05:** Render as **"View on iNaturalist →"**, a sibling action link to the existing "View N records on the atlas →" link in `_pages/species-detail.njk` (grouped with the other outbound action). Target: `https://www.inaturalist.org/taxa/{taxon_id}`.
- **D-06:** **Scope expanded beyond TID-03 by explicit user decision:** the link is added to **genus, subgenus, and tribe pages too** (`_pages/genus.njk`, `subgenus.njk`, `tribe.njk`), using each rank's self-row `taxon_id` from `taxon_lineage_extended`. (See research dependency RD-02 — subgenus/tribe self-row availability is unconfirmed.)

### Contract & invariant update (Claude's discretion — area not selected for discussion)
- **D-07:** Adding `taxon_id` bumps the enforced column counts: species 19→20 (+ Python-added slug), occurrences 36→37. Update `schema.yml` contracts accordingly.
- **D-08:** The CLAUDE.md "30-column contract on `marts/occurrences`" note is **already stale** (actual is 36 pre-`taxon_id`). Correct it to the post-phase count (37) as part of this phase's doc hygiene per the global "keep docs up to date before pushing" rule.

### Claude's Discretion
- Exact placement of the `taxon_id` column within each mart's SELECT/schema (D-07).
- `taxon_id` column type confirmed as `INTEGER` per requirements — iNat taxon IDs are well within INT32 range; `taxon_lineage_extended` uses BIGINT internally, so a cast may be needed at the mart boundary (planner's call).
- Whether the pre-build gate (D-02) lives inside `resolve_taxon_ids.py`, `run.py`, or a dedicated dbt pre-hook.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

ROADMAP.md lists no canonical refs for Phase 126. The following are the load-bearing code/doc paths discovered during codebase scout:

### Taxon-ID resolution (already built — do not rebuild)
- `data/resolve_taxon_ids.py` — resolves `canonical_name` → `taxon_id` via iNat API; UPSERTs `inaturalist_data.canonical_to_taxon_id` (PK `canonical_name`); writes failures to `data/lineage_unresolved.csv`. The pre-build gate (D-02) extends this.
- `data/taxa_pipeline.py` — downloads `taxa.csv.gz`, populates `inaturalist_data.taxon_lineage_extended` (taxon_id BIGINT, family, subfamily, tribe, genus, subgenus); includes self-rows for **genus/family** taxa (subgenus/tribe TBD — RD-02).
- `data/dbt/models/staging/stg_inat__canonical_to_taxon_id.sql` — passthrough view over the bridge (1:1, PK `canonical_name`).
- `data/dbt/models/staging/stg_inat__taxon_lineage_extended.sql` — lineage + self-row taxon_ids for higher-rank pages (D-06).

### Models to modify
- `data/dbt/models/intermediate/int_species_universe.sql` — **already LEFT JOINs the bridge** (`ctt.taxon_id`); add `ctt.taxon_id` to the final SELECT.
- `data/dbt/models/intermediate/int_combined.sql` — occurrence arms; add `taxon_id` join on synonymized `canonical_name` (RD-01); WABA arm per D-04.
- `data/dbt/models/intermediate/int_specimen_obs_base.sql` — WABA staging source for D-04.
- `data/dbt/models/marts/species.sql` — add `taxon_id` (TID-01).
- `data/dbt/models/marts/occurrences.sql` — add `taxon_id` (TID-02).
- `data/dbt/models/marts/schema.yml` — `contract.enforced: true`; add `taxon_id` with `not_null` constraint to both marts (D-01, D-07).

### Synonymy interaction (Phase 123 — critical for RD-01)
- `data/dbt/seeds/occurrence_synonyms.csv` — synonymy applied at dbt layer via `int_combined` LEFT JOIN (Phase 123). The taxon_id join MUST use the post-synonymy `canonical_name` consistently, and the bridge must have resolved those synonymized names.

### Export & frontend
- `data/export.py` — produces `public/data/species.json` from `species.parquet`; must include `taxon_id`.
- `_data/species.js` — Eleventy data cascade (`speciesList`, `genusList`, `subgenusList`, `tribeList`); must pass `taxon_id` through to all rank lists (D-06).
- `_pages/species-detail.njk` — link placement (D-05); existing "View N records on the atlas →" link is the sibling anchor.
- `_pages/genus.njk`, `_pages/subgenus.njk`, `_pages/tribe.njk` — higher-rank link targets (D-06).

### Project docs
- `CLAUDE.md` — stale "30-column contract" note to correct (D-08); also documents nightly pipeline ownership (`data/nightly.sh`, `run.py`).
- `.planning/phases/125-species-visibility/125-01-SUMMARY.md` — Phase 125 added 65 off-checklist species via COALESCE epithet derivation; these now exist in the species universe and must also resolve to a taxon_id under D-01.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`canonical_to_taxon_id` bridge + `stg_inat__canonical_to_taxon_id`**: complete resolution path, 0 currently unresolved. Phase 126 only surfaces its output.
- **`int_species_universe.sql` existing LEFT JOIN**: the bridge join is already wired (`ctt.taxon_id` is in scope) — surfacing it is a one-line SELECT addition for the species mart.
- **`species-detail.njk` action-link pattern**: the existing atlas link gives a ready-made styling/placement precedent for D-05.
- **Phase 125 `_SPECIES_GUARD` pytest pattern** (`data/tests/test_dbt_scaffold.py`): the `skipif(not species.parquet.exists())` guard is the established pattern for new parquet-column assertions (non-null taxon_id tests).

### Established Patterns
- **Contract-enforced marts**: `contract.enforced: true` in `schema.yml` is checked at every `bash data/dbt/run.sh build` — the natural home for the `NOT NULL` backstop (D-01).
- **dbt-layer synonymy (Phase 123)**: synonymy is a LEFT JOIN at `int_combined`, not at ingestion — the taxon_id join must be consistent with this (RD-01).

### Integration Points
- Pre-build gate (D-02) sits between `resolve_taxon_ids` and the dbt build in the pipeline order (`run.py` STEPS / `data/nightly.sh`).
- Frontend taxon_id flows: mart parquet → `export.py` → `species.json` → `_data/species.js` → page templates.

</code_context>

<specifics>
## Specific Ideas

- Link label verbatim: **"View on iNaturalist →"** (matches the arrow style of the existing atlas link).
- Currently **0 unresolved names** — the non-null guarantee holds today; the gate exists to protect the invariant as the species universe grows from new observations.

### Research Dependencies (flagged during discussion — for gsd-phase-researcher)
- **RD-01 (synonymy/join consistency):** Confirm the taxon_id join uses the **post-synonymy** `canonical_name` in BOTH marts, and that `resolve_taxon_ids` has resolved those synonymized names (e.g. `Agapostemon subtilior`, not just raw `texanus`). If the bridge keys raw normalized names while marts carry synonymized names, the two marts could disagree or rows could go null. This is the highest-risk technical unknown.
- **RD-02 (higher-rank self-row availability):** `taxon_lineage_extended` is documented to include self-rows for **genus and family** taxa. Verify whether **subgenus and tribe** taxa have their own resolvable `taxon_id`. D-06 ("all taxon ranks") depends on this — for any rank lacking a self-row taxon_id, either omit the link for that rank or extend the lineage extraction. Surface the finding before planning the genus/subgenus/tribe template work.
- **RD-03 (WABA derivation feasibility):** Confirm a canonical_name can be derived from WABA staging (`specimen_inat_taxon_name` / `int_specimen_obs_base`) such that it resolves through the bridge (D-04). If not derivable, the gate will hard-fail on WABA rows.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (The genus/subgenus/tribe link extension was explicitly folded into scope as D-06 rather than deferred.)

</deferred>

---

*Phase: 126-taxon-ids*
*Context gathered: 2026-05-31*
