# Phase 62: Pipeline Join - Pattern Map

**Mapped:** 2026-04-17
**Files analyzed:** 3 (data/export.py modified, data/tests/test_export.py modified, scripts/validate-schema.mjs modified)
**Analogs found:** 3 / 3

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `data/export.py` | pipeline transform | batch / file-I/O | `data/export.py` (self — replacing two functions with one) | exact |
| `data/tests/test_export.py` | test | batch | `data/tests/test_export.py` (self — existing ecdysis/samples tests replaced) | exact |
| `scripts/validate-schema.mjs` | config / CI gate | file-I/O | `scripts/validate-schema.mjs` (self — EXPECTED dict update) | exact |

---

## Pattern Assignments

### `data/export.py` — `export_occurrences_parquet()` replaces two functions (pipeline transform, batch)

**Analog:** `data/export.py` — `export_ecdysis_parquet()` (lines 24–155) and `export_samples_parquet()` (lines 158–262)

**Function signature pattern** (line 24):
```python
def export_occurrences_parquet(con: duckdb.DuckDBPyConnection) -> None:
    """Export occurrences.parquet ..."""
    out = str(ASSETS_DIR / "occurrences.parquet")
```

**COPY ... TO parquet pattern** (lines 27–135, ecdysis function):
```python
con.execute(f"""
COPY (
WITH wa_counties AS (
    SELECT name AS county, ST_GeomFromText(geometry_wkt) AS geom
    FROM geographies.us_counties
    WHERE state_fips = '53'
),
wa_eco AS (
    SELECT name AS ecoregion_l3, ST_GeomFromText(geometry_wkt) AS geom
    FROM geographies.ecoregions
    WHERE ST_Intersects(
        ST_GeomFromText(geometry_wkt),
        (SELECT ST_GeomFromText(geometry_wkt) FROM geographies.us_states WHERE abbreviation = 'WA')
    )
),
...
SELECT ...
) TO '{out}' (FORMAT PARQUET)
""")
```

**Spatial county CTE pattern** — copy verbatim from ecdysis function (lines 48–65):
```sql
with_county AS (
    SELECT occ.occurrence_id, c.county
    FROM occ
    LEFT JOIN wa_counties c ON ST_Within(occ.pt, c.geom)
),
county_fallback AS (
    SELECT occurrence_id,
        (SELECT county FROM wa_counties
         ORDER BY ST_Distance(geom,
             (SELECT pt FROM occ o2 WHERE o2.occurrence_id = with_county.occurrence_id))
         LIMIT 1) AS county
    FROM with_county
    WHERE county IS NULL
),
final_county AS (
    SELECT * FROM with_county WHERE county IS NOT NULL
    UNION ALL SELECT * FROM county_fallback
),
```

**Spatial ecoregion CTE pattern** — copy verbatim from ecdysis function (lines 66–87):
```sql
with_eco AS (
    SELECT occ.occurrence_id, e.ecoregion_l3
    FROM occ
    LEFT JOIN wa_eco e ON ST_Within(occ.pt, e.geom)
),
eco_dedup AS (
    SELECT DISTINCT ON (occurrence_id) occurrence_id, ecoregion_l3
    FROM with_eco
),
eco_fallback AS (
    SELECT occurrence_id,
        (SELECT ecoregion_l3 FROM wa_eco
         ORDER BY ST_Distance(geom,
             (SELECT pt FROM occ o2 WHERE o2.occurrence_id = eco_dedup.occurrence_id))
         LIMIT 1) AS ecoregion_l3
    FROM eco_dedup
    WHERE ecoregion_l3 IS NULL
),
final_eco AS (
    SELECT * FROM eco_dedup WHERE ecoregion_l3 IS NOT NULL
    UNION ALL SELECT * FROM eco_fallback
),
```

**NOTE on spatial CTE row key:** The existing CTEs key on `occurrence_id` (ecdysis UUID) or `_dlt_id` (iNat UUID). After the full outer join, either can be NULL. The new function must use `ROW_NUMBER() OVER () AS _row_id` in the `joined` CTE and propagate it through the spatial CTEs instead of `occurrence_id`/`_dlt_id`.

**ecdysis_base source CTE pattern** — adapt from SELECT in ecdysis function (lines 104–133):
```sql
ecdysis_base AS (
    SELECT
        CAST(o.id AS INTEGER) AS ecdysis_id,
        o.catalog_number,
        CAST(o.decimal_longitude AS DOUBLE) AS ecdysis_lon,
        CAST(o.decimal_latitude AS DOUBLE) AS ecdysis_lat,
        o.event_date AS ecdysis_date,
        CAST(o.year AS INTEGER) AS year,
        CAST(o.month AS INTEGER) AS month,
        o.scientific_name AS scientificName,
        o.recorded_by AS recordedBy,
        o.field_number AS fieldNumber,
        o.genus,
        o.family,
        NULLIF(regexp_extract(o.associated_taxa, 'host:"([^"]+)"', 1), '') AS floralHost,
        links.host_observation_id,
        CASE WHEN inat.taxon__iconic_taxon_name = 'Plantae' THEN inat.taxon__name ELSE NULL END AS inat_host,
        inat.quality_grade AS inat_quality_grade,
        strftime(GREATEST(o.modified, COALESCE(im.max_id_modified, o.modified)), '%Y-%m-%d') AS modified,
        wl.specimen_observation_id,
        TRY_CAST(NULLIF(o.minimum_elevation_in_meters, '') AS INTEGER) AS elevation_m
    FROM ecdysis_data.occurrences o
    LEFT JOIN ecdysis_data.occurrence_links links ON links.occurrence_id = o.occurrence_id
    LEFT JOIN inaturalist_data.observations inat ON inat.id = links.host_observation_id
    LEFT JOIN id_modified im ON im.coreid = o.id
    LEFT JOIN waba_link wl ON wl.catalog_suffix = CAST(regexp_extract(o.catalog_number, '[0-9]+$', 0) AS BIGINT)
    WHERE o.decimal_latitude IS NOT NULL AND o.decimal_latitude != ''
),
```

**samples_base source CTE pattern** — adapt from `with_specimen` in samples function (lines 182–192):
```sql
samples_base AS (
    SELECT
        op._dlt_id,
        op.id AS observation_id,
        op.user__login AS observer,
        CAST(op.observed_on AS VARCHAR) AS sample_date,
        op.longitude AS sample_lon,
        op.latitude AS sample_lat,
        CAST(sc.value AS INTEGER) AS specimen_count,
        TRY_CAST(sid.value AS INTEGER) AS sample_id
    FROM inaturalist_data.observations op
    JOIN inaturalist_data.observations__ofvs sc
        ON sc._dlt_root_id = op._dlt_id AND sc.field_id = 8338 AND sc.value != ''
    LEFT JOIN inaturalist_data.observations__ofvs sid
        ON sid._dlt_root_id = op._dlt_id AND sid.field_id = 9963
    WHERE op.longitude IS NOT NULL AND op.latitude IS NOT NULL
),
```

**NOTE on _dlt_root_id join:** `observations__ofvs` uses `_dlt_root_id VARCHAR` as FK to `observations._dlt_id`, NOT `id BIGINT`. This is preserved from the existing samples function (line 189).

**Coordinate COALESCE pattern** (D-05):
```sql
joined AS (
    SELECT
        ROW_NUMBER() OVER () AS _row_id,
        e.ecdysis_id,
        e.catalog_number,
        COALESCE(e.ecdysis_lon, s.sample_lon) AS lon,
        COALESCE(e.ecdysis_lat, s.sample_lat) AS lat,
        COALESCE(e.ecdysis_date, s.sample_date) AS date,
        COALESCE(e.year, YEAR(s.sample_date_raw)) AS year,
        COALESCE(e.month, MONTH(s.sample_date_raw)) AS month,
        -- specimen-side (null for sample-only rows)
        e.scientificName, e.recordedBy, e.fieldNumber, e.genus, e.family,
        e.floralHost, e.host_observation_id, e.inat_host, e.inat_quality_grade,
        e.modified, e.specimen_observation_id, e.elevation_m,
        -- sample-side (null for specimen-only rows)
        s.observation_id, s.observer, s.specimen_count, s.sample_id
    FROM ecdysis_base e
    FULL OUTER JOIN samples_base s ON e.host_observation_id = s.observation_id
),
occ_pt AS (
    SELECT *, ST_Point(lon, lat) AS pt FROM joined
),
```

**Post-export verification pattern** (lines 138–155, ecdysis function):
```python
row = con.execute(f"""
SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN county IS NULL THEN 1 ELSE 0 END) AS null_county,
    SUM(CASE WHEN ecoregion_l3 IS NULL THEN 1 ELSE 0 END) AS null_eco
FROM read_parquet('{out}')
""").fetchone()
total, null_county, null_eco = row
print(f"  occurrences.parquet: {total:,} rows, {null_county} null county, {null_eco} null ecoregion, "
      f"{(ASSETS_DIR / 'occurrences.parquet').stat().st_size:,} bytes")
assert null_county == 0, f"occurrences.parquet has {null_county} rows with null county"
assert null_eco == 0, f"occurrences.parquet has {null_eco} rows with null ecoregion_l3"
```

**`main()` update** (lines 302–313) — remove old calls, add new:
```python
def main() -> None:
    """Export all frontend asset files from beeatlas.duckdb."""
    print("Connecting to DuckDB...")
    con = duckdb.connect(DB_PATH)
    con.execute("INSTALL spatial; LOAD spatial;")
    print("Exporting frontend assets:")
    export_occurrences_parquet(con)   # replaces export_ecdysis_parquet + export_samples_parquet
    export_counties_geojson(con)
    export_ecoregions_geojson(con)
    con.close()
    print("Done.")
```

---

### `data/tests/test_export.py` — replace ecdysis/samples tests with occurrences tests (test, batch)

**Analog:** `data/tests/test_export.py` — existing `test_ecdysis_parquet_*` and `test_samples_parquet_*` test groups (lines 37–167)

**Module-level column list pattern** (lines 14–30):
```python
EXPECTED_OCCURRENCES_COLS = [
    # specimen-side
    'ecdysis_id', 'catalog_number', 'scientificName', 'recordedBy', 'fieldNumber',
    'genus', 'family', 'floralHost',
    'host_observation_id', 'inat_host', 'inat_quality_grade',
    'modified', 'specimen_observation_id', 'elevation_m',
    'year', 'month',
    # sample-side
    'observation_id', 'observer', 'specimen_count', 'sample_id',
    # unified
    'lat', 'lon', 'date',
    'county', 'ecoregion_l3',
]
```

**Schema test pattern** (lines 37–49):
```python
def test_occurrences_parquet_schema(fixture_con, export_dir, monkeypatch):
    """export_occurrences_parquet writes file with all expected columns."""
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_occurrences_parquet(fixture_con)

    parquet_path = str(export_dir / 'occurrences.parquet')
    schema = duckdb.execute(
        f"DESCRIBE SELECT * FROM read_parquet('{parquet_path}')"
    ).fetchall()
    actual_cols = [row[0] for row in schema]

    for col in EXPECTED_OCCURRENCES_COLS:
        assert col in actual_cols, f"Missing column in occurrences.parquet: {col}"
```

**Row + null assertion test pattern** (lines 65–81):
```python
def test_occurrences_parquet_has_rows(fixture_con, export_dir, monkeypatch):
    """export_occurrences_parquet writes at least 1 row with non-null county and ecoregion_l3."""
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_occurrences_parquet(fixture_con)

    parquet_path = str(export_dir / 'occurrences.parquet')
    row = duckdb.execute(f"""
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN county IS NULL THEN 1 ELSE 0 END) AS null_county,
            SUM(CASE WHEN ecoregion_l3 IS NULL THEN 1 ELSE 0 END) AS null_eco
        FROM read_parquet('{parquet_path}')
    """).fetchone()
    total, null_county, null_eco = row
    assert total >= 2, "occurrences.parquet should have at least 2 rows (1 specimen-only + 1 sample-only)"
    assert null_county == 0, f"occurrences.parquet has {null_county} rows with null county"
    assert null_eco == 0, f"occurrences.parquet has {null_eco} rows with null ecoregion_l3"
```

**COALESCE coord test pattern** (new, OCC-03):
```python
def test_occurrences_coalesce_coords(fixture_con, export_dir, monkeypatch):
    """Specimen-only and sample-only rows both have non-null lat/lon via COALESCE."""
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_occurrences_parquet(fixture_con)

    parquet_path = str(export_dir / 'occurrences.parquet')
    row = duckdb.execute(f"""
        SELECT
            SUM(CASE WHEN lat IS NULL OR lon IS NULL THEN 1 ELSE 0 END) AS null_coords
        FROM read_parquet('{parquet_path}')
    """).fetchone()
    assert row[0] == 0, f"occurrences.parquet has {row[0]} rows with null lat/lon"
```

**date format test pattern** (new, OCC-03):
```python
def test_occurrences_date_format(fixture_con, export_dir, monkeypatch):
    """date column is VARCHAR ISO format for both specimen-only and sample-only rows."""
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_occurrences_parquet(fixture_con)

    parquet_path = str(export_dir / 'occurrences.parquet')
    schema = duckdb.execute(
        f"DESCRIBE SELECT * FROM read_parquet('{parquet_path}')"
    ).fetchall()
    type_map = {row[0]: row[1] for row in schema}
    assert 'VARCHAR' in type_map['date'], f"date column should be VARCHAR, got {type_map['date']}"
```

**Fixture note** (conftest.py lines 148–165): The existing seed already produces the desired split:
- Ecdysis specimen with `host_observation_id = 163069968` (links to iNat)
- iNat observation with `id = 999999`
- These do NOT match → full outer join produces 1 specimen-only row + 1 sample-only row
- No new seed data is needed for the outer join test

---

### `scripts/validate-schema.mjs` — EXPECTED dict update (config / CI gate, file-I/O)

**Analog:** `scripts/validate-schema.mjs` (self, lines 22–36 and 38)

**EXPECTED dict pattern** (lines 22–36) — replace both keys with one:
```javascript
const EXPECTED = {
  'occurrences.parquet': [
    // specimen-side (null for sample-only rows)
    'ecdysis_id', 'catalog_number', 'scientificName', 'recordedBy', 'fieldNumber',
    'genus', 'family', 'floralHost',
    'host_observation_id', 'inat_host', 'inat_quality_grade',
    'modified', 'specimen_observation_id', 'elevation_m',
    'year', 'month',
    // sample-side (null for specimen-only rows)
    'observation_id', 'observer', 'specimen_count', 'sample_id',
    // unified (always populated via COALESCE)
    'lat', 'lon', 'date',
    'county', 'ecoregion_l3',
  ],
};
```

**Local file detection pattern** (line 38) — update filename:
```javascript
// Before:
const useLocal = existsSync(join(ASSETS_DIR, 'ecdysis.parquet'));
// After:
const useLocal = existsSync(join(ASSETS_DIR, 'occurrences.parquet'));
```

No other changes needed — the loop `for (const [filename, expectedCols] of Object.entries(EXPECTED))` and error handling (lines 45–75) are unchanged.

---

## Shared Patterns

### DuckDB connection + spatial setup
**Source:** `data/export.py` lines 302–308 (`main()`)
**Apply to:** `export_occurrences_parquet` — connection passed in by `main()`; spatial is pre-loaded
```python
con = duckdb.connect(DB_PATH)
con.execute("INSTALL spatial; LOAD spatial;")
```

### ASSETS_DIR path construction
**Source:** `data/export.py` lines 19–21
**Apply to:** `export_occurrences_parquet` — uses `ASSETS_DIR` module-level constant
```python
_default_assets = str(Path(__file__).parent.parent / 'frontend' / 'public' / 'data')
ASSETS_DIR = Path(os.environ.get('EXPORT_DIR', _default_assets))
```

### monkeypatch ASSETS_DIR in tests
**Source:** `data/tests/test_export.py` lines 39–40
**Apply to:** All new `test_occurrences_*` functions
```python
monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
```

### DESCRIBE-based schema assertion
**Source:** `data/tests/test_export.py` lines 43–46
**Apply to:** `test_occurrences_parquet_schema` and `test_occurrences_parquet_elevation_col` (if needed)
```python
schema = duckdb.execute(
    f"DESCRIBE SELECT * FROM read_parquet('{parquet_path}')"
).fetchall()
actual_cols = [row[0] for row in schema]
```

---

## No Analog Found

None — all three files have direct self-analogs (modifications of existing files).

---

## Metadata

**Analog search scope:** `data/export.py`, `data/tests/test_export.py`, `data/tests/conftest.py`, `scripts/validate-schema.mjs`
**Files scanned:** 4
**Pattern extraction date:** 2026-04-17
