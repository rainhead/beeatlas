# Phase 27: Pipeline Tests — Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Add pytest coverage for `data/export.py` (correct output schema + valid GeoJSON) and transformation logic in the dlt pipeline modules, using a programmatically-created fixture DuckDB. No test infrastructure currently exists — `data/tests/` was deleted in Phase 20.
</domain>

<decisions>
## Implementation Decisions

### Fixture DuckDB
- **D-01:** Fixture DB is created programmatically in `conftest.py` — no committed binary `.duckdb` file. Always in sync with schema, no binary blob in git.
- **D-02:** Fixture data covers the happy path only: a few specimens clearly inside county and ecoregion polygons, plus geography tables populated with real WKT for 1-2 WA counties and 1-2 ecoregions.
- **D-03:** No test cases for the ST_Distance fallback (specimens outside polygon boundaries). That behavior is a workaround for an oversimplification bug being tracked separately (see Deferred).

### Pipeline transformation coverage
- **D-04:** Test `inaturalist_pipeline._transform()` directly — it is already a pure function.
- **D-05:** Extract the ecdysis HTML → `inat_observation_id` parsing logic (currently inline in `occurrence_links()` generator) into a named pure function, e.g. `_extract_inat_id(html: str | None) -> int | None`. Test that extracted function.
- **D-06:** The refactor in D-05 is intentional — extracting logic into pure functions for testability is an explicit goal of this phase.
- **D-07:** Test cases for each function should cover: happy path, null/missing optional fields (null geojson on obscured iNat observations, empty project_ids), and error/absent cases (no anchor in HTML, malformed href).

### Export test coverage
- **D-08:** Tests call `export_ecdysis_parquet()`, `export_samples_parquet()`, `export_counties_geojson()`, `export_ecoregions_geojson()` against the fixture DB and verify:
  - Correct columns present in each parquet (matches `validate-schema.mjs` expectations)
  - GeoJSON output is valid and non-empty
- **D-09:** Happy path only — no test for the ST_Distance nearest-polygon fallback.

### Test runner and isolation
- **D-10:** `pytest` added as a dev dependency in `data/pyproject.toml` under `[dependency-groups]` or `[project.optional-dependencies]`.
- **D-11:** Test isolation via env vars: `DB_PATH` and `EXPORT_DIR` set to temp paths in `conftest.py` — no patching needed, the env-var pattern already supports this.
- **D-12:** Tests run locally only (`uv run pytest` in `data/`). Not added to CI in this phase — CI runs frontend build only until Phase 29.

### Claude's Discretion
- Exact conftest.py structure (session-scoped vs function-scoped fixture DB)
- Whether to use `tmp_path` pytest fixture or `tempfile.mkdtemp` for temp output dirs
- File layout within `data/tests/` (one file vs split by module)
- Minimal WKT geometry values to use in fixture (can use real simplified coords from the existing geographies tables)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pipeline modules under test
- `data/inaturalist_pipeline.py` — `_transform()` function to test; also the dlt source structure for context
- `data/ecdysis_pipeline.py` — `occurrence_links()` generator containing the HTML parsing logic to extract into `_extract_inat_id()`

### Export under test
- `data/export.py` — all four export functions; note `DB_PATH` and `EXPORT_DIR` env var pattern for test isolation

### Schema expectations (reference for column assertions)
- `scripts/validate-schema.mjs` — authoritative list of expected columns for `ecdysis.parquet` and `samples.parquet`

### Project config
- `data/pyproject.toml` — where pytest dependency and `[tool.pytest.ini_options]` should be added

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `os.environ.get('DB_PATH', ...)` and `os.environ.get('EXPORT_DIR', ...)` patterns in all pipeline modules — test isolation via env vars, no monkeypatching needed

### Established Patterns
- All pipeline modules are importable as plain Python — no framework ceremony needed to call `_transform()` or the extracted `_extract_inat_id()`
- `dlt.pipeline(..., destination=dlt.destinations.duckdb(DB_PATH))` uses `DB_PATH` env var — dlt pipeline tests would also be isolatable, but are out of scope for this phase

### Integration Points
- `conftest.py` at `data/tests/conftest.py` — creates fixture DB, sets `DB_PATH` and `EXPORT_DIR` env vars, tears down after tests
- `data/pyproject.toml` needs `pytest` added and `[tool.pytest.ini_options]` with `testpaths = ["tests"]`

</code_context>

<specifics>
## Specific Ideas

- iNat `_transform()` null case: obscured/private observations have `geojson: null` — common in production data (threatened species). This is the most important null case.
- Ecdysis link extraction cases: (1) anchor present with valid iNat URL → integer ID; (2) no `#association-div` anchor → `None`; (3) malformed href (no integer at end) → `None` via the existing `except (ValueError, IndexError, KeyError)` guard.
- Fixture geometry: can borrow 1-2 real simplified county WKT strings from the geographies tables on maderas rather than constructing synthetic geometry.

</specifics>

<deferred>
## Deferred Ideas

- **Geometry simplification bug** — `geographies_pipeline._to_wkt_rows()` applies 0.01° ≈ 1 km simplification (added for Stats Canada coastlines) to US county and ecoregion boundaries. This causes ~209 specimens near the Snake River, Columbia River, and Lake Chelan to fall outside county polygons. Fix: use 0.0 or near-zero tolerance for US Census county/ecoregion datasets. Confirmed by checking WSDA_2315203 (roadside specimen, 50m from Snake River, Asotin County) in Ecdysis — coordinates are correct, polygon is undershooting. Separate phase/fix.
- **ST_Distance fallback test** — once the simplification bug is fixed, revisit whether the fallback needs coverage. Deferred from this phase.
- **dlt write-path tests** — testing that a full dlt pipeline run writes rows to DuckDB correctly. Out of scope for Phase 27 (transformation logic focus), could be a future hardening phase.

</deferred>

---

*Phase: 27-pipeline-tests*
*Context gathered: 2026-03-28*
