---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Specimen-Sample Linkage
status: defining_requirements
stopped_at: Milestone v1.3 started — defining requirements
last_updated: "2026-03-11"
last_activity: "2026-03-11 - Milestone v1.3 started"
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-11)

**Core value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.
**Current focus:** Defining requirements for v1.3 (Specimen-Sample Linkage)

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-03-11 — Milestone v1.3 started

## Accumulated Context

### Decisions

- **v1.2 scope**: Pipeline only — MAP-03, MAP-04, and specimen-sample linkage deferred to v1.3+
- **Parquet stub must land in main first**: `frontend/src/assets/samples.parquet` (zero rows, correct schema) committed before Phase 9 feature branch to prevent CI breakage
- **Do not use `pyinaturalist-convert.to_dataframe()`**: Returns `ofvs.{field_id}` column names and `location` as list — unsuitable for samples schema; parse raw dicts directly
- **Use iNat API v1 (pyinaturalist default), not v2**: v2 has project observation count discrepancies; coordinate order also differs
- **Match iNat ofvs by field_id=8338, not name string**: Field renamed circa 2024; name matching drops ~40% of historical data
- **v1.3 scope**: Pipeline only — links.parquet (occurrenceID → inat_observation_id); frontend display deferred to v1.4+
- **v1.3 cache model**: Permanent per-record cache — once an occurrenceID→iNat link is fetched, it is never re-fetched

### Pending Todos

None.

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 1 | Store full observation JSON in cache with download timestamp | 2026-03-11 | 16256f3 | Verified | [1-store-full-observation-json-in-cache-wit](./quick/1-store-full-observation-json-in-cache-wit/) |

### Blockers/Concerns

None currently.
