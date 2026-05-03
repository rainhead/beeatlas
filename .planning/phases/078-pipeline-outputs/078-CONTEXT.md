# Phase 78: Pipeline Outputs — Context

**Gathered:** 2026-05-03
**Status:** Pre-planning — context captured before lineage-expansion phase (Phase 77) was inserted; this phase formerly numbered 77.
**Source:** Captured mid-`/gsd-plan-phase 77` (pre-renumber) after the researcher surfaced four locked decisions

> **Note on phase number.** During the original /gsd-plan-phase 77 the researcher discovered the iNat lineage bridge covers only ~31% of species (227/738). The user inserted a new phase before this one to expand coverage to ≥95% before aggregating. This phase was renumbered from 77 to 78 on 2026-05-03 (see ROADMAP.md). The decisions below remain valid; references to "Phase 77" elsewhere in this file mean the original (now-Phase-78) Pipeline Outputs work unless otherwise marked.

<domain>
## Phase Boundary

Pipeline emits a single source of truth for per-species aggregates and per-species occurrence maps that downstream Eleventy pages can consume without ever touching parquet at request time.

Specifically: `data/run.py` produces `public/data/species.parquet`, `public/data/species.json`, `public/data/seasonality.json`, and one `public/data/species-maps/<slug>.svg` per species with `occurrence_count > 0`.

</domain>

<decisions>
## Implementation Decisions

### D-01 Lineage coverage strategy [LOCKED]
The previous phase (lineage expansion, formerly the goal of /gsd-plan-phase 77 itself) is responsible for resolving species names → iNat taxon_ids so that `taxon_lineage_extended` covers ≥95% of species in the FULL OUTER union. **This phase assumes that work has shipped.** species_export.py uses `COALESCE(checklist, iNat-via-bridge)` precedence per TAX-02; genus falls back to `split_part(canonical_name, ' ', 1)` when both checklist and iNat are NULL.

### D-02 `state_fips` is config-driven [LOCKED]
`state_fips = '53'` (Washington) is sourced from project config, not hardcoded in `species_maps.py`. Likely location: `pyproject.toml` `[tool.beeatlas]` or `data/config.py`. Reason: multi-state expansion is on the project roadmap (see project memory `project_multi_state_expansion.md`).

### D-03 SVG styling: single embedded `<style>` block [LOCKED]
Each `species-maps/<slug>.svg` declares one `<style>` block at the top with classes for `.county`, `.occ` (occurrence dots), etc. Avoids per-element fill/stroke attributes. Smaller file size for big species (Lasioglossum can have 1000+ records). MAP-02's "inline fill/stroke styling" wording is interpreted as "styling lives inside the SVG document" (vs. external CSS), which a `<style>` block satisfies.

### D-04 species-maps directory: wipe-and-rewrite each run [LOCKED]
At the start of `generate_species_maps`, `rmtree` then recreate `public/data/species-maps/`. Guarantees idempotency (success criterion 4) and prevents stale SVGs for species whose `occurrence_count` drops to zero or whose canonical name changes.

### Claude's Discretion
- Exact column order in `species.parquet` beyond AGG-02's required set
- Exact JSON shape of `species.json` and `seasonality.json` beyond AGG-04/AGG-05 (researcher recommends nested-dict for seasonality; planner can finalize)
- SVG dot size, fill color, fill-opacity (subject to D-03)
- Internal CTE structure of the species_export DuckDB query
- Whether `species.json` is generated from the parquet (post-write) or alongside it (single CTE) — both are acceptable

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pipeline architecture (Phase 76 patterns to mirror)
- `.planning/phases/076-data-foundation/076-RESEARCH.md` — canonical_name, lineage table, FULL OUTER precedent
- `.planning/phases/076-data-foundation/076-VALIDATION.md` — Validation Architecture template
- `data/run.py` — STEPS list ordering (new steps land after `export`, before `feeds`)
- `data/feeds.py::_slugify` — path-traversal-safe slug function (v2.1 hardening) — MUST be reused for SVG filenames + parquet `slug` column + URL slugs (AGG-03)
- `data/canonical.py` — canonical_name computation (Phase 76)
- `data/checklist_pipeline.py` — checklist load + species table (Phase 76)
- `data/inaturalist_pipeline.py::enrich_taxon_lineage_extended` — lineage source (Phase 76 + the lineage-expansion phase)
- `data/export.py` — existing parquet export idiom

### Schema gate
- `scripts/validate-schema.mjs` — must be extended for `species.parquet` columns + `species.json` shape (AGG-06)

### Roadmap and requirements
- `.planning/ROADMAP.md` — Phase 78 success criteria; downstream Phases 80–82 consume these artifacts
- `.planning/REQUIREMENTS.md` — AGG-01..AGG-07, MAP-01..MAP-06

### Research artifact for this phase
- `.planning/phases/078-pipeline-outputs/078-RESEARCH.md` — full research output including FULL OUTER pattern, INT[12] parquet behavior, `_slugify` reuse, ST_AsGeoJSON tolerance, SVG generation strategy, idempotency risks

</canonical_refs>

<specifics>
## Specific Ideas

- WA bbox (verified by researcher 2026-05-03): `(-124.85, 45.54) → (-116.92, 49.00)`; 39 counties in `state_fips = '53'`; 66 ecoregion_l3 polygons intersect WA
- ST_SimplifyPreserveTopology tolerance 0.005 sufficient for 600×320 viewport
- DuckDB writes `INTEGER[12]` to parquet as `LIST<INT_32>` — schema validator must check structure, not the `[12]` suffix (verified end-to-end)
- Estimated `seasonality.json` payload ~600 KB raw / ~150 KB gzipped vs. 6 MB budget — comfortable
- Current data: 348 matched + 179 checklist-only + 208 occurrence-only = 735 species in FULL OUTER union (live DB query 2026-05-03)
- `public/data/occurrences.parquet` does NOT currently carry `canonical_name` — Phase 78 must extend `data/export.py` to materialize it before species aggregation can join (research Pitfall #6)

</specifics>

<deferred>
## Deferred Ideas

- Multi-state generalization of WA bbox + viewBox + county loader (the `state_fips` config field is the single concession to multi-state in this phase; broader generalization waits until a second state is concretely scoped)
- Consolidating the two iNat lineage tables (`inaturalist_waba_data.taxon_lineage` narrow vs. `inaturalist_data.taxon_lineage_extended` wide) — Phase 76 D-03 deferred to v3.3+
- Static `genus → family` map fallback (`data/genus_family_map.csv`) — superseded by D-01 (lineage-expansion phase covers ≥95% so the fallback is unneeded)

</deferred>

---

*Phase: 078-pipeline-outputs (renumbered from 077 on 2026-05-03)*
*Context captured 2026-05-03 mid-/gsd-plan-phase 77 conversation, before lineage-expansion phase insertion*
