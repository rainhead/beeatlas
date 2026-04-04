# Phase 34: Global State Elimination - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Remove module-level mutable singletons from `filter.ts`, `bee-map.ts`, and `region-layer.ts`. No new user-visible behavior — this is a structural refactor that makes modules importable without side effects, unblocking unit tests in Phase 38.

</domain>

<decisions>
## Implementation Decisions

### filterState destination
- **D-01:** Move `filterState` into `BeeMap` as a plain class property (`this.filterState`). It is a temporary home — Phase 36 will lift it to the `<bee-atlas>` root component. No Lit reactivity needed in this phase; preserve the existing mutation pattern.
- **D-02:** `visibleEcdysisIds` and `visibleSampleIds` (currently exported `let` variables in `filter.ts`) should also move into `BeeMap` as class properties alongside `filterState`. The `setVisibleIds` function becomes unnecessary once callers can write to `this` directly.

### bee-map.ts OL objects
- **D-03:** Move all module-level OL objects into `BeeMap` as class properties: `specimenSource`, `clusterSource`, `specimenLayer`, `sampleSource`, `sampleLayer`, and `dataErrorHandler`. These are already only used inside the class; the move is mechanical.
- **D-04:** These become plain class properties (not `@state()`). They are constructed once and not reassigned after initialization; no reactive tracking needed.

### Scope exclusions
- **D-05:** Immutable style constants at module level (`boundaryStyle`, `selectedBoundaryStyle` in `region-layer.ts`) are NOT in scope — they are constants, not mutable singletons.
- **D-06:** The eager `loadFeatures()` side effect in `region-layer.ts` (lines 62–65) is deferred to Phase 36. It is tightly coupled to root component initialization order and belongs with the `<bee-atlas>` refactor.
- **D-07:** `countySource`, `ecoregionSource`, and `regionLayer` in `region-layer.ts` are deferred to Phase 36 for the same reason — they carry the eager-load side effect and will need to move as a unit.

### Claude's Discretion
- Exact class property declaration style (inline initializer vs. constructor assignment)
- Whether `filter.ts` still exports `FilterState` interface and pure functions (`buildFilterSQL`, `queryVisibleIds`, `isFilterActive`) — these are stateless and should remain as module-level exports
- How `makeRegionStyleFn` in `region-layer.ts` receives `filterState` after the move (e.g., closure over `this.filterState` passed at call site in BeeMap)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source files being refactored
- `frontend/src/filter.ts` — contains `filterState`, `visibleEcdysisIds`, `visibleSampleIds`; pure functions stay
- `frontend/src/bee-map.ts` — `BeeMap` LitElement; OL objects and `dataErrorHandler` move inside
- `frontend/src/region-layer.ts` — style constants and sources; only style constants fully in scope this phase

### Test infrastructure (just established)
- `frontend/src/smoke.test.ts` — trivial harness test from Phase 33; real tests come in Phase 38

No external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `filter.ts` pure functions (`buildFilterSQL`, `queryVisibleIds`, `isFilterActive`, `setVisibleIds`) are stateless and stay as module exports — only the mutable state variables move
- `makeRegionStyleFn` in `region-layer.ts` already accepts a `getBoundaryMode` getter; the same pattern can be used to pass `filterState` without circular imports

### Established Patterns
- `BeeMap` is a LitElement with `@state()` decorators for reactive properties; new class properties for OL objects should be plain (non-reactive)
- TypeScript strict mode throughout — class properties need type annotations

### Integration Points
- `region-layer.ts` currently imports `filterState` directly from `filter.ts`; after the move, BeeMap must supply it via closure when calling `makeRegionStyleFn`
- `bee-sidebar.ts` dispatches filter change events consumed by BeeMap — the mutation site is already in BeeMap, so moving `filterState` there requires no sidebar changes

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

- `countySource`, `ecoregionSource`, `regionLayer`, and eager `loadFeatures()` side effect in `region-layer.ts` — deferred to Phase 36 (`<bee-atlas>` root component)
- Style constants (`boundaryStyle`, `selectedBoundaryStyle`) — immutable, no action needed

</deferred>

---

*Phase: 34-global-state-elimination*
*Context gathered: 2026-04-04*
