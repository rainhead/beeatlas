# Technology Stack

*Updated: 2026-04-07 (from intel refresh)*

## Languages

- **TypeScript** — frontend (`frontend/src/`)
- **Python 3.14+** — data pipeline (`data/`)
- **SQL** — DuckDB queries in export.py and dlt pipeline resources

## Frameworks

- **Lit** — web components (`LitElement`, `@customElement`)
- **OpenLayers** — interactive map rendering
- **dlt (data load tool)** — pipeline orchestration and DuckDB loading
- **AWS CDK v2 (TypeScript)** — infrastructure as code

## Key Libraries

**Frontend:**
- `@duckdb/duckdb-wasm` — in-browser DuckDB via Web Workers (EH bundle, no SharedArrayBuffer)
- `ol` — OpenLayers map engine
- `lit` — web component base
- `temporal-polyfill` — TC39 Temporal API for recency coloring
- `hyparquet` — parquet footer reading (schema validation script only; not in frontend runtime)

**Data pipeline:**
- `dlt[duckdb]` — pipeline framework writing to `beeatlas.duckdb`
- `duckdb` — spatial joins in export.py
- `geopandas` — shapefile reading for geography pipeline
- `requests` + `beautifulsoup4` — Ecdysis HTML scraping for iNat links
- `pytest` — data pipeline tests

## Build & Tooling

- **Vite** — frontend build tool and dev server
- **Vitest** — frontend test runner (configured inline in `vite.config.ts`)
- **TypeScript compiler** — strict mode (`noUnusedLocals`, `noUncheckedIndexedAccess`, etc.)
- **uv** — Python package manager (`data/pyproject.toml` + `data/uv.lock`)
- **npm workspaces** — root coordinates `frontend/` and `infra/`

## Testing

- **Vitest** (frontend): 61 tests across 4 files — url-state round-trips, filter SQL generation, Lit component render tests, architectural invariant checks
- **pytest** (data pipeline): 13 tests — export schema validation, transform unit tests

## Deployment

- **Hosting:** AWS S3 + CloudFront (static)
- **CI/CD:** GitHub Actions — `deploy.yml` builds and deploys on push to main; OIDC auth, no stored credentials
- **Data pipeline:** AWS Lambda Docker image + EventBridge schedules (CDK-provisioned); active execution path is `data/nightly.sh` on maderas cron
- **Region:** us-west-2 (us-east-1 for ACM certs)

## Runtime Environments

- **Frontend:** Browser — DuckDB WASM runs in a Web Worker
- **Data pipeline:** Python 3.14+, DuckDB native; Lambda uses Docker image from `data/Dockerfile`
- **Infra:** Node.js (CDK deploy)
