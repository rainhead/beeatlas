---
phase: 56-export-integration
reviewed: 2026-04-15T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - .gitignore
  - data/export.py
  - data/feeds.py
  - data/pyproject.toml
  - data/tests/conftest.py
  - data/tests/test_export.py
  - data/tests/test_feeds.py
  - data/uv.lock
  - scripts/validate-schema.mjs
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 56: Code Review Report

**Reviewed:** 2026-04-15
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Reviewed the export integration phase: `export.py`, `feeds.py`, their tests, `pyproject.toml`, `uv.lock`, and `scripts/validate-schema.mjs`. The code is generally well-structured with good parameterization and test coverage. Three warnings and three informational items are noted.

The most actionable findings are: (1) a schema column gap between `test_export.py` and the authoritative `validate-schema.mjs` that would allow `catalog_number` to go missing without a failing test, (2) f-string interpolation of a filesystem path into SQL strings in `export.py` which would silently corrupt queries if the path contained a single quote, and (3) a session-scoped DuckDB connection opened `read_only=False` being shared across tests that write parquet files to different temp directories — this could produce cross-test state if any test writes back into the DB.

## Warnings

### WR-01: `EXPECTED_ECDYSIS_COLS` in test_export.py is missing `catalog_number`

**File:** `data/tests/test_export.py:14-23`
**Issue:** `validate-schema.mjs` (the authoritative schema source cited in the test file's own docstring) includes `catalog_number` in the ecdysis parquet expected columns. The `EXPECTED_ECDYSIS_COLS` list in the test omits it. The test comment says "Column lists match scripts/validate-schema.mjs" but they do not — if `catalog_number` were accidentally dropped from the SQL in `export.py`, the tests would pass while `validate-schema.mjs` would fail.
**Fix:** Add `'catalog_number'` to `EXPECTED_ECDYSIS_COLS`:
```python
EXPECTED_ECDYSIS_COLS = [
    'ecdysis_id', 'catalog_number', 'longitude', 'latitude',
    ...
]
```

### WR-02: f-string interpolation of filesystem path into SQL in export.py

**File:** `data/export.py:160-170` (and `275-280`, `154`, `269`)
**Issue:** The `out` variable (derived from `ASSETS_DIR / "ecdysis.parquet"`) is interpolated directly into SQL strings passed to `con.execute()`:
```python
row = con.execute(f"""
SELECT ... FROM read_parquet('{out}')
""").fetchone()
```
`ASSETS_DIR` is read from the `EXPORT_DIR` environment variable. A path containing a single quote (e.g. `/tmp/user's dir/data`) would break the SQL string or inject SQL. The `COPY ... TO '{out}'` on line 154 has the same issue.
**Fix:** DuckDB's `read_parquet()` does not support parameterized path arguments, but the risk can be eliminated by asserting the path contains no single quotes, or by using `pathlib.Path.as_posix()` and validating no special characters:
```python
# After constructing out:
assert "'" not in out and '"' not in out, f"Unsafe path for SQL: {out}"
```
In practice, since `ASSETS_DIR` defaults to a project-relative path and this is a data pipeline (not a web endpoint), the real-world risk is low, but the pattern is worth hardening.

### WR-03: Session-scoped `fixture_con` is `read_only=False` and shared across all tests

**File:** `data/tests/conftest.py:231-237`
**Issue:** `fixture_con` has `scope="session"` and `read_only=False`. The export tests (`test_export.py`) call `export_ecdysis_parquet` and `export_samples_parquet`, which execute `COPY ... TO file` SQL on the connection. While the COPY writes to a temp file (not the DB), DuckDB may cache metadata or transaction state across calls. More concretely, the test for `export_ecdysis_parquet` monkeypatches `ASSETS_DIR` but does not restore it between tests since `monkeypatch` is function-scoped — however, `monkeypatch` does restore it. The real concern is that multiple tests call `export_ecdysis_parquet` on the same session connection in sequence; if an earlier test leaves the connection in an unusual state (e.g. a failed COPY mid-transaction), later tests in the same session may see unexpected behavior.
**Fix:** Either use `read_only=True` for the session connection (since tests should not mutate the DB), or make the fixture function-scoped. If the session scope is kept for performance, add an explicit note that all test writes go to temp files via `COPY ... TO`, not into the DB itself.

## Info

### IN-01: `export.py` module docstring references wrong output directory

**File:** `data/export.py:3`
**Issue:** The module docstring says "Produces four files in `frontend/src/assets/`" but the actual default output directory is `frontend/public/data/` (per `_default_assets` on line 24 and the project memory note about the phase-36 fix).
**Fix:** Update the docstring:
```python
"""Export frontend assets from data/beeatlas.duckdb.

Produces four files in frontend/public/data/:
  - ecdysis.parquet
  ...
```

### IN-02: `test_feeds.py::test_run_py_integration` imports `run` module unconditionally

**File:** `data/tests/test_feeds.py:142-161`
**Issue:** The test imports `run as run_mod` inside the test function, which triggers all top-level imports in `run.py` — including `ecdysis_pipeline`, `inaturalist_pipeline`, `waba_pipeline`, `projects_pipeline`, `anti_entropy_pipeline`, and `geographies_pipeline`. These are not listed as test dependencies in `pyproject.toml` dev group. If any of those modules have import-time side effects or missing dependencies in a CI environment that only installs the dev extras, this test will fail with an `ImportError` rather than the intended assertion failure.
**Fix:** Either add all pipeline modules to `testpaths` scope (they already exist in `data/`), or guard the import with a `try/except ImportError` and `pytest.skip`. Since these modules are co-located in `data/`, this is likely fine in practice, but worth noting.

### IN-03: `pytest` dev dependency missing `rasterio` and `numpy`

**File:** `data/pyproject.toml:18-21`
**Issue:** The `dem_fixture` in `conftest.py` (line 249) imports `numpy` and `rasterio` at fixture invocation time. These packages are runtime dependencies (listed in `[project].dependencies`) but the `[dependency-groups].dev` section only adds `pytest`. If a developer runs `uv sync --only-group dev`, the fixture will fail with `ImportError`. This is a minor concern since `uv sync` without flags includes all dependencies.
**Fix:** Not urgent given the project structure, but consider adding a comment noting that `dem_fixture` requires `rasterio` (a runtime dep):
```toml
[dependency-groups]
dev = [
    "pytest>=9.0.2",
    # dem_fixture requires rasterio + numpy (runtime deps, included by default)
]
```

---

_Reviewed: 2026-04-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
