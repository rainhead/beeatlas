---
phase: 92-slug-migration-pipeline-prep
reviewed: 2026-05-15T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - content/species-photos.toml
  - data/species_export.py
  - data/species_maps.py
  - data/tests/test_species_export.py
  - data/tests/test_species_maps.py
  - src/tests/validate-species.test.ts
findings:
  critical: 1
  warning: 4
  info: 2
  total: 7
status: issues_found
---

# Phase 92: Code Review Report

**Reviewed:** 2026-05-15T00:00:00Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

This phase introduces the `Genus/epithet` slug format (PIPE-03), adds per-species SVG map generation with subdirectory layout, and adds a `validate-species.mjs` script with associated tests. The core logic in `species_export.py` and `species_maps.py` is largely correct. However, one BLOCKER was found — `species_maps.py` queries only `ecdysis_data.occurrences` for map points, silently omitting the provisional ARM 2 rows that exist only in the dbt `occurrences.parquet` mart. Four warnings and two info items round out the findings.

## Critical Issues

### CR-01: species_maps.py queries ecdysis_data.occurrences directly, missing ARM 2 (provisional) occurrences

**File:** `data/species_maps.py:218-228`

**Issue:** `generate_species_maps` builds per-species SVG maps by reading `ecdysis_data.occurrences` (the raw Ecdysis source table). This table contains only Ecdysis-tracked records. ARM 2 provisional WABA records — rows that exist in `int_combined` UNION ALL but have no Ecdysis catalog number — appear only in `occurrences.parquet` (the dbt mart). Provisional records can have valid coordinates (`sob.longitude`, `sob.latitude` in `int_combined.sql:51-52`) and contribute to `occurrence_count` in `species.parquet` via `int_species_occurrences_agg`. The result is that a species can pass the `WHERE occurrence_count > 0` filter and get a map SVG, yet that SVG shows fewer points than actually exist for the species — with no warning emitted.

The fix is to read from the already-written `species-maps`-adjacent `occurrences.parquet` (which `species_export.py` already produced before this step runs), or from the dbt sandbox `occurrences.parquet`. The latter is already loaded as `occurrences_parquet_in` in `species_export.py` and is available at `DBT_SANDBOX_DIR / 'occurrences.parquet'`.

**Fix:**
```python
# Replace the ecdysis_data.occurrences query at lines 218-228 with:
occurrences_parquet = ASSETS_DIR / "occurrences.parquet"
if not occurrences_parquet.exists():
    raise FileNotFoundError(
        f"{occurrences_parquet} not found — run occurrences export step first"
    )
occ_rows = con.execute(
    f"""
    SELECT canonical_name,
           lon,
           lat
    FROM read_parquet('{occurrences_parquet}')
    WHERE canonical_name IS NOT NULL
      AND lat IS NOT NULL
      AND lon IS NOT NULL
    """
).fetchall()
```

If `occurrences.parquet` is not available in ASSETS_DIR, read from `DBT_SANDBOX_DIR / 'occurrences.parquet'` (the dbt sandbox path), consistent with how `species_export.py` reads its inputs.

## Warnings

### WR-01: monkeypatch.setenv('DBT_SANDBOX_DIR', ...) has no effect — module-level variable already evaluated

**File:** `data/tests/test_species_export.py:34` and `data/tests/test_species_export.py:59`

**Issue:** Both sandbox-guarded tests call `monkeypatch.setenv('DBT_SANDBOX_DIR', str(SANDBOX))` intending to control where `export_species_parquet` reads its inputs. However, `DBT_SANDBOX_DIR` in `species_export.py` is evaluated once at module import time (line 41-44: `DBT_SANDBOX_DIR = Path(os.environ.get(...))`). Setting the env var after import has no effect; the function reads the module-level `Path` object, not `os.environ`. The tests pass today because `SANDBOX` in the test file resolves to the same path as the module-level default (`data/dbt/target/sandbox`). If the default ever changes, or if `DBT_SANDBOX_DIR` is set in the environment at test time, the tests will silently use the wrong path.

**Fix:** Replace `monkeypatch.setenv` with `monkeypatch.setattr`:
```python
monkeypatch.setattr(se_mod, 'DBT_SANDBOX_DIR', SANDBOX)
```

### WR-02: BEE_FAMILIES constant is defined but never used

**File:** `data/species_export.py:51-54`

**Issue:** `BEE_FAMILIES` is defined with a docstring-level explanation that non-bee Hymenoptera "get filtered out of species artifacts," but the constant is never referenced in any query or filter in the same file. The SELECT from `species_parquet_in` (line 129) fetches all rows regardless of family. If the dbt mart `species.parquet` ever includes non-bee families, they will flow through to the output artifacts without filtering.

**Fix:** Either apply the filter in the SELECT:
```python
mart_cols = ', '.join(SPECIES_COLUMNS[:-1])
families_in = ', '.join(f"'{f}'" for f in BEE_FAMILIES)
fetched = con.execute(
    f"SELECT {mart_cols} FROM read_parquet('{species_parquet_in}')"
    f" WHERE family IN ({families_in})"
    f" ORDER BY canonical_name"
).fetchall()
```
Or remove `BEE_FAMILIES` if the dbt mart contract already guarantees only bee families are present, and add a comment explaining why the filter lives in dbt.

### WR-03: _ring_to_path crashes with IndexError on an empty coordinate ring

**File:** `data/species_maps.py:71-75`

**Issue:** `_ring_to_path` accesses `pts[0]` unconditionally (line 73). If the GeoJSON returned by `ST_AsGeoJSON` contains a `Polygon` or `MultiPolygon` with an empty ring (zero coordinates), this raises `IndexError: list index out of range` and aborts the entire `generate_species_maps` run. While GeoJSON from a well-formed database is unlikely to produce empty rings, `ST_SimplifyPreserveTopology` with a high tolerance (0.005) can collapse small polygons to empty geometries in some PostGIS/DuckDB versions.

**Fix:**
```python
def _ring_to_path(coords: list[list[float]]) -> str:
    if not coords:
        return ""   # degenerate ring — skip silently
    pts = [_project(lon, lat) for lon, lat in coords]
    head = f"M{pts[0][0]:.2f},{pts[0][1]:.2f}"
    tail = "".join(f"L{x:.2f},{y:.2f}" for x, y in pts[1:])
    return head + tail + "Z"
```
Callers that join multiple rings with `" ".join(...)` will handle empty strings gracefully.

### WR-04: content/species-photos.toml has 102 unmirated entries whose keys will always warn at runtime

**File:** `content/species-photos.toml:1` (and throughout)

**Issue:** The TOML file has 37 genus-only keys (e.g., `[species.agapostemon]`, `[species.andrena]`) and 65 lowercase-first species-level keys (e.g., `[species."agapostemon subtilior"]`, `[species."andrena pertristis"]`). The `validate-species.mjs` validator compares TOML keys case-sensitively against `scientificName` from `species.json` (e.g., `"Agapostemon subtilior"`, `"Andrena pertristis"`). All 102 of these entries produce "unknown species" warnings every time `npm run validate-species` is run with `species.json` present. This is particularly misleading for genus-level keys like `[species.agapostemon]` which appear to be stubs not matched to any species record.

These warnings are exit-0 (non-blocking) today, but they mask genuine "unknown species" warnings that would surface newly invalid entries. The validator's signal is degraded.

**Fix:** Migrate all 37 genus-only and 65 lowercase-first keys to their canonical `scientificName` form (as stored in `species.json`), or delete the genus-level catch-all entries if they are intentional placeholders that will never match a species record.

## Info

### IN-01: SQL f-strings embed env-var-controlled file paths without sanitization

**File:** `data/species_export.py:129`, `data/species_export.py:189`, `data/species_maps.py:208-213`

**Issue:** File paths derived from `DBT_SANDBOX_DIR` (env var) and `ASSETS_DIR` (env var) are interpolated directly into DuckDB SQL strings via f-strings (e.g., `f"SELECT ... FROM read_parquet('{species_parquet_in}')`). A maliciously constructed `DBT_SANDBOX_DIR` or `EXPORT_DIR` containing a single quote could break the SQL or, in theory, inject SQL. This is an internal pipeline with no user-facing attack surface, but it is worth noting given that nightly.sh runs as a cron job.

**Fix:** Use DuckDB's parameter binding for file paths when available, or at minimum assert that the path does not contain single quotes before interpolation:
```python
assert "'" not in str(species_parquet_in), f"Unsafe path: {species_parquet_in}"
```

### IN-02: test_species_maps.py has no test for the return value (clipped count) of _write_species_svg

**File:** `data/tests/test_species_maps.py:15-24`

**Issue:** `test_write_species_svg_creates_subdir` only asserts that the output file exists. It does not assert the return value (clipped count) of `_write_species_svg`. The function's documented contract includes returning the number of out-of-bbox points dropped. A regression that always returns 0 would go undetected.

**Fix:**
```python
def test_write_species_svg_clipped_count(tmp_path):
    """_write_species_svg returns the number of out-of-bbox points dropped."""
    backdrop = ET.Element(f"{{{SVG_NS}}}svg")
    slug = "Andrena/milwaukeensis"
    # One in-bbox point (WA), one out-of-bbox point
    in_bbox = (-120.0, 47.0)
    out_bbox = (-70.0, 42.0)   # east coast — outside WA
    clipped = _write_species_svg(slug, [in_bbox, out_bbox], backdrop, tmp_path)
    assert clipped == 1, f"Expected 1 clipped point, got {clipped}"
```

---

_Reviewed: 2026-05-15T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
