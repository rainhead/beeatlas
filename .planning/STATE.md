# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.
**Current focus:** Phase 1 — Pipeline

## Current Position

Phase: 1 of 5 (Pipeline)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-02-18 — Roadmap created; 11 v1 requirements mapped across 5 phases

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: —
- Trend: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Phase 1 and Phase 2 are independent — pipeline and infrastructure can be planned/worked in parallel
- [Roadmap]: iNaturalist host plant pipeline deferred to v2 (PLANT-01, PLANT-02, PLANT-03 are v2 requirements)

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 1]: `data/ecdysis/occurrences.py` has a `pdb.set_trace()` that will hang CI — must be removed before any CI wiring
- [Phase 2]: CDK OAC construct API (`S3BucketOrigin.withOriginAccessControl()`) should be verified against current CDK v2 changelog before writing the stack — MEDIUM confidence from training data
- [Phase 2]: OIDC subject claim format — start with `StringLike` wildcard (`repo:rainhead/beeatlas:*`), tighten after confirming
- [Phase 3]: Verify `place_id=82` for Washington State in iNaturalist before any iNat pipeline work

## Session Continuity

Last session: 2026-02-18
Stopped at: Roadmap created; ready to plan Phase 1
Resume file: None
