---
phase: 067-provisional-row-display-in-sidebar
plan: "01"
subsystem: pipeline-export, frontend-schema
tags: [export, schema, filter, occurrences, provisional]
dependency_graph:
  requires: []
  provides:
    - specimen_inat_quality_grade in occurrences.parquet
    - OccurrenceRow with is_provisional, specimen_inat_taxon_name, specimen_inat_quality_grade, host_inat_login
    - OCCURRENCE_COLUMNS matching updated OccurrenceRow
    - buildFilterSQL collector filter using host_inat_login
  affects:
    - data/export.py
    - scripts/validate-schema.mjs
    - frontend/src/filter.ts
tech_stack:
  added: []
  patterns:
    - UNION ALL combined CTE with consistent column aliases across both arms
key_files:
  created: []
  modified:
    - data/export.py
    - scripts/validate-schema.mjs
    - frontend/src/filter.ts
    - frontend/src/tests/filter.test.ts
decisions:
  - "Added specimen_inat_quality_grade as second alias (sob.quality_grade) in both ARM 1 and ARM 2 so the final SELECT can reference j.specimen_inat_quality_grade uniformly"
  - "Renamed CollectorEntry.observer to host_inat_login to match the parquet column name; collector SQL filter updated to host_inat_login IN"
  - "Updated filter.test.ts assertions for renamed/added columns (Rule 1 auto-fix: tests would fail without update)"
metrics:
  duration: "160 seconds"
  completed: "2026-04-20"
  tasks_completed: 2
  files_changed: 4
---

# Phase 067 Plan 01: Pipeline Export Gap + Frontend Schema Layer Summary

Export pipeline closes Phase 66 gap (missing `specimen_inat_quality_grade`) and frontend schema layer renamed `observer` → `host_inat_login` with three new provisional fields added to `OccurrenceRow` and `OCCURRENCE_COLUMNS`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add specimen_inat_quality_grade to export.py and validate-schema.mjs | 49d655e | data/export.py, scripts/validate-schema.mjs |
| 2 | Update filter.ts — rename observer, add new fields | f183308 | frontend/src/filter.ts, frontend/src/tests/filter.test.ts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated filter.test.ts to match renamed/added fields**
- **Found during:** Task 2
- **Issue:** Three test assertions referenced `observer` (in OCCURRENCE_COLUMNS check, SQL content check, and a CollectorEntry fixture) — all would fail after renaming `observer` to `host_inat_login` in `filter.ts`
- **Fix:** Updated test at line 195 (`observer: null` → `host_inat_login: null`), line 231 (`toContain('observer')` → `toContain('host_inat_login')`), and lines 279/283 (test name + `toContain('observer')` → `toContain('host_inat_login')`)
- **Files modified:** frontend/src/tests/filter.test.ts
- **Commit:** f183308 (included in Task 2 commit)

## Verification Results

1. `grep -c "specimen_inat_quality_grade" data/export.py` → 3 (ARM 1 alias, ARM 2 alias, final SELECT) ✓
2. `grep "specimen_inat_quality_grade" scripts/validate-schema.mjs` → found in WABA fields block ✓
3. `grep "observer" frontend/src/filter.ts` → 0 lines (no SQL `observer IN` references) ✓
4. `grep "host_inat_login" frontend/src/filter.ts` → 7 lines (CollectorEntry, OccurrenceRow, OCCURRENCE_COLUMNS, buildFilterSQL) ✓
5. `npm test -- --run` → 150 tests passed ✓

## Known Stubs

None — this plan is purely schema/type layer changes with no UI rendering.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundary changes introduced.

## Self-Check: PASSED

- data/export.py: modified, committed at 49d655e ✓
- scripts/validate-schema.mjs: modified, committed at 49d655e ✓
- frontend/src/filter.ts: modified, committed at f183308 ✓
- frontend/src/tests/filter.test.ts: modified, committed at f183308 ✓
- Commit 49d655e exists ✓
- Commit f183308 exists ✓
