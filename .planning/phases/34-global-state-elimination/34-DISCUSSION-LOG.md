# Phase 34: Global State Elimination - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-04
**Phase:** 34-global-state-elimination
**Areas discussed:** filterState destination, bee-map.ts OL objects

---

## filterState destination

| Option | Description | Selected |
|--------|-------------|----------|
| Move into BeeMap as class property | `this.filterState` — natural temporary home; Phase 36 lifts to `<bee-atlas>` | ✓ |
| Keep in filter.ts but unexported | Remove export, BeeMap accesses via getter/setter | |
| Pass as parameter | Local variable in BeeMap; functions receive it as argument | |

**User's choice:** Move into `BeeMap` as a plain class property.
**Notes:** Explicitly a temporary home — Phase 36 will lift to the root component.

---

## bee-map.ts OL objects

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — move all into BeeMap as class properties | specimenSource, clusterSource, specimenLayer, sampleSource, sampleLayer, dataErrorHandler | ✓ |
| No — defer to Phase 36 | OL objects coupled to map lifecycle; belongs with root component refactor | |
| Partial — move only dataErrorHandler | OL layer/source objects are effectively immutable after construction | |

**User's choice:** Yes — move all OL objects into `BeeMap` as class properties.
**Notes:** Mechanical move; these are already only used inside the class.

---

## Claude's Discretion

- Immutable style constants (`boundaryStyle`, `selectedBoundaryStyle`) — not singletons, no action
- `region-layer.ts` eager `loadFeatures()` side effect — deferred to Phase 36
- `countySource`, `ecoregionSource`, `regionLayer` — deferred to Phase 36 as a unit

## Deferred Ideas

- region-layer.ts singleton elimination (countySource, ecoregionSource, regionLayer + side effects) → Phase 36
