---
phase: 23
name: Frontend Simplification
status: context-captured
date: 2026-03-27
---

# Phase 23 Context: Frontend Simplification

<domain>
## Phase Boundary

Remove the separate `links.parquet` loading pipeline from the frontend. `inat_observation_id` is now a column in `ecdysis.parquet` (added by Phase 21's export.py). The frontend reads it directly off already-loaded ecdysis features — no second parquet file, no merge step, no `_linksMap`.

The iNat link in the sidebar must continue to work correctly after this change.
</domain>

<decisions>
## Implementation Decisions

### What to delete
- **D-01:** Remove `loadLinksMap` function and `linkColumns` constant from `frontend/src/parquet.ts`
- **D-02:** Remove `import linksDump from './assets/links.parquet?url'` from `frontend/src/bee-map.ts`
- **D-03:** Remove `_linksMap: Map<string, number>` field from the BeeMap component
- **D-04:** Remove the `loadLinksMap(linksDump).catch(...).then(map => { this._linksMap = map; ... })` promise chain from BeeMap's initialization
- **D-05:** Remove all `this._linksMap` references from `buildSamples` call sites in `bee-map.ts`

### What to add
- **D-06:** Add `'inat_observation_id'` to the `columns` array in `frontend/src/parquet.ts`
- **D-07:** Add `inat_observation_id: obj.inat_observation_id != null ? Number(obj.inat_observation_id) : null` to `feature.setProperties()` in `ParquetSource` (BigInt coercion at parse time — matches existing pattern from v1.4)

### buildSamples update
- **D-08:** Remove the `linksMap?: Map<string, number>` parameter from `buildSamples`. Read `inat_observation_id` directly: `const inatId = f.get('inat_observation_id') as number | null ?? null;`
- **D-09:** All call sites of `buildSamples` in `bee-map.ts` drop the `this._linksMap` argument

### occurrenceID column
- **D-10:** Keep `occurrenceID` in the `columns` array and `setProperties` — it's harmless, part of feature identity, and useful for debugging. (Claude's discretion — user did not request removal.)

### validate-schema.mjs and assets
- **D-11:** `scripts/validate-schema.mjs` already has `inat_observation_id` in the ecdysis schema check and no `links.parquet` entry — **no changes needed** (completed in Phase 21)
- **D-12:** `links.parquet` is already absent from `frontend/src/assets/` — **no file deletion needed**

### bee-sidebar.ts
- **D-13:** `bee-sidebar.ts` already uses `inatObservationId` from the `Sample` type — **no changes needed**. The field will be populated correctly once `buildSamples` reads from feature properties.

### Claude's Discretion
- TypeScript types: update `buildSamples` signature and any type annotations as needed
- No other behavioral changes — this is a pure deletion/rewiring with the same external behavior

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Frontend source files (all files being modified)
- `frontend/src/parquet.ts` — ecdysis columns array, `loadLinksMap`, `ParquetSource.setProperties`
- `frontend/src/bee-map.ts` — `import linksDump`, `_linksMap`, `buildSamples`, loading chain (lines ~9, 131, 145, 231, 531, 770-788)
- `frontend/src/bee-sidebar.ts` — `inatObservationId` type and render (verify no changes needed)

### Already-completed work (read to confirm, do not redo)
- `scripts/validate-schema.mjs` — `inat_observation_id` already in ecdysis schema check; `links.parquet` already absent
- `frontend/src/assets/` — `links.parquet` already not present

### Requirements
- `.planning/REQUIREMENTS.md` — FRONT-01

</canonical_refs>

<code_context>
## Existing Code Insights

### Current flow (to be removed)
1. `bee-map.ts` imports `linksDump` (links.parquet URL)
2. On load: `loadLinksMap(linksDump)` → builds `Map<occurrenceID → inat_observation_id>`
3. `buildSamples(features, this._linksMap)` → looks up each feature's `occurrenceID` in the map
4. Result: `inatObservationId` on each species entry

### New flow (after this phase)
1. `parquet.ts` reads `inat_observation_id` column from ecdysis.parquet, coerces BigInt → Number, stores on feature
2. `buildSamples(features)` → reads `f.get('inat_observation_id')` directly
3. Same result: `inatObservationId` on each species entry

### Key line references
- `parquet.ts:18` — `linkColumns` (delete)
- `parquet.ts:20-29` — `loadLinksMap` function (delete)
- `parquet.ts:32-45` — `columns` array (add `inat_observation_id`)
- `parquet.ts:60-80` — `setProperties` call (add `inat_observation_id` with `Number()` coercion)
- `bee-map.ts:9` — `import linksDump` (delete)
- `bee-map.ts:131` — `buildSamples` signature (remove `linksMap?` param)
- `bee-map.ts:145` — linksMap lookup (replace with feature property read)
- `bee-map.ts:231` — `_linksMap` field declaration (delete)
- `bee-map.ts:531` — `buildSamples(toShow, this._linksMap)` (drop second arg)
- `bee-map.ts:770-771` — `loadLinksMap(linksDump)...then(map => this._linksMap = map)` (delete entire chain)
- `bee-map.ts:788` — `buildSamples(toShow, this._linksMap)` inside then-block (delete with chain)
</code_context>

<specifics>
## Specific Ideas

No specific references — phase is a clean deletion/rewiring with the same external behavior.
</specifics>

<deferred>
## Deferred Ideas

- **Pruning `occurrenceID` from columns**: It's now only kept for feature identity/debugging. Could be removed in Phase 24 (Tech Debt Audit) if desired.

</deferred>

---

*Phase: 23-frontend-simplification*
*Context gathered: 2026-03-27 (no discussion needed — mechanical deletion/rewiring)*
