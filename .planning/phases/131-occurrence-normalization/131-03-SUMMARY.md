---
phase: 131-occurrence-normalization
plan: 03
subsystem: database
tags: [dbt, sqlite, typescript, geo_blob, column-drop, normalization]

# Dependency graph
requires:
  - phase: 131-01
    provides: Wave 0 RED tests pinning 7-field geo_blob layout
  - phase: 131-02
    provides: filter.ts JOIN + display_name migration; OccurrenceRow/OCCURRENCE_COLUMNS slimmed
provides:
  - occurrences mart at 33 columns with enforced dbt contract (scientificName/genus/family/specimen_inat_taxon_name dropped)
  - 7-field geo_blob layout in sqlite_export.py and features.ts (source at index 6)
  - _buildGeoJSONFromRaw returns { geojson } only — no summary or taxaOptions
  - _summary owned solely by _loadSummaryFromSQLite (COUNT(*) + MIN/MAX(year))
  - All dead string-column paths deleted (queryFilteredCounts, FilteredCounts, DataSummary count fields)
affects: [132-page-rebuild, 133-browse-tree]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - geo_blob positional layout: source at index 6 in both sqlite_export.py (_GEO_COLS) and features.ts (row[6]) — coupled in same commit per Pitfall 1
    - _summary ownership: sole owner is _loadSummaryFromSQLite; data-loaded event is a bare signal {}
    - dbt contract enforcement: 33-column occurrences mart enforced at every dbt build

key-files:
  created: []
  modified:
    - data/dbt/models/marts/occurrences.sql
    - data/dbt/models/marts/schema.yml
    - data/dbt/models/intermediate/int_specimen_obs_base.sql
    - data/dbt/models/intermediate/int_combined.sql
    - data/sqlite_export.py
    - src/features.ts
    - src/bee-map.ts
    - src/bee-atlas.ts
    - src/filter.ts

key-decisions:
  - "int_combined.sql ARM 1/2/3 all removed scientificName/genus/family/specimen_inat_genus/specimen_inat_family columns to match new mart contract (blocking build fix)"
  - "stg_waba__taxon_lineage LEFT JOIN removed from int_specimen_obs_base — nothing retained uses it after dropping specimen_inat_genus/family"
  - "data-loaded event payload trimmed to bare {} signal — summary/taxaOptions never belonged in the event; _loadSummaryFromSQLite is the sole summary source"

patterns-established:
  - "geo_blob coupling: sqlite_export.py _GEO_COLS and features.ts row[N] index must change in the same commit"
  - "dead-code deletion: queryFilteredCounts/FilteredCounts removed; zero consumers confirmed by grep audit"

requirements-completed: [NORM-01, NORM-02, NORM-03]

# Metrics
duration: 8min
completed: 2026-06-03
---

# Phase 131 Plan 03: Occurrence Normalization Wave 2 Summary

**dbt occurrences mart dropped to 33 columns; geo_blob rewritten to 7-field positional layout with source at index 6; all dead string-column paths deleted and _summary ownership consolidated in _loadSummaryFromSQLite**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-03T01:29:11Z
- **Completed:** 2026-06-03T01:37:14Z
- **Tasks:** 3
- **Files modified:** 9 (including int_combined.sql added via auto-fix)

## Accomplishments

- NORM-01: occurrences mart SELECT trimmed from 37 to 33 columns; schema.yml enforced contract updated to match; dbt build exits 0
- NORM-02: sqlite_export.py _GEO_COLS rewritten to 7-field layout [lat, lon, ecdysis_id, observation_id, specimen_observation_id, year, source]; features.ts decode updated in the same commit (source index 9→6); build-geojson.test.ts 13/13 GREEN
- D-01/D-06: all dead string-column paths deleted — queryFilteredCounts/FilteredCounts removed from filter.ts; DataSummary slimmed to 3 fields; _onDataLoaded no longer sets _summary from event; data-loaded is a bare signal

## Task Commits

1. **Task 1: Drop 4 mart columns + dead intermediate columns** - `abe60fa` (refactor)
2. **Task 2: Rewrite geo_blob to 7-field layout** - `93724da` (feat)
3. **Task 3: Delete dead string-column paths** - `e5e0977` (refactor)

## Files Created/Modified

- `data/dbt/models/marts/occurrences.sql` - Removed j.scientificName, j.genus, j.family, j.specimen_inat_taxon_name from SELECT
- `data/dbt/models/marts/schema.yml` - Dropped 4 column entries from occurrences contract (37→33); species/checklist mats untouched
- `data/dbt/models/intermediate/int_specimen_obs_base.sql` - Removed specimen_inat_genus, specimen_inat_family, and the stg_waba__taxon_lineage LEFT JOIN
- `data/dbt/models/intermediate/int_combined.sql` - Removed all 4 dropped column references from ARM 1/2/3 (auto-fix)
- `data/sqlite_export.py` - _GEO_COLS rewritten to 7-field layout; layout comment updated
- `src/features.ts` - New 7-field decode (source at row[6]); dead Sets/summary/taxaOptions removed; return type trimmed to { geojson }
- `src/bee-map.ts` - Destructure only { geojson }; emit data-loaded as bare signal {}
- `src/bee-atlas.ts` - _loadSummaryFromSQLite query slimmed to COUNT(*)+MIN/MAX(year); _onDataLoaded changed to untyped CustomEvent; this._summary = e.detail.summary deleted
- `src/filter.ts` - queryFilteredCounts + FilteredCounts deleted; DataSummary slimmed to 3 fields

## Decisions Made

- `int_combined.sql` required changes in ARM 1/2/3 to remove columns that no longer exist in `int_specimen_obs_base` or the mart contract — treated as a Rule 1 blocking fix (not a separate planned task)
- The stg_waba__taxon_lineage LEFT JOIN in int_specimen_obs_base was removed because specimen_inat_taxon_name derives from waba.taxon__name (not tl), confirming nothing retained uses tl after dropping genus/family
- geo_blob and features.ts updated atomically per Pitfall 1 guidance — source index mismatch would cause silent wrong-data failures

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] int_combined.sql also referenced dropped columns causing build failure**
- **Found during:** Task 1 (dbt build verification)
- **Issue:** After trimming int_specimen_obs_base.sql, int_combined.sql still referenced `sob.specimen_inat_genus` and `sob.specimen_inat_family` in ARM 1 SELECT and ARM 2 SELECT. Also ARM 1 still selected `e.scientificName`, `e.genus`, `e.family` and ARM 3 still output these same columns — all 4 are dropped from the mart contract.
- **Fix:** Removed all dropped column references from ARM 1, ARM 2, and ARM 3 of int_combined.sql to match the new 33-column contract
- **Files modified:** data/dbt/models/intermediate/int_combined.sql
- **Verification:** dbt build exits 0 (PASS=61 WARN=1 ERROR=0); warning is pre-existing test_lin05_lineage_coverage
- **Committed in:** abe60fa (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - blocking build failure)
**Impact on plan:** Necessary for correctness — int_combined.sql is the upstream model that feeds the mart; it must not output columns that no longer exist in the mart contract. No scope creep.

## Issues Encountered

None beyond the int_combined.sql cascading dependency (handled as Rule 1 auto-fix above).

## Known Stubs

None — all data paths are wired. The geo_blob rewrite produces correct 7-field output at the pipeline layer; features.ts decodes it correctly.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundaries introduced. The changes exclusively remove columns and delete dead code paths, reducing surface area.

## Self-Check

Files created/modified — all exist:
- `/home/peter/dev/beeatlas/data/dbt/models/marts/occurrences.sql` — exists (33-col SELECT)
- `/home/peter/dev/beeatlas/data/dbt/models/marts/schema.yml` — exists (33-col contract)
- `/home/peter/dev/beeatlas/data/dbt/models/intermediate/int_specimen_obs_base.sql` — exists (8-col, no tl JOIN)
- `/home/peter/dev/beeatlas/data/dbt/models/intermediate/int_combined.sql` — exists (dropped cols removed)
- `/home/peter/dev/beeatlas/data/sqlite_export.py` — exists (7-field _GEO_COLS)
- `/home/peter/dev/beeatlas/src/features.ts` — exists (source at row[6], { geojson } return)
- `/home/peter/dev/beeatlas/src/bee-map.ts` — exists (bare signal)
- `/home/peter/dev/beeatlas/src/bee-atlas.ts` — exists (_summary owned by _loadSummaryFromSQLite)
- `/home/peter/dev/beeatlas/src/filter.ts` — exists (DataSummary 3 fields, dead code deleted)

Commits verified: abe60fa, 93724da, e5e0977

## Self-Check: PASSED

## Next Phase Readiness

Phase 131 plan 03 is the final execution wave for occurrence normalization. Phase 131 plan 04 (if any) or the next milestone phase (132-page-rebuild) can proceed. The occurrences mart is now at 33 columns, the geo_blob is the minimal 7-field layout, and all dead string-column code has been removed.

---
*Phase: 131-occurrence-normalization*
*Completed: 2026-06-03*
