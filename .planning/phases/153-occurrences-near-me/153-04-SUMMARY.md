---
phase: 153-occurrences-near-me
plan: "04"
subsystem: uat
tags: [near-me, uat, human-verify]
status: complete
---

# 153-04 SUMMARY — Human UAT

**Plan:** authored `153-HUMAN-UAT.md` (8 scenarios), then the blocking human-verify checkpoint.

## Outcome: PASS (operator-verified 2026-06-21, desktop/Firefox)

Operator confirmed, interactively:
- The geolocate-crosshair button inside the "County, ecoregion, or place" input.
- The resolved bounds shown **in that input** (not a chip).
- The map **filtering** to in-bounds occurrences (not just the list/table).
- AND-composition with taxon/date filters.
- The Phase 152 denial toast firing on a real permission-denied state (the bug fixed this phase).
- The `?…&sel=…` URL round-trip reproducing the **same occurrences** (map + list) on a fresh load with no GPS — the design-defining behavior.

Scenario 8 (real-device iPhone) DEFERRED to a field trip; does not block the phase goal.

## Defects found and fixed during UAT (post-plan)

The plan execution shipped near-me on the reused `selectionBounds` mechanism, but UAT surfaced two gaps that were fixed inline:

1. **Bounds didn't filter the map** (commit `9957d798`) — the reused shift-drag path only ran the list query; `queryVisibleGeoJSON` didn't accept bounds and `intendedFilterActive` ignored them. Now bounds filter the map + list + table. Also replaced the standalone chip with the bounds shown in the where input (operator UI correction).
2. **Restored `sel=` URL left the map empty** (commit fixing `_onDataLoaded`) — the map query only ran on restore for real filters, never for a restored bounds box. Fixed; two regression tests added.
3. **Worker init-error logging** (commit) — surfaced the real error name+message (was minified `d@blob:…`). The init failure the operator hit was a stale dev-server/vite worker-bundle state, cleared by a dev-server restart — not a code defect (worker/data layer untouched by 153; prod build green).

## Design decision captured

Spatial bounds (near-me + shift-drag) are **filters**; per-record SELECTION (cluster/ids) is unchanged. The clean architectural separation (move bounds off `_selectionBounds`/`sel=`, keep `sel=` for record selection) is **backlog Phase 999.8**. See `project_bounds_are_filter_not_selection` memory.

## State at close
Build green; 792 tests passing. Near-me filter shipped and operator-verified.
