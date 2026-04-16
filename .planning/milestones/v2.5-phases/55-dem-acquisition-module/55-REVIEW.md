---
phase: 55-dem-acquisition-module
reviewed: 2026-04-15T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - data/dem_pipeline.py
  - data/tests/test_dem_pipeline.py
  - data/pyproject.toml
  - data/tests/conftest.py
findings:
  critical: 0
  warning: 4
  info: 1
  total: 5
status: issues_found
---

# Phase 55: Code Review Report

**Reviewed:** 2026-04-15
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

The DEM acquisition module (`dem_pipeline.py`) is well-structured and small. The core logic — download, merge, cache, and sample — is clear. Four issues warrant attention:

1. Open rasterio datasets leak on merge failure (no try/finally).
2. Out-of-bounds coordinate handling in `sample_elevation` relies on an undocumented rasterio behavior rather than explicit bounds checking.
3. `numpy` is used directly in tests but not declared as a dependency.
4. The `test_sample_elevation_oob` test validates behavior that is not guaranteed by the rasterio API.

No critical (security or data-loss) issues found.

---

## Warnings

### WR-01: Rasterio datasets leak if `merge()` raises

**File:** `data/dem_pipeline.py:41-51`
**Issue:** The list of open `rasterio.Dataset` objects is closed in a manual for-loop on lines 50-51, which is only reached on the happy path. If `merge(datasets)` raises an exception (e.g., CRS mismatch, memory error), all open file handles are leaked for the lifetime of the process. This can cause "too many open files" errors in long-running processes or when called repeatedly.

**Fix:** Use `contextlib.ExitStack` to ensure datasets are always closed:

```python
import contextlib

with contextlib.ExitStack() as stack:
    datasets = [stack.enter_context(rasterio.open(p)) for p in tile_paths]
    mosaic, transform = merge(datasets)
    meta = datasets[0].meta.copy()
    meta.update({
        "driver": "GTiff",
        "height": mosaic.shape[1],
        "width": mosaic.shape[2],
        "transform": transform,
    })
# datasets are closed here regardless of exceptions
with rasterio.open(dem_path, "w", **meta) as dest:
    dest.write(mosaic)
```

---

### WR-02: Out-of-bounds coordinate handling relies on undocumented rasterio behavior

**File:** `data/dem_pipeline.py:71-76`
**Issue:** The docstring states that out-of-bounds coordinates return `None`, and the test `test_sample_elevation_oob` verifies this. However, `rasterio.DatasetReader.sample()` does not guarantee what value it returns for coordinates outside the dataset extent — it silently returns whatever value rasterio reads from outside the array (implementation-dependent: may be nodata, 0, or garbage). The test passes today because the fixture happens to have `nodata=-9999.0` set, so the fill value equals nodata, which is then mapped to `None`. A DEM file without a nodata value would return `int(round(float(value)))` for OOB coordinates instead of `None`.

**Fix:** Add explicit bounds checking before sampling, or document clearly that the function only guarantees `None` for nodata-sentinel pixels and that OOB behavior is dataset-dependent:

```python
def sample_elevation(
    lons: list[float],
    lats: list[float],
    dem_path: Path | str,
) -> list[int | None]:
    """Sample elevation at each (lon, lat) coordinate from a GeoTIFF.

    Returns integer meters for in-bounds, non-nodata coordinates.
    Returns None for nodata pixels. Out-of-bounds coordinates return None
    only if the dataset has a nodata sentinel defined.
    """
    with rasterio.open(dem_path) as dataset:
        nodata = dataset.nodata
        bounds = dataset.bounds
        results: list[int | None] = []
        for lon, lat, pixel in zip(lons, lats, dataset.sample(zip(lons, lats))):
            if not (bounds.left <= lon <= bounds.right and bounds.bottom <= lat <= bounds.top):
                results.append(None)
                continue
            value = pixel[0]
            if nodata is not None and value == nodata:
                results.append(None)
            else:
                results.append(int(round(float(value))))
    return results
```

---

### WR-03: `test_sample_elevation_oob` validates undefined behavior

**File:** `data/tests/test_dem_pipeline.py:44-47`
**Issue:** This test asserts that a coordinate outside the DEM bounds returns `[None]`. This assertion only holds because the `dem_fixture` has a nodata sentinel and rasterio fills OOB samples with that sentinel. If the DEM has no nodata, or if rasterio changes its OOB fill behavior, the test will either fail or give a false positive. The test is testing implementation accident, not a contract.

**Fix:** Once WR-02 is addressed with explicit bounds checking, this test correctly validates the guaranteed behavior. No test change needed beyond the fix to `sample_elevation`.

---

### WR-04: `numpy` used directly in tests but not declared as a dependency

**File:** `data/pyproject.toml`, `data/tests/test_dem_pipeline.py:52`, `data/tests/conftest.py:249`
**Issue:** Both test files import `numpy` directly (`import numpy as np`), but `numpy` is not listed in `[project].dependencies` or `[dependency-groups].dev`. It is currently available as a transitive dependency of `rasterio`, but this is fragile: a rasterio update could change how numpy is bundled, or `uv` could resolve a numpy version incompatible with the test code.

**Fix:** Add `numpy` to the dev dependency group in `pyproject.toml`:

```toml
[dependency-groups]
dev = [
    "pytest>=9.0.2",
    "numpy>=1.24",
]
```

---

## Info

### IN-01: No coverage for the multi-tile merge path in `ensure_dem`

**File:** `data/tests/test_dem_pipeline.py`
**Issue:** `test_ensure_dem_caches` only tests the cache-hit path (file already exists). The download path (both single-tile copy and multi-tile merge via `s3dep.get_dem`) is untested. The comment in the test file acknowledges "cache hit path only", but the merge path in `dem_pipeline.py:40-53` contains the resource-leak bug (WR-01), making the lack of coverage for that path more significant.

**Fix:** Add a test for the merge path using a mock or monkeypatch of `s3dep.get_dem` that returns two synthetic tile paths. This would also exercise the `ExitStack` fix from WR-01:

```python
def test_ensure_dem_merges_tiles(tmp_path, dem_fixture, monkeypatch):
    """ensure_dem merges multiple tiles into a single output file."""
    import dem_pipeline

    # Create a second tile fixture alongside the first
    second_tile = tmp_path / "tile2.tif"
    shutil.copy(dem_fixture, second_tile)

    monkeypatch.setattr(
        dem_pipeline.s3dep, "get_dem",
        lambda bbox, save_dir, res: [dem_fixture, second_tile]
    )
    result = ensure_dem(tmp_path / "cache")
    assert result.exists()
    assert result.name == "wa_3dep_10m.tif"
```

---

_Reviewed: 2026-04-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
