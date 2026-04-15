# Phase 55: DEM Acquisition Module - Context

**Gathered:** 2026-04-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a standalone Python module (`dem_pipeline.py`) with two public functions: `ensure_dem(cache_dir)` and `sample_elevation(lons, lats, dem_path)`. The module handles USGS 3DEP download, local caching, and per-coordinate elevation sampling. No changes to `export.py` or the frontend — those are Phase 56+.

</domain>

<decisions>
## Implementation Decisions

### ensure_dem signature and return value
- **D-01:** `ensure_dem(cache_dir)` takes a **cache directory path** (not a target file path). The function derives the filename internally.
- **D-02:** The function returns the full path to the GeoTIFF file (e.g. `cache_dir / "wa_3dep_10m.tif"`) so Phase 56 can pass it directly to `sample_elevation`. Return type: `Path` or `str`.
- **D-03:** Filename convention inside the cache directory: `wa_3dep_10m.tif`. This encodes region, source, and resolution — establishes the pattern for future regions (Oregon, BC, Idaho, etc.).

**Rationale:** Multi-state/province expansion (Oregon, Idaho, BC, New Mexico, Oklahoma) is planned but not yet in the roadmap. A cache-directory approach lets each region have its own cached file without changing the caller interface. The current spec in ROADMAP.md says `ensure_dem(path)` — the planner should note this deviation and update the success criteria accordingly.

### WA bounding box
- **D-04:** `WA_BBOX = (-124.85, 45.54, -116.92, 49.00)` — module-level constant in `dem_pipeline.py`, tuple in `(west, south, east, north)` order as required by `seamless-3dep`. Hardcoded, not derived from the geographies DB. Future regions get their own constants.

### Claude's Discretion
- `sample_elevation` input/return types — list or numpy array for lons/lats inputs; `list[int | None]` or equivalent for output. Claude decides based on what integrates most cleanly with DuckDB query results in Phase 56.
- Synthetic GeoTIFF fixture structure — how the 2×2 test fixture is created (rasterio in conftest, tmp_path scope). Claude decides based on existing conftest.py patterns.
- Error handling in `ensure_dem` — what to raise if the USGS download fails.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase requirements
- `.planning/REQUIREMENTS.md` §ELEV-01 — authoritative requirement text
- `.planning/ROADMAP.md` §Phase 55 — success criteria (note: SC-1 says `ensure_dem(path)` but D-01 above changes `path` to a cache directory — planner should update SC accordingly)

### Existing pipeline code
- `data/pyproject.toml` — add `seamless-3dep` and `rasterio` to `[project.dependencies]`
- `data/tests/conftest.py` — existing fixture patterns to follow for test structure

No external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `data/tests/conftest.py` — session-scoped DuckDB fixture; new DEM tests need a separate `tmp_path`-scoped GeoTIFF fixture (different lifecycle than DB fixtures)
- `data/tests/fixtures.py` — contains WKT geometry constants; WA_BBOX could follow the same module-level constant pattern

### Established Patterns
- Pipeline modules are standalone Python files in `data/` (e.g. `ecdysis_pipeline.py`, `geographies_pipeline.py`)
- `pyproject.toml` uses `[project.dependencies]` with pinned minimums (e.g. `dlt[duckdb]>=1.23.0`)
- Tests live in `data/tests/` and are discovered via `testpaths = ["tests"]` in `pyproject.toml`

### Integration Points
- Phase 56 (`export.py`) will call `ensure_dem(cache_dir)` and then `sample_elevation(lons, lats, dem_path)` — the return value of `ensure_dem` flows directly into `sample_elevation`

</code_context>

<specifics>
## Specific Ideas

- Multi-state expansion is explicitly expected (Oregon, Idaho, BC, New Mexico, Oklahoma) — the directory + filename-convention design is intentionally forward-compatible.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 55-dem-acquisition-module*
*Context gathered: 2026-04-15*
