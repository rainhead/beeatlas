# Phase 40: bee-table Component - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement `<bee-table>` — a Lit web component that fills the `table-slot` from Phase 39. It shows specimen or sample rows from the DuckDB-backed dataset, filtered by the active `filterState`, with column sorting, pagination at 100 rows/page, and a row count indicator. Phase 40 does not include CSV export (Phase 41).

</domain>

<decisions>
## Implementation Decisions

### Layout & Scrolling
- **D-01:** The table fills the full available height of the map area (viewport minus the top bar). Rows scroll internally inside the table body — the column headers and the pagination bar stay fixed in view at all times.
- **D-02:** The sidebar stays visible (decided in Phase 39, confirmed here). The table occupies the space where `<bee-map>` was; sidebar remains on the right with toggle + filter controls.
- **D-03:** Pagination controls (← Prev / 1–100 of N → Next) are anchored at the bottom of the table area, outside the scrollable row region.

### Column Overflow
- **D-04:** All cells truncate with `overflow: hidden; text-overflow: ellipsis` at a fixed column width. The full value is shown in a native browser tooltip (`title` attribute) on hover.
- **D-05:** Row height is uniform (single line per row). No wrapping.

### Sort State & URL Encoding
- **D-06:** Sort column and sort direction are encoded in the URL (e.g. `sort=year&dir=desc`). `UiState` in `url-state.ts` gains `sortColumn` and `sortDir` fields; `buildParams` omits them when they match the default; `parseParams` restores them.
- **D-07:** Default sort: **year descending** — most recent specimens first. Applied when no `sort` param is present in the URL.
- **D-08:** Current page number is **ephemeral** — resets to page 1 on every load, URL share, or filter change. Not URL-encoded.
- **D-09:** When the filter changes, page resets to 1 automatically.

### Data Query
- **Claude's Discretion:** `bee-table` (or a helper in `filter.ts`) executes a DuckDB `SELECT … ORDER BY … LIMIT 100 OFFSET …` query with the same `WHERE` clause logic as `queryVisibleIds`. `bee-atlas` owns `_sortColumn`, `_sortDir`, and `_tablePage` as `@state()` fields. `bee-table` receives these as `@property()` inputs and emits `sort-changed` / `page-changed` events upward — following the established event-up/property-down pattern.
- **Claude's Discretion:** Row count (total matching rows) comes from a separate `SELECT COUNT(*)` query (or reuse from `filteredSummary` if available) — not from loading all rows.

### Architecture
- **Claude's Discretion:** `bee-table` is a pure presenter (no internal state beyond render). It receives: `rows`, `rowCount`, `layerMode`, `page`, `sortColumn`, `sortDir` as properties. It emits `sort-changed` and `page-changed` events.
- **Claude's Discretion:** The table component is registered as `<bee-table>` and replaces the `<div class="table-slot">` in `bee-atlas` render — conditional on `_viewMode === 'table'`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs — all requirements are in TABLE-01 through TABLE-07 in `.planning/REQUIREMENTS.md` and the decisions above.

### Key source files to read
- `frontend/src/bee-atlas.ts` — state ownership, render template, event handlers, `_viewMode` (Phase 39)
- `frontend/src/url-state.ts` — `UiState` interface + `buildParams`/`parseParams` — extend with `sortColumn`/`sortDir`
- `frontend/src/filter.ts` — `buildFilterSQL`, `queryVisibleIds`, DuckDB query pattern to follow
- `frontend/src/duckdb.ts` — `getDuckDB`, `tablesReady` — used for all DuckDB queries
- `frontend/src/bee-sidebar.ts` — existing presenter component pattern
- `.planning/phases/39-view-mode-toggle/39-CONTEXT.md` — Phase 39 decisions (table-slot, viewMode, layout)
- `.planning/ROADMAP.md` §Phase 40 — success criteria (5 items, all must be true)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `filter.ts` `buildFilterSQL(f)` — returns `{ecdysisWhere, samplesWhere}` SQL fragments; table SELECT reuses these directly
- `duckdb.ts` `getDuckDB()` + `tablesReady` — same async pattern as `queryVisibleIds`
- `url-state.ts` `UiState` + `buildParams`/`parseParams` — extend for `sortColumn`/`sortDir`
- `bee-atlas.ts` `_layerMode`, `_viewMode`, `_filterState` — existing `@state()` fields; add `_sortColumn`, `_sortDir`, `_tablePage`

### Established Patterns
- State in `bee-atlas`, props down, events up — `_onSortChanged` / `_onPageChanged` handlers follow `_onLayerChanged` pattern
- URL param omitted when default (`lm` omitted when `specimens`, `view` omitted when `map`) → `sort`/`dir` omitted when year/desc
- Lit `@property()` and `@state()` decorators; `html` template literals
- Custom element registration: `customElements.define('bee-table', BeeTable)`

### Integration Points
- `bee-atlas.ts` render(): replace `html\`<div class="table-slot"></div>\`` with `html\`<bee-table .rows=… .rowCount=… .layerMode=… .page=… .sortColumn=… .sortDir=… @sort-changed=… @page-changed=…></bee-table>\``
- `url-state.ts`: `UiState` gets two new optional fields; `parseParams` defaults to `{column: 'year', dir: 'desc'}` when absent
- `filter.ts` or new `table-query.ts`: new `queryTablePage(f, sortCol, sortDir, page)` function returning `{rows, total}`

</code_context>

<specifics>
## Specific Details

- Pagination format from success criteria: `"showing 1–100 of N specimens"` (or samples) — matches requirements exactly
- Specimen columns (TABLE-06): species, collector (recordedBy), year, month, county, ecoregion, field number
- Sample columns (TABLE-07): observer, date, specimen count, county, ecoregion
- Page size: 100 rows per page (TABLE-04)
- Layout mockup chosen: sidebar + table side-by-side, table fills viewport height, rows scroll internally, pagination anchored at bottom

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 40-bee-table-component*
*Context gathered: 2026-04-07*
