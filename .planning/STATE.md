---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: URL Sharing
status: verifying
stopped_at: Completed 07-05-PLAN.md — all 7 URL-sharing scenarios verified; NAV-01 satisfied
last_updated: "2026-03-10T05:36:59.553Z"
last_activity: 2026-03-09 — Browser verification complete; all scenarios A-G pass; NAV-01 fully satisfied
progress:
  total_phases: 1
  completed_phases: 1
  total_plans: 5
  completed_plans: 5
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-25)

**Core value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.
**Current focus:** Phase 07 — URL Sharing (complete)

## Current Position

Phase: 07-url-sharing
Plan: 5 of 5 (all plans complete)
Status: Phase complete — all 7 browser verification scenarios pass, NAV-01 fully satisfied
Last activity: 2026-03-09 — Browser verification complete; all scenarios A-G pass; NAV-01 fully satisfied

Progress: [##########] Phase 07 complete (5/5 plans) — NAV-01 fully satisfied

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
| 07-url-sharing | 5 | ~15 min | ~3 min |

*Updated after each plan completion*
| Phase 07-url-sharing P03 | 1m | 1 tasks | 1 files |
| Phase 07-url-sharing P04 | 2min | 1 tasks | 1 files |
| Phase 07-url-sharing P05 | 5min | 2 tasks | 0 files |

## Accumulated Context

### Decisions

All v1.0 decisions logged in PROJECT.md Key Decisions table.

Key context for v1.1 (iNat Sample Markers):
- iNat observations are of host plants made in the field; they appear hours-to-days before specimens arrive in Ecdysis
- Specimen count is stored as an iNat observation field filled in by the collector (usually same day or next day)
- Ecdysis HTML scraping (to link specimens → iNat observations) deferred to v1.2; v1.1 only queries iNat API
- Verify `place_id=82` for Washington State in iNaturalist before pipeline implementation
- [Phase 07-url-sharing]: map.once('moveend') resets _isRestoringFromHistory after OL programmatic view change; synchronous fallback for no-view-change case
- [Phase 07-url-sharing]: occurrenceIds: string[] (not string | null) in ParsedParams — empty array avoids null checks at call sites
- [Phase 07-url-sharing]: Initial replaceState now preserves o= by passing initialParams.occurrenceIds to buildSearchParams
- [Phase 07-url-sharing]: NAV-01 declared complete after all 7 browser verification scenarios passed in sequential human review

### Phase 07 Decisions (URL Sharing)

- Query string params (not hash): x/y/z for view, taxon/taxonRank/yr0/yr1/months/o for filters
- replaceState on every moveend + 500ms debounced pushState avoids history explosion
- _isRestoringFromHistory flag prevents feedback loops between popstate and moveend
- Lit updated() pattern in BeeSidebar to apply parent-pushed restore properties to internal @state fields
- DEFAULT_LON=-120.5, DEFAULT_LAT=47.5, DEFAULT_ZOOM=7 for Washington State default view

### Pending Todos

None — Phase 07 complete.

### Blockers/Concerns

None — NAV-01 fully met. All URL-sharing scenarios verified passing.

## Session Continuity

Last session: 2026-03-09T00:00:00.000Z
Stopped at: Completed 07-05-PLAN.md — all 7 URL-sharing scenarios verified; NAV-01 satisfied
Resume file: None
