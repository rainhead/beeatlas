# Codebase Structure

*Updated: 2026-04-07 (from intel refresh)*

## Directory Layout

```
beeatlas/
├── frontend/                       # TypeScript/Vite SPA
│   ├── src/
│   │   ├── bee-atlas.ts            # Root coordinator component
│   │   ├── bee-map.ts              # OpenLayers map component
│   │   ├── bee-sidebar.ts          # Sidebar shell + data interfaces
│   │   ├── bee-filter-controls.ts  # Filter UI sub-component
│   │   ├── bee-specimen-detail.ts  # Specimen cluster detail panel
│   │   ├── bee-sample-detail.ts    # iNat sample detail panel
│   │   ├── duckdb.ts               # DuckDB WASM singleton
│   │   ├── features.ts             # OL VectorSource subclasses
│   │   ├── filter.ts               # SQL filter builder + queryVisibleIds
│   │   ├── region-layer.ts         # County/ecoregion boundary layers
│   │   ├── style.ts                # OL style factory functions
│   │   ├── url-state.ts            # URL serialization/deserialization
│   │   └── index.css               # Global page styles
│   ├── public/data/                # Runtime data files (fetched from CloudFront)
│   │   ├── ecdysis.parquet         # Specimen data (gitignored — pipeline output)
│   │   ├── samples.parquet         # iNat sample events (gitignored)
│   │   ├── counties.geojson        # WA county boundaries (committed)
│   │   └── ecoregions.geojson      # EPA L3 ecoregion boundaries (committed)
│   ├── src/tests/                  # Vitest test files
│   ├── index.html                  # HTML entry point
│   ├── vite.config.ts              # Vite + Vitest config
│   ├── tsconfig.json               # TypeScript strict config
│   └── package.json                # Frontend npm deps + scripts
│
├── data/                           # Python data pipeline
│   ├── run.py                      # Pipeline orchestrator (entry point)
│   ├── export.py                   # Exports 4 frontend data files from DuckDB
│   ├── ecdysis_pipeline.py         # dlt: Ecdysis specimens + iNat links
│   ├── inaturalist_pipeline.py     # dlt: iNat WA Bee Atlas observations
│   ├── geographies_pipeline.py     # dlt: WA counties + EPA ecoregions
│   ├── projects_pipeline.py        # dlt: iNat project membership
│   ├── anti_entropy_pipeline.py    # Cross-table data quality reconciliation
│   ├── stub_handler.py             # AWS Lambda handler
│   ├── nightly.sh                  # Maderas cron execution script
│   ├── Dockerfile                  # Lambda container image
│   ├── pyproject.toml              # Python deps (uv)
│   ├── uv.lock                     # Locked Python deps
│   ├── tests/                      # pytest test files
│   └── .dlt/config.toml            # dlt pipeline config (project IDs, paths)
│
├── infra/                          # AWS CDK infrastructure
│   ├── lib/beeatlas-stack.ts       # Main stack (S3, CloudFront, Lambda, OIDC)
│   ├── lib/global-stack.ts         # us-east-1 stack (ACM certs, Route53)
│   └── bin/beeatlas.ts             # CDK app entry
│
├── scripts/
│   └── validate-schema.mjs         # Pre-build parquet schema gate (CI)
│
├── .github/workflows/deploy.yml    # CI/CD: build + deploy on push to main
├── package.json                    # Root npm workspace
├── .nvmrc                          # Node version pin
└── CLAUDE.md                       # AI context (invariants, constraints, run commands)
```

## Where to Add New Code

**New pipeline data source:**
- Add `<source>_pipeline.py` in `data/` following dlt resource pattern
- Add call to `data/run.py` orchestrator
- Update `data/export.py` if it produces frontend-visible data

**New map layer:**
- Add OL source/layer setup in `frontend/src/features.ts` or a new file
- Wire into `bee-atlas.ts` state and pass to `bee-map.ts` as a property

**New UI sub-component:**
- Create `frontend/src/bee-<name>.ts` as a Lit `@customElement`
- Import into `bee-sidebar.ts` or `bee-atlas.ts`
- Keep it a pure presenter — no shared state

**New infrastructure resource:**
- Add to `infra/lib/beeatlas-stack.ts` (or `global-stack.ts` for us-east-1 resources)
