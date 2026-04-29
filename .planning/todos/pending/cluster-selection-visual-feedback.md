---
title: Cluster blobs need selection visual feedback
priority: medium
source: phase-71-human-uat
created: 2026-04-28
---

When the user clicks a cluster blob on the map, selection state is captured (the leaves' occIds populate `_selectedOccIds` and the sidebar opens), but the cluster itself shows no visual indication that it's the active selection. The yellow `selected-ring` only renders on unclustered features (the layer's filter excludes anything with `point_count`).

This was a deliberate design choice during Phase 071 to avoid `promoteId` conflicts with cluster auto-IDs (see `.planning/phases/071-base-map-and-occurrence-layer/071-RESEARCH.md` "Anti-Patterns Found" / A1, and `071-02-SUMMARY.md` decisions). The result is correct selection state but a UX dead-zone: clicking a cluster gives no map-side feedback that anything happened beyond the sidebar appearing.

Possible approaches (each with tradeoffs):
1. **Auto-zoom on cluster click** — common Mapbox pattern; expands the cluster into individual rings. Easiest, but changes click semantics (currently cluster click opens sidebar with all leaves, doesn't zoom).
2. **Add a `selectedCount` clusterProperty aggregator + dynamic paint expression** — would let the cluster blob change color/stroke when its leaves overlap with `_selectedOccIds`. Mapbox `clusterProperties` are evaluated at cluster build time, so this would only work if selection is part of the source data (rebuild on every selection change — expensive).
3. **Halo overlay layer** — add a separate non-clustered point layer rendering rings on the cluster's centroid for any cluster whose leaves intersect `_selectedOccIds`. Requires querying cluster leaves on every selection change.
4. **Keep current behavior, add a brief pulse animation on the sidebar header** — cheapest UX hint that the click registered.

Recommend exploring (1) or (4) first — both are small, neither requires re-architecting the cluster data pipeline.
