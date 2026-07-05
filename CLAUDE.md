# BeeAtlas — AI Context

## Product Memory

Durable knowledge lives in a few places — keep them current; it is the product's memory:

- **[PRODUCT.md](PRODUCT.md)** — what BeeAtlas is, for whom, the two-halves thesis, capabilities, scope.
- **[CONTEXT.md](CONTEXT.md)** — the domain glossary. Use its terms exactly (Specimen, Sample, `tier`/`record_type`, `occ_id`, Collector…). Update when a term is coined or sharpened.
- **[docs/domain-model.md](docs/domain-model.md)** — the deep occurrence data model (five arms, facets, identity rule).
- **[docs/adr/](docs/adr/)** — numbered decision records with rationale and rejected alternatives. **When a decision is made, add an ADR before moving on.** Mark superseded records; don't delete them.
- **[docs/lessons-learned.md](docs/lessons-learned.md)** — reusable engineering lessons. **[docs/concerns.md](docs/concerns.md)** — live tech debt & scaling ceiling.

Work tracking: **beads (`bd`), local-only** — issues live in the Dolt DB, not git. Use `bd` for all task tracking (not TodoWrite or markdown TODO lists). Decisions and their *why* go in `docs/adr/`; bd issues track work in flight and *reference* ADRs.

## Domain Vocabulary

Moved to **[CONTEXT.md](CONTEXT.md)**; the deep occurrence model (five `int_combined` arms, `tier`/`record_type` facets, `is_provisional`, `occ_id` vocabulary) is in **[docs/domain-model.md](docs/domain-model.md)**.

## Agent skills

Config the engineering skills (`to-issues`, `to-prd`, `grill-with-docs`, `improve-codebase-architecture`, …) read from:

- **Issue tracker** — beads (`bd`), local-only; no GitHub Issues workflow. See [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md).
- **Triage labels** — canonical roles mapped to bd labels. See [docs/agents/triage-labels.md](docs/agents/triage-labels.md).
- **Domain docs** — single-context: CONTEXT.md + PRODUCT.md + docs/domain-model.md + docs/adr/. See [docs/agents/domain-docs.md](docs/agents/domain-docs.md).

## Architecture Invariants

**State ownership:** `<bee-atlas>` owns all reactive state. `<bee-map>` and `<bee-sidebar>` are pure presenters — they receive state as properties and emit custom events upward. No shared module-level mutable state.

**Style cache:** mapbox-gl style functions must bypass the cache when `filterState` is active or `selectedOccIds` is non-empty. Cache only when nothing is selected or filtered.

**Filter race guard:** `bee-atlas` increments `_filterQueryGeneration` on each filter change. Async `queryVisibleIds` results must be discarded if the counter has advanced — prevents stale ID set overwrites.

**ID format:** Specimen IDs are `ecdysis:<integer>`. Sample IDs are `inat:<integer>`. Both prefixes are load-bearing for source disambiguation.

## Constraints

- Static hosting only — no server runtime at any layer, with ONE deliberate, isolated exception: the v8.0 authoritative write side. The store is SQLite on maderas (Phase 177 D-01) and the auth + write API is a small Flask/WSGI service on maderas served by Waitress (pure-Python WSGI server) behind Apache `mod_proxy_http` at `api.beeatlas.net` (Phase 178 D-17, code in `api/`). NOTE: `flup6`/`mod_fcgid` was the original 178 plan but was rejected 2026-07-03 — flup6 is unmaintained since 2015; do not reintroduce it. The read path (species pages) stays 100% static. See memories `project_store_tech_sqlite_on_maderas` and `project_write_layer_is_app_api`.
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
- `data/artifacts.toml` (+ tested `data/artifacts.py`) is the single declarative contract for every published manifest artifact — each carries a `derived`|`authoritative` provenance and the two schema-evolution regimes are machine-enforced (`authoritative` ⇒ never a dbt model, `baseline_diff=false`, forward-only migrations; rebuild/bypass forbidden). See `docs/adr/0002-derived-vs-authoritative-artifacts.md`.


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:7510c1e2 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
