---
phase: quick
plan: 260408-tkd
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/filter.ts
  - frontend/src/bee-table.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "Specimen table rows show a clickable link to the ecdysis occurrence page"
    - "Sample table rows show a clickable link to the iNaturalist observation page"
    - "Links open in a new tab"
    - "Existing table columns and pagination still work"
  artifacts:
    - path: "frontend/src/filter.ts"
      provides: "SpecimenRow.ecdysis_id and SampleRow.observation_id fields; queryTablePage selects these columns"
    - path: "frontend/src/bee-table.ts"
      provides: "Link column rendering for ecdysis and iNat URLs"
  key_links:
    - from: "frontend/src/filter.ts"
      to: "DuckDB ecdysis/samples tables"
      via: "queryTablePage SQL select"
      pattern: "ecdysis_id|observation_id"
    - from: "frontend/src/bee-table.ts"
      to: "frontend/src/filter.ts"
      via: "SpecimenRow/SampleRow types"
      pattern: "ecdysis_id|observation_id"
---

<objective>
Add clickable source links to the specimen and sample tables so users can navigate directly to the original ecdysis occurrence or iNaturalist observation page.

Purpose: Users viewing tabular data need a way to drill into the original data source for each row.
Output: Each table row has a "Source" link column that opens the ecdysis/iNat page in a new tab.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@frontend/src/filter.ts
@frontend/src/bee-table.ts
@frontend/src/bee-atlas.ts

<interfaces>
<!-- From frontend/src/filter.ts — row types and column maps the executor must modify -->

```typescript
export interface SpecimenRow {
  scientificName: string;
  recordedBy: string;
  date: string;
  year: number;
  month: number;
  county: string;
  ecoregion_l3: string;
  fieldNumber: string;
}

export interface SampleRow {
  observer: string;
  date: string;
  specimen_count: number;
  sample_id: number | null;
  county: string;
  ecoregion_l3: string;
}

export const SPECIMEN_COLUMNS: Record<string, string> = { ... };
export const SAMPLE_COLUMNS: Record<string, string> = { ... };
```

<!-- From frontend/src/bee-table.ts — column definition interface -->

```typescript
interface ColumnDef {
  key: string;
  label: string;
  dataField: string;
  minWidth: string;
}
```

<!-- URL patterns already established in queryAllFiltered(): -->
<!-- Ecdysis: https://ecdysis.org/collections/individual/index.php?occid={ecdysis_id} -->
<!-- iNat: https://www.inaturalist.org/observations/{observation_id} -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add ID fields to row types and queryTablePage SQL</name>
  <files>frontend/src/filter.ts</files>
  <action>
In filter.ts, make three changes:

1. Add `ecdysis_id: number` to the `SpecimenRow` interface.
2. Add `observation_id: number` to the `SampleRow` interface.
3. Add the ID columns to the column maps so queryTablePage includes them in the SELECT:
   - Add `ecdysisId: 'ecdysis_id'` to `SPECIMEN_COLUMNS`
   - Add `observationId: 'observation_id'` to `SAMPLE_COLUMNS`

These columns already exist in the DuckDB tables (ecdysis.ecdysis_id, samples.observation_id) and are used elsewhere (queryVisibleIds, queryAllFiltered). No schema changes needed.
  </action>
  <verify>
    <automated>cd /Users/rainhead/dev/beeatlas/frontend && npx tsc --noEmit</automated>
  </verify>
  <done>SpecimenRow has ecdysis_id field, SampleRow has observation_id field, queryTablePage SELECTs both columns</done>
</task>

<task type="auto">
  <name>Task 2: Add link column rendering to bee-table</name>
  <files>frontend/src/bee-table.ts</files>
  <action>
In bee-table.ts, make these changes:

1. Extend the `ColumnDef` interface with an optional `linkFn` property:
   ```typescript
   interface ColumnDef {
     key: string;
     label: string;
     dataField: string;
     minWidth: string;
     linkFn?: (row: any) => string | null;  // returns URL or null
   }
   ```

2. Add a "Source" column as the FIRST entry in `SPECIMEN_COLUMN_DEFS`:
   ```typescript
   { key: 'source', label: 'Source', dataField: 'ecdysis_id', minWidth: '6%',
     linkFn: (row) => row.ecdysis_id != null
       ? `https://ecdysis.org/collections/individual/index.php?occid=${row.ecdysis_id}`
       : null },
   ```

3. Add a "Source" column as the FIRST entry in `SAMPLE_COLUMN_DEFS`:
   ```typescript
   { key: 'source', label: 'Source', dataField: 'observation_id', minWidth: '6%',
     linkFn: (row) => row.observation_id != null
       ? `https://www.inaturalist.org/observations/${row.observation_id}`
       : null },
   ```

4. In the render method's cell-rendering logic (the inner `cols.map` that produces `<td>` elements), check for `col.linkFn`. If present and the function returns a non-null URL, render an anchor tag instead of plain text:
   ```typescript
   ${cols.map(col => {
     const cellText = String((row as any)[col.dataField] ?? '');
     if (col.linkFn) {
       const url = col.linkFn(row);
       if (url) {
         return html`<td><a href=${url} target="_blank" rel="noopener noreferrer">View</a></td>`;
       }
     }
     return html`<td title=${cellText}>${cellText}</td>`;
   })}
   ```

5. Add a CSS rule for the link styling inside the existing `static styles`:
   ```css
   td a {
     color: var(--link, #1a73e8);
     text-decoration: none;
   }
   td a:hover {
     text-decoration: underline;
   }
   ```

The link text should be "View" (short, fits in a narrow column). The minWidth values of other columns may need slight adjustment to accommodate the new 6% source column -- reduce the widest existing column by ~6% to compensate (e.g., specimens: reduce Species from 28% to 22%; samples: reduce Ecoregion from 30% to 24%).
  </action>
  <verify>
    <automated>cd /Users/rainhead/dev/beeatlas/frontend && npx tsc --noEmit && npm test -- --run 2>&1 | tail -20</automated>
  </verify>
  <done>Specimen table shows "View" link in first column pointing to ecdysis URL; sample table shows "View" link pointing to iNat URL; links open in new tab; all other columns still render correctly</done>
</task>

</tasks>

<verification>
1. `cd frontend && npx tsc --noEmit` — no type errors
2. `cd frontend && npm test -- --run` — existing tests pass
3. Manual: `cd frontend && npm run dev`, switch to table view, confirm "Source" column appears with "View" links; click one to verify it opens correct ecdysis/iNat URL in new tab
</verification>

<success_criteria>
- Specimen table has a "Source" column with clickable "View" links to ecdysis occurrence pages
- Sample table has a "Source" column with clickable "View" links to iNaturalist observation pages
- Links open in new tab (target="_blank")
- No TypeScript errors, existing tests pass
</success_criteria>

<output>
After completion, create `.planning/quick/260408-tkd-add-occurrence-observation-id-columns-to/260408-tkd-SUMMARY.md`
</output>
