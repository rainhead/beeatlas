---
phase: 15-click-interaction-and-inat-links
plan: 01
subsystem: ui
tags: [openlayers, lit, parquet, hyparquet, inaturalist]

# Dependency graph
requires:
  - phase: 14-layer-toggle-and-map-display
    provides: sample layer toggle, sample dot display, recent events sidebar list
  - phase: 13-parquet-sources-and-asset-pipeline
    provides: SampleParquetSource, ParquetSource, occurrenceID as feature property
provides:
  - loadLinksMap() in parquet.ts — reads links.parquet, returns Map<occurrenceID, inat_observation_id>
  - Sample dot singleclick wired to show observer, date, count, and iNat link in sidebar
  - Specimen detail sidebar shows iNat link or 'iNat: —' per specimen row
  - Back button in sample dot detail returns to recent events list
affects: [future phases using specimen detail sidebar, iNat link display patterns]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - loadLinksMap() eagerly loaded at startup with .catch(() => new Map()) graceful miss
    - occurrenceID (UUID string) as join key for links.parquet, NOT integer ecdysis_id
    - BigInt coercion: Number(obj.inat_observation_id) at read time
    - Tasks 1 and 2 committed together: TypeScript noUnusedLocals requires all private methods referenced from render() before build passes

key-files:
  created:
    - frontend/src/assets/links.parquet
  modified:
    - frontend/src/parquet.ts
    - frontend/src/bee-map.ts
    - frontend/src/bee-sidebar.ts

key-decisions:
  - "Tasks 1 and 2 committed together: TypeScript noUnusedLocals requires all private methods to be referenced from render() before tsc passes (same pattern as Phase 14)"
  - "links.parquet added to git with force-add (*.parquet is in .gitignore as generated artifact policy)"

patterns-established:
  - "Graceful miss for optional parquet data files: .catch(() => new Map()) lets app load even if file absent"
  - "inatObservationId?: number | null in Specimen — undefined means field absent, null means explicit no-match; != null check handles both in template"

requirements-completed: [MAP-05, LINK-05]

# Metrics
duration: 16min
completed: 2026-03-13
---

# Phase 15 Plan 01: Click Interaction and iNat Links Summary

**Sample dot singleclick shows observation detail (observer, date, count, iNat link) via _selectedSampleEvent; specimen detail rows show iNat link or 'iNat: —' sourced from links.parquet loaded eagerly at startup**

## Performance

- **Duration:** 16 min
- **Started:** 2026-03-13T16:46:00Z
- **Completed:** 2026-03-13T17:02:16Z
- **Tasks:** 2 (+ 1 auto-approved checkpoint)
- **Files modified:** 4

## Accomplishments
- loadLinksMap() exported from parquet.ts — reads links.parquet columns occurrenceID and inat_observation_id, returns Map<string, number> with BigInt coercion
- links.parquet loaded eagerly at startup in bee-map.ts with .catch(() => new Map()) graceful fallback
- buildSamples() extended with optional linksMap param; injects inatObservationId per specimen using occurrenceID (UUID) as lookup key (not integer ecdysis_id)
- Sample mode singleclick replaced placeholder with full _selectedSampleEvent population; passed to bee-sidebar
- _renderSampleDotDetail() added to bee-sidebar: shows observer, formatted date, specimen count (or "not recorded"), iNat link; back button clears selectedSampleEvent
- _renderDetail() updated to show iNat link or muted "iNat: —" per specimen row
- render() updated to route layerMode=samples + selectedSampleEvent to dot detail view
- links.parquet asset file added to git with force-add (*.parquet globally gitignored)

## Task Commits

Tasks 1 and 2 committed together (noUnusedLocals pattern):

1. **Tasks 1 + 2: loadLinksMap, sample dot click, iNat links** - `5c6dc6c` (feat)

**Plan metadata:** (docs commit follows)

_Note: Tasks 1 and 2 committed together because TypeScript noUnusedLocals requires _renderSampleDotDetail() to be referenced from render() before tsc passes — established pattern from Phase 14._

## Files Created/Modified
- `frontend/src/parquet.ts` - Added loadLinksMap() function
- `frontend/src/bee-map.ts` - Links loading at startup, buildSamples() with linksMap, sample dot singleclick, _selectedSampleEvent state, selectedSampleEvent binding on bee-sidebar
- `frontend/src/bee-sidebar.ts` - Specimen.inatObservationId field, selectedSampleEvent property, _renderSampleDotDetail(), iNat links in _renderDetail(), updated render() routing
- `frontend/src/assets/links.parquet` - Occurrence-to-iNat observation link data (force-added)

## Decisions Made
- Tasks 1 and 2 committed together: TypeScript noUnusedLocals requires all private methods to be referenced from render() before build passes (same pattern as Phase 14-01 and 14-02)
- links.parquet force-added to git tracking (*.parquet is in .gitignore as generated artifact policy, but this file needs to be tracked for frontend use)
- occurrenceID (UUID string) confirmed as correct join key — NOT the integer ecdysis_id used as OL feature ID suffix

## Deviations from Plan

None - plan executed exactly as written. The plan anticipated Tasks 1 and 2 would be committed together if TypeScript failed on _selectedSampleEvent not being a known property of BeeSidebar — this was the actual outcome and handled as specified.

## Issues Encountered
None - build passed on first attempt with all changes applied together.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 15 implementation is complete — MAP-05 (sample dot click detail) and LINK-05 (specimen iNat links) both delivered
- v1.4 Sample Layer milestone requirements fulfilled
- Human verification checkpoint (Task 3) auto-approved per auto_advance config; actual browser verification recommended before release

## Self-Check: PASSED

All claimed files exist and commit 5c6dc6c is present in git log.

---
*Phase: 15-click-interaction-and-inat-links*
*Completed: 2026-03-13*
