---
gsd_state_version: 1.0
milestone: v5.2
milestone_name: Offline Field Mode
status: executing
stopped_at: Phase 165 context gathered
last_updated: "2026-06-24T21:25:54.740Z"
last_activity: 2026-06-24 -- Phase 165 planning complete
progress:
  total_phases: 23
  completed_phases: 19
  total_plans: 45
  completed_plans: 41
  percent: 83
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-24 — v5.2 Place Coverage Expansion shipped)

**Core value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.
**Current focus:** Phase 164 — sidebar-list-ignores-src-source-filter

## Current Position

Phase: 164 (sidebar-list-ignores-src-source-filter) — EXECUTING
Plan: 1 of 1
Status: Ready to execute
Last activity: 2026-06-24 -- Phase 165 planning complete

## Milestone Overview

**No active milestone.** v5.2 Place Coverage Expansion (Phases 160–162) shipped and archived 2026-06-24 — see [milestones/v5.2-ROADMAP.md](milestones/v5.2-ROADMAP.md) and MILESTONES.md. The 145–162 working set is fully closed.

Three backlog items were promoted to active (milestone TBD) on 2026-06-24: **Phase 163** (Ecdysis auth-session fix — ⚠ BLOCKS NIGHTLY, gated on an Ecdysis dataset-44 account), **Phase 164** (sidebar `src=` filter bug), **Phase 165** (duplicate occ_id rows). Next: plan Phase 163 first (it blocks the nightly), or start a new milestone with `/gsd-new-milestone`. Remaining backlog: federal wilderness areas as regions (999.11), Safari private-browsing offline UI (999.7).

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
- [Phase ?]: [Phase 160] Place bridge keyed on synthetic occ_id (Option B): occurrence_places (occ_id, place_slug); occ_id CASE mirrors src/occurrence.ts occIdFromRow priority
- **[Phase 160-02]** Bridge parquet resolved as a sibling of `src_parquet` (`src_parquet.parent / "occurrence_places.parquet"`) in sqlite_export.py — no new injectable arg; run.py copy loop lands both occurrences + bridge in EXPORT_DIR. occurrences mart contract is 36 cols after dropping place_slug (CONTEXT's "33→32" was an estimate); the dbt contract gate enforces it. occurrences.db ships an indexed `occurrence_places(place_slug, occ_id)` table; both JS table whitelists list it.
- [Phase ?]: 160-03: per-place counts and SVG points are bridge-driven via occurrences JOIN occurrence_places on synthetic occ_id; multi-place occurrences double-count by design (D-05)
- [Phase ?]: 160-04: place filter resolves by occurrence_places EXISTS membership; place_slug removed from frontend OccurrenceRow/OCCURRENCE_COLUMNS
- [Phase ?]: 160-04 D-04: member-place names resolved in bee-atlas (state owner) and passed down to bee-occurrence-detail as a property (state-ownership invariant)
- **[Phase 162-02]** `snoqualmie-pass-to-olallie-meadow-trail` deferred (2026-06-23): OSM only has the full PCT Section J (~75 km relation 1296807), which over-claims ~9× vs the ~8 km day-hike. Needs hand-traced GPX to Olallie Meadow turnaround. 13 hike corridors shipped instead of 14.
- **[Phase 162-02]** `tol=0.0002°` (~22 m) ratified for hike corridor simplification: 13 corridors add +24 KB (895→920 KB), well under 1 MB cap. `geyser-valley-trail` accepted as-is (OSM way 261478799).

### Pending Todos

- `144-code-review-deferred.md` — WR-04 (CSV-export `rows[0]` headers) + 3 info findings; non-blocking, promote into a future milestone.

### Blockers/Concerns

None open.

## Deferred Items

Acknowledged at v5.2 milestone close (2026-06-24): the open-artifact audit showed 12 items, **all verified non-blocking** — the 10 UAT "gaps" (incl. 160/161/162) are all `passed`/`approved` with 0 pending scenarios (flagged only because status ≠ literal "complete"); the 1 todo is the pre-existing 144 deferral below; Phase 162's "open questions" are the CONTEXT `<open_questions>` section already resolved by 162-RESEARCH.md. Plus: `snoqualmie-pass-to-olallie-meadow-trail` deferred (needs hand-traced GPX), and Phase 162's OSM geometry-assembly paths lack a direct regression test (162 code-review IN-05).

Carried forward (originally acknowledged at v5.1 close 2026-06-23):

| Category | Item | Status |
|----------|------|--------|
| todo | `144-code-review-deferred.md` | open — non-blocking, pre-existing (WR-04 CSV headers + 3 info) |
| uat | Phases 149/151/152/153/154/155/157 HUMAN-UAT.md | passed/approved, 0 pending scenarios — flagged by audit only because status ≠ literal "complete" (not real gaps) |
| nyquist | Phases 129/131/132/134/135/136/138 partial Nyquist | accepted (carried from v4.x) |
| verification | Phase 110/111/113 VERIFICATION.md | human_needed (carried from v4.0) |
| uat | Phase 110 HUMAN-UAT.md | partial — 2 open scenarios (carried from v4.0) |

## Session Continuity

Last session: 2026-06-24T20:33:49.519Z
Stopped at: Phase 165 context gathered
Resume file: .planning/phases/165-duplicate-occurrence-rows-shared-occ-id/165-CONTEXT.md

## Operator Next Steps

1. **Push** when ready: `git push origin main && git push origin v5.2` (main is ahead of origin/main; v5.2 work — 160–162 — is unpushed).
2. Start the next milestone with `/gsd-new-milestone`, or promote a backlog item with `/gsd-review-backlog` (999.11 federal wilderness areas is the natural next place-source, reusing the 161/162 curation pattern).
