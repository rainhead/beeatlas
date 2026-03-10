---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: iNat Pipeline
status: planning
stopped_at: Completed 08-02-PLAN.md — AWS credentials in CI build job, S3 cache/ prefix smoke-tested
last_updated: "2026-03-10T19:57:33.210Z"
last_activity: 2026-03-10 — Roadmap created; 3 phases defined (8–10)
progress:
  total_phases: 3
  completed_phases: 1
  total_plans: 2
  completed_plans: 2
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-10)

**Core value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.
**Current focus:** Milestone v1.2 — iNat Pipeline (Phase 8: Discovery and Prerequisite Gate)

## Current Position

Phase: 8 of 10 (Discovery and Prerequisite Gate)
Plan: — (not yet planned)
Status: Ready to plan
Last activity: 2026-03-10 — Roadmap created; 3 phases defined (8–10)

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Prior velocity (v1.0 + v1.1):**
- Total plans completed: 18 (13 in v1.0, 5 in v1.1)
- v1.0 timeline: 4 days; avg ~2–3 min/plan (one outlier: Phase 6 ~30 min)
- v1.1 Phase 7: 5 plans, ~15 min total

*v1.2 metrics will be tracked after first plan completes*

## Accumulated Context

### Decisions

- **v1.2 scope**: Pipeline only — MAP-03, MAP-04, and specimen-sample linkage deferred to v1.3+
- **Parquet stub must land in main first**: `frontend/src/assets/samples.parquet` (zero rows, correct schema) committed before Phase 9 feature branch to prevent CI breakage
- **Do not use `pyinaturalist-convert.to_dataframe()`**: Returns `ofvs.{field_id}` column names and `location` as list — unsuitable for samples schema; parse raw dicts directly
- **Use iNat API v1 (pyinaturalist default), not v2**: v2 has project observation count discrepancies; coordinate order also differs
- [Phase 08-01]: Match iNat ofvs by field_id=8338, not name string — field renamed from 'Number of bees collected' to 'numberOfSpecimens' circa 2024; name matching drops ~40% of historical data
- [Phase 08-01]: OFVS_IN_DEFAULT_RESPONSE = True — no fields='all' parameter needed for iNat API v1 project observation queries
- [Phase 08-02]: S3_BUCKET_NAME existing GitHub variable is sufficient for Phase 9 — no new variable needed; pipeline uses cache/ prefix
- [Phase 08-02]: No new IAM grants needed for S3 cache/ prefix — siteBucket.grantReadWrite(deployerRole) already covers it

### Pending Todos

None.

### Blockers/Concerns

- **Phase 8 hard prerequisite**: Specimen count observation field name/ID for WA Bee Atlas project 166376 cannot be determined statically — requires one live `curl` call. Must be resolved before extraction logic in Phase 9 can be written.
- **`ofvs` presence ambiguity**: ARCHITECTURE.md says v1 includes `ofvs` by default; PITFALLS.md warns it may require `fields='all'`. Must be confirmed in Phase 8.

## Session Continuity

Last session: 2026-03-10T19:57:33.208Z
Stopped at: Completed 08-02-PLAN.md — AWS credentials in CI build job, S3 cache/ prefix smoke-tested
Resume file: None
