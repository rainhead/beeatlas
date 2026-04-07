# BeeAtlas — AI Context

## Architecture Invariants

**State ownership:** `<bee-atlas>` owns all reactive state. `<bee-map>` and `<bee-sidebar>` are pure presenters — they receive state as properties and emit custom events upward. No shared module-level mutable state.

**Style cache:** OL style functions must bypass the cache when `filterState` is active or `selectedOccIds` is non-empty. Cache only when nothing is selected or filtered.

**Filter race guard:** `bee-atlas` increments `_filterQueryGeneration` on each filter change. Async `queryVisibleIds` results must be discarded if the counter has advanced — prevents stale ID set overwrites.

**ID format:** Specimen IDs are `ecdysis:<integer>`. Sample IDs are `inat:<integer>`. Both prefixes are load-bearing for source disambiguation.

## Constraints

- Static hosting only — no server runtime at any layer
- Python 3.14+ (data/pyproject.toml)
- AWS via CDK in `infra/`; deploy via GitHub OIDC (no stored AWS credentials)
- `speicmenLayer` typo in `bee-map.ts` is intentionally deferred — do not fix incidentally

## Running Locally

```bash
# Frontend dev server
cd frontend && npm run dev

# Frontend tests (Vitest)
cd frontend && npm test

# Data pipeline
cd data && python run.py

# Data pipeline tests (pytest)
cd data && uv run pytest
```

## Known State

- Lambda CDK artifacts exist in AWS but the active execution path is `data/nightly.sh` on maderas (nightly cron)
- `scripts/validate-schema.mjs` runs before every CI build as a parquet schema gate
