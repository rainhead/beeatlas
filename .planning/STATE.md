---
gsd_state_version: 1.0
milestone: v5.1
milestone_name: Place Coverage Expansion
status: verifying
stopped_at: "Phase 162 Plan 02 COMPLETE — 13 hike corridors in places.geojson (920 KB, tol=0.0002°), pipeline green, awaiting operator UAT (map corridors + place filter)."
last_updated: "2026-06-24T00:49:45.334Z"
last_activity: 2026-06-24
progress:
  total_phases: 18
  completed_phases: 17
  total_plans: 39
  completed_plans: 39
  percent: 94
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-09 — v4.10 Housekeeping shipped)

**Core value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.
**Current focus:** Phase 162 — add-specific-hikes-as-places

## Current Position

Phase: 162 (add-specific-hikes-as-places) — COMPLETE (awaiting operator UAT)
Plan: 2 of 2 (all plans complete)
Status: Awaiting operator UAT — map corridors render + place filter returns results
Last activity: 2026-06-24

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

Acknowledged at v5.1 milestone close (2026-06-23):

| Category | Item | Status |
|----------|------|--------|
| todo | `144-code-review-deferred.md` | open — non-blocking, pre-existing (WR-04 CSV headers + 3 info) |
| uat | Phases 149/151/152/153/154/155/157 HUMAN-UAT.md | passed/approved, 0 pending scenarios — flagged by audit only because status ≠ literal "complete" (not real gaps) |
| nyquist | Phases 129/131/132/134/135/136/138 partial Nyquist | accepted (carried from v4.x) |
| verification | Phase 110/111/113 VERIFICATION.md | human_needed (carried from v4.0) |
| uat | Phase 110 HUMAN-UAT.md | partial — 2 open scenarios (carried from v4.0) |

## Session Continuity

Last session: 2026-06-24T00:49:45.326Z
Stopped at: Phase 162 Plan 02 COMPLETE — 13 hike corridors in places.geojson (920 KB), pipeline green; awaiting operator UAT.
Resume file: None

## Operator Next Steps

1. Regenerate local occurrences.db: `cd data && uv run python sqlite_export.py`
2. Hard-reload `/app` and verify:
   - Regions menu shows the 13 new hike corridors
   - Selecting a hike (e.g. `umtanum-creek-canyon-trail`) filters sidebar to ~1,243 occurrences
   - Hike corridor polygons render on the map
3. After UAT passes: run `/gsd-complete-phase 162` and start the next milestone with `/gsd-new-milestone`
