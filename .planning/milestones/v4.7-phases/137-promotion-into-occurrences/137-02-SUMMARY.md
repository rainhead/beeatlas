---
phase: 137-promotion-into-occurrences
plan: 02
subsystem: database
tags: [typescript, vitest, geojson, sqlite, geo_blob, occurrences, checklist]

# Dependency graph
requires:
  - phase: 137-01
    provides: checklist_id INTEGER column in occurrences.parquet/occurrences.db; 19,929 source='checklist' rows
provides:
  - sqlite_export._GEO_COLS with checklist_id appended at index 7 (8-field geo_blob encoding)
  - src/features.ts _buildGeoJSONFromRaw decodes row[7] to occId = 'checklist:<N>'
  - Vitest suite: makeChecklistRow factory + 3 new cases proving checklist decode, no-drop, null-drops
  - Single atomic commit enforcing positional coupling invariant (PRO-04)
affects:
  - 138-frontend-points (reads checklist:<N> occId from map point layer; now correctly decoded)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "geo_blob append-only pattern: new column appended at max index so existing indices stay stable; atomic commit enforces _GEO_COLS ↔ features.ts positional coupling (precedent: Phase 131 NORM-02)"
    - "8-field toRow factory: checklist_id optional with null default; existing 7-field callsites unmodified"

key-files:
  created: []
  modified:
    - data/sqlite_export.py
    - src/features.ts
    - src/tests/build-geojson.test.ts

key-decisions:
  - "Single atomic commit (PRO-04): all three files changed together — _GEO_COLS and features.ts positional indices are untyped; splitting would silently drop all checklist points via occId==null continue"
  - "checklist_id optional in RowOverride with null default in factory spreads — zero churn at existing 7-field callsites"

requirements-completed: [PRO-04]

# Metrics
duration: 5min
completed: 2026-06-08
---

# Phase 137 Plan 02: Atomic geo_blob ↔ features.ts checklist_id decode Summary

**checklist_id appended to geo_blob at index 7; features.ts decodes `checklist:<N>` occId; Vitest confirms no-drop; all in one atomic commit**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-08T20:23Z
- **Completed:** 2026-06-08T20:28Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments

- `_GEO_COLS` in `sqlite_export.py` extended to 8 fields with `checklist_id` at index 7; column-order comment updated with Phase 137 atomic coupling note
- `_buildGeoJSONFromRaw` in `src/features.ts` reads `row[7]` as `checklist_id` and decodes non-null values to `occId = 'checklist:${checklist_id}'`, appended to the ecdysis/inat/inat_obs if/else chain
- `build-geojson.test.ts` migrated to 8-field `RowOverride`/`toRow` layout with `checklist_id?: number | null` optional field (null default); `makeChecklistRow` factory added; three new `it` cases cover: decode to `checklist:42`, no-drop for non-null checklist_id, drop for null checklist_id
- All 16 Vitest tests pass (13 existing + 3 new); `git show --stat HEAD` confirms all three files in one commit

## Task Commits

1. **Task 1: Atomic geo_blob + features.ts checklist_id decode + Vitest** - `469ab36` (feat)

**Plan metadata:** (final commit below)

## Files Created/Modified

- `data/sqlite_export.py` - Appended `"checklist_id"` to `_GEO_COLS` (index 7); updated column-order comment documenting Phase 137 atomic coupling
- `src/features.ts` - Added `const checklist_id = row[7]`; added `else if (checklist_id != null) occId = \`checklist:${checklist_id}\``; updated layout comment
- `src/tests/build-geojson.test.ts` - Migrated `RowOverride`/`toRow` to 8-field layout; added `makeChecklistRow` factory; added 3 checklist `it` cases; updated inline raw-row tests to 8-element arrays

## Decisions Made

- Applied the lowest-churn approach for the test factory migration: `checklist_id?: number | null` optional in `RowOverride` with `checklist_id: null` default in each existing factory spread (`makeEcdysisRow`, `makeInatRow`, `makeSpecimenObsRow`) — no changes needed at test callsites.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- PRO-04 complete: checklist points in `occurrences.db` now decode to valid `checklist:<N>` occIds and are not silently dropped by `_buildGeoJSONFromRaw`
- Phase 138 (Frontend Points & Detail Card) can proceed: checklist points will appear on the map as soon as `sqlite_export.py` runs against the updated `occurrences.parquet`

## Known Stubs

None — decode path is fully wired; checklist points will render as soon as the nightly pipeline regenerates `occurrences.db`.

## Threat Flags

None — no new network endpoints, auth paths, or file access patterns introduced. This is a positional-decode extension of an existing static export path (T-137-03 and T-137-04 from the plan threat register are mitigated by the atomic commit + Vitest no-drop test).

## Self-Check: PASSED

- `data/sqlite_export.py` exists and contains `"checklist_id"` in `_GEO_COLS`
- `src/features.ts` exists and contains `checklist_id = row[7]` and the decode branch
- `src/tests/build-geojson.test.ts` exists and contains `makeChecklistRow` and `checklist:42`
- Commit `469ab36` exists: `git show --stat HEAD` confirms all three files in one atomic commit
- Vitest: 16/16 tests pass

---
*Phase: 137-promotion-into-occurrences*
*Completed: 2026-06-08*
