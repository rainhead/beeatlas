---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: Offline Field Mode
status: executing
stopped_at: Phase 154 context gathered (re-scoped to ToS-compliant perf cache)
last_updated: "2026-06-21T22:43:33.451Z"
last_activity: 2026-06-21
progress:
  total_phases: 17
  completed_phases: 11
  total_plans: 27
  completed_plans: 27
  percent: 65
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-09 — v4.10 Housekeeping shipped)

**Core value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.
**Current focus:** Phase 999.1 — surface-shift-drag-rectangle-selection-in-ui

## Current Position

Phase: 999.1
Plan: Not started
Status: Executing Phase 999.1
Last activity: 2026-06-21

Progress: [██████████] 100%

## Milestone Overview

**v5.0 Offline Field Mode — Phases 147–154** (in progress, opened 2026-06-10)

8 phases, 24 v1 requirements (ROUTE/PWA/OFF/CACHE/LOC/NEAR/TILE). Offline-capable installable PWA dogfooded behind `/app`; current-location indicator with "near me" filter.

Build order:

- 147 SW topology → 148 app shell → 149 data caching → 150 freshness UX → 151 installability
- 152 GeolocateControl (independent after 147; can parallel with 148–151)
- 153 Near me (requires 152)
- 154 Tile caching (independent, TOS-gated, flag-off)

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

### Research Flags (carry forward to implementation)

- **Phase 153 (near me):** Run `SELECT sin(1.0)` in the wa-sqlite worker before writing haversine. If trig is unavailable (expected per ARCHITECTURE doc), use bbox SQL pre-filter + JS haversine.
- **Phase 154 (tile caching):** Inspect Mapbox tile CORS mode in DevTools. Opaque responses cost ~7 MB each in Storage Quota — set `maxEntries` very conservatively if tiles are opaque.
- **Phase 152 (geolocation):** iOS standalone-mode geolocation permission requires real-device test; simulators are not reliable.

### Pending Todos

- `144-code-review-deferred.md` — WR-04 (CSV-export `rows[0]` headers) + 3 info findings; non-blocking, promote into a future milestone.

### Blockers/Concerns

None open.

## Deferred Items

Carried from v4.10 close:

| Category | Item | Status |
|----------|------|--------|
| todo | `144-code-review-deferred.md` | open — non-blocking, pre-existing |
| nyquist | Phases 129/131/132/134/135/136/138 partial Nyquist | accepted |
| verification | Phase 110/111/113 VERIFICATION.md | human_needed (v4.0) |
| uat | Phase 110 HUMAN-UAT.md | partial — 2 open scenarios (v4.0) |

## Session Continuity

Last session: 2026-06-21T22:43:33.441Z
Stopped at: Phase 154 context gathered (re-scoped to ToS-compliant perf cache)
Resume file: .planning/phases/154-mapbox-tile-caching-tos-gated/154-CONTEXT.md
