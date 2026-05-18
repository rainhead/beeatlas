---
phase: 98-pipeline-integration
reviewed: 2026-05-17T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - data/dbt/models/marts/occurrences.sql
  - data/dbt/models/marts/schema.yml
  - data/dbt/models/sources.yml
  - data/places_export.py
  - data/places_load.py
  - data/places_maps.py
  - data/run.py
  - data/tests/conftest.py
  - data/tests/test_places_export.py
  - data/tests/test_places_load.py
  - data/tests/test_places_maps.py
findings:
  critical: 2
  warning: 3
  info: 2
  total: 7
status: issues_found
---

# Phase 98: Code Review Report

**Reviewed:** 2026-05-17
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

This phase integrates the `geographies.places` table into the dbt mart pipeline and adds three new pipeline steps: `places-validation`, `places-load`, `places-export`, and `places-maps`. The implementation is generally sound — parameterized inserts in `places_load.py`, correct `LEFT JOIN` semantics for `place_slug`, and proper use of `DISTINCT ON` for place deduplication.

Two critical issues were found: a row-duplication risk in `occurrences.sql` when a point lies exactly on a county border (county pipeline lacks the same `DISTINCT ON` guard that the ecoregion pipeline has), and a connection leak in `places_maps.py` `main()` when an exception propagates. Three warnings cover a missing `try/finally` guard on a second connection site, an f-string SQL path in `_query_counts` consistent with the existing codebase pattern but still worth noting, and a test docstring/assertion mismatch. Two info items cover a redundant test and an unused import.

---

## Critical Issues

### CR-01: `occurrences.sql` — missing county dedup allows row fanout on border points

**File:** `data/dbt/models/marts/occurrences.sql:28-44`

**Issue:** The `with_county` CTE does a `LEFT JOIN wa_counties c ON ST_Within(occ_pt.pt, c.geom)` without any subsequent `DISTINCT ON`. County polygons are supposed to be non-overlapping, but topological precision issues at shared borders (common in TIGER/Line shapefiles) can cause a point exactly on the shared edge to be `ST_Within` both adjacent counties, producing two rows for that `_row_id`. The downstream `JOIN final_county fc ON fc._row_id = j._row_id` is an inner equi-join — if `final_county` has two rows for one `_row_id`, the final SELECT silently emits two output rows for that occurrence, doubling it in the parquet.

The ecoregion path correctly guards against this with `eco_dedup`:
```sql
eco_dedup AS (
    SELECT DISTINCT ON (_row_id) _row_id, ecoregion_l3
    FROM with_eco
),
```

The county path has no equivalent guard. Because `topology_postprocess` (the `clean_region_topology` step) runs *after* dbt-build, its fixes are not available when the mart executes.

**Fix:** Add a `county_dedup` CTE mirroring `eco_dedup`:
```sql
county_dedup AS (
    SELECT DISTINCT ON (_row_id) _row_id, county
    FROM with_county
),
county_fallback AS (
    SELECT _row_id,
        (SELECT county FROM wa_counties
         ORDER BY ST_Distance(geom,
             (SELECT pt FROM occ_pt o2 WHERE o2._row_id = county_dedup._row_id))
         LIMIT 1) AS county
    FROM county_dedup
    WHERE county IS NULL
),
final_county AS (
    SELECT * FROM county_dedup WHERE county IS NOT NULL
    UNION ALL SELECT * FROM county_fallback
),
```

---

### CR-02: `places_maps.py` `main()` — DuckDB connection leaks on exception

**File:** `data/places_maps.py:84-89`

**Issue:** `main()` opens a connection at line 86 and then calls `generate_place_maps(con)` without a `try/finally`:
```python
def main() -> None:
    con = duckdb.connect(DB_PATH)
    con.execute("LOAD spatial")
    generate_place_maps(con)   # if this raises, con is never closed
    con.close()                # unreachable on exception
```

`generate_place_maps` raises `FileNotFoundError` when `occurrences.parquet` is absent, which is the normal first-run failure mode. When that exception propagates through `main()`, the connection is leaked. In the nightly pipeline, `run.py` catches the exception and re-raises, so the process exits — but DuckDB file locks held by a leaked connection can prevent the next nightly run from opening the same `beeatlas.duckdb` if the process does not exit (e.g., in a test harness or REPL). The parallel function `export_places_step()` in `places_export.py` (lines 137-144) correctly uses `try/finally` for the same pattern.

**Fix:**
```python
def main() -> None:
    con = duckdb.connect(DB_PATH)
    con.execute("LOAD spatial")
    try:
        generate_place_maps(con)
    finally:
        con.close()
```

---

## Warnings

### WR-01: `places_export.py` `_query_counts` — f-string path interpolated into SQL

**File:** `data/places_export.py:50-56`

**Issue:** The `parquet_path` (a `pathlib.Path`) is interpolated directly into a DuckDB SQL string via an f-string:
```python
rows = con.execute(f"""
    SELECT ...
    FROM read_parquet('{parquet_path}')
    ...
""").fetchall()
```

`parquet_path` is derived from `ASSETS_DIR / "occurrences.parquet"`, which in turn comes from `os.environ.get("EXPORT_DIR", ...)`. An attacker who controls the `EXPORT_DIR` environment variable can inject arbitrary SQL through a crafted path containing a single-quote character (e.g., `EXPORT_DIR="/tmp/foo'--`). In the nightly cron context this is an insider/supply-chain risk, not a remote one, but it is still a defect. The same pattern appears in `places_maps.py:62` and throughout `species_maps.py` — it is a known codebase pattern. The correct fix is to use a DuckDB parameterized path:
```python
rows = con.execute(
    "SELECT place_slug, ... FROM read_parquet(?) WHERE ...",
    [str(parquet_path)]
).fetchall()
```

Note: DuckDB's `read_parquet(?)` accepts a parameterized path argument.

---

### WR-02: `run.py` — `load_geographies` imported but not used

**File:** `data/run.py:27`

**Issue:** `from geographies_pipeline import load_geographies` is present at the top of the file, but `load_geographies` does not appear in `STEPS` and is never called. The module-level docstring explicitly says geographies are loaded manually, so this is intentional — but the live import means any breakage in `geographies_pipeline` will crash the nightly pipeline at startup, even though the function is never invoked. The import also gives readers the false impression that the pipeline runs geographies loading.

**Fix:** Remove the import. If manual invocations need documenting, add a comment:
```python
# Geographies loaded manually: uv run python geographies_pipeline.py
```

---

### WR-03: Test docstring claims "6 required keys" but asserts only 5

**File:** `data/tests/test_places_export.py:131` and `data/tests/test_places_export.py:143`

**Issue:** The test docstring reads "all 6 required keys per record" but the `required_keys` set contains only 5 elements: `{"slug", "name", "land_owner", "specimen_count", "sample_count"}`. The module-level docstring (line 6) also says "6 required keys." If a future field is intentionally added to `places.json`, this discrepancy will mislead the reviewer about what the contract is. More concretely, if `description` or another field was planned and dropped, the test gives false confidence that it verified 6 keys.

**Fix:** Update the docstring and module comment to say "5 required keys," or add the missing sixth key to both the assertion and the `_write_places_json` output.

---

## Info

### IN-01: `test_places_load.py` — `test_places_geometry_usable` and `test_occurrence_inside_place_gets_slug` are identical

**File:** `data/tests/test_places_load.py:53-65` and `data/tests/test_places_load.py:68-81`

**Issue:** Both tests write the same TOML, connect to the same DB, and execute exactly the same `ST_Within(ST_Point(-120.95, 47.05), geom)` query, asserting the same `row[0] == "test-place"` result. The docstrings describe different semantic purposes ("geometry survives round-trip" vs. "occurrence inside place gets slug") but the SQL and assertion are byte-for-byte identical.

**Fix:** Remove one of the two tests, or differentiate them with distinct query points or assertions. The `test_occurrence_inside_place_gets_slug` is the more behaviourally-named test and should be kept; `test_places_geometry_usable` could be merged into it or replaced with a negative assertion (outside point returns NULL), which is already covered by `test_occurrence_outside_places_is_null`.

---

### IN-02: `conftest.py` — `fixture_con` uses `read_only=False` on a session-scoped DB with no isolation between test modules

**File:** `data/tests/conftest.py:558-564`

**Issue:** The session-scoped `fixture_con` fixture opens the shared `fixture_db` with `read_only=False`. Any test that accidentally performs a write through `fixture_con` will mutate the shared database for subsequent tests in the session. None of the three new test files (`test_places_export.py`, `test_places_load.py`, `test_places_maps.py`) use `fixture_con` directly — they create their own `tmp_path`-scoped databases — so there is no immediate blast radius. The issue is pre-existing but worth flagging as the new tests expand usage of the conftest.

**Fix:** Consider changing `fixture_con` to `read_only=True` and creating a separate `fixture_con_rw` for tests that genuinely need write access. This protects session isolation without breaking existing tests.

---

_Reviewed: 2026-05-17_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
