# BeeAtlas — AI Context

## Domain Vocabulary

Use these terms precisely — ambiguity here has caused confusion before.

**Specimen** — a physical bee, the real-world thing. May be represented by an iNat observation (photo posted by collector), an Ecdysis record, both, or neither for months after collection.

**Sample** — all bees collected off one floral host, by one person, on one day, at one place. Represented by an iNat observation (usually of the plant; occasionally a blank record when bees were collected off a non-plant substrate). Carries sample ID (sequential per person per day) and bee count as metadata fields.

**Floral host** — the plant a sample was collected from. Identified by the iNat observation that represents the sample.

**Observation** — a record on iNaturalist. Could represent a specimen (photo posted by collector), a floral host (plant ID), or a sample (collection record with sample ID + bee count metadata).

**Occurrence record** — any data record of a bee occurrence: either an iNat observation or an Ecdysis record.

**Collection event** — a scheduled group outing; implicitly yields many samples from multiple people. No data record exists for events yet.

See [docs/domain-model.md](docs/domain-model.md) for the full occurrence data model: the five `int_combined` source categories, the corrected `is_provisional` definition, and the synthetic `occ_id` prefix vocabulary.

## Architecture Invariants

**State ownership:** `<bee-atlas>` owns all reactive state. `<bee-map>` and `<bee-sidebar>` are pure presenters — they receive state as properties and emit custom events upward. No shared module-level mutable state.

**Style cache:** mapbox-gl style functions must bypass the cache when `filterState` is active or `selectedOccIds` is non-empty. Cache only when nothing is selected or filtered.

**Filter race guard:** `bee-atlas` increments `_filterQueryGeneration` on each filter change. Async `queryVisibleIds` results must be discarded if the counter has advanced — prevents stale ID set overwrites.

**ID format:** Specimen IDs are `ecdysis:<integer>`. Sample IDs are `inat:<integer>`. Both prefixes are load-bearing for source disambiguation.

## Constraints

- Static hosting only — no server runtime at any layer
- Python 3.14+ (data/pyproject.toml)
- AWS via CDK in `infra/`; deploy via GitHub OIDC (no stored AWS credentials)

## Running Locally

```bash
# Dev server (Eleventy + Vite middleware, hot-reload)
npm run dev

# Tests (Vitest)
npm test

# Production build (tsc --noEmit -> eleventy + Vite)
npm run build

# Data pipeline
cd data && python run.py

# Data pipeline tests (pytest)
cd data && uv run pytest
```

## Known State

- Pipeline runs as `data/nightly.sh` on maderas (nightly cron) — the sole execution path. `data/nightly.sh` is the single repo entry point for the nightly pipeline: it owns NVM activation, `git pull`, `npm ci`, `uv sync`, S3 pull/push, CloudFront invalidation, and (via `run.py`) the data transforms. The crontab knows only host-specific bits (repo location, log path, schedule) — change deployment behavior in `nightly.sh`, not the crontab. `run.py` is the pure pipeline orchestrator (STEPS list, env-driven via `DB_PATH` + `EXPORT_DIR`) and knows nothing about S3 or git. Local dev runs `uv run python run.py` directly against `data/beeatlas.duckdb` and bypasses the wrapper. The dormant Lambda surface (DockerImageFunction + EventBridge schedulers + Function URL) was retired 2026-05-14 (quick task `260514-fcq`).
- The dbt contract on `marts/occurrences` (36 columns as of Phase 160) is enforced at every `bash data/dbt/run.sh build`; there is no separate JS schema validator. (Phase 131 dropped the 4 denormalized rank-string columns — `scientificName`, `genus`, `family`, `specimen_inat_taxon_name`; `canonical_name` is retained. Phase 160 dropped the scalar `place_slug`: place membership is now many-to-many via the separately-contracted `marts/occurrence_places` bridge — an occurrence belongs to every place it falls within. See the `project_place_model_many_to_many` memory.)
- The `/app` SW caches Mapbox basemap assets (StaleWhileRevalidate, 7-day TTL, `mapbox-basemap` cache, token retained, attribution intact) per §2.8.1 of the Mapbox Product Terms; web-SDK offline basemap serving is NOT licensed. Legal analysis in `docs/adr/0001-mapbox-basemap-cache.md`.
