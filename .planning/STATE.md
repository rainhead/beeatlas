# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.
**Current focus:** Phase 1 — Pipeline

## Current Position

Phase: 1 of 5 (Pipeline)
Plan: 1 of TBD in current phase
Status: In progress
Last activity: 2026-02-18 — Completed 01-01 (Fix Ecdysis pipeline); ecdysis.parquet verified with 45754 rows and all 11 PIPE-03 columns

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

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 2]: CDK OAC construct API (`S3BucketOrigin.withOriginAccessControl()`) should be verified against current CDK v2 changelog before writing the stack — MEDIUM confidence from training data
- [Phase 2]: OIDC subject claim format — start with `StringLike` wildcard (`repo:rainhead/beeatlas:*`), tighten after confirming
- [Phase 3]: Verify `place_id=82` for Washington State in iNaturalist before any iNat pipeline work

## Session Continuity

Last session: 2026-02-18
Stopped at: Completed 01-01-PLAN.md (Fix Ecdysis pipeline bugs)
Resume file: None
