---
phase: 97-place-data-model
plan: "01"
subsystem: database
tags: [toml, duckdb, spatial, validation, places, wgs84, wkt]

requires: []
provides:
  - content/places.toml with 2 real WA collecting locations (rattlesnake-ledge, tiger-mountain)
  - data/places_validation.py with validate_places(toml_path) and validate_places_step()
affects:
  - Phase 98 (pipeline integration — PPIPE-01 loads places.toml into DuckDB table)
  - data/run.py (validate_places_step can be added to STEPS)

tech-stack:
  added: []
  patterns:
    - "TOML [[places]] array-of-tables for hand-curated place metadata (slug, name, land_owner, geometry_wkt, permits)"
    - "DuckDB in-memory spatial validation: duckdb.connect(':memory:') + LOAD spatial + ST_GeomFromText + ST_Intersects"
    - "tomllib (stdlib) for TOML parsing in Python 3.14+"

key-files:
  created:
    - content/places.toml
    - data/places_validation.py
  modified: []

key-decisions:
  - "land_owner field name (not owner) — per PLC-01 requirement; owner would have been ambiguous"
  - "LOAD spatial only (not INSTALL spatial) — spatial extension already installed in pipeline environment; INSTALL is a one-time setup step not appropriate in a module that runs nightly"
  - "validate_places raises on first violation per category (not collect-all) — simpler control flow, sufficient for a small curated file"

patterns-established:
  - "places_validation.py pattern: in-memory DuckDB with LOAD spatial for WKT geometry validation"
  - "TOML permits as inline table array — each permit is { issuing_authority, type, optional permit_number, optional expiry_date }"

requirements-completed:
  - PLC-01
  - PLC-02
  - PLC-03
  - PLC-04

duration: 2min
completed: 2026-05-18
---

# Phase 97 Plan 01: Place Data Model — TOML and Validation Summary

**content/places.toml with 2 real WA collecting locations using WGS84 polygons, and data/places_validation.py raising ValueError for invalid slug, duplicate slug, bad WKT, non-WGS84 bounds, or overlapping polygons via DuckDB ST_Intersects**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-18T00:15:21Z
- **Completed:** 2026-05-18T00:17:15Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created content/places.toml with rattlesnake-ledge and tiger-mountain seed entries, both using real WA geographic coordinates (King County area)
- Validation module data/places_validation.py covers all 5 error classes from PLC-03 and PLC-04: slug regex, duplicate slugs, invalid WKT, non-WGS84 bounds, ST_Intersects overlap
- All 5 error paths verified to raise ValueError with the exact "places.toml: place '{slug}': {reason}" format

## Task Commits

1. **Task 1: Create content/places.toml** - `05b1491` (feat)
2. **Task 2: Create data/places_validation.py** - `eb27d1e` (feat)

**Plan metadata:** see final docs commit

## Files Created/Modified
- `content/places.toml` - 2 seed place entries with WGS84 polygons, permits arrays, land_owner per PLC-01
- `data/places_validation.py` - validate_places() and validate_places_step() using tomllib + DuckDB in-memory spatial

## Decisions Made
- Used `LOAD spatial` (not `INSTALL spatial`) per plan instructions — spatial extension already present in pipeline DuckDB environment
- validate_places raises on first violation per category rather than collecting all errors — appropriate for a small curated file run at build time
- `validate_places_step()` path is relative to `__file__` (not an env var) — keeps the module self-contained like other pipeline modules

## Deviations from Plan

None - plan executed exactly as written.

Note: The plan's verification command `from data.places_validation import validate_places` requires `data` to be on the Python path. Since `data/` has no `__init__.py` and uses its own `uv` project, the correct invocation is `uv run --project data python` with `sys.path.insert(0, 'data')`, or equivalently running from `data/` directory directly. The module itself is correct — this is a documentation/invocation detail, not a code issue.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- content/places.toml and data/places_validation.py ready for Phase 98 pipeline integration
- validate_places_step() can be added to STEPS in run.py (Phase 98 plan)
- No blockers

---
*Phase: 97-place-data-model*
*Completed: 2026-05-18*
