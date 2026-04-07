# Architecture

*Updated: 2026-04-07 (from intel refresh)*

## Pattern

**Client-side DuckDB analytics with scheduled static data exports.**

The frontend is a single-page app (Lit web components + OpenLayers) that runs DuckDB WASM in the browser. On load it fetches parquet and GeoJSON files from CloudFront into an in-browser DuckDB instance. All filtering, aggregation, and ID queries run locally — no backend required at runtime. The data pipeline runs on a schedule (Lambda + maderas cron), producing fresh exports to S3/CloudFront.

## Key Components

| Component | Path | Responsibility |
|-----------|------|----------------|
| `<bee-atlas>` | `frontend/src/bee-atlas.ts` | Root coordinator; owns all reactive state |
| `<bee-map>` | `frontend/src/bee-map.ts` | OpenLayers map; pure presenter, fires events up |
| `<bee-sidebar>` | `frontend/src/bee-sidebar.ts` | Sidebar shell composing filter + detail sub-components |
| `<bee-filter-controls>` | `frontend/src/bee-filter-controls.ts` | Filter UI; emits `filter-changed` |
| `<bee-specimen-detail>` | `frontend/src/bee-specimen-detail.ts` | Cluster detail panel; pure presenter |
| `<bee-sample-detail>` | `frontend/src/bee-sample-detail.ts` | iNat sample detail panel; pure presenter |
| DuckDB module | `frontend/src/duckdb.ts` | Browser DuckDB singleton; loads parquet/GeoJSON |
| Filter engine | `frontend/src/filter.ts` | SQL filter builder; `queryVisibleIds` → ID sets |
| Feature sources | `frontend/src/features.ts` | OL VectorSource subclasses reading from DuckDB |
| Region layer | `frontend/src/region-layer.ts` | County/ecoregion boundary OL layers |
| Style factories | `frontend/src/style.ts` | Cluster and sample dot style functions |
| URL state | `frontend/src/url-state.ts` | URL serialization/deserialization |
| Pipeline orchestrator | `data/run.py` | Sequences all 6 pipeline steps |
| Export script | `data/export.py` | Exports 4 frontend data files from DuckDB |
| CDK stack | `infra/lib/beeatlas-stack.ts` | S3 + CloudFront + Lambda + Route53 + OIDC |
| Schema validator | `scripts/validate-schema.mjs` | Pre-build parquet column schema gate (CI) |

## Data Flow

**Pipeline (scheduled):**
```
Ecdysis API + iNaturalist API + geography sources
  → dlt pipelines (Python) → beeatlas.duckdb
  → export.py (spatial join) → ecdysis.parquet + samples.parquet + GeoJSON
  → S3 → CloudFront
```

**Frontend (browser):**
```
DuckDB WASM init → fetch parquet/GeoJSON from CloudFront
  → EcdysisSource + SampleSource load OL features from DuckDB
  → filter change → buildFilterSQL → DuckDB query → visibleEcdysisIds/SampleIds
  → style functions ghost non-matching features via closure-captured ID sets
  → URL state serialized to URLSearchParams for back/forward navigation
```

## Conventions

**State ownership:** `bee-atlas` owns all reactive state. Children receive state as `@property` inputs and emit custom events upward. No shared mutable module-level state.

**Style caching bypass:** OL style functions must not use a style cache when `filterState` is active or `selectedOccIds` is non-empty — the same feature can have different styles depending on dynamic state.

**Filter generation guard:** `bee-atlas` increments `_filterQueryGeneration` on each filter change. Async `queryVisibleIds` results are discarded if the counter has advanced, preventing stale ID set overwrites.

**Data locations:** Pipeline exports go to `frontend/public/data/`. CI `validate-schema.mjs` reads from this path.

**ID format:** `ecdysis:<integer>` for specimens, `inat:<integer>` for samples.

**Infrastructure:** All AWS resources in us-west-2 except ACM certificates (us-east-1, required by CloudFront). GitHub Actions deploys via OIDC — no stored credentials.
