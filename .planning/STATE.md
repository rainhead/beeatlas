# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-25)

**Core value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.
**Current focus:** Milestone v1.1 — iNat Sample Markers

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-02-25 — Milestone v1.1 started

Progress: [░░░░░░░░░░] v1.1 not started

## Performance Metrics

**v1.0 Velocity:**
- Total plans completed: 13
- Timeline: 4 days (2026-02-18 → 2026-02-22)

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-pipeline | 1 | 2 min | 2 min |
| 02-infrastructure | 2 | 4 min | 2 min |
| 03-core-map | 3 | 3 min | 1 min |
| 04-filtering | 5 | 13 min | 2.6 min |
| 05-fix-month-offset | 1 | 5 min | 5 min |
| 06-infra03-deployment | 1 | ~30 min | ~30 min |

*Updated after each plan completion*

## Accumulated Context

### Decisions

All v1.0 decisions logged in PROJECT.md Key Decisions table.

Key context for v1.1 (iNat Sample Markers):
- iNat observations are of host plants made in the field; they appear hours-to-days before specimens arrive in Ecdysis
- Specimen count is stored as an iNat observation field filled in by the collector (usually same day or next day)
- Ecdysis HTML scraping (to link specimens → iNat observations) deferred to v1.2; v1.1 only queries iNat API
- NAV-01 URL sharing deferred to v1.2
- Previous URL sync work (commit 43966b1 reverted by 7c44a42) preserved for v1.2 reference
- Verify `place_id=82` for Washington State in iNaturalist before pipeline implementation

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-25 (v1.1 milestone started)
Stopped at: Requirements defined, roadmap creation in progress
Resume file: None
