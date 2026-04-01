# Phase 32: SQL Filter Layer - Context

**Gathered:** 2026-03-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace `matchesFilter()` (synchronous JS predicate evaluated per-feature in style callbacks) with a DuckDB SQL query that produces a `Set<featureId>`. Style callbacks change from `matchesFilter(feature, filterState)` to `visibleIds.has(featureId)`. The `FilterState` singleton and all filter event wiring in `bee-map.ts` stay intact — Phase 32 adds an async DuckDB query step between `filterState` mutation and `source.changed()` repaint trigger.

All 6 existing filter types (taxon, year, month, county, ecoregion) preserved. URL round-trip, clear-filters, boundary highlight, and autocomplete all preserved unchanged.

Scope does NOT include: new filter types, filter UI redesign, tabular views, or spatial SQL geometry work.

</domain>

<decisions>
## Implementation Decisions

### Sample Feature Filtering
- **D-01:** All filter types apply to sample dots — preserving exact current `matchesFilter` behavior:
  - Year, month, county, ecoregion filters apply to samples (samples have these columns in the `samples` table)
  - Taxon filter (family/genus/species) ghosts all samples — samples have no taxonomic columns → no rows match → samples absent from `visibleSampleIds`
  - Requires a **separate SQL query against the `samples` table** in addition to the ecdysis query

### visibleIds Shape
- **D-02:** Two separate sets: `visibleEcdysisIds: Set<string>` and `visibleSampleIds: Set<string>`. Feature IDs use existing prefixes: `ecdysis:${ecdysis_id}` and `inat:${observation_id}`. Style callbacks for specimen cluster and sample dot check their respective set.

### Async Gap State
- **D-03:** Claude's discretion — recommended: keep previous `visibleIds` sets until new query resolves, then swap and call `source.changed()`. This avoids a flash-of-all-features or flash-of-empty-map during the ~1–5ms DuckDB query.

### filter.ts Evolution
- **D-04:** Remove `matchesFilter()` from `filter.ts`. Keep `FilterState` interface, `filterState` singleton, and `isFilterActive()`. Add a `buildFilterSQL(f: FilterState)` function (or equivalent) that returns `{ ecdysisSQL: string, samplesSQL: string }` WHERE clause strings. The no-filter fast path (`!isFilterActive(fs)`) skips the DuckDB query and sets both sets to null (style callbacks treat null as "show all").

### bee-map.ts Filter Handler
- **D-05:** The filter event handler (line ~568) currently: mutates `filterState` → calls `source.changed()`. Phase 32 changes it to: mutates `filterState` → runs DuckDB query async → updates `visibleEcdysisIds`/`visibleSampleIds` → calls `source.changed()`. All other bee-map.ts code (URL state, clear-filters, boundary highlight, autocomplete) is unchanged — those code paths mutate `filterState` and call `source.changed()` the same way.

### Claude's Discretion
- Exact module where `visibleEcdysisIds`/`visibleSampleIds` live (in `filter.ts` or a new `filter-sql.ts`)
- SQL column-level quoting style (DuckDB is permissive)
- Console logging format for SQL WHERE clauses (success criteria requires devtools visibility)
- Whether to debounce rapid filter changes before firing DuckDB query

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Filter Implementation
- `frontend/src/filter.ts` — Current `FilterState` interface, `filterState` singleton, `matchesFilter()`, `isFilterActive()` — this file gets modified in Phase 32
- `frontend/src/style.ts` — Two call sites for `matchesFilter`: cluster style (line 39/48/51) and individual dot style (line 97/98) — both switch to `visibleIds.has()`
- `frontend/src/bee-map.ts` — Filter event handler (~line 568), filter mutation sites, `clusterSource.changed()` / `sampleSource.changed()` repaint triggers, URL state builder call

### DuckDB API
- `frontend/src/duckdb.ts` — `getDuckDB()`, `tablesReady` promise, `loadAllTables()`; tables available: `ecdysis`, `samples`, `counties`, `ecoregions`
- `frontend/src/features.ts` — Phase 31 output; shows `conn.query()` → `table.toArray()` → `.toJSON()` pattern and BigInt coercion approach

### Requirements
- `.planning/REQUIREMENTS.md` §FILT-01–07 — Acceptance criteria for all filter types

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getDuckDB()` + `tablesReady` from `duckdb.ts` — same pattern as features.ts; `await tablesReady` before first query
- `isFilterActive(filterState)` — keep as fast-path guard; when false, skip DuckDB query and treat all features as visible
- `FilterState` interface — unchanged; drives SQL builder inputs

### Established Patterns
- Feature ID pattern: `ecdysis:${id}` (ecdysis), `inat:${id}` (samples) — Set membership check uses these same strings
- DuckDB query pattern from features.ts: `const conn = await db.connect(); try { const result = await conn.query(sql); ... } finally { await conn.close(); }`
- BigInt coercion: ecdysis_id and observation_id come back as BigInt from DuckDB; `Number()` cast for Set key construction
- Repaint trigger: `clusterSource.changed()` + `sampleSource.changed()` — same call sites, just now called after async query resolves

### Integration Points
- `style.ts` lines 39/48/51 and 97/98 — replace `matchesFilter(feature, filterState)` with `visibleIds.has(feature.getId())`; also update the `isFilterActive` check to use a null-check on the visibleIds set
- `bee-map.ts` filter handler (~line 568) — make async; add DuckDB query step before `source.changed()` calls
- `filter.ts` — remove `matchesFilter`, add SQL builder function

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard SQL predicate construction approach.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 32-sql-filter-layer*
*Context gathered: 2026-03-31*
