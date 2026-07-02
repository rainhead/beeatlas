# Architecture Research: v8.0 Authoritative Data Foundation

**Domain:** Adding a first authoritative, non-reproducible data store to a fully-derived static-site data pipeline
**Researched:** 2026-07-02
**Confidence:** HIGH (grounded in the actual `nightly.sh`, `run.py`, `deploy.yml`, `dbt/run.sh`, `beeatlas-stack.ts`, `manifest.ts`, and the Eleventy `_data/*.js` + `_pages/*.njk` build seam)

---

## The Load-Bearing Invariant This Milestone Breaks

Every byte the site serves today is **derived** and **reproducible**: re-running `data/run.py`
against fresh iNat/Ecdysis pulls regenerates it. The DuckDB (`beeatlas.duckdb`) is a *cache*, not a
system of record — which is exactly why three things are safe:

1. `aws s3 sync --delete` in `deploy.yml` (nothing unrecoverable lives only in S3),
2. content-hashed immutable filenames (a stale hash is never data loss),
3. the **schema-change dance** — a one-time `SKIP_INTEGRATION_GATE=1 bash data/nightly.sh` to break
   the two-gate deadlock (`test_dbt_diff` vs `validate-db`) after a `marts/occurrences` contract bump.

Authoritative user content (species natural-history notes with **no iNat/Ecdysis upstream**) violates
this: losing it is unrecoverable, and it cannot be diffed against a rebuildable baseline. The whole
milestone is making **"is this artifact reproducible?"** an *explicit declared property* so the two
data classes coexist without the authoritative class ever touching the reproducibility machinery.

---

## Standard Architecture (target state)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ READ PATH  (static, cached, offline-capable — UNCHANGED CONTRACT)          │
│  CloudFront ── /data/*  (hashed, immutable)   ── /  (Eleventy static HTML)  │
│      ▲                        ▲                          ▲                  │
│      │ manifest.json          │ occurrences.db/parquet   │ species pages    │
│      │                        │ notes.json (NEW)         │ bake notes at    │
│      │                        │                          │ build (NEW)      │
└──────┼────────────────────────┼──────────────────────────┼─────────────────┘
       │                        │                          │
┌──────┴────────────────────────┴──────────────────────────┴─────────────────┐
│ BUILD / PUBLISH SEAM   (ONE declarative artifact contract — Phase 1)        │
│                                                                             │
│   data/artifacts.toml  ──►  data/artifacts.py  ──►  { nightly.sh publish,   │
│   (single source of truth)   (tested loader)         nightly.sh baseline,   │
│                                                       deploy.yml fetch }     │
└──────────────┬──────────────────────────────────────────┬──────────────────┘
               │ DERIVED (reproducible, diff-gated)        │ AUTHORITATIVE
               │                                           │ (content from store)
┌──────────────┴───────────────────────┐   ┌───────────────┴────────────────────┐
│ DERIVED PIPELINE (run.py, dbt)        │   │ AUTHORITATIVE SUBSYSTEM (NEW)       │
│  iNat/Ecdysis → DuckDB cache → dbt    │   │                                     │
│  marts/* → exports → S3               │   │  Thin write layer (iNat OAuth) ──┐  │
│  test_dbt_diff regression gate        │   │        writes ▼                  │  │
│  bypass+rebuild is SAFE               │   │  Authoritative store  ◄── forward-│  │
│                                       │   │  (notes + revisions + roles)  only│  │
│  notes-harvest step (NEW) ────────────┼───┼──► reads approved rows      migra-│  │
│  reads store, emits notes.json        │   │                             tions │  │
│  (authoritative-content, NOT diffed)  │   │  Versioned backup + restore drill  │  │
└───────────────────────────────────────┘   └────────────────────────────────────┘
```

Two subsystems, one publish seam. The derived pipeline may **read** the authoritative store (the
harvest) but never writes or migrates it; the write layer owns the authoritative store exclusively.

---

## 1. The Derived-vs-Authoritative Split (concrete)

### The classification rule

> **Provenance follows the data's ultimate source, not the mechanism that produced the file.**
> If any byte of an artifact traces to a user write, it is `authoritative` — excluded from the
> reproducibility diff, and its upstream store is backup-critical. Otherwise it is `derived`.

This is the crucial subtlety: `notes.json` is *mechanically* a projection (a nightly Python step
emits it), but its content originates from user writes, so it is classified `authoritative`. The
**store** is what gets backed up; `notes.json` itself is disposable (re-harvestable from the store).

### How the split materializes across the three surfaces

**dbt models** — *unchanged*. dbt stays a pure transform engine over reproducible sources; **no
authoritative table is ever a dbt materialization.** The `marts/occurrences` 36-col contract, the
sandbox build, and `test_dbt_diff` keep operating only on derived data. The authoritative store is
read by a dedicated `notes-harvest` step (new in `run.py`, after `dbt-build` so the species universe
exists), NOT by dbt. Optionally the store can be registered as a read-only dbt *source* if notes ever
need a mart-level join, but the default and safer design is a standalone Python export that reads the
store + the already-built `species`/taxa tables. Either way, **dbt never materializes it, so the
sandbox-vs-live parquet diff physically cannot include it.**

**Export / artifact contract** — gains a `provenance` field per artifact (§2). All 14 current
artifacts are `provenance = "derived"`. The new `notes` artifact is `provenance = "authoritative"`,
which *forces* `baseline_diff = false`.

**Migration / gate machinery** — the integration baseline pull (`nightly.sh` block 1c) and
`test_dbt_diff` iterate **only** artifacts where `baseline_diff = true` (all derived). `notes.json`
(`baseline_diff = false`) is never pulled as a baseline and never diffed. **Double isolation**: it
isn't a dbt model (so `dbt build` can't produce a diffable sandbox copy) *and* it's contract-flagged
out of the baseline set. The schema-change dance (`SKIP_INTEGRATION_GATE`) therefore stays a purely
derived concern — a derived contract bump and an authoritative migration can never interact.

### Why the gate can't cross-contaminate — the two schema-evolution mechanisms

| | Derived table (e.g. `marts/occurrences`) | Authoritative table (`notes`) |
|---|---|---|
| Schema change via | edit dbt model → **bypass + rebuild** | **forward-only migration** (in-place ALTER/backfill) |
| Old data on change | discarded, re-derived from source | preserved (there is no source to re-derive from) |
| Regression gate | `test_dbt_diff` (sandbox vs live) | **none** — excluded by `baseline_diff = false` |
| Recovery if lost | re-run pipeline | restore from backup (unrecoverable otherwise) |
| Lives in | DuckDB cache → parquet/sqlite exports | separate system-of-record store |

The `SKIP_INTEGRATION_GATE` escape hatch is **forbidden** for authoritative tables — there is no
source to rebuild from, so "bypass and rebuild" is meaningless. Authoritative schema evolves only
forward (§4).

---

## 2. One Declarative Artifact Contract (replaces the triple hand-sync)

Today the artifact set is hand-synced across **three** places:
- `nightly.sh` lines 306–346 — hardcoded `_upload_hashed*` calls + the `manifest.json` heredoc,
- `nightly.sh` lines 153–171 — the inline ~40-line Python heredoc classifier
  (`LOCAL_NAMES` / `NON_FILE_KEYS` / `INTENTIONALLY_SKIPPED`),
- `deploy.yml` lines 45–67 — the hand-coded `jq` build-time fetch of 6 files.

Adding one artifact means editing all three, correctly, or silently freezing a file (the
`higher_taxa.json`/`photos.json` bug the code comments already memorialize).

### Format & location

**`data/artifacts.toml`** — TOML, matching project convention (`content/places.toml`,
`content/species-photos.toml`) and Python-native via `tomllib` (3.14). Loaded by a small tested
module **`data/artifacts.py`** that all three consumers call. TOML over JSON (comments — this file
is heavily rationale-laden) and over a `.py` module (data, not code; safely parseable by CI without
importing pipeline deps).

### Schema (one block per artifact)

```toml
# data/artifacts.toml
schema_version = 1

[artifact.occurrences]
local_filename = "occurrences.parquet"
provenance     = "derived"        # derived | authoritative
kind           = "hashed"         # hashed | stable_dir | metadata
baseline_diff  = true             # participate in test_dbt_diff regression baseline
build_time_fetch = false          # deploy.yml pulls into working tree before `npm run build`
gzip           = false            # pre-gzip + Content-Encoding: gzip (was _upload_hashed_gz)
content_type   = ""               # override; "" = infer (geojson → application/json)

[artifact.occurrences_db]
local_filename = "occurrences.db"
provenance     = "derived"
kind           = "hashed"
baseline_diff  = false            # was INTENTIONALLY_SKIPPED (23 MB — too big to baseline daily)
gzip           = true
build_time_fetch = false

[artifact.higher_taxa]
local_filename = "higher_taxa.json"
provenance     = "derived"
kind           = "hashed"
baseline_diff  = true
build_time_fetch = true           # _data/species.js reads it at build

[artifact.counties]
local_filename = "counties.geojson"
provenance     = "derived"
kind           = "hashed"
baseline_diff  = true
content_type   = "application/json"   # so CloudFront auto-compresses (geo+json not on allowlist)

[artifact.feeds]
kind           = "stable_dir"     # recursive, non-hashed (feeds/, species-maps/, place-maps/)
provenance     = "derived"
source_subdir  = "feeds"

# ── metadata keys: computed into manifest.json, never files ──
[artifact.occurrences_db_tables]
kind = "metadata"                 # was NON_FILE_KEYS
[artifact.generated_at]
kind = "metadata"

# ── NEW authoritative-content artifact ──
[artifact.notes]
local_filename = "notes.json"
provenance     = "authoritative"  # ⇒ baseline_diff forced false by artifacts.py
kind           = "hashed"
build_time_fetch = true           # _data/notes.js bakes it into species pages
```

### `data/artifacts.py` API (each consumer calls one function)

| Consumer | Call | Replaces |
|---|---|---|
| `nightly.sh` publish block | `iter_publishable()` → `(key, local_filename, gzip, content_type)` plans; bash keeps `_upload_hashed*`, then a tiny Python assembles `manifest.json` from `(key → hashed_name)` results | lines 306–349 |
| `nightly.sh` baseline pull | `python -m data.artifacts pull-baseline --manifest $_PREV_MANIFEST --dest public/data` (iterates `baseline_diff=true`, warns on unmapped manifest keys) | the ~40-line heredoc (lines 136–206) |
| `deploy.yml` fetch | `python -m data.artifacts fetch-build-time --manifest /tmp/manifest.json --dest public/data` (iterates `build_time_fetch=true`) | the `jq` block (lines 45–67) |

**Invariant preserved:** `nightly.sh` retains S3/CloudFront ownership (per CLAUDE.md, `run.py`/Python
knows nothing about S3) — `artifacts.py` emits *plans and classifications*; bash performs the S3 I/O.
The drift guard survives verbatim, but now **tested** (a `pytest` over `artifacts.py`: every manifest
key resolves to exactly one artifact; `authoritative ⇒ not baseline_diff`; `metadata ⇒ no filename`).
Enforce a round-trip test: `manifest.json`'s emitted keys == `artifacts.toml`'s non-metadata keys.

---

## 3. Write-Path Integration — Recommendation: hybrid (harvest-primary + progressive live island)

The read path is static, CloudFront-immutable-cached, and offline-capable (PWA). Species pages are
Eleventy static HTML built at **deploy time** from `_data/*.js` loaders reading build-time JSON — v7.0
traits shipped as "build-time Nunjucks, zero JS." So there are three ways to get authoritative notes
onto a species page:

| Option | Freshness | Offline/PWA | Moderation visibility | Read-path-static goal |
|---|---|---|---|---|
| (a) live client fetch from write store | instant | **breaks** (needs network + store up) | client must filter — leak risk | **violated** (runtime dep + secrets surface) |
| (b) nightly harvest → `notes.json` → build-time bake | ≤24h (nightly + deploy) | works (baked into static HTML, cached) | **enforced at harvest** (`status='approved'` filter) | preserved |
| (c) **hybrid: (b) baseline + (a) progressive island** | ≤24h floor, instant when online for the author | works (falls back to baked) | enforced at harvest; moderators preview via authed island | preserved (island is optional enhancement) |

**Recommendation: (c) hybrid, (b)-dominant.**

- **Default display = baked `notes.json`** (option b): the harvest emits **only `status='approved'`**
  rows, joined to `canonical_name`/`taxon_id` from the derived species universe. Published via the
  Phase-1 contract as an `authoritative`, `build_time_fetch=true` artifact; a new `_data/notes.js`
  loader bakes it into `_pages/species-detail.njk` — an exact structural mirror of `_data/species_hosts.js`
  (Phase 175). This keeps the read path static, cacheable, offline-safe, and keeps unmoderated notes
  physically out of the public bytes.
- **Progressive `src/notes-live.ts` island** (option a) *only on species pages*: when online, fetch
  the note(s) for **that one species** from the write layer's read API and overlay the baked version.
  This closes the ≤24h freshness gap for the author who just wrote a note, and gives moderators an
  authenticated pending-note preview — as pure progressive enhancement. Offline / no-JS still shows
  the baked note. Never the sole display path.
- **Harvest trigger:** run as a `run.py` step (nightly cadence, zero new triggers) for v8.0. A
  write-triggered `repository_dispatch` targeted harvest+deploy is a *later* optimization, not v8.0.

Rationale: natural-history prose is reference content, not a liveness feed — a ≤24h floor is fine, and
the island removes the only sharp edge (author immediacy). Moderation stays server-enforced, never
trusted to the browser.

---

## 4. Forward-Only Migrations for the Authoritative Store

The store cannot be rebuilt, so its schema evolves by **versioned, forward-only, idempotent,
in-place** migrations — the inverse of the derived rebuild model.

- **Layout:** `data/notes_store/migrations/NNNN_description.sql` (monotonic). A `schema_migrations`
  table records applied versions; a tiny runner applies only unapplied files, in order, once.
- **Runner location:** the **write layer** (on deploy/boot), *not* `run.py`. The write layer owns the
  authoritative schema; `run.py` only ever *reads* the store (harvest) and must never migrate/write it.
  This keeps ownership clean and prevents the derived pipeline from mutating the system of record.
- **Discipline:** additive/transform-in-place only. Destructive changes use data-preserving migrations
  (add column → backfill → cut over → drop in a *later* migration), never DROP+recreate. There is no
  `SKIP_INTEGRATION_GATE`-style bypass — the gate doesn't apply, and there's no source to rebuild from.
- **Contrast with derived:** derived "migration" = edit dbt model + bypass-and-rebuild (whole table
  recomputed, old shape discarded). Authoritative migration = ALTER + backfill in place (data is the
  source of truth). Keep these two mechanisms *physically separate* so neither's tooling can touch the
  other's tables.

---

## 5. Backup / DR for Non-Reproducible Data

Backup is a **safety requirement**, not a nicety — and must be **distinct** from the DuckDB cache's
overwrite-in-place `s3 cp` (that EXIT-trap backup has no history; reusing it for authoritative data
would silently overwrite the only copy).

- **Application-level safety first:** the store is **append-only / soft-delete** — edits create new
  rows in a `note_revisions` table; deletes flip a `status`/`deleted_at` flag. This gives user-error
  recovery and a moderation audit trail *independent of infrastructure backups*.
- **Infra backup (choose per store):**
  - *SQLite/DuckDB file in S3:* enable **S3 versioning** on the store prefix (every write = a new
    version) + a lifecycle rule retaining N versions/days, **plus** a scheduled copy to a separate
    backup prefix/bucket (ideally different account/region for DR) with its own retention.
  - *Managed Postgres (Neon/Supabase/RDS):* native PITR + scheduled `pg_dump` to S3.
- **Restore drills:** DR is real only if restore is exercised — a documented, periodically-run restore
  procedure is part of the milestone, not a follow-up.
- **CLAUDE.md caution:** `BeeAtlasStack` houses the whole site; **never `cdk destroy`**. Add the store
  bucket/prefix + versioning + backup automation by *surgical* stack edit only.

---

## 6. Auth Integration (iNat OAuth)

- **Mechanism:** iNat OAuth — collectors already have iNat logins (the "self-identification"
  framing from `work-vs-learning-two-halves.md` now becomes real auth for *writes*). Authorization
  Code + **PKCE** (no confidential secret on the static read path).
- **Where verified:** the **thin write layer is the sole identity/authorization authority.** Flow:
  browser → iNat OAuth → write layer exchanges the code, verifies the iNat token, mints a short-lived
  session (signed cookie/JWT). The static read path never authenticates and holds no secrets. iNat
  tokens live only in the write layer's server-side session.
- **Identity → authorization → roles:** the iNat user id/login is the principal. A `roles` table (or
  column) in the authoritative store maps principal → role:
  - *author* — any authenticated collector: create/edit own notes → note enters `status='pending'`.
  - *moderator/editor* — curated allowlist: approve/reject; approved rows become harvest-eligible.
  Every role check is **server-side** in the write layer; the client never asserts its own role.
- **Read path stays anonymous:** the harvest (read) needs no auth; public display shows only approved
  notes.

---

## 7. Suggested Build Order (Thread 1 first)

**Phase 1 — Thread 1: Build-seam refoundation (no user value; de-risks everything).**
Introduce `data/artifacts.toml` + tested `data/artifacts.py`; refactor `nightly.sh` block 1c
(heredoc → module call), the publish/manifest block, and `deploy.yml`'s fetch step to consume it.
Add `provenance` + `baseline_diff`; classify all 14 existing artifacts as `derived`. **Pure refactor —
byte-identical `manifest.json` and identical baseline set**, gated by the nightly + new `artifacts.py`
unit tests. Establishes the explicit split with zero behavior change. Independently shippable.

**Phase 2 — Authoritative store + migration harness + backup/DR.**
Stand up the store (recommend SQLite/DuckDB-in-S3-with-versioning *or* managed Postgres),
`schema_migrations` + forward-only runner, `notes` + `note_revisions` + `roles` (append-only,
soft-delete), and backup automation + a documented restore drill. No write UI yet — seedable via a
script. Establishes the authoritative class end-to-end with the Phase-1 split.

**Phase 3 — Thin managed write layer + iNat OAuth.**
The consciously-bent "static-only" constraint, isolated in one deployable (Lambda Function URL or
small managed service; note the retired `260514-fcq` Lambda surface is precedent for the CDK shape).
iNat OAuth (PKCE), session, write authorization, roles, create/edit-note API. No public display yet.

**Phase 4 — Harvest → `notes.json` → build-time bake (public read, approved-only).**
Add the `notes-harvest` `run.py` step after `dbt-build` (reads store `status='approved'` + joins
species universe → `notes.json`); publish via the Phase-1 contract (`authoritative`,
`build_time_fetch=true`); `_data/notes.js` loader + `species-detail.njk` render (mirrors
`species_hosts`). First visible vertical slice.

**Phase 5 — Moderation loop + progressive live island.**
Moderator pending queue + approve/reject in the write layer; `src/notes-live.ts` progressive island
on species pages (author immediacy + moderator preview). Depends on all prior phases.

*(Optional split: the author-facing create/edit **form** on the species page can be its own phase
between 3 and 5 if Phase 3's scope grows.)*

**Ordering rationale:** contract cleanup first (safe artifact addition unblocked) → store+backup
before any write is accepted (never accept data you can't back up) → auth/write before harvest (need
data to harvest) → harvest+display before moderation polish (get the slice visible) → moderation +
live-refresh last (depends on everything).

---

## Integration Points — New vs. Modified

### New components

| Component | Responsibility |
|---|---|
| `data/artifacts.toml` | Single declarative artifact contract |
| `data/artifacts.py` (+ tests) | Loader/classifier; drives publish, baseline pull, build-time fetch |
| Authoritative store | System of record for notes (NOT a dbt model, NOT the DuckDB cache) |
| `data/notes_store/migrations/` + runner | Forward-only versioned schema evolution (run by write layer) |
| Thin write layer | Accepts writes; iNat OAuth; roles/moderation; **bends static-only constraint** |
| `data/notes_export.py` (harvest) | Reads store approved rows + species universe → `notes.json` |
| `_data/notes.js` | Eleventy build-time loader (mirrors `species_hosts.js`) |
| `src/notes-live.ts` | Optional progressive per-species live-refresh island |
| Backup automation + restore drill | Versioning + independent backup copy + tested restore |

### Modified components

| File | Change |
|---|---|
| `data/nightly.sh` | Block 1c heredoc → `artifacts.py` call; publish/manifest block → contract-driven |
| `data/run.py` | Add `notes-harvest` step after `dbt-build` |
| `.github/workflows/deploy.yml` | Fetch step (jq block) → `artifacts.py fetch-build-time` |
| `infra/lib/beeatlas-stack.ts` | **Surgical add** of write-layer + store + backup resources (never `cdk destroy`) |
| `src/manifest.ts` | Add `notes` key to `Manifest` interface |
| `_pages/species-detail.njk` | Notes render block |

### Data-flow changes

1. **WRITE (new):** browser → iNat OAuth → write layer → authoritative store (migration-managed
   schema, versioned backup, append-only revisions).
2. **HARVEST (new):** nightly `run.py` reads store (`status='approved'`) + joins species universe →
   `notes.json` → published as an `authoritative` artifact → `deploy.yml` build-time fetch → static
   species page. **The regression diff never sees it** (double isolation §1).
3. **READ display (new):** static baked note (floor) + optional online live-refresh island (enhancement).
4. **DERIVED flow (unchanged):** iNat/Ecdysis → DuckDB cache → dbt → exports → S3; now merely
   *contract-driven* instead of triple-hand-synced.

---

## Anti-Patterns to Avoid

- **Making the notes table a dbt model.** It would enter the sandbox build and `test_dbt_diff`,
  re-coupling authoritative data to the reproducibility gate — the exact contamination to prevent.
- **Reusing the DuckDB EXIT-trap backup for the store.** That's an overwrite-in-place `s3 cp` with no
  history; one bad run overwrites the only authoritative copy. Authoritative data needs versioned,
  independent, retained backups.
- **Client-only note display (pure option a).** Breaks offline/PWA, adds a runtime dependency on the
  write store, and risks leaking unmoderated notes if filtering is client-side. Bake approved notes;
  live-fetch only as enhancement.
- **`SKIP_INTEGRATION_GATE` for authoritative schema.** There's no source to rebuild — evolve forward
  with in-place migrations only.
- **Adding an artifact by editing `nightly.sh`/`deploy.yml` directly.** After Phase 1, the only edit
  site is `artifacts.toml`; direct edits reintroduce the triple-sync drift bug.

---

## Sources

- `data/nightly.sh`, `data/run.py`, `.github/workflows/deploy.yml`, `data/dbt/run.sh`,
  `infra/lib/beeatlas-stack.ts`, `src/manifest.ts` — current implementation (HIGH)
- `_data/species_hosts.js` + `_pages/species-detail.njk` — build-time bake pattern to mirror (HIGH)
- `.planning/PROJECT.md` (v8.0 framing), `.planning/notes/work-vs-learning-two-halves.md`,
  `docs/domain-model.md`, project MEMORY (`project_duckdb_wasm_direction`, `project_cdk_stack_composition`,
  `feedback_no_committed_data_artifacts`, `project_deploy_paths`) — constraints & precedent (HIGH)

---
*Architecture research for: authoritative-data integration into a derived static pipeline*
*Researched: 2026-07-02*
