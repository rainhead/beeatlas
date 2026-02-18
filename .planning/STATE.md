# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.
**Current focus:** Phase 2 — Infrastructure

## Current Position

Phase: 2 of 5 (Infrastructure)
Plan: 2 of 2 in current phase
Status: Checkpoint — awaiting human action
Last activity: 2026-02-18 — 02-02 Task 1 complete (.github/workflows/deploy.yml created); paused at human-verify checkpoint for CDK deploy + GitHub secrets

Progress: [█░░░░░░░░░] 5%

## Performance Metrics

**Velocity:**
- Total plans completed: 1
- Average duration: 2 min
- Total execution time: ~0.03 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-pipeline | 1 | 2 min | 2 min |

**Recent Trend:**
- Last 5 plans: 01-01 (2 min)
- Trend: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Phase 1 and Phase 2 are independent — pipeline and infrastructure can be planned/worked in parallel
- [Roadmap]: iNaturalist host plant pipeline deferred to v2 (PLANT-01, PLANT-02, PLANT-03 are v2 requirements)
- [01-01]: Filter null coordinates using ecdysis_decimalLatitude (prefixed name) not decimalLatitude — read_occurrences() calls add_prefix('ecdysis_') before returning
- [01-01]: Write plain pd.DataFrame (not GeoDataFrame) to Parquet to avoid GeoParquet format that breaks hyparquet
- [02-02]: id-token: write permission must be at job level on deploy job, not workflow level — placing at workflow level with multiple jobs causes "Credentials could not be loaded" error
- [02-02]: deploy job rebuilds frontend itself (self-contained) rather than consuming build job artifact — avoids artifact complexity

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 2]: CDK OAC construct API (`S3BucketOrigin.withOriginAccessControl()`) should be verified against current CDK v2 changelog before writing the stack — MEDIUM confidence from training data
- [Phase 2]: OIDC subject claim format — start with `StringLike` wildcard (`repo:rainhead/beeatlas:*`), tighten after confirming
- [Phase 3]: Verify `place_id=82` for Washington State in iNaturalist before any iNat pipeline work

## Session Continuity

Last session: 2026-02-18
Stopped at: Checkpoint in 02-02-PLAN.md Task 2 (human-verify: CDK deploy + GitHub secrets + live site verification)
Resume file: None
