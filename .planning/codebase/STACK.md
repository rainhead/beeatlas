# Technology Stack

**Analysis Date:** 2026-05-13

## Languages

**Primary:**
- TypeScript 5.8.2 - Frontend SPA (Lit components), scripts, build tooling
- Python 3.14+ - Data pipeline orchestration (`data/pyproject.toml`)

**Secondary:**
- JavaScript - Node.js build scripts, Eleventy configuration

## Runtime

**Environment:**
- Node.js 24.12 (specified in `.nvmrc`)
- Python 3.14+ (backend data pipeline)

**Package Manager:**
- npm (Node.js) - Lockfile: `package-lock.json` (present)
- uv (Python) - Declared in pyproject.toml for reproducible Python environment

## Frameworks

**Frontend:**
- Lit 3.2.1 - Web components framework (custom elements: `<bee-atlas>`, `<bee-map>`, `<bee-sidebar>`, etc.)
  - Location: `src/` directory, bundled via Vite
  - Decorators enabled in `tsconfig.json`

**Build & Dev:**
- Eleventy 3.1.5 - Static site generator (`eleventy.config.js`)
  - Wrapper: `@11ty/eleventy-plugin-vite` 7.1.1 — bundles frontend via Vite, copies assets
  - Input: `_pages/` (minimal — SPA entry only)
  - Output: `_site/`
- Vite 6.2.3 - Frontend bundler + dev server
  - Config: `vite.config.ts` (excludes wa-sqlite from optimization; defines preload assets plugin)
  - Happy DOM environment for SSR tests

**Data Pipeline:**
- dlt 1.23.0+ - Data loader framework for duckdb destination (Python)
- dbt-duckdb 1.10.1 - DBT for duckdb-based transformation (Python, dev dependency)
  - Location: `data/dbt/`
  - Status: Sandbox only as of v3.3 (May 2026) — not integrated into `data/run.py` or nightly execution
  - 23 models: 11 staging + 9 intermediate + 3 marts

**Testing:**
- Vitest 4.1.2 - Unit/component test runner
  - Environment: happy-dom
  - Config: `vite.config.ts`
  - Run: `npm test`

## Key Dependencies

**Critical:**
- mapbox-gl 3.22.0 - Vector tile mapping library (primary map engine, replaced OpenLayers in v3.0 April 27 2026)
  - Location: `src/bee-map.ts`
  - Token: `VITE_MAPBOX_TOKEN` (env var)
  - Style: `mapbox://styles/mapbox/outdoors-v12`
- wa-sqlite 1.0.0 - WASM SQLite + MemoryVFS (frontend SQL engine as of v2.6, replaces DuckDB-WASM)
  - Location: `src/sqlite.ts`, `src/filter.ts`
  - Used for in-browser filtering of occurrence data

**Data Processing:**
- duckdb 1.4-1.x - Columnar OLAP DB (backend data warehouse, both local and S3)
  - Location: `data/beeatlas.duckdb` (local) / S3 bucket
  - Used by all dlt pipelines and species export
- pyarrow 12+ - Parquet columnar format support (Python)
- boto3 1.42.78+ - AWS SDK for S3 operations (data pipeline, nightly.sh uploads)
- requests - HTTP client for Ecdysis/iNaturalist API calls
- beautifulsoup4 - HTML parsing for Ecdysis link scraping

**Build/Tooling:**
- typescript 5.8.2 - Type checking
- happy-dom 20.8.9 - DOM implementation for tests
- hyparquet 1.25.6 - Parquet file reader (browser-side, for loading occurrences.parquet into wa-sqlite)
- @iarna/toml 2.2.5 - TOML parser (dlt config parsing)

**Infrastructure:**
- aws-cdk-lib 2.238.0 - AWS infrastructure as code
  - Location: `infra/lib/`
  - S3 bucket, CloudFront distribution, Lambda (archival; not active path)

**Optional/Dev:**
- @types/* - TypeScript definitions for Node, GeoJSON, etc.
- ts-node - TypeScript REPL for CDK/infrastructure

## Configuration

**Environment:**
- `.env` file at repo root (development)
  - `VITE_MAPBOX_TOKEN` - Mapbox GL JS access token (required for build)
  - `VITE_DATA_BASE_URL` - Base URL for runtime parquet fetches (defaults to `https://beeatlas.net/data`)
- No `.env` checked in; `.env.example` provided
- GitHub Actions secrets: `MAPBOX_TOKEN`, environment variables `S3_BUCKET_NAME`, `AWS_DEPLOYER_ROLE_ARN`, `CF_DISTRIBUTION_ID`

**Build:**
- `tsconfig.json` - TypeScript compiler, strict mode, ES2023 target
- `vite.config.ts` - Vite build config (wa-sqlite excluded from optimization)
- `.eslintrc*` or biome - Linting (if present; not detected in config)
- `.prettierrc` or biome - Formatting (if present; not detected in config)
- `scripts/validate-schema.mjs` - Parquet schema validation gate (runs before CI build)
- `scripts/validate-species.mjs` - Species export validation
- `scripts/validate-bundle-size.mjs` - Bundle size monitoring

## Platform Requirements

**Development:**
- Node.js 24.12 via `.nvmrc`
- npm ci
- Python 3.14+ (for data pipeline)
- Optional: uv for Python package management
- macOS/Linux development environment

**Production:**
- Deployment: AWS S3 + CloudFront (static hosting only, no server runtime)
- Data hosting: S3 bucket (parquet files, GeoJSON boundaries, species feeds)
- CI/CD: GitHub Actions (build on every push, deploy main → S3 + CloudFront via OIDC)
- Nightly data pipeline: Shell script (`data/nightly.sh`) on maderas (external cron, pulls/pushes from S3)

## Data Formats & Export

**Runtime Data:**
- `occurrences.parquet` - Main occurrence dataset (loaded into wa-sqlite at runtime via hyparquet)
- `counties.geojson` - Washington State county boundaries (GeoJSON)
- `ecoregions.geojson` - EPA Level 3 ecoregion boundaries (GeoJSON)
- Feeds: JSON/RSS species feeds (`data/feeds/`)

**Database:**
- DuckDB `.duckdb` file (backend warehouse in S3 + local nightly pipeline)
- SQLite in-memory (frontend, loaded from parquet)

---

*Stack analysis: 2026-05-13*
