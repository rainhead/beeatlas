---
phase: 18-map-integration
plan: 03
subsystem: data
tags: [parquet, spatial-join, python, geopandas, pyarrow]

# Dependency graph
requires:
  - phase: 16-pipeline-spatial-join
    provides: spatial join pipeline (add_region_columns, county/ecoregion_l3 columns)
  - phase: 18-map-integration
    provides: Plans 01-02 — boundary toggle UI, polygon click filter, matchesFilter logic
provides:
  - frontend/src/assets/ecdysis.parquet with county and ecoregion_l3 string columns
  - frontend/src/assets/samples.parquet with county and ecoregion_l3 string columns
  - Polygon click filter works end-to-end (matchesFilter now finds county/ecoregion_l3 on features)
affects: [18-map-integration, future-data-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Data pipeline must be re-run locally when new frontend columns are added to EXPECTED dict

key-files:
  created: []
  modified:
    - frontend/src/assets/ecdysis.parquet (gitignored; regenerated locally via ecdysis pipeline)
    - frontend/src/assets/samples.parquet (gitignored; regenerated locally via iNat pipeline)

key-decisions:
  - "Parquet files remain gitignored build artifacts; they are regenerated via data pipelines (local dev) or fetch-data workflow (CI/CD), not committed to git"
  - "ecdysis pipeline run with ecdysis_2026-03-13_.zip — most recent available source zip"
  - "iNat pipeline run incrementally, fetching 2 new observations since last run; add_region_columns applied to full merged dataset"

patterns-established:
  - "Root cause fix pattern: stale gitignored parquet assets must be regenerated via pipeline, not patched in place"

requirements-completed: [MAP-10, FILTER-05]

# Metrics
duration: 5min
completed: 2026-03-14
---

# Phase 18 Plan 03: Parquet Asset Regeneration Summary

**Regenerated ecdysis.parquet (46090 specimens) and samples.parquet (9586 observations) with county and ecoregion_l3 string columns via spatial join pipelines, fixing the polygon click filter that was ghosting all features**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-14T22:18:12Z
- **Completed:** 2026-03-14T22:22:00Z
- **Tasks:** 3
- **Files modified:** 2 (gitignored parquet assets, regenerated locally)

## Accomplishments
- Ran ecdysis occurrences pipeline against ecdysis_2026-03-13_.zip; produced data/ecdysis.parquet with county ("King", "Pierce", etc.) and ecoregion_l3 ("North Cascades", etc.) columns
- Ran iNat incremental pipeline; produced data/samples.parquet with county and ecoregion_l3 columns (2 new observations fetched, 9586 total)
- Copied both files to frontend/src/assets/; validate-schema and frontend build both pass

## Task Commits

No tracked file changes in tasks 1-3 — both parquet assets are gitignored per project rules (committed as part of plan metadata commit below).

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `frontend/src/assets/ecdysis.parquet` - Regenerated with county and ecoregion_l3 columns (gitignored, not committed)
- `frontend/src/assets/samples.parquet` - Regenerated with county and ecoregion_l3 columns (gitignored, not committed)

## Decisions Made
- Parquet files are intentionally gitignored (removed from tracking in commit 8b9ff33). They are built locally via pipeline or CI fetch-data workflow. No force-add performed per project memory.
- The data/ecdysis.parquet and data/samples.parquet (under data/) were also stale — both regenerated as part of running the pipelines.

## Deviations from Plan

None - plan executed exactly as written. The fallback path for Task 2 was not needed (iNat pipeline ran successfully).

## Issues Encountered
None — both pipelines ran cleanly. Boundary files (tl_2024_us_county.zip, NA_CEC_Eco_Level3.zip) were present in data/. validate-schema.mjs already had county and ecoregion_l3 in its EXPECTED dict.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Both frontend parquet assets now have county and ecoregion_l3 columns
- matchesFilter() in bee-map.ts will correctly match feature.get('county') against filterState.selectedCounties
- Polygon click filter (county and ecoregion) works end-to-end in local dev
- Phase 18 complete — all 3 plans done; v1.5 Geographic Regions milestone ready for UAT

---
*Phase: 18-map-integration*
*Completed: 2026-03-14*
