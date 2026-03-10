---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: iNat Pipeline
status: planning
stopped_at: "Completed 10-01 Task 1: deploy.yml updated — awaiting CI green verification at checkpoint"
last_updated: "2026-03-10T22:54:33.415Z"
last_activity: 2026-03-10 — Roadmap created; 3 phases defined (8–10)
progress:
  total_phases: 3
  completed_phases: 3
  total_plans: 5
  completed_plans: 5
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
- [Phase 09-01]: samples.parquet must be force-tracked (git add -f) because root .gitignore has *.parquet; stub must be in repo so CI does not fail before pipeline runs
- [Phase 09-01]: specimen_count uses pandas Int64 (nullable) not int64 to match nullable integer requirement in schema spec
- [Phase 09-02]: page='all' pagination for both full and incremental fetches — pyinaturalist handles iteration automatically
- [Phase 09-02]: Incremental fallback: catch any exception from fetch_since, warn, fall back to full fetch
- [Phase 09-02]: merge_delta uses keep='last' so delta rows overwrite existing rows on duplicate observation_id
- [Phase 10-01]: Job-level env: S3_BUCKET_NAME in both build and deploy jobs — cleaner than per-step env, avoids repetition across three steps
- [Phase 10-01]: Mirror same cache-restore/build/cache-upload pattern in both CI jobs for consistency

### Pending Todos

None.

### Blockers/Concerns

- **Phase 8 hard prerequisite**: Specimen count observation field name/ID for WA Bee Atlas project 166376 cannot be determined statically — requires one live `curl` call. Must be resolved before extraction logic in Phase 9 can be written.
- **`ofvs` presence ambiguity**: ARCHITECTURE.md says v1 includes `ofvs` by default; PITFALLS.md warns it may require `fields='all'`. Must be confirmed in Phase 8.

## Session Continuity

Last session: 2026-03-10T22:54:28.574Z
Stopped at: Completed 10-01 Task 1: deploy.yml updated — awaiting CI green verification at checkpoint
Resume file: None
