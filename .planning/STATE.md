---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: URL Sharing
status: verifying
stopped_at: Completed 07-03-PLAN.md — back button fix complete
last_updated: "2026-03-10T03:00:21.877Z"
last_activity: 2026-03-10 — URL sharing browser verification; scenarios A-E pass, F and G need gap-closure
progress:
  total_phases: 1
  completed_phases: 0
  total_plans: 5
  completed_plans: 3
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-25)

**Core value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.
**Current focus:** Phase 07 — URL Sharing

## Current Position

Phase: 07-url-sharing
Plan: 2 of 2 (both plans complete)
Status: Plan 07-02 complete — browser verification done, gaps found
Last activity: 2026-03-10 — URL sharing browser verification; scenarios A-E pass, F and G need gap-closure

Progress: [##########] Phase 07 plans complete (2/2 plans) — NAV-01 partially met, gap-closure needed

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
| Phase 07-url-sharing P03 | 1m | 1 tasks | 1 files |

## Accumulated Context

### Decisions

All v1.0 decisions logged in PROJECT.md Key Decisions table.

Key context for v1.1 (iNat Sample Markers):
- iNat observations are of host plants made in the field; they appear hours-to-days before specimens arrive in Ecdysis
- Specimen count is stored as an iNat observation field filled in by the collector (usually same day or next day)
- Ecdysis HTML scraping (to link specimens → iNat observations) deferred to v1.2; v1.1 only queries iNat API
- Verify `place_id=82` for Washington State in iNaturalist before pipeline implementation
- [Phase 07-url-sharing]: map.once('moveend') resets _isRestoringFromHistory after OL programmatic view change; synchronous fallback for no-view-change case

### Phase 07 Decisions (URL Sharing)

- Query string params (not hash): x/y/z for view, taxon/taxonRank/yr0/yr1/months/o for filters
- replaceState on every moveend + 500ms debounced pushState avoids history explosion
- _isRestoringFromHistory flag prevents feedback loops between popstate and moveend
- Lit updated() pattern in BeeSidebar to apply parent-pushed restore properties to internal @state fields
- DEFAULT_LON=-120.5, DEFAULT_LAT=47.5, DEFAULT_ZOOM=7 for Washington State default view

### Pending Todos

- Gap-closure plan needed for NAV-01: fix back button (Scenario F) and o= param (Scenario G)

### Blockers/Concerns

- NAV-01 not fully met: back button non-functional (popstate handler); o= param stripped on load and only one occurrence encoded per cluster click

## Session Continuity

Last session: 2026-03-10T03:00:21.875Z
Stopped at: Completed 07-03-PLAN.md — back button fix complete
Resume file: None
