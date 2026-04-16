# Phase 58: Elevation Filter - Context

**Gathered:** 2026-04-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Add elevation range filter (min/max number inputs) to the filter toolbar. Wire URL encoding (`elev_min`/`elev_max`), integrate SQL semantics into `buildFilterSQL`, extend `FilterState` and `isFilterActive`, update URL round-trip, and update tests. No new pipeline or sidebar work — that is Phases 55–57.

</domain>

<decisions>
## Implementation Decisions

### Elevation inputs — widget type and placement
- **D-01:** Two `<input type="number">` fields — not a slider. WA spans 0–4392 m; slider precision is insufficient.
- **D-02:** Compact inline layout: same row as the token chip field, right-aligned. Format: `[ ↑ min m ] [ max m ]`. No separate row, no "Elevation (m):" label row. Keeps the toolbar in one line.
- **D-03:** Both inputs appear inside `bee-filter-controls` (per ELEV-07), managed as `@state() private _elevMin: number | null` and `@state() private _elevMax: number | null`, separate from the token list. They are merged into the `FilterState` dispatched via `filter-changed`.

### FilterState extension
- **D-04:** Add `elevMin: number | null` and `elevMax: number | null` to the `FilterState` interface in `filter.ts`. Both nullable. `emptyFilter()` helper in `filter.test.ts` must include both as `null`.
- **D-05:** `isFilterActive` must check `f.elevMin !== null || f.elevMax !== null` in addition to the existing checks.

### SQL semantics (ELEV-08 — locked)
- **D-06:** Elevation WHERE clause uses conditional null semantics:
  - Only `elevMin` set: `(elevation_m IS NULL OR elevation_m >= {elevMin})`
  - Only `elevMax` set: `(elevation_m IS NULL OR elevation_m <= {elevMax})`
  - Both set: `elevation_m IS NOT NULL AND elevation_m BETWEEN {elevMin} AND {elevMax}` (nulls excluded)
  - Neither set: no clause added
- **D-07:** Elevation filter applies to both ecdysis and samples tables. `samples.elevation_m` is always null (no DEM source for iNat observations) — with both bounds set, all samples will be excluded. This is acceptable per the requirements.

### URL encoding (ELEV-07 — locked)
- **D-08:** `buildParams` in `url-state.ts` encodes: `params.set('elev_min', String(filter.elevMin))` / `params.set('elev_max', String(filter.elevMax))` when non-null (omit when null — absence = unset).
- **D-09:** `parseParams` reads `elev_min`/`elev_max` via `parseInt`; validates finite numbers; sets to `null` on missing or invalid. Both are optional independently.
- **D-10:** `hasFilter` condition in `parseParams` must include `elevMin !== null || elevMax !== null` to trigger filter object construction.

### "Clear filters" behavior (ELEV-09)
- **D-11:** No dedicated "Clear all" button. Elevation inputs clear naturally: `_elevMin` and `_elevMax` are synced from `filterState.elevMin/elevMax` in `willUpdate` (same pattern as tokens). When `bee-atlas` resets `FilterState` to empty (all tokens removed, elevation fields null), the inputs go empty automatically via property binding.
- **D-12:** When the user clears the value from an elevation input (input becomes empty/NaN), `_elevMin`/`_elevMax` resets to `null` and a `filter-changed` event fires immediately.

### bee-filter-controls component architecture
- **D-13:** `_emitTokens` must merge current `_elevMin`/`_elevMax` into the `FilterState` it dispatches. Elevation inputs also dispatch `filter-changed` on `input` event (immediate, not debounced).
- **D-14:** In `willUpdate`, sync `_elevMin`/`_elevMax` from `this.filterState.elevMin/elevMax` when `filterState` property changes (to handle external resets). Guard against feedback loops using same pattern as token sync.

### Claude's Discretion
- Whether inputs have `min="0"` HTML attribute (WA minimum elevation)
- Whether inputs have `step` attribute or placeholder text
- Exact CSS sizing of the compact inputs (keep consistent with token chip row height)
- Whether `filter-changed` on elevation uses `input` event or `change` event (user expectation: immediate feedback = `input`)

</decisions>

<specifics>
## Specific Ideas

- Visual: `[ ↑ min m ] [ max m ]` — compact, right-aligned on the token chip row

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Filter logic
- `frontend/src/filter.ts` — `FilterState` interface, `buildFilterSQL`, `isFilterActive` — all three need extension
- `frontend/src/url-state.ts` — `buildParams` / `parseParams` — elevation params added here

### UI component
- `frontend/src/bee-filter-controls.ts` — token-based autocomplete chip component; elevation inputs added inline

### Tests to update
- `frontend/src/tests/filter.test.ts` — `emptyFilter()` helper + elevation SQL tests
- `frontend/src/tests/url-state.test.ts` — elevation param round-trip tests

### Requirements
- `.planning/REQUIREMENTS.md` §ELEV-07, ELEV-08, ELEV-09 — exact specs for filter inputs, SQL semantics, clear behavior

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable patterns
- `filterState` → tokens → `filterState` sync in `bee-filter-controls.ts` (`willUpdate` + `_emitTokens`): elevation should follow the same sync pattern with `_elevMin`/`_elevMax`
- `buildFilterSQL` clause pattern: each filter dimension appends to `ecdysisClauses`/`samplesClauses` — elevation follows the same append pattern
- `parseParams` int-parse pattern: `parseInt(p.get('yr0') ?? '') || null` — elevation uses same `parseInt` with `|| null` fallback

### Integration points
- `FilterState` in `filter.ts` — interface must be extended; all call sites that construct `FilterState` or `emptyFilter()` need updating
- `bee-filter-controls` dispatches `filter-changed` with `FilterState` payload — elevation must be included
- `bee-atlas.ts` reads `elevation_m` from features at line 744/759 — already present; no changes needed there

</code_context>

<deferred>
## Deferred Ideas

- Elevation column in `bee-table` tabular view — listed in REQUIREMENTS Future section; out of scope for v2.5
- Elevation color-coded map visualization — future milestone
- S3 caching of DEM file — out of scope for v2.5

</deferred>

---

*Phase: 58-elevation-filter*
*Context gathered: 2026-04-15*
