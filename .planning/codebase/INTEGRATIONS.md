# External Integrations

**Analysis Date:** 2026-05-13

## APIs & External Services

**Specimen Occurrence Data:**
- Ecdysis (Symbiota) - Specimen collection data repository
  - SDK/Client: `requests` (HTTP) + BeautifulSoup (HTML scraping)
  - Auth: None (public API)
  - Endpoint: `https://ecdysis.org/collections/individual/index.php` (download handler POST)
  - Pipeline: `data/ecdysis_pipeline.py`
    - Downloads ZIP exports via POST to `/collections/download/downloadhandler.php`
    - Rate limit: 20 req/sec
    - Also scrapes individual specimen pages (cached in `data/html-cache/`) to extract iNaturalist observation links

**Observation & Floral Host Data:**
- iNaturalist - Citizen science observations (specimens + floral hosts)
  - SDK/Client: `requests` (REST API v2)
  - Auth: None (public API, but rate-limited)
  - Endpoint: `https://api.inaturalist.org/v2/` (paginated observations, taxa endpoints)
  - Pipeline: `data/inaturalist_pipeline.py`
    - Uses dlt REST API resource module (`dlt.sources.rest_api`)
    - Rate limit: ~60 req/min sustained (enforces 429 throttling backoff)
    - Custom retry logic: 5 retries with exponential backoff (base 1.0s × 2^attempt)
    - Fields: Observation metadata, taxon info, geojson coordinates, project associations

**Alternative Data Source (Experimental):**
- WABA (Work with a Biologist) - Alternative occurrence source
  - SDK/Client: `requests` (HTTP)
  - Pipeline: `data/waba_pipeline.py`
  - Status: Part of pipeline but lower priority than ecdysis/iNat

**Taxonomic Lineage Enrichment:**
- iNaturalist v2 API (taxon endpoints)
  - Used in `data/inaturalist_pipeline.py::enrich_taxon_lineage_extended()`
  - Walks lineage tree: species → genus → family → order (heavily fans out, triggers rate limits)
  - Implements retry/pace logic to avoid 429s on lineage walks

**External Links (Frontend):**
- Ecdysis specimen pages - Deep links in `src/bee-occurrence-detail.ts`
  - Example: `https://ecdysis.org/collections/individual/index.php?occid={ecdysis_id}`
- iNaturalist observations - Links to photos/identifications
  - Example: `https://www.inaturalist.org/observations/{observation_id}`
- GitHub repository - Link in header

## Data Storage

**Databases:**
- DuckDB - Backend warehouse (local + S3)
  - Connection: File-based (`data/beeatlas.duckdb`) or S3 via boto3
  - Client: `duckdb` Python SDK + dlt destination
  - Schema: ecdysis_data, inaturalist_data, geographies, marts (via dbt)
  - Size: Multi-gigabyte (specimens + observations)

**File Storage:**
- AWS S3 - Production data + database archive
  - Bucket: `beeatlasstack-sitebucket397a1860-h5dtjzkld3yv` (CDK-provisioned, site bucket also)
  - Location structure:
    - `data/occurrences.parquet` - Main occurrence dataset (parquet)
    - `data/counties.geojson` - County boundaries
    - `data/ecoregions.geojson` - Ecoregion boundaries
    - `data/feeds/` - Species feed JSON/RSS
    - `db/beeatlas.duckdb` - Database backup (pulled nightly, pushed after pipeline)
    - `assets/` - Hashed JS/CSS (immutable, cache forever)
  - Sync strategy: `nightly.sh` pulls DuckDB, runs pipelines, pushes exports + DB
  - Client: `boto3` (Python data pipeline)

**Local File Storage:**
- `data/` - Local development data directory
  - `beeatlas.duckdb` - Local development database
  - `html-cache/` - Cached Ecdysis HTML pages (for link scraping)
  - `dbt/` - dbt-duckdb project (sandbox, not production)

**Caching:**
- Browser in-memory - wa-sqlite in MemoryVFS (no persistent cache)
- Mapbox style caching - Mapbox GL JS client-side tile cache (default behavior)
- Ecdysis HTML disk cache - `data/html-cache/` during link scraping (`ecdysis_pipeline.py`)

## Authentication & Identity

**Auth Provider:**
- None (all integrations are public APIs or unauthenticated S3)

**AWS Access:**
- GitHub OIDC - CI/CD deploy job assumes role via `aws-actions/configure-aws-credentials`
  - Role: `${{ vars.AWS_DEPLOYER_ROLE_ARN }}`
  - Permissions: S3 sync + CloudFront invalidation (deploy job only)
  - No stored credentials (identity federation via GitHub JWT)
- Local development: `AWS_PROFILE=beeatlas` (named profile in `~/.aws/config` or credentials)

**Mapbox Token:**
- `VITE_MAPBOX_TOKEN` - Environment variable (GitHub Actions secret in CI)
- Required for: Mapbox GL JS initialization in `src/bee-map.ts`
- Token scope: Vector tiles + styles for outdoors-v12

## Monitoring & Observability

**Error Tracking:**
- None (static site, no centralized error reporting)

**Logs:**
- Console logging in browser (dev tools)
- Stdout/stderr in data pipeline (nightly.sh captures via cron MAILTO or redirect)
- GitHub Actions logs - Build and deploy steps captured in workflow runs
- CloudWatch (optional, not currently wired)

**Benchmarking:**
- Browser console: `[BENCHMARK]` logs from `src/sqlite.ts`
  - WASM instantiation time, heap usage, table load time, query latency

## CI/CD & Deployment

**Hosting:**
- AWS S3 + CloudFront
  - Region: us-west-2
  - S3 bucket: Site bucket (CDK-provisioned with hashing)
  - CloudFront distribution: `E3SAI2PQ8FN0E7`
  - Cache control: Hashed assets (max-age=31536000, immutable); index/others (max-age=0)

**CI Pipeline:**
- GitHub Actions (`.github/workflows/deploy.yml`)
  - Triggers: Every push to any branch (build); main branch only (deploy)
  - Build job:
    1. Checkout
    2. Setup Node.js (24.12 from `.nvmrc`)
    3. npm ci
    4. `npm run validate-schema` (parquet schema gate)
    5. `npm test` (Vitest)
    6. `npm run build` (typecheck + eleventy + validate-bundle-size)
    7. Upload `_site/` artifact
  - Deploy job (main branch only):
    1. Download artifact
    2. Configure AWS credentials via OIDC
    3. S3 sync (hashed assets with immutable cache; everything else with max-age=0)
    4. CloudFront invalidation (await completion)
  - Lighthouse job: Runs after deploy on main (performance monitoring)

**Nightly Data Pipeline:**
- Cron job on maderas (external server)
- Script: `data/nightly.sh`
  - Environment: `DB_PATH`, `EXPORT_DIR`, `AWS_PROFILE`, `BUCKET`, `DISTRIBUTION_ID`
  - Flow:
    1. Pull `db/beeatlas.duckdb` from S3
    2. Run `uv run python run.py` (all pipelines: ecdysis → ecdysis-links → inaturalist → waba → projects → anti-entropy → checklist → resolve-taxon-ids → taxon-lineage-extended → export → species-export → species-maps → feeds)
    3. Push exports (`occurrences.parquet`, `counties.geojson`, `ecoregions.geojson`, `feeds/`) to S3
    4. Backup updated DuckDB to S3
    5. CloudFront invalidation on `/data/*`
  - Error handling: Trap on exit backs up DB even if pipeline fails (preserves progress)

## Environment Configuration

**Required env vars:**
- Frontend (build time):
  - `VITE_MAPBOX_TOKEN` - Mapbox GL JS token
- Frontend (runtime):
  - `VITE_DATA_BASE_URL` - Base URL for data fetches (defaults to `https://beeatlas.net/data`)
- Data pipeline (nightly.sh):
  - `DB_PATH` - Path to beeatlas.duckdb (defaults to `data/beeatlas.duckdb`)
  - `EXPORT_DIR` - Output directory for parquet/geojson exports (defaults to `/tmp/beeatlas-export`)
  - `AWS_PROFILE` - Named AWS profile (defaults to `beeatlas`)
  - `BUCKET` - S3 bucket name (defaults to cdk-provisioned site bucket)
  - `DISTRIBUTION_ID` - CloudFront distribution ID (defaults to E3SAI2PQ8FN0E7)

**Secrets location:**
- GitHub Actions: Secrets in repo settings (`MAPBOX_TOKEN`) + environment variables (`S3_BUCKET_NAME`, `AWS_DEPLOYER_ROLE_ARN`, `CF_DISTRIBUTION_ID`)
- Local development: `.env` file (not committed; use `.env.example` as template)
- AWS: Credentials in `~/.aws/config` (named profile `beeatlas`)

## Webhooks & Callbacks

**Incoming:**
- None (static site, no server-side endpoints)

**Outgoing:**
- None (unidirectional data flow: iNat/Ecdysis → pipeline → S3 → frontend)

## Data Pipeline Architecture

**Orchestration:** `data/run.py`
- Sequential execution of 13 steps
- Uses dlt framework for resource scheduling + duckdb destination
- All steps write to single DuckDB database

**Pipeline Steps (Execution Order):**
1. `ecdysis` - Download Ecdysis specimen ZIP exports (POST to endpoint)
2. `ecdysis-links` - Scrape HTML pages to extract iNaturalist observation links
3. `inaturalist` - Fetch observations from iNat v2 API (paginated REST calls)
4. `waba` - Load WABA occurrence data (alternative source)
5. `projects` - Load iNaturalist project metadata
6. `anti-entropy` - Deduplication + conflict resolution
7. `checklist` - Validate against known species checklist
8. `resolve-taxon-ids` - Map canonical names to taxon IDs
9. `taxon-lineage-extended` - Enrich with full lineage (fans out iNat API calls)
10. `export` - Write `occurrences.parquet` + GeoJSON boundaries
11. `species-export` - Generate `species.parquet` (experimental; species maps + feeds)
12. `species-maps` - Generate GeoJSON maps per species
13. `feeds` - Generate JSON/RSS species feeds

**Database Schema (DuckDB):**
- `ecdysis_data.*` - Specimens from Ecdysis
  - `occurrences` - Specimen records
  - `identifications` - Taxonomic IDs
  - `occurrence_links` - iNaturalist links (scraped)
- `inaturalist_data.*` - Observations + taxon metadata
- `geographies.*` - County + ecoregion boundaries (separate manual load)
- Marts (dbt): Joined occurrence dataset (`occurrences` final export)

**Data Migrations:** `data/run.py::_apply_migrations()`
- Phase 48: Rename `inat_observation_id` → `host_observation_id` in occurrence_links
- Phase 47: Backfill `geom` GEOMETRY column (old schema compatibility for S3-hosted DB)

---

*Integration audit: 2026-05-13*
