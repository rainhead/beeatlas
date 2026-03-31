# Phase 31: Feature Creation from DuckDB - Context

**Gathered:** 2026-03-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace `ParquetSource` / `SampleParquetSource` (hyparquet) with DuckDB `SELECT` → OL Feature creation. Remove hyparquet from package.json. OL clustering, style callbacks, sidebar click behavior, and loading/error overlay lifecycle remain identical to pre-migration behavior.

Scope does NOT include filter migration (Phase 32) or GeoJSON spatial unnesting.

</domain>

<decisions>
## Implementation Decisions

### parquet.ts Fate
- **D-01:** Rename `frontend/src/parquet.ts` → `frontend/src/features.ts`. Rewrite internals to use DuckDB queries instead of hyparquet. Keep the same VectorSource subclass shape (`EcdysisSource extends VectorSource`, `SampleSource extends VectorSource`). Only the import path in `bee-map.ts` changes — all wiring (clusterSource, sampleLayer) stays identical.
- **D-02:** Do NOT inline feature creation into `bee-map.ts` or `duckdb.ts`. Keep the module separation.

### Loading Lifecycle
- **D-03:** Keep `specimenSource.once('change')` as-is in `bee-map.ts`. `EcdysisSource` loader calls `success(features)` when DuckDB query completes — same VectorSource loader contract as today. The 'change' event fires naturally. Zero changes to bee-map.ts loading lifecycle wiring.
- **D-04:** Same pattern for `sampleSource.once('change')` — `SampleSource` loader calls `success(features)` on DuckDB query completion.

### Error Handling
- **D-05:** DuckDB errors in Phase 31 are fatal — `onError` callback propagates to `dataErrorHandler` which sets `_dataError`. Phase 30's non-fatal pattern is replaced now that DuckDB is the sole data source.

### Claude's Discretion
- Column selection for DuckDB queries (SELECT specific columns vs SELECT * — match existing column lists in parquet.ts)
- BigInt handling for DuckDB result rows (DuckDB returns Int64 as BigInt; convert with `Number()` as needed — same as current hyparquet pattern)
- Exact class/function naming in features.ts

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Implementation
- `frontend/src/parquet.ts` — Current ParquetSource and SampleParquetSource implementations; exact column lists, Feature schema, property names, and feature ID patterns to preserve
- `frontend/src/bee-map.ts` — Current source wiring, loading lifecycle (specimenSource.once('change'), sampleSource.once('change')), dataErrorHandler, clusterSource setup
- `frontend/src/duckdb.ts` — getDuckDB() singleton and loadAllTables(); DuckDB tables available: `ecdysis`, `samples`, `counties`, `ecoregions`

### Phase Context
- `.planning/phases/30-duckdb-wasm-setup/30-01-SUMMARY.md` — Phase 30 deviation log; confirms EH bundle, registerFileBuffer for GeoJSON, read_json fallback

### Requirements
- `.planning/REQUIREMENTS.md` §FEAT-01–03 — Acceptance criteria for feature creation and hyparquet removal

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getDuckDB()` from `duckdb.ts` — returns already-initialized AsyncDuckDB; tables `ecdysis` and `samples` are pre-loaded and ready to query
- `VectorSource` loader pattern (strategy: all) — already used in ParquetSource; keeps clusterSource/sampleLayer wiring unchanged

### Established Patterns
- Feature ID pattern: `ecdysis:${obj.ecdysis_id}` for specimens, `inat:${Number(obj.observation_id)}` for samples — must be preserved (used by sidebar click, URL state restore)
- Property names are load-bearing: `year`, `month`, `scientificName`, `recordedBy`, `fieldNumber`, `genus`, `family`, `floralHost`, `county`, `ecoregion_l3`, `inat_observation_id` for ecdysis; `observation_id`, `observer`, `date`, `year`, `month`, `specimen_count`, `sample_id`, `county`, `ecoregion_l3` for samples
- BigInt coercion: `Number(obj.year)`, `Number(obj.month)`, `Number(obj.inat_observation_id)` — DuckDB returns Int64 as BigInt

### Integration Points
- `bee-map.ts` imports ParquetSource from `./parquet.ts` → update to `./features.ts` (lines 6, 13)
- `clusterSource` takes `specimenSource` as its source — must remain a VectorSource instance
- `sampleLayer` takes `sampleSource` — must remain a VectorSource instance
- `specimenSource.once('change', ...)` at line 765 drives `_dataLoading = false` — preserved by keeping VectorSource loader contract

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for DuckDB row iteration and BigInt handling.

</specifics>

<deferred>
## Deferred Ideas

- **GeoJSON feature unnesting** — counties and ecoregions currently load as 1-row FeatureCollection tables. Spatial unnesting and GeoParquet conversion deferred to Phase 32 (or a gap phase).
- **DuckDB error fatality nuance** (not discussed) — retries, partial failure recovery deferred. Phase 31 keeps it simple: any DuckDB error → `_dataError`.

</deferred>

---

*Phase: 31-feature-creation-from-duckdb*
*Context gathered: 2026-03-31*
