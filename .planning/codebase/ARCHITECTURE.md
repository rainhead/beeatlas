# Architecture

**Analysis Date:** 2026-02-18

## Pattern Overview

**Overall:** Dual-project monorepo — a Python data pipeline sub-project and a TypeScript frontend sub-project, loosely coupled via Parquet files as the interchange format.

**Key Characteristics:**
- No server-side API: the frontend is a static site that reads Parquet files directly in the browser
- Data pipeline runs offline (CLI scripts + Makefile), producing Parquet outputs consumed by the frontend
- Frontend is a single custom web component rendered into a bare HTML page
- Two separate dependency managers: `uv` (Python) in `data/`, and `npm` (Node) in `frontend/`

## Layers

**Data Acquisition Layer:**
- Purpose: Download raw data from external sources (GBIF, Ecdysis, iNaturalist, OSU)
- Location: `data/scripts/download.py`, `data/ecdysis/download.py`, `data/Makefile`
- Contains: HTTP fetch logic, POST requests, zip extraction, pandas dtype specifications
- Depends on: External URLs, `requests`, `pandas`
- Used by: Data processing layer

**Data Processing Layer:**
- Purpose: Transform raw downloads into cleaned Parquet files
- Location: `data/ecdysis/occurrences.py`, `data/osu_mm/`, `data/inat/`
- Contains: Pandas DataFrames, GeoPandas GeoDataFrames, column renaming/filtering, Parquet serialization
- Depends on: Raw source files, `pandas`, `geopandas`, `pyarrow`
- Used by: Frontend (via bundled Parquet assets)

**Frontend Presentation Layer:**
- Purpose: Render bee occurrence points on an interactive map in the browser
- Location: `frontend/src/`
- Contains: Lit web component, OpenLayers map, custom VectorSource subclass
- Depends on: Parquet assets bundled by Vite, `ol`, `lit`, `hyparquet`
- Used by: End users via browser

## Data Flow

**Offline Data Pipeline:**

1. `data/scripts/download.py` or `data/Makefile` fetches raw data from external APIs/URLs
2. Source-specific modules (e.g., `data/ecdysis/occurrences.py`) parse raw files into pandas DataFrames
3. DataFrames are serialized to Parquet files (e.g., `data/ecdysis.parquet`)
4. Parquet files are placed in `frontend/src/assets/` for bundling

**Runtime Map Rendering:**

1. Browser loads `frontend/index.html`, which includes `frontend/src/bee-map.ts` as an ES module
2. Vite-bundled app instantiates the `<bee-map>` custom element
3. `BeeMap.firstUpdated()` in `frontend/src/bee-map.ts` initializes an OpenLayers `Map` with tile base layers and a `VectorLayer`
4. `ParquetSource` in `frontend/src/parquet.ts` (extends `ol/source/Vector`) fetches the bundled `.parquet` URL via `hyparquet`
5. `parquetReadObjects` streams columns `[ecdysis_id, ecdysis_fieldNumber, longitude, latitude]` into `ol/Feature` point geometries
6. Features are rendered on the map using `beeStyle` from `frontend/src/style.ts`

**State Management:**
- No reactive state management framework; map state is held inside the OpenLayers `Map` instance on the `BeeMap` component

## Key Abstractions

**ParquetSource:**
- Purpose: Bridges Parquet file format with OpenLayers' vector source interface
- Location: `frontend/src/parquet.ts`
- Pattern: Extends `ol/source/Vector`, implements the `loader` callback using `hyparquet.asyncBufferFromUrl` and `parquetReadObjects`; uses `all` loading strategy (loads everything at once)

**BeeMap (Web Component):**
- Purpose: Self-contained map component using Lit's shadow DOM + OpenLayers
- Location: `frontend/src/bee-map.ts`
- Pattern: `@customElement('bee-map')` LitElement; map is created in `firstUpdated()` lifecycle hook targeting a shadow DOM `<div id="map">`; OpenLayers stylesheet loaded inline via `<link>` inside shadow DOM

**beeStyle / clusterStyle:**
- Purpose: Stateless OpenLayers style definitions for rendering specimen points
- Location: `frontend/src/style.ts`
- Pattern: Singleton `Style` object for individual points; function-based `clusterStyle` for cluster features (not yet wired up in the map)

**Ecdysis Data Module:**
- Purpose: DarwinCore-aware parser for Ecdysis occurrence exports
- Location: `data/ecdysis/occurrences.py`
- Pattern: `read_occurrences(file)` reads TSV with strict dtype spec, adds `ecdysis_` prefix to all columns, returns GeoDataFrame; `to_parquet(df, out)` selects display columns and writes Parquet

**Download Script:**
- Purpose: Configures and executes multi-source data acquisition
- Location: `data/scripts/download.py`
- Pattern: `FILE_CONFIGS` dict drives source type dispatch (`zip`, `url`, `post_zip`); `apply_transformations` pipeline applies named filter steps; outputs Snappy-compressed Parquet to `data/processed/`

## Entry Points

**Data Pipeline:**
- Location: `data/scripts/download.py` (run with `python data/scripts/download.py`)
- Triggers: Manual execution or Makefile targets
- Responsibilities: Downloads all configured raw data and produces Parquet outputs

**Makefile Targets:**
- Location: `data/Makefile`
- Triggers: `make` invocations
- Responsibilities: Declarative dependency graph for wget downloads and DuckDB transformations for GBIF backbone, OSU labels, and iNaturalist data

**Frontend Dev Server:**
- Location: `frontend/` (run with `npm run dev` inside `frontend/`)
- Triggers: Vite dev server
- Responsibilities: Serves the SPA at localhost with HMR

**Frontend Build:**
- Location: `frontend/` (run with `npm run build`)
- Triggers: `tsc && vite build`
- Responsibilities: Type-checks and bundles the frontend including Parquet assets into `frontend/dist/`

**HTML Entry:**
- Location: `frontend/index.html`
- Triggers: Browser navigation
- Responsibilities: Loads global CSS, bootstraps `<bee-map>` custom element

## Error Handling

**Strategy:** Minimal; failures surface as uncaught exceptions or console errors

**Patterns:**
- Data pipeline: `try/except` in `stream_and_convert_file` re-raises after printing; no retry logic
- `ParquetSource`: `.catch(failure)` passes OpenLayers' failure callback on fetch/parse errors; no user-visible error UI
- `ecdysis/occurrences.py`: Contains a `pdb.set_trace()` in `to_parquet()` — this is a debugging artifact, not production code

## Cross-Cutting Concerns

**Logging:** `print()` statements in Python pipeline; `console.debug()` in `ParquetSource` loader
**Validation:** Dtype specifications (`TAXON_DTYPES`, `ECDYSIS_DTYPES`, etc.) enforce types at read time in pandas
**Authentication:** No authentication layer; all data sources are public APIs or direct downloads

---

*Architecture analysis: 2026-02-18*
