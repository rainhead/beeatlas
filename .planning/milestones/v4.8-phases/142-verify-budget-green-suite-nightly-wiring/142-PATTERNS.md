# Phase 142: Verify Budget, Green Suite & Nightly Wiring - Pattern Map

**Mapped:** 2026-06-06
**Files analyzed:** 5 (2 create, 3 modify)
**Analogs found:** 5 / 5

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `data/nightly.sh` (MODIFY) | config/orchestration | batch | `data/nightly.sh` itself (existing S3-pull + run.py blocks) | exact (self-analog; copy internal block pattern) |
| `data/scripts/verify-clean-checkout.sh` (CREATE) | utility script | batch | `data/refresh-geo.sh` + `data/nightly.sh` | role-match |
| `data/pyproject.toml` (MODIFY) | config | — | `data/pyproject.toml` itself (existing `[dependency-groups]`) | exact (self-analog) |
| `data/tests/test_resolve_checklist_names.py` (MODIFY) | test / fixture | CRUD | `data/tests/conftest.py` (canonical_to_taxon_id seeding pattern) | exact |
| `data/tests/BASELINE.md` (MODIFY) | docs | — | `data/tests/BASELINE.md` itself (History table convention) | exact (self-analog) |

---

## Pattern Assignments

### `data/nightly.sh` — block 1c: pre-run S3 artifact pull (new)

**Analog:** `data/nightly.sh` lines 107–116 (existing 1b taxa.csv.gz pull block)

**Existing S3-pull pattern to copy** (`data/nightly.sh` lines 107–116):
```bash
# 1b. Pull taxa.csv.gz and ETag sidecar from S3 (missing on first run = not an error)
echo "--- pulling taxa.csv.gz from S3 ---"
mkdir -p "$SCRIPT_DIR/raw"
if ! aws --profile "$AWS_PROFILE" s3 cp --no-progress \
    "s3://$BUCKET/$TAXA_S3_KEY" "$TAXA_PATH" 2>/dev/null; then
    echo "No cached taxa.csv.gz in S3 (first run), will download from iNat."
fi
# Pull sidecar alongside archive so ETag conditional GET fires on next run
aws --profile "$AWS_PROFILE" s3 cp --no-progress \
    "s3://$BUCKET/$TAXA_CACHE_S3_KEY" "$TAXA_CACHE_PATH" 2>/dev/null || true
```

**Timing helper pattern** (lines 46–48, 55):
```bash
_ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }
_elapsed() { echo $(( $(date +%s) - $1 ))s; }
# ... then at start of each block:
_t0=$(date +%s)
# ... then at end:
echo "step done in $(_elapsed $_t0)"
```

**Insert point for block 1c:** After line 116 (end of `1b. Pull taxa.csv.gz` block), before line 118 (`# 2. Run pipelines`).

**Block 1c pattern** (new code to insert — modeled on 1b, uses `uv run python3 -c` for JSON parsing per RESEARCH.md "Don't Hand-Roll"):
```bash
# 1c. Pull currently-live published artifacts to public/data/ so test_dbt_diff
# can compare fresh sandbox vs last-night's live data (regression baseline).
echo "--- pulling published artifacts for integration baseline ---"
_t0=$(date +%s)
_PREV_MANIFEST="/tmp/beeatlas-prev-manifest.json"
mkdir -p "$REPO_ROOT/public/data"
if aws --profile "$AWS_PROFILE" s3 cp --no-progress \
    "s3://$BUCKET/data/manifest.json" "$_PREV_MANIFEST" 2>/dev/null; then
    uv run python3 -c "
import json, subprocess, sys
manifest = json.load(open('$_PREV_MANIFEST'))
bucket = '$BUCKET'
profile = '$AWS_PROFILE'
dest = '$REPO_ROOT/public/data'
pull = {
    'occurrences.parquet': manifest.get('occurrences'),
    'counties.geojson':    manifest.get('counties'),
    'ecoregions.geojson':  manifest.get('ecoregions'),
    'species.json':        manifest.get('species'),
    'seasonality.json':    manifest.get('seasonality'),
}
for local, hashed in pull.items():
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

---

### `data/nightly.sh` — block 2b: integration test gate (new)

**Analog:** `data/nightly.sh` lines 119–125 (existing `run.py` invocation block — same `cd "$SCRIPT_DIR"` + `uv run` + timing pattern)

**Existing pipelines block** (lines 118–125):
```bash
# 2. Run pipelines
echo "--- running pipelines ---"
_t0=$(date +%s)
mkdir -p "$EXPORT_DIR"
export DB_PATH EXPORT_DIR
cd "$SCRIPT_DIR"
uv run python run.py
echo "--- pipelines done in $(_elapsed $_t0) ---"
```

**Insert point for block 2b:** After line 125 (`echo "--- pipelines done..."`), before line 127 (`# 3. Hash artifacts...` / `echo "--- hashing and uploading exports ---"`).

**Block 2b pattern** (new code to insert):
```bash
# 2b. Run integration (dataset-validation) gate — hard gate before publish.
# A failing test blocks S3 publish; stale data stays live until fixed.
# Drop -x to get full failure inventory (at cost of slower abort).
echo "--- integration test gate ---"
_t0=$(date +%s)
cd "$SCRIPT_DIR"
if ! uv run pytest -m integration -x --tb=short -q; then
    echo "INTEGRATION GATE FAILED in $(_elapsed $_t0) — aborting publish" >&2
    exit 1
fi
echo "integration gate passed in $(_elapsed $_t0)"
```

**EXIT trap — no change needed** (lines 85–96): The existing trap uses `|| true` for each S3 copy, so it fires on `exit 1` without masking the exit code. Preserve exactly as-is.

---

### `data/scripts/verify-clean-checkout.sh` (CREATE)

**Analog 1:** `data/refresh-geo.sh` — same `set -euo pipefail`, `SCRIPT_DIR`/`REPO_ROOT` derivation, `uv run` invocation pattern (lines 1–17).

**Analog 2:** `data/nightly.sh` lines 27–33 — same PATH export, `SCRIPT_DIR`/`REPO_ROOT` pattern.

**Header + boilerplate pattern** (from `data/refresh-geo.sh` lines 1–17):
```bash
#!/usr/bin/env bash
# <one-line purpose>
#
# <paragraph description>
#
# Usage: bash data/scripts/verify-clean-checkout.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
```

**AWS PATH export pattern** (from `data/nightly.sh` line 30):
```bash
export PATH="$HOME/.local/bin:$PATH"
```

**Full script pattern** (new file — modeled on both analogs):
```bash
#!/usr/bin/env bash
# Verify the fast test suite passes on a clean checkout (TPERF-03, D-02).
#
# Creates a git worktree at HEAD, strips built/gitignored assets, runs
# `uv run pytest -m "not integration"`. No network. No AWS. No built assets.
# Phase 143 CI can call this script directly.
#
# Usage: bash data/scripts/verify-clean-checkout.sh
set -euo pipefail

export PATH="$HOME/.local/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
WORKTREE="$(mktemp -d)"

trap 'git -C "$REPO_ROOT" worktree remove --force "$WORKTREE" 2>/dev/null || true; rm -rf "$WORKTREE"' EXIT

echo "=== clean-checkout fast-suite proof (TPERF-03) ==="
git -C "$REPO_ROOT" worktree add --detach "$WORKTREE" HEAD

# Strip built/un-checked-in assets to simulate a clean checkout.
rm -rf \
    "$WORKTREE/data/dbt/target" \
    "$WORKTREE/public/data" \
    "$WORKTREE/data/raw/taxa.csv.gz" \
    "$WORKTREE/data/beeatlas.duckdb"

# Run fast suite — addopts in pyproject.toml deselects @integration by default.
cd "$WORKTREE/data"
uv sync --frozen
uv run pytest -x --tb=short -q
echo "=== PASSED: fast suite green on clean checkout ==="
```

---

### `data/pyproject.toml` — add pytest-randomly to dev deps (MODIFY)

**Analog:** `data/pyproject.toml` lines 19–23 (existing `[dependency-groups]` block — exact self-analog)

**Existing block** (lines 19–23):
```toml
[dependency-groups]
dev = [
    "pytest>=9.0.2",
    "dbt-duckdb==1.10.1",
]
```

**Modified block** (append one line, preserve version-pin style of `dbt-duckdb` for exact pins, `>=` for range pins):
```toml
[dependency-groups]
dev = [
    "pytest>=9.0.2",
    "dbt-duckdb==1.10.1",
    "pytest-randomly>=4.1.0",
]
```

Note: Do NOT add `--randomly-seed` to `[tool.pytest.ini_options] addopts` — that would pin the seed and mask order-dependence (RESEARCH Pitfall 6).

---

### `data/tests/test_resolve_checklist_names.py` — expand `checklist_resolver_db` fixture (MODIFY)

**Analog:** `data/tests/conftest.py` lines 443–468 — the `canonical_to_taxon_id` bulk INSERT pattern used for the LIN-05 fixture. Exactly the same table (`inaturalist_data.canonical_to_taxon_id`), same column set (`canonical_name, taxon_id, resolved_at, source`).

**Existing canonical_to_taxon_id seed pattern** (`data/tests/conftest.py` lines 443–468):
```python
con.execute("""
    INSERT INTO inaturalist_data.canonical_to_taxon_id
        (canonical_name, taxon_id, resolved_at, source) VALUES
        ('lasioglossum zonulum',  200001, current_timestamp, 'inat_species'),
        ('andrena fulva',         200002, current_timestamp, 'inat_species'),
        ('bombus melanopygus',    200003, current_timestamp, 'inat_species'),
        ...
""")
```

**checklist_unmatched.csv structure** (committed file, 178 data rows + header):
```
checklist_name,canonical_name,reason
Andrena evoluta,andrena evoluta,no occurrence row matches canonical_name
Andrena vierecki,andrena vierecki,no occurrence row matches canonical_name
...
```

**Fix location:** `data/tests/test_resolve_checklist_names.py`, `checklist_resolver_db` fixture (lines 65–145). Two additions needed after `con.close()` on line 143 but before `return`:

1. Re-open connection and populate `checklist_data.checklist_records_full` from `checklist_unmatched.csv` (the committed 178-row file) — this gives `resolve_checklist_names()` the full unmatched name set.

2. Seed `inaturalist_data.canonical_to_taxon_id` — but this table is NOT in the fixture DB (the fixture creates only `checklist_data` schema). The fixture must also create `inaturalist_data` schema + `canonical_to_taxon_id` table, then seed ~50 bee genus/species canonical names as the fuzzy bridge.

**Pattern for schema + table creation** (from `data/tests/conftest.py` lines 11–17, 146–153):
```python
con.execute("CREATE SCHEMA inaturalist_data")
con.execute("""
    CREATE TABLE inaturalist_data.canonical_to_taxon_id (
        canonical_name TEXT PRIMARY KEY,
        taxon_id INTEGER,
        resolved_at TIMESTAMP,
        source TEXT
    )
""")
```

**CSV-loading pattern for checklist_records_full** (use `read_csv` DuckDB native rather than Python csv module — consistent with how `load_checklist()` works in production):
```python
unmatched_csv = Path(__file__).parent.parent / "checklist_unmatched.csv"
con.execute(f"""
    INSERT INTO checklist_data.checklist_records_full (verbatim_name, canonical_name, coord_flag)
    SELECT checklist_name, canonical_name, 'valid'
    FROM read_csv('{unmatched_csv}', header=true)
""")
```

**Seed canonical_to_taxon_id with bee genera** (distilled from conftest.py genus names already present — these will produce fuzzy hits against the 178 unmatched names at score_cutoff=85):
```python
con.execute("""
    INSERT INTO inaturalist_data.canonical_to_taxon_id
        (canonical_name, taxon_id, resolved_at, source) VALUES
        ('andrena fulva',          1001, current_timestamp, 'inat_species'),
        ('andrena nigrospina',     1002, current_timestamp, 'inat_species'),
        ('andrena prunorum',       1003, current_timestamp, 'inat_species'),
        ('andrena evoluta',        1004, current_timestamp, 'inat_species'),
        ('andrena vierecki',       1005, current_timestamp, 'inat_species'),
        -- ... ~50 entries covering Andrena, Bombus, Osmia, Lasioglossum,
        -- Halictus, Megachile, Hylaeus, Ceratina, Xylocopa genera
        -- The exact list to be determined empirically in Wave 0
""")
```

**Key constraint:** The fixture currently closes the connection on line 143. All additions go BEFORE `con.close()` OR re-open with `duckdb.connect(db_path)` after. The existing pattern in conftest.py keeps everything in a single `con` session — follow that.

---

### `data/tests/BASELINE.md` — update after-numbers (MODIFY)

**Analog:** `data/tests/BASELINE.md` itself (lines 23–29 table format + lines 109–113 History table).

**Per-tier table to update** (lines 23–29 — replace ESTIMATES with measured actuals):
```markdown
| Tier | Estimated runtime | Notes |
|------|------------------|-------|
| **Build-time** (all tests minus integration-marked) | ~30–40 min | ... |
| **Nightly / integration** | ~5–10 min | ... |
```
Replace with two-column format showing before/after, measured wall-clock on maderas.

**History table pattern** (lines 109–113 — append one row):
```markdown
| Phase | Event | Date |
|-------|-------|------|
| 139 | Baseline established (estimates); two-tier marker scaffold created | 2026-06-05 |
| 142 | After-numbers measured; this doc updated with actual runtimes | (pending) |
```
The `(pending)` row was reserved by Phase 139. Replace with the actual date and measured numbers.

---

## Shared Patterns

### `set -euo pipefail` + SCRIPT_DIR/REPO_ROOT derivation
**Source:** `data/nightly.sh` lines 27–33; `data/refresh-geo.sh` lines 15–18
**Apply to:** `data/scripts/verify-clean-checkout.sh`
```bash
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"   # adjust depth for scripts/ subdir: "../.."
```

### Timing block pattern (`_t0` / `_elapsed`)
**Source:** `data/nightly.sh` lines 46–48, 55, 81
**Apply to:** Both new blocks in `data/nightly.sh`
```bash
_t0=$(date +%s)
# ... work ...
echo "step description done in $(_elapsed $_t0)"
```

### Graceful S3 miss (`2>/dev/null` + `|| true`)
**Source:** `data/nightly.sh` lines 101–104, 110–112, 116
**Apply to:** New block 1c in `data/nightly.sh` — manifest pull uses `2>/dev/null` on the outer `aws s3 cp`, inner per-file pulls use `|| true` on subprocess.run errors
```bash
if ! aws --profile "$AWS_PROFILE" s3 cp --no-progress \
    "s3://$BUCKET/..." "$dest" 2>/dev/null; then
    echo "WARN: ... (first run)"
fi
```

### DuckDB fixture: schema + bulk INSERT in single connection
**Source:** `data/tests/conftest.py` lines 11–554 — single `con` from `duckdb.connect(db_path)`, sequential `CREATE SCHEMA`, `CREATE TABLE`, `INSERT` calls, `con.close()` at end
**Apply to:** `checklist_resolver_db` fixture additions in `test_resolve_checklist_names.py`

---

## No Analog Found

All files have close analogs. No entries.

---

## Metadata

**Analog search scope:** `data/nightly.sh`, `data/refresh-geo.sh`, `scripts/fetch-data.sh`, `data/tests/conftest.py`, `data/tests/test_resolve_checklist_names.py`, `data/pyproject.toml`, `data/tests/BASELINE.md`
**Files scanned:** 7 source files
**Pattern extraction date:** 2026-06-06
