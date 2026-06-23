# Phase 160: Add WDFW wildlife areas as places - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-22
**Phase:** 160-add-wdfw-wildlife-areas-as-places
**Areas discussed:** Granularity, Overlap resolution, Geometry fidelity
**Areas offered but not selected:** Scope & selection (default accepted: all statewide)

---

## Granularity

| Option | Description | Selected |
|--------|-------------|----------|
| One entry per wildlife area | ~33 entries, each a MultiPolygon over all units; mirrors `rattlesnake-ledge`; ST_Within tags points in any unit | ✓ |
| One entry per unit | ~100+ entries; more granular, more slugs, more overlap risk, longer filter list | |
| Hybrid — split only large/disjoint ones | One-per-area default, break out units case-by-case | |

**User's choice:** One entry per wildlife area.
**Notes:** Combine all of an area's non-contiguous units into a single MultiPolygon (e.g., Oak Creek WA's Cowiche/Cleman Mountain/Naches units → one entry).

---

## Overlap resolution

| Option | Description | Selected |
|--------|-------------|----------|
| Clip WDFW to source | Subtract overlapping existing polygons; existing slugs preserved; needs GIS difference per collision | |
| Skip the WDFW entry | Existing place wins; drop conflicting WDFW area, log as deferred | |
| Curate case-by-case | Decide per collision when validation fails | |

**User's choice:** *(free text)* "I do not expect this to happen. If it does, raise the issue during execution."
**Notes:** No blanket policy. Assume no partial overlaps. If `ST_Overlaps` validation fails during execution, the executor STOPS and raises it to the user rather than auto-clipping/skipping/altering existing entries.

---

## Geometry fidelity

| Option | Description | Selected |
|--------|-------------|----------|
| Simplify for web | Douglas–Peucker ~10–25m up front; tune tolerance in planning | |
| Full fidelity | Exact source boundaries, accept the weight | |
| Simplify display, keep full for join | Two geometry representations; most complex | |

**User's choice:** *(free text)* "Measure weight of full fidelity, simplify for display if necessary."
**Notes:** Store full-fidelity boundaries, measure `places.geojson` weight, simplify for display only if the payload is problematic. Set an objective weight threshold during planning.

---

## Claude's Discretion

- `permits[]` population for WDFW entries (validated but never persisted/exported — low-stakes documentation; populate from Box WDFW permit if readily available, else omit).
- Slug naming convention (lowercase `[a-z0-9-]`, immutable after publish — planner picks exact form).

## Deferred Ideas

- Linear "hikes" as places → Phase 161 (ST_Within can't tag points on a LineString).
- Per-unit granularity (rejected here; revisit if unit-level filtering wanted later).
- Display-vs-join dual geometry (only if measurement forces simplification).
- Other deferred land managers: Columbia Land Trust, Bureau of Reclamation (`project_deferred_places.md`).
