# Phase 91: URL State - Context

**Gathered:** 2026-05-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Add `sel=west,south,east,north` URL param (4 decimal places) to encode rectangle selection bounds. On fresh load, re-run `queryOccurrencesByBounds` from the param and open the sidebar. On dismiss, remove the param. Filter params coexist with `sel=` simultaneously.

</domain>

<decisions>
## Implementation Decisions

### URL Serialization
- **D-01:** After a rectangle selection, `_pushUrlState()` emits **only `sel=`** (no `o=` alongside). On restore, re-run the bounds query — not restore from explicit IDs. Matches success criterion 2 ("re-runs the bounds query") and the existing `_restoreClusterSelection` precedent.

### URL State Model
- **D-02:** Add a `bounds` variant to `SelectionState` in `src/url-state.ts` (extending the existing `ids | cluster` union). Keep `buildParams` signature unchanged — pass `{ type: 'bounds', west, south, east, north }` as the selection argument when bounds are active. `buildParams` encodes this as `sel=`; the existing `o=` cases are unchanged.

### Clearing sel=
- **D-03:** Wherever `_selectedOccIds`/`_selectedCluster` are cleared (in `_onClose`, `_onMapClickEmpty`, `_onFilterChanged`), also clear `_selectionBounds`. This ensures `_pushUrlState()` never emits `sel=` for a dismissed selection.

### Claude's Discretion
- `_restoreBoundsSelection` method mirrors `_restoreClusterSelection`: sets `_sidebarOpen = true` immediately (sidebar shows loading state), awaits `tablesReady`, then calls `queryOccurrencesByBounds`.
- The `_selectionDrawnGeneration` guard applies on the restore path (same generation pattern as `_onSelectionDrawn`).
- `parseParams` bounds validation: 4 finite floats, west/east ∈ [-180, 180], south/north ∈ [-90, 90], south < north.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §SEL-06, SEL-07 — locked requirements for this phase

### Existing URL State Implementation
- `src/url-state.ts` — `SelectionState` union, `AppState`, `buildParams`, `parseParams` — extend here
- `src/bee-atlas.ts` lines 494–590 — `_pushUrlState`, `_onPopState` — primary call sites; lines 669 and 681 have explicit "Phase 91 will..." placeholder comments

### Precedent Patterns
- `src/bee-atlas.ts:896` — `_restoreClusterSelection` — mirror this pattern for `_restoreBoundsSelection`
- `src/bee-atlas.ts:658` — `_onSelectionDrawn` — `_selectionDrawnGeneration` guard pattern

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `queryOccurrencesByBounds(filter, bounds)` in `src/bee-atlas.ts` (or imported) — already used in `_onSelectionDrawn`; call directly on restore
- `_selectionDrawnGeneration: number` — existing generation counter; reuse for restore guard
- `_selectionBounds: { west, south, east, north } | null` — already a `@state()` property

### Established Patterns
- `SelectionState` union in `url-state.ts` — add `bounds` variant, encode as `sel=`, decode in `parseParams`
- `_restoreClusterSelection` — async restore: `_sidebarOpen = true` first, then await query, then assign `_selectedOccurrences`
- Every selection clear site (`_onClose`, `_onMapClickEmpty`, `_onFilterChanged`) — add `this._selectionBounds = null`

### Integration Points
- `_pushUrlState()` ternary: `_selectionBounds && _sidebarOpen` takes precedence over cluster/ids
- `firstUpdated()` restore block: add `bounds` branch after existing `ids`/`cluster` branches
- `_onPopState()` restore block: same — add `bounds` branch

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches within the decisions above.

</specifics>

<deferred>
## Deferred Ideas

Reviewed todos (not in scope for Phase 91):
- "Cluster blobs need selection visual feedback" — future phase (SEL-F02)
- "Hash-versioned parquet URLs" — unrelated pipeline concern
- "Nightly run failure notification" — unrelated pipeline concern

</deferred>

---

*Phase: 91-URL State*
*Context gathered: 2026-05-15*
