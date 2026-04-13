---
phase: 47-rewrite-geographies-pipeline-py-to-use-duckdb-spatial-extens
fixed_at: 2026-04-12T00:00:00Z
review_path: .planning/phases/47-rewrite-geographies-pipeline-py-to-use-duckdb-spatial-extens/47-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 47: Code Review Fix Report

**Fixed at:** 2026-04-12T00:00:00Z
**Source review:** .planning/phases/47-rewrite-geographies-pipeline-py-to-use-duckdb-spatial-extens/47-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3
- Fixed: 3
- Skipped: 0

## Fixed Issues

### WR-01: `GREATEST(o.modified, im.max_id_modified)` produces NULL for occurrences with no identifications

**Files modified:** `data/export.py`
**Commit:** dc05964
**Applied fix:** Wrapped `im.max_id_modified` in `COALESCE(im.max_id_modified, o.modified)` so that occurrences with no identification rows fall back to `o.modified` instead of propagating NULL through `GREATEST`.

### WR-02: `feeds.py` `main()` calls `LOAD spatial` without `INSTALL spatial`

**Files modified:** `data/feeds.py`
**Commit:** faa4523
**Applied fix:** Changed `con.execute("LOAD spatial;")` to `con.execute("INSTALL spatial; LOAD spatial;")` in `feeds.py main()`, making it consistent with `export.py` and safe on systems where the extension has not been previously installed.

### WR-03: `test_empty_variant_feed` directly imports `conftest` via `sys.path` manipulation

**Files modified:** `data/tests/fixtures.py` (new file), `data/tests/conftest.py`, `data/tests/test_feeds.py`
**Commit:** 074c69f
**Applied fix:** Created `data/tests/fixtures.py` containing the three WKT polygon constants (`WA_STATE_WKT`, `CHELAN_WKT`, `NORTH_CASCADES_WKT`). Updated `conftest.py` to import them from `fixtures` (removing the ~185-line inline definitions). Updated `test_empty_variant_feed` in `test_feeds.py` to `from fixtures import WA_STATE_WKT, CHELAN_WKT, NORTH_CASCADES_WKT`, eliminating the `sys.path.insert` / `import conftest` pattern entirely.

---

_Fixed: 2026-04-12T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
