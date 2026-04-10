---
phase: 43-feed-variants
plan: "01"
subsystem: data-pipeline
tags: [atom-feeds, variant-feeds, spatial-join, slugify, index-json]
dependency_graph:
  requires: [data/feeds.py (Phase 42), data/tests/conftest.py (Phase 42)]
  provides: [variant feed writers, index.json, _slugify]
  affects: [data/feeds.py, data/tests/test_feeds.py]
tech_stack:
  added: [unicodedata, re, json (stdlib)]
  patterns: [generic variant writer, slug collision tracking, always-write empty feeds]
key_files:
  created: []
  modified:
    - data/feeds.py
    - data/tests/test_feeds.py
decisions:
  - "Enumerate counties/ecoregions from geographies tables (not 90-day window) to honor D-01 always-write intent"
  - "Generic write_variant_feed function (not four separate per-type functions) for DRY implementation"
  - "index.json lists only variant feeds, not main determinations.xml (fixed URL, always exists)"
  - "conftest WKT constants imported via sys.path in test_empty_variant_feed (conftest is pytest plugin, not regular module)"
metrics:
  duration_seconds: 478
  completed: "2026-04-10"
  tasks_completed: 2
  files_modified: 2
---

# Phase 43 Plan 01: Feed Variants Summary

**One-liner:** Four variant Atom feed families (collector, genus, county, ecoregion) plus index.json using spatial joins and _slugify path-traversal mitigation, always writing files even when empty.

## What Was Built

Extended `data/feeds.py` with:
- `_slugify(value)` — NFKD transliteration + `[^a-z0-9-]` strip, prevents path traversal (T-43-01)
- `_COLLECTOR_QUERY`, `_GENUS_QUERY` — direct column filters on `ecdysis_data.occurrences`
- `_COUNTY_QUERY`, `_ECOREGION_QUERY` — spatial joins using `ST_Within` and `ST_Intersects` against `geographies` tables; NULL coordinate guards included
- `_TITLE_TEMPLATES` dict — per-type feed title format strings
- `write_variant_feed(out_dir, variant_type, filter_value, slug, rows, run_time)` — always writes file (D-01), uses run_time for empty updated (D-02), valid Atom with 0 entries (D-03), returns index entry dict
- `write_all_variants(con, out_dir, run_time)` — enumerates filter values, detects slug collisions (appends -2/-3), calls `write_variant_feed`, returns list of dicts
- `write_index_json(out_dir, entries)` — writes feeds/index.json with all entries including empty feeds (D-04)
- Extended `main()` — adds `LOAD spatial`, `run_time`, calls all writers in sequence

Extended `data/tests/test_feeds.py` with 7 new tests:
- `test_slugify` — spaces, accents, path traversal characters
- `test_collector_variant`, `test_genus_variant`, `test_county_variant`, `test_ecoregion_variant` — each verifies file exists, Atom root, 1 entry, correct title, self-link href
- `test_empty_variant_feed` — county and ecoregion files exist with 0 entries and run_time updated (D-01/D-02/D-03)
- `test_index_json` — required fields present, entry_count is int, Test Collector entry has count 1

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Wave 0 — Add variant feed test stubs | 873cd3b | data/tests/test_feeds.py |
| 2 | Wave 1 — Implement variant writers, index.json, extend main() | db8cde9 | data/feeds.py, data/tests/test_feeds.py |

## Verification

All 14 feed tests pass. All 21 non-export tests pass. Pre-existing `test_export.py` failures (`test_ecdysis_parquet_schema`, `test_ecdysis_parquet_has_rows`) were present before this plan and are unrelated to feeds.py changes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] conftest WKT import failure in test_empty_variant_feed**
- **Found during:** Task 2 (GREEN run)
- **Issue:** `from conftest import WA_STATE_WKT, ...` raised `ModuleNotFoundError` because `conftest.py` is a pytest plugin module, not a regular importable module
- **Fix:** Used `sys.path.insert(0, os.path.dirname(__file__))` then `import conftest as _conftest` to load the WKT constants
- **Files modified:** data/tests/test_feeds.py
- **Commit:** db8cde9

## Deferred Issues

Pre-existing failures in `data/tests/test_export.py` (2 tests):
- `test_ecdysis_parquet_schema` — `inat.taxon__iconic_taxon_name` column missing from fixture schema
- `test_ecdysis_parquet_has_rows` — same root cause

These failures existed in the base commit (`fdb2ef4`) before this plan and are out of scope.

## Known Stubs

None — all variant feed families are fully wired. Feed files are written to `frontend/public/data/feeds/` at pipeline runtime (not committed to git).

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced beyond what was in the threat model (`T-43-01` mitigated by `_slugify`).

## Self-Check: PASSED

- data/feeds.py: confirmed modified with all new functions
- data/tests/test_feeds.py: confirmed 14 tests collected and passing
- Commit 873cd3b exists: confirmed (test RED state)
- Commit db8cde9 exists: confirmed (implementation GREEN state)
