---
phase: 81-filter-ux-nav
plan: 03
subsystem: species-page-filter-widget
tags: [filter, lit, light-dom, details-popover, FILT-01]
requires:
  - 81-01 (RED test stubs in src/tests/bee-species-filter.test.ts)
provides:
  - BeeSpeciesFilter custom element (`bee-species-filter`)
  - filter-changed CustomEvent contract { counties, ecoregions, monthFrom, monthTo }
affects:
  - none (no existing files modified; Plan 05 will wire to coordinator)
tech-stack:
  added: []
  patterns:
    - light-DOM Lit element (createRenderRoot returns this)
    - native <details>/<summary> popover for accessibility
    - immutable Set replacement on toggle to trigger Lit reactivity
key-files:
  created:
    - src/species/bee-species-filter.ts
  modified: []
decisions:
  - Server emits empty host element; render() defined for client upgrade only (CONTEXT D-03 explicitly accepts no-JS = non-functional filter)
  - Toggle creates new Set instances (rather than mutating in place) so Lit's `=== ` change detection on @property fires re-render
  - _setMonth silently ignores out-of-range values (1..12 enforced by `min`/`max` and JS guard) — no error UI per CONTEXT
metrics:
  duration: ~2 minutes
  completed: 2026-05-04
---

# Phase 81 Plan 03: bee-species-filter Widget Summary

Ship the FILT-01 widget — a light-DOM Lit element exposing county/ecoregion-l3 multi-selects via native `<details>/<summary>` popovers and a month-range pair of `<input type="number">`. Server-rendered as an empty host; render() fills in on Lit upgrade. Plan 05 will wire `filter-changed` to the coordinator's `_geoFilter`/`_seasonFilter` state and URL.

## What Shipped

Single new file: `src/species/bee-species-filter.ts` (145 lines).

- `@customElement('bee-species-filter')` with the six required `@property` declarations: `countyOptions`, `ecoregionOptions`, `selectedCounties`, `selectedEcoregions`, `monthFrom`, `monthTo`.
- Light-DOM via `createRenderRoot()` returning `this`.
- Two `<details>` popovers (county, ecoregion) each containing a `<ul>` of checkbox rows.
- `<div class="month-range">` with two `<input type="number" min="1" max="12">`.
- `_emit()` dispatches `filter-changed` (`bubbles: true, composed: true`) with cloned `Set` instances to keep coordinator state independent of widget internals.

## Tests: RED → GREEN

Plan 01 left these 4 tests failing in `src/tests/bee-species-filter.test.ts`. After this plan:

| Test                                                                              | Outcome  |
| --------------------------------------------------------------------------------- | -------- |
| declares the six @property fields                                                 | GREEN    |
| renders <details><summary> popovers for county and ecoregion (D-03)               | GREEN    |
| toggling a county checkbox dispatches filter-changed CustomEvent                  | GREEN    |
| renders month-range inputs (FILT-01) bound to monthFrom/monthTo                   | GREEN    |

`src/tests/arch.test.ts` (24 tests) stayed GREEN — the new file under `src/species/` does not import any of the ARCH-04-banned modules (`mapbox-gl`, `wa-sqlite`, `../sqlite.ts`, `../filter.ts`, `../bee-map.ts`, `../bee-atlas.ts`, `../url-state.ts`).

Final run: 28/28 passing across both test files.

## Event Shape Emitted

```ts
new CustomEvent('filter-changed', {
  bubbles: true,
  composed: true,
  detail: {
    counties: Set<string>,    // cloned snapshot
    ecoregions: Set<string>,  // cloned snapshot
    monthFrom: number,        // 1..12
    monthTo: number,          // 1..12
  },
})
```

This matches the contract Plan 05 expects when wiring the coordinator.

## Deviations from Plan

None — plan executed exactly as written, including the styling block.

## Self-Check: PASSED

- `src/species/bee-species-filter.ts` — FOUND
- commit `34f5fc5` (feat(81-03): add bee-species-filter widget) — FOUND
- All Plan 03 acceptance grep checks satisfied:
  - `filter-changed` count = 2 (>= 1)
  - `createRenderRoot` count = 1 (>= 1)
  - `render()` count = 1 (>= 1)
  - `<details>` count = 2 (>= 1)
  - forbidden imports count = 0
- `npm test -- --run src/tests/bee-species-filter.test.ts src/tests/arch.test.ts` exited 0 (28 passed)
