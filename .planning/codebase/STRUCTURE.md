# Codebase Structure

**Analysis Date:** 2026-05-13

## Directory Layout

```
beeatlas/
├── _pages/              # Eleventy template entry points (.njk, .html)
├── _layouts/            # Eleventy layout templates (base.njk, default.njk)
├── _data/               # Eleventy build-time data (species.js, photos.js, build.js)
├── _includes/           # Eleventy shared partials (unused; .gitkeep)
├── _site/               # Build output (Eleventy + Vite) — gitignored
├── src/                 # TypeScript SPA source code, Lit components, styles
├── public/              # Static assets, data files (parquet, GeoJSON, SVG maps)
├── data/                # Python pipeline, dbt models, DuckDB database
├── infra/               # AWS CDK infrastructure code (unused in current deployment)
├── scripts/             # Build validators, data fetch scripts
├── lib/                 # Shared helper utilities
├── content/             # Markdown/content files (unused; legacy)
├── .planning/           # GSD phase planning documents
├── .claude/             # Claude project-specific instructions
├── package.json         # Node.js root dependencies, npm scripts
├── eleventy.config.js   # Eleventy 3.x build configuration
├── vite.config.ts       # Vite SPA bundler configuration
├── tsconfig.json        # TypeScript compiler options
├── .nvmrc               # Node.js version lock (nvm use)
└── README.md            # Project overview
```

## Directory Purposes

**`_pages/`:**
- Purpose: Eleventy entry points that are rendered as HTML templates
- Contains: `index.html` (SPA entry), `species.njk` (species browse page), `scaffold-check.njk` (debug)
- Key files: `index.html` (imports `src/bee-atlas.ts`), `species.njk` (imports `src/entries/species.ts`)

**`_layouts/`:**
- Purpose: Eleventy layout templates that wrap page content
- Contains: `base.njk` (root HTML structure), `default.njk` (wraps pages with base)
- Key files: `default.njk` (minimal wrapper for SPA pages)

**`_data/`:**
- Purpose: Eleventy JavaScript data modules that inject build-time values into templates
- Contains: `species.js` (taxon tree, species list, counts), `photos.js` (photo metadata), `build.js` (build config)
- Key files: `species.js` (provides `species.tree`, `species.flat`, `species.counties`, etc. to templates)

**`src/`:**
- Purpose: TypeScript SPA source code, Lit Web Components, utilities, styles
- Contains: Component definitions, filter engine, SQLite wrapper, URL state serializer
- Structure:
  - `*.ts` root level: Core components (`bee-atlas.ts`, `bee-map.ts`, `bee-sidebar.ts`, `bee-table.ts`, `bee-header.ts`, etc.)
  - `entries/`: Vite rollup entry points for multi-page bundling
  - `species/`: Species browse page components and state management
  - `styles/`: CSS for different page layouts
  - `tests/`: Vitest test files (co-located with src/)
  - `lib/`: Shared utilities (spa-link.ts)
  - `assets/`: Static images/icons used in components
  - `index.css`: Global styles

**`public/`:**
- Purpose: Static files copied to CDN root during build
- Contains: `data/` subdirectory with runtime-fetched files
- Key files:
  - `public/data/occurrences.parquet` — indexed occurrence records (fetched at runtime)
  - `public/data/species-maps/*.svg` — per-species SVG occurrence maps
  - `public/data/feeds/determinations.xml` — Atom feed of recent determinations
  - `public/data/geojson/counties.geojson`, `ecoregions.geojson` — region boundaries
  - `public/db/` — DuckDB WASM files (for future DuckDB frontend)

**`data/`:**
- Purpose: Python data pipeline that generates runtime data files
- Contains: ETL scripts, dbt models, DuckDB database, test fixtures
- Key components:
  - `dbt/models/` — Three-layer SQL models: staging (raw table extracts), intermediate (transformations), marts (export tables)
  - `dbt/dbt_project.yml` — dbt configuration with layer materialization rules
  - `*_pipeline.py` — ETL orchestrators (ecdysis, iNat, WABA, projects, checklist, etc.)
  - `run.py` — Master pipeline coordinator that executes all steps in sequence
  - `beeatlas.duckdb` — DuckDB database (local cache; regenerated on each run)
  - `tests/` — pytest fixtures and integration tests

**`infra/`:**
- Purpose: AWS CDK infrastructure code for Lambda-based pipeline execution (currently inactive)
- Contains: CDK stack definitions, TypeScript, deployment artifacts
- Status: Lambda artifacts exist in AWS but production execution path is `data/nightly.sh` (cron on maderas)

**`scripts/`:**
- Purpose: Build-time validation and data fetching utilities
- Key files:
  - `validate-schema.mjs` — Parquet column schema gate (runs before every build)
  - `validate-species.mjs` — Species export data validation
  - `validate-bundle-size.mjs` — Output bundle size checks
  - `fetch-data.sh` — Fetches latest data files from S3 (dev workflow)
  - `measure-lcp.sh` — Lighthouse performance measurement

**`lib/`:**
- Purpose: Shared JavaScript/TypeScript helper utilities
- Key files: `inat-srcset.js` (responsive image srcset builder for iNat photos)

**`.planning/`:**
- Purpose: GSD (Generative Software Development) phase planning documents
- Contains: Phase directories with CONTEXT.md, PATTERNS.md, PLAN.md, etc.

**`.claude/`:**
- Purpose: Project-specific Claude instructions and memory
- Contains: `CLAUDE.md` (domain vocabulary, architecture invariants), `skills/` (for future use), `projects/` (memory per conversation)

## Key File Locations

**Entry Points:**
- `_pages/index.html` — SPA entry point; imports `src/bee-atlas.ts`
- `_pages/species.njk` — Species page entry point; imports `src/entries/species.ts`
- `src/bee-atlas.ts` — Root SPA component (Lit element)
- `src/entries/bee-header.ts` — Vite entry for header (imported by layouts)

**Configuration:**
- `package.json` — npm dependencies and scripts
- `eleventy.config.js` — Eleventy template engine and Vite plugin setup
- `vite.config.ts` — Vite bundler options (env vars, wa-sqlite exclude, publicDir handling)
- `tsconfig.json` — TypeScript compiler options (strict mode, ES2023 target)
- `.nvmrc` — Node.js version (nvm use)

**Core Logic:**
- `src/bee-atlas.ts` — State coordinator, filter orchestration, URL persistence
- `src/bee-map.ts` — Mapbox GL JS rendering, occurrence dots, boundary layers
- `src/filter.ts` — Filter query engine, SQL builders, CSV export
- `src/features.ts` — GeoJSON construction, summary stats from SQLite
- `src/sqlite.ts` — wa-sqlite initialization, parquet loading, exec serialization
- `src/url-state.ts` — URL parameter serialization/deserialization

**Testing:**
- `src/tests/` — Vitest test files
- `src/tests/arch.test.ts` — Architecture boundary checks (validates component import boundaries)
- `data/tests/` — pytest integration tests for pipeline steps

**Styles:**
- `src/index.css` — Global styles
- `src/styles/species.css` — Species page layout styles
- Component scoped CSS via `static styles = css\`...\`` (Lit)

## Naming Conventions

**Files:**
- `bee-*.ts` — Lit Web Components (`bee-atlas.ts`, `bee-map.ts`, etc.)
- `*-test.ts` — Vitest test files
- `*-spec.ts` — Vitest specification tests (used in some areas)
- `*_pipeline.py` — Python ETL orchestrators
- `stg_*.sql` — dbt staging models (raw extracts)
- `int_*.sql` — dbt intermediate models (transformations)
- `*.svg` — SVG occurrence maps (per-species)

**Directories:**
- `src/species/` — Species page components
- `src/tests/` — Frontend tests
- `src/styles/` — Page-specific stylesheets
- `src/lib/` — Shared utilities
- `src/entries/` — Vite rollup entry points
- `data/dbt/models/{staging,intermediate,marts}/` — dbt layer directories
- `data/tests/` — Pipeline test fixtures
- `public/data/` — Runtime data (parquet, GeoJSON, SVG, feeds)

**Components:**
- Kebab-case for custom element names (`<bee-atlas>`, `<bee-species-card>`)
- camelCase for TypeScript functions, variables, properties
- UPPERCASE for constants (`OCCURRENCE_COLUMNS`, `PAGE_SIZE`)

**Branches/Phases:**
- `main` — Production branch
- `.planning/phases/NNN-slug/` — GSD phase planning (e.g., `.planning/phases/083-scaffold-slice-port/`)

## Where to Add New Code

**New Feature in SPA (map, filter, table):**
- Primary implementation: `src/bee-*.ts` (new component) or extend existing component
- Add to coordinator (`bee-atlas.ts`): Register `@state()` property, add event handler
- Tests: Create `src/tests/bee-newfeature.test.ts`
- Style: Add to `src/index.css` or component scoped CSS

**New Component/Module:**
- Implementation location depends on scope:
  - **SPA-wide shared**: `src/component-name.ts` or `src/lib/module.ts`
  - **Species page**: `src/species/bee-species-*.ts`
  - **Utilities**: `src/lib/` or `src/helpers/` (if creating subdirectory)
- Register as `@customElement('bee-component-name')` if Web Component
- Add to correct entry file (`src/entries/species.ts` for species, implicit for root SPA)
- Tests: `src/tests/bee-component-name.test.ts`

**New SQL Query or Filter Dimension:**
- Add filter shape to `src/filter.ts:FilterState` interface
- Implement SQL builder in `src/filter.ts:buildFilterSQL()`
- Add UI control to `src/bee-filter-panel.ts` or `src/bee-filter-controls.ts`
- Wire event handler in `src/bee-atlas.ts:_onFilterChanged`
- Tests: `src/tests/filter.test.ts`

**New Data Pipeline Step:**
- Create `data/*_pipeline.py` with extraction/transformation logic
- Add to `STEPS` list in `data/run.py`
- Output parquet or DuckDB table
- Add pre-existing data schema validation to `scripts/validate-schema.mjs` if needed
- Tests: `data/tests/test_*_pipeline.py`

**New dbt Model:**
- Create `.sql` file in `data/dbt/models/{staging,intermediate,marts}/`
- Follow naming: `stg_source__entity.sql`, `int_entity_transform.sql`, `occurrence.sql` for marts
- Add to `dbt_project.yml` materialization config if special (e.g., `int_combined` is table, not view)
- Tests: dbt `tests/` (YAML or SQL assertion tests)

**Utilities (Shared):**
- Function: `src/lib/utility-name.ts`
- Class/Type: `src/types.ts` or `src/constants.ts`
- Cross-module export: Consider barrel file `src/lib/index.ts`

## Special Directories

**`_site/`:**
- Purpose: Build output directory (Eleventy + Vite)
- Generated: Yes (cleared and rebuilt on each `npm run build`)
- Committed: No (gitignored)
- Contents: `_site/index.html`, `_site/assets/index-*.js` (hashed), `_site/src/`, `_site/public/`, `_site/species/`

**`.11ty-vite/`:**
- Purpose: Temporary Vite working directory (created during build)
- Generated: Yes (ephemeral, deleted after Vite finishes)
- Committed: No (git-excluded, not in working tree)

**`node_modules/`:**
- Purpose: npm dependencies
- Generated: Yes (`npm install`, locked by package-lock.json)
- Committed: No (gitignored)

**`.venv/` (in `data/`):**
- Purpose: Python virtual environment for data pipeline
- Generated: Yes (`uv sync`)
- Committed: No (gitignored)

**`beeatlas.duckdb` (in `data/`):**
- Purpose: Local DuckDB database cache (source of truth during pipeline runs)
- Generated: Yes (recreated each pipeline run)
- Committed: No (gitignored; output is parquet files in `public/data/`)

## Build Pipeline

1. **Validate**: `npm run validate-schema`, `npm run validate-species`, `npm run typecheck`
2. **Template render**: Eleventy processes `_pages/*.njk` and `_pages/*.html` with `_data/*.js` context
3. **Vite bundle**: Eleventy-plugin-Vite runs Vite in rename-and-build mode:
   - Discovers `<script type="module">` tags in Eleventy output
   - Creates temp `<.11ty-vite>/` with src/ and public/ passthrough copied
   - Runs Vite build to `<.11ty-vite>/.11ty-vite-output/`
   - Rewrites script tag URLs with hashed paths (e.g., `src/bee-atlas.ts` → `/assets/index-abc123.js`)
   - Copies static files from `public/` to `_site/` root
4. **Post-build validate**: `npm run validate-bundle-size`
5. **Output**: Everything in `_site/` ready for CloudFront upload

## Data File Locations

**Frontend Runtime (loaded by SPA):**
- `public/data/occurrences.parquet` — Main indexed table, fetched at app startup
- `public/data/geojson/{counties,ecoregions}.geojson` — Region boundaries
- `public/data/species-maps/*.svg` — Per-species occurrence maps
- `public/data/feeds/determinations.xml` — Atom feed

**Build-Time Data (injected by Eleventy):**
- Species list: `_data/species.js` → `{{ species.flat }}`, `{{ species.tree }}`
- Photos: `_data/photos.js` → `{{ photos[scientificName] }}`

**Source Data (generated by pipeline, inputs):**
- `data/*.parquet` — Intermediate extracts (ecdysis.parquet, samples.parquet, links.parquet, eco3.parquet)
- `data/beeatlas.duckdb` — Working DuckDB (regenerated each run)
- `data/checklists/` — Taxonomic reference files

---

*Structure analysis: 2026-05-13*
