---
id: 260514-ndp
title: Cluster selection visual feedback (halo overlay layer)
status: planned
files_modified:
  - src/bee-map.ts
  - src/tests/bee-atlas.test.ts
---

# Plan: Cluster selection visual feedback (halo overlay layer)

## Problem

Clicking a cluster blob populates `selectedOccIds` and opens the sidebar but
leaves the cluster blob itself with zero visual indication of selection. The
existing yellow `selected-ring` layer is filtered to unclustered features only
(`['!', ['has', 'point_count']]` — `bee-map.ts:451`) — a deliberate Phase 071
choice to avoid `promoteId` conflicts with cluster auto-IDs. The result is a
correct-but-confusing UX dead-zone on every cluster click.

## Approach (locked: halo overlay layer — alternatives 1, 2, 4 explicitly rejected)

Add a separate non-clustered point source/layer (`selected-cluster-halo`) whose
features are the centroids of any *currently rendered* cluster whose leaves
intersect `selectedOccIds`. The halo is recomputed reactively on three triggers:

1. `selectedOccIds` property changes (selection or deselection).
2. `moveend` (pan/zoom changes which clusters exist and where).
3. `sourcedata` for `occurrences` source (cluster re-aggregation after `setData`
   from `_applyVisibleIds`).

Centroids come straight from the cluster feature's own geometry returned by
`querySourceFeatures` — no extra centroid math needed. Leaf membership uses
`getClusterLeaves(clusterId, point_count, 0, cb)` exactly like the existing
`_handleClusterClick` (`bee-map.ts:732`).

### Why this respects ARCH invariants

- **State ownership** (CLAUDE.md): the new halo source/layer and the recompute
  scheduler live entirely inside `<bee-map>`, driven by the `selectedOccIds`
  *property*. No new module-level mutable state. `<bee-atlas>` is unchanged.
- **Style cache**: Mapbox GL JS evaluates paint expressions per-frame against
  source data — no JS style-function cache to invalidate (this concern is
  OL-specific and pre-v3.0). Halo paint is a static expression on the dedicated
  source.
- **Race guard**: `getClusterLeaves` is async and we may issue many calls per
  recompute. Mirror `bee-atlas`'s `_filterQueryGeneration` pattern with a local
  `_haloGeneration` counter (`bee-map.ts`-private). Each recompute increments
  the counter; in-flight `getClusterLeaves` callbacks compare against the
  current generation and bail if stale. Multiple per-cluster leaf queries
  within one recompute share the same generation token.

### Key technical details

- **Visible-clusters enumeration**: use
  `map.querySourceFeatures('occurrences', { filter: ['has', 'point_count'] })`
  — returns only currently rendered clusters at current zoom, not the whole
  dataset. (`querySourceFeatures` does *not* require the layer to be queryable
  by `queryRenderedFeatures` and dedupes on tile boundaries less reliably; we
  dedupe by `cluster_id` ourselves.)
- **Leaf intersection**: per cluster, call `getClusterLeaves(clusterId,
  point_count, 0, cb)`. Test if any returned leaf's `occId` is in
  `selectedOccIds`. If yes, push `{ geometry: cluster.geometry, properties: {
  cluster_id, leaf_count: point_count } }` to the halo feature list.
- **Coalescing**: a single `_recomputeHalo()` call may be invoked from
  multiple triggers in quick succession (e.g. `moveend` + `sourcedata`).
  Debounce via `requestAnimationFrame` token (`_haloRafToken`) so at most one
  recompute runs per frame.
- **Empty selection short-circuit**: if `selectedOccIds === null || size === 0`,
  immediately set the halo source to an empty FeatureCollection and skip
  enumeration.
- **Halo layer styling**: mirror the existing `selected-ring` (yellow stroke
  `#f1c40f`, `circle-color: transparent`, `circle-stroke-width: 2.5`). Radius
  must wrap the cluster blob, whose radius is `step` of `point_count` from 14
  to 26 (`bee-map.ts:398-404`). Use the same `step` shape plus a fixed
  ~4px halo padding: `['step', ['get', 'leaf_count'], 18, 10, 20, 50, 24, 200, 30]`.
- **Layer order**: insert the halo layer *above* `clusters` and `cluster-count`
  (so the ring is visible around the blob and behind the count label is fine
  too — visually it just needs to surround the blob outline). Add via
  `map.addLayer({...})` with no `beforeId` after `cluster-count` is added, so
  it draws on top.
- **Lifecycle**: source + layer must be added in the existing `map.on('load')`
  block, immediately after the `selected-ring` layer (`bee-map.ts:461`). The
  three event listeners (`moveend`, `sourcedata`, plus the existing `updated()`
  hook for `selectedOccIds`) are wired in `firstUpdated` / `updated` alongside
  current code.
- **`sourcedata` filtering**: the listener fires for *every* source/tile
  update. Filter to `e.sourceId === 'occurrences' && e.isSourceLoaded === true`
  to avoid recomputing on every tile fetch.

### Why the existing `selected-ring` layer is left alone

Its filter still excludes clusters; for unclustered points it works correctly
already. Adding the halo as a sibling layer is strictly additive and does not
disturb that path. No change to `_applySelection()` semantics for unclustered
points.

## Tasks

### Task 1: Add halo source, layer, recompute logic with race guard

**Files:** `src/bee-map.ts`

**Action:**

1. In `firstUpdated` → `map.on('load')` (after the `selected-ring` `addLayer`
   call near line 461), add:
   - `addSource('selected-cluster-halo', { type: 'geojson', data: { type:
     'FeatureCollection', features: [] } })`
   - `addLayer({ id: 'selected-cluster-halo', type: 'circle', source:
     'selected-cluster-halo', paint: { 'circle-color': 'transparent',
     'circle-stroke-color': '#f1c40f', 'circle-stroke-width': 2.5,
     'circle-radius': ['step', ['get', 'leaf_count'], 18, 10, 20, 50, 24, 200, 30] } })`
2. Add private fields on `BeeMap`:
   - `private _haloGeneration = 0;`
   - `private _haloRafToken: number | null = null;`
3. Add private `_scheduleHaloRecompute()` method that, if `_haloRafToken` is
   null, calls `requestAnimationFrame(() => { this._haloRafToken = null;
   this._recomputeHalo(); })` and stores the token. Coalesces multiple triggers
   in one frame.
4. Add private async `_recomputeHalo()` method:
   - Increment `_haloGeneration`; capture `const generation = this._haloGeneration;`
   - If `selectedOccIds` is null or empty: set halo source data to empty
     FeatureCollection; return.
   - `const clusters = this._map!.querySourceFeatures('occurrences', { filter:
     ['has', 'point_count'] });`
   - Dedupe by `properties.cluster_id` (Map keyed on cluster_id; tile-boundary
     duplication is real).
   - For each unique cluster, await
     `getClusterLeaves(cluster_id, point_count, 0, cb)` wrapped in a Promise
     (mirror `_handleClusterClick`'s `new Promise<GeoJSON.Feature[]>` pattern at
     `bee-map.ts:732`).
   - After ALL `getClusterLeaves` settle (`Promise.all`): if `generation !==
     this._haloGeneration` return (race guard — newer recompute superseded us).
   - For each cluster, test `leaves.some(f => this.selectedOccIds!.has(
     f.properties!.occId as string))`. Collect matching cluster geometries +
     `{ cluster_id, leaf_count }` properties.
   - Set halo source data to the resulting FeatureCollection. Use
     `getSource('selected-cluster-halo') as mapboxgl.GeoJSONSource | undefined`
     and bail if the source is gone (component unmount race).
5. Wire triggers:
   - In `updated()`, when `changedProperties.has('selectedOccIds')`, after the
     existing `_applySelection()` call, also call `_scheduleHaloRecompute()`.
   - In `firstUpdated()` → `map.on('load')`, after the halo source/layer are
     added, register `this._map!.on('moveend', () =>
     this._scheduleHaloRecompute());` and `this._map!.on('sourcedata', (e) => {
     if (e.sourceId === 'occurrences' && e.isSourceLoaded)
     this._scheduleHaloRecompute(); });`
   - Also call `_scheduleHaloRecompute()` once at the bottom of the `load`
     handler (after the existing `if (this.selectedOccIds !== null)
     this._applySelection();` block) so URL-restored selections get a halo on
     first paint.
6. In `disconnectedCallback`, if `_haloRafToken !== null` call
   `cancelAnimationFrame(_haloRafToken)`.

Keep the `speicmenLayer` typo at `bee-map.ts:70` untouched (project invariant).

**Verify:**

```
npm test -- src/tests/bee-atlas.test.ts
npm run build
```

**Done:**

- New `selected-cluster-halo` source and layer added in the `map.on('load')`
  block.
- `_recomputeHalo`, `_scheduleHaloRecompute`, `_haloGeneration`,
  `_haloRafToken` exist on `BeeMap`.
- `moveend`, `sourcedata` (filtered), and `selectedOccIds` property change all
  trigger a (rAF-coalesced) recompute.
- Race guard discards stale `Promise.all` results when a newer recompute has
  started.
- Empty/null `selectedOccIds` short-circuits to an empty halo FeatureCollection.
- `npm run build` (`tsc --noEmit` + Eleventy + Vite) passes.
- Existing `bee-atlas.test.ts` ARCH-02 and ARCH-03 tests still pass
  (no new imports of `bee-sidebar` / `url-state` / `bee-atlas` from `bee-map`;
  no `_restored*` properties).

### Task 2: Static-grep architecture tests + manual visual verification

**Files:** `src/tests/bee-atlas.test.ts` (extend the existing `ARCH-02` / new
`HALO-01` describe block).

**Action:**

Add a new `describe('HALO-01: cluster selection halo layer', () => { ... })`
block in `src/tests/bee-atlas.test.ts` with grep-style assertions on
`bee-map.ts` source (mirror the `BOUNDARY-01` pattern at lines 181-198):

1. `bee-map.ts` contains `addSource('selected-cluster-halo'`.
2. `bee-map.ts` contains `id: 'selected-cluster-halo'` in an `addLayer` call.
3. `bee-map.ts` contains a race-guard generation counter for the halo
   (`_haloGeneration`).
4. `bee-map.ts` contains a `requestAnimationFrame` coalescing token
   (`_haloRafToken`).
5. `bee-map.ts` registers a `moveend` listener that schedules halo recompute
   (grep: `moveend` AND `_scheduleHaloRecompute`, in any order, present in the
   file). Use a per-line scan since Phase 071 already has a `moveend` listener
   for `view-moved`.
6. The halo layer's `circle-stroke-color` is `#f1c40f` (matches existing
   `selected-ring`).
7. Halo source/layer are NOT added outside of an `on('load'` handler (grep
   sanity: ensure no top-level `addSource` was introduced).

Also confirm the existing mapbox-gl mock at `bee-atlas.test.ts:30-61` still
covers the new code paths. Specifically add `querySourceFeatures: vi.fn(() =>
[])` to the `MapMock` so the halo recompute does not throw under unit tests.

After implementation, perform the manual visual check in `npm run dev`:

1. Click a cluster blob — yellow halo ring appears around it; sidebar opens
   with leaf occurrences (existing behavior preserved).
2. Click an unclustered point — yellow `selected-ring` appears on the dot;
   no halo (existing behavior preserved).
3. Pan the map so the previously selected cluster scrolls off-screen; pan
   back — halo reappears around the same (or re-aggregated) cluster.
4. Zoom in past `clusterMaxZoom: 14` so the cluster expands into individual
   points — halo disappears, individual `selected-ring` appears on each leaf
   that is in `selectedOccIds`.
5. Apply a filter that excludes the selected occurrences (so `setData` re-runs
   `_applyVisibleIds` and re-aggregates clusters) — halo updates to whatever
   subset of clusters still contains selected leaves (likely none).
6. Click empty map (deselect) — halo disappears immediately.
7. Reload the page from a URL with selection state — halo paints on first
   render (covers the explicit recompute call at the bottom of the `load`
   handler).

**Verify:**

```
npm test -- src/tests/bee-atlas.test.ts
npm run dev   # then perform the 7 manual checks above
```

**Done:**

- `HALO-01` describe block added with the seven static-grep assertions; all
  green.
- `MapMock.querySourceFeatures` added so the existing test suite still passes
  with the new code paths reachable.
- Manual visual checks 1–7 all pass.
- No regressions in pre-existing ARCH-01 / ARCH-02 / ARCH-03 / BOUNDARY-01
  tests.

## Out of scope

- Auto-zoom on cluster click (rejected approach #1).
- `clusterProperties` aggregator with selection state (rejected approach #2).
- Sidebar pulse animation (rejected approach #4).
- Changing the cluster click semantics (still emits `map-click-occurrence`
  with all leaves; no zoom).
- Touching the unclustered `selected-ring` layer or `_applySelection()`.
- Fixing the deferred `speicmenLayer` typo.
- Halo styling per-cluster proportional to selected-leaf count vs total
  leaf count (could be future polish; current spec uses total `leaf_count`
  for radius scaling, which matches the cluster's own size step).

## Risk notes

- `querySourceFeatures` performance: returns only currently-rendered features,
  but on dense maps may return hundreds of cluster features at low zoom.
  Per-cluster `getClusterLeaves` is the dominant cost. The rAF coalescing
  ensures at most one batch per frame; selection changes are user-driven (low
  frequency); `moveend` fires once per gesture; `sourcedata` fires on
  `setData` (filter changes — also user-driven). Expected real-world cost:
  one batch per user action, sub-100ms even with ~50 clusters * 1ms each
  for `getClusterLeaves` callback scheduling.
- `getClusterLeaves` callback ordering: `Promise.all` enforces all-settled
  before the race-guard check, so partial stale state cannot leak.
- `sourcedata` event chattiness: filtering on `e.sourceId === 'occurrences'
  && e.isSourceLoaded` is the documented Mapbox idiom and avoids per-tile
  recomputes.
