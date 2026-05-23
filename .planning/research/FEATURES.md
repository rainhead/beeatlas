# Features Research

**Domain:** Biodiversity occurrence atlas — checklist layer + offline taxonomy
**Researched:** 2026-05-23
**Milestone:** v4.0 Washington Checklist Records

---

## Checklist Layer — Table Stakes

Features users expect the moment they see a third toggle button. Missing = layer feels broken or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Toggle-able layer (on/off) | Specimens and Samples are toggle-able; a third must match | Low | Reuses existing toggle button pattern in `bee-filter-controls.ts` |
| Visually distinct point style | Users must read the difference between checklist dots and Ecdysis/iNat dots at a glance | Low | Hollow/open circle with muted stroke; see visual encoding notes below |
| Points only where coordinates exist | ~4,600 of 50,646 records lack coordinates — these must be silently excluded from the map | Low | Handled in pipeline; no special frontend logic |
| County / ecoregion filter applies | Users expect every layer to respond to active geographic filters | Medium | Requires `county` + `ecoregion_l3` in checklist rows of `occurrences.parquet` |
| Taxon filter applies | Users expect the taxon filter to hide checklist dots for non-matching species | Medium | Requires `genus`, `family`, `canonical_name` in checklist occurrence rows |
| Year / month filter does NOT apply | Many checklist records have poor or absent date precision; applying year/month filter silently drops most records | Low | Checklist rows respond to taxon + geographic filters only; date filter excluded from their WHERE clause |
| Layer persists in URL state | Layer visibility should survive a page reload and be shareable | Low | One more boolean flag in `url-state.ts`; same pattern as specimens/samples toggle |
| Occurrence ID for checklist rows | When checklist dots are clicked, they need a stable ID for sidebar detail and URL encoding | Medium | `occIdFromRow` must support a third prefix (`checklist:ObjectID`); `OccurrenceRow` gains `checklist_id` nullable column |

**Visual encoding for historical / literature records:**

The standard convention across biodiversity atlases (British Bird Atlas, Wisconsin BBA, e-Fauna BC) for pre-digital or literature-only records is:

1. **Hollow/open circle (stroke only, no fill)** — the dominant convention for records that are presence-only with no accessible physical voucher. Visually signals "this was reported, not freshly collected here." Use a muted grey-blue stroke, radius slightly larger than filled Ecdysis dots (e.g. 6px ring vs 4px filled) so the ring reads legibly at low zoom.
2. **Lower opacity filled circle** — acceptable secondary approach when two time periods share the same dot shape and color is used for distinction instead.

**Recommendation:** Use hollow/open circle with `stroke: #5577aa; fill: none; stroke-width: 1.5`. This clearly signals "literature record" without competing with the filled green/grey Ecdysis/iNat dots. The recency tier system (thisYear/lastYear/earlier) does not apply — checklist records are inherently historical and all receive the same fixed style.

---

## Checklist Layer — Differentiators

Features not expected but valued when discovered.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Source badge in sidebar detail | Clicking a checklist dot shows "Bartholomew et al. 2024, JHR 97" citation | Low | Pipeline provides `source_citation` field; template renders it |
| County of record for coordinate-less entries | Many checklist records have precise county text from literature even without GPS | Low | `County_join` field from CSV is already in the checklist pipeline; shown on species pages even when no map point |
| "Also reported in literature" county list on species page | For all 565 checklist species, show the county-level distribution from `checklist_data.species_counties` | Low | Query is already in `checklist_pipeline.py`; template needs one new section |
| "N literature records" count badge | Simple integer on species page; "47 county records from Bartholomew et al. 2024" is meaningful provenance | Very low | Already computable from `checklist_data.species_counties` |

---

## Species Pages — Checklist Augmentation

What to show on species-detail pages for the 565 checklist species, informed by comparable biodiversity atlases (ALA, eBird/BBA, Vermont Atlas of Life).

**Data available per species from pipeline:**
- `on_checklist` boolean (already in `species.parquet`)
- `occurrence_count` from WABA records (0 for checklist-only species)
- County records from `checklist_data.species_counties` (name + county)
- Occurrence coordinates from `occurrences.parquet` where `source = 'checklist'` and lat/lon non-null

**Recommended per-species content:**

| Data | Show? | Complexity | Rationale |
|------|-------|------------|-----------|
| Checklist dots on SVG occurrence map | YES — table stakes | Medium | Modify `species_maps.py` to add a second circle class `.checklist-occ` with hollow SVG style; drawn on top of existing `.occ` dots |
| County list from literature (`species_counties`) | YES — high value | Low | Show as "Counties with literature records: King, Pierce, ..." below the map; covers coordinate-less records |
| "N literature records" count | YES — disambiguates | Very low | "47 county records from Bartholomew et al. 2024 (CC BY 4.0)" |
| Checklist citation/DOI link | YES — required for attribution | Very low | Static text; DOI: 10.3897/jhr.97.129013 |
| Year range from checklist CSV | NO — defer | Low | Year data is unreliable (mixed formats, absent, multi-year ranges like "1975–1985"); displaying it is misleading |
| Collector names from checklist CSV | NO — defer | Low | `recordedBy` in checklist is curatorial provenance (museum collector from 1924), not a WABA participant; not meaningful for users |
| Checklist seasonality histogram | NO — anti-feature | Low | No reliable month-level date data; 12-bar histogram with 90% zeros is misleading |

**For checklist-only species (no WABA records, `occurrence_count = 0`):**
- The species page must still generate; `on_checklist = TRUE` already gates this in `int_species_universe.sql`.
- The SVG map must render with checklist dots even when no Ecdysis/iNat dots exist.
- The "view N occurrences on atlas" deep link should be absent (or point to the checklist layer if that layer is toggle-able by URL).
- Seasonality chart: show a placeholder "Seasonal data available only for WABA specimens."
- `occurrence_count` continues to reflect WABA/iNat records only; a separate `checklist_county_count` or `checklist_record_count` field captures checklist provenance.

**Dependency on existing pipeline:** `int_species_universe` already FULL OUTER JOINs checklist with occurrence data. `species.parquet` already has `on_checklist`. The SVG map generation (`species_maps.py`) currently queries only `occurrences.parquet`; it needs to also query checklist occurrence rows via the new `source = 'checklist'` arm.

---

## DwC-A Taxonomy — Expected Behaviors

What the offline taxonomy pipeline must handle correctly.

**Source:** iNaturalist Taxonomy DwC-A, available monthly at `https://www.inaturalist.org/taxa/inaturalist-taxonomy.dwca.zip`

**Confirmed columns in Taxon.tsv (MEDIUM confidence — from forum thread showing actual queries against the file):**
`id`, `taxonID`, `parentNameUsageID`, `identifier`, `kingdom`, `phylum`, `class`, `order`, `family`, `genus`, `specificEpithet`, `infraspecificEpithet`, `modified`, `scientificName`, `taxonRank`, `references`

**Critical facts (HIGH confidence, multiple sources):**
- `taxonID` and `parentNameUsageID` are **URLs** (e.g. `https://www.inaturalist.org/taxa/123456`), not bare integers. The `id` column is the bare integer. Strip the URL prefix to get the integer.
- The DwC-A export contains **only active taxa**. Inactive taxa (merged/split/synonymized) are absent — the export has no `is_active` or `active` column. (The separate iNat Open Dataset on AWS has an `active` boolean in `taxa.csv`, but that is a different file.)
- No synonym table — synonym relationships are not exposed in this archive format.
- Some intermediate taxonomic ranks (subphylum, subclass, superorder) are absent from the DwC-A even when present in the iNat API.

**Expected edge cases and handling:**

| Edge Case | Behavior | How to Handle |
|-----------|----------|---------------|
| `parentNameUsageID` is a URL, not an integer | Must extract integer ID from URL path | `int(url.rsplit('/', 1)[-1])` or self-join on `id` column matching extracted integer |
| Scientific name includes author + year in checklist CSV | "Agapostemon angelicus Cockerell, 1924" — the DwC-A `scientificName` also has author | Author-stripping is already handled by `canonical_name.py` `canonicalize()` function |
| Subspecies / infraspecific taxa | `taxonRank` = 'subspecies'; both `specificEpithet` and `infraspecificEpithet` populated | Filter to `taxonRank IN ('species', 'genus', 'family', 'subfamily', 'tribe', 'subgenus')` — discard subspecies for lineage lookup |
| Root taxa (no parent) | Animalia/Plantae have `parentNameUsageID` null or empty | Treat null/empty `parentNameUsageID` as tree root; terminate ancestor walk |
| Family/genus denormalized in DwC-A row | The Taxon.tsv row includes `family` and `genus` columns directly | Use row-level `family` and `genus` first; use ancestor walk only for `subfamily`, `tribe`, `subgenus` (not present as direct columns) |
| Taxon absent from DwC-A (old synonym, not yet reconciled) | A canonical_name from `resolve_taxon_ids.py` maps to a taxon_id, but that taxon_id is for an inactive taxon absent from DwC-A | Falls back to existing live API call; unresolved ends up in `lineage_unresolved.csv`. This is the same fallback as today. |
| Multiple bee taxa sharing a homonymous genus name | Same genus string in different families (rare but possible) | Resolve by walking `parentNameUsageID` chain to confirm family context; taxon_id is always unambiguous |
| Large file size | Full iNat taxonomy covers all life; bee-relevant subset is small | Load only rows where `order = 'Hymenoptera'` or filter by `family IN (bee_families)` before building ancestor index in memory |

**What the DwC-A replaces vs. what it does not replace:**

The `enrich_taxon_lineage_extended` function in `inaturalist_pipeline.py` makes batched live API calls to `/v2/taxa/{ids}` for every known taxon_id, extracting the ancestor chain to populate `family`, `subfamily`, `tribe`, `genus`, `subgenus`. The DwC-A replaces these live calls with a pre-built file traversal.

The `resolve_taxon_ids.py` step (canonical_name → taxon_id lookup via live API `/v1/taxa?q=...`) is NOT replaced — the DwC-A does not support "search by name" queries. The name-to-ID bridge step still requires API calls; only the lineage-extraction step becomes offline.

**Nightly pipeline impact:** The DwC-A must be downloaded once per month (updated monthly by iNat) and cached. Downloading it nightly would be ~hundreds of MB of unnecessary transfer. The pipeline needs a `modified` header check or manual `--refresh-taxonomy` flag to control re-download. The existing `S3_BUCKET_NAME` + `nightly.sh` pattern can cache the archive alongside `ecdysis_cache`.

**Ancestor walk algorithm for TARGET_RANKS:**

Current `TARGET_RANKS = {"family", "subfamily", "tribe", "genus", "subgenus"}`. Given Taxon.tsv has `family` and `genus` as direct columns:
1. For each bee taxon_id in the bridge table, fetch the row from the indexed Taxon.tsv.
2. Use the `family` and `genus` column values directly.
3. Walk `parentNameUsageID` chain upward until hitting a row with `taxonRank IN ('family', 'order', 'class')` or null parent.
4. Along the walk, collect `subfamily`, `tribe`, `subgenus` from rows where `taxonRank` matches.
5. Terminate walk at or above family rank.

---

## Source Extensibility Model

What the `source` field concretely means and what fields are needed to support GBIF or other Bee Atlas programs.

**Current model (before v4.0):** Source is implicitly encoded: `ecdysis_id IS NOT NULL` means specimen; `observation_id IS NOT NULL AND ecdysis_id IS NULL` means iNat sample. No explicit discriminator column.

**v4.0 source model:** A `source` VARCHAR column in `occurrences.parquet`:
- `'ecdysis'` — WABA specimen with Ecdysis record
- `'inat'` — iNat sample-only observation
- `'checklist'` — Bartholomew et al. 2024 literature record
- (future) `'gbif'` — GBIF occurrence record
- (future) `'osac'` — OSU Museum specimen
- (future) `'waba_other_state'` — Another state Bee Atlas program data

**The `occIdFromRow` gap and how to fill it:**
Currently `occIdFromRow` produces `ecdysis:N` or `inat:N` (or null). Checklist records have neither `ecdysis_id` nor `observation_id`. A third prefix is needed: `checklist:ObjectID`. Required changes:
1. Add `checklist_id INTEGER | null` to `OccurrenceRow` interface in `filter.ts`
2. Update `occIdFromRow` to return `checklist:${row.checklist_id}` when both `ecdysis_id` and `observation_id` are null but `checklist_id` is non-null
3. Update `parseOccId` to recognize the `checklist:` prefix and return `{ source: 'checklist', numericId: N }`
4. Add `isChecklistRecord(row: OccurrenceRow): boolean` predicate to `occurrence.ts`

**dbt contract change:** `occurrences.parquet` gains two columns, incrementing the dbt 31-column contract to 33 columns:
- `source` VARCHAR NOT NULL (populated by all three arms in `int_combined`)
- `checklist_id` INTEGER nullable (non-null only for checklist arm; null for Ecdysis and iNat rows)

All dbt schema tests and any TypeScript tests referencing column count must be updated.

**Minimum required columns for any future data source:**

| Column | Type | Required? | Notes |
|--------|------|-----------|-------|
| `source` | VARCHAR | YES | Source discriminator for toggle-able layers and filtering |
| `lat` / `lon` | DOUBLE | Conditionally | Can be null for records-without-coordinates; map layer skips nulls |
| `year` / `month` | INTEGER | YES (nullable) | Null acceptable; filters handle nulls via existing SQL semantics |
| `county` / `ecoregion_l3` | VARCHAR | YES | Spatial join at pipeline time; dbt mart adds these |
| `canonical_name` | VARCHAR | YES | Joins to species universe; enables taxon filter |
| `scientificName` | VARCHAR | YES | Display name |
| `genus` / `family` | VARCHAR | YES | Taxon filter support |
| `recordedBy` | VARCHAR | Recommended | Collector filter; null acceptable |
| `place_slug` | VARCHAR | Recommended | Place filter; spatial join at pipeline time |
| Source-specific ID column | INTEGER nullable | YES per source | Enables `occIdFromRow` to construct a stable prefixed ID |

**GBIF `basisOfRecord` mapping:** GBIF records carry `basisOfRecord` values (`PRESERVED_SPECIMEN`, `HUMAN_OBSERVATION`, `LITERATURE`, etc.). At the BeeAtlas level, `source = 'gbif'` is the dataset discriminator; `basisOfRecord` could optionally be stored as an additional column for sub-filtering within the GBIF layer. This is a future concern — v4.0 does not need it.

---

## Anti-Features (Explicitly Out of Scope for v4.0)

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Checklist records in the collector filter | `recordedBy` in checklist is historical curatorial provenance (museum collector from 1924), not a WABA participant; mixing into the existing collector autocomplete conflates two entirely different populations | Exclude checklist rows from collector filter queries; they appear only in taxon and geographic filters |
| Year / month filter applied to checklist records | Poor or absent date data in the CSV; applying date filters silently drops most checklist records and misleads users about filtering behavior | Filter checklist rows by taxon and geography only; exclude from date filter SQL clause or make filter layer-aware |
| Checklist seasonality chart on species pages | No reliable month-level date data; displaying a 12-bar histogram with 90% zeros misleads | Show "Seasonal data available only for WABA specimens" placeholder |
| Nightly DwC-A re-download | The full iNat taxonomy is hundreds of MB; iNat updates it only monthly; nightly download wastes bandwidth and is fragile | Cache archive; check `modified` header or use explicit `--refresh-taxonomy` flag |
| Synonym resolution via DwC-A | The archive doesn't include synonym links; building a synonym graph from it requires the API anyway | Keep existing `resolve_taxon_ids.py` live-API step for name→ID resolution; DwC-A replaces only lineage extraction |
| CSV export including checklist records by default | The table/CSV export is positioned as "download WABA data"; mixing 50K historical records changes its character and bloats the download | Make CSV export source-aware; exclude `source = 'checklist'` rows by default |
| Geocoding coordinate-less records | 4,600 records have county text but no GPS; geocoding to county centroid would falsely imply point-level precision | Leave as null lat/lon; they appear in county lists on species pages but not on the map |
| Checklist records in existing occurrence count on species pages | `occurrence_count` in `species.parquet` means "WABA occurrences"; adding checklist to it breaks the implied meaning | Keep `occurrence_count` as WABA-only; add a separate `checklist_county_count` or display checklist count separately with attribution |
| Backend server for taxonomy queries | Static hosting constraint is absolute | All taxonomy and occurrence data in static Parquet files loaded at runtime |

---

## Feature Dependencies

```
DwC-A taxonomy offline lookup
  → replaces enrich_taxon_lineage_extended() batched live API calls
  → enables family/subfamily/tribe/genus/subgenus for all 565 checklist species
  → required BEFORE checklist taxonomy is complete on species pages

Checklist pipeline (checklist rows in occurrences.parquet)
  → requires DwC-A taxonomy step (for family/subfamily assignment)
  → requires spatial join (county, ecoregion_l3, place_slug) via dbt occurrences mart
  → adds checklist arm to int_combined UNION ALL
  → dbt contract changes from 31 to 33 columns (source + checklist_id)

occIdFromRow third prefix (checklist:N)
  → required before checklist features can load and interact in SQLite frontend
  → requires filter.ts OccurrenceRow interface + occurrence.ts + url-state.ts updates
  → parseOccId must recognize 'checklist:' prefix

Map layer (CHECK-02)
  → requires occurrences.parquet with checklist rows
  → requires occIdFromRow 'checklist:' prefix support
  → requires toggle button + URL state extension

species_maps.py second pass (CHECK-04)
  → reads checklist occurrence rows from occurrences.parquet (source='checklist')
  → draws .checklist-occ circles (hollow SVG style) on top of existing .occ circles
  → required for checklist dots to appear on species SVG maps

Species pages for all 565 species (CHECK-03)
  → requires int_species_universe FULL OUTER JOIN already includes checklist arm (it does)
  → requires species.parquet on_checklist = TRUE for species with no WABA records
  → requires county list from checklist_data.species_counties in Eleventy data
  → SVG map requires species_maps.py second pass above
```

---

## Sources

- iNat taxonomy DwC-A column names and format: [iNat forum thread on SQL queries against the export](https://forum.inaturalist.org/t/using-sql-to-query-inats-dwca-taxonomy-export/29377)
- Inactive taxa handling and synonym gap in DwC-A: [iNat forum thread on open data inactive taxa](https://forum.inaturalist.org/t/include-alternate-names-or-ids-of-merged-inactive-taxa-to-taxa-data-in-open-data-taxa-csv/49573)
- Monthly DwC-A download URL confirmed: [iNat forum bug report referencing archive URL](https://forum.inaturalist.org/t/taxonomy-dwc-a-export-contains-redundant-vernacular-name-files/35550)
- iNat Open Dataset (AWS) `taxa.csv` `active` column (separate from DwC-A): [GitHub inaturalist-open-data documentation branch](https://github.com/inaturalist/inaturalist-open-data/tree/documentation/Metadata)
- GBIF `basisOfRecord` enum values: [GBIF API vocabulary docs](https://gbif.github.io/gbif-api/apidocs/org/gbif/api/vocabulary/BasisOfRecord.html)
- Visual encoding convention for historical vs contemporary records: open/hollow circle = historical, filled = confirmed recent; established by British Bird Atlas tradition and confirmed by [Wisconsin BBA guide](https://ebird.org/atlaswi/news/guide-to-atlas-species-distribution-maps)
- Layer-based source differentiation pattern: [e-Fauna BC limitations page](https://linnet.geog.ubc.ca/biodiversity/efauna/LimitationsoftheMaps.html)
- Codebase inspection: `data/checklist_pipeline.py`, `data/inaturalist_pipeline.py`, `data/resolve_taxon_ids.py`, `data/dbt/models/intermediate/int_combined.sql`, `data/dbt/models/marts/occurrences.sql`, `data/dbt/models/intermediate/int_species_universe.sql`, `src/occurrence.ts`, `src/filter.ts`
