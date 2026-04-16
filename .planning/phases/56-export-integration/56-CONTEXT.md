# Phase 56: Export Integration - Context

**Gathered:** 2026-04-15
**Status:** Ready for planning
**Mode:** auto (all decisions auto-selected)

<domain>
## Phase Boundary

Wire `dem_pipeline.py` into `data/export.py` so both `ecdysis.parquet` and `samples.parquet` gain a nullable `elevation_m` INT16 column. Update `validate-schema.mjs` to enforce the column in CI. No frontend changes — that is Phase 57+.

</domain>

<decisions>
## Implementation Decisions

### D-01: Integration approach — Python post-processing after DuckDB COPY
The existing COPY queries stay unchanged. After each COPY, a Python post-processing step reads the written parquet with `pyarrow`, computes elevations via `sample_elevation`, appends the `elevation_m` column as `pa.array(elevations, type=pa.int16())`, and rewrites the file in-place.

**Rationale:** ELEV-02 says "using `rasterio`" — DuckDB SQL UDFs are not the pattern. Post-processing keeps the SQL clean and follows the existing print-then-assert verification pattern.

**[auto]** Recommended option selected.

### D-02: DEM cache location
Default: `data/_dem_cache/` (relative to the script). Overridable via `DEM_CACHE_DIR` env var, following the `DB_PATH` pattern already in `export.py`. Directory must be added to `.gitignore`.

**Rationale:** The WA DEM is ~200–500 MB. A fixed, gitignored directory avoids re-downloading on every pipeline run. The `_` prefix signals internal use.

**[auto]** Recommended option selected.

### D-03: Bulk sampling (not per-row)
`sample_elevation` takes `list[float]` inputs — call it once per table with all lons/lats at once. Extract the full lon/lat arrays from the written parquet before sampling.

**Rationale:** Rasterio `dataset.sample(zip(lons, lats))` is an iterator — one `open()` call, one pass through all coordinates. Dramatically faster than per-row calls.

**[auto]** Recommended option selected.

### D-04: Parquet post-processing with pyarrow
Workflow per table:
1. `table = pq.read_table(out_path)` — read the file DuckDB just wrote
2. Build `elevations = sample_elevation(lons, lats, dem_path)` — returns `list[int | None]`
3. `elevation_col = pa.array(elevations, type=pa.int16())` — None values become null automatically
4. `table = table.append_column("elevation_m", elevation_col)`
5. `pq.write_table(table, out_path)` — overwrite in-place

**pyarrow is already a transitive dependency** (via rasterio). If not present as a direct dep, add `pyarrow>=12` to `data/pyproject.toml`.

**[auto]** Recommended option selected.

### D-05: Null semantics for elevation_m — no assertion, print summary only
elevation_m is legitimately nullable (nodata pixels, OOB coords). Unlike county/ecoregion (assert zero nulls), just print a summary line:
```
  ecdysis.parquet: 45,xxx rows, N elevation_m non-null, M null
```
No assertion.

**[auto]** Recommended option selected.

### D-06: Test strategy — monkeypatched ensure_dem + dem_fixture
Integration tests use the existing `dem_fixture` from `conftest.py` (2×2 synthetic GeoTIFF). Monkeypatch `dem_pipeline.ensure_dem` to return the fixture path so no network access is needed. Test that:
- The parquet file gains an `elevation_m` column with INT16 type
- Rows within the fixture bbox get integer values; rows OOB get None/null

**[auto]** Recommended option selected.

### D-07: Schema gate update (ELEV-04)
In `validate-schema.mjs`, add `'elevation_m'` to the `expectedCols` arrays for both `ecdysis.parquet` and `samples.parquet`. This ships in the same commit as `export.py` changes (per ELEV-04).

**[auto]** Recommended option selected.

### Claude's Discretion
- Whether to helper-extract the post-processing step into a private `_add_elevation(out_path, dem_path)` function or inline it in each export function. Claude decides based on DRY trade-off.
- Whether `DEM_CACHE_DIR` env var defaults use `Path(__file__).parent / "_dem_cache"` or relative `"_dem_cache"`. Claude uses absolute path per pathlib convention.
- Module docstring update for export.py to reflect new elevation column.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase requirements
- `.planning/REQUIREMENTS.md` §ELEV-02, ELEV-03, ELEV-04 — authoritative requirement text
- `.planning/ROADMAP.md` §Phase 56 — success criteria and goal

### Source files to modify
- `data/export.py` — add DEM integration to both export functions
- `scripts/validate-schema.mjs` — add `elevation_m` to EXPECTED arrays for both files
- `data/pyproject.toml` — add `pyarrow>=12` if not present

### Source files to read (not modify)
- `data/dem_pipeline.py` — `ensure_dem`, `sample_elevation`, `WA_BBOX` signatures
- `data/tests/conftest.py` — `dem_fixture` fixture (2×2 synthetic GeoTIFF)
- `data/tests/test_dem_pipeline.py` — test style and patterns to follow

### Prior phase context
- `.planning/phases/55-dem-acquisition-module/55-CONTEXT.md` — ensure_dem returns `Path`, sample_elevation returns `list[int | None]`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `data/dem_pipeline.py` — `ensure_dem(cache_dir)` and `sample_elevation(lons, lats, dem_path)` from Phase 55
- `data/tests/conftest.py` — `dem_fixture` at line ~246: 2×2 GeoTIFF, bbox `(-121.0, 47.0, -120.0, 48.0)`

### Established Patterns
- `export.py` uses `DB_PATH = os.environ.get('DB_PATH', ...)` — same pattern for `DEM_CACHE_DIR`
- After each COPY, export.py runs a verification query via `con.execute(...)` — elevation adds a print-only summary (no assertion)
- Print style: `f"  ecdysis.parquet: {total:,} rows, ..."` — match this format

### Integration Points
- `export_ecdysis_parquet(con)` → add post-processing after the COPY block, before the verification query
- `export_samples_parquet(con)` → same pattern
- `main()` → call `ensure_dem(DEM_CACHE_DIR)` once and pass `dem_path` into both export functions

### Key column sources
- ecdysis: `decimal_longitude`, `decimal_latitude` → already cast to DOUBLE in the CTE → read from parquet as `longitude`, `latitude`
- samples: `longitude`, `latitude` → already DOUBLE in parquet → read as `lon`, `lat`

</code_context>

<specifics>
## Specific Ideas

- The DEM is large and should be cached across nightly runs — `data/_dem_cache/wa_3dep_10m.tif` persists until manually deleted.
- Multi-state expansion (Oregon, Idaho, BC) comes later — keep WA-specific logic in `dem_pipeline.py`, not `export.py`.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

## Post-Execution Revision (2026-04-15)

The DEM pipeline approach (phases 55–56) was **replaced in the same session** after discovering that `ecdysis_data.occurrences` already carries `minimum_elevation_in_meters` (Darwin Core field, ~96% coverage).

### What changed
- `dem_pipeline.py` and `tests/test_dem_pipeline.py` deleted
- `rasterio`, `seamless-3dep`, `botocore[crt]` removed from `pyproject.toml` (17 packages uninstalled)
- `export_ecdysis_parquet`: `elevation_m` now comes from `TRY_CAST(NULLIF(o.minimum_elevation_in_meters, '') AS INTEGER)` inline in the SQL — no post-processing step
- `export_samples_parquet`: emits `NULL::INTEGER AS elevation_m` to keep the parquet schema stable (iNat observations have no elevation source)
- `_add_elevation`, pyarrow post-processing, and all DEM cache logic removed from `export.py`

### Why the DEM approach was dropped
1. Source data exists and is more accurate than raster sampling
2. `rasterio` imports `boto3` unconditionally at startup, triggering botocore's SSO credential chain (required `botocore[crt]` to fix)
3. WA coverage at 10 m resolution produced 308 tiles; merging hit the OS fd limit and produced NaN pixels

### Remaining elevation gap
iNat samples have no elevation field. `elevation_m` is null for all sample rows. If this matters in future, options are: (a) DEM sampling for samples only, (b) joining through ecdysis via a shared field.

*Revised: 2026-04-15*
*Phase: 56-export-integration*
*Context gathered: 2026-04-15*
