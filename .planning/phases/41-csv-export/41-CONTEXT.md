# Phase 41: CSV Export - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a "Download CSV" button inside `<bee-table>` that triggers a browser file download of the complete filtered dataset (all rows, no pagination limit) with a descriptive filename derived from active filter state. Phase 41 does not add any new filter controls or change the table display.

</domain>

<decisions>
## Implementation Decisions

### Button Placement
- **D-01:** The "Download CSV" button lives inside `<bee-table>`, rendered in the pagination bar alongside the ← Prev / count / Next → controls. It is only accessible in table view — there is no button in `bee-sidebar` or map view.
- **D-02:** `bee-table` emits a `download-csv` CustomEvent upward. `bee-atlas` handles the actual DuckDB query and file generation, following the established event-up / property-down pattern. `bee-table` is a pure presenter.

### CSV Columns
- **D-03:** The CSV exports **all available parquet columns** — implemented as `SELECT *` (or the full column list from `validate-schema.mjs`) with the active WHERE clause. Not limited to the table's UI display columns.
  - Specimens: `ecdysis_id`, `occurrenceID`, `longitude`, `latitude`, `date`, `year`, `month`, `scientificName`, `recordedBy`, `fieldNumber`, `genus`, `family`, `floralHost`, `county`, `ecoregion_l3`, `inat_observation_id`
  - Samples: `observation_id`, `observer`, `date`, `lat`, `lon`, `specimen_count`, `sample_id`, `county`, `ecoregion_l3`

### Filename Algorithm
- **D-04:** Filename format: `{layerMode}-{segment1}-{segment2}.csv` or `{layerMode}-all.csv` when no filter is active.
- **D-05:** Priority order for segments: **taxon > collector > year > county/ecoregion**. At most 2 segments are included so filenames stay readable.
- **D-06:** Slugification: lowercase, spaces replaced with hyphens, special characters stripped.
- **D-07:** Year: if `yearFrom === yearTo` (or only one bound set), use the year value. If a range, use `{from}-{to}`. If a year range would be the 2nd segment, it is formatted as `{from}-{to}` compactly.
- **D-08:** Examples:
  - taxon + year both active → `specimens-bombus-2023.csv`
  - taxon + county both active → `specimens-bombus-king.csv`
  - year only → `specimens-2023.csv`
  - no filter → `specimens-all.csv` / `samples-all.csv`
- **D-09:** Claude's Discretion on segment truncation/sanitization: limit each segment to ~20 chars to avoid OS filename length issues.

### Data Query
- **Claude's Discretion:** A new `queryAllFiltered(f, layerMode)` function in `filter.ts` executes `SELECT * FROM {table} WHERE {where} ORDER BY {orderBy}` with no LIMIT. `bee-atlas` calls this in its `_onDownloadCsv` handler and serializes the result to CSV in-memory using a simple header + row join (no external library needed for this data volume).
- **Claude's Discretion:** The download is triggered via a dynamically created `<a>` element with a `data:text/csv` or `Blob` URL — standard browser download pattern. No server required.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs — requirements fully captured in decisions above.

### Key source files to read
- `frontend/src/bee-atlas.ts` — state ownership, event handler pattern (`_onDownloadCsv` to add), `_filterState` and `_layerMode`
- `frontend/src/bee-table.ts` — add "Download CSV" button and emit `download-csv` CustomEvent
- `frontend/src/filter.ts` — `buildFilterSQL`, `queryTablePage` (pattern to follow), `isFilterActive`, `FilterState` interface; add `queryAllFiltered`
- `scripts/validate-schema.mjs` — authoritative column list for ecdysis.parquet and samples.parquet
- `.planning/ROADMAP.md` §Phase 41 — success criteria (2 items: full result set, descriptive filename)
- `.planning/phases/40-bee-table-component/40-CONTEXT.md` — Phase 40 architecture (`bee-table` as pure presenter, event patterns)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `filter.ts` `buildFilterSQL(f)` — returns `{ecdysisWhere, samplesWhere}`; reuse directly for `queryAllFiltered`
- `filter.ts` `isFilterActive(f)` — determines `-all` vs. filter-derived filename segments
- `filter.ts` `FilterState` — `taxonName`, `yearFrom`, `yearTo`, `selectedCounties`, `selectedEcoregions`, `selectedCollectors` available for filename generation
- `duckdb.ts` `getDuckDB()` + `tablesReady` — same async query pattern as `queryTablePage`

### Established Patterns
- State in `bee-atlas`, props down, events up — `_onDownloadCsv` handler follows `_onPageChanged` / `_onSortChanged` pattern
- Event naming convention: `download-csv` (kebab-case CustomEvent from `bee-table`)
- DuckDB query: `await tablesReady`, `const db = await getDuckDB()`, `await db.query(sql)` — same as `queryTablePage`

### Integration Points
- `bee-table.ts`: add `[Download CSV]` button in pagination bar; dispatch `download-csv` CustomEvent (bubbles: true, composed: true)
- `bee-atlas.ts`: add `@download-csv=${this._onDownloadCsv}` on `<bee-table>` element; implement `_onDownloadCsv` as async handler that calls `queryAllFiltered` and triggers browser download
- `filter.ts`: add `queryAllFiltered(f: FilterState, layerMode: 'specimens' | 'samples'): Promise<Record<string, unknown>[]>` using `SELECT * FROM {table} WHERE {where} ORDER BY {orderBy}`

</code_context>

<specifics>
## Specific Details

- Success criteria 1: "Clicking 'Download CSV' triggers a browser file download of the complete filtered result set (not just the current page)"
- Success criteria 2: "The downloaded filename reflects the active filter state (e.g. `specimens-bombus-2023.csv` or `samples-all.csv`)"
- The button text is "Download CSV" (from ROADMAP.md success criteria)
- The full parquet column lists are in `scripts/validate-schema.mjs` — use those as the source of truth for what `SELECT *` returns

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 41-csv-export*
*Context gathered: 2026-04-08*
