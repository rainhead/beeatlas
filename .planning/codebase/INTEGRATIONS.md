# External Integrations

**Analysis Date:** 2026-02-18

## APIs & External Services

**Biodiversity Data Sources:**
- GBIF (Global Biodiversity Information Facility) - Backbone taxonomy data
  - URL: `https://hosted-datasets.gbif.org/datasets/backbone/current/backbone.zip`
  - Usage: Downloaded as zip, extracted as TSV, converted to Parquet
  - Auth: None (public dataset)
  - Client: `requests` library in `data/scripts/download.py`

- iNaturalist - Community science observation data
  - API v2 URL: `https://api.inaturalist.org/v2/observations`
  - Usage: Fetched per-observation JSON via Makefile wget, assembled to Parquet
  - Auth: None for public observations
  - Client: `pyinaturalist` library (`data/pyproject.toml`); also raw wget in `data/Makefile`
  - Field spec: Custom sparse field selection via query param in `data/Makefile`

- Ecdysis (Symbiota collections portal) - Museum specimen records
  - URL: `https://ecdysis.org/collections/download/downloadhandler.php`
  - Usage: POST request to download DarwinCore Archive zip for Washington bee specimens
  - Auth: None (public download)
  - Client: `requests` library POST in `data/scripts/download.py`
  - Post parameters specify `schema=symbiota`, `format=tab`, Washington state filter

- OSU Museum (Oregon State University) - Field observation labels
  - URL: `https://docs.google.com/spreadsheets/d/1lcul17yLdZvd0QmbhUHN-fcDpocsY04v/export?format=tsv`
  - Usage: Downloaded as TSV from Google Sheets export, converted to Parquet
  - Auth: None (public Google Sheet)
  - Client: wget in `data/Makefile`

**Tile Map Services:**
- Esri ArcGIS Online - Base map tiles
  - URL: `https://services.arcgisonline.com/arcgis/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}`
  - URL (mirror): `https://server.arcgisonline.com/arcgis/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}`
  - Usage: Background ocean base map in `frontend/src/bee-map.ts`
  - Auth: None (public tiles)
- Esri ArcGIS Ocean Reference - Reference overlay tiles
  - URL: `https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Reference/MapServer/tile/{z}/{y}/{x}`
  - Usage: Ocean reference labels overlay in `frontend/src/bee-map.ts`
  - Note: Noted in source as unmaintained

**CDN Resources:**
- jsDelivr CDN - OpenLayers CSS stylesheet
  - URL: `https://cdn.jsdelivr.net/npm/ol@v10.8.0/ol.css`
  - Usage: Loaded at runtime in `BeeMap` shadow DOM in `frontend/src/bee-map.ts`

**Geospatial Data:**
- CEC (Commission for Environmental Cooperation) - North American Ecoregions Level 3
  - URL: `https://dmap-prod-oms-edc.s3.us-east-1.amazonaws.com/ORD/Ecoregions/cec_na/NA_CEC_Eco_Level3.zip`
  - Usage: Downloaded via Makefile, used for ecoregion spatial data
  - Auth: None (public AWS S3)

## Data Storage

**Databases:**
- DuckDB - In-process analytical database
  - Usage: Data assembly queries in `data/Makefile`, ad-hoc querying
  - No persistent database file; used as `:memory:` or temporary files during pipeline
  - Schema defined in `data/schema.sql` (PostgreSQL-compatible schema for `ecdysis` data)

- PostgreSQL (schema only) - Schema defined in `data/schema.sql` for `ecdysis` schema
  - Uses sequences (`CREATE SEQUENCE`), schemas (`CREATE SCHEMA`), and `timestamptz`
  - No connection configuration detected; schema file may be aspirational or for a separate deployment

**File Storage:**
- Local filesystem - All processed data stored as Parquet files
  - Processed outputs: `data/*.parquet` (e.g., `data/ecdysis.parquet`, `data/eco3.parquet`)
  - Raw downloads: `data/ecdysis_wa.zip`, zip archives
  - Frontend asset: `frontend/ecdysis.parquet` - served as static asset via Vite `?url` import

**Caching:**
- None detected

## Authentication & Identity

**Auth Provider:**
- None - No authentication system implemented
- All external APIs accessed anonymously (public datasets)
- No user accounts or sessions in the application

## Monitoring & Observability

**Error Tracking:**
- None detected

**Logs:**
- `console.debug()` in `frontend/src/parquet.ts` for feature loading count
- `print()` statements in `data/scripts/download.py` for pipeline progress

## CI/CD & Deployment

**Hosting:**
- Not configured - no deployment configuration detected

**CI Pipeline:**
- None detected

## Environment Configuration

**Required env vars:**
- None detected - no environment variable usage found in explored code

**Secrets location:**
- Not applicable - all integrations use public APIs with no authentication

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None

---

*Integration audit: 2026-02-18*
