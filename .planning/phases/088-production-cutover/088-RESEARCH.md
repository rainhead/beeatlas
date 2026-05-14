# Phase 88: Production Cutover - Research

**Researched:** 2026-05-13
**Domain:** Python orchestration + dbt cutover + CI gate retirement + frontend smoke verification
**Confidence:** HIGH

## Summary

Phase 88 is the v3.4 finale. After Phases 85-87, the dbt project (`data/dbt/`) already
produces byte-identical `occurrences.parquet`, `species.parquet`, `species.json`,
`seasonality.json`, `counties.geojson`, and `ecoregions.geojson` in
`data/dbt/target/sandbox/`, verified by `data/tests/test_dbt_diff.py` (15 of 16
PASS; the one residual FAIL is the 33→30-column drop in `public/data/occurrences.parquet`
which Phase 88 republishes). The dbt 30-column contract on `marts/occurrences` is enforced
and the LIN-05 singular test passes. The only Python that still runs SQL transforms is
`data/export.py`; `data/species_export.py` was already rewritten in Phase 86 Plan 05 as a
thin post-step that reads the dbt sandbox parquet and adds `slug` via `feeds._slugify`.

The cutover therefore narrows to four mechanical edits and one smoke test:

1. Replace `("export", export_all)` in `data/run.py` STEPS with a `dbt build` shell-out
   that writes parquet/GeoJSON into the location consumed by `species_export.py`, `feeds.py`,
   and `species_maps.py`. Delete `_apply_migrations()`. Delete `data/export.py`.
2. Wire dbt sandbox outputs to `EXPORT_DIR` so the existing nightly.sh upload step (which
   copies `$EXPORT_DIR/{occurrences.parquet,counties.geojson,ecoregions.geojson}` to S3)
   still works without modification.
3. Delete `scripts/validate-schema.mjs`, the `validate-schema` npm script, and the
   `.github/workflows/deploy.yml` "Validate parquet schema" step.
4. Keep `data/nightly.sh` mostly as-is. Phase 85 already resolved the awkward-fit tests
   (TEST-01, TEST-02) so `dbt build` exits 0 cleanly today (PASS=44 WARN=0 ERROR=0
   SKIP=0). No `--exclude` is needed.
5. Run `npm run dev` after cutover; manually verify map renders, filters work, table
   populates, species page works. `src/sqlite.ts` already declares the 30-column schema
   (Phase 85 Plan 04).

**Primary recommendation:** Cutover is a sequencing problem, not a research problem. The
risky step is choosing the artifact-flow contract (sandbox → public/data or
sandbox = EXPORT_DIR) — see §1 below. Once that is locked, every other change is a
mechanical delete or one-line swap. Run as three small waves: (W1) CI/JS retirement,
(W2) run.py rewrite + export.py deletion + dbt-output wiring, (W3) nightly.sh review +
manual smoke check.

## User Constraints (from Phase 87 lock + ROADMAP)

### Locked Decisions

- **No incremental materialization anywhere.** Phase 87 FINDINGS recommendation locked
  (087-FINDINGS.md `## Recommendation`): `dbt build` runs as a full graph rebuild every
  nightly run. Do not add `materialized='incremental'` to any model. Do not pass
  `--full-refresh` (full refresh is the default for non-incremental models).
- **dbt invocation: `bash data/dbt/run.sh build`** — this wrapper pins
  `dbt-core==1.10.1 / dbt-duckdb==1.10.1` via `uvx` and is load-bearing for Python-3.14
  compatibility. Do not invoke `dbt` directly; do not edit `data/dbt/run.sh`.
- **30-column contract on `marts/occurrences`** is the sole runtime schema gate after
  cutover (CLEAN-02 from Phase 85). `dbt build` fails (exit 1) if the projected column
  set diverges from the enforced contract.
- **GeoJSON emission via `FORMAT CSV` macro retained** (CLEAN-01 D-03 override).
  `emit_feature_collection.sql` is unchanged; `counties_geo` / `ecoregions_geo` post-hooks
  write `target/sandbox/{counties,ecoregions}.geojson` byte-identically to `export.py`.
- **`int_combined` stays `materialized='table'`** (087-FINDINGS rollback confirmed).
- **`load_links` and `resolve_taxon_ids.py` stay in Python** (PORT-02/PORT-04 boundary
  doc, `086/ingestion-boundary.md`). The dbt DAG consumes their outputs via `source()`.

### Claude's Discretion

- The artifact-flow contract — how dbt's `target/sandbox/` outputs become the files
  consumed by `species_export.py`, `feeds.py`, `species_maps.py`, and the nightly.sh
  S3 upload. See §1 below for the recommended pattern.
- Subprocess invocation style in `run.py` (`subprocess.run(check=True)` vs. raising
  `RuntimeError` on non-zero) — see Q4.
- Wave shape and parallelism — see §9 Sequencing.

### Deferred Ideas (OUT OF SCOPE)

- dbt Cloud, dbt-core+orchestrator, alternative dbt invocation paths.
- Nightly-failure notification (Healthchecks.io dead-man's switch) — captured at
  `.planning/todos/pending/nightly-run-failure-notification.md` as natural follow-on.
- `is_provisional` → `source_type` enum refactor (deferred per REQUIREMENTS.md).
- Multi-state expansion.
- Lambda CDK artifacts in AWS (not the active execution path; nightly.sh on maderas is).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CUTOVER-01 | `data/run.py` invokes `bash data/dbt/run.sh build` instead of `export.py`/`species_export.py`; exits non-zero with useful error on dbt failure | §1 (run.py STEPS rewrite), §4 (exit-code propagation), §2 (export.py retired; species_export.py stays as thin post-step per Phase 86 Plan 05) |
| CUTOVER-02 | `_apply_migrations()` deleted; every invariant mapped to a dbt replacement | §1 Migration → dbt mapping table (both are stale dead-code on the current S3 DuckDB) |
| CUTOVER-03 | `scripts/validate-schema.mjs` deleted; npm `validate-schema` removed; `.github/workflows/deploy.yml` updated; `npm run build` succeeds | §3 (3 deletion sites, dbt contract subsumes all invariants) |
| CUTOVER-04 | `data/nightly.sh` interprets dbt exit codes correctly; uses `--exclude` only for documented awkward-fits | §5 (no exclusions needed — TEST-01/02 resolved in Phase 85), §6 (exit-code interpretation) |
| VALIDATE-02 | Smoke check: `npm run dev`, map / filters / table / species page work against dbt-produced parquet, no frontend code changes | §7 (smoke protocol), `src/sqlite.ts` already declares 30 cols (Phase 85) |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| dbt transform (SQL → parquet/GeoJSON) | dbt + DuckDB | — | The whole point of v3.4. SQL aggregation lives in dbt; DuckDB executes via dbt-duckdb adapter. |
| Slug append on species.parquet | Python post-step (`species_export.py`) | — | `unicodedata.normalize('NFKD')` is not byte-identically reproducible in SQL (PATTERNS Surprise 1 from Phase 86). Stays in Python. |
| Seasonality.json emission | Python post-step (`species_export.py`) | — | Same Python post-step reads dbt's `target/sandbox/occurrences.parquet` and accumulates buckets. |
| Static map SVG generation | Python (`species_maps.py`) | — | Downstream consumer of `species.parquet`; reads it directly. Not a transform. Stays unchanged. |
| Atom feed emission | Python (`feeds.py`) | — | Reads `ecdysis_data` tables directly from DuckDB. Not a transform. Stays unchanged. |
| dlt ingestion (iNat / Ecdysis / WABA / checklist) | Python | — | HTTP I/O, rate-limiting, side-effect artifacts. Per ingestion-boundary.md. Stays. |
| Schema gate (column names + types) | dbt contract (`marts/schema.yml` + `contract.enforced=true`) | — | Replaces `scripts/validate-schema.mjs`. dbt fails build if SELECT diverges from contract. |
| Frontend parquet load | wa-sqlite + hyparquet (`src/sqlite.ts`) | — | No changes. `src/sqlite.ts` already declares 30 cols (Phase 85 Plan 04). |
| Nightly orchestration | bash (`data/nightly.sh`) | cron on maderas | DB pull from S3 → run.py → S3 upload → CloudFront invalidate. |

## Standard Stack

This phase adds zero new dependencies. The cutover composes existing pieces.

### Core

| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| `dbt-core` | 1.10.1 (pinned in `data/dbt/run.sh`) | DAG runner + test runner | Standard for SQL transforms with declared lineage. |
| `dbt-duckdb` | 1.10.1 (pinned in `data/dbt/run.sh`) | DuckDB adapter; external parquet materializations | The only viable adapter for static-hosting BeeAtlas pipeline. |
| `uvx` (uv tool exec) | from `uv` | Isolates dbt's Python 3.13 from project's Python 3.14 | A1 fallback (Python-3.14 mashumaro incompatibility, documented in `data/dbt/run.sh`). |
| `subprocess` (stdlib) | Python 3.14 | Shell-out from `run.py` to `bash data/dbt/run.sh build` | Standard. |

### Pinned Versions (Verified)

- `dbt-core==1.10.1` and `dbt-duckdb==1.10.1` — pinned literally in
  `data/dbt/run.sh` lines 30/33. [VERIFIED: read of `data/dbt/run.sh`]
- Released 2026-02-17 (per 087-FINDINGS.md). [CITED: 087-FINDINGS.md `## Answers to ROADMAP Questions` Q1]

## Architecture Patterns

### System Architecture Diagram (post-cutover)

```
                    ┌────────────────────────────────────────────┐
                    │           data/nightly.sh (cron)           │
                    └──────────────────┬─────────────────────────┘
                                       │
                          ┌────────────▼────────────┐
                          │  1. aws s3 cp           │
                          │     S3:db/beeatlas.duckdb│
                          │     → /tmp/beeatlas.duckdb│
                          └────────────┬────────────┘
                                       │
                          ┌────────────▼────────────┐
                          │  2. uv run python run.py │
                          │     (STEPS list)        │
                          └────────────┬────────────┘
                                       │
       ┌───────────────────────────────┼───────────────────────────────┐
       │  INGESTION (Python)           │  TRANSFORM (dbt)              │
       │  ecdysis, ecdysis-links,      │  bash data/dbt/run.sh build   │
       │  inaturalist, waba, projects, │    │                          │
       │  anti-entropy, checklist,     │    ▼                          │
       │  resolve-taxon-ids,           │  data/dbt/target/sandbox/     │
       │  taxon-lineage-extended       │    ├─ occurrences.parquet     │
       │     │                         │    ├─ species.parquet (18 col)│
       │     ▼                         │    ├─ counties.geojson        │
       │  beeatlas.duckdb              │    └─ ecoregions.geojson      │
       │     (sources for dbt)         │                               │
       └───────────────────────────────┴───────────────────────────────┘
                                       │
                          ┌────────────▼────────────┐
                          │  POST-STEPS (Python)    │
                          │  species-export (slug + │
                          │      species.json +     │
                          │      seasonality.json)  │
                          │  species-maps (SVGs)    │
                          │  feeds (Atom)           │
                          └────────────┬────────────┘
                                       │
                          ┌────────────▼────────────┐
                          │  3. EXPORT_DIR layout:  │
                          │  occurrences.parquet    │
                          │  species.parquet (19c)  │
                          │  species.json           │
                          │  seasonality.json       │
                          │  counties.geojson       │
                          │  ecoregions.geojson     │
                          │  species-maps/*.svg     │
                          │  feeds/*.xml + index.json│
                          └────────────┬────────────┘
                                       │
                          ┌────────────▼────────────┐
                          │  4. aws s3 cp → S3      │
                          │     CloudFront invalidate│
                          └─────────────────────────┘
                                       │
                          ┌────────────▼────────────┐
                          │  Frontend (unchanged)   │
                          │  src/sqlite.ts (30 col) │
                          │  hyparquet → wa-sqlite  │
                          └─────────────────────────┘
```

### Pattern 1: dbt build as a single STEPS entry

**What:** Replace `("export", export_all)` in `data/run.py` STEPS with
`("dbt-build", _run_dbt_build)` where `_run_dbt_build` shells out to
`bash data/dbt/run.sh build` and raises on non-zero exit.

**When to use:** Any time a Python orchestrator needs to delegate transform work to dbt
while preserving its existing step/timing/logging convention.

**Example (verified pattern for `subprocess.run` with `check=True`):**

```python
# Source: Python stdlib (https://docs.python.org/3/library/subprocess.html#subprocess.run)
def _run_dbt_build() -> None:
    """Invoke dbt build via the version-pinned wrapper.

    Exits non-zero on:
      - any model/test ERROR (compile failure, contract violation, runtime SQL error)
      - any data test FAIL (relationships, not_null, unique, singular test returns rows)
    Raises CalledProcessError on non-zero exit; the caller (main) traceback.prints
    and re-raises, matching the existing pattern in run.py lines 113-118.
    """
    import subprocess
    repo_root = Path(__file__).parent.parent
    subprocess.run(
        ["bash", str(repo_root / "data" / "dbt" / "run.sh"), "build"],
        check=True,
    )
```

`subprocess.run(check=True)` raises `CalledProcessError` on non-zero exit. The existing
`run.py:main()` loop catches every Exception, prints a traceback, and re-raises (lines
113-118). The CalledProcessError message includes the command and exit code — that
satisfies CUTOVER-01's "meaningful error message" requirement without bespoke wrapping.

### Pattern 2: Wire dbt sandbox to EXPORT_DIR via single env var or symlink

**What:** dbt writes external materializations to `data/dbt/target/sandbox/`. The nightly
script's S3 upload step reads from `$EXPORT_DIR/{occurrences.parquet,counties.geojson,
ecoregions.geojson}`. `species_export.py` reads dbt outputs from `DBT_SANDBOX_DIR` and
writes to `ASSETS_DIR` (= `EXPORT_DIR`). `species_maps.py` and `feeds.py` write to
`ASSETS_DIR` (= `EXPORT_DIR`).

**Three viable options** — planner should pick:

| Option | Mechanism | Tradeoff |
|--------|-----------|----------|
| **A: Copy** | After `dbt build`, `run.py` copies `target/sandbox/{occurrences.parquet,counties.geojson,ecoregions.geojson}` into `EXPORT_DIR`. Each subsequent post-step reads `EXPORT_DIR`. | Explicit, no env vars needed downstream. Duplicates the parquet on disk briefly. Closest to current behavior of `export.py` writing to `EXPORT_DIR`. |
| **B: Symlink** | `run.py` `os.symlink(target/sandbox/occurrences.parquet, EXPORT_DIR/occurrences.parquet)` after dbt build. | Zero-copy. Fragile if a downstream tool resolves the symlink unexpectedly. AWS S3 `cp` follows symlinks, so upload works. |
| **C: Point dbt directly at EXPORT_DIR** | Change `marts/occurrences.sql` `location='target/sandbox/...'` to read an env var (`{{ env_var('EXPORT_DIR', 'target/sandbox') }}/occurrences.parquet`). | Removes the copy/symlink, but couples dbt model configs to the orchestrator env. Breaks `test_dbt_diff.py` which reads `SANDBOX = data/dbt/target/sandbox`. |

**Recommendation:** **Option A (copy).** Reasons:
1. `test_dbt_diff.py` keeps working without changes (still reads `SANDBOX = data/dbt/target/sandbox/`).
2. Mirrors the current contract of `export.py` (writes to `EXPORT_DIR`).
3. `species_export.py`'s DBT_SANDBOX_DIR / EXPORT_DIR separation (documented in
   `086-05-SUMMARY.md` `## Decisions Made`) remains coherent: read from sandbox,
   write to EXPORT_DIR.
4. The three files copied are ~1.3MB + ~210KB + ~38KB ≈ 1.5MB total — negligible.

### Pattern 3: Retire validate-schema.mjs in three coupled sites

**What:** `validate-schema.mjs` is referenced in three places. All three must be deleted
in the same commit/wave to avoid CI failures.

| Site | Current | Action |
|------|---------|--------|
| `scripts/validate-schema.mjs` | 123-line node script (hyparquet metadata read) | DELETE |
| `package.json` line 20 (script def) | `"validate-schema": "node scripts/validate-schema.mjs"` | DELETE |
| `package.json` line 25 (build chain) | `"build": "npm run validate-schema && npm run validate-species && ..."` | REMOVE `npm run validate-schema && ` |
| `.github/workflows/deploy.yml` line 24-25 | `- name: Validate parquet schema\n  run: npm run validate-schema` | DELETE step |

After the deletes: `npm run build` chain becomes `validate-species → typecheck → eleventy
→ validate-bundle-size`. [VERIFIED: read of package.json and deploy.yml]

### Anti-Patterns to Avoid

- **Replacing `validate-schema.mjs` with a JS dbt-contract checker.** The dbt contract is
  enforced at `dbt build` time on every nightly run; the parquet on S3 cannot diverge
  from the 30-column contract without `dbt build` failing first. A second CI-side check
  duplicates work and adds maintenance burden.
- **Adding `--exclude` to nightly.sh defensively.** Phase 85 resolved both awkward-fit
  tests. `dbt build` exits 0 cleanly today (PASS=44 ERROR=0 SKIP=0 per 086-VERIFICATION).
  Adding `--exclude` "just in case" creates dead syntax and hides any future regression.
- **Migrating data inside `run.py` again.** Both `_apply_migrations()` branches are
  one-time schema fixes for v3.x DBs. Today's S3 DuckDB has already had both migrations
  applied (the renames committed years ago). Re-introducing migration code in `run.py`
  ahead of cutover is regress. If a future schema change needs migration, do it in dbt
  (incremental model with `on_schema_change`) or as a one-shot SQL script.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parquet column-set validation in CI | A second hyparquet/JS script | dbt contract (`schema.yml` + `contract.enforced=true`) | The contract is enforced at every `dbt build`. Frontend reads S3; S3 is uploaded by nightly.sh from dbt output. The contract IS the schema gate. |
| dbt exit-code parsing | Custom stdout/stderr regex matching | `subprocess.run(check=True)` + dbt's documented exit codes (0/1/2) | dbt exits 0 only on success; 1 on any handled error (including test FAIL); 2 on unhandled (signal, network). Standard POSIX behavior — let it propagate. [CITED: https://docs.getdbt.com/reference/exit-codes] |
| Idempotent target-dir cleanup | Pre-build `rm -rf target/sandbox` | `data/dbt/run.sh` lines 24 already do `mkdir -p target/sandbox` | The wrapper handles it; do not duplicate. |
| One-time schema migration runner | Re-introduce `_apply_migrations()` later | dbt's `on_schema_change` config (when needed) or one-shot SQL script | The Phase-47/Phase-48 migrations are years stale. Anything new should live where dbt handles it. |

**Key insight:** This phase is mostly DELETIONS. The dbt project already does everything
`export.py` did, more rigorously. Hand-rolling alternatives to dbt's built-in contract
enforcement, exit-code semantics, or DAG runner re-introduces complexity that the
v3.4 rewrite exists to remove.

## Runtime State Inventory

Phase 88 is a refactor/retirement phase. Each category audited:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | **DuckDB schema rename history.** `_apply_migrations()` checks: (a) `ecdysis_data.occurrence_links.inat_observation_id` → `host_observation_id` (Phase 48 rename); (b) geographies tables gaining `geom GEOMETRY` column from `geometry_wkt` (Phase 47). On the current production S3 DuckDB both columns already match the target schema (the rename committed years ago, and `geographies_pipeline.py` is run manually whenever boundaries change). | **None.** The migration code is defensive dead-weight today. Deleting it is the entire CUTOVER-02 action. If a future S3 restore from an ancient backup ever reintroduces a pre-Phase-47/48 schema, the operator must run the rename manually — but that's a multi-year edge case explicitly out of scope. |
| Live service config | **AWS CDK Lambda artifacts.** Stack `beeatlasstack` deploys a Lambda + EventBridge that mirrors nightly.sh, but `CLAUDE.md ## Known State` confirms the ACTIVE execution path is `data/nightly.sh` on maderas, not the Lambda. | **None.** Lambda is dormant. Do not touch CDK in this phase. |
| OS-registered state | **maderas cron entry** invokes `data/nightly.sh`. The cron line itself references `nightly.sh` by path, not by anything inside it. | **None for cutover.** Cron line unchanged. If `nightly.sh` is edited in CUTOVER-04 (likely no-op edit), cron picks up the new script automatically next run. Verify after first nightly run. |
| Secrets / env vars | `AWS_PROFILE`, `BUCKET`, `DISTRIBUTION_ID` referenced in `nightly.sh`. `VITE_MAPBOX_TOKEN` referenced in deploy.yml. None reference `validate-schema` or `export.py`. | **None.** No secret rotation. |
| Build artifacts | (a) `data/dbt/target/` — recreated on every `dbt build`. (b) `data/__pycache__/export.cpython-*.pyc` — stale once `export.py` is deleted; Python ignores stale .pyc when the .py is gone, but worth `rm -rf data/__pycache__` if anyone hits import weirdness during local testing. (c) No installed wheels reference `export.py`. | **Light cleanup.** Mention `rm -rf data/__pycache__` in the run.py-rewrite plan as a one-line post-edit step. |

**Canonical question answered:** After every file in the repo is updated and a fresh
nightly runs, the only runtime state that could carry old behavior is (1) the S3 DuckDB
(it already matches the post-migration schema — no action) and (2) maderas Python bytecode
cache (cleared automatically by mtime, but a hint to `rm -rf data/__pycache__` is cheap
insurance).

## Common Pitfalls

### Pitfall 1: dbt build location path is relative — invariant must be preserved

**What goes wrong:** Changing the `location='target/sandbox/occurrences.parquet'` in
`marts/occurrences.sql` to an absolute path breaks the `external_root` mechanism in
`profiles.yml` (`external_root: target/sandbox`).

**Why it happens:** dbt-duckdb's external materialization resolves `location` relative
to `external_root` only when `location` itself is relative. An absolute `location` bypasses
`external_root` and lands in an unexpected place.

**How to avoid:** Don't touch the `location=` strings in `marts/*.sql`. Wire the sandbox
→ EXPORT_DIR connection in `run.py` (Pattern 2 Option A), not in dbt configs.

**Warning signs:** `data/dbt/target/sandbox/occurrences.parquet` missing after `dbt build`
exits 0, or appearing in a stale path like `/Users/.../target/sandbox/...`.

### Pitfall 2: `_apply_migrations` runs BEFORE pipelines — order matters when deleted

**What goes wrong:** `_apply_migrations()` is called at line 109 of `run.py` BEFORE the
STEPS loop. If `dbt build` is added to STEPS and `_apply_migrations` is deleted in the
same edit, but the rename actually mattered, dbt would fail at the first model that
references `host_observation_id`.

**Why it happens:** The rename is presumed-applied based on git history, not verified
live before deletion.

**How to avoid:** Before merging the cutover, run `bash data/dbt/run.sh build` against
the production DuckDB pulled from S3, and confirm exit 0. This is the same verification
already required by CUTOVER-04 success criterion 1. If `dbt build` exits 0 against the
S3 DB without `_apply_migrations` having run, the migration is provably unnecessary.

**Warning signs:** dbt build errors like `Binder Error: column "host_observation_id" not
found` or `column "geom" not found in geographies.us_counties`.

### Pitfall 3: Frontend reads from CloudFront, not from S3 directly

**What goes wrong:** Post-cutover, the new parquet is uploaded to S3 but CloudFront cache
still serves the old one until invalidation completes. Local `npm run dev` reads
`public/data/occurrences.parquet` (gitignored, pipeline-produced). Smoke check appears to
pass locally while production still serves stale data.

**Why it happens:** `nightly.sh` step 4 does invalidate `/data/*`, but it takes ~30s to
propagate. Manual smoke check post-cutover should test BOTH local (`npm run dev` against
fresh dbt-produced `public/data/occurrences.parquet`) AND remote
(after `aws cloudfront wait`).

**How to avoid:** Smoke protocol explicit about both surfaces — see §7.

**Warning signs:** Local OK but `beeatlas.net` shows old data or schema errors in browser
console.

### Pitfall 4: `species_export.py` requires dbt outputs in BOTH species.parquet AND occurrences.parquet

**What goes wrong:** If the new STEPS only runs `dbt build` for `occurrences.parquet`
(e.g. `dbt build --select marts.occurrences`), `species_export.py` raises FileNotFoundError
because `target/sandbox/species.parquet` is missing.

**Why it happens:** `species_export.py` lines 109-121 check both files. The plan must
specify a full `dbt build` (no `--select`), which produces all 4 external materializations
(occurrences, species, counties_geo, ecoregions_geo post-hooks).

**How to avoid:** STEPS entry is plain `bash data/dbt/run.sh build` — no selector.

**Warning signs:** `FileNotFoundError: species_export requires .../species.parquet`.

### Pitfall 5: `subprocess.run` inherits stdout but not always cwd

**What goes wrong:** If `run.py` is invoked from `/tmp/beeatlas-export` (nightly.sh sets
`EXPORT_DIR`), `subprocess.run(["bash", "data/dbt/run.sh", "build"])` with a relative
path fails.

**Why it happens:** `nightly.sh` does `cd "$SCRIPT_DIR"` (data/) before `uv run python
run.py`, so `run.py` is invoked from `data/`. But for safety, build the path absolutely.

**How to avoid:** Use `Path(__file__).parent / "dbt" / "run.sh"` to compute the absolute
path. See Pattern 1 example.

**Warning signs:** `FileNotFoundError: [Errno 2] No such file or directory: 'data/dbt/run.sh'`.

### Pitfall 6: dbt exit code 1 covers BOTH ERROR and FAIL

**What goes wrong:** Operator/code interprets exit 1 as "test failed but model built" and
keeps going.

**Why it happens:** dbt exit 1 is "completed with at least one handled error" — this
includes test FAIL outcomes, not just build/compile/runtime ERRORs. There is no separate
exit code for "data test failed but everything else passed." [CITED:
https://docs.getdbt.com/reference/exit-codes; verified by GitHub issue
dbt-labs/dbt-core#8045 still open as a feature request as of late 2025]

**How to avoid:** Treat any non-zero from `dbt build` as a hard failure. Do not parse
stdout to disambiguate. If a specific test is "documented and excluded" (none today;
Phase 85 resolved them), use `--exclude` so the test is never executed.

**Warning signs:** Nightly silently produces a parquet that fails downstream tests
because the operator's nightly.sh wrapper masked exit 1.

## Code Examples

### run.py STEPS rewrite (verified pattern)

```python
# Source: data/run.py lines 25-55 (current STEPS list) + Pattern 1 above

# DELETE these imports (lines 34-35):
#     from export import main as export_all
#     from species_export import main as export_species_parquet

# KEEP this import (line 35) — species_export.py stays as the slug post-step:
from species_export import main as export_species_parquet

# DELETE _apply_migrations entirely (lines 58-105)
# DELETE the call to _apply_migrations() at line 109

import shutil
import subprocess
from pathlib import Path

_DBT_SCRIPT = Path(__file__).parent / "dbt" / "run.sh"
_DBT_SANDBOX = Path(__file__).parent / "dbt" / "target" / "sandbox"
_EXPORT_DIR = Path(os.environ.get('EXPORT_DIR',
    str(Path(__file__).parent.parent / 'public' / 'data')))

def _run_dbt_build() -> None:
    """Invoke `bash data/dbt/run.sh build` and propagate exit code via CalledProcessError.

    On success, copy the four external materializations into EXPORT_DIR so the
    downstream post-steps (species-export, species-maps, feeds) and nightly.sh's
    S3 upload step see them at the expected paths.
    """
    subprocess.run(["bash", str(_DBT_SCRIPT), "build"], check=True)
    _EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    for artifact in ("occurrences.parquet", "counties.geojson", "ecoregions.geojson"):
        src = _DBT_SANDBOX / artifact
        dst = _EXPORT_DIR / artifact
        shutil.copy2(src, dst)
    # species.parquet is added in species_export.py's post-step (it appends slug
    # before writing 19-col parquet to EXPORT_DIR). Do NOT copy it from sandbox here.

STEPS: list[tuple[str, Callable]] = [
    ("ecdysis", load_ecdysis),
    ("ecdysis-links", load_links),
    ("inaturalist", load_inaturalist_observations),
    ("waba", load_waba_observations),
    ("projects", load_projects),
    ("anti-entropy", run_anti_entropy),
    ("checklist", load_checklist),
    ("resolve-taxon-ids", lambda: resolve_taxon_ids(refresh=_REFRESH_LINEAGE)),
    ("taxon-lineage-extended", enrich_taxon_lineage_extended),
    ("dbt-build", _run_dbt_build),         # NEW — replaces ("export", export_all)
    ("species-export", export_species_parquet),  # UNCHANGED (post-step)
    ("species-maps", generate_species_maps),     # UNCHANGED (downstream consumer)
    ("feeds", generate_feeds),                   # UNCHANGED (downstream consumer)
]

def main() -> None:
    # _apply_migrations() deleted — see CUTOVER-02 mapping table in 088-RESEARCH.md
    overall_start = time.monotonic()
    # ... rest unchanged
```

### package.json build chain (post-deletion)

```json
// Source: package.json line 25 (current)
"build": "npm run validate-species && npm run typecheck && eleventy && npm run validate-bundle-size"
// Removed: "npm run validate-schema && "
// Removed: line 20 "validate-schema": "node scripts/validate-schema.mjs",
```

### deploy.yml (post-deletion)

```yaml
# Source: .github/workflows/deploy.yml lines 21-31 (current)
      - name: Install dependencies
        run: npm ci

      # DELETED: - name: Validate parquet schema / run: npm run validate-schema

      - name: Run tests
        run: npm test

      - name: Build site
        run: npm run build
```

### nightly.sh (no edits required for CUTOVER-04)

The current nightly.sh script (verified by read of `data/nightly.sh`) already:
- `set -euo pipefail` (line 6) — any non-zero exit from any command kills the script
- `uv run python run.py` (line 41) — when run.py raises (from `_run_dbt_build`'s
  `CalledProcessError`), Python exits non-zero, bash propagates exit non-zero
- Trap on EXIT (line 24) backs up DuckDB regardless of success/failure
- Step 3 (lines 47-50) uploads `$EXPORT_DIR/{occurrences.parquet,counties.geojson,
  ecoregions.geojson}` to S3 — works unchanged because run.py's new `_run_dbt_build`
  populates EXPORT_DIR with exactly those three files

**Recommendation:** Read nightly.sh during the cutover and confirm no edits are needed.
Document the no-op in the plan summary so CUTOVER-04 is explicitly satisfied.

## Migration → dbt Replacement Mapping (CUTOVER-02)

This table satisfies CUTOVER-02 success criterion 2 ("written mapping documents each
migration invariant and its dbt replacement"). The planner should paste this into the
cutover phase summary.

| Migration in `_apply_migrations()` | Invariant Enforced | dbt Replacement | Evidence |
|------------------------------------|--------------------|-----------------|----------|
| Rename `ecdysis_data.occurrence_links.inat_observation_id` → `host_observation_id` (Phase 48) | The link table column is named `host_observation_id` | `data/dbt/models/staging/stg_ecdysis__occurrence_links.sql` selects from `source('ecdysis_data', 'occurrence_links')`; downstream `int_ecdysis_base.sql` line 28 references `links.host_observation_id`. The dbt source declaration in `sources.yml` IS the contract. If the column is missing or differently named, dbt build fails at compile time with a binder error. | [VERIFIED: read of `stg_ecdysis__occurrence_links.sql` + `int_ecdysis_base.sql`] |
| Add `geom GEOMETRY` column to `geographies.us_counties`, `geographies.ecoregions`, `geographies.us_states` (Phase 47) | Geographies tables have a typed `geom` column (not just `geometry_wkt`) | `data/dbt/models/staging/stg_geo__us_counties.sql`, `stg_geo__ecoregions.sql`, `stg_geo__us_states.sql` each select `ST_GeomFromText(geometry_wkt) AS geom` (verified via compile target output in `data/dbt/target/compiled/.../stg_geo__*.sql`). The dbt staging layer always converts from `geometry_wkt` on read, so the source table doesn't need a pre-computed `geom` column at all. Migration is OBVIATED, not replaced. | [VERIFIED: file listing shows three stg_geo__*.sql files; macros/emit_feature_collection.sql confirms ST_GeomFromText pattern; `geographies_pipeline.py` is the source of truth for these tables and runs manually] |

**No invariant lacks a replacement.** Both migrations are obviated by dbt's read-time
conversion or by the dbt source declaration's implicit schema contract. Deletion of
`_apply_migrations()` is safe.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hand-rolled JS parquet column validator (`validate-schema.mjs`) | dbt `marts/schema.yml` contract with `enforced: true` | Phase 85 (contract added); Phase 88 (validator retired) | Single source of truth. Contract enforced at every `dbt build`, not just at CI gate. Frontend schema mismatch becomes impossible without a build failure first. |
| Python multi-CTE SQL in `data/export.py` | dbt DAG (`staging` → `intermediate` → `marts/occurrences`) | Phase 84 (dbt added in parallel); Phase 88 (Python retired) | Declared lineage; tests at each layer; reproducible parquet; eliminates the "two implementations to keep in sync" problem v3.3 lived with. |
| `_apply_migrations()` runtime schema fixup | dbt source contract (column missing → compile error) | Phase 88 (deletion) | No more silent stale-DB rescue. Forces explicit migration management. |

**Deprecated/outdated:**
- `data/export.py` — entire file retired in this phase.
- `scripts/validate-schema.mjs` — retired in this phase.
- `_apply_migrations()` — retired in this phase.
- `samples.parquet`, `ecdysis.parquet` in `public/data/` — pre-v3.0 artifacts no longer
  produced by the pipeline; not in scope for cutover but flag in plan summary as stale
  files on disk. (`scripts/fetch-data.sh` line 21 still references them, also stale.)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The production S3 DuckDB has already had both `_apply_migrations()` renames applied (Phase 47 + Phase 48 are years old) | §1 Migration mapping, Pitfall 2 | Low — dbt build against the live DB would fail loudly with a binder error before any data corruption. Verification step in plan = manually run `bash data/dbt/run.sh build` once against the S3-pulled DB on maderas before deleting `_apply_migrations`. | [ASSUMED — based on commit history claims; verify with one dbt run] |
| A2 | dbt build's exit code semantics (0=success, 1=handled error including test FAIL, 2=unhandled) hold for dbt-core 1.10.1 | §6, Pitfall 6 | Low — semantics are documented and stable since 1.0; the docs page has not changed. Issue dbt-core#4479 noted minor inconsistencies in some edge cases but `dbt build` core behavior is stable. | [CITED: https://docs.getdbt.com/reference/exit-codes — confirmed via WebFetch] |
| A3 | No CloudFront-side check or third-party hook depends on `scripts/validate-schema.mjs` running | §3, CUTOVER-03 | Low — grep across repo shows only the 3 sites listed (validate-schema.mjs itself, package.json, deploy.yml). | [VERIFIED: `grep -rn validate-schema` returned exactly those 3 sites] |
| A4 | The `species-maps` post-step's read of `ASSETS_DIR/species.parquet` works against the 19-col Python-post-step output (not 18-col dbt mart) | Pattern 2 Option A | Low — `species_export.py` writes the 19-col parquet to `ASSETS_DIR/species.parquet` (line 176-177), and `species_maps.py` reads from `ASSETS_DIR/species.parquet` (line 200). The current production flow already works this way (`occurrence_count > 0` filter works on either col set). | [VERIFIED: read of both files] |
| A5 | The `feeds.py` step works without changes — it reads `ecdysis_data.identifications` from DuckDB directly, not from any parquet | Pattern 2, §2 | Very low — feeds is an ingestion-adjacent emitter, never participated in `export.py` flow. | [VERIFIED: read of `data/feeds.py` lines 1-50] |
| A6 | No exclusions needed in nightly.sh's `dbt build` invocation today | §5, CUTOVER-04 | Low — Phase 85 verification shows PASS=44 ERROR=0 SKIP=0 against live DB (085-VERIFICATION.md `## Behavioral Spot-Checks`); Phase 86 verification shows PASS=44 unchanged (086-VERIFICATION.md). If a regression emerges by the time Phase 88 runs, the plan should be amended to add `--exclude` then with documentation, not preemptively. | [VERIFIED: Phase 85 + 86 verification reports] |

**Read this column for risk gating:** items tagged `[ASSUMED]` should be verified before
deletion; items tagged `[VERIFIED]` or `[CITED]` are confirmed by tool output this session.

## Open Questions

1. **Should `_apply_migrations` be deleted in the same commit as `export.py`, or kept one
   wave earlier as a safety net?**
   - What we know: Both are dead code. `_apply_migrations` is more dead — both renames
     already applied to the prod DB. `export.py` is one merge away from being removed by
     CUTOVER-01.
   - What's unclear: Whether having `_apply_migrations` as a no-op safety net for one
     more nightly cycle has any value.
   - Recommendation: Delete in the same commit/wave as the run.py rewrite. Both are
     symbolic-only deletions once dbt build is wired in. Keeping dead code "just in case"
     contradicts the v3.4 cleanup goal.

2. **Should `public/data/samples.parquet` and `public/data/ecdysis.parquet` (gitignored
   stale artifacts from pre-v3.0) be cleaned out of S3?**
   - What we know: They exist in local `public/data/` from old runs; they likely sit
     in S3 too. Not consumed by current frontend.
   - What's unclear: Whether stale presence in S3 affects anything.
   - Recommendation: **Out of scope for Phase 88.** File a follow-on todo
     (`.planning/todos/pending/stale-public-data-cleanup.md`) for a future deletion pass.
     `scripts/fetch-data.sh` lists them in its sync; that script needs updating too but
     is also out of scope.

3. **Should the cutover include a rollback marker (git tag) at the pre-cutover SHA?**
   - What we know: Phase 87 already left
     `.planning/phases/087-incremental-materialization-experiment/pre-experiment-sha.txt`
     as a rollback marker.
   - What's unclear: Whether to do the same for Phase 88.
   - Recommendation: **Yes**, follow the Phase-87 pattern. Capture `git rev-parse HEAD`
     to `.planning/phases/088-production-cutover/pre-cutover-sha.txt` in the FIRST plan
     of the phase. Single-commit rollback = `git revert <merge-commit>`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| `bash` | nightly.sh, dbt/run.sh | ✓ (presumed on maderas) | system | — |
| `uvx` (from `uv`) | dbt/run.sh wrapper | ✓ (already used by existing CI/local) | uv ≥ 0.x | — |
| `dbt-core` 1.10.1 | `dbt build` | ✓ (pulled by uvx on every invocation) | 1.10.1 (pinned) | — |
| `dbt-duckdb` 1.10.1 | `dbt build` | ✓ (pulled by uvx) | 1.10.1 (pinned) | — |
| `node` | `npm run build` chain | ✓ (`.nvmrc`) | per .nvmrc | — |
| `aws` CLI | nightly.sh | ✓ (maderas cron host) | system | — |
| `python` 3.14 | run.py | ✓ (pyproject.toml requires-python) | 3.14+ | — |
| Production DuckDB at S3:db/beeatlas.duckdb | nightly.sh step 1 | ✓ | n/a | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Python tests | pytest 9.0.2 (`data/pyproject.toml`) |
| JS tests | vitest 4.1.2 (`package.json`) |
| dbt tests | dbt-core 1.10.1 generic + singular tests (`data/dbt/run.sh build` runs them) |
| Quick run (Python) | `cd data && uv run pytest -x` |
| Quick run (JS) | `npm test` (runs vitest once) |
| Quick run (dbt) | `bash data/dbt/run.sh build` (runs models + tests) |
| Full suite | All three in sequence: `bash data/dbt/run.sh build && cd data && uv run pytest && cd .. && npm test && npm run build` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| CUTOVER-01 | run.py invokes dbt build; exits non-zero on dbt failure | unit-ish + behavioral | `python -c 'from data.run import STEPS; assert ("dbt-build", _) in [(n,_) for n,_ in STEPS]'` + `uv run pytest data/tests/test_dbt_diff.py` | ✅ test_dbt_diff.py exists |
| CUTOVER-01 | export.py and _apply_migrations() deleted | static | `test ! -f data/export.py && grep -L _apply_migrations data/run.py` | n/a — grep check |
| CUTOVER-02 | _apply_migrations invariants covered by dbt | behavioral | `bash data/dbt/run.sh build` exits 0 against a fresh S3-pulled DuckDB | ✅ dbt project exists |
| CUTOVER-03 | validate-schema.mjs and its references deleted | static | `test ! -f scripts/validate-schema.mjs && ! grep -q validate-schema package.json .github/workflows/deploy.yml` | n/a — grep check |
| CUTOVER-03 | npm run build still succeeds | smoke | `npm run build` | n/a — runtime |
| CUTOVER-04 | nightly.sh interprets exit codes correctly | smoke | dry-run: run nightly.sh against a sandbox bucket OR inspect that `set -euo pipefail` + `uv run python run.py` is preserved | ✅ nightly.sh exists |
| VALIDATE-02 | frontend smoke check post-cutover | manual | `npm run dev`, click through map/filters/table/species page | n/a — manual |
| VALIDATE-02 (assertive) | parquet schema matches sqlite.ts CREATE TABLE | automated | `uv run pytest data/tests/test_dbt_diff.py::test_occurrences_schema_matches` after cutover republishes public/data | ✅ test exists, was failing pre-cutover (33-col on disk), expected to PASS post-cutover |

### Sampling Rate

- **Per task commit:** `bash data/dbt/run.sh build` (runs in ~3 seconds; includes all dbt tests)
- **Per wave merge:** `bash data/dbt/run.sh build && cd data && uv run pytest data/tests/test_dbt_diff.py && cd .. && npm test`
- **Phase gate:** Full suite green + manual smoke check (VALIDATE-02) before `/gsd-verify-work`

### Wave 0 Gaps

None — all test infrastructure is already in place:
- ✅ `data/tests/test_dbt_diff.py` exists with 16 tests (15 PASS pre-cutover; 16/16 PASS expected post-cutover when `public/data/occurrences.parquet` is regenerated by dbt as 30-col)
- ✅ `data/dbt/tests/` has both singular tests (LIN-05 lineage coverage, ecdysis_id source reference)
- ✅ `data/dbt/models/*/schema.yml` defines generic tests on staging+intermediate+marts
- ✅ `package.json` test script exists (`vitest run`)
- ✅ `src/sqlite.ts` already declares 30-col schema (Phase 85 Plan 04) — frontend is ready

**No new test files required.** The Wave 0 status is "infrastructure complete from
predecessor phases; reuse as-is."

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | n/a — static site, no auth tier |
| V3 Session Management | no | n/a |
| V4 Access Control | no | n/a |
| V5 Input Validation | no | n/a for this phase — no new user input surface |
| V6 Cryptography | no | n/a |
| V14 Configuration | yes (light) | GitHub OIDC role unchanged (vars.AWS_DEPLOYER_ROLE_ARN); no new secrets introduced |

### Known Threat Patterns for {bash + AWS CLI + cron}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Stale build artifact uploaded to S3 (data-poisoning via failed but masked exit) | Tampering | `set -euo pipefail` in nightly.sh (already present line 6); subprocess.run(check=True) in run.py (Pattern 1) — propagate non-zero exit. |
| dbt build fails silently, S3 keeps old parquet, CloudFront serves it | Repudiation / Denial-of-Truth | Smoke check protocol §7 includes BOTH local and remote verification post-cutover. Future: Healthchecks.io dead-man's switch (out of scope; tracked in `.planning/todos/pending/nightly-run-failure-notification.md`). |
| Removing schema validation in CI exposes frontend to schema drift | Information Disclosure / Frontend Crash | dbt contract on `marts/occurrences` is enforced at build time. The S3 parquet cannot diverge from the contract because dbt build fails first and nightly.sh's `set -e` aborts before the upload step. |

No NEW threats introduced by this phase. The cutover removes ONE gate (validate-schema)
and CONFIRMS ONE STRONGER gate (dbt contract) is enforced upstream. Net security posture:
unchanged-to-slightly-improved.

## Project Constraints (from CLAUDE.md)

The following CLAUDE.md directives constrain this phase. The planner must verify
compliance.

- **Static hosting only — no server runtime.** Cutover does not add any server runtime;
  dbt-build runs locally on maderas (cron) or developer machines. CloudFront serves
  static parquet/JSON/GeoJSON. ✅ compliant.
- **Python 3.14+.** `run.py` already targets 3.14; the dbt wrapper isolates dbt's
  Python 3.13 via uvx (A1 fallback). ✅ compliant — do not regress.
- **AWS via CDK in `infra/`; deploy via GitHub OIDC.** Cutover does not touch CDK or
  IAM. ✅ compliant.
- **`speicmenLayer` typo in `bee-map.ts` intentionally deferred.** ✅ N/A — frontend
  unchanged in this phase.
- **`scripts/validate-schema.mjs` runs before every CI build as a parquet schema gate.**
  ❌ INTENTIONALLY VIOLATED by this phase. CUTOVER-03 retires this gate; dbt contract
  replaces it. The CLAUDE.md `## Known State` block should be updated as part of the
  cutover (delete the bullet referencing validate-schema.mjs).
- **ID format: `ecdysis:<integer>` and `inat:<integer>` are load-bearing.** ✅ N/A
  for this phase — ID prefixes are constructed in frontend code, not in parquet.

**Note for planner:** Add a small final task to update `CLAUDE.md` `## Known State`
to remove the validate-schema.mjs bullet and to add a "Phase 88: cutover complete,
dbt owns transforms" note.

## Sequencing & Risk

### Recommended Wave Shape (3 waves)

| Wave | Focus | Plans | Parallelizable? |
|------|-------|-------|-----------------|
| **Wave 0 (optional)** | Capture rollback marker | 088-00: `git rev-parse HEAD > .planning/phases/088-production-cutover/pre-cutover-sha.txt`; verify `bash data/dbt/run.sh build` exits 0 against S3-pulled DuckDB | n/a (1 plan) |
| **Wave 1** | CI / JS retirement (CUTOVER-03) | 088-01: Delete `scripts/validate-schema.mjs`, remove `validate-schema` from `package.json`, delete CI step in `.github/workflows/deploy.yml`. Verify `npm run build` succeeds locally. | Independent of Wave 2 — different surface area |
| **Wave 2** | run.py rewrite + export.py + _apply_migrations deletion (CUTOVER-01 + CUTOVER-02) | 088-02: Rewrite `data/run.py` per Pattern 1, add `_run_dbt_build`, delete `_apply_migrations`, delete `data/export.py`. Document migration → dbt mapping in plan SUMMARY. | Cannot parallelize with W1 ONLY if both touch a shared file — they don't. W1 and W2 ARE independent if the planner can avoid merge conflicts. |
| **Wave 3** | nightly.sh review + smoke check (CUTOVER-04 + VALIDATE-02) | 088-03: Read `nightly.sh`, confirm no edits needed, document the no-op decision. Manually run `npm run dev` against fresh dbt-produced `public/data/occurrences.parquet`; verify map/filters/table/species page work. Optionally trigger one manual nightly.sh run on maderas before re-enabling cron. | Depends on W2 (run.py must be in main before smoke check makes sense) |

### Highest-Risk Task

**Plan 088-02 (Wave 2): the `_apply_migrations()` deletion.** Two reasons:

1. **No build-time check.** Unlike `export.py` deletion (caught immediately if anything
   still imports it via `python -c 'from data.run import STEPS'`), the migrations are
   pure runtime side-effects. The risk is silent: the rename was applied years ago, so
   nothing notices the deletion EXCEPT a hypothetical future S3 restore from an ancient
   backup.
2. **No automated replacement test.** The migration → dbt mapping table (above) is the
   documentation, but there's no test that asserts "dbt's source declaration is sufficient
   to detect a missing renamed column." The protective check is implicit: dbt build
   fails at compile time with a binder error.

**Protective verification surrounding this task:**

1. Wave 0 plan runs `bash data/dbt/run.sh build` against the live S3-pulled DuckDB and
   confirms exit 0. This proves the migrations are not needed today.
2. Plan 088-02's verification step: run `bash data/dbt/run.sh build` AGAIN after the
   deletion. If it still exits 0, the deletion is provably safe.
3. The migration → dbt mapping table is documented in the plan SUMMARY for future
   archaeology.

### Risk Matrix

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Frontend breaks because `occurrences.parquet` schema diverges | HIGH | LOW | dbt contract enforced at every build; src/sqlite.ts already declares 30 cols (Phase 85); test_dbt_diff.py asserts schema parity |
| Nightly run fails silently | MEDIUM | LOW | `set -euo pipefail` in nightly.sh + `subprocess.run(check=True)` in run.py + dbt exit-code conformance; smoke check post-merge |
| Stale DuckDB on maderas needs migrations | LOW | NEGLIGIBLE | Wave 0 verification confirms current S3 DB doesn't need them; documented in CUTOVER-02 mapping |
| CI build chain regresses (eleventy etc.) after validate-schema removal | LOW | LOW | Plan 088-01 verifies `npm run build` locally before merge |
| CloudFront serves stale data during first post-cutover nightly | LOW | MEDIUM | nightly.sh step 4 + `aws cloudfront wait` already handles; smoke check protocol §7 includes remote verification |

## Sources

### Primary (HIGH confidence — verified in this research session)

- `data/run.py` — STEPS list, `_apply_migrations`, exit semantics
- `data/nightly.sh` — full read; `set -euo pipefail`, EXPORT_DIR, S3 upload, CloudFront
- `data/export.py` — full read; identifies what's being retired
- `data/species_export.py` — full read; DBT_SANDBOX_DIR vs. ASSETS_DIR contract
- `data/species_maps.py` lines 1-50, 180-230 — confirms ASSETS_DIR/species.parquet reader
- `data/feeds.py` lines 1-50 — confirms downstream-only, no export.py dependency
- `data/dbt/run.sh` — version pin, uvx wrapper
- `data/dbt/dbt_project.yml`, `profiles.yml` — full read
- `data/dbt/models/marts/{occurrences,species,counties_geo,ecoregions_geo}.sql` — all read
- `data/dbt/models/marts/schema.yml` — 30-col contract verified
- `data/dbt/models/intermediate/schema.yml`, `staging/schema.yml` — test inventory
- `data/dbt/tests/*` — both singular tests read
- `data/dbt/macros/emit_feature_collection.sql` — CLEAN-01 rationale
- `scripts/validate-schema.mjs` — full read; EXPECTED column lists
- `package.json` — full read; build chain
- `.github/workflows/deploy.yml` — full read; validate-schema step location
- `src/sqlite.ts` — full read; 30-col CREATE TABLE
- `.planning/phases/085-pre-cutover-groundwork/085-VERIFICATION.md` — phase status
- `.planning/phases/086-port-remaining-transforms/086-VERIFICATION.md` — phase status
- `.planning/phases/086-port-remaining-transforms/086-05-SUMMARY.md` — species_export.py state
- `.planning/phases/086-port-remaining-transforms/ingestion-boundary.md` — boundary doc
- `.planning/phases/087-incremental-materialization-experiment/087-FINDINGS.md` — incremental lock
- `data/tests/test_dbt_diff.py` lines 1-100 — diff harness shape

### Secondary (MEDIUM confidence — official docs)

- [dbt Exit Codes documentation](https://docs.getdbt.com/reference/exit-codes) — 0/1/2 semantics confirmed via WebFetch
- [dbt build command](https://docs.getdbt.com/docs/deploy/job-commands) — build runs models+tests+snapshots+seeds in DAG order
- [dbt --exclude with test_name selector](https://docs.getdbt.com/reference/node-selection/exclude) — test exclusion syntax (informational; not needed today)

### Tertiary (LOW confidence — none required this phase)

None. Every actionable claim in this research is verified by either a file read or
official dbt documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every dependency already in production use; no new libraries
- Architecture: HIGH — direct read of every file the cutover touches; current state fully mapped
- Pitfalls: HIGH — drawn from concrete code (subprocess, paths, dbt exit codes), not speculation
- Migration mapping: HIGH — both migrations traced to their dbt replacement / obviation
- Smoke check protocol: MEDIUM — manual UI check; relies on operator following steps
- Rollback plan: HIGH — single revert of the cutover commit; pre-cutover SHA tracked

**Research date:** 2026-05-13
**Valid until:** Phase 88 execution (no time-bound staleness; project state is local to repo)

## Smoke Check Protocol (§7 expanded for VALIDATE-02)

After Wave 2 (run.py rewrite) and Wave 3 (nightly.sh confirmation), execute the
following in order. Each step has an explicit pass/fail signature.

### 1. Local dbt build + pipeline run

```bash
# In repo root, against a recent S3-pulled DuckDB at data/beeatlas.duckdb
cd data && uv run python run.py
```

**Pass:** Exits 0. Final line `--- all pipelines complete in N.Ns ---`.
**Fail:** Non-zero exit, traceback printed. Common causes:
- `FileNotFoundError: bash data/dbt/run.sh` → cwd issue, use abspath (Pitfall 5)
- `CalledProcessError ... returncode=1` → dbt test failed; read stdout for which test
- `FileNotFoundError: target/sandbox/species.parquet` → dbt --select used (Pitfall 4)

### 2. dbt diff harness

```bash
cd data && uv run pytest data/tests/test_dbt_diff.py -v
```

**Pass:** 16/16 PASS (including `test_occurrences_schema_matches` which was pre-cutover
FAIL).
**Fail:** Any single test FAILED. Read the assertion message for which column or row
diverged.

### 3. Frontend dev server

```bash
npm run dev
# Browser opens at http://localhost:8080 (or the eleventy default)
```

**Pass behaviors (all four required):**

| UI surface | Expected | Fail signature |
|------------|----------|----------------|
| Map renders | OL canvas appears with WA outline, ~47,000 specimen markers visible | Blank map, console error `parquetReadObjects failed` or `column ecdysis_id not found` |
| Filters work | Toggle taxon / county / year filter; specimen count badge updates; map markers update | Filter button does nothing; count stays at full set; console error |
| Table populates | Click table mode toggle; drawer slides up with ~47k rows; row click pans map | Empty table; row count shows 0; console error from sqlite.ts INSERT |
| Species page | Navigate to `/species/`; click a species (e.g. Apis mellifera); seasonality chart + county map render | 404 on species.json or seasonality.json; chart renders blank |

### 4. Build succeeds

```bash
npm run build
```

**Pass:** Exits 0. `_site/` directory populated. No `validate-schema` step in output.
**Fail:** Any step fails (validate-species / typecheck / eleventy / validate-bundle-size).

### 5. (Optional, recommended) Manual nightly run on maderas

```bash
# On maderas, before re-enabling cron:
bash /path/to/data/nightly.sh
```

**Pass:** Exits 0. Final line `=== pipeline complete <timestamp> ===`. S3 has fresh
`data/occurrences.parquet` etc.
**Fail:** Non-zero exit. Trap fires; DuckDB backed up. Read stdout for which step failed.
Rollback = `git revert <cutover-merge-commit>` and let next nightly recover.

---

_Researched: 2026-05-13_
_Researcher: Claude (gsd-researcher)_
