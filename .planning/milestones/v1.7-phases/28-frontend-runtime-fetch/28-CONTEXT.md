# Phase 28: Frontend Runtime Fetch — Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Remove all bundled data files from the Vite build. Fetch `ecdysis.parquet`, `samples.parquet`, `counties.geojson`, and `ecoregions.geojson` from CloudFront `/data/` at runtime. Show a loading indicator while fetching. Show an error message if fetching fails. No UX redesign — rough feature parity with current behavior.

</domain>

<decisions>
## Implementation Decisions

### URL Configuration
- **D-01:** Use the absolute CloudFront URL directly: `https://beeatlas.net/data/` as the base for all data file fetches. No Vite proxy — dev environment fetches from production CloudFront just like production does, maximizing browser cache reuse.
- **D-02:** Provide an optional `VITE_DATA_BASE_URL` override (defaults to `https://beeatlas.net/data`) for pointing at a different origin if needed. Add `.env.example` documenting this var.
- **D-03:** Remove all 4 data files from `frontend/src/assets/` and all `?url` / module import references.

### GeoJSON Migration
- **D-04:** Switch `countySource` and `ecoregionSource` (in `region-layer.ts`) from synchronous `import countiesJson from './assets/counties.geojson'` to OL `VectorSource` with `url` + `format: new GeoJSONFormat({ featureProjection: 'EPSG:3857' })`. OL handles the async fetch internally.
- **D-05:** Remove the `geojsonPlugin` from `vite.config.ts` — it only existed to handle `.geojson` imports as ES modules.
- **D-06:** Remove `geojson.d.ts` type declaration file — no longer needed after removing static imports.

### Parquet Migration
- **D-07:** `ParquetSource` and `SampleParquetSource` already accept a `url` parameter and fetch via `asyncBufferFromUrlEager`. Change the URL values from `import ecdysisDump from './assets/ecdysis.parquet?url'` to the runtime base URL. No changes to the fetch/parse logic.

### Loading State
- **D-08:** Show a minimal loading indicator while the parquet files are being fetched. Rough parity — a simple "Loading…" state is sufficient. The exact UX is deferred to the DuckDB WASM phase where loading behavior will be redesigned.
- **D-09:** The map should not be interactive (or shown) until the parquet data is available. GeoJSON loading (counties/ecoregions) can proceed in parallel without blocking map display.

### Error Handling
- **D-10:** If any data file fetch fails, show a simple error message in place of the map: "Failed to load data. Please try refreshing." No partial state — don't render an empty map without explanation.

### CDK / CloudFront CORS
- **D-11:** Add a `/data/*` cache behavior to the CloudFront distribution in `infra/lib/beeatlas-stack.ts`. This behavior needs:
  - S3 origin: the `/data/` prefix of `siteBucket`
  - CORS: `Origin` header in the cache key (so per-origin caching works correctly)
  - Response headers policy exposing `Access-Control-Allow-Origin`, `Access-Control-Allow-Headers` (including `Range`), and `Access-Control-Expose-Headers` (`Content-Range`, `Content-Length`)
  - This enables browser `fetch()` from any origin (localhost, beeatlas.net) without CORS errors, and hyparquet Range requests to work correctly.

### Claude's Discretion
- Exact Lit component structure for the loading/error state in `bee-map.ts`
- Whether to use `Promise.all` or sequential fetches for the two parquet files
- Whether loading state is a `@state()` property or a separate component

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Frontend source files
- `frontend/src/parquet.ts` — `ParquetSource` and `SampleParquetSource`; existing fetch pattern via `asyncBufferFromUrlEager`
- `frontend/src/region-layer.ts` — `countySource`, `ecoregionSource` — currently synchronous GeoJSON imports to migrate
- `frontend/src/bee-map.ts` — wires everything together; `ecdysisDump` and `samplesDump` imports to replace
- `frontend/vite.config.ts` — `geojsonPlugin` to remove; proxy config location if needed

### CDK infrastructure
- `infra/lib/beeatlas-stack.ts` — CloudFront distribution definition; `/data/*` cache behavior to add

### Schema / validation
- `scripts/validate-schema.mjs` — authoritative column list for parquet files (reference for what's being fetched)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `asyncBufferFromUrlEager(url)` in `parquet.ts` — already does `fetch(url)` + `arrayBuffer()` + slice wrapper. No changes needed to this function.
- `ParquetSource` and `SampleParquetSource` — already URL-based; just need the URL values updated.

### Established Patterns
- Parquet: URL passed to constructor → fetched eagerly → parsed by hyparquet → features added to VectorSource
- GeoJSON (new pattern): OL `VectorSource` with `url` + `format` handles fetch+parse internally
- Loading state: `bee-map.ts` uses Lit `@state()` decorators; a `loading: boolean` property fits naturally

### Integration Points
- `bee-map.ts` is the top-level component that constructs `ParquetSource`, `SampleParquetSource`, `countySource`, `ecoregionSource` — loading/error state lives here
- CloudFront `/data/*` behavior is additive to the existing distribution in `beeatlas-stack.ts` — no changes to default behavior

</code_context>

<specifics>
## Specific Ideas

- `VITE_DATA_BASE_URL` defaults to `https://beeatlas.net/data` — no trailing slash; append `/ecdysis.parquet` etc.
- CORS must cover `Range` request headers for hyparquet compatibility (even though current `asyncBufferFromUrlEager` doesn't use Range, keeping the door open for streaming in the future)
- The parquet files are the heavy files (~seconds); GeoJSON files are small and fast. Loading indicator primarily covers parquet fetch time.

</specifics>

<deferred>
## Deferred Ideas

- **Loading UX redesign** — Spinner, progress bars, per-layer loading indicators, and interactive loading states all deferred to the DuckDB WASM frontend phase (WASM-01/02). Rough parity is the goal here.
- **Range request optimization** — `asyncBufferFromUrlEager` fetches the full file eagerly. Switching to streaming Range requests for hyparquet is deferred to the DuckDB WASM phase.

</deferred>

---

*Phase: 28-frontend-runtime-fetch*
*Context gathered: 2026-03-29*
