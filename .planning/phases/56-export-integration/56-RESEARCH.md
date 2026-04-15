# Phase 56: Export Integration - Research

**Researched:** 2026-04-15
**Domain:** Python data pipeline — pyarrow parquet post-processing, rasterio sampling, DuckDB export
**Confidence:** HIGH

## Summary

Phase 56 wires `dem_pipeline.py` into `export.py` so both parquet output files gain a nullable `elevation_m` INT16 column. The integration approach is Python post-processing: DuckDB writes the parquet file via its COPY statement, then Python reads it with pyarrow, appends the elevation column, and overwrites the file. This keeps SQL clean and follows the existing verification pattern.

All decisions are locked in CONTEXT.md. The code being modified is fully read and understood. The main implementation risk is the `read_only=True` connection in `main()` — STATE.md flags this as needing resolution, and the solution is to drop the flag (safe for single-writer nightly). pyarrow is not yet a direct dependency and must be added to `pyproject.toml`.

**Primary recommendation:** Drop `read_only=True` from the DuckDB connection in `main()`. Extract post-processing into a private `_add_elevation(out_path, dem_path)` function for DRY. Add `pyarrow>=12` to `pyproject.toml`. Add `_dem_cache/` to `.gitignore`.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Integration approach — Python post-processing after DuckDB COPY. COPY stays unchanged; pyarrow reads, appends `elevation_m` as INT16, overwrites.
- **D-02:** DEM cache at `data/_dem_cache/` (relative default). Overridable via `DEM_CACHE_DIR` env var following `DB_PATH` pattern. Directory gitignored.
- **D-03:** Bulk sampling — call `sample_elevation` once per table with all lons/lats.
- **D-04:** Parquet post-processing workflow: `pq.read_table` → `sample_elevation` → `pa.array(elevations, type=pa.int16())` → `table.append_column` → `pq.write_table`.
- **D-05:** Null semantics — no assertion on elevation_m nulls; print summary line only.
- **D-06:** Tests use monkeypatched `ensure_dem` returning `dem_fixture` path; no network.
- **D-07:** Schema gate (`validate-schema.mjs`) adds `elevation_m` to both EXPECTED arrays; ships in same commit as `export.py`.

### Claude's Discretion

- Whether to extract post-processing into a private `_add_elevation(out_path, dem_path)` function or inline in each export function.
- Whether `DEM_CACHE_DIR` default uses `Path(__file__).parent / "_dem_cache"` or relative `"_dem_cache"`. Use absolute per pathlib convention.
- Module docstring update for `export.py`.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ELEV-02 | `export.py` samples elevation at each specimen's lat/lon using rasterio; nodata sentinel from `dataset.nodata`; `elevation_m` (INT16, nullable) added to `ecdysis.parquet` | `sample_elevation` in `dem_pipeline.py` already handles nodata dynamically; pyarrow INT16 type is `pa.int16()` |
| ELEV-03 | Same for `samples.parquet` — `elevation_m` (INT16, nullable) added via same approach | Same pattern as ELEV-02; samples use `lon`/`lat` column names (not `longitude`/`latitude`) |
| ELEV-04 | `validate-schema.mjs` schema gate enforces `elevation_m` in both parquet files; same commit | EXPECTED object in the script; add `'elevation_m'` to both arrays |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| DEM download and caching | Data Pipeline (`dem_pipeline.py`) | — | Already implemented in Phase 55 |
| Elevation sampling | Data Pipeline (`dem_pipeline.py`) | — | `sample_elevation` is the API; `export.py` is a caller |
| Parquet post-processing | Data Pipeline (`export.py`) | — | Runs after DuckDB COPY, on the pipeline host |
| Schema enforcement | CI gate (`validate-schema.mjs`) | — | Runs before every CI build |
| Elevation display | Phase 57+ Frontend | — | Out of scope for this phase |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pyarrow | >=12 | Read/write parquet, append columns | Standard parquet library; used by DuckDB internally |
| pyarrow.parquet | (bundled with pyarrow) | `pq.read_table`, `pq.write_table` | Official parquet I/O for pyarrow |
| rasterio | >=1.5.0 | Already in pyproject.toml — used by `dem_pipeline.py` | Already a direct dependency |

**Version verification:** pyarrow is not currently installed in the data project (`import pyarrow` fails). Must be added as a direct dependency. [VERIFIED: local environment probe]

**Installation:**
```bash
# In data/pyproject.toml [project.dependencies]:
# "pyarrow>=12",
uv sync --project data
```

### pyarrow API Patterns (from codebase context)

The CONTEXT.md documents the exact workflow. Confirmed pyarrow API behavior [ASSUMED: training knowledge; standard and stable since v8]:

```python
import pyarrow as pa
import pyarrow.parquet as pq

# Read file DuckDB just wrote
table = pq.read_table(out_path)

# Append elevation column (None values become null automatically)
elevations: list[int | None] = sample_elevation(lons, lats, dem_path)
elevation_col = pa.array(elevations, type=pa.int16())
table = table.append_column("elevation_m", elevation_col)

# Overwrite in-place
pq.write_table(table, out_path)
```

`pa.array([500, None, 750], type=pa.int16())` produces a nullable INT16 array where Python `None` becomes a parquet null — no special handling required. [ASSUMED]

---

## Architecture Patterns

### System Architecture Diagram

```
nightly.sh
    |
    v
export.py::main()
    |-- ensure_dem(DEM_CACHE_DIR) -----> dem_pipeline.py -----> _dem_cache/wa_3dep_10m.tif
    |                                                              (download if absent)
    |
    |-- export_ecdysis_parquet(con, dem_path)
    |       |-- DuckDB COPY ... TO ecdysis.parquet
    |       |-- _add_elevation(out_path, dem_path)
    |               |-- pq.read_table(out_path)
    |               |-- extract lons/lats arrays
    |               |-- sample_elevation(lons, lats, dem_path) --> list[int|None]
    |               |-- pa.array(elevations, type=pa.int16())
    |               |-- table.append_column("elevation_m", col)
    |               |-- pq.write_table(table, out_path)
    |
    |-- export_samples_parquet(con, dem_path)
            |-- (same pattern — extract lon/lat, _add_elevation)
```

### Function Signature Changes

`export_ecdysis_parquet` and `export_samples_parquet` gain a `dem_path: Path` parameter:

```python
def export_ecdysis_parquet(con: duckdb.DuckDBPyConnection, dem_path: Path) -> None: ...
def export_samples_parquet(con: duckdb.DuckDBPyConnection, dem_path: Path) -> None: ...
```

`main()` calls `ensure_dem(DEM_CACHE_DIR)` once and passes the result to both:

```python
DEM_CACHE_DIR = Path(os.environ.get('DEM_CACHE_DIR', Path(__file__).parent / '_dem_cache'))

def main() -> None:
    con = duckdb.connect(DB_PATH)   # read_only=True DROPPED (see Critical Issue below)
    con.execute("INSTALL spatial; LOAD spatial;")
    dem_path = ensure_dem(DEM_CACHE_DIR)
    export_ecdysis_parquet(con, dem_path)
    export_samples_parquet(con, dem_path)
    export_counties_geojson(con)
    export_ecoregions_geojson(con)
    con.close()
```

### Recommended Private Helper

Extracting post-processing into `_add_elevation` eliminates duplication across both export functions:

```python
def _add_elevation(out_path: str, dem_path: Path) -> None:
    """Append elevation_m INT16 nullable column to a written parquet file."""
    import pyarrow as pa
    import pyarrow.parquet as pq

    table = pq.read_table(out_path)
    lons = table.column("longitude").to_pylist()  # ecdysis column name
    lats = table.column("latitude").to_pylist()   # ecdysis column name
    elevations = sample_elevation(lons, lats, dem_path)
    elevation_col = pa.array(elevations, type=pa.int16())
    table = table.append_column("elevation_m", elevation_col)
    pq.write_table(table, out_path)
```

Note: samples.parquet uses `lon`/`lat` column names (not `longitude`/`latitude`). Either pass column names as parameters or use two separate helper calls. Recommended: pass `lon_col` and `lat_col` as parameters to keep it DRY.

### Column Names Per Table

| Table | Longitude column | Latitude column |
|-------|-----------------|-----------------|
| ecdysis.parquet | `longitude` | `latitude` |
| samples.parquet | `lon` | `lat` |

[VERIFIED: read from export.py SELECT clauses directly]

### Verification Print Format (D-05)

Match existing print style in `export.py`:

```python
non_null = sum(1 for e in elevations if e is not None)
null_count = len(elevations) - non_null
print(f"  ecdysis.parquet: {total:,} rows, {non_null:,} elevation_m non-null, {null_count:,} null")
```

This print replaces the elevation-specific verification; the existing county/ecoregion assertions remain unchanged.

---

## Critical Issue: read_only=True Connection

**Current state:** `main()` opens `duckdb.connect(DB_PATH, read_only=True)`.

**Problem:** DuckDB's `read_only=True` prevents any write operations on that connection. The COPY statements write parquet files to the filesystem (not the DB), so they would not fail — but if DuckDB internally uses any temporary write space, it may error. More critically, STATE.md documents this as a known concern: "drop flag (safe for single-writer nightly) or use a second in-memory DuckDB connection."

**Resolution (locked):** Drop `read_only=True`. The nightly pipeline is the sole writer. There is no concurrent access risk. [VERIFIED: STATE.md decision, CLAUDE.md notes Lambda CDK artifacts exist but active path is `data/nightly.sh` on maderas]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parquet column append | Custom byte-level parquet manipulation | `pyarrow.parquet` + `table.append_column` | Parquet format has complex row group and footer structures |
| Nodata detection | Hardcoded sentinel values | `dataset.nodata` property from rasterio | Sentinel varies by DEM source; `dem_pipeline.py` already handles this correctly |
| INT16 null encoding | Manual bit-manipulation or sentinel | `pa.array(..., type=pa.int16())` with Python `None` | pyarrow handles null bitmaps automatically |

---

## Common Pitfalls

### Pitfall 1: Column Name Mismatch Between Tables
**What goes wrong:** `_add_elevation` uses hardcoded `"longitude"/"latitude"` column names but samples.parquet uses `"lon"/"lat"` — KeyError at runtime.
**Why it happens:** The two tables have different column aliases in the SELECT statements.
**How to avoid:** Parameterize the helper with `lon_col` and `lat_col` parameters, or use two separate calls with different column names.
**Warning signs:** `KeyError: 'longitude'` when processing samples.parquet.

### Pitfall 2: Nodata Leak (ELEV-04 Criterion 4)
**What goes wrong:** `sample_elevation` returns `int(round(float(-9999.0)))` = `-9999` instead of `None`, causing rows with `elevation_m < -500`.
**Why it happens:** `dem_pipeline.py` already guards against this via `dataset.nodata`, but if `dataset.nodata` is `None` (file has no nodata attribute), the guard is skipped.
**How to avoid:** This is already handled in `dem_pipeline.py` line 72–76. No additional guard needed in `export.py`. The success criterion "no row with `elevation_m < -500`" is satisfied by the existing implementation.
**Warning signs:** Rows with `elevation_m = -9999` in output.

### Pitfall 3: Out-of-Bounds Coordinate Behavior
**What goes wrong:** `rasterio.dataset.sample` on OOB coordinates does not raise an exception — it returns the nodata value or 0, depending on the GeoTIFF. For the WA DEM, OOB specimens (outside WA) will return nodata, which `sample_elevation` converts to `None`.
**Why it happens:** rasterio's `sample` is permissive about OOB coordinates. [ASSUMED]
**How to avoid:** This is handled by `dem_pipeline.py`'s nodata conversion — no additional guard needed. OOB → nodata → None → null in parquet.
**Warning signs:** Non-null `elevation_m` for specimens known to be outside WA.

### Pitfall 4: pyarrow Not in pyproject.toml
**What goes wrong:** Pipeline fails with `ModuleNotFoundError: No module named 'pyarrow'` in CI or fresh environments.
**Why it happens:** pyarrow is a transitive dependency of rasterio but not guaranteed to be importable as a top-level package in all environments. [VERIFIED: local probe shows it is not importable]
**How to avoid:** Add `pyarrow>=12` explicitly to `[project.dependencies]` in `data/pyproject.toml`.

### Pitfall 5: _dem_cache Not in .gitignore
**What goes wrong:** The WA DEM (~200-500 MB) gets committed to git.
**Why it happens:** New directory not yet gitignored.
**How to avoid:** Add `data/_dem_cache/` to `.gitignore` in the same commit as the export changes.

---

## Code Examples

### Existing Test Pattern (how to structure new export tests)

```python
# From test_export.py — pattern to follow for elevation tests
def test_ecdysis_parquet_schema(fixture_con, export_dir, monkeypatch):
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_ecdysis_parquet(fixture_con)

    parquet_path = str(export_dir / 'ecdysis.parquet')
    schema = duckdb.execute(
        f"DESCRIBE SELECT * FROM read_parquet('{parquet_path}')"
    ).fetchall()
    actual_cols = [row[0] for row in schema]
    assert 'elevation_m' in actual_cols
```

For elevation tests, monkeypatch `dem_pipeline.ensure_dem` to return `dem_fixture`:

```python
def test_ecdysis_parquet_elevation_col(fixture_con, export_dir, dem_fixture, monkeypatch):
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    import dem_pipeline
    monkeypatch.setattr(dem_pipeline, 'ensure_dem', lambda cache_dir: dem_fixture)
    # Call updated export function — must call ensure_dem internally or accept dem_path
    export_mod.export_ecdysis_parquet(fixture_con, dem_fixture)

    parquet_path = str(export_dir / 'ecdysis.parquet')
    schema = duckdb.execute(f"DESCRIBE SELECT * FROM read_parquet('{parquet_path}')").fetchall()
    actual_cols = [row[0] for row in schema]
    assert 'elevation_m' in actual_cols
    # Check type
    type_map = {row[0]: row[1] for row in schema}
    assert 'SMALLINT' in type_map['elevation_m']  # DuckDB name for INT16
```

### dem_fixture Coordinates (for verifying in-bounds vs OOB)

The `dem_fixture` covers bbox `(-121.0, 47.0, -120.0, 48.0)`. The seed specimen in `conftest.py` is at `lon=-120.912, lat=47.608` — inside the fixture bbox, top-left pixel (500m value). The iNat observation is at `lon=-120.8, lat=47.5` — also inside the fixture.

This means elevation tests with the fixture DB will get non-null `elevation_m` values for all seed rows (both are within the fixture's bounding box).

### validate-schema.mjs Change

```javascript
// Before:
'ecdysis.parquet': [
  'ecdysis_id', 'catalog_number', 'longitude', 'latitude', ...
  'modified', 'specimen_observation_id',
],
'samples.parquet': [
  'observation_id', 'observer', 'date', 'lat', 'lon',
  'specimen_count', 'sample_id',
  'county', 'ecoregion_l3',
],

// After (add 'elevation_m' to both):
'ecdysis.parquet': [
  'ecdysis_id', 'catalog_number', 'longitude', 'latitude', ...
  'modified', 'specimen_observation_id', 'elevation_m',
],
'samples.parquet': [
  'observation_id', 'observer', 'date', 'lat', 'lon',
  'specimen_count', 'sample_id',
  'county', 'ecoregion_l3', 'elevation_m',
],
```

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest >=9.0.2 |
| Config file | `data/pyproject.toml` `[tool.pytest.ini_options]` |
| Quick run command | `cd data && uv run pytest tests/test_export.py -x` |
| Full suite command | `cd data && uv run pytest` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ELEV-02 | `ecdysis.parquet` gains `elevation_m` INT16 nullable column | integration | `uv run pytest tests/test_export.py::test_ecdysis_parquet_elevation_col -x` | ❌ Wave 0 |
| ELEV-02 | OOB/nodata coords produce NULL (not -9999 sentinel) | integration | `uv run pytest tests/test_export.py::test_ecdysis_elevation_no_sentinel_leak -x` | ❌ Wave 0 |
| ELEV-03 | `samples.parquet` gains `elevation_m` INT16 nullable column | integration | `uv run pytest tests/test_export.py::test_samples_parquet_elevation_col -x` | ❌ Wave 0 |
| ELEV-04 | Schema gate fails if `elevation_m` absent | manual/CI | `node scripts/validate-schema.mjs` | ✅ (update existing) |

### Sampling Rate

- **Per task commit:** `cd data && uv run pytest tests/test_export.py -x`
- **Per wave merge:** `cd data && uv run pytest`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `data/tests/test_export.py` — add elevation-specific tests (schema column, INT16 type, no sentinel leak). File exists — add tests to it, do not replace.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| pyarrow | Post-processing parquet | ✗ | — | None — must add to pyproject.toml |
| rasterio | `dem_pipeline.py` | ✓ | >=1.5.0 in pyproject.toml | — |
| uv | Test runner | ✓ | assumed present (existing usage) | — |

**Missing dependencies with no fallback:**
- `pyarrow` — must be added to `data/pyproject.toml` as `"pyarrow>=12"` before implementation.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `pa.array([500, None], type=pa.int16())` produces nullable INT16 with null bitmask | Standard Stack | pyarrow None handling is well-documented and stable since v8 — risk is very low |
| A2 | rasterio `dataset.sample` on OOB coordinates returns nodata value rather than raising | Common Pitfalls | If it raises, `sample_elevation` in `dem_pipeline.py` will propagate the exception — needs a try/except or bounds check |
| A3 | DuckDB COPY to parquet works without `read_only=False` needing explicit temp space | Critical Issue | Confirmed safe by STATE.md decision to drop read_only flag |

---

## Open Questions

1. **Out-of-bounds rasterio behavior**
   - What we know: `dem_pipeline.py` uses `dataset.sample(zip(lons, lats))` without bounds checking
   - What's unclear: Whether rasterio raises on OOB or returns nodata — this was documented as [ASSUMED] in Phase 55 tests (`test_sample_elevation_oob` passes in the test suite, which uses a 2×2 fixture)
   - Recommendation: Trust the existing `test_sample_elevation_oob` test which already passes — it verifies OOB returns `[None]`. No change needed.

2. **Water body pixels (0 instead of nodata)**
   - What we know: STATE.md flags that some 3DEP products fill water bodies with 0 rather than nodata
   - What's unclear: Whether any WA specimen coordinates fall on water pixels
   - Recommendation: Document in a code comment in `_add_elevation` that water body pixels may yield `elevation_m = 0` (not null). This is valid data (0m elevation), not a sentinel. No code change needed.

---

## Sources

### Primary (HIGH confidence)
- `data/export.py` — read directly, all function signatures and column names verified
- `data/dem_pipeline.py` — read directly, `ensure_dem` and `sample_elevation` signatures verified
- `data/tests/conftest.py` — `dem_fixture` bbox and pixel values verified
- `data/tests/test_export.py` — test patterns verified
- `data/pyproject.toml` — dependency list verified; pyarrow absent confirmed
- `.planning/phases/56-export-integration/56-CONTEXT.md` — all locked decisions

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — `read_only=True` resolution decision documented

### Tertiary (LOW confidence)
- pyarrow `pa.array` null handling behavior [ASSUMED from training knowledge]
- rasterio OOB coordinate behavior [partially verified via existing test]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — pyarrow dependency status verified locally; API pattern from CONTEXT.md
- Architecture: HIGH — all source files read directly; column names verified in SQL
- Pitfalls: HIGH for column name mismatch and pyarrow dep; MEDIUM for OOB behavior

**Research date:** 2026-04-15
**Valid until:** 2026-05-15 (stable libraries, low churn risk)
