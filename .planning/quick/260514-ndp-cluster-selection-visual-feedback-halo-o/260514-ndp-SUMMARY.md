---
id: 260514-ndp
title: Cluster selection visual feedback (halo overlay layer)
status: complete
completed: 2026-05-14
duration_minutes: ~5
files_modified:
  - src/bee-map.ts
  - src/tests/bee-atlas.test.ts
commits:
  - c20c43a: "feat(bee-map): add cluster selection halo overlay layer (Task 1)"
  - f7b599b: "test(bee-map): HALO-01 static-grep tests for cluster halo (Task 2)"
---

# 260514-ndp: Cluster selection visual feedback (halo overlay layer) — Summary

## One-liner

Yellow halo ring around any rendered cluster blob whose leaves intersect
`selectedOccIds`, recomputed reactively on selection / pan-zoom / cluster
re-aggregation with rAF coalescing and a `_haloGeneration` race guard.

## What changed

### Task 1 — `src/bee-map.ts` (commit c20c43a)

- Added `selected-cluster-halo` GeoJSON source (initially empty FeatureCollection)
  and a circle layer of the same id, inserted in the `map.on('load')` block
  immediately after the existing `selected-ring` layer.
- Halo paint mirrors the selected-ring stroke (`#f1c40f`, transparent fill,
  width 2.5). Radius uses a step expression on `leaf_count` keyed to the
  cluster blob's own radius step (`14, 16, 20, 26`) plus ~4px padding
  (`18, 20, 24, 30`).
- Added private fields:
  - `_haloGeneration: number = 0` — race-guard counter (mirrors the
    `_filterQueryGeneration` pattern in `<bee-atlas>`).
  - `_haloRafToken: number | null = null` — coalesces multiple triggers
    within a single animation frame.
- Added `_scheduleHaloRecompute()` — schedules `_recomputeHalo()` on the
  next animation frame; no-ops if a token is already in flight.
- Added async `_recomputeHalo()`:
  - Short-circuits to an empty FeatureCollection if `selectedOccIds` is
    null or empty.
  - Captures generation, calls `querySourceFeatures('occurrences', { filter:
    ['has', 'point_count'] })` to enumerate currently-rendered clusters.
  - Dedupes by `cluster_id` (tile-boundary duplication is real).
  - For each unique cluster, awaits `getClusterLeaves` wrapped in a Promise,
    mirroring `_handleClusterClick` (`bee-map.ts:732`).
  - After `Promise.all` settles, bails if generation has advanced
    (race guard) or if the halo source has been removed (component unmount).
  - For each cluster whose leaves include any selected `occId`, emits
    `{ geometry: cluster.geometry, properties: { cluster_id, leaf_count } }`.
  - Calls `setData` on the halo source with the resulting FeatureCollection.
- Wired three triggers:
  1. `updated()` — when `selectedOccIds` changes, calls
     `_scheduleHaloRecompute()` after `_applySelection()`.
  2. `map.on('moveend', ...)` — added a halo recompute call alongside the
     existing `view-moved` emission.
  3. `map.on('sourcedata', ...)` — filtered to
     `e.sourceId === 'occurrences' && e.isSourceLoaded`, registered inside
     the `load` handler (after the halo source/layer are added).
- Added an explicit `_scheduleHaloRecompute()` call at the bottom of the
  `load` handler so URL-restored selections paint on first render.
- `disconnectedCallback` now cancels any pending rAF token.
- The `speicmenLayer` typo at `bee-map.ts:70` is left untouched per the
  CLAUDE.md project invariant.

### Task 2 — `src/tests/bee-atlas.test.ts` (commit f7b599b)

- Extended the mapbox-gl mock with `querySourceFeatures: vi.fn(() => [])`
  so any reachable `_recomputeHalo` path does not throw under unit tests.
- Added a new `describe('HALO-01: cluster selection halo layer
  (260514-ndp)', ...)` block with seven static-grep assertions over
  `bee-map.ts` source:
  1. `addSource('selected-cluster-halo', ...)` is present.
  2. `id: 'selected-cluster-halo'` is present (in the `addLayer` call).
  3. `_haloGeneration` race-guard counter exists.
  4. `_haloRafToken` and `requestAnimationFrame` both exist.
  5. `moveend` listener and `_scheduleHaloRecompute` both present.
  6. Halo layer block (anchored to its `id:`) uses
     `circle-stroke-color: '#f1c40f'`, matching `selected-ring`.
  7. Halo `addSource('selected-cluster-halo'` appears strictly after the
     `this._map.on('load'` handler (sanity: not at top level).

## ARCH invariant compliance

- **State ownership** (CLAUDE.md): the new halo source/layer + scheduler
  live entirely inside `<bee-map>`, driven by the `selectedOccIds`
  property. No new module-level mutable state. `<bee-atlas>` unchanged.
- **Style cache**: this plan uses Mapbox GL JS, not OpenLayers — paint
  expressions are evaluated per-frame against source data. There is no
  JS style-function cache to invalidate (style-cache invariant is
  OL-specific and pre-v3.0).
- **Race guard**: `_haloGeneration` mirrors the `_filterQueryGeneration`
  pattern in `<bee-atlas>` — `Promise.all` results are discarded when a
  newer recompute supersedes them.

## Verification

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | clean (exit 0) |
| `npm test -- src/tests/bee-atlas.test.ts --run` | 36/36 pass (29 prior + 7 new HALO-01) |
| `npm test` (full suite) | 339 pass, 4 skipped, 2 pre-existing env failures |
| `npm run build` (`validate-species → typecheck → eleventy → bundle-size`) | validate-species + typecheck pass; eleventy fails on missing `public/data/species.json` |
| Manual visual checks (7 from PLAN) | NOT performed — requires `npm run dev` against live data, not available in worktree |

### Pre-existing test failures (out of scope)

Two test files fail because `public/data/species.json` is absent in the
worktree (data is created only by the nightly pipeline / `cd data && uv run
python run.py` locally — not by the test environment). These predate this
change; verified `public/data/` does not exist in the worktree.

- `src/tests/data-species.test.ts` — `_data/species.js:22` ENOENT on
  `public/data/species.json`.
- `src/tests/build-output.test.ts` — `execSync('npm run build')` fails on
  the same ENOENT (Eleventy stage).

### Build status (out of scope)

`npm run build` fails at the Eleventy stage on the same missing
`public/data/species.json`. The relevant gates for this plan
(`validate-species` + `typecheck`) both pass cleanly. CI will pass once
the data files are produced by the nightly pipeline (`data/nightly.sh`
fetches from S3 before the build).

## Manual visual verification — pending

The seven visual checks in the PLAN require `npm run dev` against live
data and cannot be executed inside this worktree (no `public/data/`).
They should be performed before shipping:

1. Click a cluster blob — yellow halo appears around it; sidebar opens.
2. Click an unclustered point — yellow `selected-ring` on the dot;
   no halo.
3. Pan the map so the selected cluster scrolls off-screen, then back —
   halo reappears on the same/re-aggregated cluster.
4. Zoom past `clusterMaxZoom: 14` — cluster expands; halo disappears;
   `selected-ring` appears on each leaf still in `selectedOccIds`.
5. Apply a filter that excludes the selected occurrences — halo updates
   (likely empties).
6. Click empty map (deselect) — halo disappears immediately.
7. Reload from a URL with selection state — halo paints on first render
   (covers the explicit `_scheduleHaloRecompute()` at the bottom of the
   `load` handler).

## Deviations from PLAN

None of substance. Two minor implementation notes:

- The PLAN suggested registering the `moveend` halo trigger as a
  *separate* `this._map.on('moveend', ...)` listener "alongside current
  code." I instead added the halo recompute call inside the existing
  `moveend` listener (which already emits `view-moved`). Functionally
  equivalent; one fewer listener registration.
- The PLAN suggested wiring the `sourcedata` listener "in `firstUpdated`
  / `updated` alongside current code." I registered it inside the `map.on
  ('load', ...)` callback (after the halo source/layer are added) so the
  source exists before the first event can fire. This matches the PLAN's
  later constraint that the source/layer are added in the load block.

## Out of scope (confirmed)

Per the PLAN's "Out of scope" list:

- Auto-zoom on cluster click (rejected approach #1) — not added.
- `clusterProperties` aggregator with selection state (rejected #2) — not added.
- Sidebar pulse animation (rejected #4) — not added.
- Cluster click semantics unchanged (still emits `map-click-occurrence`
  with all leaves; no zoom).
- Unclustered `selected-ring` layer untouched.
- `_applySelection()` semantics unchanged for unclustered points.
- `speicmenLayer` typo at `bee-map.ts:70` not fixed (project invariant).
- Per-cluster halo intensity proportional to selected-leaf-count — not
  added; uses total `leaf_count` for radius scaling as specced.

## Self-Check

- src/bee-map.ts diff present in c20c43a: `git show --stat c20c43a` confirms 1 file, +165 lines.
- src/tests/bee-atlas.test.ts diff present in f7b599b: `git show --stat f7b599b` confirms 1 file, +50 lines.
- Commit c20c43a found: yes.
- Commit f7b599b found: yes.

## Self-Check: PASSED
