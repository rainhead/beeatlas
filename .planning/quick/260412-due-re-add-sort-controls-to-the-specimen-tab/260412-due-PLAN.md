---
phase: quick-260412-due
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/filter.ts
  - frontend/src/bee-table.ts
  - frontend/src/bee-atlas.ts
  - frontend/src/tests/bee-table.test.ts
  - frontend/src/tests/filter.test.ts
autonomous: true
requirements: [SORT-01]

must_haves:
  truths:
    - "Specimen table header shows clickable sort indicators on Date and Modified columns"
    - "Clicking Date header sorts by date DESC (newest first) as primary discriminant"
    - "Clicking Modified header sorts by modified DESC (newest first) as primary discriminant"
    - "Active sort column is visually indicated"
    - "Sort resets page to 1"
    - "Sample table has no sort controls (only specimen table)"
  artifacts:
    - path: "frontend/src/filter.ts"
      provides: "queryTablePage accepts sortBy parameter to vary ORDER BY"
    - path: "frontend/src/bee-table.ts"
      provides: "Sort UI controls on Date and Modified column headers"
    - path: "frontend/src/bee-atlas.ts"
      provides: "Sort state management and event wiring"
  key_links:
    - from: "frontend/src/bee-table.ts"
      to: "frontend/src/bee-atlas.ts"
      via: "sort-changed custom event"
      pattern: "sort-changed"
    - from: "frontend/src/bee-atlas.ts"
      to: "frontend/src/filter.ts"
      via: "queryTablePage sortBy parameter"
      pattern: "queryTablePage.*sortBy"
---

<objective>
Add sort controls to the specimen table for `date` and `modified` columns. Both sort newest-to-oldest (DESC). The `date` sort matches the current default sort order. The `modified` sort replaces `date` with `modified` as the first discriminant. No ascending sort is needed.

Purpose: Let users toggle between seeing most-recently-collected vs most-recently-modified specimens.
Output: Clickable sort headers on Date and Modified columns in the specimen table.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@frontend/src/filter.ts
@frontend/src/bee-table.ts
@frontend/src/bee-atlas.ts
@frontend/src/tests/bee-table.test.ts
@frontend/src/tests/filter.test.ts

<interfaces>
From frontend/src/filter.ts:
```typescript
// Current ORDER BY constants (line 71-72):
const SPECIMEN_ORDER = 'date DESC, recordedBy ASC, fieldNumber ASC';
const SAMPLE_ORDER = 'date DESC, observer ASC, sample_id ASC';

// queryTablePage signature (line 156-160):
export async function queryTablePage(
  f: FilterState,
  layerMode: 'specimens' | 'samples',
  page: number
): Promise<{ rows: SpecimenRow[] | SampleRow[]; total: number }>
```

From frontend/src/bee-table.ts:
```typescript
// Column defs include date (key: 'date') and modified (key: 'modified')
// bee-table is a pure presenter — receives props, emits events upward

@property({ attribute: false }) rows: SpecimenRow[] | SampleRow[] = [];
@property({ attribute: false }) rowCount = 0;
@property({ attribute: false }) layerMode: 'specimens' | 'samples' = 'specimens';
@property({ attribute: false }) page = 1;
@property({ attribute: false }) loading = false;
```

From frontend/src/bee-atlas.ts:
```typescript
// bee-atlas owns state, passes to bee-table (line 160-168):
// .rows, .rowCount, .layerMode, .page, .loading
// Listens to @page-changed, @download-csv

// _runTableQuery calls queryTablePage(filterState, layerMode, tablePage) at line 419
@state() private _tablePage = 1;
@state() private _tableRows: SpecimenRow[] | SampleRow[] = [];
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add sortBy parameter to queryTablePage and sort type</name>
  <files>frontend/src/filter.ts, frontend/src/tests/filter.test.ts</files>
  <behavior>
    - queryTablePage('specimens', sortBy='date') uses ORDER BY: date DESC, recordedBy ASC, fieldNumber ASC (existing default)
    - queryTablePage('specimens', sortBy='modified') uses ORDER BY: modified DESC, recordedBy ASC, fieldNumber ASC
    - queryTablePage('samples', ...) always uses SAMPLE_ORDER regardless of sortBy (samples have no sort controls)
    - queryTablePage without sortBy defaults to 'date' (backward compat)
  </behavior>
  <action>
1. In `filter.ts`, export a type: `export type SpecimenSortBy = 'date' | 'modified';`
2. Add a second ORDER BY constant: `const SPECIMEN_ORDER_MODIFIED = 'modified DESC, recordedBy ASC, fieldNumber ASC';`
3. Add `sortBy: SpecimenSortBy = 'date'` as optional 4th parameter to `queryTablePage`.
4. Inside `queryTablePage`, compute `orderBy` as: if `layerMode === 'specimens'` then `sortBy === 'modified' ? SPECIMEN_ORDER_MODIFIED : SPECIMEN_ORDER`, else `SAMPLE_ORDER`.
5. Similarly update `queryAllFiltered` to accept `sortBy` parameter (for CSV download to respect sort).
6. In `filter.test.ts`, add tests: one that calls `queryTablePage(emptyFilter(), 'specimens', 1, 'modified')` and checks the SQL contains `modified DESC`; one that confirms the default (no sortBy arg) still produces `date DESC`.
  </action>
  <verify>
    <automated>cd /Users/rainhead/dev/beeatlas/frontend && npm test -- --run</automated>
  </verify>
  <done>queryTablePage accepts sortBy param, uses correct ORDER BY per value, tests pass</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add sort controls to bee-table and wire through bee-atlas</name>
  <files>frontend/src/bee-table.ts, frontend/src/bee-atlas.ts, frontend/src/tests/bee-table.test.ts</files>
  <behavior>
    - bee-table in specimen mode shows sort indicator (down arrow) on the active sort column header (Date or Modified)
    - Clicking Date header dispatches sort-changed event with detail { sortBy: 'date' }
    - Clicking Modified header dispatches sort-changed event with detail { sortBy: 'modified' }
    - In sample mode, no sort indicators or click handlers on headers
    - bee-atlas passes sortBy to bee-table, listens to sort-changed, resets page to 1, re-runs query
  </behavior>
  <action>
1. In `bee-table.ts`:
   - Import `SpecimenSortBy` from `./filter.ts`.
   - Add property: `@property({ attribute: false }) sortBy: SpecimenSortBy = 'date';`
   - Add CSS for sortable headers: `.sortable { cursor: pointer; user-select: none; }` and `.sort-indicator { margin-left: 4px; font-size: 0.75rem; }`
   - In the `<th>` rendering for specimen columns, for columns with key `'date'` or `'modified'`: add class `sortable`, add click handler that dispatches `sort-changed` custom event with `{ sortBy: col.key }` (bubbles, composed). Show a down arrow indicator span (class `sort-indicator`) only when `this.sortBy === col.key`, using the unicode character `\u25BC`.
   - Add private method `_onSortClick(sortBy: SpecimenSortBy)` that dispatches `new CustomEvent('sort-changed', { detail: { sortBy }, bubbles: true, composed: true })`.
   - Only render sort controls when `this.layerMode === 'specimens'`.

2. In `bee-atlas.ts`:
   - Add `@state() private _tableSortBy: SpecimenSortBy = 'date';` (import `SpecimenSortBy` from filter.ts).
   - In the `<bee-table>` template, add `.sortBy=${this._tableSortBy}` and `@sort-changed=${this._onSortChanged}`.
   - Add handler `_onSortChanged(e: CustomEvent<{ sortBy: SpecimenSortBy }>)` that sets `this._tableSortBy = e.detail.sortBy`, resets `this._tablePage = 1`, and calls `this._runTableQuery()`.
   - In `_runTableQuery`, pass `this._tableSortBy` as 4th arg to `queryTablePage`.
   - In `_onDownloadCsv`, pass `this._tableSortBy` to `queryAllFiltered`.
   - Reset `_tableSortBy` to `'date'` when layer mode changes to samples (in `_onLayerChanged`).

3. In `bee-table.test.ts`:
   - Update `createBeeTable` helper to accept optional `sortBy` prop.
   - Add test: specimen mode with sortBy='date' shows sort indicator on Date header.
   - Add test: specimen mode with sortBy='modified' shows sort indicator on Modified header.
   - Add test: clicking Modified header dispatches sort-changed event with { sortBy: 'modified' }.
   - Add test: sample mode shows no sort indicators.
  </action>
  <verify>
    <automated>cd /Users/rainhead/dev/beeatlas/frontend && npm test -- --run</automated>
  </verify>
  <done>Sort controls visible on Date and Modified specimen columns, clicking toggles sort, bee-atlas manages state and passes to query layer, all tests pass</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

No new trust boundaries. Sort column values are constrained to a union type ('date' | 'modified') and mapped to hardcoded SQL ORDER BY strings -- no user input reaches SQL.

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-01 | T (Tampering) | filter.ts sortBy param | accept | sortBy is a TypeScript union type; only 'date' or 'modified' map to hardcoded ORDER BY strings. No injection vector. |
</threat_model>

<verification>
- `cd frontend && npm test -- --run` passes all existing and new tests
- Dev server shows sort indicators on Date and Modified columns in specimen table view
- Clicking Modified header re-sorts table by modified date
- Clicking Date header restores default date sort
- Sample table has no sort controls
</verification>

<success_criteria>
- Specimen table Date and Modified column headers are clickable with visual sort indicator
- Clicking Modified sorts by modified DESC as primary key
- Clicking Date sorts by date DESC as primary key (default)
- Page resets to 1 on sort change
- Sample table is unaffected
- All tests pass
</success_criteria>

<output>
After completion, create `.planning/quick/260412-due-re-add-sort-controls-to-the-specimen-tab/260412-due-SUMMARY.md`
</output>
