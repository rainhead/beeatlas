---
phase: 16-pipeline-spatial-join
plan: "04"
subsystem: infra
tags: [ci, parquet, schema-validation, spatial-join]

# Dependency graph
requires:
  - phase: 16-pipeline-spatial-join
    provides: county and ecoregion_l3 columns added to ecdysis.parquet and samples.parquet via spatial join pipeline
provides:
  - CI gate that fails if ecdysis.parquet or samples.parquet are missing county or ecoregion_l3 columns
affects: [16-pipeline-spatial-join, ci-deploy]

# Tech tracking
tech-stack:
  added: []
  patterns: [validate-schema.mjs EXPECTED dict extended when new columns added to parquet schema contract]

key-files:
  created: []
  modified: [scripts/validate-schema.mjs]

key-decisions:
  - "validate-schema.mjs EXPECTED dict is the authoritative CI schema contract for parquet column requirements"

patterns-established:
  - "Add columns to EXPECTED in validate-schema.mjs whenever new parquet columns are required by the frontend"

requirements-completed: [PIPE-07]

# Metrics
duration: 5min
completed: 2026-03-14
---

# Phase 16 Plan 04: Schema Validation CI Gate Summary

**CI schema validation extended to require county and ecoregion_l3 columns in both ecdysis.parquet and samples.parquet**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-14T17:50:00Z
- **Completed:** 2026-03-14T17:55:57Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added 'county' and 'ecoregion_l3' to ecdysis.parquet entry in EXPECTED dict
- Added 'county' and 'ecoregion_l3' to samples.parquet entry in EXPECTED dict
- links.parquet entry unchanged (no spatial join applied to link table)
- CI will now fail loudly if cached parquet files predate Phase 16 spatial join pipeline

## Task Commits

Each task was committed atomically:

1. **Task 1: Add county and ecoregion_l3 to validate-schema.mjs EXPECTED dict** - `18983ed` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `scripts/validate-schema.mjs` - Added county and ecoregion_l3 to ecdysis.parquet and samples.parquet EXPECTED column lists

## Decisions Made
None - followed plan as specified.

## Deviations from Plan

None - plan executed exactly as written.

Note: The plan's done criteria stated "county appears at least 4 times" based on "once per parquet file x 2 columns x 2 files = 4 minimum". This math conflates the two new columns: 'county' appears exactly twice (once per parquet file) and 'ecoregion_l3' appears exactly twice. The implementation is correct per the actual objective.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Schema validation CI gate is complete; Phase 16 plans 01-03 (pipeline spatial join scripts) can run and generate parquet files that will pass this gate
- All four plans in Wave 1 of Phase 16 are independent; this plan can be merged with or after the pipeline scripts

---
*Phase: 16-pipeline-spatial-join*
*Completed: 2026-03-14*
