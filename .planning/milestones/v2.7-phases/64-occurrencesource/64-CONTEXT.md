# Phase 64: OccurrenceSource - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

`features.ts` gains a single `OccurrenceSource` class (querying the unified `occurrences` SQLite table from Phase 63) that replaces `EcdysisSource` and `SampleSource`; both old classes are deleted. `bee-map.ts` is updated to use a single `Cluster → VectorLayer` stack. `url-state.ts` and `bee-atlas.ts` are updated to encode cluster selections as centroid+radius rather than a full ID list. Tests updated to mock `OccurrenceSource` instead of the two old classes.

`layerMode` is **not** removed in this phase (Phase 65). With a single layer it becomes a no-op — no visibility toggling needed.

</domain>

<decisions>
## Implementation Decisions

### Layer Architecture
- **D-01:** Single `Cluster → VectorLayer` for all occurrences. Both specimen-backed and sample-only features go through the same cluster source. `makeSampleDotStyleFn` is no longer used by `bee-map.ts` (may be removed or left for Phase 65 cleanup).
- **D-02:** Cluster `distance` parameter reduced to produce tight clusters that are still reasonable mobile tap targets. Minimum rendered cluster dot diameter ≥ 44px (Claude's discretion on exact `distance` value — target ~20px; adjust style function to enforce minimum tap target size).

### OccurrenceSource Feature Properties
- **D-03 (Claude's Discretion):** `OccurrenceSource` sets **all columns** from the `occurrences` table as feature properties (no per-type conditional logic). Specimen-side columns are null on sample-only features; sample-side columns are null on specimen-backed features. Future phases will revisit the click-to-sidebar data flow.
- **D-04:** Feature IDs follow existing convention: `ecdysis:<ecdysis_id>` for rows where `ecdysis_id IS NOT NULL`; `inat:<observation_id>` for sample-only rows (`ecdysis_id IS NULL`). Coordinates come from the unified `lat`/`lon` columns (COALESCE product from Phase 62).

### URL Selection Encoding (URL length fix)
- **D-05:** Single-feature click → `o=ecdysis:1234` or `o=inat:5678` (unchanged format, extended to accept `inat:` prefix in `parseParams`).
- **D-06:** Cluster click (multiple features) → `o=@lon,lat,radiusM` where:
  - `lon`, `lat` = mean WGS84 centroid of all features in the cluster (4 decimal places)
  - `radiusM` = distance in metres from centroid to the furthest feature (rounded up to nearest metre)
  - Example: `o=@-120.5123,47.4567,312`
- **D-07:** URL restore for `@lon,lat,r` format: spatial query against the `occurrences` table for all rows where the haversine distance from (`lon`, `lat`) is ≤ `radiusM`. Show both specimen-backed and sample-only results (no type filtering).
- **D-08:** `SelectionState` in `url-state.ts` becomes a discriminated union:
  ```ts
  type SelectionState =
    | { type: 'ids'; ids: string[] }
    | { type: 'cluster'; lon: number; lat: number; radiusM: number };
  ```
  `buildParams` and `parseParams` updated accordingly. `bee-atlas.ts` updated to handle both variants in `_restoreSelectionSamples`.

### layerMode (no change)
- **D-09 (Claude's Discretion):** `layerMode` property remains on `bee-map.ts` and `bee-atlas.ts` but has no visible effect — there is only one layer. The `layerMode`-gated visibility logic is removed from `bee-map.ts`; the property itself stays for Phase 65 to clean up.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Schema
- `scripts/validate-schema.mjs` — authoritative `occurrences.parquet` column list; `OccurrenceSource` SELECT must cover all these columns

### Source Files to Modify
- `frontend/src/features.ts` — add `OccurrenceSource`, delete `EcdysisSource` and `SampleSource`
- `frontend/src/bee-map.ts` — replace two sources/layers with single `Cluster → VectorLayer`; update click handler for centroid+radius; remove `layerMode` visibility gating
- `frontend/src/url-state.ts` — `SelectionState` discriminated union; `buildParams`/`parseParams` for `@lon,lat,r` format
- `frontend/src/bee-atlas.ts` — `_restoreSelectionSamples` spatial restore path; `SelectionState` type propagation
- `frontend/src/style.ts` — review cluster style for minimum tap target size (≥44px dot diameter)

### Tests to Update
- `frontend/src/tests/bee-atlas.test.ts` — mock `OccurrenceSource` instead of `EcdysisSource`/`SampleSource`
- `frontend/src/tests/bee-header.test.ts` — same mock update
- `frontend/src/tests/bee-filter-toolbar.test.ts` — same mock update
- `frontend/src/tests/bee-sidebar.test.ts` — same mock update
- `frontend/src/tests/bee-table.test.ts` — same mock update
- `frontend/src/tests/url-state.test.ts` — add tests for `@lon,lat,r` round-trip encoding

### Prior Phase Context
- `.planning/phases/63-sqlite-data-layer/63-CONTEXT.md` — D-07: `queryVisibleIds` still returns `{ ecdysis, samples }` sets; D-08: unified `occurrences` table schema

### Requirements
- `.planning/REQUIREMENTS.md` §OCC-07 — single source, feature ID convention

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `EcdysisSource` loader pattern in `features.ts:10` — copy structure for `OccurrenceSource`; replace two-table SELECT with single `SELECT * FROM occurrences`
- `makeClusterStyleFn` in `style.ts` — already reads `year` from feature properties for recency coloring; reuse as-is, adjust minimum size
- `_serializedExec` queue in `sqlite.ts` — no changes needed

### Established Patterns
- `tablesReady` awaited before any query — pattern unchanged in `OccurrenceSource`
- Feature ID prefix convention (`ecdysis:` / `inat:`) — established in `EcdysisSource` and `SampleSource`; carried forward

### Integration Points
- `bee-map.ts` constructs `Cluster` wrapping the source — keep this; just swap `EcdysisSource` for `OccurrenceSource` as the cluster's inner source
- `visibleEcdysisIds` / `visibleSampleIds` still passed from `bee-atlas.ts` (Phase 63 D-07); `makeClusterStyleFn` still receives `visibleEcdysisIds` for filter highlighting
- `buildSamples()` in `bee-map.ts` reads specimen-side columns from features — these remain non-null on specimen-backed features, so the function works unchanged for specimen clusters; sample-only clusters will have null species data until Phase 65

### URL Centroid Encoding
- Haversine distance for `radiusM` calculation: implement inline in `bee-map.ts` click handler using WGS84 coordinates from feature geometry (un-project from EPSG:3857 using `toLonLat`)
- SQLite haversine for restore: wa-sqlite has no built-in trig functions beyond basic math; approximate with equirectangular (flat-earth) distance — acceptable for WA state extents and small cluster radii

</code_context>

<specifics>
## Specific Ideas

- User noted clusters are currently too large/spread; Phase 64 is the right time to address this — tighter clusters with adequate mobile tap targets is an explicit goal.
- URL length was a known user-facing bug (large clusters produced URLs that exceeded system length limits); centroid+radius encoding is the fix.
- Phase 65 will revisit the click-to-sidebar data flow entirely (replacing `<bee-specimen-detail>` and `<bee-sample-detail>` with `<bee-occurrence-detail>`); Phase 64 does not need to polish mixed-type cluster sidebar display.

</specifics>

<deferred>
## Deferred Ideas

- Future roadmap: revisit click-to-sidebar data flow (currently reads from OL feature properties on click; could switch to always querying SQLite).
- `makeSampleDotStyleFn` — may be unused after Phase 64; leave for Phase 65 cleanup.
- `speicmenLayer` typo in `bee-map.ts` — intentionally deferred per CLAUDE.md.

</deferred>

---

*Phase: 64-occurrencesource*
*Context gathered: 2026-04-17*
