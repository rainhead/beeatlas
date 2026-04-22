---
phase: quick
plan: 260421-qk1
subsystem: data-pipeline
tags: [feeds, cleanup, atom]
dependency_graph:
  requires: []
  provides: [leaner-feeds-pipeline]
  affects: [data/feeds.py, data/tests/test_feeds.py, frontend/public/data/feeds/]
tech_stack:
  added: []
  patterns: []
key_files:
  modified:
    - data/feeds.py
    - data/tests/test_feeds.py
  deleted:
    - frontend/public/data/feeds/county-*.xml  (39 files)
    - frontend/public/data/feeds/ecoregion-*.xml  (66 files)
decisions:
  - test_empty_variant_feed deleted entirely rather than repurposed — it existed solely for county/ecoregion D-01/D-02/D-03 behavior
metrics:
  duration: "~5 minutes"
  completed: "2026-04-21"
  tasks_completed: 2
  files_modified: 2
  files_deleted: 105
---

# Phase quick Plan 260421-qk1: Drop County/Ecoregion Atom Feeds Summary

**One-liner:** Removed county and ecoregion Atom feed generation from feeds.py, deleted 105 pre-generated XML files, and stripped 3 now-irrelevant tests — leaving a collector + genus only feed pipeline.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Strip county/ecoregion from feeds.py | 6d5b7ac | data/feeds.py |
| 2 | Clean test_feeds.py and delete XML files | c1f196e | data/tests/test_feeds.py, 105 XML files deleted |

## What Was Done

**Task 1** removed from `data/feeds.py`:
- `_COUNTY_QUERY` and `_ECOREGION_QUERY` constants (56 lines of SQL)
- `'county'` and `'ecoregion'` entries from `_TITLE_TEMPLATES` and `_VARIANT_QUERIES`
- `'county'` and `'ecoregion'` entries from `_ENUM_QUERIES` inside `write_all_variants()`
- Updated the variant loop to `for variant_type in ('collector', 'genus'):`
- Updated the module docstring and `write_all_variants()` docstring

**Task 2** removed from `data/tests/test_feeds.py`:
- `test_county_variant` (23 lines)
- `test_ecoregion_variant` (23 lines)
- `test_empty_variant_feed` (90 lines — existed solely for county/ecoregion D-01/D-02/D-03 behavior)

Deleted from `frontend/public/data/feeds/`:
- 39 `county-*.xml` files
- 66 `ecoregion-*.xml` files

Note: the XML files were untracked by git (not committed), so deletion required only filesystem removal.

## Verification

- `grep -n 'county\|ecoregion' data/feeds.py` — no matches
- `ls frontend/public/data/feeds/county-*.xml` — No such file or directory
- `ls frontend/public/data/feeds/ecoregion-*.xml` — No such file or directory
- `uv run pytest tests/test_feeds.py -v` — 11 passed in 0.82s

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None. Pure deletion — no new network endpoints, auth paths, or attack surface introduced.

## Self-Check: PASSED

- data/feeds.py: exists, imports cleanly, no county/ecoregion references
- data/tests/test_feeds.py: exists, 11 tests pass, 3 deleted tests absent
- Commits 6d5b7ac and c1f196e present in git log
- 105 XML files gone from filesystem
