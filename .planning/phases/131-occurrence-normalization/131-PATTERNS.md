# Phase 131: Occurrence Normalization - Pattern Map

**Mapped:** 2026-06-02
**Files analyzed:** 8 (all modifications to existing files; no new files)
**Analogs found:** 8 / 8 (all files read directly; patterns extracted from within the same files)

---

## File Classification

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|-----------|----------------|---------------|
| `src/filter.ts` | query layer / types | CRUD request-response | `src/filter.ts` `queryVisibleGeoJSON` (same file, same JOIN idiom) | exact |
| `src/features.ts` | transform / decoder | batch transform | `src/features.ts` current `_buildGeoJSONFromRaw` (same function being rewritten) | exact |
| `src/bee-table.ts` | presenter component | request-response | `src/bee-occurrence-detail.ts` `_renderCollectorGroup` (same taxon_id field idiom) | role-match |
| `src/bee-occurrence-detail.ts` | presenter component | request-response | same file `_renderCollectorGroup` (L189-190) | exact |
| `data/sqlite_export.py` | pipeline transform | batch / file-I/O | `sqlite_export.py` `_GEO_COLS` itself (same list being trimmed) | exact |
| `data/dbt/models/marts/schema.yml` | config / contract | config | existing `- name: canonical_name` entry (retained entry shape) | exact |
| `data/dbt/models/marts/occurrences.sql` | model / transform | batch | existing SELECT at L83-101 (same list being trimmed) | exact |
| `data/dbt/models/intermediate/int_specimen_obs_base.sql` | model / transform | batch | same file L1-16 (same SELECT being trimmed) | exact |
| `src/tests/build-geojson.test.ts` | test | batch transform | same file (full rewrite; current structure is the idiom to replace) | exact |
| `src/tests/filter.test.ts` | test | request-response | same file `queryTablePage` describe block (L317-398) | exact |
| `src/tests/bee-table.test.ts` | test | request-response | same file fixture objects at L150-163, L220-233 | exact |

---

## Pattern Assignments

### 1. `src/filter.ts` — OccurrenceRow, OCCURRENCE_COLUMNS, queryTablePage / queryListPage / queryAllFiltered

**Role:** query layer + type definitions
**Data flow:** CRUD request-response (wa-sqlite `exec` callbacks)

#### 1a. OccurrenceRow fields to drop (lines 50, 53, 54, 67)

Current shape being modified:
```typescript
// filter.ts:40-77 (current)
export interface OccurrenceRow {
  taxon_id: number | null;          // L41 — RETAINED
  // ...
  scientificName: string | null;    // L50 — DROP
  // ...
  genus: string | null;             // L53 — DROP
  family: string | null;            // L54 — DROP
  // ...
  specimen_inat_taxon_name: string | null;  // L67 — DROP
  // ...
}
```

New field to ADD (query-level augmentation, not a mart column):
```typescript
  display_name: string | null;   // JOIN-resolved from taxa.name; null when taxon_id IS NULL
```

**Analog for query-level augmentation pattern:** `canonical_name` is already a mart column that does NOT appear in `OCCURRENCE_COLUMNS` (verified: absent from `filter.ts:79-87`). This establishes the precedent that mart columns can be selectively omitted from `OCCURRENCE_COLUMNS`. `display_name` follows the inverse pattern: it is NOT a mart column but IS added to `OccurrenceRow` and the SELECT because it is query-augmented via JOIN.

#### 1b. OCCURRENCE_COLUMNS entries to drop (lines 81, 82, 85)

Current (lines 79-87):
```typescript
export const OCCURRENCE_COLUMNS = [
  'taxon_id', 'lat', 'lon', 'date', 'county', 'ecoregion_l3', 'place_slug',
  'ecdysis_id', 'catalog_number', 'scientificName', 'recordedBy', 'fieldNumber',  // L81: drop 'scientificName'
  'genus', 'family', 'floralHost', 'host_observation_id', 'inat_host',             // L82: drop 'genus', 'family'
  'inat_quality_grade', 'modified', 'specimen_observation_id', 'elevation_m',
  'year', 'month', 'observation_id', 'host_inat_login', 'specimen_count', 'sample_id', 'sample_host',
  'is_provisional', 'specimen_inat_taxon_name', 'specimen_inat_quality_grade',     // L85: drop 'specimen_inat_taxon_name'
  'source', 'image_url', 'obs_url', 'user_login', 'license',
] as const;
```

After dropping 4 entries: 36 → 32 entries. `display_name` is NOT added here — it is a JOIN alias, not a mart column.

#### 1c. queryTablePage SELECT restructure (lines 192-213)

Current SELECT pattern (lines 192-213):
```typescript
// filter.ts:192-213 (current)
const selectCols = OCCURRENCE_COLUMNS.join(', ');
// ...
`SELECT ${selectCols} FROM occurrences WHERE ${occurrenceWhere} ORDER BY ${orderBy} LIMIT ${PAGE_SIZE} OFFSET ${offset}`
```

**New pattern — LEFT JOIN taxa + o. prefix:**
```typescript
const selectCols = OCCURRENCE_COLUMNS.map(c => `o.${c}`).join(', ') + ', t.name AS display_name';
// ...
`SELECT ${selectCols} FROM occurrences o LEFT JOIN taxa t ON t.taxon_id = o.taxon_id WHERE ${occurrenceWhere} ORDER BY ${orderBy} LIMIT ${PAGE_SIZE} OFFSET ${offset}`
```

**Why `o.` prefix is required:** `taxa` table has its own `taxon_id`, `name`, `rank` columns. Without the `o.` prefix, `SELECT taxon_id` is ambiguous when joining. See RESEARCH.md Pitfall 4.

**Analog for integer interpolation in WHERE clause (T-130-01):** The taxon descendant subquery at `filter.ts:235-241` is the established pattern for embedding TypeScript numbers directly in SQL without quoting:
```typescript
// filter.ts:235-241
if (f.taxonId !== null) {
  occurrenceClauses.push(
    `(taxon_id = ${f.taxonId} OR taxon_id IN (` +
    `SELECT taxon_id FROM taxa ` +
    `WHERE lineage_path IS NOT NULL ` +
    `AND instr(lineage_path, '/${f.taxonId}/') > 0))`
  );
}
```
The JOIN ON clause `t.taxon_id = o.taxon_id` follows the same integer-safe pattern (both sides are DB-origin integers).

#### 1d. Same restructure applies to queryListPage (lines 435-450) and queryAllFiltered (lines 156-169)

queryListPage current (lines 435-450):
```typescript
const selectCols = OCCURRENCE_COLUMNS.join(', ');
// ...
`SELECT ${selectCols} FROM occurrences WHERE ${fullWhere} ORDER BY ${orderBy} LIMIT ${PAGE_SIZE} OFFSET ${offset}`
```

queryAllFiltered current (lines 156-169):
```typescript
const selectCols = OCCURRENCE_COLUMNS.join(', ');
// ...
`SELECT ${selectCols} FROM occurrences WHERE ${occurrenceWhere} ORDER BY ${orderBy}`
```

Both get the same `o.` prefix + JOIN treatment as queryTablePage. queryAllFiltered also benefits (CSV export gets resolved names).

#### 1e. Dead code to delete entirely

`filter.ts:303-330` — `FilteredCounts` interface and `queryFilteredCounts` function (zero consumers, reads dropped columns):
```typescript
// filter.ts:303-330 — DELETE ENTIRELY
export interface FilteredCounts {
  filteredSpecimens: number;
  filteredSpeciesCount: number;
  filteredGenusCount: number;
  filteredFamilyCount: number;
}

export async function queryFilteredCounts(f: FilterState): Promise<FilteredCounts | null> {
  // ... SELECT COUNT(DISTINCT scientificName/genus/family) ...
}
```

`filter.ts:362-368` — `DataSummary` fields to remove:
```typescript
// filter.ts:362-368 (current)
export interface DataSummary {
  totalSpecimens: number;
  speciesCount: number;   // DROP
  genusCount: number;     // DROP
  familyCount: number;    // DROP
  earliestYear: number;
  latestYear: number;
}
```

---

### 2. `src/features.ts` — geo_blob decode + dead path removal

**Role:** pipeline transform / GeoJSON builder
**Data flow:** batch transform (parse JSON blob → GeoJSON FeatureCollection)

#### 2a. Current geo_blob decode (lines 14-39) — the code being replaced

```typescript
// features.ts:14-39 (current — REPLACE)
// Column layout: [lat, lon, ecdysis_id, observation_id, specimen_observation_id,
//                 year, scientificName, genus, family, source]
export function _buildGeoJSONFromRaw(rows: unknown[][]): {
  geojson: FeatureCollection<Point, OccurrenceProperties>;
  summary: DataSummary;
  taxaOptions: TaxonOption[];
} {
  const features: Feature<Point, OccurrenceProperties>[] = [];
  const species = new Set<string>();    // L22 — DELETE
  const genera = new Set<string>();     // L23 — DELETE
  const families = new Set<string>();   // L24 — DELETE
  let minYear = Infinity, maxYear = -Infinity;

  for (const row of rows) {
    const lat = row[0] as number | null;
    const lon = row[1] as number | null;
    if (lat == null || lon == null) continue;
    const ecdysis_id = row[2];
    const observation_id = row[3];
    const specimen_observation_id = row[4];
    const year = Number(row[5]);
    const scientificName = row[6] as string | null;   // L36 — DELETE (was index 6)
    const genus = row[7] as string | null;             // L37 — DELETE
    const family = row[8] as string | null;            // L38 — DELETE
    const source = row[9] as string | null;            // L39 — REINDEX to 6
```

#### 2b. New 7-field decode pattern

```typescript
// features.ts — new decode (replace L14-79)
// Column layout: [lat, lon, ecdysis_id, observation_id, specimen_observation_id,
//                 year, source]
export function _buildGeoJSONFromRaw(rows: unknown[][]): {
  geojson: FeatureCollection<Point, OccurrenceProperties>;
} {
  const features: Feature<Point, OccurrenceProperties>[] = [];

  for (const row of rows) {
    const lat = row[0] as number | null;
    const lon = row[1] as number | null;
    if (lat == null || lon == null) continue;
    const ecdysis_id = row[2];
    const observation_id = row[3];
    const specimen_observation_id = row[4];
    const year = Number(row[5]);
    const source = row[6] as string | null;   // was row[9]; source moves to index 6
    // No scientificName, genus, family

    let occId: string | null = null;
    if (ecdysis_id != null) occId = `ecdysis:${ecdysis_id}`;
    else if (observation_id != null) occId = `inat:${observation_id}`;
    else if (specimen_observation_id != null) occId = `inat_obs:${specimen_observation_id}`;
    if (occId == null) continue;

    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: { occId, recencyTier: _recencyTier(year), source: source ?? '' },
    });
  }

  return { geojson: { type: 'FeatureCollection', features } };
}
```

**Warning (RESEARCH.md Pitfall 1):** `source` index changes from 9 to 6. `sqlite_export.py` and `features.ts` must change together in the same commit. If they diverge, `recencyTier` silently corrupts.

#### 2c. Dead code to delete (lines 62-78, 16-19, 83-85)

```typescript
// features.ts:62-78 — DELETE ENTIRELY (summary + taxaOptions build)
const summary: DataSummary = { ... };
const taxaOptions: TaxonOption[] = [ ... ];
return { geojson: ..., summary, taxaOptions };

// features.ts:16-19 — TRIM return type to { geojson: FeatureCollection<...> } only
// features.ts:81-85 — TRIM loadOccurrenceGeoJSON return type to { geojson } only
```

Also delete dead Sets at L22-24 and their ecdysis-only update block at L47-53.

---

### 3. `src/bee-table.ts` — Species column migration

**Role:** presenter component (Lit)
**Data flow:** request-response (renders rows from queryTablePage)

#### 3a. Species column ColumnDef (line 43)

Current:
```typescript
// bee-table.ts:43 (current)
{ key: 'species', label: 'Species', dataField: 'scientificName', minWidth: '180px', nullLabel: 'No Determination' },
```

Change to:
```typescript
{ key: 'species', label: 'Species', dataField: 'display_name', minWidth: '180px', nullLabel: 'No Determination' },
```

**How the dataField is consumed** (line 382 — do not change this):
```typescript
// bee-table.ts:382 — unchanged render pattern
const raw = col.valueFn ? col.valueFn(row) : (row as any)[col.dataField];
const cellText = raw != null ? String(raw) : '';
const displayText = (!cellText && col.nullLabel) ? col.nullLabel : cellText;
```

When `row.display_name` is null (unidentified row), `cellText` is `''`, `col.nullLabel` is `'No Determination'` — the null label fires correctly. No change to the render loop.

---

### 4. `src/bee-occurrence-detail.ts` — `_renderProvisional` migration

**Role:** presenter component (Lit)
**Data flow:** request-response (renders OccurrenceRow fields)

#### 4a. Current `_renderProvisional` (lines 235-254)

```typescript
// bee-occurrence-detail.ts:235-254 (current)
private _renderProvisional(row: OccurrenceRow) {
  const taxonEl = row.specimen_inat_taxon_name             // L236 — CHANGE to row.display_name
    ? html`<em>${row.specimen_inat_taxon_name}</em>`        // L237 — CHANGE
    : html`<span class="hint">identification pending</span>`;
  // ...
}
```

#### 4b. Analog for the null-check pattern (`_renderCollectorGroup`, lines 189-193)

This is the ESTABLISHED pattern in the same file for taxon_id-resolved names:
```typescript
// bee-occurrence-detail.ts:189-193 — COPY THIS NULL PATTERN
const info = row.taxon_id != null ? this.taxonCache?.get(row.taxon_id) : null;
const displayName = info?.name ?? null;
// then: displayName ? displayName : html`<span class="no-determination">No determination</span>`
```

`_renderProvisional` does NOT use `taxonCache` — it uses `row.display_name` directly from the JOIN result. The null idiom is the same: truthy value → render it; null → fallback span.

New `_renderProvisional` pattern:
```typescript
private _renderProvisional(row: OccurrenceRow) {
  const taxonEl = row.display_name
    ? html`<em>${row.display_name}</em>`
    : html`<span class="hint">identification pending</span>`;
  // rest of template unchanged
}
```

---

### 5. `data/sqlite_export.py` — `_GEO_COLS` rewrite

**Role:** pipeline transform (Python)
**Data flow:** batch / file-I/O

#### 5a. Current `_GEO_COLS` (lines 455-460)

```python
# sqlite_export.py:455-460 (current)
# Column order: [lat, lon, ecdysis_id, observation_id, specimen_observation_id,
#                year, scientificName, genus, family, source]
_GEO_COLS = [
    "lat", "lon", "ecdysis_id", "observation_id", "specimen_observation_id",
    "year", "scientificName", "genus", "family", "source",
]
```

#### 5b. New 7-field layout

```python
# sqlite_export.py:455-460 (new)
# Column order: [lat, lon, ecdysis_id, observation_id, specimen_observation_id,
#                year, source]
_GEO_COLS = [
    "lat", "lon", "ecdysis_id", "observation_id", "specimen_observation_id",
    "year", "source",
]
```

**Note on `select_expr` NULL-fallback** (line 463 — do NOT change this line):
```python
# sqlite_export.py:463 — unchanged; NULL-fallback handles any absent column gracefully
select_expr = ", ".join(c if c in actual else f"NULL AS {c}" for c in _GEO_COLS)
```
The NULL-fallback in `select_expr` is intentionally kept as a safety net, but the dropped names must be removed from `_GEO_COLS` — leaving them would write NULL strings into every row, preserving the per-row overhead and negating the size win.

---

### 6. `data/dbt/models/marts/schema.yml` — contract column drops

**Role:** config / dbt contract
**Data flow:** config

#### 6a. Column entry shape to use as surgical removal guide

Each dropped entry is a 2-line YAML block. The four entries to remove:

```yaml
# schema.yml:23-24 — DELETE these 2 lines
      - name: scientificName
        data_type: varchar
```

```yaml
# schema.yml:29-30 — DELETE these 2 lines
      - name: genus
        data_type: varchar
```

```yaml
# schema.yml:31-32 — DELETE these 2 lines
      - name: family
        data_type: varchar
```

```yaml
# schema.yml:57-58 — DELETE these 2 lines
      - name: specimen_inat_taxon_name
        data_type: varchar
```

**Retained entries (do NOT touch):**
```yaml
# schema.yml:63-64 — RETAINED (taxon_id not_null test's where clause depends on canonical_name)
      - name: canonical_name
        data_type: varchar
```

```yaml
# schema.yml:81-93 — RETAINED (taxon_id + not_null test with where clause)
      - name: taxon_id
        data_type: integer
        data_tests:
          - not_null:
              config:
                severity: warn
                where: "canonical_name is not null and canonical_name <> '' and canonical_name not in ('anthidiellum robertsoni', 'lasioglossum aspilurus', 'osmia phaceliae')"
```

**After removals:** 37 entries → 33 entries. `dbt build` enforces the contract — the SELECT must match exactly.

---

### 7. `data/dbt/models/marts/occurrences.sql` — SELECT trim

**Role:** dbt model
**Data flow:** batch transform

#### 7a. Current final SELECT (lines 83-101)

```sql
-- occurrences.sql:83-101 (current)
SELECT
    j.ecdysis_id, j.catalog_number,
    j.lon, j.lat, j.date, j.year, j.month,
    j.scientificName, j.recordedBy, j.fieldNumber, j.genus, j.family,   -- L86: drop j.scientificName, j.genus, j.family
    j.floralHost, j.host_observation_id, j.inat_host, j.inat_quality_grade,
    j.modified, j.specimen_observation_id, j.elevation_m,
    j.observation_id, j.host_inat_login, j.specimen_count, j.sample_id,
    j.sample_host,
    j.specimen_inat_taxon_name, j.specimen_inat_quality_grade,           -- L91: drop j.specimen_inat_taxon_name
    j.is_provisional,
    j.canonical_name,
    j.taxon_id,
    j.source, j.image_url, j.obs_url, j.user_login, j.license,
    fc.county, fe.ecoregion_l3,
    fp.place_slug
```

**Surgical changes:** remove `j.scientificName,` and `j.genus, j.family,` from L86; remove `j.specimen_inat_taxon_name,` from L91. Result must exactly match schema.yml's 33-column list. `j.canonical_name` and `j.taxon_id` are RETAINED.

---

### 8. `data/dbt/models/intermediate/int_specimen_obs_base.sql` — dead column removal

**Role:** dbt intermediate model
**Data flow:** batch transform

#### 8a. Full current file (16 lines)

```sql
-- int_specimen_obs_base.sql:1-16 (current — full file)
SELECT
    waba.id                             AS waba_obs_id,
    waba._dlt_id                        AS waba_dlt_id,
    waba.user__login                    AS specimen_inat_login,
    waba.taxon__name                    AS specimen_inat_taxon_name,
    waba.longitude,
    waba.latitude,
    waba.observed_on,
    waba.quality_grade,
    tl.genus                            AS specimen_inat_genus,    -- L12: DELETE
    tl.family                           AS specimen_inat_family    -- L13: DELETE
FROM {{ ref('stg_waba__observations') }} waba
LEFT JOIN {{ ref('stg_waba__taxon_lineage') }} tl ON tl.taxon_id = waba.taxon__id
```

Delete lines 12-13 (`tl.genus AS specimen_inat_genus` and `tl.family AS specimen_inat_family`). These columns feed nothing downstream in the mart — they are dead aliases from the JOIN. Removing lines 12-13 also means the LEFT JOIN on `stg_waba__taxon_lineage` is only needed for... nothing else in this file, but leave the JOIN intact since `specimen_inat_taxon_name` (line 7, via `waba.taxon__name`) is retained and the JOIN resolves other potential future columns. Actually verify: `waba.taxon__name` does NOT require the `tl` JOIN (it comes from `waba` directly). If no other column uses `tl` after the deletion, the LEFT JOIN itself can be removed too. Check this during implementation.

---

## Test File Patterns

### 9. `src/tests/build-geojson.test.ts` — full rewrite

**Role:** test
**Current structure to replace:** the `toRow()` helper and 10-field `RowOverride` interface are the idiom — copy the structure but reduce to 7 fields and remove all `summary`/`taxaOptions` assertions.

Current fixture helper (lines 6-16):
```typescript
// build-geojson.test.ts:6-16 (current — REWRITE)
interface RowOverride {
  lat?: number | null; lon?: number | null;
  ecdysis_id?: number | null; observation_id?: number | null; specimen_observation_id?: number | null;
  year?: number | null; scientificName?: string | null; genus?: string | null;
  family?: string | null; source?: string | null;
}

function toRow(r: Required<RowOverride>): unknown[] {
  return [r.lat, r.lon, r.ecdysis_id, r.observation_id, r.specimen_observation_id,
          r.year, r.scientificName, r.genus, r.family, r.source];
}
```

New fixture helper pattern (7 fields, no name strings):
```typescript
interface RowOverride {
  lat?: number | null; lon?: number | null;
  ecdysis_id?: number | null; observation_id?: number | null; specimen_observation_id?: number | null;
  year?: number | null; source?: string | null;
}

function toRow(r: Required<RowOverride>): unknown[] {
  return [r.lat, r.lon, r.ecdysis_id, r.observation_id, r.specimen_observation_id,
          r.year, r.source];   // source at index 6
}
```

**Tests to keep (update assertions only):** occId formation, lat/lon null skip, recencyTier (`thisYear`/`lastYear`/`earlier`).

**Tests to delete:** everything asserting `result.summary.*`, `result.taxaOptions`, `speciesCount`, `genusCount`, `familyCount`. The function no longer returns these.

**Return shape assertion to add:**
```typescript
it('returns { geojson } only — no summary or taxaOptions', () => {
  const result = _buildGeoJSONFromRaw([]);
  expect(result).toHaveProperty('geojson');
  expect(result).not.toHaveProperty('summary');
  expect(result).not.toHaveProperty('taxaOptions');
});
```

### 10. `src/tests/filter.test.ts` — partial update

**Role:** test
**Analog:** existing describe blocks in the same file.

Lines to update:
- **L256** — `expect(OCCURRENCE_COLUMNS).toContain('scientificName')` → invert or remove (assert it does NOT contain `'scientificName'`, `'genus'`, `'family'`, `'specimen_inat_taxon_name'`).
- **L318-322** — `queryTablePage` SQL assertions that check for `scientificName` → update to check for `display_name` and `LEFT JOIN taxa`.
- **L449** (mock result row) — `scientificName: 'Bombus'` → remove field.

New test to add to the `queryTablePage` describe block (copy the SQL-contains assertion pattern from L318-351):
```typescript
test('SQL contains LEFT JOIN taxa and t.name AS display_name', async () => {
  const { execFn } = mockSQLite([], 0);
  await queryTablePage(emptyFilter(), 1);
  const dataSql = execFn.mock.calls.find((c: unknown[]) => !String(c[1]).includes('COUNT(*)'))?.[1] ?? '';
  expect(dataSql).toContain('LEFT JOIN taxa');
  expect(dataSql).toContain('display_name');
});
```

### 11. `src/tests/bee-table.test.ts` — fixture updates

**Role:** test

- **L12** — mock `OCCURRENCE_COLUMNS` array: remove `'scientificName'`, `'genus'`, `'family'`, `'specimen_inat_taxon_name'`; add `'display_name'`.
- **L20-21** — mock `features.ts` `DataSummary` in `summary` prop: remove `speciesCount`, `genusCount`, `familyCount`.
- **L151** (TABLE-07 fixture, line ~151-163) — `scientificName: 'Bombus vosnesenskii'` → `display_name: 'Bombus vosnesenskii'`; remove `genus`, `family` if present.
- **L221** (TABLE-09 baseRow, lines ~220-233) — `scientificName: 'Bombus vosnesenskii'` → `display_name: 'Bombus vosnesenskii'`.

---

## Shared Patterns

### sqlite3.exec callback pattern
**Source:** `src/filter.ts:198-213, 448-455`
**Apply to:** all three restructured query functions (queryTablePage, queryListPage, queryAllFiltered)

The exec callback is unchanged — column values arrive positionally but are mapped to names via `columnNames`:
```typescript
await sqlite3.exec(db, sql,
  (rowValues: unknown[], columnNames: string[]) => {
    const obj: Record<string, unknown> = {};
    columnNames.forEach((col: string, i: number) => { obj[col] = rowValues[i]; });
    rows.push(obj);
  }
);
```
`display_name` appears in `columnNames` automatically from the SELECT alias; no special handling needed.

### Lit html template null-guard pattern
**Source:** `src/bee-occurrence-detail.ts:189-193` (`_renderCollectorGroup`)
**Apply to:** `_renderProvisional` migration

```typescript
// The established null-guard idiom for nullable name fields:
const displayName = info?.name ?? null;
return displayName ? displayName : html`<span class="no-determination">No determination</span>`;
```
`_renderProvisional` uses the same truthy check: `row.display_name ? html\`<em>...\` : html\`<span class="hint">...\``.

### dbt contract enforcement
**Source:** `data/dbt/models/marts/schema.yml:5-7`
**Apply to:** all schema.yml edits

```yaml
config:
  contract:
    enforced: true
```
This is the standing gate. After editing schema.yml and occurrences.sql, run `bash data/dbt/run.sh build` to confirm the contract count matches (33 columns). A mismatch fails the build with a contract violation error — do not skip this verification.

---

## No Analog Found

None — all modified files are well-established within the codebase. All patterns are internal analogs.

---

## Metadata

**Analog search scope:** `src/`, `src/tests/`, `data/dbt/models/`, `data/`
**Files read directly:** `src/filter.ts`, `src/features.ts`, `src/bee-table.ts`, `src/bee-occurrence-detail.ts`, `data/sqlite_export.py`, `data/dbt/models/marts/schema.yml`, `data/dbt/models/marts/occurrences.sql`, `data/dbt/models/intermediate/int_specimen_obs_base.sql`, `src/tests/build-geojson.test.ts`, `src/tests/filter.test.ts`, `src/tests/bee-table.test.ts`
**Pattern extraction date:** 2026-06-02
**Line number verification:** All line numbers confirmed against live source as of 2026-06-02. No drift detected from CONTEXT.md references.
