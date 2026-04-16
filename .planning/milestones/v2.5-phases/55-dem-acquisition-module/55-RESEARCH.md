# Phase 55: DEM Acquisition Module - Research

**Researched:** 2026-04-15
**Domain:** Python geospatial — USGS 3DEP DEM download and raster elevation sampling
**Confidence:** MEDIUM (seamless-3dep has limited secondary docs; API confirmed from PyPI + GitHub README, not full source inspection)

---

## Summary

Phase 55 delivers `dem_pipeline.py`, a standalone Python module with two public functions: `ensure_dem(cache_dir)` and `sample_elevation(lons, lats, dem_path)`. The module wraps `seamless-3dep` for USGS 3DEP acquisition and `rasterio` for per-coordinate elevation sampling.

The key architectural fact is that `seamless-3dep`'s `get_dem()` returns a **list of GeoTIFF paths** (one per tile), not a single merged file. For Washington's bounding box the download may produce multiple tiles. `ensure_dem` must merge these tiles into a single `wa_3dep_10m.tif` using `rasterio.merge`, then write that file to `cache_dir`. The merged file is what `sample_elevation` opens.

`rasterio` provides `dataset.sample()` (wrapping `rasterio.sample.sample_gen`) which takes `(x, y)` coordinate pairs in the dataset's native CRS and yields one array per coordinate. Since the 3DEP GeoTIFF is EPSG:4326, longitude is x and latitude is y — no reprojection needed. Out-of-bounds coordinates return the dataset's nodata fill value; reading `dataset.nodata` at open time gives the sentinel to convert to `None`.

**Primary recommendation:** Use `seamless_3dep.get_dem()` + `rasterio.merge.merge()` in `ensure_dem`, and `dataset.sample()` in `sample_elevation`. Return `list[int | None]` from `sample_elevation` (ints cast from float pixel values, None for nodata or out-of-bounds).

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** `ensure_dem(cache_dir)` takes a cache directory path (not a target file path). The function derives the filename internally.
**D-02:** The function returns the full path to the GeoTIFF file (e.g. `cache_dir / "wa_3dep_10m.tif"`) so Phase 56 can pass it directly to `sample_elevation`. Return type: `Path` or `str`.
**D-03:** Filename convention inside the cache directory: `wa_3dep_10m.tif`. This encodes region, source, and resolution.
**D-04:** `WA_BBOX = (-124.85, 45.54, -116.92, 49.00)` — module-level constant, tuple in `(west, south, east, north)` order as required by `seamless-3dep`. Hardcoded, not derived from the geographies DB.

### Claude's Discretion

- `sample_elevation` input/return types — list or numpy array for lons/lats inputs; `list[int | None]` or equivalent for output. Claude decides based on what integrates most cleanly with DuckDB query results in Phase 56.
- Synthetic GeoTIFF fixture structure — how the 2x2 test fixture is created (rasterio in conftest, tmp_path scope). Claude decides based on existing conftest.py patterns.
- Error handling in `ensure_dem` — what to raise if the USGS download fails.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ELEV-01 | `dem_pipeline.py` downloads the USGS 3DEP 1/3 arc-second GeoTIFF for Washington bounding box using `seamless-3dep` and caches it locally; subsequent runs skip download if cache exists. `sample_elevation(lons, lats, dem_path)` returns integer meters for in-bounds coordinates and None for out-of-bounds or nodata. Nodata sentinel read from `dataset.nodata`. Unit tests use synthetic 2x2 GeoTIFF fixture. | `seamless_3dep.get_dem()` + `rasterio.merge()` for download; `dataset.sample()` for elevation; `dataset.nodata` property for sentinel; rasterio fixture creation pattern confirmed. |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| DEM download and local caching | Data pipeline (`dem_pipeline.py`) | — | Network I/O and disk caching belong in pipeline, not export |
| Elevation sampling per coordinate | Data pipeline (`dem_pipeline.py`) | — | Pure function on cached file; used by export.py in Phase 56 |
| Tile merging (multi-tile WA download) | Data pipeline (`ensure_dem`) | — | `get_dem()` may return multiple tiles; merging must happen before `sample_elevation` |
| Nodata sentinel handling | `sample_elevation` | — | Dynamic read of `dataset.nodata`; conversion to None before returning |
| Dependency declaration | `data/pyproject.toml` | — | `[project.dependencies]` with pinned minimums |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| seamless-3dep | 0.4.1 | USGS 3DEP DEM download by bounding box | Specified by ELEV-01; purpose-built for this exact task |
| rasterio | 1.5.0 | Open GeoTIFF, read nodata, sample by coordinate | Industry standard for geospatial raster I/O in Python; supports Python 3.12+ |

[VERIFIED: PyPI registry — `pip3 index versions seamless-3dep` → 0.4.1; `curl pypi.org/pypi/rasterio/json` → 1.5.0]

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| numpy | (rasterio dependency) | Array operations on pixel values | Already a transitive dep via rasterio; used in fixture creation |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| seamless-3dep | py3dep (HyRiver) | py3dep is more full-featured but heavier; seamless-3dep is the lightweight option from the same maintainer, specified by ELEV-01 |
| rasterio.merge | GDAL VRT + buildVRT | rasterio.merge is pure-Python friendly; VRT approach adds complexity |

**Installation:**
```bash
uv add seamless-3dep rasterio
```
(This updates `pyproject.toml` — preferred over manual edit in this project.)

---

## Architecture Patterns

### System Architecture Diagram

```
  Phase 55 data flow:

  caller (Phase 56 / nightly.sh)
        |
        v
  ensure_dem(cache_dir)
        |-- cache_dir/wa_3dep_10m.tif exists? --> return path (skip)
        |
        |-- seamless_3dep.get_dem(WA_BBOX, tile_dir, resolution="10m")
        |       returns: [tile1.tif, tile2.tif, ...]
        |
        |-- rasterio.merge.merge([open(t) for t in tiles])
        |       returns: (mosaic_array, transform, meta)
        |
        |-- write merged array to cache_dir/wa_3dep_10m.tif
        |
        v
  returns: Path("cache_dir/wa_3dep_10m.tif")


  sample_elevation(lons, lats, dem_path)
        |
        |-- rasterio.open(dem_path) as dataset
        |       dataset.nodata  --> sentinel value
        |       dataset.bounds  --> WA bounding box
        |
        |-- dataset.sample(zip(lons, lats))  [generator]
        |       yields: np.array([pixel_value]) per coordinate
        |
        |-- for each value:
        |       if value == nodata sentinel --> None
        |       else --> int(round(value))
        |
        v
  returns: list[int | None]
```

### Recommended Project Structure

```
data/
├── dem_pipeline.py          # new — ensure_dem + sample_elevation
├── tests/
│   ├── conftest.py          # extend: add dem_fixture (tmp_path-scoped)
│   └── test_dem_pipeline.py # new — unit tests with synthetic fixture
```

### Pattern 1: ensure_dem — idempotent download with merge

**What:** Check for cached merged file first; if absent, download tiles, merge, write, return path.

**When to use:** Any function that downloads a large file once and reuses it.

```python
# Source: seamless-3dep PyPI + rasterio.merge docs
import seamless_3dep as s3dep
import rasterio
from rasterio.merge import merge
from pathlib import Path

WA_BBOX = (-124.85, 45.54, -116.92, 49.00)  # (west, south, east, north)
_DEM_FILENAME = "wa_3dep_10m.tif"


def ensure_dem(cache_dir: Path | str) -> Path:
    cache_dir = Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    dem_path = cache_dir / _DEM_FILENAME

    if dem_path.exists():
        return dem_path

    tile_dir = cache_dir / "_tiles"
    tile_dir.mkdir(exist_ok=True)

    # get_dem returns list of GeoTIFF paths, one per tile
    tile_paths = s3dep.get_dem(WA_BBOX, tile_dir, resolution="10m")

    if len(tile_paths) == 1:
        # Single tile — copy directly rather than round-tripping through merge
        import shutil
        shutil.copy(tile_paths[0], dem_path)
    else:
        datasets = [rasterio.open(p) for p in tile_paths]
        mosaic, transform = merge(datasets)
        meta = datasets[0].meta.copy()
        meta.update({
            "driver": "GTiff",
            "height": mosaic.shape[1],
            "width": mosaic.shape[2],
            "transform": transform,
        })
        for ds in datasets:
            ds.close()
        with rasterio.open(dem_path, "w", **meta) as dest:
            dest.write(mosaic)

    return dem_path
```

[ASSUMED — get_dem resolution parameter exact string ("10m" vs "1/3 arc-second") needs verification at implementation time from seamless-3dep source/docs]

### Pattern 2: sample_elevation — per-coordinate raster sampling

**What:** Open GeoTIFF once, read nodata sentinel from file metadata, sample all coordinates, convert nodata to None.

**When to use:** Batch elevation lookup from a GeoTIFF in EPSG:4326.

```python
# Source: rasterio docs (dataset.sample / rasterio.sample.sample_gen)
def sample_elevation(
    lons: list[float],
    lats: list[float],
    dem_path: Path | str,
) -> list[int | None]:
    with rasterio.open(dem_path) as dataset:
        nodata = dataset.nodata  # read from file; do NOT hardcode
        results = []
        for pixel in dataset.sample(zip(lons, lats)):
            value = pixel[0]  # band 1 scalar
            if nodata is not None and value == nodata:
                results.append(None)
            else:
                results.append(int(round(float(value))))
    return results
```

Note: `dataset.sample()` does not raise for out-of-bounds coordinates — it returns the nodata fill value. With `nodata` properly read from the file, out-of-bounds points are handled by the same `value == nodata` check. [MEDIUM confidence — based on rasterio issue #1904 resolution in v1.1.3+; behavior confirmed fixed but not verified in rasterio 1.5.0 docs directly]

### Pattern 3: Synthetic GeoTIFF fixture for testing

**What:** Create a 2x2 GeoTIFF in `tmp_path` using rasterio, with a known nodata value and known pixel values.

**When to use:** Unit tests that must not make network requests.

```python
# Source: rasterio write API (standard pattern)
import numpy as np
import pytest
import rasterio
from rasterio.transform import from_bounds

@pytest.fixture
def dem_fixture(tmp_path):
    """2x2 GeoTIFF in WA bounding box with known elevation values and nodata."""
    path = tmp_path / "test_dem.tif"
    # Small bbox within WA
    west, south, east, north = -121.0, 47.0, -120.0, 48.0
    transform = from_bounds(west, south, east, north, width=2, height=2)
    nodata_val = -9999.0
    data = np.array([[[[500.0, 1000.0], [750.0, nodata_val]]]], dtype=np.float32)
    with rasterio.open(
        path, "w",
        driver="GTiff",
        height=2, width=2,
        count=1,
        dtype=np.float32,
        crs="EPSG:4326",
        transform=transform,
        nodata=nodata_val,
    ) as dst:
        dst.write(data[0])
    return path
```

### Anti-Patterns to Avoid

- **Hardcoding nodata sentinel:** The 3DEP nodata value is documented as -9999 but is not guaranteed. Always read `dataset.nodata` from the open file.
- **Assuming get_dem returns a single file:** `get_dem` tiles large bounding boxes. WA's bbox at 10m resolution spans ~730×380 km and will likely produce multiple tiles.
- **Using `masked=True` as the only out-of-bounds strategy:** `masked=True` in `sample_gen` masks values outside the raster extent with a numpy mask, but behavior for coordinates exactly on the edge may be implementation-specific. Checking `value == nodata` is the reliable path.
- **Leaving tile files in the final cache_dir:** Store tiles in a `_tiles/` subdirectory to keep the cache_dir clean and make the existence check unambiguous.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bounding-box DEM download with auto-tiling | Custom USGS API client | `seamless_3dep.get_dem()` | Handles tile splitting, EPSG:4326 output, connection pooling |
| Multi-tile merge | Custom numpy stitching | `rasterio.merge.merge()` | Handles overlap, nodata fill, affine transform update |
| Geographic-to-pixel coordinate conversion | Manual affine inverse math | `dataset.sample(zip(lons, lats))` | rasterio handles the affine transform internally |
| GeoTIFF creation in tests | Writing raw bytes | `rasterio.open(..., mode="w")` with `from_bounds` transform | Standard pattern; produces a valid georeferenced file |

---

## Common Pitfalls

### Pitfall 1: get_dem resolution parameter format

**What goes wrong:** Passing wrong string for resolution causes a silent fallback or error.
**Why it happens:** The seamless-3dep docs show "10m", "30m", "60m" but the actual parameter name and accepted values need confirmation against the installed version's source.
**How to avoid:** At implementation time, inspect `seamless_3dep.get_dem.__doc__` or the source in `.venv` after install. The STATE.md explicitly calls this out as a concern.
**Warning signs:** Download completes but produces wrong-resolution tiles; function raises `ValueError`.

### Pitfall 2: WA bbox at 10m produces multiple tiles

**What goes wrong:** Code assumes `get_dem` returns a single path; crashes when indexing `tile_paths[0]` as if it's the final file.
**Why it happens:** WA is ~400km wide; at 1/3 arc-second (10m), the service tiles the response.
**How to avoid:** Always handle the list return value; merge multiple tiles before caching.
**Warning signs:** `ensure_dem` test passes locally (small test bbox), fails on real WA bbox.

### Pitfall 3: nodata is None when GeoTIFF has no nodata set

**What goes wrong:** `dataset.nodata` returns `None`; checking `value == None` in Python doesn't match any float pixel value, so all coordinates silently return an integer even for "empty" cells.
**Why it happens:** Some GeoTIFFs don't embed a nodata tag. 3DEP tiles should have nodata set, but it's worth handling defensively.
**How to avoid:** Guard: `if nodata is not None and value == nodata` before converting. If nodata is None, all non-exception values become integers.
**Warning signs:** Out-of-bounds test coordinates unexpectedly return 0 or a very large negative integer.

### Pitfall 4: Water body fill value (0 instead of nodata)

**What goes wrong:** Puget Sound and Columbia River show elevation 0 instead of None.
**Why it happens:** Some 3DEP products fill water bodies with 0 rather than nodata sentinel. STATE.md documents this as a known concern for Phase 56.
**How to avoid:** Phase 55 is not responsible for handling this — it only converts `dataset.nodata` to None. Document in code comment for Phase 56 consumer.

### Pitfall 5: Test fixture scope vs session fixture collision

**What goes wrong:** DEM test fixture uses `scope="session"` (like the DuckDB fixture) but relies on `tmp_path`, which is function-scoped.
**Why it happens:** pytest does not allow session-scoped fixtures to depend on function-scoped `tmp_path`.
**How to avoid:** Use `tmp_path_factory` (session-compatible) or function scope for the DEM fixture. CONTEXT.md explicitly calls for `tmp_path`-scoped — use function scope.
**Warning signs:** pytest error: `ScopeMismatch: You tried to access the 'function' scoped fixture 'tmp_path' with a 'session' scoped request object`.

---

## Code Examples

### Creating a GeoTIFF fixture with known nodata

```python
# Pattern from rasterio write API
import numpy as np
import rasterio
from rasterio.transform import from_bounds

def _make_dem_fixture(path, nodata=-9999.0):
    transform = from_bounds(-121.0, 47.0, -120.0, 48.0, width=2, height=2)
    data = np.array([[500.0, 1000.0], [750.0, nodata]], dtype=np.float32)
    with rasterio.open(
        path, "w", driver="GTiff",
        height=2, width=2, count=1,
        dtype=np.float32, crs="EPSG:4326",
        transform=transform, nodata=nodata,
    ) as dst:
        dst.write(data, 1)
```

### Reading nodata and sampling

```python
import rasterio

with rasterio.open(dem_path) as ds:
    nodata = ds.nodata
    coords = list(zip(lons, lats))  # (x=lon, y=lat) in EPSG:4326
    results = []
    for pixel in ds.sample(coords):
        v = pixel[0]
        results.append(None if (nodata is not None and v == nodata) else int(round(float(v))))
```

### Merging tiles

```python
from rasterio.merge import merge
import rasterio

datasets = [rasterio.open(p) for p in tile_paths]
mosaic, transform = merge(datasets)
meta = datasets[0].meta.copy()
meta.update(driver="GTiff", height=mosaic.shape[1], width=mosaic.shape[2], transform=transform)
for ds in datasets:
    ds.close()
with rasterio.open(out_path, "w", **meta) as dst:
    dst.write(mosaic)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual USGS TNM API requests | `seamless-3dep` wrapper | 2023+ | Handles tiling, pooling, EPSG:4326 output automatically |
| GDAL command-line tools | `rasterio` Python API | Mainstream since ~2015 | No subprocess needed; numpy-native |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `get_dem` resolution parameter accepts string `"10m"` | Code Examples, Pattern 1 | Download fails or silently uses wrong resolution; verify after `uv add seamless-3dep` |
| A2 | WA bbox at 10m resolution produces multiple tiles requiring merge | Architecture Patterns, Pitfall 2 | If single tile, the merge path still works but adds unnecessary complexity |
| A3 | `dataset.sample()` returns nodata fill value for out-of-bounds coordinates (not raises) | Pattern 2, Pitfall 3 | If raises, `sample_elevation` needs try/except per coordinate — less efficient |
| A4 | `rasterio.merge.merge()` signature is `merge(datasets) -> (mosaic, transform)` | Pattern 1 | API may include `nodata` kwarg needed for correct sentinel propagation |

---

## Open Questions

1. **get_dem exact resolution parameter string**
   - What we know: PyPI page and README show "10m", "30m", "60m"
   - What's unclear: Whether the parameter is positional or keyword; whether `resolution` is the param name
   - Recommendation: After `uv add seamless-3dep`, run `python -c "import seamless_3dep as s3dep; help(s3dep.get_dem)"` before implementing

2. **Tile count for WA bbox at 10m**
   - What we know: `get_dem` auto-tiles; WA is large
   - What's unclear: Exact tile count without downloading
   - Recommendation: Handle as list regardless; merge step is cheap even for 1 tile (or use shutil.copy for 1-tile case)

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.14 | pyproject.toml constraint | ✓ | 3.14 (uv venv) | — |
| seamless-3dep | ensure_dem | ✗ (not yet in venv) | 0.4.1 on PyPI | — |
| rasterio | sample_elevation + fixture | ✗ (not yet in venv) | 1.5.0 on PyPI | — |
| uv | dependency management | ✓ (assumed, project uses it) | — | pip |
| pytest | test runner | ✓ (in dev deps) | >=9.0.2 | — |

[VERIFIED: PyPI — seamless-3dep 0.4.1, rasterio 1.5.0 both available]
[ASSUMED: uv available — project uses uv conventions throughout]

**Missing dependencies with no fallback:**
- `seamless-3dep` and `rasterio` must be added to `pyproject.toml` and installed. Wave 0 task.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest >= 9.0.2 |
| Config file | `data/pyproject.toml` (`[tool.pytest.ini_options]`) |
| Quick run command | `cd data && uv run pytest tests/test_dem_pipeline.py -x` |
| Full suite command | `cd data && uv run pytest` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ELEV-01a | `ensure_dem` returns path to `wa_3dep_10m.tif` without network on second call | unit | `uv run pytest tests/test_dem_pipeline.py::test_ensure_dem_caches -x` | ❌ Wave 0 |
| ELEV-01b | `sample_elevation` returns integer for in-bounds coordinates | unit | `uv run pytest tests/test_dem_pipeline.py::test_sample_elevation_inbounds -x` | ❌ Wave 0 |
| ELEV-01c | `sample_elevation` returns None for nodata pixel | unit | `uv run pytest tests/test_dem_pipeline.py::test_sample_elevation_nodata -x` | ❌ Wave 0 |
| ELEV-01d | `sample_elevation` returns None for out-of-bounds coordinate | unit | `uv run pytest tests/test_dem_pipeline.py::test_sample_elevation_oob -x` | ❌ Wave 0 |
| ELEV-01e | Nodata sentinel read from `dataset.nodata`, not hardcoded | unit | `uv run pytest tests/test_dem_pipeline.py::test_nodata_from_file -x` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd data && uv run pytest tests/test_dem_pipeline.py -x`
- **Per wave merge:** `cd data && uv run pytest`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `data/tests/test_dem_pipeline.py` — covers ELEV-01a through ELEV-01e
- [ ] `data/dem_pipeline.py` — module under test
- [ ] Add `seamless-3dep` and `rasterio` to `data/pyproject.toml` `[project.dependencies]`
- [ ] Install: `cd data && uv sync`

---

## Security Domain

> Phase 55 has no authentication, user input, or secrets. ASVS categories not applicable.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | low | lons/lats are float lists — no SQL or shell injection surface |
| V6 Cryptography | no | — |

No threat patterns apply to this phase (local file I/O + USGS public data download over HTTPS).

---

## Sources

### Primary (HIGH confidence)
- PyPI registry (`pip3 index versions seamless-3dep`) — version 0.4.1 confirmed
- PyPI registry (`curl pypi.org/pypi/rasterio/json`) — version 1.5.0 confirmed
- [seamless-3dep PyPI](https://pypi.org/project/seamless-3dep/) — get_dem API, bbox format, return type
- [GitHub hyriver/seamless-3dep](https://github.com/hyriver/seamless-3dep) — README examples

### Secondary (MEDIUM confidence)
- [rasterio docs — sample module](https://rasterio.readthedocs.io/en/stable/api/rasterio.sample.html) — sample_gen API (URL confirmed via search; page returned 403 during fetch)
- [rasterio issue #1904](https://github.com/rasterio/rasterio/issues/1904) — out-of-bounds sampling behavior fixed in v1.1.3

### Tertiary (LOW confidence)
- WebSearch results on rasterio.merge pattern — consistent across multiple tutorials; not verified against rasterio 1.5.0 source directly

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — both packages confirmed on PyPI with exact versions
- Architecture: MEDIUM — get_dem multi-tile behavior is ASSUMED based on docs saying "auto-tiles large areas"; exact WA tile count unknown without downloading
- Pitfalls: MEDIUM — nodata and out-of-bounds behaviors verified via issue tracker; resolution param name ASSUMED

**Research date:** 2026-04-15
**Valid until:** 2026-05-15 (stable libraries; seamless-3dep is slow-moving)
