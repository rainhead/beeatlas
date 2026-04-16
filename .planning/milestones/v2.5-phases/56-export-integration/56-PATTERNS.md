# Phase 56: Export Integration - Pattern Map

**Mapped:** 2026-04-15
**Files analyzed:** 5 (3 modified, 1 new tests added, 1 config updated)
**Analogs found:** 5 / 5

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `data/export.py` | service | batch/transform | `data/export.py` itself (extending existing functions) | self — add new behavior to existing pattern |
| `data/tests/test_export.py` | test | batch | `data/tests/test_dem_pipeline.py` | role-match |
| `scripts/validate-schema.mjs` | config/gate | request-response | `scripts/validate-schema.mjs` itself (extend EXPECTED) | self — append to existing arrays |
| `data/pyproject.toml` | config | — | `data/pyproject.toml` itself (add dependency) | self |
| `.gitignore` | config | — | `.gitignore` itself (append entry) | self |

---

## Pattern Assignments

### `data/export.py` — new `_add_elevation` helper + modified `export_ecdysis_parquet` + `export_samples_parquet` + `main`

**Analog:** `data/export.py` (existing patterns; extending, not replacing)

**Env-var config pattern** (lines 19–21 of `data/export.py`):
```python
DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))
_default_assets = str(Path(__file__).parent.parent / 'frontend' / 'public' / 'data')
ASSETS_DIR = Path(os.environ.get('EXPORT_DIR', _default_assets))
```
New constant follows the same pattern:
```python
DEM_CACHE_DIR = Path(os.environ.get('DEM_CACHE_DIR', Path(__file__).parent / '_dem_cache'))
```

**Import block to extend** (lines 13–17 of `data/export.py`):
```python
import json
import os
from pathlib import Path

import duckdb
```
Add after existing imports:
```python
import pyarrow as pa
import pyarrow.parquet as pq

from dem_pipeline import ensure_dem, sample_elevation
```

**Post-COPY verification pattern** (lines 136–152 of `data/export.py`):
```python
# Verify: assert zero null county/ecoregion rows
row = con.execute(f"""
SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN county IS NULL THEN 1 ELSE 0 END) AS null_county,
    SUM(CASE WHEN ecoregion_l3 IS NULL THEN 1 ELSE 0 END) AS null_eco
FROM read_parquet('{out}')
""").fetchone()
total, null_county, null_eco = row
...
print(f"  ecdysis.parquet: {total:,} rows, {null_county} null county, {null_eco} null ecoregion, "
      f"{waba_row[0]:,} specimen_observation_id, "
      f"{(ASSETS_DIR / 'ecdysis.parquet').stat().st_size:,} bytes")
assert null_county == 0, f"ecdysis.parquet has {null_county} rows with null county"
assert null_eco == 0, f"ecdysis.parquet has {null_eco} rows with null ecoregion_l3"
```
The elevation summary adds a non-asserting print line after `_add_elevation()` is called (D-05). Match the `f"  {filename}: {count:,} rows, ..."` format exactly.

**`main()` pattern** (lines 298–309 of `data/export.py`):
```python
def main() -> None:
    """Export all four frontend asset files from beeatlas.duckdb."""
    print("Connecting to DuckDB...")
    con = duckdb.connect(DB_PATH, read_only=True)  # DROP read_only=True (RESEARCH.md Critical Issue)
    con.execute("INSTALL spatial; LOAD spatial;")
    print("Exporting frontend assets:")
    export_ecdysis_parquet(con)
    export_samples_parquet(con)
    export_counties_geojson(con)
    export_ecoregions_geojson(con)
    con.close()
    print("Done.")
```
Updated signature: `duckdb.connect(DB_PATH)` (no `read_only`), then call `ensure_dem(DEM_CACHE_DIR)` and pass result to both export functions.

**Function signature pattern** — existing (lines 24, 155 of `data/export.py`):
```python
def export_ecdysis_parquet(con: duckdb.DuckDBPyConnection) -> None:
def export_samples_parquet(con: duckdb.DuckDBPyConnection) -> None:
```
Gain a second parameter following Python convention:
```python
def export_ecdysis_parquet(con: duckdb.DuckDBPyConnection, dem_path: Path) -> None:
def export_samples_parquet(con: duckdb.DuckDBPyConnection, dem_path: Path) -> None:
```

**New private helper `_add_elevation` — full pattern** (synthesized from D-04 + column name table):
```python
def _add_elevation(out_path: str, dem_path: Path, lon_col: str, lat_col: str) -> list[int | None]:
    """Append elevation_m INT16 nullable column to a written parquet file in-place.

    Returns the elevations list for summary printing.
    Note: water body pixels may yield elevation_m = 0 (not null) — valid 0m elevation data.
    """
    table = pq.read_table(out_path)
    lons = table.column(lon_col).to_pylist()
    lats = table.column(lat_col).to_pylist()
    elevations = sample_elevation(lons, lats, dem_path)
    elevation_col = pa.array(elevations, type=pa.int16())
    table = table.append_column("elevation_m", elevation_col)
    pq.write_table(table, out_path)
    return elevations
```
Call sites:
- ecdysis: `_add_elevation(out, dem_path, lon_col="longitude", lat_col="latitude")`
- samples: `_add_elevation(out, dem_path, lon_col="lon", lat_col="lat")`

**Elevation summary print (D-05)** — no assertion, print only:
```python
non_null = sum(1 for e in elevations if e is not None)
null_count = len(elevations) - non_null
print(f"  ecdysis.parquet: {total:,} rows, {non_null:,} elevation_m non-null, {null_count:,} null")
```

---

### `data/tests/test_export.py` — new elevation tests appended to existing file

**Analog:** `data/tests/test_export.py` (existing tests); `data/tests/test_dem_pipeline.py` for fixture usage

**Existing schema test pattern** (lines 35–47 of `data/tests/test_export.py`):
```python
def test_ecdysis_parquet_schema(fixture_con, export_dir, monkeypatch):
    """export_ecdysis_parquet writes file with all 15 expected columns."""
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_ecdysis_parquet(fixture_con)

    parquet_path = str(export_dir / 'ecdysis.parquet')
    schema = duckdb.execute(
        f"DESCRIBE SELECT * FROM read_parquet('{parquet_path}')"
    ).fetchall()
    actual_cols = [row[0] for row in schema]

    for col in EXPECTED_ECDYSIS_COLS:
        assert col in actual_cols, f"Missing column in ecdysis.parquet: {col}"
```
New elevation schema tests follow the same pattern but pass `dem_fixture` and use `monkeypatch` for `ensure_dem`.

**`dem_fixture` fixture** (lines 247–265 of `data/tests/conftest.py`):
```python
@pytest.fixture
def dem_fixture(tmp_path):
    """2x2 GeoTIFF in a WA sub-bbox with known elevation values and nodata sentinel."""
    ...
    west, south, east, north = -121.0, 47.0, -120.0, 48.0
    nodata_val = -9999.0
    data = np.array([[500.0, 1000.0], [750.0, nodata_val]], dtype=np.float32)
    ...
    return path
```
Both seed specimens (ecdysis at `-120.912, 47.608`; iNat at `-120.8, 47.5`) fall inside this bbox — elevation tests will get non-null values for all seed rows.

**Monkeypatch pattern for DEM** (from RESEARCH.md code examples):
```python
def test_ecdysis_parquet_elevation_col(fixture_con, export_dir, dem_fixture, monkeypatch):
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_ecdysis_parquet(fixture_con, dem_fixture)

    parquet_path = str(export_dir / 'ecdysis.parquet')
    schema = duckdb.execute(f"DESCRIBE SELECT * FROM read_parquet('{parquet_path}')").fetchall()
    actual_cols = [row[0] for row in schema]
    assert 'elevation_m' in actual_cols
    type_map = {row[0]: row[1] for row in schema}
    assert 'SMALLINT' in type_map['elevation_m']  # DuckDB name for INT16
```

**EXPECTED_ECDYSIS_COLS / EXPECTED_SAMPLES_COLS** (lines 14–28 of `data/tests/test_export.py`) — add `'elevation_m'` to both lists to match the updated schema gate.

**Existing EXPECTED_COLS pattern** (to update at top of test file):
```python
EXPECTED_ECDYSIS_COLS = [
    'ecdysis_id', 'longitude', 'latitude',
    ...
    'modified',
    'specimen_observation_id',
]

EXPECTED_SAMPLES_COLS = [
    'observation_id', 'observer', 'date', 'lat', 'lon',
    'specimen_count', 'sample_id',
    'county', 'ecoregion_l3',
]
```
Add `'elevation_m'` to the end of both lists.

---

### `scripts/validate-schema.mjs` — add `elevation_m` to both EXPECTED arrays

**Analog:** `scripts/validate-schema.mjs` itself (lines 22–36):
```javascript
const EXPECTED = {
  'ecdysis.parquet': [
    'ecdysis_id', 'catalog_number', 'longitude', 'latitude',
    'date', 'year', 'month', 'scientificName', 'recordedBy', 'fieldNumber',
    'genus', 'family', 'floralHost',
    'county', 'ecoregion_l3',
    'host_observation_id', 'inat_host', 'inat_quality_grade',
    'modified', 'specimen_observation_id',
  ],
  'samples.parquet': [
    'observation_id', 'observer', 'date', 'lat', 'lon',
    'specimen_count', 'sample_id',
    'county', 'ecoregion_l3',
  ],
};
```
Change: append `'elevation_m'` to the end of both arrays.

---

### `data/pyproject.toml` — add pyarrow dependency

**Analog:** `data/pyproject.toml` lines 7–15 (existing `[project.dependencies]` block):
```toml
dependencies = [
    "dlt[duckdb]>=1.23.0",
    "duckdb",
    "requests",
    "beautifulsoup4",
    "boto3>=1.42.78",
    "seamless-3dep>=0.4.1",
    "rasterio>=1.5.0",
]
```
Add `"pyarrow>=12",` to this list. Follow alphabetical order by package name — place after `"duckdb"`, before `"requests"`. (Or append at end; no strict order enforced here.)

---

### `.gitignore` — add `data/_dem_cache/`

**Analog:** `.gitignore` line 139 (`frontend/public/data/` pattern):
```
frontend/public/data/
```
Add a new line:
```
data/_dem_cache/
```
Place in the data-pipeline section near other data artifacts, or at the end of the file.

---

## Shared Patterns

### Env-var config with absolute Path default
**Source:** `data/export.py` lines 19–21
**Apply to:** `DEM_CACHE_DIR` constant in `export.py`
```python
DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))
```
Use `Path(__file__).parent / '_dem_cache'` (not a relative string) — pathlib convention per Claude's Discretion in CONTEXT.md.

### Print-style verification (no assertion for nullable columns)
**Source:** `data/export.py` lines 148–150, 255–256
**Apply to:** elevation summary print in both export functions
```python
print(f"  ecdysis.parquet: {total:,} rows, {null_county} null county, ...")
```
D-05 requires a summary print for elevation nulls — no assertion.

### monkeypatch + fixture_con + export_dir test triple
**Source:** `data/tests/test_export.py` lines 35–38
**Apply to:** all new elevation tests
```python
def test_*(fixture_con, export_dir, dem_fixture, monkeypatch):
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_ecdysis_parquet(fixture_con, dem_fixture)
```

### DuckDB parquet schema introspection in tests
**Source:** `data/tests/test_export.py` lines 41–47
**Apply to:** column presence and type assertions in elevation tests
```python
schema = duckdb.execute(
    f"DESCRIBE SELECT * FROM read_parquet('{parquet_path}')"
).fetchall()
actual_cols = [row[0] for row in schema]
type_map = {row[0]: row[1] for row in schema}
assert 'SMALLINT' in type_map['elevation_m']  # DuckDB reports INT16 as SMALLINT
```

---

## No Analog Found

None — all five files have direct analogs in the codebase.

---

## Metadata

**Analog search scope:** `data/export.py`, `data/dem_pipeline.py`, `data/tests/conftest.py`, `data/tests/test_export.py`, `data/tests/test_dem_pipeline.py`, `scripts/validate-schema.mjs`, `data/pyproject.toml`, `.gitignore`
**Files scanned:** 8
**Pattern extraction date:** 2026-04-15
