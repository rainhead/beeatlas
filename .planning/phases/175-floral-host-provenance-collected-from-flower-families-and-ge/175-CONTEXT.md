# Phase 175: Floral Host Provenance ("Collected from") — Context

**Gathered:** 2026-06-30 (interactive discovery + 2 scoping decisions)
**Status:** Ready for planning — decisions below are LOCKED, do not revisit.

<domain>
## Task Boundary

Surface, per bee species, the **observed floral hosts** — flower FAMILIES with their
GENERA nested underneath — on the species detail page, derived from actual sample/collection
data. This is DISTINCT from the v7.0 literature-based `host_plant_family` / `diet_breadth`
trait (which is a specialist's literature-recorded host); this phase is what bees were
*actually sampled off of* in the field.
</domain>

<decisions>
## Locked Implementation Decisions

### Source of the host link
- Use iNat host-plant observations via `occurrence_links.host_observation_id`
  (`stg_ecdysis__occurrence_links` → `inaturalist_data.observations`). This resolves for
  **534 bee species / 26,190 specimens** — high coverage.
- The Ecdysis free-text `floralHost` (regex `host:"..."` from `associated_taxa`, only 161
  species / 2,640 rows) is **NOT** used this phase. Possible later supplement; out of scope.

### Families AND genera
- Show both. Genus comes free from the host taxon name (`taxon__name` at species/genus rank
  → genus = first token, or the name itself at genus rank).
- **Family is the new work:** the existing `inaturalist_data.taxon_lineage_extended` is
  Anthophila-only (built by `taxa_pipeline.load_taxon_lineage_extended` with filter
  `ancestry LIKE '%/630955/%'`), so it has NO plant taxa.

### Plant family/genus resolution (the pivotal new piece)
- Add a pipeline step that **mirrors `taxa_pipeline.load_taxon_lineage_extended`** — walk the
  ancestry column of the already-downloaded `data/raw/taxa.csv.gz` (full iNat Open Data
  taxonomy, all kingdoms) for the **observed host plant taxon_ids** → `(taxon_id, family, genus)`.
  NO new iNat API calls. Materialize as a plant-host lineage table/seed in `inaturalist_data`
  (e.g. `host_plant_lineage`), staged via a `stg_inat__host_plant_lineage` view.
- Scope: the observed host taxon_id set (~915 distinct host taxa, ~396 genera), not all of
  Plantae (kingdom 47126), to keep the walk bounded. (Plumb the host-taxon-id set from the
  observations linked as hosts.)
- NOTE: `data/raw/taxa.csv.gz` is NOT present in local dev (37 MB, downloaded only in the
  nightly `download-taxa` step). So the family arm cannot be fully validated locally without
  downloading it — see [[project_local_dbt_build_not_runnable]]. Plan the verification around
  that (download once for a local check, or validate the SQL shape + defer family-coverage
  assertion to the nightly). The genus arm IS locally checkable from the DB.

### Aggregation
- New dbt intermediate (e.g. `int_species_host_plants`): per bee `canonical_name`, the
  distinct `(family, genus)` hosts, each with a **distinct-sample count** (count distinct
  `host_observation_id`, the sample proxy — NOT raw specimen rows), ordered by sample count desc.
- Apply bee-name synonymy consistently with other species aggregates (the occurrence
  `canonical_name` is already synonym-resolved upstream — confirm during planning).

### Output artifact
- A SEPARATE sidecar JSON **`species_hosts.json`** keyed by `canonical_name`, nested
  families→genera with counts — modeled on `seasonality.json` / `photos.json` produced by
  `species_export.py`. NOT a `species.parquet` column: the nested structure doesn't fit the
  flat mart and a sidecar keeps the enforced dbt contract on `marts/species` UNTOUCHED.
- Wire it into the export step (`species_export.py` writes the other sidecars there) and the
  deploy fetch/manifest pattern used for other generated `public/data/` artifacts
  ([[feedback_no_committed_data_artifacts]] — do NOT commit the generated JSON).

### Display
- `_pages/species-detail.njk`: a "Collected from" block — families with genera nested,
  sample-count ordered, with a "+N more families" cap (and likely a genus cap per family).
  Chosen layout (preview the user approved):
  ```
  Collected from
    Asteraceae · Solidago, Grindelia, Ericameria, Cirsium
    Rosaceae · Rosa, Rubus
    Boraginaceae · Phacelia
    Fabaceae · Lupinus
    (+4 more families)
  ```
- Add an Eleventy `_data` loader for the sidecar (mirror how `species.js` / existing `_data`
  feeds load generated JSON). 534 species render the block; the rest omit it entirely.
- Placement: near the existing Traits fact-sheet on the detail page (planner to choose exact
  position; keep it visually consistent with v7.0 traits styling).

### Claude's Discretion (decide during planning)
- Exact table/seed naming, the genus-per-family and family display caps, the sidecar JSON
  shape (array-of-families vs object), and whether host counts are shown numerically.
- Whether to split into 2 plans (data pipeline; then UI) or 1 plan with waves.
</decisions>

<data_findings>
## Data Findings (from live `beeatlas.duckdb` + `public/data/occurrences.parquet`)

- `occurrence_links.host_observation_id` → iNat plant observation: **43,734** occ rows have it;
  **26,190** of those carry a bee `canonical_name`; **534** distinct bee species covered.
- Host taxa are overwhelmingly **Plantae** (24,784 of resolved), ranks mostly `species`
  (19,137) and `genus` (4,441); long tail of family/tribe/etc.
- `inaturalist_data.observations` host taxon fields: `taxon__id`, `taxon__name`, `taxon__rank`,
  `taxon__iconic_taxon_name` (= 'Plantae' for plants) — but NO family/genus (hence the lineage walk).
- ~915 distinct host `taxon__id`, ~396 distinct host genera.
- Example — *Bombus mixtus* top host genera by specimen count: Symphoricarpos, Rubus, Vaccinium,
  Leucanthemum, Rosa, Lupinus, Phacelia, Brassica.
- Plant-family resolution mechanism reference: `data/taxa_pipeline.py`
  (`load_taxon_lineage_extended`) — ancestry walk over `raw/taxa.csv.gz`, pivot rank→name.
  Bee build filters to Anthophila; plant build seeds from the observed host taxon_id set.
</data_findings>

<canonical_refs>
## Canonical References
- `data/taxa_pipeline.py` — lineage walk to mirror for plants
- `data/dbt/models/intermediate/int_ecdysis_base.sql` — `host_observation_id`, `floralHost`, `inat_host`
- `data/dbt/models/intermediate/int_samples_base.sql` — iNat sample model (`sample_host`, specimen_count, sample_id)
- `data/dbt/models/staging/stg_inat__observations.sql`, `stg_ecdysis__occurrence_links.sql`
- `data/species_export.py` — sidecar JSON producers (seasonality.json/photos.json pattern)
- `_pages/species-detail.njk` — Traits fact-sheet (placement/styling reference)
- `CLAUDE.md` Domain Vocabulary (Specimen / Sample / Floral host / Observation)
</canonical_refs>
