# BeeAtlas — AI Context

## Domain Vocabulary

Use these terms precisely — ambiguity here has caused confusion before.

**Specimen** — a physical bee, the real-world thing. May be represented by an iNat observation (photo posted by collector), an Ecdysis record, both, or neither for months after collection.

**Sample** — all bees collected off one floral host, by one person, on one day, at one place. Represented by an iNat observation (usually of the plant; occasionally a blank record when bees were collected off a non-plant substrate). Carries sample ID (sequential per person per day) and bee count as metadata fields.

**Floral host** — the plant a sample was collected from. Identified by the iNat observation that represents the sample.

**Observation** — a record on iNaturalist. Could represent a specimen (photo posted by collector), a floral host (plant ID), or a sample (collection record with sample ID + bee count metadata).

**Occurrence record** — any data record of a bee occurrence: either an iNat observation or an Ecdysis record.

**Collection event** — a scheduled group outing; implicitly yields many samples from multiple people. No data record exists for events yet.

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

- Lambda CDK artifacts exist in AWS but the active execution path is `data/nightly.sh` on maderas (nightly cron)
- The dbt 30-column contract on `marts/occurrences` is enforced at every `bash data/dbt/run.sh build`; there is no separate JS schema validator.
