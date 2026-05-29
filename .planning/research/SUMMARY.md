# Research Summary: v4.5 iNat Taxonomy & Species Completeness

**Project:** Washington Bee Atlas — iNat Taxonomy & Species Completeness
**Researched:** 2026-05-29
**Confidence:** HIGH overall

---

## Executive Summary

The v4.5 milestone closes a correctness gap: 65 observed bee species (1,745 Ecdysis occurrences) are currently invisible on the site because `specific_epithet` flows exclusively from the Bartholomew 2024 WA checklist and is NULL for occurrence-only species. The fix is a one-expression COALESCE in `int_species_universe.sql` — no new dependencies, no schema contract change, immediate user-visible improvement. All four milestone features are achievable with the existing stack (Python 3.14+, dbt-duckdb 1.10.1, DuckDB 1.5.2, taxa.csv.gz already on disk).

**Recommended build order:** specific_epithet fix → taxon_id propagation → ancestor chain materialization → inactive taxon remapping.

---

## Stack Additions

**No new dependencies required.** taxa.csv.gz (already downloaded) is sufficient for all four features.

- **DwC-A taxonomy archive: disqualified.** Lacks `acceptedNameUsageID`/`taxonomicStatus` for inactive taxa, omits intermediate ranks, and uses URL-form parent IDs. This was the v4.0 decision; it holds.
- **Inactive taxa remapping:** iNat API `GET /v1/taxa/{id}` (`current_synonymous_taxon_ids` field) is the authoritative source — already called via `requests` in `resolve_taxon_ids.py`.
- **Ancestor queries:** DuckDB's `string_split` + ancestry LIKE pattern replaces recursive CTEs.

Do NOT add: DwC-A download, pandas, polars, new HTTP clients.

---

## Feature Table Stakes vs. Differentiators

| Feature | Priority | Complexity |
|---------|----------|------------|
| `specific_epithet` backfill (65 invisible species) | Must-have | Low — one COALESCE expression |
| `taxon_id` in species.parquet + occurrences.parquet | Must-have | Low — column already joined, not emitted |
| Inactive taxon remapping + `taxon_status` flag | Must-have | High — new pipeline + dbt model |
| Ancestor chain materialization (`ancestors.parquet`) | Should-have (MPTT prep) | Medium — extend taxa_pipeline.py |
| iNat species page link from taxon_id | Should-have | Low — one template line |
| Frontend subtaxon queries | Defer (future milestone) | High |

---

## Architecture

### Key Integration Points

1. **`specific_epithet` fix:** `int_species_universe.sql` line 90 — change `c.specific_epithet AS specific_epithet` to a COALESCE with `string_split(canonical_name, ' ')[2]`. `stg_inat__taxon_lineage_extended` does NOT have specific_epithet, so derivation from canonical_name is correct.

2. **`taxon_id` propagation:** `int_species_universe` already LEFT JOINs `stg_inat__canonical_to_taxon_id` (lines 123-126) but doesn't emit `taxon_id` in SELECT. Add to `int_species_universe` SELECT → `species.sql` mart → `species_export.py`. Add LEFT JOIN in `occurrences.sql`. Follow 6-step contract expansion procedure for `schema.yml`.

3. **Inactive taxon remapping:** New components: `load_inactive_taxon_remappings` in `taxa_pipeline.py` → `inaturalist_data.inactive_taxa` → `stg_inat__inactive_taxa.sql` → `int_inactive_taxon_synonyms.sql` → UNION ALL with `occurrence_synonyms` seed at JOIN sites in `int_combined` and `stg_checklist__species`. **Manual seed entries win** (defined as precedence rule before any code).

4. **Ancestor chain:** Extend `taxa_pipeline.py` to write `ancestor_ids VARCHAR` (slash-separated) to `taxon_lineage_extended`. New `models/marts/ancestors.sql` external parquet mart. **Do not embed in `species.json`** — bloats Eleventy memory load. Use VARCHAR not INTEGER[] to avoid DuckDB 1.5.2 array materialization bug.

### New Files
- `data/dbt/models/staging/stg_inat__inactive_taxa.sql`
- `data/dbt/models/intermediate/int_inactive_taxon_synonyms.sql`
- `data/dbt/models/marts/ancestors.sql`

### Modified Files
- `data/taxa_pipeline.py` — add `load_inactive_taxon_remappings`, add ancestor_ids to lineage
- `data/dbt/models/intermediate/int_species_universe.sql` — specific_epithet COALESCE + taxon_id SELECT
- `data/dbt/models/intermediate/int_combined.sql` — UNION ALL with inactive synonyms
- `data/dbt/models/marts/species.sql` — taxon_id column
- `data/dbt/models/marts/occurrences.sql` — taxon_id column (schema contract expansion)
- `data/species_export.py` — taxon_id in PyArrow schema
- `data/run.py` — new `inactive-taxon-remappings` step

### Build Order (DAG)
`taxa-download` → `taxon-lineage-extended` (modified) → `inactive-taxon-remappings` (new) → `dbt-build` → `species-maps` (for 65 new species) → `sqlite-export` → `eleventy-build`

---

## Watch Out For

### P0 — Will break silently

1. **Slug/SVG map pipeline ordering:** 65 new species pages require SVG maps generated and uploaded to S3 before the Eleventy build runs. Verify `run.py` step ordering before Phase 125 UAT or new pages will 404.

2. **`occurrences` contract expansion procedure:** Never copy sandbox parquet directly to `public/data/` — silently nulls `county`/`ecoregion_l3`. Fix "30 cols" docstring in `test_dbt_diff.py` (actual is 36 cols) as pre-work before any column changes.

3. **Inactive vs. manual synonym conflict:** Both `int_inactive_taxon_synonyms` and `occurrence_synonyms.csv` can emit a different `accepted_name` for the same source name. Implement conflict detection query before wiring UNION ALL; document that manual seed wins.

### P1 — Requires care

4. **`INTEGER[]` array corruption risk:** DuckDB 1.5.2 has a documented materialization bug for array-type columns in TABLE models (fixed for `month_histogram`). Use VARCHAR slash-separated for ancestor chain to avoid this.

5. **`resolve_taxon_ids.py` name scope gap:** Queries Ecdysis + checklist only — iNat ARM 3 canonical names not in either source have no `taxon_id` in the bridge. Verify count in Phase 124 pre-work; extend scope if needed.

---

## Suggested Phase Structure

**Phase 124 (pre-work):** Fix `test_dbt_diff.py` "30 cols" docstring; audit `resolve_taxon_ids.py` name scope; enumerate inactive taxa in current `canonical_to_taxon_id`. Fast phase, enables safe execution of subsequent phases.

**Phase 125 (`specific_epithet` backfill):** COALESCE in `int_species_universe.sql`; pipeline ordering verification; SVG maps + S3 upload for 65 new species; Eleventy new pages. Highest user impact, lowest risk.

**Phase 126 (`taxon_id` propagation):** Add to `int_species_universe` SELECT, `species.sql`, `occurrences.sql`, `species_export.py`; contract expansion in `schema.yml`; iNat link on species page template.

**Phase 127 (ancestor chain):** Extend `taxa_pipeline.py`; `ancestors.sql` mart; spot-check array/varchar correctness; add to `nightly.sh` S3 upload.

**Phase 128 (inactive taxon remapping):** Precedence policy + conflict detection; `load_inactive_taxon_remappings` in `taxa_pipeline.py`; new staging/intermediate dbt models; UNION ALL synonymy; `taxon_status` column.

---

## Overall Confidence: HIGH

All integration points verified against live code. Pitfalls derived from documented failure modes in project history (month_histogram, schema contract expansion). Primary unknown: count of iNat ARM 3 species missing from `canonical_to_taxon_id` (Phase 124 action item).

*Research completed: 2026-05-29*
*Ready for requirements: yes*
