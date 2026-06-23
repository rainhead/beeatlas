---
gsd_state_version: 1.0
milestone: v5.1
milestone_name: Housekeeping
status: Awaiting next milestone
stopped_at: Phase 160 context gathered
last_updated: "2026-06-23T04:11:12.346Z"
last_activity: 2026-06-23 — Milestone v5.1 completed and archived
progress:
  total_phases: 17
  completed_phases: 14
  total_plans: 31
  completed_plans: 31
  percent: 82
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-09 — v4.10 Housekeeping shipped)

**Core value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.
**Current focus:** None — 145–159 working set closed. Next: `/gsd-new-milestone` or pull from the 999.x backlog.

## Current Position

Phase: Milestone v5.1 complete
Plan: —
Status: Awaiting next milestone
Last activity: 2026-06-23 — Milestone v5.1 completed and archived

## Milestone Overview

**No active milestone.** v5.1 Housekeeping (Phases 155–159) shipped and archived 2026-06-23 — see [milestones/v5.1-ROADMAP.md](milestones/v5.1-ROADMAP.md) and MILESTONES.md. The 145–159 working set is fully closed.

Next: start a new milestone with `/gsd-new-milestone`, or pull a `999.x` backlog item (WDFW wildlife areas as places, specific-hikes-as-places, Safari private-browsing offline UI).

## Accumulated Context

### Decisions

Load-bearing conventions carried from prior milestones:

- **geo_blob ↔ features.ts positional contract**: `_GEO_COLS` and `features.ts` column indices are positionally coupled; changes ship in one atomic commit.
- **`<bee-atlas>` owns all reactive state**: `<bee-map>` and `<bee-pane>` are pure presenters — LOC-02 must follow this; location state goes on `<bee-atlas>._userLocation`, relayed up via `composed: true` CustomEvent.
- **`_filterQueryGeneration` race guard**: near-me queries will be covered automatically by the existing generation counter; no new guard needed.
- **Style cache bypass**: must bypass when `filterState` is active or `selectedOccIds` non-empty; the near-me filter extends `FilterState` so the bypass rule is inherited.
- **Static hosting only**: no server runtime — SW, manifest, and CDK `no-cache` behavior are the only moving parts.
- **Session-coalesced viewport history (Phase 146)**: `_viewportSessionActive` flag gates pushState vs replaceState; `?near=1` is a non-viewport write that should reset the session flag.
- [Phase ?]: GeolocateControl placement outside load handler
- [Phase ?]: Permission-gated auto-trigger timing
- [Phase ?]: UserLocation state shape
- **[Phase 154] mapbox-basemap StaleWhileRevalidate cache**: access_token retained (§1.1/§2.9.4); events.mapbox.com excluded by hostname; /map-sessions/ excluded by path; 7-day TTL (§2.8.1 ceiling: 30 days). docs/adr/0001-mapbox-basemap-cache.md is the ToS record. Web-SDK offline basemap is NOT licensed.

### Pending Todos

- `144-code-review-deferred.md` — WR-04 (CSV-export `rows[0]` headers) + 3 info findings; non-blocking, promote into a future milestone.

### Blockers/Concerns

None open.

## Deferred Items

Acknowledged at v5.1 milestone close (2026-06-23):

| Category | Item | Status |
|----------|------|--------|
| todo | `144-code-review-deferred.md` | open — non-blocking, pre-existing (WR-04 CSV headers + 3 info) |
| uat | Phases 149/151/152/153/154/155/157 HUMAN-UAT.md | passed/approved, 0 pending scenarios — flagged by audit only because status ≠ literal "complete" (not real gaps) |
| nyquist | Phases 129/131/132/134/135/136/138 partial Nyquist | accepted (carried from v4.x) |
| verification | Phase 110/111/113 VERIFICATION.md | human_needed (carried from v4.0) |
| uat | Phase 110 HUMAN-UAT.md | partial — 2 open scenarios (carried from v4.0) |

## Session Continuity

Last session: 2026-06-23T04:11:12.334Z
Stopped at: v5.2 restructured — overlap-capable place model split out as Phase 160; WDFW renumbered to 161 (researched, blocked on 160); hikes to 162
Resume file: .planning/phases/161-add-wdfw-wildlife-areas-as-places/161-CONTEXT.md

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
