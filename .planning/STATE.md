# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.
**Current focus:** Phase 2 — Infrastructure

## Current Position

Phase: 2 of 5 (Infrastructure)
Plan: 2 of 2 in current phase (02-01 complete; 02-02 at checkpoint awaiting human action)
Status: Checkpoint — awaiting human action
Last activity: 2026-02-18 — 02-01 complete (CDK stack synthesizes cleanly); 02-02 Task 1 complete (.github/workflows/deploy.yml created); paused at human-verify checkpoint for CDK deploy + GitHub secrets

Progress: [██░░░░░░░░] 10%

## Performance Metrics

**Velocity:**
- Total plans completed: 2
- Average duration: 3 min
- Total execution time: ~0.1 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-pipeline | 1 | 2 min | 2 min |
| 02-infrastructure | 1 | 4 min | 4 min |

**Recent Trend:**
- Last 5 plans: 01-01 (2 min), 02-01 (4 min)
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
- [02-01]: Use S3BucketOrigin.withOriginAccessControl() (OAC) not deprecated S3Origin (OAI) — confirmed stable in CDK v2.156+, verified in synth output
- [02-01]: No websiteIndexDocument on S3 bucket — use defaultRootObject on CloudFront Distribution (incompatible with OAC if set on bucket)
- [02-01]: OIDC trust uses StringLike with repo:rainhead/beeatlas:* — no thumbprints needed (AWS added GitHub root CA late 2024)

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 3]: Verify `place_id=82` for Washington State in iNaturalist before any iNat pipeline work

*Resolved:*
- [Phase 2 - resolved]: CDK OAC construct API confirmed working — `S3BucketOrigin.withOriginAccessControl()` verified in cdk synth output with aws-cdk-lib 2.238.0
- [Phase 2 - resolved]: OIDC subject claim `repo:rainhead/beeatlas:*` confirmed correct format via synth output

## Session Continuity

Last session: 2026-02-18
Stopped at: 02-01 complete; still at checkpoint in 02-02-PLAN.md Task 2 (human-verify: CDK deploy + GitHub secrets + live site verification)
Resume file: None
