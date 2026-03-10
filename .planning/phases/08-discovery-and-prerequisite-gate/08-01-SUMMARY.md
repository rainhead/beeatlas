---
phase: 08-discovery-and-prerequisite-gate
plan: "01"
subsystem: infra
tags: [inat, python, field-constants, ofvs, specimen-count]

requires: []
provides:
  - "data/inat/observations.py with SPECIMEN_COUNT_FIELD_ID=8338, SAMPLE_ID_FIELD_ID=9963, OFVS_IN_DEFAULT_RESPONSE, and extract_specimen_count()"
affects:
  - "09-inat-pipeline"

tech-stack:
  added: []
  patterns:
    - "Match iNat ofvs by field_id (stable), never by name string (changes over project lifetime)"
    - "extract_specimen_count() returns int | None; caller must use nullable Int64 dtype in DataFrame"

key-files:
  created:
    - data/inat/observations.py
  modified: []

key-decisions:
  - "Match ofvs by field_id=8338, not name string — field was renamed from 'Number of bees collected' to 'numberOfSpecimens' circa 2024; name matching silently drops ~40% of historical data"
  - "OFVS_IN_DEFAULT_RESPONSE = True — no fields='all' parameter needed for iNat API v1 project observation queries"

patterns-established:
  - "Pattern 1: Store iNat field IDs as named constants with historical rename documentation"
  - "Pattern 2: extract_specimen_count() guards against None/empty ofvs list via 'ofvs or []'"

requirements-completed:
  - INFRA-04

duration: 1min
completed: 2026-03-10
---

# Phase 8 Plan 01: Discovery and Prerequisite Gate — iNat Field Constants Summary

**Named constants SPECIMEN_COUNT_FIELD_ID=8338 and extract_specimen_count() committed to data/inat/observations.py, confirmed via live iNat API call against WA Bee Atlas project 166376**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-10T19:50:01Z
- **Completed:** 2026-03-10T19:50:45Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Populated `data/inat/observations.py` with live-confirmed field constants (SPECIMEN_COUNT_FIELD_ID=8338, SAMPLE_ID_FIELD_ID=9963) and documented the dual field-name history
- Established OFVS_IN_DEFAULT_RESPONSE=True constant confirming no `fields='all'` parameter is needed
- Implemented extract_specimen_count() with field_id matching, None/empty/bad-value safety, and nullable return type guidance

## Task Commits

Each task was committed atomically:

1. **Task 1: Populate observations.py with confirmed field constants and extraction helper** - `a8da922` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `data/inat/observations.py` - iNat field ID constants and extract_specimen_count() helper; importable from Phase 9 pipeline

## Decisions Made
- Match ofvs by `field_id=8338` exclusively — the field name changed from `"Number of bees collected"` to `"numberOfSpecimens"` circa 2024; name matching would silently drop ~40% of historical observations
- No `fields='all'` parameter needed — confirmed via live API that iNat v1 returns `ofvs` in the default response for project observation queries

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `data/inat/observations.py` is ready for import by Phase 9 extraction logic
- Phase 9 can use `from inat.observations import SPECIMEN_COUNT_FIELD_ID, extract_specimen_count`
- Remaining Phase 8 work (plan 02): CDK S3 cache bucket and CI credential gate — must be deployed before Phase 9 pipeline can run

---
*Phase: 08-discovery-and-prerequisite-gate*
*Completed: 2026-03-10*
