# Architecture Research

**Project:** BeeAtlas v4.0 — Checklist Records + DwC-A Taxonomy
**Researched:** 2026-05-23
**Confidence:** HIGH — all findings from direct codebase inspection

---

## Data Layer Options (with recommendation)

### Question 1: Where does checklist fit in the dbt layer?

**Recommendation: checklist records do NOT go into `marts/occurrences`. They get a separate `checklist.parquet` export.**

Rationale follows from the existing architecture and what checklist data actually is:

**What `checklist_data.species` contains today:** One row per species (565 rows). Columns: `scientificName`, `canonical_name`, `genus`, `specific_epithet`, `family`/`subfamily`/`tribe`/`subgenus` (NULL until lineage backfill), `status`, `source_citation`. No lat/lon. No date. No individual occurrence rows.

The checklist TSV at `data/checklists/wa_bee_checklist.tsv` has two columns: `species` and `county`. It is 2,862 rows (one row per species-county presence assertion). There are no individual occurrence events with coordinates to spatial-join — "Andrena aculeata was observed in Whitman County" is a range assertion, not a point record.

**Why not extend `marts/occurrences`:**
- The 31-column `occurrences` contract has `contract.enforced: true` in `models/marts/schema.yml`. Every column must be present on every row. Checklist data lacks `ecdysis_id`, `catalog_number`, `lon`, `lat`, `date`, `year`, `month`, `recordedBy`, `fieldNumber`, `floralHost`, `host_observation_id`, and every other specimen/sample field. Adding a checklist arm via UNION ALL would require NULLing out 20+ columns, and the resulting rows would be indistinguishable from malformed data by the frontend's `occIdFromRow` and type predicates.
- Adding a `source` discriminant column to the contract while NULLing the rest is possible but violates the spirit of the contract: `occurrences` currently has structural integrity (ARM 1 = Ecdysis+iNat rows with lat/lon, ARM 2 = provisional WABA rows with lat/lon). Checklist rows have no coordinates.
- The `int_combined` UNION ALL feeds `int_species_occurrences_agg` which counts rows to populate `occurrence_count`, `specimen_count`, `month_histogram`. Injecting coordinate-free checklist rows into that aggregation would corrupt the counts.

**What checklist.parquet should contain:**
A county-level presence table. One row per (canonical_name, county) from `checklist_data.species_counties`, enriched with lineage columns from `stg_inat__taxon_lineage_extended`. No lat/lon. This is a range layer, not an occurrence layer.

**Schema for `checklist.parquet` (proposed):**

| Column | Type | Source |
|--------|------|--------|
| `canonical_name` | VARCHAR | checklist_data.species |
| `scientificName` | VARCHAR | checklist_data.species |
| `genus` | VARCHAR | checklist_data.species |
| `specific_epithet` | VARCHAR | checklist_data.species |
| `family` | VARCHAR | taxon lineage (backfilled) |
| `county` | VARCHAR | checklist_data.species_counties |
| `status` | VARCHAR | checklist_data.species (verified / likely-to-occur) |
| `source` | VARCHAR | constant 'checklist' (satisfies EXT-01) |

This is a new dbt mart (`models/marts/checklist.sql`, external parquet) and a new export artifact. It does not touch `occurrences.sql` or its 31-column contract.

**`source` field placement:** The `source` field (EXT-01) belongs in `checklist.parquet` as a constant string `'checklist'`, not in `occurrences.parquet`. The frontend discriminates data source via the parquet file it loaded from (occurrences vs checklist), not via an in-row field. If future sources (GBIF, other Bee Atlas programs) are added to the occurrences table, `source` would need to enter the contract at that time — that is a separate future decision. For v4.0, adding `source VARCHAR` to `checklist.parquet` satisfies EXT-01 without touching the protected `occurrences` contract.

---

## DwC-A Taxonomy Pipeline Design

### Question 3: Cache location, ancestor-walk algorithm, and lineage table supersession

**Cache location: gitignored local file, with nightly.sh S3 sync**

The iNat DwC-A is ~150MB compressed. The correct analogy is the Ecdysis HTML cache (`data/html_cache/`, gitignored, synced to S3 by `nightly.sh`). Do not commit the archive to the repo. Store it at `data/dwca_cache/` (gitignored). The nightly script should S3-sync this directory on restore and after a successful run, mirroring the pattern already used for the HTML cache.

Monthly download cadence: the DwC-A is published monthly. The pipeline should check the archive `Last-Modified` header (or ETag) against a stored value before re-downloading. Skip download if current. On first run (or when stale), download, unzip, filter, and rebuild the lineage table.

Download URL: `https://www.inaturalist.org/taxa/inaturalist-taxonomy.dwca.zip` (the full iNat taxonomy export). It contains `Taxon.tsv` with columns including `taxonID`, `parentNameUsageID`, `scientificName`, `taxonRank`, and `canonicalName`.

**Ancestor-walk algorithm: DuckDB recursive CTE**

The Taxon.tsv parent-pointer structure maps directly to a SQL recursive CTE. DuckDB supports `WITH RECURSIVE`. The algorithm:

1. Load `Taxon.tsv` into a DuckDB table `dwca_data.taxa(taxon_id, parent_id, scientific_name, rank)` — filtered to rows where `rank IN ('family','subfamily','tribe','genus','subgenus','species')` or are ancestors of target taxa.
2. Given a set of seed taxon IDs (all canonical_name-resolved taxon IDs from `canonical_to_taxon_id`), walk up to the root with a recursive CTE:

```sql
WITH RECURSIVE ancestors AS (
    SELECT taxon_id, parent_id, scientific_name, rank, 0 AS depth
    FROM dwca_data.taxa
    WHERE taxon_id IN (SELECT taxon_id FROM inaturalist_data.canonical_to_taxon_id)
    UNION ALL
    SELECT t.taxon_id, t.parent_id, t.scientific_name, t.rank, a.depth + 1
    FROM dwca_data.taxa t
    JOIN ancestors a ON t.taxon_id = a.parent_id
    WHERE a.depth < 20  -- guard against cycles
)
SELECT seed_id, rank, scientific_name FROM ancestors
```

3. Pivot the result to produce `(taxon_id, family, subfamily, tribe, genus, subgenus)` — identical schema to `taxon_lineage_extended`.

This is pure DuckDB SQL, faster than iterative Python batch requests, and eliminates all iNat API calls for the lineage walk. The only remaining API calls are in `resolve_taxon_ids.py` (canonical_name → taxon_id bridge), which hits `/v1/taxa?q=` search for name lookups. Those are small-N and already well-handled.

**How the unified lineage table supersedes the two existing tables:**

Current state:
- `inaturalist_waba_data.taxon_lineage` — built by `waba_pipeline.enrich_taxon_lineage`, covers WABA taxon IDs only, columns: `(taxon_id, genus, family)`
- `inaturalist_data.taxon_lineage_extended` — built by `inaturalist_pipeline.enrich_taxon_lineage_extended`, covers UNION of inat + waba taxon IDs + bridge IDs, columns: `(taxon_id, family, subfamily, tribe, genus, subgenus)`

Target state after TAX-01/TAX-02:
- A new `dwca_pipeline.py` step downloads the archive, loads `Taxon.tsv` into `dwca_data.taxa`, walks ancestors for all seed IDs in `canonical_to_taxon_id`, and writes `inaturalist_data.taxon_lineage_extended` with the same schema as today.
- `enrich_taxon_lineage` in `waba_pipeline.py` is deleted. `enrich_taxon_lineage_extended` in `inaturalist_pipeline.py` is deleted.
- The dbt staging view `stg_inat__taxon_lineage_extended` is unchanged — it still reads from `inaturalist_data.taxon_lineage_extended`. The table is now populated by the DwC-A step instead of the API step.
- `stg_waba__taxon_lineage` staging view can be removed if `int_species_universe` no longer needs the narrower WABA-only lineage (it already uses `stg_inat__taxon_lineage_extended` as its join target).
- `run.py` STEPS: replace `("taxon-lineage-extended", enrich_taxon_lineage_extended)` with `("dwca-taxonomy", build_dwca_lineage)`.

The `canonical_to_taxon_id` bridge table (`resolve_taxon_ids.py`) remains: it maps canonical_name strings to iNat taxon IDs and is still needed as the seed set for the ancestor walk. The DwC-A replaces only the ancestor-walk HTTP fan-out; it does not replace the name-lookup step.

**iNat vs GBIF DwC-A decision:** Use the iNat DwC-A, not GBIF's. The existing bridge table uses iNat taxon IDs. The ancestor walk must use the same taxon ID namespace or the joins break. GBIF uses a different ID namespace.

---

## Frontend Integration Points

### Question 4: checklist.parquet loading, initialization, and Mapbox layer stack

**Loading sequence change:**

`sqlite.ts` currently has `loadOccurrencesTable()` which loads `occurrences.parquet` and resolves `tablesReady`. For checklist, a parallel `loadChecklistTable()` function is needed. The two can load concurrently (no dependency between them).

Current `tablesReady` promise gates all occurrence feature creation in `features.ts`. Checklist loading needs its own readiness gate. The cleanest approach: export `checklistReady: Promise<void>` from `sqlite.ts`, resolved after the checklist table is inserted. Checklist layer creation in `bee-atlas.ts` awaits `checklistReady`. Both `loadOccurrencesTable()` and `loadChecklistTable()` are called in parallel from `bee-atlas.ts` `connectedCallback`.

**SQLite table for checklist:**
```sql
CREATE TABLE checklist (
  canonical_name TEXT,
  scientificName TEXT,
  genus TEXT,
  specific_epithet TEXT,
  family TEXT,
  county TEXT,
  status TEXT,
  source TEXT
)
```

The checklist table does not have an `occId` column — checklist records are county-range assertions, not point occurrences. They cannot be clicked like occurrence features.

**manifest.json change:**
Add `checklist` key pointing to the hashed `checklist.parquet` filename. The `Manifest` interface in `manifest.ts` needs a `checklist` field. `resolveDataUrl('checklist')` resolves it.

**Mapbox layer stack change:**

The "Checklist records" layer is a county-shading layer, not a point layer. The county-presence data (which counties a species appears in per the checklist) comes from the SQLite `checklist` table queried in `bee-atlas.ts`.

The architecture for the checklist toggle:
- A new `_checklistVisible: boolean` state property in `bee-atlas.ts`.
- When `_checklistVisible` is true and a taxon filter is active, `bee-atlas.ts` queries the SQLite `checklist` table for counties matching that canonical_name. The county array is passed to `bee-map` as a new `checklistCounties: string[]` property.
- When no taxon filter is active and `_checklistVisible` is true, query all checklist counties (or show all counties as shaded).
- `bee-map` uses `checklistCounties` to drive a `checklist-county-fill` layer using a Mapbox GL filter expression: `['in', ['get', 'county'], ['literal', [...counties]]]` on the existing `counties` GeoJSON source.
- The layer sits between the boundary fill layers and the occurrence cluster layers in render order.
- Visual style: light olive/green fill at low opacity, distinct from the blue selection highlight.

`FilterState` extension: add `checklistVisible: boolean` (default `false`). `buildParams`/`parseParams` in `url-state.ts` get a `cl=1` parameter.

`bee-filter-controls.ts`: add a toggle button for the checklist layer, following the existing toggle button pattern.

**No changes needed to `occurrence.ts`:** Checklist records are not point occurrences and do not have occurrence IDs. `occIdFromRow`, `parseOccId`, and the type predicates are unchanged.

**No changes needed to `OCCURRENCE_COLUMNS` or `OccurrenceRow`:** These describe the `occurrences` SQLite table only. The checklist table is queried via a separate code path.

---

## Species Page Build Changes

### Question 5: Checklist-only species on Eleventy pages

**Pipeline change (int_species_universe — no change needed):**

`int_species_universe` already handles checklist-only species via the FULL OUTER JOIN between `stg_checklist__species` and `occ_agg`. A checklist-only species produces a row with `occurrence_count = 0`, `specimen_count = 0`, `on_checklist = true`, `month_histogram = [0,0,...,0]`. This flows through `species.sql` into `species.parquet` and `species.json`. The pipeline already supports this.

**Eleventy data layer (`_data/species.js`):**

The `genusList` and `tribeList` arrays currently filter to `totalOccurrences > 0`. This excludes genera containing only checklist species. Change:
- `genusList` filter: `g.species.length > 0` (show genus if it has any species with `specific_epithet !== null`, regardless of occurrence count)
- `tribeList` filter: `t.genera.length > 0` (similar)
- The `speciesList` array (used in `species.njk` index) already includes all species from `flat` — no filter on occurrence_count there, so checklist-only species already appear.

**Per-species page (`species-detail.njk`):**

For checklist-only species (`occurrence_count === 0`, `on_checklist === true`):
- The `species-maps/` directory will not have an SVG for this species (unless `species_maps.py` is extended). Template must handle the absent map — show a county-presence map or a placeholder.
- Seasonality histogram shows all zeros — suppress the chart or show "No collection records yet."
- The iNat link (if `canonical_to_taxon_id` resolved it) can still be shown.

**SVG occurrence maps (`species_maps.py`):**

`species_maps.py` generates per-species SVG maps from `occurrences.parquet`. Checklist-only species have no rows there — they would produce empty SVG maps. The recommended approach: generate a county-presence SVG for checklist-only species using `checklist_data.species_counties`. This requires `species_maps.py` to:
1. Detect `on_checklist=true, occurrence_count=0` species from `species.parquet`.
2. For those species, query `checklist_data.species_counties` and shade counties on the WA SVG outline.
3. Store these as `species-maps/{Genus}/{epithet}.svg` alongside occurrence-based maps.

This means `species-detail.njk` can reference the same path for all species regardless of type — no template branching for the map img tag.

---

## Suggested Build Order

The two capabilities (checklist pipeline and DwC-A taxonomy) share one dependency: the DwC-A taxonomy provides lineage data (`family`, `subfamily`, `tribe`, `subgenus`) that checklist species need. The `resolve_taxon_ids` step is a prerequisite for both.

**Phase A — DwC-A Taxonomy (TAX-01, TAX-02)**

Build first because it unblocks lineage data for checklist species and is independently verifiable.

1. Write `dwca_pipeline.py`:
   - Download `inaturalist-taxonomy.dwca.zip` to `data/dwca_cache/`, checking `Last-Modified`/ETag to skip re-download if current.
   - Unzip, load `Taxon.tsv` into `dwca_data.taxa(taxon_id, parent_id, scientific_name, rank)` in DuckDB.
   - Recursive CTE: walk ancestors for all seed IDs from `canonical_to_taxon_id`.
   - Pivot result to `(taxon_id, family, subfamily, tribe, genus, subgenus)`.
   - Write (CREATE OR REPLACE) `inaturalist_data.taxon_lineage_extended` with that schema.
2. Delete `enrich_taxon_lineage` from `waba_pipeline.py` and its call in `load_observations`.
3. Delete `enrich_taxon_lineage_extended` from `inaturalist_pipeline.py`.
4. Update `run.py` STEPS: replace `("taxon-lineage-extended", enrich_taxon_lineage_extended)` with `("dwca-taxonomy", build_dwca_lineage)`.
5. Add `data/dwca_cache/` to `.gitignore`.
6. Add S3 sync for `dwca_cache/` to `nightly.sh` (restore before pipeline, upload after — same pattern as HTML cache).
7. Run `dbt build` and verify `test_lin05_lineage_coverage` still passes.

**Phase B — Checklist Pipeline (CHECK-01, EXT-01)**

Build after Phase A (checklist species need lineage from DwC-A for family/subfamily/tribe/subgenus backfill).

1. Verify `checklist_pipeline.py` already correctly populates `checklist_data.species` and `checklist_data.species_counties` (it does — code confirmed).
2. Write `data/dbt/models/marts/checklist.sql`:
   ```sql
   {{ config(materialized='external', location='target/sandbox/checklist.parquet', format='parquet') }}
   SELECT
       cs.canonical_name, cs.scientificName, cs.genus, cs.specific_epithet,
       COALESCE(cs.family, tle.family) AS family,
       sc.county, cs.status, 'checklist' AS source
   FROM {{ ref('stg_checklist__species') }} cs
   JOIN {{ source('checklist_data', 'species_counties') }} sc USING (scientificName)
   LEFT JOIN {{ ref('stg_inat__canonical_to_taxon_id') }} ctt ON ctt.canonical_name = cs.canonical_name
   LEFT JOIN {{ ref('stg_inat__taxon_lineage_extended') }} tle ON tle.taxon_id = ctt.taxon_id
   ```
3. Add `checklist` model to `models/marts/schema.yml` with enforced contract.
4. Update `run.py` `_run_dbt_build` to copy `checklist.parquet` from sandbox to `EXPORT_DIR` alongside `occurrences.parquet`.
5. Add `checklist` key to `manifest.json` generation.
6. Write pytest assertions: row count ≥ 2,000, no null `canonical_name`, `source = 'checklist'` for all rows.

**Phase C — Frontend Checklist Layer (CHECK-02)**

Build after Phase B produces `checklist.parquet` and the manifest key is wired.

1. Add `checklist: string` field to `Manifest` interface in `manifest.ts`.
2. Add `loadChecklistTable()` function and `checklistReady: Promise<void>` export to `sqlite.ts`.
3. Call both `loadOccurrencesTable()` and `loadChecklistTable()` in parallel from `bee-atlas.ts` `connectedCallback`. Gate checklist layer on `checklistReady`.
4. Add `checklistVisible: boolean` to `FilterState` in `filter.ts` (default `false`).
5. Add `cl=` URL param to `buildParams`/`parseParams` in `url-state.ts`.
6. Add checklist layer toggle to `bee-filter-controls.ts`.
7. Add `_checklistCounties: string[]` state to `bee-atlas.ts`; query SQLite `checklist` table when `_checklistVisible` changes or `_filterState.taxonName` changes.
8. Add `checklistCounties` property to `bee-map.ts`; add `checklist-county-fill` Mapbox layer on the `counties` source with filter `['in', ['get', 'county'], ['literal', checklistCounties]]`.

**Phase D — Species Page Changes (CHECK-03, CHECK-04)**

Build last — depends on `species.parquet` correctly containing checklist-only species with `on_checklist=true`.

1. Relax `genusList`/`tribeList` filters in `_data/species.js` to include genera with `occurrence_count === 0` but checklist species present.
2. Update species index template (`species.njk`) to show a "checklist only" badge or indicator for species with `occurrence_count === 0 && on_checklist === true`.
3. Extend `species_maps.py` to generate county-presence SVGs for checklist-only species using `checklist_data.species_counties`.
4. Update `species-detail.njk` to suppress the empty seasonality chart for zero-occurrence species.
5. Verify total Eleventy page count increases by the number of checklist-only species with no existing occurrence pages (~250-300 expected new pages).

---

## Integration Point Summary

| Component | Type | What Changes |
|-----------|------|--------------|
| `data/dwca_pipeline.py` | NEW | Downloads DwC-A archive, loads Taxon.tsv, runs recursive CTE ancestor walk, writes `inaturalist_data.taxon_lineage_extended` |
| `data/waba_pipeline.py` | MODIFIED | Delete `enrich_taxon_lineage` function and its call in `load_observations` |
| `data/inaturalist_pipeline.py` | MODIFIED | Delete `enrich_taxon_lineage_extended` function |
| `data/run.py` | MODIFIED | Replace `taxon-lineage-extended` step with `dwca-taxonomy` |
| `data/nightly.sh` | MODIFIED | Add S3 sync for `data/dwca_cache/` (restore + upload) |
| `.gitignore` | MODIFIED | Add `data/dwca_cache/` |
| `data/dbt/models/marts/checklist.sql` | NEW | External parquet mart joining checklist species + lineage + species_counties |
| `data/dbt/models/marts/schema.yml` | MODIFIED | Add checklist mart contract columns |
| `data/run.py` `_run_dbt_build` | MODIFIED | Copy `checklist.parquet` from sandbox to EXPORT_DIR |
| manifest.json generation | MODIFIED | Add `checklist` key (locate the script that writes manifest.json) |
| `src/manifest.ts` | MODIFIED | Add `checklist: string` to `Manifest` interface |
| `src/sqlite.ts` | MODIFIED | Add `loadChecklistTable()` and `checklistReady` promise export |
| `src/bee-atlas.ts` | MODIFIED | Parallel load checklist table; add `_checklistVisible` state; query checklist counties on filter/toggle change |
| `src/bee-map.ts` | MODIFIED | Accept `checklistCounties: string[]` property; add `checklist-county-fill` Mapbox layer |
| `src/filter.ts` | MODIFIED | Add `checklistVisible: boolean` to `FilterState` |
| `src/bee-filter-controls.ts` | MODIFIED | Add checklist layer toggle button |
| `src/url-state.ts` | MODIFIED | Add `cl=` param for checklist visibility |
| `src/occurrence.ts` | UNCHANGED | Checklist records have no occurrence IDs |
| `_data/species.js` | MODIFIED | Relax occurrence_count > 0 filter for genusList/tribeList |
| `_pages/species.njk` | MODIFIED | Show "checklist only" indicator for zero-occurrence species |
| `_pages/species-detail.njk` | MODIFIED | Suppress empty seasonality chart; handle absent occurrence SVG |
| `data/species_maps.py` | MODIFIED | Generate county-presence SVGs for checklist-only species |
| `data/dbt/models/staging/stg_waba__taxon_lineage.sql` | POTENTIALLY REMOVED | The narrower WABA-only lineage is superseded by `taxon_lineage_extended`; remove if `int_species_universe` no longer joins it |

---

## Key Architectural Decisions

**Checklist as county-range layer, not occurrence layer.** The checklist TSV has no coordinates. Forcing it into the `occurrences` mart to display as points would require fabricating coordinates (county centroid) and would conflate range data with collection events. The county-fill visual is both more accurate and architecturally cleaner.

**DwC-A writes to the same `taxon_lineage_extended` table.** The dbt staging view `stg_inat__taxon_lineage_extended` and all downstream models (`int_species_universe`) reference the same DuckDB table — zero dbt model changes required for the taxonomy replacement. Only the Python step that populates the table changes.

**Recursive CTE over iterative Python.** The ancestor walk is set-oriented: all seed taxon IDs walk simultaneously in a single DuckDB recursive CTE. No per-batch HTTP calls. Execution is local and fast (seconds vs minutes for the API path with 60 req/min pacing). The `_inat_get_with_retry` and `_INAT_PACE_SECONDS` constants remain in `inaturalist_pipeline.py` but are only imported by `resolve_taxon_ids.py` after the deletion — not dead code overall.

**`source` field lives in `checklist.parquet`, not `occurrences.parquet`.** Satisfies EXT-01 without touching the protected 31-column contract. Future sources that have actual occurrence coordinates can add `source` to the occurrences contract at that time.

**Parallel `tablesReady` / `checklistReady`.** The two parquet files load concurrently in `bee-atlas.ts`. Map layers depending on occurrences await `tablesReady`; the checklist county layer awaits `checklistReady`. This keeps page load time optimal — checklist.parquet is ~50KB vs occurrences.parquet at multiple MB.
