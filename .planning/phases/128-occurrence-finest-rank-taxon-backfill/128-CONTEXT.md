# Phase 128: Occurrence Finest-Rank Taxon Backfill - Context

**Gathered:** 2026-06-01
**Status:** Ready for planning
**Source:** Captured from Phase 126 verification + live-data investigation (milestone-close session)

<domain>
## Phase Boundary

Close the **re-scoped TID-02** gap surfaced during Phase 126 verification. Phase 126 made
`occurrences.taxon_id` non-null only for **species-level** rows (two-token `canonical_name`),
enforced by a `severity: warn` data_test scoped to `canonical_name like '% %'`. TID-02 as
originally written ("non-null `taxon_id` for *every* occurrence row") is impossible: ~21k
ecdysis specimens carry no taxonomic identification at all.

**This phase:** make `occurrences.taxon_id` carry the taxon_id of each occurrence's **finest
identified rank** (species → genus → subgenus/tribe → family), backfilling the ~12,674
genus-level rows from the higher-rank taxon machinery already built in Phase 126. Re-scope the
not_null assertion to "every *identified* row." Truly-unidentified specimens legitimately stay NULL.

**This phase does NOT:**
- Identify specimens (no new taxonomy/ID work — only surfaces taxon_ids that already exist).
- Touch `species.parquet` / `species.taxon_id` (species mart stays strict not_null, unchanged).
- Backfill the species mart or the frontend taxon links (TID-01/TID-03 are done and verified).
- Attempt to resolve the 3 unresolvable ecdysis species or assign a root "bees" taxon.

</domain>

<live_data>
## Live-Data Decomposition (occurrences.parquet, 2026-06-01)

Total rows: 77,744. NULL `taxon_id`: 34,354 (44%). Breakdown:

| Bucket | Rows | Backfillable | Target taxon_id source |
|--------|-----:|--------------|------------------------|
| Genus-level ID — single-token `canonical_name`, 29 genera (lasioglossum, osmia, melissodes, megachile, bombus…) | 12,674 | ✅ Yes | genus self-row taxon_id — **all 29 resolve** in `higher_rank_taxon_ids.json['genus']` (verified: lasioglossum→57678, hylaeus→127812, …) |
| Truly unidentified — empty/NULL genus, no family, no scientificName (all ecdysis) | ~21,179 | ❌ No | none — legitimately NULL (468 have a `specimen_inat_taxon_name`, otherwise nothing) |
| Unresolvable species — 3 ecdysis names (`anthidiellum robertsoni`, `osmia phaceliae`, `lasioglossum aspilurus`), 11 rows each | 33 | ❌ No | 0 iNat API results — pre-existing data quality, stays NULL |

After backfill: ~12,674 newly non-null; ~21,212 remain NULL by design (truly-unidentified + 3-species).
NULL-taxon_id by source today: ecdysis 28,504, inat_obs 5,842, waba_sample 8.

</live_data>

<decisions>
## Implementation Decisions

### Finest-rank COALESCE (the core change)
- **D-01:** `occurrences.taxon_id` becomes a COALESCE down the rank ladder: species-level bridge
  taxon_id (existing) → **genus** self-row taxon_id → (if cheaply available) subgenus/tribe/family
  self-row taxon_id. Genus is the load-bearing rung (covers all 12,674 backfillable rows today);
  subgenus/tribe/family are included only if the occurrence carries that rank and a self-row
  taxon_id exists in `stg_inat__taxon_lineage_extended` / the higher-rank machinery — otherwise skip
  that rung. Do not invent taxon_ids.
- **D-02 (CORRECTED by 128-RESEARCH.md — supersedes the original draft):** Source the genus
  taxon_id from `data/raw/taxa.csv.gz` filtered to `rank='genus' AND active='true'`, disambiguated by
  **Anthophila ancestry** (`630955` in the ancestry chain). Do NOT source from
  `higher_rank_taxon_ids.json` (it picks the WRONG Stelis — plant 141523 instead of bee 127831 — via
  Python dict-overwrite) and do NOT join `stg_inat__taxon_lineage_extended` on `subgenus IS NULL`
  (it fans out across species/subspecies rows and is Anthophila-filtered, dropping non-bee genera
  inconsistently). Add a new staging model (e.g. `stg_inat__genus_taxon_ids`) that reads `../raw/taxa.csv.gz`
  and exposes `genus_name (lowercase) → genus_taxon_id (INTEGER)`. Still no new iNat API calls/downloads —
  `taxa.csv.gz` is already downloaded by the pipeline. Consistent with Phase 126's "surface, don't rebuild".
- **D-03:** Join key is the occurrence's **single-token post-synonymy `canonical_name`** (the path
  already wired through `int_combined`'s 3 ARMs), normalized lowercase to match the genus staging model.
  Guard the COALESCE with `ctt.taxon_id IS NULL` (only backfill rows that lack a species taxon_id) AND
  single-token detection (`position(' ' IN canonical_name)=0`) so species-level rows are never touched.
- **D-07 (non-bee genera — per RESEARCH A3, recommended):** Apply the Anthophila filter so non-bee
  bycatch genera (crossocerus, larropsis, plecoptera, symphyta, trypoxylon — wasps/sawflies, ~46 rows)
  stay NULL rather than receiving a genus taxon_id. Consistent with Phase 126 D-09 (KNOWN_NON_BEES
  excludes non-bee rows). The not_null test (D-04) must then exclude these non-bee genera, mirroring the
  3-species exclusion. Net backfill targets bee genera only (~36 single-token genera minus ~5 non-bee).
- **Subgenus/tribe/family rungs (per RESEARCH A2):** backfill **0 additional rows** today — omit them.
  Genus is the complete solution. The COALESCE ladder is effectively species → genus.

### not_null test re-scope (TID-02 acceptance)
- **D-04:** Replace the occurrences `taxon_id` not_null data_test's `where: "canonical_name like '% %'"`
  filter with one that asserts non-null for **every row with any identification** — i.e. rows where a
  taxon_id *should* now exist. Concretely: rows with a non-null/non-empty `canonical_name` OR a
  non-empty `genus`. Truly-unidentified rows (no canonical_name and no genus) are excluded from the
  assertion. Keep it `severity: warn` (matches Phase 126 D-01 relaxation and the nightly-gate culture)
  unless the planner finds a strict constraint is safe given the 3 unresolvable species.
- **D-05:** The 3 unresolvable ecdysis species (`anthidiellum robertsoni`, `osmia phaceliae`,
  `lasioglossum aspilurus`) have two-token canonical_names but no taxon_id, so a naive "canonical_name
  present → must be non-null" test would flag them. The test must tolerate this documented set —
  either via the same exclusion mechanism Phase 126 used (test WHERE clause excluding those 3 names,
  see `data/tests/`) or by scoping to genus presence. Carry the exclusion forward; do not regress it.

### D-03 consistency invariant (carried from Phase 126)
- **D-06:** Phase 126's invariant `occurrences.taxon_id == species.taxon_id` (0 mismatches across
  32,402 joinable rows) holds only for **species-level** rows. Genus-level rows now point at a genus
  taxon_id, which is NOT a species mart row — so the consistency test (`test_taxon_id_consistency`
  in `data/tests/`) MUST be scoped to species-level occurrences only (e.g. join only where the
  occurrence's canonical_name is two-token / matches a species row). Update the test so genus-level
  backfilled rows do not create false mismatches. Use Phase 127's consistency-test scoping as precedent.

### Claude's Discretion
- Whether the COALESCE lives in `int_combined.sql` (per-ARM) or the `occurrences.sql` mart SELECT —
  planner picks the site that keeps the 3 ARMs consistent and matches the existing taxon_id join style.
- Exact subgenus/tribe/family inclusion: include only ranks with a confirmed self-row taxon_id and a
  usable occurrence-side key; genus is mandatory, the finer/higher rungs are best-effort.
- Whether to keep the not_null test `severity: warn` or promote to strict (must still pass the build).
- Test file organization (extend existing taxon_id tests vs. new file).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 126/127 deliverables this phase extends (do not rebuild)
- `data/dbt/models/marts/occurrences.sql` — `taxon_id` selected (line ~94, `j.taxon_id`); 37-col contract.
- `data/dbt/models/marts/schema.yml` — occurrences `taxon_id` not_null data_test (`severity: warn`,
  `where: "canonical_name like '% %'"`) — the test to re-scope (D-04).
- `data/dbt/models/intermediate/int_combined.sql` — 3 ARMs (ARM1 `ctt`, ARM2/WABA `ctt_w`, ARM3
  `ctt_io`), each joins `stg_inat__canonical_to_taxon_id` on post-synonymy `canonical_name`. The
  finest-rank COALESCE attaches here or in the mart.
- `data/dbt/models/staging/stg_inat__taxon_lineage_extended.sql` — lineage + self-row taxon_ids for
  genus/family (subgenus/tribe per Phase 126 RD-02). The genus taxon_id source for the backfill.
- `data/species_export.py` — `_build_higher_rank_taxon_ids` (the genus/subgenus/tribe → taxon_id map
  that produced `public/data/higher_rank_taxon_ids.json`); confirms genus self-rows resolve.
- `data/tests/` — Phase 126/127 taxon_id tests: non-null assertion (the `_SPECIES_GUARD` /
  `canonical_name like '% %'` pattern), `test_taxon_id_consistency` (D-06 scoping target). Find exact
  filenames; these are the tests to update.

### Decision provenance
- `.planning/phases/126-taxon-ids/126-VERIFICATION.md` — frontmatter `human_decision` (TID-02 re-scope,
  the 3/4 score, the bucket counts); `126-CONTEXT.md` D-03 (occurrence taxon_id semantics).
- `.planning/phases/127-inactive-taxon-remapping/127-VERIFICATION.md` — consistency-test + dormant-mechanism
  precedent for honest test scoping.
- `.planning/REQUIREMENTS.md` — re-scoped TID-02 wording + traceability (Phase 126 → 128).

### Project ops
- `CLAUDE.md` — dbt 37-column occurrences contract enforced at every `bash data/dbt/run.sh build`;
  pipeline is dbt-only; nightly via `data/nightly.sh` on maderas. Local: `cd data && uv run python run.py`
  or rebuild dbt only via `bash data/dbt/run.sh build`.

</canonical_refs>

<specifics>
## Specific Ideas

- Verification target after this phase: `occurrences.parquet` shows the 29 genus names (lasioglossum,
  osmia, melissodes, megachile, bombus, hylaeus, ceratina, halictus, …) with their genus taxon_id;
  the ~21,212 truly-unidentified rows still NULL; the 37-column contract still passes.
- Genus taxon_id sample resolutions (authoritative source `taxa.csv.gz` rank=genus active=true +
  Anthophila ancestry, NOT the flawed json): lasioglossum→57678, hylaeus→127812, triepeolus→178745,
  coelioxys→199145, hoplitis→177785, stelis→127831 (bee, NOT plant 141523). Per RESEARCH the live
  sandbox build shows 36 single-token genera / 17,254 NULL rows; ~5 are non-bee bycatch (kept NULL per
  D-07). Exact backfill counts to be confirmed by the planner/executor against the current build —
  my earlier "29 genera / 12,674 rows via higher_rank_taxon_ids.json" figure was on a different build
  AND used the flawed json source; treat RESEARCH.md's taxa.csv.gz numbers as authoritative.
- This is the final blocker for the v4.5 milestone close — after verify, re-run `/gsd:complete-milestone v4.5`.

</specifics>

<deferred>
## Deferred Ideas

- Assigning a root "bees" (Apoidea/Anthophila) taxon_id to truly-unidentified specimens — explicitly
  rejected by the user as semantically meaningless for an iNat link. Out of scope.
- Manual resolution of the 3 unresolvable ecdysis species — pre-existing data-quality issue, not this phase.
- Frontend display of genus-level taxon links on occurrence/sidebar views — not requested; data-layer only.

</deferred>

---

*Phase: 128-occurrence-finest-rank-taxon-backfill*
*Context gathered: 2026-06-01 (milestone-close session, captured from Phase 126 verification findings)*
