# Phase 21: Parquet and GeoJSON Export - Research

**Researched:** 2026-03-27
**Domain:** DuckDB Python API, spatial SQL, parquet export, GeoJSON generation
**Confidence:** HIGH — all findings verified against live DuckDB instance

## Summary

Phase 21 writes `data/export.py`, a single script that uses the DuckDB Python API to produce four output files in `frontend/src/assets/`: `ecdysis.parquet`, `samples.parquet`, `counties.geojson`, and `ecoregions.geojson`. All four outputs are derived entirely from `data/beeatlas.duckdb` using the DuckDB spatial extension. The script is a pure SQL-heavy Python script with no pyarrow or geopandas dependency.

The core implementation complexity sits in two areas. First, the spatial joins: `ST_Within` for primary county and ecoregion assignment, plus `ST_Distance ORDER BY LIMIT 1` fallback for the 408 known coastal specimens outside EPA L3 ecoregion polygon boundaries. These specimens are in Clallam (281), Skagit (73), King (30), Island (17), San Juan (4), and Jefferson (3) counties — all coastal/island areas where the EPA shapefile has gaps. Second, the GeoJSON files must use geometry simplification (`ST_SimplifyPreserveTopology` at 0.001 degree tolerance) to keep file sizes acceptable for browser loading — without simplification, counties would be 3.2MB and ecoregions 6.5MB versus the current 56KB and 357KB.

The script also updates `scripts/validate-schema.mjs` (adding `inat_observation_id` to the ecdysis.parquet check, removing the `links.parquet` check) and updates `frontend/src/region-layer.ts` to import `counties.geojson` and `ecoregions.geojson` instead of the old static filenames.

**Primary recommendation:** Single `data/export.py` using `duckdb.connect(DB_PATH, read_only=True)`, `LOAD spatial`, CTEs for spatial joins, `COPY ... TO ... (FORMAT PARQUET)` for parquet, and Python `json` module for GeoJSON assembly. Simplify geometries at 0.001 degree tolerance.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Export script structure:** Single `data/export.py` — one entry point for everything: spatial join → parquet export → geojson export. Phase 22 calls it once.
- **Export implementation approach:** Python script using the DuckDB Python API. SQL does spatial joins and COPY TO for Parquet. Python assembles GeoJSON FeatureCollection wrapper from `ST_AsGeoJSON()` rows. No pyarrow dependency.
- **Ecoregions GeoJSON filter:** `ST_Intersects` against the WA state polygon from `geographies.us_states WHERE abbreviation='WA'`. Principled — uses existing DuckDB data.
- **Spatial join approach:** DuckDB spatial extension — `LOAD spatial; ST_GeomFromText(geometry_wkt)` for WKT conversion, `ST_Within` primary, `ST_Distance ORDER BY … LIMIT 1` nearest-polygon fallback for null rows.
- **inat_observation_id join:** `LEFT JOIN ecdysis_data.occurrences ON occurrence_id → ecdysis_data.occurrence_links ON occurrence_id`. Nullable INT64 — most specimens won't have a link.
- **floralHost extraction:** `regexp_extract(associated_taxa, 'host:"([^"]+)"', 1)` — NULLIF result with '' to get NULL for empty.
- **specimen_count source:** `inaturalist_data.observations__ofvs WHERE field_id=8338` (not by field name). Join via `_dlt_root_id → observations._dlt_id`.
- **Output paths:** `Path(__file__).parent` for DB, `Path(__file__).parent.parent / "frontend/src/assets/"` for outputs.

### Claude's Discretion

*(None captured during discussion)*

### Deferred Ideas (OUT OF SCOPE)

*(None captured during discussion)*
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EXP-01 | Export script produces ecdysis.parquet with current frontend schema plus inat_observation_id; county and ecoregion_l3 added via DuckDB spatial extension ST_Within against geographies tables | Verified: 15-column query + spatial joins tested end-to-end; 46,090 rows, 0 null county/ecoregion after fallback; 11s runtime |
| EXP-02 | Nearest-polygon fallback (ST_Distance ORDER BY … LIMIT 1) handles specimens outside polygon boundaries after ST_Within | Verified: 408 coastal specimens identified (Clallam 281, Skagit 73); correlated subquery fallback confirmed; ST_Distance works on WA ecoregion polygons |
| EXP-03 | Export script produces samples.parquet with current frontend schema; county and ecoregion_l3 from spatial join; specimen_count from field_id=8338 | Verified: 9,667 rows, 0 null county/ecoregion; field_id=8338 confirmed active; sample_id from field_id=9963 |
| EXP-04 | All exports pass validate-schema.mjs (updated: inat_observation_id added to ecdysis.parquet check; links.parquet validation removed) | Verified: validate-schema.mjs structure understood; EXPECTED dict edit is minimal change |
| GEO-01 | Export generates frontend/src/assets/counties.geojson from geographies.us_counties filtered to WA (state_fips='53') | Verified: 39 WA counties, ST_AsGeoJSON works; region-layer.ts reads property 'NAME'; simplification required for size |
| GEO-02 | Export generates frontend/src/assets/ecoregions.geojson from geographies.ecoregions filtered to polygons intersecting WA | Verified: 66 rows (9 distinct names) via ST_Intersects; region-layer.ts reads property 'NA_L3NAME'; simplification required |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| duckdb (Python) | 1.4.4 (in data/pyproject.toml) | Query DuckDB, COPY TO PARQUET, ST_AsGeoJSON | Already project dependency; spatial extension built in |
| pathlib (stdlib) | Python stdlib | Resolve DB_PATH and output paths | Already used in all pipeline files |
| json (stdlib) | Python stdlib | Assemble GeoJSON FeatureCollection | No external dependency for simple dict serialization |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| DuckDB spatial extension | bundled with duckdb | ST_Within, ST_Distance, ST_GeomFromText, ST_AsGeoJSON, ST_SimplifyPreserveTopology | All spatial operations |

**Installation:** No new dependencies needed. `data/pyproject.toml` already has `duckdb` and `dlt[duckdb]`.

The DuckDB spatial extension is already installed on this machine (`LOAD spatial` succeeds without `INSTALL spatial`). For fresh environments, the script should include `INSTALL spatial` before `LOAD spatial`, or handle the case gracefully.

## Architecture Patterns

### Recommended Project Structure

```
data/
├── export.py          # NEW — single export script
├── beeatlas.duckdb    # Source database
├── ecdysis_pipeline.py
├── geographies_pipeline.py
├── inaturalist_pipeline.py
└── pyproject.toml
frontend/src/assets/
├── ecdysis.parquet    # REPLACED by export.py output
├── samples.parquet    # REPLACED by export.py output
├── counties.geojson   # NEW NAME (was wa_counties.geojson)
└── ecoregions.geojson # NEW NAME (was epa_l3_ecoregions_wa.geojson)
scripts/
└── validate-schema.mjs  # MODIFIED — add inat_observation_id, remove links.parquet
frontend/src/
└── region-layer.ts   # MODIFIED — update import paths to new GeoJSON filenames
```

### Pattern 1: Export script structure

**What:** Top-level functions `export_ecdysis_parquet()`, `export_samples_parquet()`, `export_counties_geojson()`, `export_ecoregions_geojson()` called from `main()`. Single `duckdb.connect(DB_PATH, read_only=True)` opened at top of `main()`, passed to each function.

**When to use:** All exports in this phase.

```python
# Source: verified against data/ecdysis_pipeline.py pattern
from pathlib import Path
import duckdb
import json

DB_PATH = str(Path(__file__).parent / "beeatlas.duckdb")
ASSETS_DIR = Path(__file__).parent.parent / "frontend/src/assets"

def main():
    con = duckdb.connect(DB_PATH, read_only=True)
    con.execute("LOAD spatial")
    export_ecdysis_parquet(con)
    export_samples_parquet(con)
    export_counties_geojson(con)
    export_ecoregions_geojson(con)
    con.close()

if __name__ == "__main__":
    main()
```

### Pattern 2: COPY TO PARQUET with spatial CTEs

**What:** DuckDB CTE-based query with spatial joins, written to parquet via `COPY (SELECT ...) TO 'path' (FORMAT PARQUET)`.

**When to use:** ecdysis.parquet and samples.parquet.

```python
# Source: verified end-to-end on live DuckDB (46,090 rows, 0 nulls, 11s)
def export_ecdysis_parquet(con):
    out = str(ASSETS_DIR / "ecdysis.parquet")
    con.execute(f"""
    COPY (
    WITH wa_counties AS (
        SELECT name AS county, geometry_wkt FROM geographies.us_counties WHERE state_fips='53'
    ),
    wa_eco AS (
        SELECT name AS ecoregion_l3, geometry_wkt FROM geographies.ecoregions
        WHERE ST_Intersects(
            ST_GeomFromText(geometry_wkt),
            (SELECT ST_GeomFromText(geometry_wkt) FROM geographies.us_states WHERE abbreviation='WA')
        )
    ),
    occ AS (
        SELECT *, ST_Point(CAST(decimal_longitude AS DOUBLE), CAST(decimal_latitude AS DOUBLE)) AS pt
        FROM ecdysis_data.occurrences
        WHERE decimal_latitude IS NOT NULL AND decimal_latitude != ''
    ),
    with_county AS (
        SELECT occ.occurrence_id, c.county
        FROM occ LEFT JOIN wa_counties c ON ST_Within(occ.pt, ST_GeomFromText(c.geometry_wkt))
    ),
    county_fallback AS (
        SELECT occurrence_id,
            (SELECT county FROM wa_counties
             ORDER BY ST_Distance(ST_GeomFromText(geometry_wkt),
                 (SELECT pt FROM occ o2 WHERE o2.occurrence_id = with_county.occurrence_id))
             LIMIT 1) AS county
        FROM with_county WHERE county IS NULL
    ),
    final_county AS (
        SELECT * FROM with_county WHERE county IS NOT NULL
        UNION ALL SELECT * FROM county_fallback
    ),
    -- (same pattern for ecoregion) ...
    SELECT
        CAST(o.id AS INTEGER) AS ecdysis_id,
        o.occurrence_id AS occurrenceID,
        CAST(o.decimal_longitude AS DOUBLE) AS longitude,
        CAST(o.decimal_latitude AS DOUBLE) AS latitude,
        CAST(o.year AS INTEGER) AS year,
        CAST(o.month AS INTEGER) AS month,
        o.scientific_name AS scientificName,
        o.recorded_by AS recordedBy,
        o.field_number AS fieldNumber,
        o.genus,
        o.family,
        NULLIF(regexp_extract(o.associated_taxa, 'host:"([^"]+)"', 1), '') AS floralHost,
        fc.county,
        fe.ecoregion_l3,
        links.inat_observation_id
    FROM ecdysis_data.occurrences o
    JOIN final_county fc ON fc.occurrence_id = o.occurrence_id
    JOIN final_eco fe ON fe.occurrence_id = o.occurrence_id
    LEFT JOIN ecdysis_data.occurrence_links links ON links.occurrence_id = o.occurrence_id
    WHERE o.decimal_latitude IS NOT NULL AND o.decimal_latitude != ''
    ) TO '{out}' (FORMAT PARQUET)
    """)
```

### Pattern 3: GeoJSON generation with simplification

**What:** SQL query yields `(name, geom_json)` rows; Python assembles FeatureCollection dict with `ST_SimplifyPreserveTopology` for size reduction.

**When to use:** counties.geojson and ecoregions.geojson.

```python
# Source: verified on live DuckDB — produces 39 county features at 166KB
def export_counties_geojson(con):
    rows = con.execute("""
    SELECT name AS NAME,
           ST_AsGeoJSON(ST_SimplifyPreserveTopology(ST_GeomFromText(geometry_wkt), 0.001))
    FROM geographies.us_counties
    WHERE state_fips='53'
    """).fetchall()
    features = [
        {"type": "Feature", "properties": {"NAME": name}, "geometry": json.loads(geom)}
        for name, geom in rows
    ]
    out = ASSETS_DIR / "counties.geojson"
    out.write_text(json.dumps({"type": "FeatureCollection", "features": features}))
```

For ecoregions, the property key must be `NA_L3NAME` (not `name`) — this is what `region-layer.ts` reads:

```python
# Source: verified against frontend/src/region-layer.ts line 35
def export_ecoregions_geojson(con):
    rows = con.execute("""
    SELECT name AS NA_L3NAME,
           ST_AsGeoJSON(ST_SimplifyPreserveTopology(ST_GeomFromText(geometry_wkt), 0.001))
    FROM geographies.ecoregions
    WHERE ST_Intersects(
        ST_GeomFromText(geometry_wkt),
        (SELECT ST_GeomFromText(geometry_wkt) FROM geographies.us_states WHERE abbreviation='WA')
    )
    """).fetchall()
    features = [
        {"type": "Feature", "properties": {"NA_L3NAME": name}, "geometry": json.loads(geom)}
        for name, geom in rows
    ]
    out = ASSETS_DIR / "ecoregions.geojson"
    out.write_text(json.dumps({"type": "FeatureCollection", "features": features}))
```

### Pattern 4: validate-schema.mjs update

**What:** Edit `EXPECTED` dict — add `inat_observation_id` to `ecdysis.parquet` list, delete `links.parquet` key.

```javascript
// Source: scripts/validate-schema.mjs (current state verified)
const EXPECTED = {
  'ecdysis.parquet': [
    'ecdysis_id', 'occurrenceID', 'longitude', 'latitude',
    'year', 'month', 'scientificName', 'recordedBy', 'fieldNumber',
    'genus', 'family', 'floralHost',
    'county', 'ecoregion_l3',
    'inat_observation_id',  // ADD THIS
  ],
  'samples.parquet': [
    'observation_id', 'observer', 'date', 'lat', 'lon',
    'specimen_count', 'sample_id',
    'county', 'ecoregion_l3',
  ],
  // 'links.parquet': REMOVE THIS ENTRY
};
```

### Pattern 5: region-layer.ts import update

**What:** Update the two import paths from old static filenames to new generated filenames.

```typescript
// Source: frontend/src/region-layer.ts (verified — only file referencing these names)
// CHANGE:
import countiesJson from './assets/wa_counties.geojson';
import ecoregionsJson from './assets/epa_l3_ecoregions_wa.geojson';
// TO:
import countiesJson from './assets/counties.geojson';
import ecoregionsJson from './assets/ecoregions.geojson';
```

### Anti-Patterns to Avoid

- **Hardcoding 11 WA ecoregion names:** Brittle — use `ST_Intersects` against `us_states WHERE abbreviation='WA'` instead (locked decision).
- **Using field_name instead of field_id for specimen_count:** The OFV field was renamed circa 2024; `field_id=8338` appears as both `'numberOfSpecimens'` and `'Number of bees collected'` in the database. Always filter by `field_id`.
- **Opening DuckDB writable when read-only suffices:** `COPY TO` writes to the filesystem, not to DB tables — `read_only=True` works and is safer.
- **Not NULLIF-ing floralHost:** `regexp_extract` returns empty string `''` when the pattern doesn't match (not NULL). Must wrap with `NULLIF(..., '')` to produce NULL for no-match rows.
- **Not handling empty string values for specimen_count:** 19 OFV rows have `field_id=8338` AND `value=''`. Filter with `WHERE sc.value != ''` to exclude them from samples.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parquet writing | Manual binary encoding | `COPY (SELECT ...) TO 'path' (FORMAT PARQUET)` | DuckDB writes parquet natively; types preserved exactly |
| Spatial point-in-polygon | Custom ray casting | `ST_Within(ST_Point(lon, lat), ST_GeomFromText(wkt))` | DuckDB spatial handles all edge cases |
| Nearest polygon | Custom distance loop | `ORDER BY ST_Distance(ST_GeomFromText(wkt), point) LIMIT 1` | DuckDB spatial optimizes this |
| GeoJSON geometry serialization | Manual WKT → GeoJSON parser | `ST_AsGeoJSON(geometry)` | Returns spec-compliant geometry JSON |
| Geometry simplification | Custom Ramer-Douglas-Peucker | `ST_SimplifyPreserveTopology(geometry, tolerance)` | Handles topology preservation |
| WKT → geometry conversion | Custom WKT parser | `ST_GeomFromText(wkt_string)` | DuckDB spatial handles all geometry types |

**Key insight:** DuckDB spatial replaces geopandas entirely for this phase. All spatial operations that previously required Python + geopandas are now expressible in SQL within DuckDB.

## Common Pitfalls

### Pitfall 1: GeoJSON file size explosion without simplification

**What goes wrong:** Unsimplified geometries produce 3.2MB counties.geojson and 6.5MB ecoregions.geojson — a 10-18x increase over the existing committed files (56KB and 357KB). The Vite build inlines GeoJSON as a JavaScript module, so large files bloat the frontend bundle significantly.

**Why it happens:** The geographies pipeline stores raw shapefile WKT precision (15+ decimal places per coordinate, thousands of vertices per polygon). The existing committed files were simplified by whatever tool originally generated them.

**How to avoid:** Apply `ST_SimplifyPreserveTopology(ST_GeomFromText(geometry_wkt), 0.001)` to each geometry before `ST_AsGeoJSON`. Tolerance of 0.001 degrees ≈ 80 meters at WA latitude — acceptable for display boundaries. Result: 166KB counties, 998KB ecoregions.

**Warning signs:** Generated GeoJSON > 500KB. Run `wc -c frontend/src/assets/counties.geojson` after generation.

### Pitfall 2: DuckDB spatial extension not installed in fresh environments

**What goes wrong:** `LOAD spatial` fails with `Extension "spatial.duckdb_extension" not found`. The extension is installed on the dev machine but not in CI or a fresh checkout.

**Why it happens:** DuckDB extensions are installed per machine, not per project. The `data/pyproject.toml` specifies `duckdb` as a dependency but not the spatial extension.

**How to avoid:** Add `INSTALL spatial` before `LOAD spatial` in `export.py`, or use `INSTALL spatial IF NOT EXISTS` (DuckDB 1.x syntax). `INSTALL spatial` is a no-op if already installed.

**Warning signs:** `duckdb.IOException: Extension "spatial.duckdb_extension" not found` on first run.

### Pitfall 3: region-layer.ts reads specific property key names from GeoJSON

**What goes wrong:** counties.geojson features need property `NAME`; ecoregions.geojson features need `NA_L3NAME`. Using different key names silently breaks the filter selection UI (no TypeScript error, no runtime error — features just never highlight).

**Why it happens:** `region-layer.ts` uses `feature.get('NAME')` for counties (line 34) and `feature.get('NA_L3NAME')` for ecoregions (line 35). The filter state uses these same keys.

**How to avoid:** In the SQL query, alias `name AS NAME` for counties and `name AS NA_L3NAME` for ecoregions, then use those same keys as property names in the Python dict.

**Warning signs:** County/ecoregion selection in the UI no longer highlights polygons after GeoJSON is regenerated.

### Pitfall 4: ecoregions have multiple polygon rows per name (not MultiPolygon)

**What goes wrong:** The `geographies.ecoregions` table stores individual polygon rows, not one MultiPolygon per ecoregion name. `ST_Intersects` against WA returns 66 rows for 9 distinct names (e.g., "Strait of Georgia/Puget Lowland" has 54 individual polygon rows). The spatial join for `ST_Within` is correct against individual polygons — no need to union/merge before joining.

**Why it happens:** The EPA ecoregion shapefile exports individual polygon features; geopandas preserves this as-is when loading into DuckDB.

**How to avoid:** No change needed for spatial joins — individual polygons work correctly. For GeoJSON, the 66 individual features is acceptable (the frontend renders them all; multiple features with the same `NA_L3NAME` are handled correctly by OL).

**Warning signs:** None if you leave individual polygons. Would only be a problem if you tried `GROUP BY name` and aggregated geometry — don't do that.

### Pitfall 5: Ecoregion fallback correlated subquery is slow (acceptable)

**What goes wrong:** The `ST_Distance` fallback for 408 null-ecoregion rows uses a correlated subquery that re-executes for each null row. This adds ~7 seconds to the ecoregion join (total ecdysis export: ~11 seconds).

**Why it happens:** DuckDB executes the correlated subquery once per null row. 408 iterations × 66 WA ecoregion polygons per iteration.

**How to avoid:** 11 seconds total is acceptable for an offline export script. No optimization needed for Phase 21.

**Warning signs:** Export takes significantly longer than 30 seconds (would indicate regression or larger fallback set).

### Pitfall 6: Old GeoJSON files and old links.parquet remain in assets/

**What goes wrong:** After export.py generates `counties.geojson` and `ecoregions.geojson`, the old `wa_counties.geojson` and `epa_l3_ecoregions_wa.geojson` still exist. Similarly, `links.parquet` still exists in assets/. These are stale but harmless (frontend imports by filename and won't load unlisted files).

**Why it happens:** export.py writes new files; it doesn't delete old ones.

**How to avoid:** Delete the old files as part of this phase. Remove `frontend/src/assets/wa_counties.geojson`, `frontend/src/assets/epa_l3_ecoregions_wa.geojson`, and `frontend/src/assets/links.parquet`.

## Code Examples

### samples.parquet query with field_id=8338 specimen_count and sample_id

```python
# Source: verified against live DuckDB — 9,667 rows, field_id=8338 active
# field_id=9963 ('sampleId') provides sample_id
# Both 8338 and 9963 present on all 9,684 observations (some have empty string values)
con.execute(f"""
COPY (
WITH obs_pt AS (
    SELECT _dlt_id, id, user__login, observed_on, longitude, latitude,
           ST_Point(longitude, latitude) AS pt
    FROM inaturalist_data.observations
    WHERE longitude IS NOT NULL AND latitude IS NOT NULL
),
with_specimen AS (
    SELECT op._dlt_id, op.id, op.user__login, op.observed_on, op.longitude, op.latitude, op.pt,
           CAST(sc.value AS INTEGER) AS specimen_count,
           TRY_CAST(sid.value AS INTEGER) AS sample_id
    FROM obs_pt op
    JOIN inaturalist_data.observations__ofvs sc
        ON sc._dlt_root_id = op._dlt_id AND sc.field_id = 8338 AND sc.value != ''
    LEFT JOIN inaturalist_data.observations__ofvs sid
        ON sid._dlt_root_id = op._dlt_id AND sid.field_id = 9963
),
-- ... spatial join CTEs (same pattern as ecdysis) ...
SELECT
    ws.id AS observation_id,
    ws.user__login AS observer,
    ws.observed_on AS date,
    ws.latitude AS lat,
    ws.longitude AS lon,
    ws.specimen_count,
    ws.sample_id,
    fc.county,
    fe.ecoregion_l3
FROM with_specimen ws
JOIN final_county fc ON fc._dlt_id = ws._dlt_id
JOIN final_eco fe ON fe._dlt_id = ws._dlt_id
) TO '{out}' (FORMAT PARQUET)
""")
```

### Verified schema facts

Key column types after `COPY TO PARQUET`:
- `ecdysis_id`: `CAST(id AS INTEGER)` → INTEGER in parquet (id is VARCHAR like `'5594056'`)
- `inat_observation_id`: BIGINT in `occurrence_links`, remains BIGINT in parquet (nullable)
- `year`, `month`: `CAST(... AS INTEGER)` — all 46,090 values are castable, verified
- `longitude`, `latitude`: `CAST(decimal_longitude AS DOUBLE)` — all values castable, verified
- `floralHost`: `NULLIF(regexp_extract(associated_taxa, 'host:"([^"]+)"', 1), '')` — NULL for no-match
- `specimen_count`: `CAST(sc.value AS INTEGER)` — all non-empty values castable, verified
- `sample_id`: `TRY_CAST(sid.value AS INTEGER)` — 9 empty strings become NULL, safe

## Runtime State Inventory

This is not a rename/refactor phase. No runtime state inventory needed.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python (uv) | export.py | Yes | Python 3.14 (via uv) | — |
| duckdb Python | export.py | Yes | 1.4.4 | — |
| DuckDB spatial extension | Spatial joins | Yes (installed) | bundled with 1.4.4 | INSTALL spatial (no-op if present) |
| data/beeatlas.duckdb | All exports | Yes (46,090 rows) | — | Must run Phase 20 first |
| frontend/src/assets/ | Output dir | Yes | — | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** DuckDB spatial extension may not be installed in CI/fresh environments — add `INSTALL spatial` to script.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None currently — no pytest in data/pyproject.toml |
| Config file | None |
| Quick run command | `npm run validate-schema` |
| Full suite command | `uv run --project data python data/export.py && npm run validate-schema` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXP-01 | ecdysis.parquet has inat_observation_id and all columns | smoke | `npm run validate-schema` | Will exist after export |
| EXP-02 | Zero null county/ecoregion rows after fallback | smoke | `node -e "..."` (DuckDB read of output) | Wave 0: manual check in export.py stdout |
| EXP-03 | samples.parquet has specimen_count from field_id=8338 | smoke | `npm run validate-schema` | Will exist after export |
| EXP-04 | validate-schema.mjs passes (updated) | smoke | `npm run validate-schema` | ✅ (file already exists) |
| GEO-01 | counties.geojson in assets/ with NAME property | smoke | `node -e "const d = JSON.parse(require('fs').readFileSync('frontend/src/assets/counties.geojson')); console.assert(d.features[0].properties.NAME)"` | Will exist after export |
| GEO-02 | ecoregions.geojson in assets/ with NA_L3NAME property | smoke | Same pattern for NA_L3NAME | Will exist after export |

### Sampling Rate

- **Per task commit:** `npm run validate-schema` (validates parquet schemas; fast)
- **Per wave merge:** `uv run --project data python data/export.py && npm run validate-schema`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] export.py must print null-count summaries to stdout so EXP-02 is self-verifying without a separate test script

*(No separate test files needed — validate-schema.mjs is the phase gate test)*

## Sources

### Primary (HIGH confidence)

- Live DuckDB instance `data/beeatlas.duckdb` — all schema facts, row counts, spatial join results, and query performance numbers are verified against actual data
- `scripts/validate-schema.mjs` — exact current EXPECTED dict verified by reading file
- `frontend/src/region-layer.ts` — property key names `NAME` and `NA_L3NAME` verified by reading file
- `data/geographies_pipeline.py` — geometry_wkt column name and ecoregion `name` / `level2_name` field mapping verified

### Secondary (MEDIUM confidence)

- DuckDB spatial extension docs — ST_SimplifyPreserveTopology, ST_AsGeoJSON, ST_Within, ST_Distance, ST_Intersects all verified via live execution
- `.planning/STATE.md` — 408 coastal specimens outside EPA ecoregion boundaries (v1.5 decision) confirmed by live query

### Tertiary (LOW confidence)

- None — all findings verified against live data or source files

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all libraries verified in pyproject.toml and live environment
- Architecture: HIGH — all query patterns tested end-to-end on live data
- Pitfalls: HIGH — GeoJSON size issue discovered via measurement; all other pitfalls verified by inspection

**Research date:** 2026-03-27
**Valid until:** Until beeatlas.duckdb schema changes (stable for v1.6 milestone)
