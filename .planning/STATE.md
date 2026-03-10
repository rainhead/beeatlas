# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-25)

**Core value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.
**Current focus:** Phase 07 — URL Sharing

## Current Position

Phase: 07-url-sharing
Plan: 1 of 1
Status: Plan 07-01 complete
Last activity: 2026-03-09 — URL state synchronization implemented (NAV-01)

Progress: [##########] Phase 07 complete (1/1 plans)

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
| 07-url-sharing | 1 | 3 min | 3 min |

*Updated after each plan completion*

## Accumulated Context

### Decisions

All v1.0 decisions logged in PROJECT.md Key Decisions table.

Key context for v1.1 (iNat Sample Markers):
- iNat observations are of host plants made in the field; they appear hours-to-days before specimens arrive in Ecdysis
- Specimen count is stored as an iNat observation field filled in by the collector (usually same day or next day)
- Ecdysis HTML scraping (to link specimens → iNat observations) deferred to v1.2; v1.1 only queries iNat API
- Verify `place_id=82` for Washington State in iNaturalist before pipeline implementation

### Phase 07 Decisions (URL Sharing)

- Query string params (not hash): x/y/z for view, taxon/taxonRank/yr0/yr1/months/o for filters
- replaceState on every moveend + 500ms debounced pushState avoids history explosion
- _isRestoringFromHistory flag prevents feedback loops between popstate and moveend
- Lit updated() pattern in BeeSidebar to apply parent-pushed restore properties to internal @state fields
- DEFAULT_LON=-120.5, DEFAULT_LAT=47.5, DEFAULT_ZOOM=7 for Washington State default view

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-09 (Phase 07 URL sharing implemented)
Stopped at: Completed 07-01-PLAN.md — URL state synchronization (NAV-01)
Resume file: None
