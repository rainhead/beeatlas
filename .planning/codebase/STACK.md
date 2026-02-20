# Technology Stack

**Analysis Date:** 2026-02-18

## Languages

**Primary:**
- TypeScript 5.8.x - Frontend web application (`frontend/src/`)
- Python 3.14+ - Data pipeline and processing (`data/scripts/`, `data/osu_mm/`)
- SQL - DuckDB data assembly scripts (`data/Makefile`, `data/schema.sql`)

**Secondary:**
- CSS - Frontend styling (`frontend/src/index.css`)
- HTML - Application entry point (`frontend/index.html`)

## Runtime

**Frontend Environment:**
- Browser (ES modules, modern web APIs)
- Node.js for dev server (via vite-express)

**Data Pipeline Environment:**
- Python 3.14+ (specified in `data/pyproject.toml` and `data/uv.lock`)
- DuckDB CLI - used directly via Makefile for data assembly

**Package Managers:**
- npm (root `package.json` and `frontend/package.json`)
- uv (Python, `data/uv.lock` lockfile present)
- npm lockfile: `package-lock.json` present at root

## Frameworks

**Frontend:**
- Lit 3.2.x - Web components framework (`frontend/src/bee-map.ts` uses `LitElement`)
- OpenLayers (ol) 10.7.x - Interactive map rendering (`frontend/src/bee-map.ts`)
- ol-mapbox-style 13.2.x - MapBox style support for OpenLayers
- Vite 6.2.x - Build tool and dev server (`frontend/package.json`)
- vite-express 0.20.x - Express + Vite integration for dev

**Data Pipeline:**
- pandas 3.0.x - DataFrame processing (`data/scripts/download.py`)
- geopandas 1.1.x - Geospatial data handling
- DuckDB 1.4.x - In-process analytical SQL engine
- PyArrow 22.0.x - Parquet file I/O
- Pydantic 2.12.x - Data validation
- SQLAlchemy 2.0.x - SQL ORM (present but use not confirmed in explored scripts)

**Testing:**
- Not detected - no test framework configured

**Build/Dev:**
- TypeScript 5.8.x - Type checking (`frontend/package.json` devDependencies)
- nodemon 3.1.x - Dev server auto-reload
- Express 4.21.x - Web server (dev only)
- make (GNU Make) - Data pipeline orchestration (`data/Makefile`)
- hatchling - Python package build backend (`data/pyproject.toml`)

## Key Dependencies

**Critical (Frontend):**
- `hyparquet` 1.23.x - Client-side Parquet file reading in the browser (`frontend/src/parquet.ts`); enables loading specimen data without a server
- `ol` 10.7.x - Core map rendering engine; the entire map UI depends on this
- `lit` 3.2.x - Web component base; `BeeMap` custom element built on `LitElement`
- `temporal-polyfill` 0.2.x - TC39 Temporal API polyfill for date/time handling

**Critical (Data Pipeline):**
- `duckdb` 1.4.x - Primary analytical query engine used in Makefile and `schema.sql`
- `pandas` 3.0.x - Core data processing in `data/scripts/download.py`
- `pyarrow` 22.0.x - Parquet output format for processed data
- `pyinaturalist` 0.20.x - iNaturalist API client (`data/pyproject.toml`)
- `pyinaturalist-convert` 0.7.x - Conversion utilities for iNaturalist data
- `pydwca` 0.5.x - Darwin Core Archive reader (for Ecdysis data)
- `pyogrio` 0.12.x - Fast geospatial file I/O (reads shapefiles for ecoregions)

## Configuration

**Environment:**
- No `.env` files detected; configuration is embedded in scripts
- External data URLs are hardcoded in `data/scripts/download.py` and `data/Makefile`

**Build (Frontend):**
- `frontend/tsconfig.json` - TypeScript compiler configuration
- Vite configuration not detected as a separate file (likely default config)

**Data Pipeline:**
- `data/pyproject.toml` - Python project definition, dependency list
- `data/uv.lock` - Locked dependency versions for reproducibility
- `data/Makefile` - Data download and transformation pipeline rules

## Platform Requirements

**Development:**
- Node.js (version not pinned; no `.nvmrc` detected)
- Python 3.14+
- DuckDB CLI (used directly in `data/Makefile`)
- uv (Python package/venv manager)
- wget (used in `data/Makefile` for downloads)

**Production:**
- Static file hosting (frontend builds to static assets)
- No server-side runtime required for frontend (data served as static Parquet files)
- No database server required at runtime; DuckDB used only during data pipeline

---

*Stack analysis: 2026-02-18*
