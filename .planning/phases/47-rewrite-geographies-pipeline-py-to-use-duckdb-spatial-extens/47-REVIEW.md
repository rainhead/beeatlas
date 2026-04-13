---
phase: 47-rewrite-geographies-pipeline-py-to-use-duckdb-spatial-extens
reviewed: 2026-04-12T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - data/export.py
  - data/feeds.py
  - data/geographies_pipeline.py
  - data/nightly.sh
  - data/pyproject.toml
  - data/tests/conftest.py
  - data/tests/test_feeds.py
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 47: Code Review Report

**Reviewed:** 2026-04-12T00:00:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

These files implement the DuckDB spatial rewrite of the geographies pipeline plus Atom feed generation. The spatial join logic in `export.py` and `feeds.py` is generally correct. Three warnings were found: a NULL-propagation bug in the `modified` column computation, missing `INSTALL spatial` in `feeds.py` standalone usage, and a fragile direct import of `conftest` in tests. Three info-level items cover an unused import in `run.py`, the f-string SQL path interpolation pattern, and test fixture mutability.

---

## Warnings

### WR-01: `GREATEST(o.modified, im.max_id_modified)` produces NULL for occurrences with no identifications

**File:** `data/export.py:111`

**Issue:** `im` is a LEFT JOIN from `id_modified`. When an occurrence has no identifications, `im.max_id_modified` is NULL. In DuckDB (following SQL standard), `GREATEST(x, NULL)` returns NULL. As a result, every occurrence without any identification row gets a NULL `modified` value in the exported parquet. The downstream frontend likely expects a non-null date here.

**Fix:**
```sql
strftime(GREATEST(o.modified, COALESCE(im.max_id_modified, o.modified)), '%Y-%m-%d') AS modified
```
Or more explicitly:
```sql
strftime(CASE WHEN im.max_id_modified IS NULL THEN o.modified
              ELSE GREATEST(o.modified, im.max_id_modified)
         END, '%Y-%m-%d') AS modified
```

---

### WR-02: `feeds.py` `main()` calls `LOAD spatial` without `INSTALL spatial`

**File:** `data/feeds.py:402`

**Issue:** `feeds.py`'s `main()` calls `con.execute("LOAD spatial;")` but omits `INSTALL spatial`. When `feeds.py` is run standalone (e.g., `uv run python data/feeds.py`) on a system where the spatial extension has never been installed, this will raise an error. `export.py` correctly uses `INSTALL spatial; LOAD spatial;` on line 284. The two scripts should be consistent.

**Fix:**
```python
con.execute("INSTALL spatial; LOAD spatial;")
```

---

### WR-03: `test_empty_variant_feed` directly imports `conftest` via `sys.path` manipulation

**File:** `data/tests/test_feeds.py:329-333`

**Issue:** The test inserts its own directory into `sys.path` and imports `conftest` as a regular module. `conftest.py` is a pytest plugin; pytest may have already imported it under the key `conftest` or a path-qualified name. Importing it a second time via direct path can lead to two module objects for the same file, causing identity checks (e.g., `is`) and `isinstance` checks to silently fail, and pollutes `sys.path` permanently within the test process. The WKT constants are also duplicated (the test re-binds them to local names even though they're already available as module-level constants).

**Fix:** Extract the three WKT constants (`WA_STATE_WKT`, `CHELAN_WKT`, `NORTH_CASCADES_WKT`) into a separate `data/tests/fixtures.py` module that both `conftest.py` and `test_feeds.py` import directly. Remove the `sys.path.insert` and `import conftest` lines from the test.

---

## Info

### IN-01: `load_geographies` imported but unused in `run.py`

**File:** `data/run.py:20`

**Issue:** `from geographies_pipeline import load_geographies` is present but `load_geographies` does not appear in the `STEPS` list (lines 28–36). This is dead import. The module-level docstring correctly documents that geographies are excluded from the nightly run and must be loaded manually, so the intent is clear — but the import still executes the module import cost and misleads readers into thinking it is used.

**Fix:** Remove the unused import:
```python
# Remove this line:
from geographies_pipeline import load_geographies
```

---

### IN-02: f-string interpolation of file paths into SQL strings

**File:** `data/export.py:27, 119, 140, 226`

**Issue:** The `out` variable (derived from `ASSETS_DIR / "filename"`) is interpolated directly into DuckDB SQL via f-strings, e.g., `TO '{out}' (FORMAT PARQUET)`. `ASSETS_DIR` is read from the `EXPORT_DIR` environment variable. If that variable contains a single-quote or other SQL metacharacter, the query will be malformed. This is not exploitable in the current cron deployment, but it makes the code fragile and could produce confusing DuckDB parse errors if paths ever contain spaces or special characters.

**Fix:** Use DuckDB's parameterized query support for the file path. DuckDB supports `$1` positional parameters in `COPY ... TO`:
```python
con.execute("COPY (...) TO ? (FORMAT PARQUET)", [out])
```
If DuckDB's COPY syntax does not accept parameters for the destination path, sanitize by asserting the path contains no single-quotes before interpolation:
```python
assert "'" not in out, f"EXPORT_DIR path contains invalid character: {out!r}"
```

---

### IN-03: Session-scoped `fixture_con` opened with `read_only=False`

**File:** `data/tests/conftest.py:383`

**Issue:** The session-scoped connection is opened as writable (`read_only=False`). All tests that consume `fixture_con` share the same connection and the same underlying DB file. If any future test accidentally executes an INSERT/UPDATE/DELETE (or if a tested function has a side effect on the DB), it could corrupt state for later tests in the session. The session fixture is intended to be read-only from the test perspective.

**Fix:** Open the shared connection as read-only to make the intent explicit and guard against accidental writes:
```python
con = duckdb.connect(fixture_db, read_only=True)
```
If any test legitimately needs a writable connection, it should create its own via a separate function-scoped fixture.

---

_Reviewed: 2026-04-12T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
