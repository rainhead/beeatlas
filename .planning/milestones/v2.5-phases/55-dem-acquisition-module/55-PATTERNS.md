# Phase 55: DEM Acquisition Module - Pattern Map

**Mapped:** 2026-04-15
**Files analyzed:** 3 (dem_pipeline.py, tests/conftest.py extension, tests/test_dem_pipeline.py)
**Analogs found:** 3 / 3

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `data/dem_pipeline.py` | service | file-I/O + batch | `data/geographies_pipeline.py` | role-match (both download external data to local cache; geographies uses HTTP+zip, DEM uses seamless-3dep+rasterio) |
| `data/tests/conftest.py` (extend) | config/fixture | — | `data/tests/conftest.py` itself | exact (add new fixture alongside existing ones) |
| `data/tests/test_dem_pipeline.py` | test | batch | `data/tests/test_transforms.py` | role-match (both test pure functions with no DB access) |
| `data/pyproject.toml` (extend) | config | — | `data/pyproject.toml` itself | exact (append to `[project.dependencies]`) |

## Pattern Assignments

### `data/dem_pipeline.py` (service, file-I/O)

**Analog:** `data/geographies_pipeline.py`

**Module docstring pattern** (lines 1–14):
```python
"""Load geographic boundary data into DuckDB for spatial annotation.

Sources:
- EPA Level III Ecoregions (North America): CEC / EPA
  https://...
"""
```
Copy: one-line summary, then named sources with URLs. For `dem_pipeline.py`:
```python
"""Download and cache USGS 3DEP 1/3 arc-second DEM for Washington state.

Sources:
- USGS 3DEP 10m DEM via seamless-3dep (hyriver): https://pypi.org/project/seamless-3dep/
"""
```

**Imports pattern** (lines 17–22 of geographies_pipeline.py):
```python
import os
import zipfile
from pathlib import Path

import duckdb
import requests
```
For `dem_pipeline.py`, follow same grouping: stdlib first, then third-party:
```python
import shutil
from pathlib import Path

import rasterio
import seamless_3dep as s3dep
from rasterio.merge import merge
```

**Module-level constants pattern** (lines 23–33 of geographies_pipeline.py):
```python
DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))

CACHE_DIR = Path(os.environ.get('GEOGRAPHY_CACHE_DIR', '.geography_cache'))

SOURCES = {
    "ecoregions": "https://...",
    ...
}
```
For `dem_pipeline.py`, mirror the constant style (ALL_CAPS, module-level, descriptive names):
```python
WA_BBOX = (-124.85, 45.54, -116.92, 49.00)  # (west, south, east, north)
_DEM_FILENAME = "wa_3dep_10m.tif"
```

**Cache-check-then-download pattern** (lines 37–70 of geographies_pipeline.py):
```python
def _download(name: str, url: str) -> Path:
    """Download a zip to cache, resuming a partial download if present."""
    CACHE_DIR.mkdir(exist_ok=True)
    dest = CACHE_DIR / f"{name}.zip"
    if dest.exists():
        print(f"  Using cached {dest}")
        return dest
    ...
    tmp.rename(dest)
    return dest
```
`ensure_dem` applies the same pattern: check for `dem_path.exists()` first and return early; use a `_tiles/` subdirectory as the intermediate staging area (analogous to `.tmp` suffix above) to keep the final cache_dir unambiguous.

**print() for progress** (lines 41, 55, 67 of geographies_pipeline.py):
```python
print(f"  Using cached {dest}")
print(f"  Downloading {name} from {url} ...")
```
Use the same bare `print()` style (no logging framework) with `# noqa: T201` on each print call, consistent with the existing pipeline files.

**`if __name__ == "__main__":` guard** (line 146–147 of geographies_pipeline.py):
```python
if __name__ == "__main__":
    load_geographies()
```
Add an equivalent guard in `dem_pipeline.py` that calls `ensure_dem` with a default cache directory, so the module is directly runnable.

**Error handling pattern:**
`geographies_pipeline.py` uses `resp.raise_for_status()` to let HTTP errors propagate as `requests.HTTPError`. Follow the same approach: let `seamless_3dep.get_dem()` and `rasterio` raise their native exceptions without wrapping them. No custom exception class needed for Phase 55.

---

### `data/tests/conftest.py` (extend — add dem_fixture)

**Analog:** `data/tests/conftest.py` (existing file, lines 218–243)

**Session-scoped fixture using `tmp_path_factory`** (lines 218–228):
```python
@pytest.fixture(scope="session")
def fixture_db(tmp_path_factory):
    """Create a test DuckDB with all schemas and seed data. Returns path to DB file."""
    db_path = str(tmp_path_factory.mktemp("db") / "test.duckdb")
    ...
    return db_path
```
The DEM fixture must NOT be session-scoped because `tmp_path` is function-scoped. Use function scope (default) with plain `tmp_path`. This is called out explicitly in RESEARCH.md Pitfall 5.

**Function-scoped fixture using `tmp_path`** (lines 240–243):
```python
@pytest.fixture
def export_dir(tmp_path):
    """Temporary directory for export output files."""
    return tmp_path
```
Mirror this pattern exactly — function scope, `tmp_path` parameter, docstring, return value. The `dem_fixture` should return the `Path` to the synthetic GeoTIFF file (not the directory), so tests receive it directly:

```python
@pytest.fixture
def dem_fixture(tmp_path):
    """2x2 GeoTIFF in a WA sub-bbox with known elevation values and nodata sentinel."""
    import numpy as np
    import rasterio
    from rasterio.transform import from_bounds

    path = tmp_path / "test_dem.tif"
    west, south, east, north = -121.0, 47.0, -120.0, 48.0
    transform = from_bounds(west, south, east, north, width=2, height=2)
    nodata_val = -9999.0
    data = np.array([[500.0, 1000.0], [750.0, nodata_val]], dtype=np.float32)
    with rasterio.open(
        path, "w", driver="GTiff",
        height=2, width=2, count=1,
        dtype=np.float32, crs="EPSG:4326",
        transform=transform, nodata=nodata_val,
    ) as dst:
        dst.write(data, 1)
    return path
```

**Import style** (lines 1–8 of conftest.py):
```python
import datetime

import pytest
import duckdb

from .fixtures import WA_STATE_WKT, CHELAN_WKT, NORTH_CASCADES_WKT  # noqa: F401
```
Add `dem_fixture` in the same file after the existing fixtures. Place the rasterio imports inside the fixture function body (as shown above) or at the module top — follow whichever style the implementer finds cleaner; importing inside the function keeps the existing file's imports clean when rasterio is not installed.

---

### `data/tests/test_dem_pipeline.py` (test, batch)

**Analog:** `data/tests/test_transforms.py`

**Module docstring pattern** (lines 1–6 of test_transforms.py):
```python
"""Unit tests for pipeline transformation functions.

Tests _transform() from inaturalist_pipeline and _extract_inat_id() from ecdysis_pipeline.
These are pure functions with no side effects or DB access.
"""
```
For `test_dem_pipeline.py`:
```python
"""Unit tests for dem_pipeline functions.

Tests ensure_dem (cache hit path only) and sample_elevation using a synthetic
2x2 GeoTIFF fixture. No network requests are made.
"""
```

**Import pattern** (lines 8–9 of test_transforms.py):
```python
from inaturalist_pipeline import _transform
from ecdysis_pipeline import _extract_inat_id
```
For `test_dem_pipeline.py`:
```python
from dem_pipeline import ensure_dem, sample_elevation
```

**Section separator comments** (lines 13–14 of test_transforms.py):
```python
# ---------------------------------------------------------------------------
# _transform() tests
# ---------------------------------------------------------------------------
```
Use the same `# ---` separator style to divide `ensure_dem` tests from `sample_elevation` tests.

**Test function naming and assertion style** (lines 16–32 of test_transforms.py):
```python
def test_transform_with_geojson():
    """Happy path: geojson coordinates are extracted into longitude/latitude."""
    item = {"geojson": {"coordinates": [-120.5, 47.5]}, ...}
    result = _transform(item.copy())
    assert result["longitude"] == -120.5
    assert result["latitude"] == 47.5
    assert "geojson" not in result
```
Mirror: one test per behavior, descriptive docstring, direct `assert` statements (no `unittest.TestCase`).

**Test using fixture** (lines 35–47 of test_export.py for pattern reference):
```python
def test_ecdysis_parquet_schema(fixture_con, export_dir, monkeypatch):
    """..."""
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_ecdysis_parquet(fixture_con)
```
For DEM tests that use `dem_fixture`, accept it as a parameter (pytest injects it automatically):
```python
def test_sample_elevation_inbounds(dem_fixture):
    """sample_elevation returns integer for a coordinate inside the fixture bbox."""
    result = sample_elevation([-120.5], [47.5], dem_fixture)
    assert isinstance(result[0], int)
```

**`ensure_dem` cache-hit test pattern:**
```python
def test_ensure_dem_caches(tmp_path):
    """ensure_dem returns the same path on second call without re-downloading."""
    # Arrange: pre-populate cache to bypass network
    cache_dir = tmp_path / "dem_cache"
    cache_dir.mkdir()
    fake_tif = cache_dir / "wa_3dep_10m.tif"
    fake_tif.write_bytes(b"")  # existence check only — content not read

    result = ensure_dem(cache_dir)
    assert result == fake_tif
```

---

### `data/pyproject.toml` (extend)

**Analog:** `data/pyproject.toml` (existing file, lines 7–13)

**Dependency pinning pattern** (lines 8–13):
```toml
dependencies = [
    "dlt[duckdb]>=1.23.0",
    "duckdb",
    "requests",
    "beautifulsoup4",
    "boto3>=1.42.78",
]
```
Add new dependencies with `>=` minimum pins (same style):
```toml
    "seamless-3dep>=0.4.1",
    "rasterio>=1.5.0",
```
Preferred method per RESEARCH.md: `cd data && uv add seamless-3dep rasterio` (updates pyproject.toml and installs). Manual edit is acceptable if `uv` is unavailable.

---

## Shared Patterns

### Progress output
**Source:** `data/geographies_pipeline.py` lines 41, 55, 97, 101
**Apply to:** `dem_pipeline.py`
```python
print(f"  Using cached {dem_path}")  # noqa: T201
print(f"  Downloading WA 3DEP tiles to {tile_dir} ...")  # noqa: T201
print(f"  Merging {len(tile_paths)} tile(s) into {dem_path} ...")  # noqa: T201
```
Two-space indent prefix on progress messages; `# noqa: T201` on every print call.

### `Path` from stdlib, no `os.path`
**Source:** `data/geographies_pipeline.py` lines 19, 25, 39–44
**Apply to:** `dem_pipeline.py`, test fixture
```python
from pathlib import Path
dest = CACHE_DIR / f"{name}.zip"
dest.with_suffix(".tmp")
tmp.rename(dest)
```
Use `pathlib.Path` operators (`/`) throughout; avoid `os.path.join`.

### No test framework other than pytest
**Source:** `data/tests/test_transforms.py`, `data/tests/test_export.py`
**Apply to:** `data/tests/test_dem_pipeline.py`
Plain `assert` statements only. No `unittest.TestCase`, no `mock.patch` (use fixture-based isolation instead). Monkeypatching via `monkeypatch` fixture if module-level state must be overridden.

---

## No Analog Found

All files have usable analogs. No gaps.

---

## Metadata

**Analog search scope:** `data/*.py`, `data/tests/`
**Files scanned:** geographies_pipeline.py, tests/conftest.py, tests/fixtures.py, tests/test_transforms.py, tests/test_export.py, pyproject.toml
**Pattern extraction date:** 2026-04-15
