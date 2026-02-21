# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.
**Current focus:** Phase 3 — Core Map

## Current Position

Phase: 3 of 5 (Core Map)
Plan: 2 of 2 in current phase (03-02 complete)
Status: Phase 3 complete
Last activity: 2026-02-21 — 03-02 complete (bee-sidebar LitElement + singleclick handler wired; build passes)

Progress: [█████░░░░░] 25%

## Performance Metrics

**Velocity:**
- Total plans completed: 4
- Average duration: 2 min
- Total execution time: ~0.1 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-pipeline | 1 | 2 min | 2 min |
| 02-infrastructure | 1 | 4 min | 4 min |
| 03-core-map | 2 | 3 min | 1.5 min |

**Recent Trend:**
- Last 5 plans: 01-01 (2 min), 02-01 (4 min), 03-01 (2 min), 03-02 (1 min)
- Trend: Fast

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
- [03-01]: clusterStyle parameter typed as FeatureLike (not Feature) to match OL StyleFunction interface — inner cluster features cast to Feature[] since Cluster source always wraps proper Feature objects
- [03-01]: Style cache key format is count:tier — sufficient for visual correctness, avoids per-render Style allocation
- [03-01]: Recency PlainDate uses day=1 for month-level comparison — acceptable coarseness for 3-tier recency buckets
- [03-02]: MapBrowserEvent type import required for singleclick handler under strict + verbatimModuleSyntax — OL map.on() overload resolves to any without explicit typing
- [03-02]: specimenSource.once('change') fires reliably after addFeatures() in ParquetSource — getFeatures() returns complete dataset at that point
- [03-02]: Single singleclick handler branches on hits.length — avoids ordering issues with separate open/dismiss handlers

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 3]: Verify `place_id=82` for Washington State in iNaturalist before any iNat pipeline work

*Resolved:*
- [Phase 2 - resolved]: CDK OAC construct API confirmed working — `S3BucketOrigin.withOriginAccessControl()` verified in cdk synth output with aws-cdk-lib 2.238.0
- [Phase 2 - resolved]: OIDC subject claim `repo:rainhead/beeatlas:*` confirmed correct format via synth output

## Session Continuity

Last session: 2026-02-21
Stopped at: Completed 03-02-PLAN.md (bee-sidebar LitElement + singleclick click-to-detail wiring)
Resume file: None
