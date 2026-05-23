# Research Summary — v4.0 Washington Checklist Records

**Project:** Washington Bee Atlas — Checklist Records + Offline Taxonomy
**Researched:** 2026-05-23
**Confidence:** HIGH overall

---

## Stack Additions

None. Every requirement is met by the existing stack:
- **DuckDB `read_csv` with `compression='gzip'`** — handles checklist CSV and `taxa.csv.gz`
- **iNat AWS Open Data `taxa.csv.gz`** (NOT the DwC-A zip) — has `ancestry` column (slash-delimited integer chain); enables lineage walk via `unnest(string_split(ancestry,'/'))` + conditional aggregation. DwC-A zip disqualified: URL-form IDs, no `subfamily`/`tribe`, no `ancestry` column.
- **DuckDB `unnest(string_split(...))`** — replaces 19+ minutes of batched API calls with seconds of local SQL
- **dbt external materialization** — `checklist.parquet` as a new mart alongside `occurrences.parquet`
- **Mapbox GL JS county-fill layer** — reuses existing `counties` GeoJSON source with filter expression

Do NOT add: pandas, polars, geopandas, boto3, pyinaturalist, DuckDB-WASM, the DwC-A zip archive.

---

## Key Architectural Decision

**Checklist records are county-range assertions, not point occurrences. They must NOT enter `occurrences.parquet` or `int_combined`.**

The checklist data maps to species-county presence records — no lat/lon, no dates, no collectors as primary data. Resolution:

- `checklist.parquet` is a **separate dbt mart**: `canonical_name, scientificName, genus, specific_epithet, family, county, source='checklist'`
- Frontend renders checklist as a **county-fill layer** on the existing `counties` GeoJSON source — not as points in the cluster layer
- `source` field lives in `checklist.parquet` as a constant — does NOT need to enter `occurrences.parquet` for v4.0
- `occIdFromRow`, `OccurrenceRow`, and `OCCURRENCE_COLUMNS` are **unchanged**
- Year slider bounds remain scoped to `occurrences.parquet` only (no 1812 dates bleeding in)

---

## Feature Table Stakes

**Checklist map layer:**
- Toggle-able on/off, matching Specimens/Samples toggle pattern
- County-fill visual (light olive/green, low opacity) — range data, not individual points
- Responds to taxon filter; does NOT respond to year/month or collector filter
- Layer visibility persists in URL state (`cl=` param)

**Species pages:**
- All 565 checklist species get Eleventy pages (gate exists via `on_checklist = TRUE`)
- Checklist-only species (~250–300 new pages) get county-presence SVG instead of occurrence SVG
- County list from literature records shown below map
- Attribution: "N county records from Bartholomew et al. 2024 (DOI: 10.3897/jhr.97.129013)"
- Empty seasonality chart suppressed for zero-occurrence species
- `occurrence_count` remains WABA-only; checklist county count displayed separately

**Defer to future:** GPS-level point display for historical records, collector names on pages, seasonality histogram for checklist records, CSV export including checklist, GBIF ingestion.

---

## Build Order

**Phase A — Offline Taxonomy (TAX-01, TAX-02)** — build first
Download `taxa.csv.gz` to `data/raw/`, walk `ancestry` via DuckDB `unnest(string_split(...))` + conditional aggregation, write `taxon_lineage_extended` with identical schema. Delete `enrich_taxon_lineage` and `enrich_taxon_lineage_extended`. ETag/Last-Modified caching mirrors `last_fetch.txt` + S3 pattern. Independently verifiable; unblocks lineage enrichment for checklist-only species.

**Phase B — Checklist Pipeline (CHECK-01, EXT-01)** — after Phase A
`checklist.sql` dbt mart → `checklist.parquet`. `manifest.json` gains `"checklist"` key. TRIM() all VARCHAR columns in staging. Pytest: row count ≥ 2000, no null `canonical_name`, `specific_epithet IS NOT NULL`.

**Phase C — Frontend Checklist Layer (CHECK-02)** — after Phase B
`loadChecklistTable()` + `checklistReady` promise in `sqlite.ts`. Parallel load with occurrences. `FilterState.checklistVisible`. `cl=` URL param. Toggle button. County-fill Mapbox layer in `bee-map.ts`.

**Phase D — Species Page Expansion (CHECK-03, CHECK-04)** — after Phase C
Relaxed `genusList`/`tribeList` filters in `_data/species.js`. County-presence SVGs for checklist-only species from `species_maps.py`. Seasonality chart suppression. ~250–300 new Eleventy pages. Requires design decision on genus/subgenus page inclusion.

---

## Watch Out For

1. **Checklist records accidentally in `int_combined`** — corrupts all occurrence aggregates, introduces NULL-coordinate rows. Assert `occurrences.parquet` row count doesn't increase unexpectedly.
2. **`taxa.csv.gz` structure unverified before coding** — entire offline taxonomy approach hinges on `ancestry` column. Verify with smoke test before Phase A: `curl --range 0-512 <url> | gzip -dc | head -2`
3. **Trailing whitespace in family names silently drops species** — `"Halictidae "` fails `int_species_universe` WHERE clause. Apply `TRIM()` in staging; add dbt test `family = TRIM(family)`.
4. **Duplicate `taxon_id` from inactive/synonym rows in `taxa.csv.gz`** — filter `WHERE active = true` before staging load. Assert `COUNT(DISTINCT taxon_id) == COUNT(*)`.
5. **Genus/subgenus pages silently missing checklist-only species** — `genusList` currently filters `occurrence_count > 0`. Checklist-only species disappear from genus pages but appear in species index — UX gap. Must be an explicit design decision before Phase D.

---

## Open Questions

1. **`taxa.csv.gz` delimiter, `ancestry` column, and `active` field type** — verify with smoke test before Phase A (MEDIUM confidence; confirmed by 2022 forum tutorial).
2. **Genus/subgenus page design** — do checklist-only species appear on genus pages? Blocks Phase D scope.
3. **Where is `manifest.json` generated?** — locate the script before Phase B planning.
4. **`data/raw/` persistence on maderas** — confirm S3 sync approach for taxa cache before Phase A `nightly.sh` changes.

---

*Research completed: 2026-05-23*
*Ready for requirements: yes*
