# Phase 088: Production Cutover — Pattern Map

**Mapped:** 2026-05-13
**Files analyzed:** 8 (3 modified, 2 deleted, 1 read-only confirmation, 2 new docs)
**Analogs found:** 8 / 8

## File Classification

| File | Action | Role | Data Flow | Closest Analog | Match Quality |
|------|--------|------|-----------|----------------|---------------|
| `data/run.py` | modified | Python orchestrator (STEPS-list pipeline driver) | batch / transform-sequencing | itself (current shape) + `data/dbt/run.sh` (subprocess target) | exact (itself) |
| `data/export.py` | DELETED | Python SQL-transform script (DuckDB → parquet/GeoJSON) | batch / transform | itself (capture pre-deletion shape) | exact (itself) |
| `scripts/validate-schema.mjs` | DELETED | Node CI gate (parquet column schema check) | request-response (CI step) | itself | exact (itself) |
| `package.json` | modified | NPM script registry + build chain | config | itself | exact (itself) |
| `.github/workflows/deploy.yml` | modified | GitHub Actions CI/deploy workflow | config / pipeline | itself | exact (itself) |
| `data/nightly.sh` | read-only (confirm no-op) | bash cron driver | batch / pipeline | itself (verify shape) | exact (itself) |
| `.planning/phases/088-production-cutover/pre-cutover-sha.txt` | NEW | rollback marker (git SHA) | document / instrumentation | `.planning/phases/087-incremental-materialization-experiment/pre-experiment-sha.txt` | exact pattern |
| `.planning/phases/088-production-cutover/088-FINDINGS.md` (optional) | NEW | migration → dbt mapping doc | document | `.planning/phases/086-port-remaining-transforms/ingestion-boundary.md` + `087-FINDINGS.md` | role-match |

## Pattern Assignments

### `data/run.py` (modified) — Python orchestrator

**Current STEPS list** (lines 41-55): `("export", export_all)` slot is the swap target. Keep the surrounding shape (tuple list of `(str, Callable)`, iterated in `main()`).

**Current import block** (lines 25-37) — DELETE one import, KEEP the rest:

```python
from ecdysis_pipeline import load_ecdysis, load_links
from inaturalist_pipeline import load_observations as load_inaturalist_observations
from inaturalist_pipeline import enrich_taxon_lineage_extended
from waba_pipeline import load_observations as load_waba_observations
from projects_pipeline import load_projects
from anti_entropy_pipeline import run_anti_entropy
from checklist_pipeline import load_checklist
from resolve_taxon_ids import resolve_taxon_ids
from export import main as export_all                            # DELETE
from species_export import main as export_species_parquet        # KEEP (post-step)
from species_maps import main as generate_species_maps
from feeds import main as generate_feeds
```

**Migration deletion target** (lines 58-105 + the call at line 109): entire `_apply_migrations()` function and its invocation in `main()`. The function is two-branch defensive code for renames committed years ago; both branches are no-ops on today's S3 DuckDB (per RESEARCH §Migration → dbt Mapping).

**Main loop pattern to PRESERVE** (lines 108-122) — the per-step try/traceback/re-raise structure is exactly what propagates `CalledProcessError` from `_run_dbt_build`:

```python
def main() -> None:
    _apply_migrations()                          # DELETE this line
    overall_start = time.monotonic()
    for name, fn in STEPS:
        print(f"--- {name} ---")  # noqa: T201
        step_start = time.monotonic()
        try:
            fn()
        except Exception:
            traceback.print_exc()
            raise
        elapsed = time.monotonic() - step_start
        print(f"--- {name} done in {elapsed:.1f}s ---")  # noqa: T201
    total = time.monotonic() - overall_start
    print(f"--- all pipelines complete in {total:.1f}s ---")  # noqa: T201
```

**Subprocess pattern to introduce** — there are NO existing `subprocess.run` callers in `data/*.py` (verified via `grep -rn subprocess data/*.py` → zero hits). The new pattern is novel for this codebase; use the stdlib-canonical shape directly from RESEARCH Pattern 1 (Code Examples §run.py STEPS rewrite, lines 437-451 of 088-RESEARCH.md). Path-building convention matches existing `data/export.py:19-20` and `data/species_export.py:33-44`:

```python
# Mirrors data/species_export.py:33-44 path-resolution idiom (Path(__file__).parent + env override)
_DBT_SCRIPT = Path(__file__).parent / "dbt" / "run.sh"
_DBT_SANDBOX = Path(__file__).parent / "dbt" / "target" / "sandbox"
_EXPORT_DIR = Path(os.environ.get('EXPORT_DIR',
    str(Path(__file__).parent.parent / 'public' / 'data')))
```

**`check=True` choice rationale:** `CalledProcessError` already prints `Command '[...]' returned non-zero exit status N`, which the existing `main()` loop (line 116-118) catches as `Exception`, prints traceback, and re-raises. No bespoke error wrapping needed — the existing per-step error pattern is sufficient.

**Post-edit cleanup** (per RESEARCH Runtime State Inventory): `rm -rf data/__pycache__/` to clear stale `export.cpython-*.pyc`. One-line addition to the plan; not a code change.

---

### `data/export.py` (DELETED) — pre-deletion shape capture

**Header docstring** (lines 1-10) — confirms what dbt now owns:

```python
"""Export frontend assets from data/beeatlas.duckdb.

Produces three files in public/data/:
  - occurrences.parquet (full outer join of ecdysis specimens and iNat samples, with spatial columns)
  - counties.geojson    (WA county boundaries, simplified)
  - ecoregions.geojson  (WA ecoregion boundaries, simplified)
"""
```

All three artifacts are now produced by `data/dbt/target/sandbox/{occurrences.parquet,counties.geojson,ecoregions.geojson}` via the `marts/occurrences`, `marts/counties_geo`, `marts/ecoregions_geo` models (RESEARCH §Architectural Responsibility Map). The 331-line file is wholly replaced; no logic to preserve.

**EXPORT_DIR resolution idiom** (lines 18-20) — REUSE this verbatim in `data/run.py`'s new `_DBT_SANDBOX`/`_EXPORT_DIR` constants (see above):

```python
DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))
_default_assets = str(Path(__file__).parent.parent / 'public' / 'data')
ASSETS_DIR = Path(os.environ.get('EXPORT_DIR', _default_assets))
```

---

### `scripts/validate-schema.mjs` (DELETED) — pre-deletion shape capture

**File shape:** 122 lines. EXPECTED column lists for `occurrences.parquet` (30 cols, lines 23-41) and `species.parquet` (18 cols, lines 42-50) — exactly the contract that `data/dbt/models/marts/schema.yml` now enforces at `dbt build` time. RESEARCH §State of the Art confirms dbt contract is the strictly-stronger replacement.

**Call sites referenced** (the three coupled sites in RESEARCH Pattern 3):

```
package.json:20         "validate-schema": "node scripts/validate-schema.mjs",
package.json:25         "build": "npm run validate-schema && npm run validate-species && ..."
.github/workflows/deploy.yml:24-25   - name: Validate parquet schema / run: npm run validate-schema
```

**Cosmetic-only references** in sibling scripts (do NOT need updates for correctness, but flag in plan summary):

```
scripts/validate-species.mjs:9   comment: "validate-schema.mjs's CloudFront-fallback ..."
scripts/validate-bundle-size.mjs:9   comment: "Mirrors scripts/validate-schema.mjs idiom: ..."
```

---

### `package.json` (modified) — NPM script registry

**Current scripts block** (lines 17-29) — two coupled edits:

```json
  "scripts": {
    "dev": "eleventy --serve",
    "build:data": "cd data && uv run python run.py",
    "validate-schema": "node scripts/validate-schema.mjs",            // DELETE line 20
    "validate-species": "node scripts/validate-species.mjs",
    "validate-bundle-size": "node scripts/validate-bundle-size.mjs",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "build": "npm run validate-schema && npm run validate-species && npm run typecheck && eleventy && npm run validate-bundle-size",
    // line 25 above: REMOVE leading "npm run validate-schema && "
    "preview": "vite preview --outDir _site",
    "fetch-data": "bash scripts/fetch-data.sh",
    "measure-lcp": "bash scripts/measure-lcp.sh"
  },
```

**Post-edit `build` chain:** `"build": "npm run validate-species && npm run typecheck && eleventy && npm run validate-bundle-size"` (4 steps, was 5). Verified by RESEARCH Pattern 3.

---

### `.github/workflows/deploy.yml` (modified) — CI gate retirement

**Current build job step ordering** (lines 13-33) — DELETE one step (lines 24-25):

```yaml
      - uses: actions/checkout@v6

      - uses: actions/setup-node@v6
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Validate parquet schema      # DELETE this step (lines 24-25)
        run: npm run validate-schema

      - name: Run tests
        run: npm test

      - name: Build site
        run: npm run build
        env:
          VITE_MAPBOX_TOKEN: ${{ secrets.MAPBOX_TOKEN }}
```

**Decision NOT to add a dbt-build CI step:** RESEARCH Anti-Patterns §1 explicitly rejects a CI-side dbt-contract check. The contract is enforced at every nightly `dbt build`; a second CI gate duplicates work. Post-edit deploy.yml has zero dbt invocations — the gate moves entirely to maderas's nightly run.

---

### `data/nightly.sh` (read-only confirmation, likely no edits) — bash pipeline driver

**Currently 62 lines.** Key invariants the plan must verify, NOT change:

```bash
set -euo pipefail                                           # line 6   — propagates exits
trap '... aws s3 cp ... "$DB_PATH" ...' EXIT                # line 24  — DuckDB backup on exit
export DB_PATH EXPORT_DIR                                   # line 39  — env contract for run.py
cd "$SCRIPT_DIR"                                            # line 40  — sets cwd to data/
uv run python run.py                                        # line 41  — single Python entrypoint
for f in occurrences.parquet counties.geojson ecoregions.geojson; do
    aws ... s3 cp ... "$EXPORT_DIR/$f" "s3://$BUCKET/data/$f"
done                                                        # lines 47-49 — S3 upload contract
```

**Why no edits are needed (RESEARCH §nightly.sh):** The three files uploaded in lines 47-49 are exactly the three files `_run_dbt_build` will copy into `$EXPORT_DIR` after `dbt build` succeeds. `set -euo pipefail` already does the exit-code propagation. CUTOVER-04 success criterion is satisfied by read-and-confirm, plus a one-paragraph plan summary documenting the no-op decision.

---

### `.planning/phases/088-production-cutover/pre-cutover-sha.txt` (NEW) — rollback marker

**Analog:** `.planning/phases/087-incremental-materialization-experiment/pre-experiment-sha.txt` — 1-line file, one 40-char hex SHA, trailing newline.

**Exact shape to replicate:**

```
78de3f544115288e331f30d051b65837c34e5dca
```

(Phase 87's marker shown; Phase 88 captures its own pre-cutover `git rev-parse HEAD` value.)

**Creation idiom** (per RESEARCH Open Question 3 recommendation; plan should run this in Wave 0 or as the first task of Wave 1):

```bash
git rev-parse HEAD > .planning/phases/088-production-cutover/pre-cutover-sha.txt
```

**Rollback procedure** to document in plan summary: `git revert <cutover-merge-commit>` — single-commit revert, the marker file enables the "what was main before the cutover" archaeology if a manual reset is preferred.

---

### `.planning/phases/088-production-cutover/088-FINDINGS.md` (optional NEW doc) — migration → dbt mapping

**Analog 1 (frontmatter + sectioned recommendation):** `.planning/phases/087-incremental-materialization-experiment/087-FINDINGS.md` lines 1-7:

```yaml
---
phase: 087-incremental-materialization-experiment
verified: 2026-05-13T22:00:00Z
status: passed
score: 5/5
deferred: []
---
```

**Analog 2 (decision-record / boundary-doc shape):** `.planning/phases/086-port-remaining-transforms/ingestion-boundary.md` lines 1-6:

```yaml
---
phase: 086-port-remaining-transforms
requirements: [PORT-02, PORT-04]
decision: keep both Python ingestion scripts in place; consume their output via dbt source() declarations
decided: 2026-05-14
---
```

**Content to include** (verbatim copy from RESEARCH §Migration → dbt Replacement Mapping table satisfies CUTOVER-02 success criterion 2): the two-row mapping table covering Phase 48 (`inat_observation_id` → `host_observation_id`) and Phase 47 (`geom GEOMETRY` column on geographies). Both rows have explicit [VERIFIED] evidence pointers; the plan can paste the table without re-research.

**Recommended filename:** `088-FINDINGS.md` (matches Phase 87 convention) over `088-CUTOVER-LOG.md` — the former is the established phase-doc pattern.

---

## Shared Patterns

### Pattern: env-var override with sensible default for paths

**Source:** `data/export.py:18-20` and `data/species_export.py:33-44`
**Apply to:** `data/run.py`'s new `_EXPORT_DIR` and `_DBT_SANDBOX` constants

```python
DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))
_default_assets = str(Path(__file__).parent.parent / 'public' / 'data')
ASSETS_DIR = Path(os.environ.get('EXPORT_DIR', _default_assets))
```

Every Python script in `data/` that touches the on-disk artifact tree uses this exact idiom. The new `_run_dbt_build` should follow it for `_EXPORT_DIR`; `_DBT_SANDBOX` does NOT need env-var override (it tracks dbt's project structure, which the tests already pin via `SANDBOX = data/dbt/target/sandbox` per RESEARCH Pattern 2 Option A rationale §1).

### Pattern: per-step traceback + re-raise

**Source:** `data/run.py:111-118` (current main loop)
**Apply to:** No change — the new `("dbt-build", _run_dbt_build)` step inherits this handler automatically. `CalledProcessError` is an `Exception` subclass; the existing `except Exception` catches it, prints traceback, re-raises. No special-case handling needed.

### Pattern: phase-directory file conventions

**Source:** Phases 086 + 087 (PATTERNS.md, FINDINGS.md, SUMMARY.md, PLAN.md naming; YAML frontmatter on findings/boundary docs)
**Apply to:** `088-PATTERNS.md` (this file), `088-FINDINGS.md` (optional), per-plan `088-NN-PLAN.md` + `088-NN-SUMMARY.md` (planner output)

## No Analog Found

None. Every file in scope has either an exact self-analog (modifications/deletions) or a structural sibling in a prior phase directory (new docs). The one novel pattern (`subprocess.run` from a `data/*.py` script) is documented in RESEARCH §Code Examples with a verified stdlib-canonical shape.

## Metadata

**Analog search scope:**
- `data/*.py` — read `run.py`, `export.py`, `species_export.py` headers; grepped `subprocess`
- `scripts/*.mjs` — read `validate-schema.mjs`; grepped references in sibling scripts
- `.github/workflows/*.yml` — read `deploy.yml`
- `data/nightly.sh`, `data/dbt/run.sh` — read in full
- `.planning/phases/086-*/` and `.planning/phases/087-*/` — read FINDINGS, ingestion-boundary, pre-experiment-sha files for new-doc analogs
- `package.json` — full read

**Files scanned:** 11
**Pattern extraction date:** 2026-05-13
