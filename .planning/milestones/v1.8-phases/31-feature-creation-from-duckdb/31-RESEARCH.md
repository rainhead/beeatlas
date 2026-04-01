# Phase 31: Feature Creation from DuckDB - Research

**Researched:** 2026-03-31
**Domain:** DuckDB WASM Apache Arrow result iteration, OpenLayers VectorSource loader contract, TypeScript module rename
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Rename `frontend/src/parquet.ts` to `frontend/src/features.ts`. Rewrite internals to use DuckDB queries. Keep `EcdysisSource extends VectorSource` and `SampleSource extends VectorSource` class shapes. Only the import path in `bee-map.ts` changes.
- **D-02:** Do NOT inline feature creation into `bee-map.ts` or `duckdb.ts`. Keep module separation.
- **D-03:** Keep `specimenSource.once('change')` as-is in `bee-map.ts`. `EcdysisSource` loader calls `success(features)` when DuckDB query completes — same VectorSource loader contract. Zero changes to bee-map.ts loading lifecycle wiring.
- **D-04:** Same pattern for `sampleSource.once('change')` — `SampleSource` loader calls `success(features)` on DuckDB query completion.
- **D-05:** DuckDB errors in Phase 31 are fatal — `onError` callback propagates to `dataErrorHandler` which sets `_dataError`.

### Claude's Discretion

- Column selection for DuckDB queries (SELECT specific columns vs SELECT * — match existing column lists in parquet.ts)
- BigInt handling for DuckDB result rows (DuckDB returns Int64 as BigInt; convert with `Number()` as needed — same as current hyparquet pattern)
- Exact class/function naming in features.ts

### Deferred Ideas (OUT OF SCOPE)

- GeoJSON feature unnesting — counties and ecoregions currently load as 1-row FeatureCollection tables. Spatial unnesting and GeoParquet conversion deferred to Phase 32 (or a gap phase).
- DuckDB error fatality nuance — retries, partial failure recovery deferred. Phase 31 keeps it simple: any DuckDB error → `_dataError`.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FEAT-01 | OL ecdysis features created from DuckDB query results (SELECT from ecdysis table); ClusterSource and style callbacks behavior unchanged | EcdysisSource replaces ParquetSource; same VectorSource/loader contract; Arrow Table row iteration documented below |
| FEAT-02 | OL iNat sample features created from DuckDB query results (SELECT from samples table); sample layer and click behavior unchanged | SampleSource replaces SampleParquetSource; identical loader contract; BigInt coercion pattern preserved |
| FEAT-03 | hyparquet removed from package.json; parquet.ts loading code replaced | parquet.ts deleted, features.ts created; `npm uninstall hyparquet` removes the package |
</phase_requirements>

---

## Summary

Phase 31 is a contained rewrite of one module (`parquet.ts` → `features.ts`). The DuckDB WASM infrastructure is already in place from Phase 30: `getDuckDB()` returns a promise that resolves to an initialized `AsyncDuckDB`, and `loadAllTables()` has already populated the `ecdysis` and `samples` tables. The new module must replicate the exact same OL Feature schema, property names, IDs, and VectorSource loader contract that hyparquet currently fulfills — the rest of the codebase does not change.

The core technical question is how to iterate rows from a DuckDB WASM query result. The answer is confirmed from the installed type definitions: `conn.query(sql)` returns `Promise<arrow.Table<T>>`, and `table.toArray()` yields an array of Apache Arrow `StructRow` objects. Each row supports `.toJSON()` to get a plain JS object, or named property access via `.fieldName`. BigInt fields (Int64 columns) come out as `BigInt` values and must be coerced with `Number()` — exactly what the current hyparquet code already does.

The only other change is updating two import lines in `bee-map.ts` and removing `hyparquet` from `package.json`. The error handling contract flips from non-fatal (Phase 30 parallel init) to fatal (Phase 31 DuckDB is the sole data source), but the mechanism — calling `onError` → `dataErrorHandler` → `_dataError` — is unchanged.

**Primary recommendation:** Write `features.ts` as a near-literal port of `parquet.ts`, substituting `getDuckDB()` + `conn.query()` for the hyparquet fetch+parse pipeline. No architectural novelty required.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@duckdb/duckdb-wasm` | ^1.33.1-dev20.0 | In-browser SQL queries over parquet tables | Already installed; tables pre-loaded by Phase 30 |
| `apache-arrow` | (bundled with duckdb-wasm) | Row iteration from query results | `conn.query()` returns `arrow.Table`; `.toArray()` and `.toJSON()` are the iteration API |
| `ol` | ^10.7.0 | VectorSource, Feature, Point | Unchanged from current implementation |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `ol/loadingstrategy` | bundled | `all` strategy for VectorSource | Same as parquet.ts — load everything at once |

### Removed

| Package | Action | Reason |
|---------|--------|--------|
| `hyparquet` | `npm uninstall hyparquet` (from `frontend/`) | No longer needed once features.ts uses DuckDB |

---

## Architecture Patterns

### Module Structure

```
frontend/src/
├── features.ts       # NEW: EcdysisSource, SampleSource (replaces parquet.ts)
├── parquet.ts        # DELETE after features.ts is wired in
├── bee-map.ts        # Update 2 import lines only (lines 6 and 13)
└── duckdb.ts         # NO CHANGES — getDuckDB() and loadAllTables() unchanged
```

### Pattern 1: VectorSource Loader with DuckDB Query

The VectorSource `loader` function signature is identical to the current implementation. The only difference is the async data source:

```typescript
// In features.ts — EcdysisSource
import { getDuckDB } from './duckdb.ts';
import { Feature } from "ol";
import Point from "ol/geom/Point.js";
import { fromLonLat } from "ol/proj.js";
import { Vector as VectorSource } from 'ol/source.js';
import { all } from 'ol/loadingstrategy.js';

export class EcdysisSource extends VectorSource {
  constructor({ onError }: { onError?: (err: Error) => void }) {
    const load = (_extent: any, _resolution: any, _projection: any, success: any, failure: any) => {
      getDuckDB()
        .then(db => db.connect())
        .then(async conn => {
          try {
            const result = await conn.query(
              `SELECT ecdysis_id, occurrenceID, longitude, latitude,
                      year, month, scientificName, recordedBy, fieldNumber,
                      genus, family, floralHost, county, ecoregion_l3,
                      inat_observation_id
               FROM ecdysis`
            );
            return result;
          } finally {
            await conn.close();
          }
        })
        .then(table => {
          const rows = table.toArray();
          const features = rows.flatMap((row: any) => {
            const obj = row.toJSON();
            if (obj.longitude == null || obj.latitude == null) return [];
            const feature = new Feature();
            feature.setGeometry(new Point(fromLonLat([obj.longitude, obj.latitude])));
            feature.setId(`ecdysis:${obj.ecdysis_id}`);
            feature.setProperties({
              occurrenceID: obj.occurrenceID,
              year: Number(obj.year),
              month: Number(obj.month),
              scientificName: obj.scientificName,
              recordedBy: obj.recordedBy,
              fieldNumber: obj.fieldNumber,
              genus: obj.genus,
              family: obj.family,
              floralHost: obj.floralHost ?? null,
              county: obj.county ?? null,
              ecoregion_l3: obj.ecoregion_l3 ?? null,
              inat_observation_id: obj.inat_observation_id != null ? Number(obj.inat_observation_id) : null,
            });
            return feature;
          });
          this.addFeatures(features);
          if (success) success(features);
        })
        .catch((err: Error) => {
          if (onError) onError(err);
          failure();
        });
    };
    super({ loader: load, strategy: all });
  }
}
```

### Pattern 2: Apache Arrow Row Iteration

`conn.query(sql)` returns `Promise<arrow.Table<T>>`. The installed type definition (verified from local node_modules):

```typescript
// From: node_modules/@duckdb/duckdb-wasm/dist/types/src/parallel/async_connection.d.ts
query<T extends { [key: string]: arrow.DataType } = any>(text: string): Promise<arrow.Table<T>>;
```

Iteration pattern (verified from existing duckdb.ts usage):

```typescript
const table = await conn.query('SELECT ...');
const rows = table.toArray();            // arrow.StructRow[]
const obj = rows[0].toJSON();            // plain JS object — safe for property access
```

`toJSON()` converts BigInt fields to BigInt (not Number). The explicit `Number()` coercion for `year`, `month`, `observation_id`, `inat_observation_id`, `specimen_count`, `sample_id` is required and is already the established pattern.

### Pattern 3: Connection Lifecycle in Loader

DuckDB connections must be closed after use. The loader runs once (strategy: all), so a single connection per source construction is fine:

```typescript
const db = await getDuckDB();  // already initialized — no latency
const conn = await db.connect();
try {
  const result = await conn.query(sql);
  // ... process result
} finally {
  await conn.close();
}
```

### Pattern 4: bee-map.ts Import Update (minimal change)

Only two lines change:

```typescript
// Line 6: was
import { ParquetSource } from "./parquet.ts";
// becomes
import { EcdysisSource } from "./features.ts";

// Line 13: was
import { SampleParquetSource } from './parquet.ts';
// becomes
import { SampleSource } from './features.ts';
```

And the instantiation sites (lines 199–215 area):

```typescript
// was: new ParquetSource({ url: ..., onError: ... })
// becomes: new EcdysisSource({ onError: ... })  — no url parameter needed

// was: new SampleParquetSource({ url: ..., onError: ... })
// becomes: new SampleSource({ onError: ... })  — no url parameter needed
```

The `url` parameter disappears because the DuckDB table is already loaded; the source knows to query the `ecdysis` / `samples` table directly.

### Anti-Patterns to Avoid

- **Keeping the `url` parameter:** The new sources do not fetch parquet files — tables are pre-loaded by `loadAllTables()`. No URL needed.
- **Not closing the connection:** Arrow connections must be closed to avoid memory leaks in the WASM worker.
- **Accessing BigInt fields without coercion:** `obj.year` from a DuckDB Int64 column is a JavaScript `BigInt`. Direct use in arithmetic or JSON serialization will throw or produce unexpected results. Always coerce with `Number()`.
- **Using `SELECT *`:** Column selection should match the existing explicit lists in `parquet.ts` to avoid pulling unnecessary data and to document the contract explicitly.
- **Changing bee-map.ts wiring:** D-03 and D-04 require zero changes to the loading lifecycle. The `specimenSource.once('change')` and `sampleSource.once('change')` handlers fire naturally when `success(features)` is called inside the loader, which triggers VectorSource's change event. No modification needed.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parquet row deserialization | Custom byte parser | DuckDB WASM + Arrow `.toArray().toJSON()` | Already working; 46k rows load correctly |
| DuckDB initialization | Second init path | `getDuckDB()` from duckdb.ts | Singleton pattern established in Phase 30 |
| Table loading | Re-fetch parquet in features.ts | `loadAllTables()` already called in bee-map.ts | Tables are ready at loader call time |

---

## Common Pitfalls

### Pitfall 1: BigInt Fields Cause Silent Property Errors

**What goes wrong:** `feature.getProperties().year` returns `12n` (BigInt) instead of `12` (Number). Comparison operators like `===` and arithmetic fail silently or throw.

**Why it happens:** DuckDB stores integer columns as Int64 and Apache Arrow returns them as JavaScript `BigInt` from `.toJSON()`.

**How to avoid:** Apply `Number()` to every integer column on extraction: `year`, `month`, `observation_id`, `inat_observation_id`, `specimen_count`, `sample_id`. The existing `parquet.ts` already does this — copy the coercions exactly.

**Warning signs:** Filter sidebar shows `NaN` for year ranges; feature IDs become `"ecdysis:12n"` instead of `"ecdysis:12"`.

### Pitfall 2: DuckDB Not Ready When Loader Fires

**What goes wrong:** `getDuckDB()` is called inside the VectorSource loader, but the loader runs immediately on source construction (strategy: all fires on first render). If for some reason DuckDB hasn't initialized, the query promise rejects.

**Why it won't happen here:** Phase 30 wires `getDuckDB().then(db => loadAllTables(...))` at the same time as source construction in `firstUpdated()`. `getDuckDB()` returns the cached `_dbPromise` — any second caller just waits on the same promise. By the time the loader callback runs (which is async), DuckDB is either ready or will be. The loader's `.catch()` → `onError` → `dataErrorHandler` handles any initialization failure gracefully.

**Warning signs:** `_dataError` renders immediately with no network errors; DevTools shows DuckDB worker initialization errors.

### Pitfall 3: Loader Fires Before `loadAllTables` Completes

**What goes wrong:** The ecdysis table doesn't exist yet when `SELECT * FROM ecdysis` runs.

**Why it's safe:** `loadAllTables()` creates the tables synchronously before resolving. The loader's `getDuckDB()` call will resolve only after `_dbPromise` resolves — but `loadAllTables` is chained AFTER `getDuckDB()`. If the loader races ahead of `loadAllTables`, the SELECT will fail with "Table not found."

**How to avoid:** The `EcdysisSource` loader should call `getDuckDB()` and then wait for tables — but since `loadAllTables` is triggered separately in `bee-map.ts`, the safest approach is for `features.ts` to accept a `Promise<void>` tablesReady guard, OR rely on the existing timing (sources are constructed at module load, but loaders only execute during map render, which follows `firstUpdated()` where `loadAllTables` is also triggered). Verify timing in bee-map.ts before shipping.

**Mitigation in CONTEXT.md:** D-03 says to keep the `specimenSource.once('change')` lifecycle as-is. If there's a race, the error path (D-05) will catch it and surface `_dataError`.

### Pitfall 4: `parquet.ts` Still Referenced After Rename

**What goes wrong:** TypeScript build passes but old import paths remain, causing 404 at runtime or stale module cache.

**How to avoid:** Delete `parquet.ts` after `features.ts` is wired. `npm run build` (tsc + vite) will catch stale imports as compile errors.

---

## Code Examples

### Exact Column Lists (from parquet.ts — must be preserved)

**Ecdysis columns:**
```typescript
const columns = [
  'ecdysis_id', 'occurrenceID', 'longitude', 'latitude', 'year', 'month',
  'scientificName', 'recordedBy', 'fieldNumber', 'genus', 'family',
  'floralHost', 'county', 'ecoregion_l3', 'inat_observation_id',
];
```

**Samples columns:**
```typescript
const sampleColumns = [
  'observation_id', 'observer', 'date', 'lat', 'lon',
  'specimen_count', 'sample_id', 'county', 'ecoregion_l3',
];
```

### Feature ID Patterns (load-bearing — used by sidebar click and URL state restore)

```typescript
// Ecdysis specimens
feature.setId(`ecdysis:${obj.ecdysis_id}`);

// iNat samples — observation_id is Int64 → coerce to Number
feature.setId(`inat:${Number(obj.observation_id)}`);
```

### Sample Date → year/month Derivation

The samples parquet stores `date` as a string. The existing code derives `year` and `month` from it:

```typescript
const d = new Date(obj.date);
feature.setProperties({
  year: d.getUTCFullYear(),
  month: d.getUTCMonth() + 1,  // getUTCMonth() is 0-indexed
  // ...
});
```

This must be preserved exactly — year/month for samples come from the date string, not from separate columns.

### DuckDB Connection + Query Pattern (from existing duckdb.ts)

```typescript
// Verified usage from duckdb.ts loadAllTables():
const conn = await db.connect();
const result = await conn.query('SELECT COUNT(*) as n FROM ecdysis');
const rows = result.toArray();
const row = rows[0]?.toJSON();  // { n: 46132n } — note BigInt
await conn.close();
```

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies beyond what Phase 30 already verified — DuckDB WASM initialized and all tables loaded in production).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None detected — no test config files or test directories found |
| Config file | None |
| Quick run command | `npm run build` (TypeScript + Vite compile) |
| Full suite command | `npm run build` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FEAT-01 | Ecdysis features appear on map with correct clustering | smoke (browser) | `npm run build` (compile gate) | N/A — manual |
| FEAT-02 | iNat sample features appear with correct dot rendering and click | smoke (browser) | `npm run build` (compile gate) | N/A — manual |
| FEAT-03 | hyparquet absent from package.json; parquet.ts absent from src/ | automated | `npm run build && ! grep hyparquet frontend/package.json` | N/A — shell check |

### Sampling Rate

- **Per task commit:** `npm run build` exits 0 with no TypeScript errors
- **Phase gate:** `npm run build` green + browser smoke test (map renders, features appear, sidebar click works)

### Wave 0 Gaps

No automated test framework exists. Validation relies on:
1. TypeScript compile gate (`npm run build`)
2. Human browser smoke test after implementation

---

## Open Questions

1. **Table readiness race between `loadAllTables` and VectorSource loader**
   - What we know: `loadAllTables` is triggered in `firstUpdated()` alongside source construction. `getDuckDB()` returns the cached promise. Loaders run asynchronously after map render.
   - What's unclear: Whether the VectorSource loader (triggered during map initialization) races ahead of `loadAllTables` completing.
   - Recommendation: In `features.ts`, chain the query on the same `getDuckDB()` promise — DuckDB singleton is ready at that point. However, tables may not be loaded yet. The safest option: have `EcdysisSource`/`SampleSource` accept the `loadAllTables` promise as a parameter (or call `loadAllTables` inside features.ts). Alternatively, structure `bee-map.ts` so sources are constructed after `loadAllTables` resolves. Since D-03 says zero changes to bee-map.ts loading lifecycle, the existing approach (DuckDB + loadAllTables complete before loader fires due to async ordering) needs verification during implementation.

---

## Sources

### Primary (HIGH confidence)

- Local source: `frontend/src/parquet.ts` — exact column lists, property names, BigInt coercions, VectorSource loader contract
- Local source: `frontend/src/duckdb.ts` — getDuckDB() singleton, loadAllTables(), confirmed `toArray()[0]?.toJSON()` pattern
- Local source: `frontend/src/bee-map.ts` — import lines 6/13, source construction lines 199–216, loading lifecycle lines 753–805
- Local type defs: `node_modules/@duckdb/duckdb-wasm/dist/types/src/parallel/async_connection.d.ts` — `conn.query()` returns `Promise<arrow.Table<T>>`
- Local: `frontend/package.json` — confirms `hyparquet: ^1.23.3` present, `@duckdb/duckdb-wasm: ^1.33.1-dev20.0` present
- Phase 30 summary: `.planning/phases/30-duckdb-wasm-setup/30-01-SUMMARY.md` — confirmed EH bundle, registerFileBuffer approach, all four tables loaded

### Secondary (MEDIUM confidence)

- Phase 31 CONTEXT.md — D-01 through D-05 locked decisions, code_context section with established patterns

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — locally verified from installed node_modules type definitions and existing code
- Architecture: HIGH — direct port of working code with confirmed API shapes
- Pitfalls: HIGH — BigInt pitfall confirmed from existing code patterns; race condition is a real risk noted explicitly
- Validation: MEDIUM — no automated test framework; relies on compile + manual smoke

**Research date:** 2026-03-31
**Valid until:** 2026-04-30 (DuckDB WASM API is stable; Arrow row iteration API unchanging)
