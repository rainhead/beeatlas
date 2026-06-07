# Phase 142: Verify Budget, Green Suite & Nightly Wiring - Research

**Researched:** 2026-06-06
**Domain:** pytest configuration, bash scripting, git worktree, nightly pipeline integration
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01 — Hard gate, blocks publish:** In `nightly.sh`, a failing `@integration` test makes the run exit non-zero **before the S3 push**, so stale data stays live until fixed and the healthcheck ping is skipped.

**D-01a — Gate placement / sequencing:** The integration tier must run **after the dbt build produces fresh artifacts but before the export/publish + CloudFront invalidation**. When the gate runs pre-publish, "published" = last night's live S3 data — the correct regression-diff baseline. The EXIT-trap DuckDB/taxa backup must be preserved on failure.

**D-01b — Gate scope:** **All** `@integration` tests gate the publish — `test_dbt_diff`, the 50,646-row count assertion, the full `taxa.csv.gz` LCA, and the scaffold/export/higher-taxa dataset checks. Any single failure blocks the data refresh.

**D-02 — Committed reusable clean-checkout script:** Prove green-on-clean-checkout with a checked-in, repeatable script (fresh `git worktree` or clone with built assets stripped, no network, no AWS) that runs the fast suite and asserts green.

**D-03 — Pursue TFIXTURE-05 if over 5 min:** Measure the fast-suite wall-clock. If over 5 min, broaden the Phase-140 session/module-scoped fixture pattern to `test_inactive_remap.py`, `test_places_*`, `test_species_maps.py`, `test_higher_taxa.py` until under.

**D-03a — Measurement-host caveat:** TPERF-02's accept criterion measures on the **dev host**. Beware the maderas-orchestrator SIGKILL constraint on long Bash runs.

**D-04 — Default random seed, single run:** Prove green under one default `pytest-randomly` randomized run.

### Claude's Discretion

- D-02 mechanism: `git worktree` vs fresh clone, and the exact list of assets to strip.
- D-01a exact insertion point in `nightly.sh` and how to make the dbt sandbox + `public/data` baseline available pre-publish for `test_dbt_diff`.
- How much of the TFIXTURE-05 set to convert under D-03.
- BASELINE.md after-numbers presentation.

### Deferred Ideas (OUT OF SCOPE)

- **CI gate (TCI-01/02)** — Phase 143.
- **Remainder of TFIXTURE-05** not needed to cross the 5-min line.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TFIX-05 | Full fast suite green: 0 failures, 0 errors on clean checkout | Fast suite currently: 197 passed, 9 legitimate `@pytest.mark.skip` (retired reconcile() code), 0 failures, 16 seconds on maderas. TFIX-05 is satisfied *if* `pytest-randomly` is installed and the randomized run confirms no order-dependence. |
| TPERF-02 | Fast suite completes in < 5 minutes | Measured: 16 seconds on maderas (the dev/production host). Trivially satisfied. TFIXTURE-05 not needed. |
| TPERF-03 | Fast suite green on clean checkout (no dbt/target, no public/data, no raw/taxa.csv.gz, no beeatlas.duckdb) | Needs D-02 proof script. Current fast-tier runs confirm no asset-driven skips (D-05 guard active). |
| TTIER-03 | nightly.sh invokes the @integration tier and surfaces failures | The nightly script needs: (1) a pre-run S3 pull of published artifacts to `public/data/` for test_dbt_diff; (2) a `uv run pytest -m integration` invocation after `run.py` but before the upload block; (3) a non-zero exit on failure that prevents the S3 push. The integration tier also has two tests requiring fixes before success criterion 4 is achievable (see Pitfalls). |
</phase_requirements>

---

## Summary

Phases 139–141 successfully built the two-tier scaffold, distilled fixtures, and greened the formerly-red suite. Phase 142 is primarily a **verification and wiring** phase, but with two concrete implementation sub-tasks that emerged from the research:

**Budget:** The fast suite runs in approximately 16 seconds on maderas (the dev host, which is also the nightly cron host). TPERF-02 is already satisfied; TFIXTURE-05 is NOT needed. The `pytest-randomly` package must be added to `data/pyproject.toml` dev deps to satisfy D-04 (randomized-order proof).

**Nightly wiring (D-01a crux):** `nightly.sh` exports to `/tmp/beeatlas-export`; it does NOT write to `<repo_root>/public/data/`. The `test_dbt_diff.py` module hardcodes `PUBLIC = <repo_root>/public/data`, which is gitignored and absent in the nightly context. To make the diff tests assert (not skip) in nightly, the script must pull the currently-live S3 artifacts into `public/data/` **before** `run.py` runs, so the diff is "fresh sandbox vs last-night's-live data." The insertion point is: after S3 artifact pull (new step), then `run.py`, then `uv run pytest -m integration`, then the upload/invalidation block.

**Integration tier gap:** `test_at_least_13_fuzzy_candidates` currently fails with 0 candidates because the `checklist_resolver_db` fixture seeds only ~4 bridge entries while the test requires >=13 fuzzy matches against 178 unmatched names. This was left unfixed by Phase 141 (which only tagged the test `@integration`). Phase 142 must fix this for success criterion 4. The fix: seed the fixture's `canonical_to_taxon_id` table with a representatively-sized sample (e.g. ~50+ names from committed checklist data) to produce >=13 fuzzy hits at `score_cutoff=85`.

**Primary recommendation:** Wire nightly with a pre-run S3 pull of published artifacts, add `pytest-randomly` to dev deps, fix `test_at_least_13_fuzzy_candidates` fixture, and write the D-02 clean-checkout proof script using `git worktree`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Budget measurement (TPERF-02) | Dev host (maderas) | — | Test runs locally; no external dependency |
| Clean-checkout proof (TPERF-03) | Dev host — git worktree | CI (Phase 143) | Worktree strips untracked assets without a clone |
| Integration-tier nightly run (TTIER-03) | nightly.sh bash script | — | Single nightly entry point per CLAUDE.md |
| Artifact baseline pull (D-01a) | nightly.sh (new step) | — | Must happen before run.py to establish diff baseline |
| pytest-randomly randomization (D-04) | pyproject.toml dev deps | — | Plugin install, no code changes |
| Fuzzy-candidate fixture fix (TFIX-05 / SC-4) | data/tests/test_resolve_checklist_names.py | data/tests/conftest.py or fixtures | Fixture DB bridge seeding |

---

## Standard Stack

### Core (already in place)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pytest | 9.0.3 | Test runner | Installed, all tests use it |
| duckdb | >=1.4,<2 | In-test DuckDB for fixtures | Project standard |
| uv | 0.11.2 | Python dep management | Project standard |

### New Addition Required
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pytest-randomly | 4.1.0 | Randomize test order to detect order-dependence | Add to `[dependency-groups.dev]` in `data/pyproject.toml` for D-04 |

**Installation (data/pyproject.toml edit + uv sync):**
```toml
[dependency-groups]
dev = [
    "pytest>=9.0.2",
    "dbt-duckdb==1.10.1",
    "pytest-randomly>=4.1.0",
]
```
Then: `cd data && uv sync`

**Version verification:** [VERIFIED: PyPI] pytest-randomly 4.1.0 confirmed on PyPI (https://pypi.org/pypi/pytest-randomly/json), maintained by pytest-dev organization (github.com/pytest-dev/pytest-randomly).

---

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| pytest-randomly | PyPI | ~8 yrs | high | github.com/pytest-dev/pytest-randomly | N/A | Approved — pytest-dev org, well-established |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*slopcheck was not available at research time. pytest-randomly was verified via PyPI JSON API and confirmed as part of the official pytest-dev GitHub organization — treated as [VERIFIED] by provenance.*

---

## Architecture Patterns

### Artifact Flow in Nightly Context

```
nightly.sh
│
├─ git pull, npm ci, uv sync
│
├─ [NEW] Pull published artifacts from S3 → public/data/      ← D-01a baseline
│    (occurrences.parquet, species.parquet, counties.geojson,
│     ecoregions.geojson, species.json, seasonality.json
│     via manifest.json resolution)
│
├─ Pull DuckDB from S3 → /tmp/beeatlas.duckdb
├─ Pull taxa.csv.gz from S3 → data/raw/taxa.csv.gz
│
├─ uv run python run.py
│    └─ dbt-build step writes:
│         data/dbt/target/sandbox/*.parquet     ← SANDBOX in tests
│         /tmp/beeatlas-export/*.parquet        ← EXPORT_DIR in nightly
│
├─ [NEW] uv run pytest -m integration -x       ← D-01 gate
│    compares SANDBOX (fresh) vs public/data/ (prior S3 data)
│    exit non-zero on any failure → SKIP the publish
│
└─ Hash + upload EXPORT_DIR → S3 → CloudFront invalidate → healthcheck
   (skipped if integration gate failed)
```

### Artifact Path Resolution (Critical for D-01a)

**SANDBOX** (in `test_dbt_diff.py`, `test_dbt_scaffold.py`, `test_higher_taxa.py`):
```python
SANDBOX = Path(__file__).resolve().parent.parent / "dbt" / "target" / "sandbox"
```
Resolves to: `<repo_root>/data/dbt/target/sandbox/`
Populated by: `run.py`'s `dbt-build` step (via `bash data/dbt/run.sh build`).
Available at integration test time: **yes** — after `run.py`.

**PUBLIC** (in `test_dbt_diff.py`):
```python
PUBLIC = Path(__file__).resolve().parent.parent.parent / "public" / "data"
```
Resolves to: `<repo_root>/public/data/`
Populated by: **currently nothing in nightly** — gitignored, not written by `run.py` (which uses `EXPORT_DIR=/tmp/beeatlas-export`).
**Must be populated by a pre-run S3 pull** in `nightly.sh` for `test_dbt_diff` to assert (not skip).

**EXPORT_DIR** (in `test_species_maps.py` integration test):
```python
species_parquet = os.environ.get(
    'EXPORT_DIR',
    str(Path(__file__).parent.parent.parent / 'public' / 'data')
)
```
With `EXPORT_DIR=/tmp/beeatlas-export` set by `nightly.sh`, this test reads from `/tmp/beeatlas-export/species.parquet`. **Works in nightly without changes.**

**SPECIES_JSON** (in `test_species_export.py::test_taxon_id`):
```python
SPECIES_JSON = Path(__file__).resolve().parent.parent.parent / "public" / "data" / "species.json"
```
Hardcoded to `<repo_root>/public/data/species.json`. Guarded by `_SPECIES_JSON_GUARD` (skipif absent). **Will skip in nightly** unless `public/data/` is populated by the pre-run S3 pull. Since `species.json` is uploaded hashed to S3, the pre-run pull must also fetch it.

### D-01a Implementation: Pre-Run S3 Pull

Insert after the existing `taxa.csv.gz` pull and before `# 2. Run pipelines` in `nightly.sh`:

```bash
# 1c. Pull currently-live published artifacts to public/data/ so test_dbt_diff
# can compare fresh sandbox vs last-night's live data (regression baseline).
echo "--- pulling published artifacts for integration baseline ---"
_t0=$(date +%s)
_MANIFEST_TMP="$EXPORT_DIR/../beeatlas-manifest-prev.json"
mkdir -p "$REPO_ROOT/public/data"
if aws --profile "$AWS_PROFILE" s3 cp --no-progress \
    "s3://$BUCKET/data/manifest.json" "$_MANIFEST_TMP" 2>/dev/null; then
    for _key in occurrences species_file counties ecoregions checklist; do
        # Parse content-hashed filenames from manifest, pull to public/data/
        ...
    done
    # Also pull stable-name JSON files
    for _json in species.json seasonality.json; do
        _hashed=$(python3 -c "import json; d=json.load(open('$_MANIFEST_TMP')); ...")
        aws --profile "$AWS_PROFILE" s3 cp --no-progress \
            "s3://$BUCKET/data/$_hashed" "$REPO_ROOT/public/data/$_json" 2>/dev/null || true
    done
else
    echo "WARN: no manifest.json in S3 (first run) — test_dbt_diff will skip"
fi
echo "published artifact pull done in $(_elapsed $_t0)"
```

**Simpler approach** (avoids parsing the manifest in bash):
Use a small Python helper invoked via `uv run python3 -c "..."` or a committed `scripts/pull_prev_artifacts.py` that reads the manifest and pulls each file.

### D-01 Gate Insertion Point

In `nightly.sh`, between line 125 (`echo "--- pipelines done..."`) and line 135 (`echo "--- hashing and uploading exports ---"`):

```bash
# 2b. Run integration (dataset-validation) tier — hard gate before publish.
# A failing integration test blocks S3 publish; stale data stays live until fixed.
echo "--- running integration test gate ---"
_t0=$(date +%s)
cd "$SCRIPT_DIR"
if ! uv run pytest -m integration -x --tb=short; then
    echo "INTEGRATION GATE FAILED — aborting publish ($(_elapsed $_t0))"
    exit 1
fi
echo "integration gate passed in $(_elapsed $_t0)"
```

`set -euo pipefail` is active in `nightly.sh`, but an explicit `exit 1` is clearer than relying on `-e`. The `_SANDBOX_GUARD` skipif decorators on integration tests skip (not fail) when the sandbox is absent — this won't incorrectly pass since `run.py` populates the sandbox before this gate.

**EXIT trap preservation:** The existing EXIT trap (DuckDB + taxa.csv.gz backup to S3) fires on `exit 1` — it uses `|| true` for each S3 copy, so a failed trap doesn't mask the exit code. No changes needed to the trap.

### D-02 Clean-Checkout Script

**Mechanism choice:** `git worktree` over fresh clone — faster (no re-fetch, no uv re-download), and produces a clean tree without untracked gitignored files. Stripping the assets is deterministic.

**Script location:** `data/scripts/verify-clean-checkout.sh` (committed, reusable by Phase 143 CI)

```bash
#!/usr/bin/env bash
# Verify the fast test suite passes on a clean checkout (TPERF-03, D-02).
# Usage: bash data/scripts/verify-clean-checkout.sh
# No network access. No AWS. No built assets.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
WORKTREE="$(mktemp -d)"
trap 'git -C "$REPO_ROOT" worktree remove --force "$WORKTREE" 2>/dev/null; rm -rf "$WORKTREE"' EXIT

echo "=== clean-checkout fast-suite proof ==="
git -C "$REPO_ROOT" worktree add --detach "$WORKTREE" HEAD

# Strip built/un-checked-in assets to simulate clean checkout
rm -rf \
    "$WORKTREE/data/dbt/target" \
    "$WORKTREE/data/dbt/target/sandbox" \
    "$WORKTREE/public/data" \
    "$WORKTREE/data/raw/taxa.csv.gz" \
    "$WORKTREE/data/beeatlas.duckdb"

# Run fast suite — no network, no AWS, markers deselect @integration
cd "$WORKTREE/data"
uv sync --frozen
uv run pytest -m "not integration" -x --tb=short -q
echo "=== PASSED: fast suite green on clean checkout ==="
```

**Key points:**
- `--detach` avoids branch conflicts; cleanup via EXIT trap.
- `uv sync --frozen` uses the lockfile without network (uv caches packages locally).
- `rm -rf "$WORKTREE/data/dbt/target"` strips the entire target dir, not just sandbox.
- Phase 143 CI can source or call this script directly.

### D-04 pytest-randomly Integration

After adding `pytest-randomly` to dev deps and running `uv sync`:

```bash
cd data && uv run pytest -m "not integration" -p randomly -q
```

`pytest-randomly` randomizes test collection order on every run (seeded from current time by default). The seed is printed in the session header — capture it for the proof log. D-04 does NOT pin the seed (pinning masks order-dependence). A single passing run is sufficient.

**Note:** The Phase 141 D-08 fixture-ordering fix (`test_checklist_pipeline.py` — dropped `importlib.reload` in favour of save/restore) is the basis for confidence that randomized runs will pass. [ASSUMED] that D-08 was correctly implemented and the ordering hazard is closed.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| S3 manifest parsing in bash | bash JSON parser | `python3 -c "import json..."` or committed Python helper | Bash JSON parsing is fragile; Python is already available via `uv run python3` |
| Test ordering randomization | Custom shuffle logic | `pytest-randomly` | Standard pytest plugin, pytest-dev org |
| Git clean-state for testing | Manual file deletion + restore | `git worktree add --detach` | Atomic, no risk of losing working-tree changes |
| Integration test exit gating | Bash subprocess wrapper | `uv run pytest -m integration -x` + `if !` | pytest already returns non-zero on failure; `-x` stops at first failure |

---

## Runtime State Inventory

> This phase does not rename or migrate runtime state. Omitted per instructions.

---

## Common Pitfalls

### Pitfall 1: test_dbt_diff skips instead of asserts in nightly
**What goes wrong:** Without the pre-run S3 artifact pull, `public/data/occurrences.parquet` is absent. The `_SANDBOX_GUARD` decorator marks the diff tests `skipif(not sandbox_file.exists())`. With sandbox present (populated by `run.py`) but `public/data` absent, the tests **skip** — they don't fail. `set -euo pipefail` treats skips as success. The integration gate passes vacuously.
**Why it happens:** `nightly.sh` exports to `/tmp/beeatlas-export`, not `public/data/`. `public/data/` is gitignored and never written by the pipeline in nightly context.
**How to avoid:** Pull published artifacts to `public/data/` before `run.py` runs (new step 1c). On first-ever run, no manifest exists — warn and let diff tests skip gracefully (first-run exception).
**Warning signs:** Integration gate says "N passed, M skipped" with M > 0 on test_dbt_diff tests.

### Pitfall 2: test_at_least_13_fuzzy_candidates produces 0 candidates even on maderas
**What goes wrong:** The `checklist_resolver_db` fixture creates a fresh in-memory DuckDB and seeds only ~4 canonical names into `checklist_data.checklist_records_full` and ~19 rows into `inaturalist_data.canonical_to_taxon_id`. When `resolve_checklist_names(refresh=True)` runs, it reads only those 4 names (not the 178 from `checklist_unmatched.csv`) and finds 0 fuzzy matches against the tiny bridge.
**Root cause:** Phase 141 tagged the test `@integration` but left the fixture unchanged ("the >=13 threshold is correct for the full dataset"). The fixture bridge is too small to produce fuzzy hits.
**How to avoid:** Expand the `checklist_resolver_db` fixture to seed `checklist_data.checklist_records_full` with the real 178 unmatched names AND seed `canonical_to_taxon_id` with ~50+ realistic bee genus/species names (distilled from the committed checklist). OR change the test to load from the real `DB_PATH` when running in the integration tier.
**Simpler fix:** Seed the fixture's `checklist_data.checklist_records_full` from `checklist_unmatched.csv` (it's committed), and seed ~50 `canonical_to_taxon_id` entries from real checklist names — enough that `score_cutoff=85` will hit >=13 near-matches.
**Warning signs:** `resolve-checklist-names: N resolved, M unresolved, 0 fuzzy candidates` in test output.

### Pitfall 3: test_taxon_id (test_species_export) skips in nightly
**What goes wrong:** `test_taxon_id` hardcodes `SPECIES_JSON = <repo_root>/public/data/species.json`. In nightly, `run.py` writes `species.json` to `/tmp/beeatlas-export/`, not `public/data/`. The `_SPECIES_JSON_GUARD` causes the test to **skip** rather than fail.
**How to avoid:** The pre-run S3 pull (Pitfall 1 fix) also pulls `species.json` to `public/data/`. Since `species.json` gets refreshed on every nightly run (new hash), `test_taxon_id` now reads the PRIOR night's `species.json` — which is fine for a regression check. The fresh one is in `/tmp/beeatlas-export/` and will be published if the gate passes.

### Pitfall 4: D-02 worktree picks up cached .pyc or __pycache__
**What goes wrong:** `git worktree add` checks out tracked files only. Python `__pycache__/` directories are gitignored and NOT included in the worktree checkout. `uv sync --frozen` in the worktree installs packages in the worktree's `.venv` from the uv cache. No network needed.
**How to avoid:** No action needed — the worktree approach naturally excludes untracked files.

### Pitfall 5: SIGKILL on maderas for long Bash runs
**What goes wrong:** The maderas orchestrator SIGKILLs Bash commands that run too long. The fast suite at 16 seconds is safe. Integration tests that load 50k checklist rows (`test_checklist_pipeline @integration`) may take several minutes — these are fine in the integration tier but must not be measured as part of the fast suite.
**How to avoid:** Run the fast-suite timing proof with `uv run pytest -m "not integration" --tb=no -q` — 16 seconds, well within maderas limits. Don't attempt to time the full integration suite in a single timed invocation under the orchestrator.

### Pitfall 6: pytest-randomly seed printing vs determinism
**What goes wrong:** Adding `pytest-randomly` to `addopts` would randomize ALL test runs including CI, which is fine. BUT: if a team member adds `--randomly-seed=last` to debug, it pins the seed permanently. D-04 says "one default randomized run" — no seed pinning.
**How to avoid:** Do NOT add `--randomly-seed=N` to `pyproject.toml addopts`. Accept the random seed printed in the session header as evidence. For the proof log, record the seed shown in the output.

### Pitfall 7: nightly.sh -x flag vs full-gate semantics
**What goes wrong:** Using `-x` (stop at first failure) means only the first failing test is reported. D-01b says "any single failure blocks" which is satisfied by `-x`. But for diagnostics, a full `-m integration` run (no `-x`) is more informative.
**Tradeoff:** `-x` is faster and appropriate for the gate (fail fast). Add `--tb=short` so the failure reason appears in the nightly log.
**How to avoid:** Use `-x --tb=short` in nightly for the gate. Add a comment that dropping `-x` gives full failure inventory.

---

## Code Examples

### Nightly gate insertion (D-01)
```bash
# Source: data/nightly.sh (new block between lines 125 and 135)
# Insert AFTER "echo '--- pipelines done ...'" and BEFORE "echo '--- hashing and uploading exports ---'"

# 2b. Run integration (dataset-validation) gate — blocks publish on failure.
echo "--- integration test gate ---"
_t0=$(date +%s)
cd "$SCRIPT_DIR"
if ! uv run pytest -m integration -x --tb=short -q; then
    echo "INTEGRATION GATE FAILED in $(_elapsed $_t0) — aborting publish" >&2
    exit 1
fi
echo "integration gate passed in $(_elapsed $_t0)"
```

### S3 baseline pull (D-01a)
```bash
# Source: data/nightly.sh (new block after 1b taxa pull, before # 2. Run pipelines)

# 1c. Pull currently-live published artifacts to public/data/ for test_dbt_diff baseline.
echo "--- pulling published artifacts for integration baseline ---"
_t0=$(date +%s)
mkdir -p "$REPO_ROOT/public/data"
_PREV_MANIFEST="/tmp/beeatlas-prev-manifest.json"
if aws --profile "$AWS_PROFILE" s3 cp --no-progress \
    "s3://$BUCKET/data/manifest.json" "$_PREV_MANIFEST" 2>/dev/null; then
    uv run python3 -c "
import json, subprocess, sys
manifest = json.load(open('$_PREV_MANIFEST'))
bucket = '$BUCKET'
profile = '$AWS_PROFILE'
dest = '$REPO_ROOT/public/data'
# Pull hashed artifacts by their content-hashed S3 keys
pull = {
    'occurrences.parquet': manifest['occurrences'],
    'species.parquet': manifest.get('species'),  # may be absent in older manifests
    'counties.geojson': manifest['counties'],
    'ecoregions.geojson': manifest['ecoregions'],
}
# Also pull by stable JSON names
json_files = {
    'species.json': manifest['species'],
    'seasonality.json': manifest['seasonality'],
}
for local, hashed in {**pull, **json_files}.items():
    if not hashed:
        continue
    r = subprocess.run(
        ['aws', '--profile', profile, 's3', 'cp', '--no-progress',
         f's3://{bucket}/data/{hashed}', f'{dest}/{local}'],
        capture_output=True
    )
    if r.returncode != 0:
        print(f'WARN: could not pull {hashed} -> {local}', file=sys.stderr)
" 2>&1 || true
    echo "published artifact pull done in $(_elapsed $_t0)"
else
    echo "WARN: no manifest.json in S3 (first run) — test_dbt_diff will skip (not fail)"
fi
```

### pytest-randomly pyproject.toml addition
```toml
# Source: data/pyproject.toml [dependency-groups]
[dependency-groups]
dev = [
    "pytest>=9.0.2",
    "dbt-duckdb==1.10.1",
    "pytest-randomly>=4.1.0",
]
```

### test_at_least_13_fuzzy_candidates fixture fix (D-07 gap)
The fixture needs `checklist_data.checklist_records_full` populated from the real committed CSV:

```python
# In checklist_resolver_db fixture (data/tests/test_resolve_checklist_names.py)
# After creating the DB, add:
import csv
from pathlib import Path

unmatched_csv = Path(__file__).parent.parent / "checklist_unmatched.csv"
# Seed the full unmatched checklist names so resolve_checklist_names() sees 178 names
# ... (populate checklist_records_full from unmatched_csv)

# Also seed ~50 canonical_to_taxon_id entries from realistic bee names so
# rapidfuzz at score_cutoff=85 returns >=13 matches from the 178 unmatched.
```

Alternatively, the test can be rewritten to use `DB_PATH` env directly (pointing to real beeatlas.duckdb on maderas) rather than the fixture DB — but this loses isolation and requires the real DB to be present (not clean-checkout safe; acceptable for `@integration` tier).

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No integration tier | `@pytest.mark.integration` + `addopts = -m "not integration"` | Phase 139 | Fast suite deselects dataset-validation tests |
| Silent asset-driven skips | D-05 conftest guard converts to FAIL | Phase 141 | Skips in fast tier are now hard failures |
| test_dbt_diff as fast-tier skipif | Tagged `@integration`, module-level `pytestmark` | Phase 141 | Never runs in fast tier; nightly-only |
| Per-test DuckDB construction | Session-scoped `fixture_db` shared connection | Phase 140 | Dominant cost reduction for checklist/taxonomy |

---

## Open Questions (RESOLVED)

> All three resolved during planning — resolutions embedded in plan task actions (see inline RESOLVED notes below).

1. **test_at_least_13_fuzzy_candidates fixture strategy** — RESOLVED in 142-01 Task 2 (seed `checklist_records_full` from `checklist_unmatched.csv` + empirically-iterated `canonical_to_taxon_id` until ≥13 hits; `>=13` assertion preserved).
   - What we know: The test uses `checklist_resolver_db` which seeds ~4 names. With 178 unmatched names and a 919-entry real bridge, >= 13 fuzzy hits are plausible. The fixture bridge has ~19 entries.
   - What's unclear: Whether loading `checklist_unmatched.csv` into `checklist_data.checklist_records_full` (within the fixture) is sufficient — the module reads from the DB, not from the CSV directly. Also unclear: does the fixture DB need the real `canonical_to_taxon_id` rows, or would a ~50-row distilled sample of common bee genera produce enough fuzzy hits?
   - Recommendation: Distill a ~50-row `canonical_to_taxon_id` fixture from the committed checklist's genera/species, and seed `checklist_records_full` from `checklist_unmatched.csv`. This keeps the test isolated and deterministic. Verify the fuzzy match count empirically in Wave 0.

2. **test_dbt_diff schema mismatch on first nightly run after Phase 131 deploy** — RESOLVED in 142-02 Task 2 (expected first-run self-healing behavior documented in a comment block near the gate; success criterion 4 scoped to steady-state).
   - What we know: Local `public/data/occurrences.parquet` has 37 columns (pre-131 schema). The current sandbox has 33 columns. The diff test will fail when comparing the two — this is correct regression behavior.
   - What's unclear: Phase 142 success criterion 4 says "slow tier passes when run on maderas against real built data." If the currently-live S3 data has the old 37-col schema, test_dbt_diff WILL fail on the first nightly run. This is expected and intentional (schema change must be acknowledged).
   - Recommendation: Document this expectation in the plan. The FIRST successful post-Phase-142 nightly run will produce a new 33-col publish; the SECOND run will then compare 33 vs 33 and pass. Success criterion 4 applies to the steady-state (second+ run), not the initial deploy run.

3. **S3 manifest key mapping for species.parquet** — RESOLVED in 142-02 Task 1 (manifest `species` key = `species.json`, not `species.parquet`; documented in the A3 comment; species.parquet-dependent diff tests are allowed to skip in nightly, not treated as gate failures).
   - What we know: The manifest has keys `occurrences`, `species`, `counties`, `ecoregions`, `checklist`, `photos`, etc. The value for each key is the content-hashed filename (e.g. `occurrences-abc123.parquet`).
   - What's unclear: Does the manifest `species` key point to `species.parquet` or `species.json`? (Looking at nightly.sh: `species_name=$(_upload_hashed "$EXPORT_DIR/species.json" "species")` — the manifest `species` key is the hashed `species.json`, NOT `species.parquet`. The `species.parquet` is uploaded separately as a species-maps artifact or not uploaded at all by nightly.sh.)
   - Recommendation: Verify which hashed S3 key contains `species.parquet`. If it's not in the manifest, `test_species_export::test_species_parquet_row_count_matches` and related tests in `test_dbt_diff` will skip on missing `PUBLIC/species.parquet`. Plan should account for this — either pull species.parquet from S3 or accept those tests skip.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| uv | Python dep management | ✓ | 0.11.2 | — |
| Python 3.14 | Test suite | ✓ | 3.14.3 | — |
| pytest | Fast suite | ✓ | 9.0.3 | — |
| pytest-randomly | D-04 randomized proof | ✗ | — | Add to pyproject.toml dev deps |
| AWS CLI | Nightly S3 pull | ✓ | 2.34.63 | — |
| git (worktree) | D-02 clean-checkout script | ✓ | 2.43.0 | — |
| dbt-duckdb | Integration tests (via `bash data/dbt/run.sh build`) | ✓ | 1.10.1 (via uvx) | — |

**Missing dependencies with no fallback:**
- pytest-randomly (not blocking — install is a one-line pyproject.toml edit + `uv sync`)

**Missing dependencies with fallback:**
- None

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.0.3 |
| Config file | `data/pyproject.toml [tool.pytest.ini_options]` |
| Quick run command | `cd data && uv run pytest -m "not integration" -q` |
| Full suite command | `cd data && uv run pytest -m integration -q` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TFIX-05 | Fast suite: 0 failures, 0 errors | fast suite | `cd data && uv run pytest -m "not integration" -q` | ✅ 197 passing |
| TPERF-02 | Fast suite < 5 min | timed | `time (cd data && uv run pytest -m "not integration" -q)` | ✅ ~16s |
| TPERF-03 | Clean checkout green | D-02 script | `bash data/scripts/verify-clean-checkout.sh` | ❌ Wave 0 — script to create |
| TTIER-03 | nightly wires integration tier | manual nightly log | inspect nightly cron log after wiring | ❌ Wave 0 — nightly.sh edit |

### Sampling Rate
- **Per task commit:** `cd data && uv run pytest -m "not integration" -q`
- **Per wave merge:** Full fast suite + integration tier (subset: `pytest tests/test_dbt_scaffold.py tests/test_higher_taxa.py tests/test_species_maps.py tests/test_species_export.py -m integration`)
- **Phase gate:** Full integration tier green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `data/scripts/verify-clean-checkout.sh` — TPERF-03 clean-checkout proof script
- [ ] `data/pyproject.toml` — add `pytest-randomly>=4.1.0` to dev deps
- [ ] `data/nightly.sh` — wiring for D-01 and D-01a (integration gate + pre-run S3 pull)
- [ ] Fix `test_at_least_13_fuzzy_candidates` fixture — seed `canonical_to_taxon_id` bridge with enough entries to produce >=13 fuzzy hits

---

## Security Domain

This phase is bash scripting, pytest configuration, and fixture fixes. The only security-relevant surface is the nightly.sh S3 pull:
- AWS credentials are used via named profile (`--profile beeatlas`), not embedded credentials — this is the existing pattern and is correct.
- The pre-run `public/data/` pull writes to the repo checkout, which is on maderas's local filesystem (not served). No injection risk.
- `ASVS V5 Input Validation` applies minimally: the manifest JSON is parsed by Python (`json.load`) from trusted S3 — no untrusted input.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Phase 141 D-08 (fixture ordering hazard closed) is correctly implemented | Standard Stack / D-04 | A randomized pytest-randomly run could expose order-dependence; would require re-examining `test_checklist_pipeline.py` |
| A2 | `uv sync --frozen` in the worktree uses the local uv cache without network | D-02 clean-checkout | If uv cache is cold, clean-checkout test would require network (breaks TPERF-03 "no network" requirement) |
| A3 | The manifest `species` key maps to `species.json`, not `species.parquet` | D-01a / Open Questions | If species.parquet is not in the manifest, `test_dbt_diff` species parquet diff tests will skip in nightly |
| A4 | test_checklist_pipeline `@integration` tests (50k row load) complete within a reasonable time on maderas | TTIER-03 | If these take >30 min, the nightly pipeline impact is significant; BASELINE.md should record this |

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection of `data/nightly.sh` — artifact paths, pipeline sequence, EXIT trap
- Direct code inspection of `data/run.py` — STEPS list, `_run_dbt_build()`, SANDBOX path, EXPORT_DIR
- Direct code inspection of `data/tests/test_dbt_diff.py` — PUBLIC and SANDBOX path resolution
- Direct code inspection of `data/tests/test_resolve_checklist_names.py` — fixture bridge size, integration test behavior
- Direct code inspection of `data/tests/conftest.py` — D-05 guard implementation, session fixtures
- Direct code inspection of `data/pyproject.toml` — addopts, marker registration, dev deps
- Live test execution on maderas: fast suite 197 passed / 9 skipped / 16s; integration subset results
- PyPI JSON API for pytest-randomly (github.com/pytest-dev/pytest-randomly confirmed)

### Secondary (MEDIUM confidence)
- `.planning/phases/141-*/141-VERIFICATION.md` — TFIX-03 satisfaction rationale
- `.planning/phases/141-*/141-04-PLAN.md` — explicit fixture-unchanged decision for test_at_least_13_fuzzy_candidates
- `.planning/REQUIREMENTS.md` — TFIX-05, TPERF-02/03, TTIER-03 accept criteria

### Tertiary (LOW confidence)
- A3 assumption (manifest key mapping for species.parquet) — not verified against live S3 manifest

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — direct codebase verification
- Architecture: HIGH — nightly.sh flow verified line-by-line; artifact paths confirmed via test execution
- Pitfalls: HIGH — confirmed via live test runs (test_dbt_diff fails locally with stale public/data; test_at_least_13 fails with 0 candidates)
- Fixture fix approach: MEDIUM — the strategy is clear but the exact row counts needed for >=13 fuzzy hits require empirical verification in Wave 0

**Research date:** 2026-06-06
**Valid until:** 2026-07-06 (stable domain — pytest, bash, git worktree APIs are stable)
