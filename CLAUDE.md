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

**Style cache:** maplibre-gl style functions must bypass the cache when `filterState` is active or `selectedOccIds` is non-empty. Cache only when nothing is selected or filtered.

**Filter race guard:** `bee-atlas` increments `_filterQueryGeneration` on each filter change. Async `queryVisibleIds` results must be discarded if the counter has advanced — prevents stale ID set overwrites.

**ID format:** Specimen IDs are `ecdysis:<integer>`. Sample IDs are `inat:<integer>`. Both prefixes are load-bearing for source disambiguation.

## Constraints

- **Static hosting only**, with ONE deliberate exception: the auth + write side. The
  store is SQLite on maderas; the API is a small Flask/WSGI service served by Waitress
  behind Apache `mod_proxy_http` at `api.beeatlas.net` (code in `api/`). The read path
  stays 100% static. `flup6`/`mod_fcgid` was considered and rejected (unmaintained
  since 2015) — do not reintroduce it.
- Python 3.14+ (`data/pyproject.toml`).
- AWS via CDK in `infra/` is now only DNS, the beeatlas.com→.net redirect, and two
  backup buckets. Serving is maderas/Apache; code deploys are `git push maderas main`
  then `data/publish-code.sh` (or the nightly). **`api/` changes also need
  `systemctl --user restart beeatlas-api`** — publish-code.sh does not do it.

## Running Locally

**pnpm, not npm** ([ADR 0038](docs/adr/0038-pnpm-over-npm.md)). Three separate pnpm
projects — the root, `data/`, and `infra/` — each with its own lockfile and its own
`pnpm-workspace.yaml`; they are deliberately NOT a workspace. `npm install` here is a
mistake, not a slower path to the same place. A dependency that ships an install
script must be named in the relevant `pnpm-workspace.yaml` (`allowBuilds`) as true or
false, or `pnpm install --frozen-lockfile` fails in every workflow.

```bash
pnpm run dev      # Eleventy + Vite middleware. Serves no /sw.js, so offline needs a build.
pnpm test         # Vitest. NOTE: excludes *.data.test.ts — see below.
pnpm run test:data  # …which the deploy gate runs. Run it before pushing anything in src/.
cd data && uv run pytest

# Production build. Order is load-bearing (ADR 0016, Vite backend integration):
#   validate -> tsc -> vite build (app only, stashes the manifest OUTSIDE _site)
#   -> eleventy (reads it, emits the hashed tags) -> vite build -c vite.sw.config.ts
#   -> validate-bundle-size -> postbuild
# No HTML passes through Vite. A template referencing a new module means adding it to
# build.rollupOptions.input in vite.config.ts, or the build fails naming the entry.
pnpm run build

# Note-publish render (ADR 0017): writes ADDITIVELY over the last full build's _site,
# so it is only sound when `scripts/build-receipt.mjs --check` passes —
# data/publish-notes.sh owns that gate. Never add build:app here (emptyOutDir).
BEEATLAS_RENDER_KEYS='agapostemon virescens' pnpm run build:content

# Data pipeline (Stelis — github.com/rainhead/stelis)
( cd ~/dev/stelis && BEEATLAS_DIR=~/dev/beeatlas \
    racket src/main.rkt --build --all --export-dir /tmp/beeatlas-export )
```

## Known State

Each entry is the part you could break without noticing. The reasoning is in the
linked ADR — read it before changing anything an entry calls load-bearing.

- **Pipeline.** `data/nightly.sh` on maderas (cron) is the single repo entry point and
  owns everything from `git pull` to the merge-swap publish; the crontab knows only
  where the repo is. Change deployment behaviour there, not in the crontab.
  **Stelis** is the data engine (ADR 0007 Amendment) — a content-addressed graph over
  `data/`, env-driven by `DB_PATH`/`EXPORT_DIR`/`NOTES_DB_PATH`, invoked via
  `pnpm run fetch-data`. It knows nothing about S3, git, or the site render. It replaced
  `run.py`, recoverable from git history if ever needed.
- **dbt contract** on `marts/occurrences` is enforced at every `data/dbt/run.sh build`;
  there is no separate JS validator. **Count the columns from
  `data/dbt/models/marts/schema.yml` — it is the only authority.** A number written
  here drifts (the previous one silently did). `elevation_dem_m` is DEM-*derived* and
  deliberately never COALESCEd into the *recorded* `elevation_m` (ADR 0015). Place
  membership is many-to-many via the `marts/occurrence_places` bridge, not a scalar.
- **A place has a `kind`** ([ADR 0035](docs/adr/0035-level-iv-ecoregions-are-places.md)).
  `geographies.places` has TWO sources, both loaded by `places_load`: the hand-authored
  sites in `content/places.toml`, and one place per EPA Level IV ecoregion out of
  `geographies.ecoregions_l4`. Everything downstream — the bridge, `/places/` pages,
  place-maps, the `place=` filter, search — treats them identically; only `land_owner`
  (null for ecoregions) and the INDEX differ. The two kinds index on separate pages —
  sites at `/places.html`, ecoregions at `/ecoregions.html`, an `inline-nav` switching
  between them — while BOTH kinds' detail pages stay under `/places/<slug>.html`, which
  is why `bee-header`'s Places icon lights on either prefix. **Level III ecoregions
  are NOT places** and stay a scalar `occurrences.ecoregion_l3` column with its own
  multi-select filter, so "filter by ecoregion" means two different things — read
  CONTEXT.md before touching either. Because the Level IV places tile the whole state,
  nearly every occurrence now has a bridge row; that is what made the bridge's
  `not_null(occ_id)` fire on the one identity-less checklist record it now filters out.
- **Basemap: self-hosted MapLibre** ([ADR 0026](docs/adr/0026-self-hosted-basemap.md),
  supersedes 0001). No map API key anywhere; mapbox-gl is gone from the tree. The
  PMTiles archives live at `$BASE_DIR/basemap` on maderas, served by an Apache `Alias`
  at `/basemap/tiles` **so no publish path can reach or prune them**; built by
  `data/build-basemap.sh` + `publish-basemap.sh`. Glyphs and sprites ship WITH the code
  from `public/basemap`. `<bee-map>` reads `/basemap/tiles/manifest.json` for the
  date-stamped archive name and falls back to a blank style on any failure, so the
  occurrence layers still render. Local dev proxies `/basemap/tiles` to beeatlas.net.
  - **Offline** ([ADR 0025](docs/adr/0025-offline-basemap-is-a-byte-store.md)). Archives
    are primed into Cache Storage as blobs and read with `Blob.slice` — the SW never
    serves tiles, because Cache Storage has no range semantics. The ~288 MB download is
    OPT-IN and INSTALLED-ONLY (an installed iOS PWA has its own storage bucket, so a
    tab's bytes are invisible to it). `localStorage['beeatlas-basemap-offline']='off'`
    reverts to online-only. Manifests are CACHE-FIRST with deferred revalidation, never
    `navigator.onLine`-guarded — on a real iPhone onLine still read true at 110 ms.
    **Debugging this area:** on-device, account menu → **Diagnostics**
    (`src/diagnostics.ts`) — an installed PWA has no console. Automated cold start:
    `node scripts/offline-uat.mjs` (defaults to the LIVE site; see
    `docs/runbooks/map-interaction-uat.md` §G to run it against a local build).
  - **MapLibre's worker: do not bundle it, and do not move it.** It locates itself from
    its own `import.meta.url`, so bundling 404s it — silently: tiles hang in `loading`,
    `load` never fires, blank map, clean console. And it must stay INSIDE the SW scope,
    because a dedicated worker is its own SW client matched on its OWN url; outside it,
    precaching is a no-op that looks correct in every test. `basemap-precache.test.ts`
    derives that containment from `SW_SCOPE` rather than a spelled path.
  - **Hillshade.** `DEFAULT_MAXZOOM` (11) in `terrain_tiles.py` and `TERRAIN_FADE_END`
    (15.0) in `basemap-style.ts` are paired and must move together — the fade is what
    makes a cheap z11 DEM sufficient. The layer sits under the `water` fill, NOT under
    the first symbol layer: the Protomaps theme interleaves fills and lines, so "under
    the labels" washes every trail and stream with terrain shading.
- **The app is at `/`; offline stops at the map**
  ([ADR 0029](docs/adr/0029-one-origin-two-surfaces.md)). `_pages/index.html` is the app
  and the only template that mounts `src/app-entry.ts`. SW is `/sw.js` at scope `/`, and
  its shell answers `/` **and nothing else**. **Only the app registers**, and that is
  load-bearing: `sw-registration.ts` and `prime-orchestrator.ts` are imported by
  `app-entry.ts` alone, keeping a 3.3 MB precache and ~34.8 MB prime off a species page
  that loads 18 KB. Species/place/collector pages are **deliberately never cached** —
  every caching strategy breaks `bee-notes.ts`'s write-then-reload. The PWA shell is at
  **`/pwa/`, never `/icons/`**: Ubuntu's Apache aliases that path, and a 404 on a
  *precached* URL fails SW install, which discards the registration — no service worker
  at all, silently. `basemap-precache.test.ts` pins the reserved prefix.
- **Identity survives going offline**
  ([ADR 0027](docs/adr/0027-identity-survives-going-offline.md)). `AuthState.verified`
  is REQUIRED: only the server saying `authenticated:false` is a real signed-out; a 5xx
  or dead network replays the last known identity as `{true,false}`. That cached
  identity is for DISPLAY and LOCAL FILTERING only — **write affordances require
  `verified`**. Both controllers seed synchronously from `loadLastKnownIdentity()` at
  mount; that seed, not the deferred whoami, is what puts an identity on an offline cold
  start. Sign-out erases locally first and persists a pending flag, so an offline
  sign-out is not undone on reconnect. The avatar is inlined by `api/avatar.py` as a
  `data:` URL — it had to be the server, because static.inaturalist.org sends no CORS.
- **`data/artifacts.toml`** (+ tested `data/artifacts.py`) is the declarative contract
  for pipeline artifacts: each carries `derived`|`authoritative` provenance, and the two
  schema-evolution regimes are machine-enforced (ADR 0002). The *published* runtime
  manifest is owned by the site build instead (`lib/runtime-artifacts.js` +
  `scripts/postbuild-data.mjs`); artifacts.toml's operational surface is the
  integration-gate baseline and the `pull-published` dev pull.


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

## Session Completion — BeeAtlas addendum

The managed block above covers `git push`. It is **not sufficient here**: `.beads/` is gitignored, so issue state lives only in the local Dolt DB until you push the Dolt ref explicitly.

**Also run, every session that touched issues:**

```bash
bd dolt push        # syncs the Dolt DB to refs/dolt/data on origin
```

Why this is easy to miss: `git status` can read "up to date with origin" while every `bd create`/`bd close` from the session is still local-only — the gitignore means git has no visibility into it at all. The ref sat six days stale on 2026-07-18 for exactly this reason.

Two known-benign warnings, so nobody spends time chasing them:

- **`auto-export: git add failed: ... .beads is ignored`** on every mutating `bd` command — cosmetic. bd tries to stage the passive `issues.jsonl` export; the gitignore is correct and the Dolt ref is the real data path. Do not `git add -f` it.
- **`bd dolt show` reporting `Remotes: (none)`** — misleading. The remote comes from `sync.remote` in `.beads/config.yaml`, which `bd dolt push` reads correctly.
