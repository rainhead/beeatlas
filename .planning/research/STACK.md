# Stack Research: v4.0 Checklist Records + iNat Taxonomy Offline

**Project:** BeeAtlas v4.0
**Researched:** 2026-05-23
**Scope:** New capabilities only. Existing stack (Python 3.14+, dbt-duckdb, DuckDB 1.5.x,
dlt, requests, wa-sqlite, hyparquet, Mapbox GL JS, Lit) is confirmed and not re-researched.

---

## New Dependencies

None. Every need for v4.0 is covered by the existing stack.

---

## Existing Stack Coverage

### Feature 1: Checklist Occurrence CSV Ingestion into dbt/DuckDB

**Context:** The checklist species table (`checklist_data.species`) already exists from
Phase 76 (`checklist_pipeline.py`). The milestone adds the occurrence side: 50,646 records
with coordinates (ObjectID, Genus, Scientific Name, Locality, Lat, Lon, Date, recordedBy,
County_join, x, y). The source is a committed CSV file.

**Coverage:**

- `duckdb` `read_csv` — reads 50K-row CSV with auto-detection or explicit column types.
  Already used throughout the pipeline (export.py, geographies_pipeline.py). No new library.

- `data/canonical_name.py` `canonicalize()` — already called in `checklist_pipeline.py`
  for species names. Reuse for occurrence name normalization.

- `dbt` spatial extension — `ST_Within` + fallback `ST_Distance` for county/ecoregion join.
  Identical pattern to `occurrences.sql` mart. Checklist records with null coordinates receive
  NULL county/ecoregion (correct behavior, no fallback needed — nothing to snap to).

- `dbt` external materialization — produce `checklist.parquet` as a new mart alongside
  `occurrences.parquet`, using the same `{{ config(materialized='external', ...) }}` pattern.

**New schema work (no new libraries):**

- New staging model `stg_checklist__occurrences` reads the committed CSV.
- New mart `checklist.parquet` with spatial-joined county/ecoregion.
- `source` field: add a `VARCHAR source` column to `int_combined` (values `'ecdysis'`,
  `'inat'`, `'checklist'`). This promotes the dbt 31-column contract to 32 columns — update
  `data/dbt/models/marts/schema.yml` and `src/sqlite.ts` `CREATE TABLE` in the same change.

### Feature 2: iNat Taxonomy via Offline Archive

**Current approach being replaced:** `enrich_taxon_lineage_extended()` in
`inaturalist_pipeline.py` calls `/v2/taxa/{ids}` in batches of 30 at 1 req/sec. With ~560
new canonical names from the checklist, that is ~19 minutes of API calls and 429 risk.

**Recommended replacement source: iNat AWS Open Data `taxa.csv.gz`**

Not the DwC-A taxonomy archive. Two archives exist:

| Archive | URL | Compressed | Columns | Use? |
|---------|-----|-----------|---------|------|
| iNat Taxonomy DwC-A | `inaturalist-taxonomy.dwca.zip` | ~80 MB | DwC standard: `id, taxonID, parentNameUsageID, kingdom, phylum, class, order, family, genus, specificEpithet, infraspecificEpithet, modified, scientificName, taxonRank, references` | NO |
| iNat AWS Open Data | `s3://inaturalist-open-data/taxa.csv.gz` | ~26 MB | `taxon_id, name, rank, rank_level, ancestry, active` | YES |

The DwC-A is disqualified because: (a) `parentNameUsageID` is a URL not an integer, requiring
URL parsing before any join; (b) it lacks `subfamily` and `tribe` — intermediate ranks are
absent from the DwC-A (confirmed by iNat forum reports); (c) it requires recursive CTE to
traverse the hierarchy. The AWS Open Data file has `ancestry`, a slash-delimited chain of
integer ancestor taxon_ids (e.g. `48460/1/2/47120/372739`), enabling a single unnest+join
to resolve all ranks at once.

**Implementation using existing libraries (`requests` + `duckdb`):**

Step 1 — Download (requests, already imported):
```python
resp = requests.get(
    "https://inaturalist-open-data.s3.amazonaws.com/taxa.csv.gz",
    stream=True, timeout=120
)
with open("data/raw/inaturalist-taxa.csv.gz", "wb") as f:
    for chunk in resp.iter_content(65536):
        f.write(chunk)
```
Use `Last-Modified` header vs. a sentinel file to skip re-download on nightly runs.

Step 2 — Load into DuckDB (duckdb, already imported):
```python
con.execute("""
    CREATE OR REPLACE TABLE inaturalist_data.taxa AS
    SELECT * FROM read_csv(
        'data/raw/inaturalist-taxa.csv.gz',
        delim='\t', header=true, compression='gzip'
    )
""")
```
DuckDB 1.5.x supports gzip-compressed CSV natively via the `compression` parameter.

Step 3 — Populate `taxon_lineage_extended` via ancestry walk (SQL only):
```sql
WITH bridge AS (
    SELECT canonical_name, taxon_id
    FROM inaturalist_data.canonical_to_taxon_id
    WHERE taxon_id IS NOT NULL
),
split AS (
    SELECT t.taxon_id, unnest(string_split(t.ancestry, '/'))::INTEGER AS ancestor_id
    FROM inaturalist_data.taxa t
    JOIN bridge b ON b.taxon_id = t.taxon_id
),
joined AS (
    SELECT s.taxon_id, a.rank, a.name
    FROM split s
    JOIN inaturalist_data.taxa a ON a.taxon_id = s.ancestor_id
    WHERE a.rank IN ('family', 'subfamily', 'tribe', 'genus', 'subgenus')
)
SELECT
    taxon_id,
    MAX(CASE WHEN rank='family'    THEN name END) AS family,
    MAX(CASE WHEN rank='subfamily' THEN name END) AS subfamily,
    MAX(CASE WHEN rank='tribe'     THEN name END) AS tribe,
    MAX(CASE WHEN rank='genus'     THEN name END) AS genus,
    MAX(CASE WHEN rank='subgenus'  THEN name END) AS subgenus
FROM joined
GROUP BY taxon_id
```
Use conditional aggregation rather than `PIVOT` — safer across DuckDB versions and handles
sparse rank presence correctly. Result UPSERTs into `taxon_lineage_extended` with the same
schema (`taxon_id BIGINT PRIMARY KEY, family, subfamily, tribe, genus, subgenus`) — no
downstream dbt model changes.

The `resolve-taxon-ids` step remains unchanged: it still calls the live API for new
canonical names not yet in the `canonical_to_taxon_id` bridge. Only `enrich_taxon_lineage_extended`
is replaced.

**Note on the milestone's "Taxon.tsv" reference:** The milestone context says "iNat's monthly
DwC-A download (~150MB compressed, ~1GB uncompressed Taxon.tsv with ~1.5M+ taxa)." The
1GB/1.5M figure matches the full observations DwC-A (`inaturalist-dwca-with-taxa.zip`),
which bundles occurrence records with a Taxon.tsv extension. That archive is not needed here
— only the `taxa.csv.gz` (~26 MB compressed) is needed for taxonomy enrichment. Recommend
using taxa.csv.gz.

### Feature 3: Checklist Map Layer in Frontend

**Coverage:** Existing Mapbox GL JS `addSource` / `addLayer` pattern in `bee-map.ts` (lines
380–668). A checklist layer follows the identical three-step pattern:

1. `manifest.ts` — add `checklist: string` to `Manifest` interface; add `"checklist":
   "checklist.parquet"` to `manifest.json`.
2. `sqlite.ts` — add `loadChecklistTable()` using the existing `parquetReadObjects` +
   `_insertRows` pattern. Table needs: `lat, lon, canonical_name, county, ecoregion_l3,
   source, date, recordedBy` (exact columns TBD at plan time).
3. `bee-map.ts` — `addSource('checklist', { type: 'geojson', data: checklistGeoJSON })` +
   `addLayer({ id: 'checklist-circle', type: 'circle', source: 'checklist', ... })` with a
   distinct color. Visibility toggle follows the existing boundary-mode toggle pattern.

No new libraries needed.

---

## What NOT to Add

| Library | Reason |
|---------|--------|
| `boto3` (new Python usage) | In `pyproject.toml` but unused (Lambda retired). S3 work is done via `aws` CLI in `nightly.sh`. Use `requests` for the taxa.csv.gz download. |
| `pyinaturalist` | Wrapper around the same API already called directly. Zero benefit over `requests`. |
| `pandas` / `polars` | Not needed. DuckDB `read_csv` handles 50K-row CSVs and 1.2M-row taxonomy files. No dataframe materialization needed. |
| `zipfile-ng`, `stream-zip` | taxa.csv.gz is a plain gzip file, not a zip. Python stdlib `gzip` or DuckDB's native compression param handles it. |
| `geopandas` / `shapely` | Spatial joins run inside DuckDB for both ecdysis and inat records already. Not needed for checklist records. |
| DuckDB-WASM (frontend) | Already rejected (project memory). Do not re-propose. |
| iNat Taxonomy DwC-A (`inaturalist-taxonomy.dwca.zip`) | Worse than AWS Open Data: no `ancestry` column, no `subfamily`/`tribe`, URL-form IDs. |

---

## Integration Points

| Integration | What Changes | Risk |
|-------------|-------------|------|
| `data/dbt/models/marts/schema.yml` | 31-col contract becomes 32 cols (`source` added) | Low — coordinated change |
| `src/sqlite.ts` `CREATE TABLE occurrences` | Add `source TEXT` column | Low |
| `data/run.py` STEPS | Replace `taxon-lineage-extended` fn; add `checklist-occurrences` step | Low |
| `data/nightly.sh` | `data/raw/` directory must persist on maderas across runs (add to S3 sync or keep on local disk) | Low |
| `public/data/manifest.json` | Add `"checklist": "checklist.parquet"` | Trivial |
| `src/manifest.ts` | Add `checklist: string` to `Manifest` interface + add to `DataKey` union | Trivial |
| S3 nightly upload | `nightly.sh` uploads `public/data/` glob — new parquet is auto-included | None |

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| Checklist CSV ingestion (DuckDB read_csv) | HIGH | Pattern already in codebase; 50K rows is trivial |
| Spatial join for checklist records | HIGH | `occurrences.sql` is the direct template |
| iNat taxa.csv.gz existence + `ancestry` column | MEDIUM | Confirmed by 2022 forum tutorial; structure stable since; verify with header download before implementation |
| DuckDB read_csv gzip compression | MEDIUM | DuckDB docs confirm `compression` param; smoke-test recommended |
| Ancestry walk SQL (unnest + conditional agg) | MEDIUM | DuckDB `unnest(string_split(...))` is standard; conditional aggregation is portable across DuckDB 1.x |
| Frontend layer addition | HIGH | Direct addSource/addLayer extension of existing pattern |

---

## Pre-Implementation Checks

```bash
# Verify taxa.csv.gz columns and delimiter before writing any code
curl -s --range 0-512 \
  "https://inaturalist-open-data.s3.amazonaws.com/taxa.csv.gz" \
  | gzip -dc 2>/dev/null | head -2

# Confirm DuckDB reads it
uv run python -c "
import duckdb
con = duckdb.connect(':memory:')
# Small slice — just header + 1 row
print(con.execute(\"SELECT * FROM read_csv('data/raw/inaturalist-taxa.csv.gz', compression='gzip') LIMIT 1\").fetchall())
"
```

---

## Sources

- iNat AWS Open Data forum tutorial (ancestry column confirmed): https://forum.inaturalist.org/t/getting-the-inaturalist-aws-open-data-metadata-files-and-working-with-them-in-a-database/22135
- iNat open data GitHub: https://github.com/inaturalist/inaturalist-open-data
- DwC-A taxa.csv column list: https://forum.inaturalist.org/t/using-sql-to-query-inats-dwca-taxonomy-export/29377
- Missing intermediate ranks in DwC-A: https://forum.inaturalist.org/t/missing-intermediate-ranks-and-default-photo-in-the-taxonomy-archive-file/49700
- Existing checklist pipeline (Phase 76): `/Users/rainhead/dev/beeatlas/data/checklist_pipeline.py`
- Existing taxon lineage enrichment: `/Users/rainhead/dev/beeatlas/data/inaturalist_pipeline.py` lines 184+
- Existing occurrences mart (spatial join template): `/Users/rainhead/dev/beeatlas/data/dbt/models/marts/occurrences.sql`
- Frontend SQLite loading pattern: `/Users/rainhead/dev/beeatlas/src/sqlite.ts`
- Manifest pattern: `/Users/rainhead/dev/beeatlas/src/manifest.ts`
- Mapbox layer pattern: `/Users/rainhead/dev/beeatlas/src/bee-map.ts` lines 380-668

*Stack research for: v4.0 Checklist Records + iNat Taxonomy via Offline Archive*
*Researched: 2026-05-23*
