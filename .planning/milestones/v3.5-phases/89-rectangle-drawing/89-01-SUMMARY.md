---
phase: 89-rectangle-drawing
plan: "01"
subsystem: frontend
tags: [gesture, mapbox, selection, rectangle, lit, custom-event]
dependency_graph:
  requires: []
  provides:
    - "selection-drawn CustomEvent with { west, south, east, north } from bee-map"
    - "_selectionBounds @state() field in bee-atlas receiving selection bounds"
    - "shift-drag rectangle gesture with .selection-box overlay in bee-map"
  affects:
    - "src/bee-map.ts"
    - "src/bee-atlas.ts"
    - "src/tests/bee-atlas.test.ts"
tech_stack:
  added: []
  patterns:
    - "Canvas capture-phase mousedown for gesture interception (Mapbox official pattern)"
    - "Absolutely-positioned overlay div in getCanvasContainer() for rectangle visual"
    - "Static-grep Vitest describe blocks for architectural assertion"
key_files:
  created: []
  modified:
    - src/bee-map.ts
    - src/bee-atlas.ts
    - src/tests/bee-atlas.test.ts
decisions:
  - "@ts-ignore on _selectionBounds to satisfy noUnusedLocals until Phase 90 reads the field"
  - "_clickConsumed = true in _onRectMouseDown prevents map-click-empty on sub-threshold shift-drags"
metrics:
  duration: "~20 minutes"
  completed: "2026-05-15"
  tasks_completed: 4
  files_changed: 3
requirements-completed: [SEL-01, SEL-02]
---

# Phase 89 Plan 01: Rectangle Drawing Summary

## One-Liner

Shift-drag rectangle gesture in bee-map.ts via Mapbox official boxZoom/dragPan/overlay-div pattern, wired to _selectionBounds state in bee-atlas.ts via selection-drawn CustomEvent.

## What Was Built

Three files modified to implement the shift-drag rectangle drawing gesture:

**src/bee-map.ts** — gesture handlers, CSS, boxZoom disable, disconnectedCallback cleanup:
- `boxZoom.disable()` at map init (before `this._map.on('load', ...)`) to suppress Mapbox's default shift-drag zoom
- Canvas `mousedown` listener registered in capture phase (`addEventListener('mousedown', this._onRectMouseDown, true)`)
- `_rectStart: mapboxgl.Point | null` and `_rectBox: HTMLDivElement | null` private fields
- `_onRectMouseDown` arrow handler: guards with `e.shiftKey && e.button === 0`, sets `_clickConsumed = true`, disables dragPan, sets crosshair cursor, registers document mousemove/mouseup
- `_onRectMouseMove` arrow handler: lazy-creates `.selection-box` div in `getCanvasContainer()`, updates transform/width/height to track drag rectangle in real time
- `_onRectMouseUp` arrow handler: delegates to `_rectFinish`
- `_rectFinish` regular method: cleans up document listeners, removes overlay div, re-enables dragPan, restores cursor, applies 5px threshold guard, calls `map.unproject()` for SW/NE corners with Y-axis inversion (`[minX, maxY]` → SW, `[maxX, minY]` → NE), emits `selection-drawn` event
- `_mousePos` regular method: converts `MouseEvent.clientX/clientY` to map-relative pixel `mapboxgl.Point`
- `.selection-box` CSS rule in `static styles`: blue border, faint fill, `pointer-events: none`, `position: absolute`, `top: 0; left: 0`
- `disconnectedCallback`: removes canvas `mousedown` listener (with `true` capture arg) and document mousemove/mouseup listeners before existing cleanup

**src/bee-atlas.ts** — `_selectionBounds` state and event binding:
- `@state() private _selectionBounds: { west: number; south: number; east: number; north: number } | null = null` added after `_tableFilterOpen`
- `@selection-drawn=${this._onSelectionDrawn}` event binding on `<bee-map>` in `render()`
- `_onSelectionDrawn(e: CustomEvent<...>)` handler stores `e.detail` in `_selectionBounds`

**src/tests/bee-atlas.test.ts** — SEL-01 and SEL-02 static-grep describe blocks:
- SEL-01: 5 tests asserting boxZoom.disable(), capture-phase mousedown, selection-drawn emission, dragPan disable/enable, shiftKey && button===0 guard
- SEL-02: 5 tests asserting selection-box className, getCanvasContainer().appendChild, _rectBox.remove(), .selection-box CSS rule, dx < 5 && dy < 5 threshold guard

## Verification Results

**Static-grep gate:** `npm test -- --run` — SEL-01 and SEL-02 (10 tests total) all PASS GREEN. Full suite: 349 passed, 4 skipped, 2 pre-existing file failures (data-species.test.ts: missing public/data/species.json; build-output.test.ts: 4 skipped). No regressions.

**Type gate:** `npx tsc --noEmit` exits 0.

**Build gate:** Cannot run in worktree environment — `public/data/` is gitignored and the pipeline-generated data files (`species.json`, `occurrences.parquet`, etc.) are absent from the worktree. This is a pre-existing constraint not caused by this plan's changes. The main repo build passes (confirmed by CI on main branch).

**Task 4 (human-verify):** Auto-approved in --auto mode. Browser verification of visual rectangle drawing, event emission, and dragPan re-enable is deferred to the user.

## TDD Gate Compliance

The TDD cycle was followed:
1. `test(89-01): add failing SEL-01 and SEL-02 static-grep describe blocks` — RED gate commit `8c2d5a8`
2. `feat(89-01): implement shift-drag rectangle gesture in bee-map.ts` — GREEN gate commit `d7a19c9`
3. No REFACTOR commit needed — implementation was clean on first pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] @ts-ignore for _selectionBounds**
- **Found during:** Task 3
- **Issue:** `noUnusedLocals: true` in tsconfig.json caused a TS6133 error because `_selectionBounds` is declared but not yet read (Phase 90 will consume it). The plan specified Phase 89 should only declare and assign the field.
- **Fix:** Added `// @ts-ignore -- intentionally unused until Phase 90 wires the SQLite bounds query` above the field declaration, matching the existing `speicmenLayer` pattern in `bee-map.ts`.
- **Files modified:** `src/bee-atlas.ts`
- **Commit:** `71cb47f`

No other deviations. Plan executed per `89-RESEARCH.md` and `89-01-PLAN.md` specifications.

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| `@ts-ignore` on `_selectionBounds` | `noUnusedLocals: true` rejects Phase-89-only state fields that Phase 90 will consume; this matches the existing `speicmenLayer` precedent in bee-map.ts |
| `_clickConsumed = true` set before dragPan.disable() in _onRectMouseDown | Pitfall 5 from RESEARCH.md: prevents map-click-empty from firing on sub-threshold shift-drags that don't exceed the 5px emission threshold |

## Lookahead: What Phase 90 Inherits

Phase 90 (occurrence query + sidebar) inherits:

1. **`_selectionBounds` reactive state in `bee-atlas.ts`** — typed as `{ west: number; south: number; east: number; north: number } | null`, already initialized to `null`. Phase 90 reads this to pass bounds to `queryVisibleIds` / `buildFilterSQL`.

2. **`selection-drawn` CustomEvent contract** — emitted by `bee-map._rectFinish()` with `{ west, south, east, north }` in WGS84 geographic coordinates. Phase 90 wires the SQLite query in `_onSelectionDrawn` where the Phase 90 comment placeholder currently lives.

3. **`_onSelectionDrawn` handler stub** in `bee-atlas.ts` — single-assignment body with `/* Phase 90: ... */` comment. Phase 90 expands this to call `queryVisibleIds` with bounds and open the sidebar.

## Known Stubs

- `_onSelectionDrawn` in `src/bee-atlas.ts`: stores `e.detail` in `_selectionBounds` but performs no query. The Phase 90 comment is explicit. This is intentional per plan scope.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. The `selection-drawn` event carries geographic bounds (not PII or auth data). All threats assessed and accepted per the plan's STRIDE threat register (T-89-01 through T-89-04).

## Self-Check: PASSED

Files created/modified exist:
- FOUND: src/bee-map.ts
- FOUND: src/bee-atlas.ts
- FOUND: src/tests/bee-atlas.test.ts
- FOUND: .planning/phases/89-rectangle-drawing/89-01-SUMMARY.md

Commits exist:
- FOUND: 8c2d5a8 (test: SEL-01 and SEL-02 failing blocks)
- FOUND: d7a19c9 (feat: gesture handlers in bee-map.ts)
- FOUND: 71cb47f (feat: _selectionBounds and handler in bee-atlas.ts)
