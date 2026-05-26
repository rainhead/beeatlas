---
phase: 119-map-display-source-filter-detail-view
plan: 03
subsystem: ui
tags: [mapbox, lit, source-filter, color-paint, reactive-property]

# Dependency graph
requires:
  - phase: 119-01
    provides: MAP-01/MAP-02 tests (RED) for bee-map.ts source-inspection
provides:
  - "Amber #e8a020 circle-color for inat_obs in unclustered-point layer (MAP-01)"
  - "hiddenSources @property on bee-map with _applySourceFilter() via Mapbox setFilter (MAP-02 map side)"
affects:
  - 119-06 (bee-atlas wires hiddenSources binding to bee-map)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "case-outer-match-inner Mapbox expression pattern: case on source check wraps existing match on recencyTier; case must be outermost to prevent recency color overriding source color"
    - "setFilter-based source visibility: _applySourceFilter() uses Mapbox setFilter synchronously (no setData, no SQL); empty hiddenSources restores the default expression exactly"

key-files:
  created: []
  modified:
    - src/bee-map.ts

key-decisions:
  - "case expression is outermost in circle-color: inat_obs source check fires first, recencyTier match is the default fallback — prevents recency color overriding amber"
  - "Empty hiddenSources restores exact default filter ['!', ['has', 'point_count']] to preserve pre-Phase-118 31-col parquet behavior where source is null"

patterns-established:
  - "getLayer guard pattern: _applySourceFilter() returns early if unclustered-point layer not yet added (mirrors _applySelection pattern)"
  - "Initial state on load: check property.size > 0 before calling filter method inside _map.on('load') callback"

requirements-completed: [MAP-01, MAP-02]

# Metrics
duration: 8min
completed: 2026-05-26
---

# Phase 119 Plan 03: Map Source Paint + Filter Summary

**Amber #e8a020 circle-color for inat_obs via case-outer expression + hiddenSources reactive property with synchronous Mapbox setFilter**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-26T06:06:00Z
- **Completed:** 2026-05-26T06:14:09Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- iNat obs points render amber (#e8a020) — case expression wraps existing recencyTier match, source check fires first
- hiddenSources reactive @property (default empty Set) wired to _applySourceFilter() via updated() hook
- Empty Set restores exact default filter, preserving pre-Phase-118 31-col parquet rendering (null source)
- Initial filter applied in _map.on('load') if hiddenSources.size > 0 at load time

## Task Commits

Each task was committed atomically:

1. **Task 1: Add amber paint for source=inat_obs** - `3865dc0` (feat)
2. **Task 2: Add hiddenSources property + _applySourceFilter()** - `c8f9977` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/bee-map.ts` - Amber circle-color case expression + hiddenSources @property + _applySourceFilter() method

## Decisions Made
- case expression is outermost in circle-color so inat_obs source check fires before recencyTier match
- Empty hiddenSources restores `['!', ['has', 'point_count']]` exactly (not `undefined`) to preserve null-source behavior
- hiddenSources placed after showChecklist in @property declarations for readability

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## Self-Check

- [x] src/bee-map.ts exists and contains #e8a020, 'case', _applySourceFilter
- [x] Commits 3865dc0 and c8f9977 exist
- [x] MAP-01 tests green (3 pass)
- [x] No previously-passing tests regressed
- [x] npx tsc --noEmit exits 0

## Self-Check: PASSED

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. hiddenSources values flow to Mapbox setFilter as a typed literal array — no SQL injection surface (T-119-04 mitigated per plan threat model; upstream bee-atlas Plan 119-06 enforces allowlist typing).

## Next Phase Readiness
- MAP-01 fully satisfied: amber paint wired into Mapbox layer
- MAP-02 map side satisfied: hiddenSources property ready to receive binding from bee-atlas (Plan 119-06)
- Remaining MAP-02 tests (bee-atlas _hiddenSources, bee-pane source toggle) stay red until Plans 119-05/119-06 land

---
*Phase: 119-map-display-source-filter-detail-view*
*Completed: 2026-05-26*
