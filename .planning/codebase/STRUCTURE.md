# Codebase Structure

**Analysis Date:** 2026-02-18

## Directory Layout

```
beeatlas/
├── data/                       # Python data pipeline sub-project
│   ├── scripts/                # Standalone download/processing scripts
│   │   ├── download.py         # Multi-source downloader → Parquet
│   │   └── fetch_inat_links.py # iNaturalist link fetcher
│   ├── ecdysis/                # Ecdysis (Symbiota) data module
│   │   ├── __init__.py
│   │   ├── download.py         # Ecdysis-specific download logic
│   │   └── occurrences.py      # DarwinCore TSV → GeoDataFrame → Parquet
│   ├── gbif-backbone/          # GBIF backbone taxonomy data (raw + processed)
│   ├── gbif-wa-bees/           # GBIF Washington bees occurrence data
│   │   └── dataset/            # Individual GBIF dataset files
│   ├── inat/                   # iNaturalist data module
│   │   ├── observation/        # Individual observation JSON files
│   │   ├── observations.py     # (stub)
│   │   └── projects.py         # iNaturalist project helpers
│   ├── osu_mm/                 # Oregon State University Museum module
│   │   ├── __init__.py
│   │   ├── labels-2025.tsv     # Raw OSU label data
│   │   └── labels_2025.py      # OSU label processing
│   ├── .venv/                  # Python virtual environment (uv-managed)
│   ├── .python-version         # Python version pin (for uv/pyenv)
│   ├── Makefile                # Declarative pipeline targets (wget + DuckDB)
│   ├── pyproject.toml          # Python project config and dependencies
│   ├── schema.sql              # DuckDB schema (ecdysis dumps + occurrences)
│   ├── uv.lock                 # Locked Python dependencies
│   ├── CLAUDE.md               # Data project notes for AI context
│   ├── ecdysis.parquet         # Processed Ecdysis output (gitignored)
│   └── eco3.parquet            # Ecoregion data (gitignored)
│
├── frontend/                   # TypeScript/Vite frontend sub-project
│   ├── src/                    # All application source
│   │   ├── assets/             # Static assets bundled by Vite
│   │   │   └── ecdysis.parquet # Parquet data file served to browser
│   │   ├── bee-map.ts          # <bee-map> Lit web component (main UI)
│   │   ├── parquet.ts          # ParquetSource (OpenLayers VectorSource)
│   │   ├── style.ts            # OpenLayers feature styles
│   │   └── index.css           # Global page styles
│   ├── index.html              # HTML entry point
│   ├── package.json            # Node dependencies and scripts
│   ├── tsconfig.json           # TypeScript config (strict, ES2023)
│   └── node_modules/           # (gitignored)
│
├── node_modules/               # Root workspace node_modules (gitignored)
├── package.json                # Root npm workspace config (workspaces: ["frontend"])
├── package-lock.json           # Root lockfile
├── .nvmrc                      # Node version pin
├── .editorconfig               # Editor formatting rules
├── .gitignore                  # Ignores data files, build artifacts, venvs
└── LICENSE
```

## Directory Purposes

**`data/`:**
- Purpose: Offline Python data pipeline; downloads raw data from external sources and produces Parquet files
- Contains: Python modules per data source, Makefile targets, SQL schema, processed Parquet outputs
- Key files: `data/scripts/download.py`, `data/ecdysis/occurrences.py`, `data/Makefile`, `data/schema.sql`

**`data/scripts/`:**
- Purpose: Executable scripts invoked directly or by Makefile
- Contains: `download.py` (multi-source downloader), `fetch_inat_links.py` (iNat link fetcher)

**`data/ecdysis/`:**
- Purpose: Module for Ecdysis (Symbiota) DarwinCore data
- Contains: Occurrence parser returning GeoDataFrame, Parquet writer

**`data/inat/`:**
- Purpose: Module for iNaturalist observation data
- Contains: Stub `observations.py`, `projects.py`, raw JSON observation files in `observation/`

**`data/osu_mm/`:**
- Purpose: Module for Oregon State University Museum specimen labels
- Contains: TSV label data, processing script

**`frontend/src/`:**
- Purpose: All TypeScript source for the browser application
- Contains: Lit web component, OpenLayers map setup, ParquetSource, feature styles, global CSS
- Key files: `frontend/src/bee-map.ts`, `frontend/src/parquet.ts`, `frontend/src/style.ts`

**`frontend/src/assets/`:**
- Purpose: Static files bundled and served by Vite; imported with `?url` suffix in TypeScript
- Contains: `ecdysis.parquet` — the bee occurrence data loaded at runtime

## Key File Locations

**Entry Points:**
- `frontend/index.html`: Browser entry; loads `<bee-map>` custom element
- `frontend/src/bee-map.ts`: Web component definition bootstrapped by `index.html`
- `data/scripts/download.py`: CLI data pipeline entry point

**Configuration:**
- `frontend/tsconfig.json`: TypeScript compiler options (strict ES2023 mode)
- `frontend/package.json`: Frontend npm dependencies and `dev`/`build`/`preview` scripts
- `data/pyproject.toml`: Python project dependencies managed by `uv`
- `data/Makefile`: Declarative data pipeline rules
- `.nvmrc`: Node version pin (root level)
- `data/.python-version`: Python version pin

**Core Logic:**
- `frontend/src/parquet.ts`: `ParquetSource` — reads Parquet in-browser via `hyparquet`
- `frontend/src/bee-map.ts`: `BeeMap` — initializes OpenLayers map with tile layers and specimen layer
- `frontend/src/style.ts`: `beeStyle`, `clusterStyle` — OpenLayers render styles
- `data/ecdysis/occurrences.py`: Ecdysis data loader and Parquet exporter
- `data/scripts/download.py`: Multi-source download orchestration with dtype configs

**Schema:**
- `data/schema.sql`: DuckDB schema for `ecdysis` namespace (dumps + occurrences tables)

**Testing:**
- Not present — no test files exist in either sub-project

## Naming Conventions

**Files:**
- TypeScript: `kebab-case.ts` (e.g., `bee-map.ts`, `parquet.ts`, `style.ts`)
- Python scripts: `snake_case.py` (e.g., `download.py`, `fetch_inat_links.py`, `occurrences.py`)
- Data files: `kebab-case.parquet` or `snake_case.parquet` (inconsistent: `ecdysis.parquet`, `eco3.parquet`)
- SQL: `snake_case.sql` (e.g., `schema.sql`)

**Directories:**
- Data source modules: match source name, either hyphenated (`gbif-wa-bees`, `gbif-backbone`) or underscored (`osu_mm`, `inat`)
- Frontend: conventional Vite layout (`src/`, `src/assets/`)

**TypeScript identifiers:**
- Classes/components: PascalCase (`BeeMap`, `ParquetSource`)
- Constants: camelCase (`beeStyle`, `clusterStyle`, `specimenSource`)
- CSS custom elements: kebab-case matching file name (`bee-map`)

**Python identifiers:**
- Constants/configs: UPPER_SNAKE_CASE (`TAXON_DTYPES`, `FILE_CONFIGS`, `RAW_DATA_DIR`)
- Functions: snake_case (`read_occurrences`, `apply_transformations`, `stream_and_convert_file`)
- Column prefixes: source-name prefix (`ecdysis_id`, `ecdysis_decimalLatitude`)

## Where to Add New Code

**New data source:**
- Create a new directory under `data/` matching the source name (e.g., `data/newsource/`)
- Add `__init__.py` and a processing module (e.g., `data/newsource/occurrences.py`)
- Add dtype specification dict in `data/scripts/download.py` following existing `TAXON_DTYPES` / `ECDYSIS_DTYPES` pattern
- Add entry to `FILE_CONFIGS` in `data/scripts/download.py`
- Add Makefile target in `data/Makefile` if wget-based

**New map layer:**
- Parquet asset: place in `frontend/src/assets/`
- Source class: add to `frontend/src/parquet.ts` or create a new file in `frontend/src/`
- Layer wiring: add VectorLayer in `BeeMap.firstUpdated()` in `frontend/src/bee-map.ts`
- Style: add to `frontend/src/style.ts`

**New UI component:**
- Create `frontend/src/component-name.ts` as a Lit `@customElement`
- Import and use in `frontend/src/bee-map.ts` or `frontend/index.html`

**Utilities:**
- Python shared helpers: `data/scripts/` or the relevant source module
- TypeScript shared helpers: `frontend/src/` (no `utils/` directory yet; create if needed)

## Special Directories

**`data/.venv/`:**
- Purpose: Python virtual environment created and managed by `uv`
- Generated: Yes
- Committed: No (gitignored)

**`frontend/node_modules/` and `node_modules/`:**
- Purpose: npm package installations (root workspace + frontend workspace)
- Generated: Yes
- Committed: No (gitignored)

**`data/gbif-backbone/`:**
- Purpose: Raw GBIF backbone taxonomy zip and processed Parquet output
- Generated: Partially (zip downloaded by Makefile, Parquet generated by SQL)
- Committed: Only `.keep` placeholder files (data files are gitignored/DVC-tracked)

**`data/inat/observation/`:**
- Purpose: Individual iNaturalist observation JSON files fetched by `fetch_inat_links.py`
- Generated: Yes (by scripts)
- Committed: No (gitignored)

**`.planning/`:**
- Purpose: AI-assisted planning documents (architecture, conventions, concerns)
- Generated: By GSD mapping tools
- Committed: Yes

---

*Structure analysis: 2026-02-18*
