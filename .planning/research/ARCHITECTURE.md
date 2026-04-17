# Architecture Research

**Domain:** Unified occurrence model — collapsing two-source data pipeline and two-layer frontend into one
**Researched:** 2026-04-16
**Confidence:** HIGH (full source analysis of all affected files)

---

## Current Architecture (v2.6 baseline)

### System Overview

```
Pipeline (Python / DuckDB)
  ecdysis_data.occurrences  ──┐
  inaturalist_data.obs        ├─► export.py ─► ecdysis.parquet
  inaturalist_waba_data       ┘               samples.parquet
  geographies.*
                                              ↓ CloudFront fetch
Frontend (TypeScript / wa-sqlite / hyparquet)
  sqlite.ts  ─ loadAllTables() ──────────────────────────────────────────
    creates TABLE ecdysis  (21 cols)
    creates TABLE samples  (10 cols)
    hyparquet reads ecdysis.parquet → bulk INSERT INTO ecdysis
    hyparquet reads samples.parquet → bulk INSERT INTO samples
    resolves tablesReady Promise

  features.ts
    EcdysisSource extends VectorSource  → SELECT * FROM ecdysis
    SampleSource  extends VectorSource  → SELECT * FROM samples

  filter.ts
    buildFilterSQL(f) → { ecdysisWhere, samplesWhere }   ← two separate WHERE strings
    queryVisibleIds() → { ecdysis: Set<string>, samples: Set<string> }
    queryTablePage()  → queries either ecdysis or samples table
    queryAllFiltered() → queries either ecdysis or samples table

  bee-map.ts
    specimenSource (EcdysisSource) → clusterSource → specimenLayer
    sampleSource   (SampleSource)  → sampleLayer
    layerMode property switches visibility: specimenLayer XOR sampleLayer

  bee-atlas.ts (coordinator)
    _visibleEcdysisIds: Set<string> | null
    _visibleSampleIds:  Set<string> | null
    _layerMode: 'specimens' | 'samples'

  bee-sidebar.ts
    samples:             Sample[] | null  → bee-specimen-detail
    selectedSampleEvent: SampleEvent | null → bee-sample-detail

  validate-schema.mjs
    EXPECTED['ecdysis.parquet'] = [21 cols]
    EXPECTED['samples.parquet'] = [10 cols]
```

---

## Target Architecture (v2.7 unified)

### Core Concept

Replace two heterogeneous tables with one `occurrences` table. Each row is a full outer join of an ecdysis record with an iNat sample. Column nullability declares which source contributed:
- Ecdysis-only row: specimen columns populated, iNat sample columns null
- Sample-only row: iNat columns populated, ecdysis specimen columns null
- Matched row: all columns populated

The `occurrence_type` column (or inferred from null pattern) tells the render layer how to style and display each row.

### Proposed SQLite Table Schema

```sql
CREATE TABLE occurrences (
  -- Primary key / ID routing
  occurrence_id TEXT NOT NULL,     -- 'ecdysis:<int>' or 'inat:<int>'
  occurrence_type TEXT NOT NULL,   -- 'specimen' | 'sample' | 'matched'

  -- Geometry (shared)
  longitude REAL,
  latitude  REAL,

  -- Temporal (shared — derived from whichever source is present)
  date      TEXT,
  year      INTEGER,
  month     INTEGER,

  -- Geography (shared — spatial join result, always non-null)
  county      TEXT NOT NULL,
  ecoregion_l3 TEXT NOT NULL,
  elevation_m  REAL,

  -- Ecdysis specimen columns (null when no ecdysis record)
  ecdysis_id              INTEGER,
  catalog_number          TEXT,
  scientificName          TEXT,
  recordedBy              TEXT,
  fieldNumber             TEXT,
  genus                   TEXT,
  family                  TEXT,
  floralHost              TEXT,
  host_observation_id     INTEGER,
  inat_host               TEXT,
  inat_quality_grade      TEXT,
  modified                TEXT,
  specimen_observation_id INTEGER,

  -- iNat sample columns (null when no iNat sample record)
  observation_id   INTEGER,
  observer         TEXT,
  specimen_count   INTEGER,
  sample_id        INTEGER
)
```

**Rationale for `occurrence_id` and `occurrence_type`:**
- `occurrence_id` uses the existing `ecdysis:<int>` / `inat:<int>` prefix convention (load-bearing throughout the app — OL feature IDs, URL state, cluster click handler, style callbacks)
- For matched rows, `occurrence_id` uses the ecdysis prefix since the ecdysis specimen is the authoritative physical record; the iNat link is supplemental
- `occurrence_type` makes the render path explicit without null-sniffing in every callsite

**County / ecoregion non-null contract**: spatial join run at export time, nearest-polygon fallback — same guarantee as current per-table approach.

### Pipeline Changes

#### What changes in `export.py`

Replace `export_ecdysis_parquet()` and `export_samples_parquet()` with a single `export_occurrences_parquet()` that performs a full outer join using a UNION ALL pattern:

- **Top half**: every ecdysis occurrence, LEFT JOINed to iNat sample data via `occurrence_links.host_observation_id`. `occurrence_type` = 'matched' when the join succeeds, 'specimen' otherwise.
- **Bottom half**: iNat samples that have no matching ecdysis occurrence (LEFT JOIN occurrence_links WHERE host_observation_id IS NULL). `occurrence_type` = 'sample'. All ecdysis columns are NULL.

The existing spatial join CTEs (county, ecoregion, waba_link, id_modified) are reused unchanged for the ecdysis half. The sample half runs its own spatial join CTEs (same pattern as the current `export_samples_parquet`).

The join key for matching: `ecdysis_data.occurrence_links.host_observation_id` IS the iNat observation ID. This is already computed in `export_ecdysis_parquet` — reuse that JOIN.

### Frontend Changes

#### 1. `sqlite.ts` — loadAllTables()

Replace two `CREATE TABLE` statements + two parquet fetches with one:

```typescript
CREATE TABLE occurrences (
  occurrence_id TEXT, occurrence_type TEXT,
  longitude REAL, latitude REAL,
  date TEXT, year INTEGER, month INTEGER,
  county TEXT, ecoregion_l3 TEXT, elevation_m REAL,
  ecdysis_id INTEGER, catalog_number TEXT,
  scientificName TEXT, recordedBy TEXT, fieldNumber TEXT,
  genus TEXT, family TEXT, floralHost TEXT,
  host_observation_id INTEGER, inat_host TEXT, inat_quality_grade TEXT,
  modified TEXT, specimen_observation_id INTEGER,
  observation_id INTEGER, observer TEXT,
  specimen_count INTEGER, sample_id INTEGER
)
```

One `asyncBufferFromUrl` + one `parquetReadObjects` + one `_insertRows`. `tablesReady` resolves after a single INSERT transaction. File count drops from two fetches to one.

#### 2. `features.ts` — Replace EcdysisSource and SampleSource

Write a single `OccurrenceSource extends VectorSource`. The loader queries `occurrences` and creates features using `occurrence_type` to set the correct feature ID (already encoded in `occurrence_id`) and properties. Feature IDs preserve the existing `ecdysis:<int>` / `inat:<int>` prefix convention so no downstream ID handling changes.

#### 3. `filter.ts` — Unify SQL surface

**`buildFilterSQL`**: Replace `{ ecdysisWhere, samplesWhere }` return type with `{ occurrencesWhere: string }`. Key behavioral contracts to preserve:

- **Taxon filter ghosting (D-01)**: When a taxon filter is active, pure sample rows (which have null `scientificName`) must be excluded. SQL: add `occurrence_type != 'sample'` when any taxon clause is present.
- **Collector filter**: Both `recordedBy` (ecdysis) and `observer` (iNat) exist on every row. The filter becomes `(recordedBy IN (...) OR observer IN (...))` — simpler than the current dual-query approach.
- **Year / month / county / ecoregion / elevation**: These are shared columns on all row types; apply uniformly with no branching.

**`queryVisibleIds`**: Returns `Set<string> | null` (mixed-prefix IDs). The `{ ecdysis, samples }` split is eliminated. `Set.has(feature.getId())` continues to work identically for both prefix types.

**`queryTablePage` and `queryAllFiltered`**: Always query `occurrences`. The `layerMode` parameter still controls which columns are SELECTed for display — it is repurposed from table selection to column set selection.

**`queryFilteredCounts`**: Count only rows where `scientificName IS NOT NULL` (specimen + matched rows) for taxon statistics.

#### 4. `bee-atlas.ts` — Coordinator

State simplification:
- Replace `_visibleEcdysisIds: Set<string> | null` + `_visibleSampleIds: Set<string> | null` with `_visibleOccurrenceIds: Set<string> | null`
- Remove `_onSampleDataLoaded` handler and `@sample-data-loaded` listener; a single `data-loaded` event fires when `OccurrenceSource` completes
- `_layerMode` stays for table column display control but no longer drives layer visibility in `bee-map`

Collector options query targets `occurrences` instead of cross-table join:
```sql
SELECT recordedBy, MIN(observer) AS observer
FROM occurrences
WHERE occurrence_type IN ('specimen', 'matched') AND recordedBy IS NOT NULL
GROUP BY recordedBy ORDER BY recordedBy
```

#### 5. `bee-map.ts` — Layer simplification

Replace four instance fields (`specimenSource`, `clusterSource`, `specimenLayer`, `sampleSource`, `sampleLayer`) with two: `occurrenceSource`, `clusterSource`, `occurrenceLayer`.

`OccurrenceSource` feeds a single `Cluster` source feeds a single `VectorLayer`. The unified style function reads `occurrence_type` from feature properties to determine rendering treatment (cluster/recency-color for specimen/matched; teal dot for sample).

`layerMode` no longer switches layer visibility. The `updated()` block for `layerMode` that calls `setVisible()` is removed. Instead, `layerMode` is passed to the style function via closure so it can switch between cluster-emphasis and sample-dot-emphasis rendering.

Remove `visibleEcdysisIds` and `visibleSampleIds` @property inputs; add `visibleOccurrenceIds: Set<string> | null`.

Updated `updated()` synchronization:
```typescript
if (changedProperties.has('visibleOccurrenceIds')) {
  this.clusterSource?.changed();
  this.map?.render();
}
```

#### 6. `style.ts` — Unified style function

Replace `makeClusterStyleFn` + `makeSampleDotStyleFn` with a single `makeOccurrenceStyleFn` that:
- Reads `occurrence_type` from each inner feature's properties
- Applies cluster/recency-color treatment to specimen/matched features
- Applies teal-dot treatment to sample features
- Style cache key must incorporate `occurrence_type` and `layerMode`

Both existing caches (`styleCache`, `sampleStyleCache`) can be merged or kept separate and looked up by type.

#### 7. `bee-sidebar.ts` — Unified detail panel

The current sidebar branches: `if (samples) <bee-specimen-detail> else if (selectedSampleEvent) <bee-sample-detail>`. After unification, a clicked occurrence has a single `OccurrenceDetail` shape with `occurrence_type`.

**Recommended approach**: Write a new `<bee-occurrence-detail>` component that receives an occurrence object and renders conditionally based on which columns are non-null. This avoids retrofitting two existing components with incompatible data shapes and keeps the components small.

Retire `bee-sample-detail` once `bee-occurrence-detail` covers sample-type rendering. Extend or retire `bee-specimen-detail` once the unified component covers specimen/matched rendering.

The `Sample` / `SampleEvent` interface split in `bee-sidebar.ts` is replaced with a single `OccurrenceDetail` interface mirroring the unified schema.

#### 8. `validate-schema.mjs` — Schema gate

Replace two EXPECTED entries with one for `occurrences.parquet` listing all columns in the new schema.

---

## Component Boundary Map

| Component | Role | Change in v2.7 |
|-----------|------|----------------|
| `export.py` | Pipeline → parquet | New `export_occurrences_parquet()` replaces two export fns |
| `validate-schema.mjs` | CI schema gate | Replace 2-file EXPECTED with 1 |
| `sqlite.ts` | Parquet → SQLite | One table, one fetch, one INSERT batch |
| `features.ts` | SQLite → OL Features | Replace EcdysisSource + SampleSource with OccurrenceSource |
| `filter.ts` | SQL WHERE generation | Unified WHERE; `queryVisibleIds` returns `Set<string>` not `{ecdysis, samples}` |
| `bee-atlas.ts` | App coordinator | `_visibleOccurrenceIds` replaces two sets; `_onSampleDataLoaded` removed |
| `bee-map.ts` | OL presenter | One layer replaces two; `visibleEcdysisIds`/`visibleSampleIds` props removed |
| `style.ts` | OL style functions | Single style fn reads `occurrence_type`; two fns merge into one |
| `bee-sidebar.ts` | Sidebar layout | Single `OccurrenceDetail` branch replaces specimen/sample fork |
| `bee-specimen-detail.ts` | Detail renderer | Extend or retire; superseded by `bee-occurrence-detail` |
| `bee-sample-detail.ts` | Detail renderer | Retire; superseded by `bee-occurrence-detail` |

---

## Data Flow (Unified)

### Filter path

```
User changes filter
    ↓
bee-atlas._runFilterQuery()
    ↓
filter.buildFilterSQL(filterState) → occurrencesWhere: string
    ↓
sqlite.exec("SELECT occurrence_id FROM occurrences WHERE {occurrencesWhere}")
    ↓
_visibleOccurrenceIds: Set<string>    ← mixed ecdysis:* and inat:* IDs
    ↓
bee-map receives visibleOccurrenceIds @property → Lit updated()
    ↓
clusterSource.changed() → OL repaint
    ↓
style fn: Set.has(feature.getId()) → highlight / ghost
```

### Page load path

```
bee-atlas.firstUpdated()
    ↓
sqlite.loadAllTables(baseUrl)
    ↓ fetch occurrences.parquet (one Range request)
    ↓ INSERT INTO occurrences (one transaction)
    ↓ tablesReady resolves
    ↓
OccurrenceSource.load() → SELECT from occurrences
    ↓ features with occurrence_id as OL feature ID
    ↓
bee-map emits 'data-loaded' (single event — no 'sample-data-loaded')
    ↓
bee-atlas._onDataLoaded → summary + taxaOptions populated
```

---

## Suggested Build Order

### Phase 1 — Pipeline (`data/export.py`)
Write `export_occurrences_parquet()`. Delete `export_ecdysis_parquet()` and `export_samples_parquet()`. Run locally to verify row counts and null contract (county/ecoregion always non-null).

### Phase 2 — Schema gate (`scripts/validate-schema.mjs`)
Update EXPECTED to `occurrences.parquet`. Run against local export.

### Phase 3 — SQLite layer (`frontend/src/sqlite.ts`)
Replace two CREATE TABLE + two fetch+insert with one. Run `npm test` — filter tests will TS-error because `buildFilterSQL` still returns `{ ecdysisWhere, samplesWhere }` but the table names have changed; that is acceptable mid-refactor.

### Phase 4 — Features layer (`frontend/src/features.ts`)
Write `OccurrenceSource`. Export it. Keep `EcdysisSource` and `SampleSource` as deprecated aliases temporarily to avoid cascading TS errors in `bee-map.ts` before that file is updated.

### Phase 5 — Filter SQL (`frontend/src/filter.ts`)
Rewrite `buildFilterSQL` to return `{ occurrencesWhere: string }` — this is a breaking change that drives all downstream TS errors. Rewrite `queryVisibleIds`, `queryTablePage`, `queryAllFiltered`, `queryFilteredCounts`. Update collector query target.

### Phase 6 — Coordinator (`frontend/src/bee-atlas.ts`)
Replace `_visibleEcdysisIds` + `_visibleSampleIds` with `_visibleOccurrenceIds`. Remove `_onSampleDataLoaded`. Update all @property bindings passed to `bee-map`.

### Phase 7 — Style functions (`frontend/src/style.ts`)
Write `makeOccurrenceStyleFn`. Remove `makeClusterStyleFn` and `makeSampleDotStyleFn` once `bee-map.ts` is updated.

### Phase 8 — Map presenter (`frontend/src/bee-map.ts`)
Replace two-source two-layer setup with single `OccurrenceSource` + `Cluster` + `VectorLayer`. Remove `visibleEcdysisIds` / `visibleSampleIds` @property. Update `updated()`. Remove `sample-data-loaded` emit. Remove layerMode visibility switching (keep for style closure).

### Phase 9 — Sidebar (`frontend/src/bee-sidebar.ts` + detail components)
Write `<bee-occurrence-detail>`. Define `OccurrenceDetail` interface. Update `bee-sidebar` to pass unified occurrence data. Retire `bee-sample-detail`. Extend or retire `bee-specimen-detail`.

### Phase 10 — Tests
Update `filter.test.ts` for new `buildFilterSQL` signature. Update sidebar/atlas/table test fixtures. Remove references to `ecdysis` and `samples` tables.

---

## Critical Integration Points

### ID prefix convention is preserved
`occurrence_id` carries `ecdysis:<int>` or `inat:<int>` prefixes, matching the existing feature ID convention throughout OL click handlers, URL state serialization (`o=` param), and `_restoreSelectionSamples` parsing. `url-state.ts` and the `o=` URL param format require no changes.

### `tablesReady` contract is unchanged
`sqlite.ts` resolves `tablesReady` after the single INSERT completes. All callers that `await tablesReady` require no change.

### `layerMode` has two roles that must be separated
Currently `layerMode` serves two distinct purposes: (1) OL layer visibility toggle, and (2) table view column set selection. After unification, role (1) disappears but role (2) remains. `layerMode` stays on `bee-atlas` and flows to `bee-table` and `bee-filter-toolbar`. `bee-map` still receives it for style-switching, but no longer uses it for `setVisible()`.

### Taxon filter ghosting (D-01 equivalent)
When a taxon filter is active, sample-only rows (null `scientificName`) must be ghosted or excluded. In the unified schema: add `occurrence_type != 'sample'` to the WHERE clause when any taxon clause is present. This preserves the existing behavior where a taxon filter hides all sample dots.

### Collector filter simplification
The current approach queries `recordedBy` and `observer` in separate tables. In the unified schema both are on the same row, so the filter becomes `(recordedBy IN (...) OR observer IN (...))`. For matched rows where both are non-null, this correctly matches on either.

### Summary stats scope
`queryFilteredCounts` and `computeSummary` only make sense for rows with taxon data. Filter the aggregates to `WHERE scientificName IS NOT NULL` (or `occurrence_type IN ('specimen', 'matched')`) to avoid counting sample-only rows in species/genus/family tallies.

---

## Anti-Patterns to Avoid

### Keeping ecdysis.parquet + samples.parquet as pipeline intermediates
**What goes wrong:** Adds an extra pipeline stage; spatial join CTEs run twice; files must be kept in sync.
**Instead:** Perform the full outer join directly in DuckDB from `ecdysis_data` and `inaturalist_data` schemas.

### Using two internal VectorSource instances inside OccurrenceSource
**What goes wrong:** Style, filter visibility, and click handling still branch by source type — no simplification.
**Instead:** One source, one layer, one style function that reads `occurrence_type` from feature properties.

### Returning two Sets from queryVisibleIds after migration
**What goes wrong:** Forces all call sites to split/merge — defeats the unification; coordinator still needs two state fields.
**Instead:** Return `Set<string> | null` with mixed-prefix IDs. `Set.has(feature.getId())` works identically for both prefix types.

### Merging the layerMode visibility toggle into the style function
**What goes wrong:** The style function is called per-feature on every repaint; injecting layer-level visibility logic creates coupling and performance cost.
**Instead:** `layerMode` is passed as a closure to the style function only for rendering treatment decisions (cluster vs dots), not for hiding entire categories.

---

## Sources

- Full source analysis: `filter.ts`, `features.ts`, `sqlite.ts`, `bee-atlas.ts`, `bee-map.ts`, `bee-sidebar.ts`, `style.ts`, `export.py`, `validate-schema.mjs` (HIGH confidence — direct code reading)
- `.planning/PROJECT.md` for requirement history and key decisions (HIGH confidence)

---
*Architecture research for: BeeAtlas v2.7 Unified Occurrence Model*
*Researched: 2026-04-16*
