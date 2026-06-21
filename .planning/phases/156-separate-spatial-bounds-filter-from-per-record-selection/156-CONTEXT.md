# Phase 156: Separate spatial-bounds FILTER from per-record SELECTION - Context

**Gathered:** 2026-06-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Finish the conceptual split begun in Phase 153 by making the **state model and URL contract** honest: a spatial bounding box is a **FILTER**; **SELECTION** (`o=` ids / cluster) is for individual occurrence records only.

Phase 153 already made bounds *behave* as a filter (hide non-matching dots on map + list + table, URL round-trip). This phase removes the legacy *selection* plumbing the box still rides:
- `_selectionBounds` state, the shared `_applyBoundsSelection` path, and `sel=` URL param;
- the forced `_paneState='list'` on a bounds change;
- the mutual exclusivity between bounds and record selection.

**Purely structural — no new user-facing capability.** Behavior visible to the user is unchanged except where explicitly decided below (pane no longer force-opens; bounds + selection may now coexist). Touches `filter.ts`, `url-state.ts`, `bee-atlas.ts`, `bee-pane.ts`. Coordinate with backlog 155 (surfacing the shift-drag gesture).

</domain>

<decisions>
## Implementation Decisions

### State model
- **D-01:** Fold the bounds box into `FilterState` — it becomes a first-class filter field (renamed off `_selectionBounds`), flowing through the existing filter plumbing (`isFilterActive`, `queryVisibleGeoJSON`/`queryVisibleIds`, `_onFilterChanged`, `_runFilterQuery`/`_runListQuery`/`_runTableQuery`). Bounds is "just another filter," not a special-cased side field. This is the larger-blast-radius option and is intended.
  - Implication: `queryVisibleGeoJSON`/`queryVisibleIds` (filter.ts) currently take `selectionBounds` as a *separate* argument (filter.ts:328, 404) — that argument folds into the `FilterState` they already receive.
  - Implication: `isFilterActive(f)` must return true when bounds is set (today the active check is `isFilterActive(f) && selectionBounds === null` style — filter.ts:336). `intendedFilterActive` on `<bee-atlas>` (bee-atlas.ts:192) reads from the single filter source rather than OR-ing `_selectionBounds`.

### URL contract & legacy migration
- **D-02:** Bounds serializes under a **new** URL param: **`bbox=west,south,east,north`** (same 4-float `toFixed(4)` encoding as today's `sel=`). `buildParams` only ever writes `bbox=` for bounds.
- **D-03:** `parseParams` performs **read-old / write-new** migration: it still parses legacy `sel=west,south,east,north` links and maps them into the bounds filter, but the box is re-serialized as `bbox=` on the next URL write. Existing shared `sel=`-bounds links keep working; `sel=` is retired for *writing* bounds. (`o=` is untouched — it remains the record-selection param for ids/cluster.)
  - Note: the `SelectionState` `{ type: 'bounds' }` variant (url-state.ts:30) moves out of selection and into the filter representation; the legacy `sel=` reader is the only place that still recognizes the old encoding.

### Pane behavior
- **D-04:** A bounds-filter change does **NOT** touch `_paneState`. Remove the `_paneState = 'list'` force in the bounds path (currently bee-atlas.ts:1330 inside `_applyBoundsSelection`). Bounds behaves like every other filter (taxon, year, etc. don't open the pane). This is the explicit roadmap intent.

### Filter / selection coexistence
- **D-05:** A bounds filter and a per-record selection may **coexist (AND-compose)** — applying one no longer nulls the other. The old `_applyBoundsSelection` behavior of clearing `_selectedOccIds`/`_selectedCluster` (bee-atlas.ts:1328-1329) is dropped. Plan/test the combined-state cases (bounds-only, selection-only, both, neither).
- **D-06:** Clicking an empty spot on the map (`_onMapClickEmpty`, bee-atlas.ts:1342) clears the **per-record selection only** — it LEAVES the bounds filter active. Bounds, being a filter, is dismissed through filter affordances, not a map click. (Today this handler nulls selection, cluster, AND bounds in both branches — bee-atlas.ts:1350-1364; the bounds-nulling is removed.)

### Clearing the bounds filter
- **D-07:** The bounds filter is cleared through the **'where' input** ("County, ecoregion, or place"), reusing the Phase-153 mechanism (active bounds render *in* that input, no chip; the `near-me-cleared` event path clears it). No new dedicated UI control — respects [[feedback_no_unrequested_ui_patterns]].
- **D-08 [deferred]:** Not tracked as a plan-implemented decision (no plan covers it by design; see Deferred Ideas). The user also asked for bounds to be droppable via a **global "clear all filters" reset**. **No such global-reset affordance currently exists** in the codebase (clearing is per-filter: `_clearTaxon`, the `where` input `.input-clear`, `near-me-cleared`). So there is nothing to fold bounds into today. → **Deferred** (see Deferred Ideas): if/when a global filter-reset is introduced, bounds must participate in it. Folding bounds into `FilterState` (D-01) makes this trivial later, since a reset would clear the whole `FilterState`.

### Claude's Discretion
- Exact field name on `FilterState` for the box (e.g. `bounds` / `bbox` / `boundsFilter`) — pick what reads cleanly alongside the existing fields.
- Internal naming of the renamed apply path (the old `_applyBoundsSelection`) — choose a filter-oriented name (e.g. `_applyBoundsFilter`).
- Whether to keep a thin shim so a near-me box and a shift-drag box still produce byte-identical state (the D-01 guarantee from Phase 153) — preserve that equivalence however is cleanest.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### This phase's origin & prior decisions
- `.planning/ROADMAP.md` §"Phase 156" (line ~1423) — the phase definition and the FILTER-vs-SELECTION conceptual model.
- `.planning/phases/153-occurrences-near-me/153-CONTEXT.md` — Phase 153 decisions; bounds-as-filter behavior, "shows in the where input, no chip," shared near-me ≡ shift-drag state, `sel=` round-trip.
- `.planning/phases/153-occurrences-near-me/153-VERIFICATION.md` — what 153 actually shipped (the behavior baseline this refactor must not regress).

### Architecture invariants (in repo root)
- `CLAUDE.md` §"Architecture Invariants" — State ownership (`<bee-atlas>` owns all reactive state; `<bee-map>`/`<bee-sidebar>`/`<bee-pane>` are pure presenters), Style-cache bypass rules (must bypass when `filterState` active OR `selectedOccIds` non-empty — folding bounds into filter state must keep cache bypass correct), Filter race guard (`_filterQueryGeneration`), ID format.

### Source files in scope
- `src/filter.ts` — `FilterState`, `isFilterActive`, `queryVisibleGeoJSON` (line ~320), `queryVisibleIds` (line ~400); `selectionBounds` arg + `boundsClause` construction (lines 328, 341-343, 404, 420-423).
- `src/url-state.ts` — `SelectionState` (line 27), `buildParams` `sel=`/`o=` writing (lines 79-90), `parseParams` `sel=` reader (lines 231-248).
- `src/bee-atlas.ts` — `_selectionBounds` field (122), `intendedFilterActive` (192), `_selectionBoundsLabel` (197), bee-pane bindings (455-456), restore path (556, 1158-1170), `_applyBoundsSelection` (1325-1336), `_onSelectionDrawn` (1338), `_onMapClickEmpty` (1342-1367).
- `src/bee-pane.ts` — `selectionBoundsActive`/`selectionBoundsLabel` props (~89), `where` input + `near-me-cleared` path.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `boundsClause` SQL construction already exists in both `queryVisibleGeoJSON` and `queryVisibleIds` (filter.ts) — the bbox-to-SQL logic is done; this phase moves where the bounds *come from* (the `FilterState` arg), not how they filter.
- Phase 153's `near-me-cleared` event + "active bounds render in the where input" mechanism (bee-pane.ts) is the clearing UX — reuse, don't rebuild (D-07).
- `_applyBoundsSelection` (bee-atlas.ts:1325) is the single shared transition for shift-drag AND near-me — refactor it in place into a filter-oriented apply rather than duplicating.

### Established Patterns
- Filter changes flow through `_onFilterChanged` → new `_filterState` object → `_runFilterQuery`/`_runListQuery`/`_runTableQuery` → `_replaceUrlState`. Folding bounds into `FilterState` (D-01) lets the bounds box ride this exact path.
- Filter race guard: `_filterQueryGeneration` increments on each filter change; stale `queryVisibleIds` results discarded. Bounds-as-filter must increment/respect this guard (CLAUDE.md invariant).
- Style-cache bypass: mapbox style functions bypass cache when `filterState` active OR `selectedOccIds` non-empty. With bounds now part of `filterState`, verify the `filterState`-active branch covers bounds-only (no regression to the cache-bypass invariant).

### Integration Points
- `<bee-atlas>` → `<bee-pane>` properties (`selectionBoundsActive`, `selectionBoundsLabel`, bee-atlas.ts:455-456): names may stay or be renamed to filter-oriented equivalents, but the data flow (atlas owns state, pane presents) is preserved.
- URL restore on load (`_onDataLoaded`/init, bee-atlas.ts:556) and popstate (1158-1170) must handle both `bbox=` (new) and legacy `sel=` (read-old) into the bounds filter.

</code_context>

<specifics>
## Specific Ideas

- New URL param name locked: **`bbox=`** (D-02).
- Preserve the Phase-153 guarantee that a near-me box and a shift-drag box produce byte-identical state and identical URL encoding — now under `bbox=` instead of `sel=`.
- Regression bar: Phase 153 shipped with 792 tests green and operator UAT PASS; this refactor must keep that behavior (and the `sel=`-link back-compat) intact.

</specifics>

<deferred>
## Deferred Ideas

- **Global "clear all filters" reset that also drops bounds (D-08):** No global filter-reset affordance exists yet. Building one is its own scope (a new UI control + behavior across ALL filters, not just bounds) — out of scope here. When/if it lands, bounds must participate; D-01 (bounds in `FilterState`) makes that automatic. Note for a future phase or backlog 155.
- **Surfacing the shift-drag gesture (backlog 155):** Making the bounds-filter gesture discoverable is a separate phase; coordinate but don't absorb. The 2026-06-21 roadmap note reframes 155 around the *filter* gesture given this reclassification.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.

</deferred>

---

*Phase: 156-separate-spatial-bounds-filter-from-per-record-selection*
*Context gathered: 2026-06-21*
