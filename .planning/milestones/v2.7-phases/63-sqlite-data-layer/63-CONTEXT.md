# Phase 63: SQLite Data Layer - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

`sqlite.ts` loads `occurrences.parquet` into a single `occurrences` SQLite table; `ecdysis` and `samples` tables are removed. `filter.ts` and all query functions (`queryVisibleIds`, `queryTablePage`, `queryAllFiltered`, `queryFilteredCounts`) are updated to query the unified table. `buildFilterSQL` returns a single WHERE clause. `features.ts` (`EcdysisSource`, `SampleSource`) and the bee-table/bee-atlas layer mode UI are untouched — those are Phase 64/65.

</domain>

<decisions>
## Implementation Decisions

### Year/Month Filter Behavior
- **D-01:** Year and month filters use natural null exclusion. `year >= X` and `month IN (...)` naturally exclude sample-only rows because `year` and `month` are specimen-side columns (null for sample-only rows). No `strftime` derivation for rows with null year/month. Consistent behavior for both filters.

### layerMode Handling
- **D-02:** `queryTablePage`, `queryAllFiltered`, and related functions keep the `layerMode: 'specimens' | 'samples'` parameter. Phase 63 narrows the unified `occurrences` table by row type:
  - specimens mode: `WHERE ecdysis_id IS NOT NULL` (includes linked rows — matches old ecdysis table)
  - samples mode: `WHERE observation_id IS NOT NULL` (includes linked rows — matches old samples table; linked rows appear in both modes)
- **D-03:** Phase 65 removes `layerMode` entirely. Phase 63 preserves it to avoid touching `bee-table.ts` and `bee-atlas.ts`.

### Taxon Filter
- **D-04:** No ghost clause needed. `family = 'Apidae'` (or `genus = 'X'`, `scientificName = 'X'`) naturally excludes sample-only rows via SQL null comparison semantics. The `1 = 0` ghost clause is removed.

### Collector Filter
- **D-05:** Single OR clause: `(recordedBy IN (...) OR observer IN (...))`. No bifurcation between two tables.

### buildFilterSQL API Shape
- **D-06 (Claude's Discretion):** `buildFilterSQL` returns `{ occurrenceWhere: string }` (single WHERE clause). All callers updated. Filter unit tests updated to destructure `occurrenceWhere` instead of `{ ecdysisWhere, samplesWhere }` — the SQL pattern assertions (county IN, year >=, etc.) remain identical; only the property name changes. Tests checking `samplesWhere === '1 = 0'` are removed (that behavior no longer exists).

### queryVisibleIds
- **D-07 (Claude's Discretion):** Return type stays `{ ecdysis: Set<string>; samples: Set<string> }` (Phase 64 callers are unchanged). Implementation queries the unified table twice:
  - `WHERE ecdysis_id IS NOT NULL AND <occurrenceWhere>` → `ecdysis:<id>`
  - `WHERE observation_id IS NOT NULL AND <occurrenceWhere>` → `inat:<id>`
  Linked rows appear in both sets, consistent with old behavior.

### sqlite.ts Changes
- **D-08 (Claude's Discretion):** `loadAllTables` is renamed to `loadOccurrencesTable` (or similar). Creates single `occurrences` table matching the `occurrences.parquet` column list from `validate-schema.mjs`. Loads `occurrences.parquet` via hyparquet.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Schema
- `scripts/validate-schema.mjs` — authoritative `occurrences.parquet` column list (specimen-side, sample-side, unified columns)

### Source Files to Modify
- `frontend/src/sqlite.ts` — loadAllTables → loadOccurrencesTable, two tables → one
- `frontend/src/filter.ts` — buildFilterSQL, queryVisibleIds, queryTablePage, queryAllFiltered, queryFilteredCounts
- `frontend/src/tests/filter.test.ts` — update destructuring from { ecdysisWhere, samplesWhere } to { occurrenceWhere }

### Requirements
- `.planning/REQUIREMENTS.md` §OCC-05, §OCC-06 — single occurrences table, unified filter SQL

### Prior Phase Context
- `.planning/phases/62-pipeline-join/62-CONTEXT.md` — unified schema decisions (coordinate precedence, join key, column list)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `_insertRows` helper in `sqlite.ts:130` — generic row inserter, works for any table/column set; reuse as-is
- `_serializedExec` queue in `sqlite.ts:25` — must be preserved; wa-sqlite Asyncify requires serialized exec calls

### Established Patterns
- `tablesReady` promise resolved after all rows loaded — keep this signal, just resolve after `occurrences` is loaded
- All query functions await `tablesReady` before querying — pattern stays unchanged

### Integration Points
- `features.ts` imports `getDB, tablesReady` from `sqlite.ts` — function signature unchanged, no edits needed in Phase 63
- `bee-atlas.ts` calls `loadAllTables` (or renamed equivalent) — one call site to update
- Filter unit tests mock `getDB` and `loadAllTables` from `sqlite.ts` — mock needs to export the renamed function

### layerMode Narrowing
- The `ecdysis_id` column is the discriminator: `IS NOT NULL` → specimen-backed; samples mode uses `observation_id IS NOT NULL`
- Both `queryTablePage` and `queryAllFiltered` build their SELECT column list from `layerMode`; the column lists themselves need updating for the unified schema

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches within the decisions above.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 63-sqlite-data-layer*
*Context gathered: 2026-04-17*
