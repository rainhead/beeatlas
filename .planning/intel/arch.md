---
updated_at: "2026-04-06T00:00:00.000Z"
---

## Architecture Overview

**Client-side DuckDB analytics with server-rendered static data.**

The frontend is a single-page web app (Lit web components + OpenLayers) that runs DuckDB WASM in the browser. On load, it fetches parquet files from CloudFront and loads them into an in-browser DuckDB instance. All filtering, aggregation, and occurrence ID queries run locally in DuckDB with no backend required. The data pipeline runs on a schedule in AWS Lambda, producing fresh parquet and GeoJSON exports to S3.

## Key Components

| Component | Path | Responsibility |
|-----------|------|----------------|
| `<bee-atlas>` | `frontend/src/bee-atlas.ts` | Root app component; owns all reactive state |
| `<bee-map>` | `frontend/src/bee-map.ts` | OpenLayers map; renders specimens and sample dots |
| `<bee-sidebar>` | `frontend/src/bee-sidebar.ts` | Filter controls + detail panels |
| DuckDB module | `frontend/src/duckdb.ts` | Browser DuckDB singleton; loads parquet/GeoJSON |
| Filter engine | `frontend/src/filter.ts` | SQL filter builder; queryVisibleIds → ID sets |
| Feature sources | `frontend/src/features.ts` | OL VectorSource subclasses reading from DuckDB |
| Region layer | `frontend/src/region-layer.ts` | County/ecoregion boundary OL layers |
| Style factories | `frontend/src/style.ts` | Cluster and sample dot style functions with recency coloring |
| URL state | `frontend/src/url-state.ts` | URL serialization/deserialization for browser history |
| Pipeline orchestrator | `data/run.py` | Runs all data pipeline steps in sequence |
| Export script | `data/export.py` | Exports 4 frontend data files from DuckDB |
| CDK stack | `infra/lib/beeatlas-stack.ts` | S3 + CloudFront + Lambda + Route53 + OIDC |
| Schema validator | `scripts/validate-schema.mjs` | Pre-build parquet column schema gate (CI) |

## Data Flow

**Pipeline (offline/scheduled):**
```
Ecdysis API + iNaturalist API + geography sources
  → dlt pipelines (Python) → beeatlas.duckdb (DuckDB native)
  → export.py (spatial join, DuckDB COPY) → ecdysis.parquet + samples.parquet + GeoJSON
  → S3 (data/*) → CloudFront CDN
```

**Frontend (browser):**
```
Browser load → DuckDB WASM init → fetch parquet/GeoJSON from CloudFront
  → EcdysisSource + SampleSource load features from DuckDB → OL map renders dots/clusters
  → User applies filter → buildFilterSQL → DuckDB query → visibleEcdysisIds/SampleIds
  → style functions ghost non-matching features via closure-captured ID sets
  → URL state serialized to URLSearchParams for back/forward navigation
```

## Conventions

**State ownership:** `bee-atlas` owns all reactive state. Child components (`bee-map`, `bee-sidebar`) receive state as properties and fire custom events upward. No shared mutable module-level state.

**Style caching bypass rule:** OL style functions MUST NOT use a style cache when filter state or selectedOccIds is active — the same feature can have different styles depending on dynamic state. Cache is only used when filter is inactive and nothing is selected.

**Filter generation guard:** `bee-atlas` increments `_filterQueryGeneration` on each filter change. Async `queryVisibleIds` results are discarded if the generation counter has advanced, preventing stale ID set overwrites.

**Data locations:** Pipeline exports go to `frontend/public/data/` (not `frontend/src/assets/`). CI validate-schema reads from this path.

**ID format:** Specimen IDs are `ecdysis:<integer>` strings. Sample IDs are `inat:<integer>` strings. Both are prefixed to distinguish source systems.

**Parquet schema validation:** `scripts/validate-schema.mjs` runs before every build in CI. Reads local parquet if available, otherwise fetches CloudFront footer via Range request. Exits 1 on missing columns.

**Infrastructure:** All AWS resources in us-west-2 except ACM certificates (us-east-1, required by CloudFront). GitHub Actions deploys via OIDC (no stored credentials). Lambda uses Docker image from `data/Dockerfile`.

**Python packaging:** `data/` uses `uv` with `pyproject.toml`. Requires Python 3.14+. Lambda also uses Docker image from this same directory.
