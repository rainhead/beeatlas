# Phase 9: Pipeline Implementation - Research

**Researched:** 2026-03-10
**Domain:** Python iNaturalist pipeline — fetch, S3 cache, incremental updates, npm script integration
**Confidence:** HIGH — all critical unknowns resolved in Phase 8; architecture and tooling verified via direct codebase inspection

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INAT-01 | Pipeline queries iNaturalist API for all Washington Bee Atlas project (id=166376) observations | `pyinaturalist.get_observations(project_id=166376, page='all')` confirmed; field_id constants in `data/inat/observations.py` |
| INAT-02 | Pipeline extracts observer, date, coordinates, and specimen count observation field from each iNat observation | `extract_specimen_count()` in `data/inat/observations.py`; `field_id=8338`; `ofvs` in default v1 response |
| CACHE-01 | Pipeline restores `samples.parquet` + `last_fetch.txt` from S3 cache prefix at build start; falls back to full fetch on cache miss | `aws s3 cp` via system AWS CLI; S3_BUCKET_NAME with `cache/` prefix confirmed accessible; graceful miss pattern documented |
| CACHE-02 | Pipeline fetches only observations updated since `last_fetch.txt` timestamp; merges delta into restored parquet; falls back to full fetch when cache is absent or corrupt | `pyinaturalist.get_observations(updated_since=...)` confirmed in pyinaturalist constants; pandas merge-on-index pattern |
| CACHE-03 | Pipeline uploads updated `samples.parquet` + `last_fetch.txt` back to S3 cache prefix after successful fetch | `aws s3 cp` pattern; write timestamp then upload both files |
| INFRA-05 | Cache restore, iNat fetch, and cache upload exposed as top-level `package.json` scripts; CI calls these scripts | `npm run cache-restore`, `npm run fetch-inat`, `npm run cache-upload` calling into `data/` via `uv run` |
</phase_requirements>

---

## Summary

Phase 9 implements the full iNat pipeline: `data/inat/download.py`, S3 cache scripts, and npm script wiring. All critical blockers were resolved in Phase 8 — field constants and ofvs behavior are confirmed and committed. The only new technical domain is the S3 incremental cache pattern (CACHE-01/02/03) and the npm script integration (INFRA-05).

The S3 cache uses the AWS CLI (`aws s3 cp`) already available in the CI environment (configured via OIDC in the build job as of Phase 8). No new Python dependencies are needed — boto3 is not in `data/pyproject.toml` and the AWS CLI is the right tool for two-file cache operations. The incremental fetch uses pyinaturalist's `updated_since` parameter (confirmed in the installed pyinaturalist 0.21.1 source), which filters to observations updated after the timestamp in `last_fetch.txt`. The delta is merged into the restored Parquet using pandas `pd.concat` + `drop_duplicates(subset=['observation_id'], keep='last')`.

The build script `scripts/build-data.sh` needs three new npm scripts added to `package.json`: `cache-restore`, `fetch-inat`, `cache-upload`. The CI workflow calls these in sequence. `build-data.sh` is the implementation vehicle — the npm scripts are thin wrappers.

**Primary recommendation:** Write `data/inat/download.py` as a standalone Python script that accepts `--full` / `--incremental` flags (or auto-detects from presence of `last_fetch.txt`). Expose the three cache operations plus fetch as separate npm scripts. Each script is a `uv run python` call into `data/`.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `pyinaturalist` | 0.21.1 (locked) | iNat API — `get_observations(project_id=..., page='all', updated_since=...)` | Already in deps; handles pagination and rate limiting; `updated_since` confirmed in source |
| `pandas` | >=3.0.0 | DataFrame construction, merge/dedup, Parquet read/write | Already in pipeline; matches ecdysis schema patterns |
| `pyarrow` | >=22.0.0 | Parquet engine | Already in pipeline |
| `aws` CLI | System (2.34.4 on macOS; latest in CI ubuntu) | `aws s3 cp` for cache restore/upload | Already used in deploy job for `aws s3 sync`; credentials injected via OIDC (done in Phase 8) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pathlib.Path` | stdlib | File path handling | Throughout `download.py` |
| `datetime` | stdlib | Timestamp writing for `last_fetch.txt` | Write ISO 8601 UTC timestamp after fetch |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `aws s3 cp` (CLI) | `boto3` (Python) | boto3 requires adding to pyproject.toml; AWS CLI is already in CI and matches how deploy job works. Two-file ops don't justify Python SDK overhead. |
| `pd.concat` + `drop_duplicates` | `upsert` via DuckDB | DuckDB is in deps but pandas is already loaded; simple concat/dedup is ~5 lines and more readable. |
| Auto-detect incremental from `last_fetch.txt` | `--full` flag | Auto-detect is simpler for CI; no argument passing needed in npm scripts. |

**Installation:** No new packages needed. All required libraries already in `data/pyproject.toml`.

---

## Architecture Patterns

### Recommended Project Structure

```
data/
├── inat/
│   ├── __init__.py          # empty
│   ├── observations.py      # DONE: field constants + extract_specimen_count()
│   ├── projects.py          # DONE: atlas_projects = {"wa": 166376}
│   └── download.py          # NEW: main pipeline script (Phase 9 core deliverable)
├── scripts/
│   ├── cache_restore.sh     # NEW: aws s3 cp cache/ files locally
│   └── cache_upload.sh      # NEW: aws s3 cp local files to cache/
scripts/
└── build-data.sh            # EXISTING: add iNat steps
package.json                 # EXISTING: add cache-restore, fetch-inat, cache-upload scripts
frontend/
└── src/assets/
    └── samples.parquet      # NEW STUB: empty parquet, correct schema (Phase 9 prerequisite)
```

### Pattern 1: iNat Download Script with Auto-Incremental

**What:** `data/inat/download.py` auto-detects whether to do a full or incremental fetch based on whether `data/samples.parquet` and `data/last_fetch.txt` exist. When both exist, passes `updated_since=<timestamp>` and merges into restored parquet. When absent, does a full fetch.

**When to use:** Always — incremental is the default; full fetch is the fallback.

**Example:**
```python
# Source: pyinaturalist 0.21.1 (confirmed in data/.venv/lib/python3.14/site-packages/pyinaturalist/constants.py)
from pyinaturalist import get_observations
import pandas as pd
from pathlib import Path
from datetime import datetime, timezone
from inat.observations import extract_specimen_count
from inat.projects import atlas_projects

SAMPLES_PATH = Path("samples.parquet")
LAST_FETCH_PATH = Path("last_fetch.txt")
PROJECT_ID = atlas_projects["wa"]  # 166376

def fetch_all() -> list[dict]:
    """Full fetch — all WA Bee Atlas observations."""
    return get_observations(
        project_id=PROJECT_ID,
        page="all",
        per_page=200,
        order_by="id",
        order="asc",
    )

def fetch_since(timestamp: str) -> list[dict]:
    """Incremental fetch — observations updated since timestamp."""
    return get_observations(
        project_id=PROJECT_ID,
        page="all",
        per_page=200,
        updated_since=timestamp,
    )

def obs_to_row(obs: dict) -> dict:
    """Extract required fields from a raw pyinaturalist result dict."""
    coords = obs.get("geojson", {}).get("coordinates")  # [lon, lat] in v1
    return {
        "observation_id": obs["id"],
        "observer": obs.get("user", {}).get("login"),
        "date": obs.get("observed_on"),
        "lat": coords[1] if coords else None,
        "lon": coords[0] if coords else None,
        "specimen_count": extract_specimen_count(obs.get("ofvs", [])),
    }

def build_dataframe(results: list[dict]) -> pd.DataFrame:
    rows = [obs_to_row(r) for r in results]
    df = pd.DataFrame(rows)
    df["observation_id"] = df["observation_id"].astype("int64")
    df["observer"] = df["observer"].astype(pd.StringDtype())
    df["date"] = df["date"].astype(pd.StringDtype())
    df["lat"] = df["lat"].astype("float64")
    df["lon"] = df["lon"].astype("float64")
    df["specimen_count"] = df["specimen_count"].astype("Int64")
    return df

def main():
    can_incremental = SAMPLES_PATH.exists() and LAST_FETCH_PATH.exists()

    if can_incremental:
        timestamp = LAST_FETCH_PATH.read_text().strip()
        print(f"Incremental fetch since {timestamp}...")
        try:
            delta_results = fetch_since(timestamp)
            existing = pd.read_parquet(SAMPLES_PATH)
            delta = build_dataframe(delta_results)
            merged = (
                pd.concat([existing, delta])
                .drop_duplicates(subset=["observation_id"], keep="last")
                .reset_index(drop=True)
            )
        except Exception as e:
            print(f"Incremental fetch failed ({e}), falling back to full fetch...")
            can_incremental = False

    if not can_incremental:
        print("Full fetch...")
        results = fetch_all()
        merged = build_dataframe(results)

    total = len(merged)
    null_rate = merged["specimen_count"].isna().mean()
    pages = (total + 199) // 200
    print(f"Observations: {total}, pages: ~{pages}, specimen_count null rate: {null_rate:.1%}")

    merged.to_parquet(SAMPLES_PATH, engine="pyarrow", index=False, compression="snappy")

    now = datetime.now(timezone.utc).isoformat()
    LAST_FETCH_PATH.write_text(now + "\n")
    print(f"Wrote {SAMPLES_PATH} and last_fetch.txt ({now})")

if __name__ == "__main__":
    main()
```

**Critical note:** pyinaturalist `get_observations()` returns raw result dicts (not Observation model objects) when iterating the paginated response. The raw dict has `geojson.coordinates` as `[lon, lat]` (GeoJSON order — longitude first) for iNat v1. Confirmed in Phase 8 live API inspection.

### Pattern 2: S3 Cache Restore / Upload via AWS CLI

**What:** Two shell scripts (or inline in npm scripts) use `aws s3 cp` to move `samples.parquet` and `last_fetch.txt` to/from `s3://$S3_BUCKET_NAME/cache/`.

**When to use:** Before fetch (restore) and after successful fetch (upload).

**Example cache restore script:**
```bash
#!/usr/bin/env bash
# scripts/cache_restore.sh
set -euo pipefail
BUCKET="${S3_BUCKET_NAME:?S3_BUCKET_NAME not set}"
CACHE_DIR="$(cd "$(dirname "$0")/.." && pwd)/data"

echo "--- Restoring S3 cache ---"
aws s3 cp "s3://$BUCKET/cache/samples.parquet" "$CACHE_DIR/samples.parquet" 2>/dev/null \
  && echo "samples.parquet restored" \
  || echo "samples.parquet not in cache (full fetch will run)"

aws s3 cp "s3://$BUCKET/cache/last_fetch.txt" "$CACHE_DIR/last_fetch.txt" 2>/dev/null \
  && echo "last_fetch.txt restored" \
  || echo "last_fetch.txt not in cache"
```

**Example cache upload script:**
```bash
#!/usr/bin/env bash
# scripts/cache_upload.sh
set -euo pipefail
BUCKET="${S3_BUCKET_NAME:?S3_BUCKET_NAME not set}"
CACHE_DIR="$(cd "$(dirname "$0")/.." && pwd)/data"

echo "--- Uploading to S3 cache ---"
aws s3 cp "$CACHE_DIR/samples.parquet" "s3://$BUCKET/cache/samples.parquet"
aws s3 cp "$CACHE_DIR/last_fetch.txt" "s3://$BUCKET/cache/last_fetch.txt"
echo "Cache uploaded."
```

**Key constraint:** Cache restore must NOT fail the build on cache miss — use `|| echo "..."` to swallow `aws s3 cp` non-zero exit when file doesn't exist. `set -euo pipefail` applies to the outer script; swallow individual command failures with `|| true` or the `|| echo` pattern.

### Pattern 3: npm Script Wiring (INFRA-05)

**What:** Three new top-level npm scripts in `package.json` that wrap the data pipeline operations. CI calls these in sequence; local dev can call them individually.

**When to use:** All CI orchestration goes through npm scripts — no encoding operations directly in the workflow YAML.

**Example package.json additions:**
```json
{
  "scripts": {
    "cache-restore": "bash scripts/cache_restore.sh",
    "fetch-inat": "cd data && uv run python inat/download.py",
    "cache-upload": "bash scripts/cache_upload.sh",
    "build:data": "npm run cache-restore && npm run fetch-inat && npm run cache-upload && bash scripts/build-data.sh",
    "build": "npm run build:data && npm run build --workspace=frontend"
  }
}
```

**Alternatively**, if `build:data` should stay as the single entrypoint for CI:
- Update `build:data` to call `cache-restore && fetch-inat && cache-upload` inline, OR
- Keep `build:data` calling `build-data.sh` and add the cache/fetch steps inside `build-data.sh`

**CRITICAL — must_have from requirements:** The three scripts `cache-restore`, `fetch-inat`, `cache-upload` MUST be individually runnable as `npm run X`. The planner must ensure each is a top-level npm script, not buried inside `build-data.sh` only.

### Pattern 4: Committed samples.parquet Stub

**What:** A minimal valid Parquet file (zero or one row, correct schema) committed to `frontend/src/assets/samples.parquet` before the feature branch CI runs the live fetch.

**When to create:** First task in Phase 9 wave 1 — before any pipeline code is written.

**Why:** The `npm run build --workspace=frontend` Vite build will fail if `frontend/src/assets/samples.parquet` doesn't exist. The feature branch will fail CI on every push until the stub is committed.

**How to create:**
```python
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

schema = pa.schema([
    pa.field("observation_id", pa.int64()),
    pa.field("observer", pa.large_string()),
    pa.field("date", pa.large_string()),
    pa.field("lat", pa.float64()),
    pa.field("lon", pa.float64()),
    pa.field("specimen_count", pa.int64()),  # nullable via null values
])
table = pa.table({
    "observation_id": pa.array([], type=pa.int64()),
    "observer": pa.array([], type=pa.large_string()),
    "date": pa.array([], type=pa.large_string()),
    "lat": pa.array([], type=pa.float64()),
    "lon": pa.array([], type=pa.float64()),
    "specimen_count": pa.array([], type=pa.int64()),
}, schema=schema)
pq.write_table(table, "frontend/src/assets/samples.parquet")
```

Or more simply using pandas:
```python
import pandas as pd
df = pd.DataFrame({
    "observation_id": pd.array([], dtype="int64"),
    "observer": pd.array([], dtype=pd.StringDtype()),
    "date": pd.array([], dtype=pd.StringDtype()),
    "lat": pd.array([], dtype="float64"),
    "lon": pd.array([], dtype="float64"),
    "specimen_count": pd.array([], dtype="Int64"),
})
df.to_parquet("frontend/src/assets/samples.parquet", engine="pyarrow", index=False)
```

**Note:** `Int64` nullable in pandas writes as nullable int64 in Parquet. The schema requirement says `specimen_count` is `Int64 nullable` — use pandas `Int64` dtype (capital I), not numpy `int64`.

### Anti-Patterns to Avoid

- **`aws s3 cp` without `|| true` in restore:** The restore script must not fail when cache files don't exist. An unconditional `set -e` + `aws s3 cp` will exit 1 on cache miss, breaking CI builds on the first run or after cache eviction.
- **Writing `last_fetch.txt` before the fetch succeeds:** If `download.py` crashes mid-fetch, `last_fetch.txt` must not be updated — or the next run will incorrectly do an incremental fetch from a timestamp when data is incomplete. Write `last_fetch.txt` only after `merged.to_parquet()` completes without error.
- **Using `page='all'` for incremental fetch without `updated_since`:** Without `updated_since`, a second run re-fetches everything. Confirm `updated_since` parameter name in pyinaturalist — it's confirmed in `pyinaturalist/constants.py` in the installed 0.21.1 package.
- **Hardcoding `S3_BUCKET_NAME`:** Use `os.environ["S3_BUCKET_NAME"]` or `${S3_BUCKET_NAME}` in shell — never hardcode. The variable is set in GitHub Actions as a `vars.*` context variable.
- **Running `download.py` from the repo root:** The script uses relative paths (`samples.parquet`, `last_fetch.txt`). It must be run from `data/` — match the existing pattern where `build-data.sh` does `cd "$REPO_ROOT/data"` first.
- **Merging on wrong key:** Use `drop_duplicates(subset=["observation_id"], keep="last")` — not `keep="first"`. The delta (newer data) must win over the restored cache.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| API pagination | Custom `while page < N` loop | `pyinaturalist.get_observations(page='all')` | Uses `IDRangePaginator` with `id_above` cursor internally; safe past 10k |
| Rate limiting | `time.sleep()` between requests | pyinaturalist built-in (`pyrate-limiter`) | Already handles 100 req/min; no manual sleep needed |
| S3 file transfer | boto3 session management | `aws s3 cp` CLI | Two files only; CLI is already used in deploy; OIDC credentials are env vars |
| Upsert/dedup | Custom merge logic | `pd.concat` + `drop_duplicates(subset=[...], keep='last')` | Standard pandas pattern; ~3 lines |
| Timestamp parsing | Custom datetime parser | `datetime.fromisoformat()` or pass string directly to `updated_since` | pyinaturalist accepts ISO 8601 strings for `updated_since` |

---

## Common Pitfalls

### Pitfall 1: Cache Restore Fails Silently (Wrong Error Handling)

**What goes wrong:** `aws s3 cp s3://bucket/cache/samples.parquet ./samples.parquet` returns exit code 1 when the file doesn't exist. With `set -euo pipefail`, this terminates the restore script and propagates a build failure.

**Why it happens:** First CI run after a cache prefix is empty (never uploaded); also after cache eviction or bucket prefix reset.

**How to avoid:** Use `|| true` or `|| echo "cache miss"` after each `aws s3 cp` in the restore script. The restore script's job is to populate local files if they exist — a miss is not an error.

**Warning signs:** CI build fails at cache-restore step with "An error occurred (404)" or "NoSuchKey" from AWS CLI.

### Pitfall 2: GeoJSON Coordinate Order (lon/lat, not lat/lon)

**What goes wrong:** `observation['geojson']['coordinates']` in iNat API v1 is `[longitude, latitude]` (GeoJSON standard). Assigning `lat = coords[0]` and `lon = coords[1]` transposes coordinates — observations appear in the wrong hemisphere.

**Why it happens:** GeoJSON is `[lon, lat]` but many APIs use `[lat, lon]`. Phase 8 research notes "coordinate order also differs" between v1 and v2.

**How to avoid:** Use `lat = coords[1]`, `lon = coords[0]` explicitly. Add a comment.

**Warning signs:** Observations appear in the wrong location when rendered; `lat` values outside [-90, 90] range.

### Pitfall 3: pyinaturalist Returns Model Objects, Not Raw Dicts

**What goes wrong:** `get_observations()` returns `Observation` model objects when called with default settings. Accessing `obs.get("geojson")` fails because `Observation` objects don't have `.get()`.

**Why it happens:** pyinaturalist wraps API responses in model objects for most use cases.

**How to avoid:** Two options: (a) call `obs.to_dict()` to get the raw dict, then extract fields from it, or (b) access model attributes directly (`obs.location`, `obs.user.login`, `obs.ofvs`). For this pipeline, option (b) is cleaner for top-level fields; use `obs.to_dict()["ofvs"]` only for the ofvs list (or access `obs.ofvs` and iterate `ObservationFieldValue` objects).

**Confirmed attribute paths (pyinaturalist 0.21.1):**
- `obs.id` → int
- `obs.user.login` → str
- `obs.observed_on` → date object (call `str()` for ISO string)
- `obs.location` → tuple `(lat, lon)` — NOTE: this is already `(lat, lon)` order on the model, unlike the raw API `geojson.coordinates` which is `[lon, lat]`
- `obs.ofvs` → list of `ObservationFieldValue` objects with `.field_id`, `.value`

**If using raw dicts (via `strtobool` or `to_dict()`):** use `obs["geojson"]["coordinates"]` as `[lon, lat]`.

**Recommendation:** Use model attributes for top-level fields; use `extract_specimen_count` from `observations.py` on the raw ofvs dict (call `obs.to_dict().get("ofvs", [])` for the raw ofvs list, or iterate `obs.ofvs` objects).

### Pitfall 4: `last_fetch.txt` Timestamp Format Matters

**What goes wrong:** Writing a timestamp like `Tue Mar 10 2026 19:58:00` or a Unix timestamp integer fails when pyinaturalist tries to parse `updated_since`.

**Why it happens:** `updated_since` expects a format that `dateutil.parser.parse()` or Python `datetime.fromisoformat()` can handle.

**How to avoid:** Write `last_fetch.txt` using ISO 8601 UTC: `datetime.now(timezone.utc).isoformat()` → `2026-03-10T19:58:34.082000+00:00`. pyinaturalist accepts this format for `updated_since`.

### Pitfall 5: build-data.sh Does Not Call iNat Download Yet

**What goes wrong:** Phase 9 adds `data/inat/download.py` but forgets to wire it into `scripts/build-data.sh`. The Parquet stub is committed, `npm run fetch-inat` works, but `npm run build:data` never calls the iNat step — CI produces stale data silently.

**How to avoid:** Add `uv run python inat/download.py` to `scripts/build-data.sh` explicitly; verify by running `npm run build:data` end-to-end locally.

---

## Code Examples

Verified patterns from direct codebase inspection:

### Reading `last_fetch.txt` and Passing to `updated_since`
```python
# pyinaturalist 0.21.1 — updated_since confirmed in constants.py
from pyinaturalist import get_observations
from pathlib import Path

LAST_FETCH_PATH = Path("last_fetch.txt")

if LAST_FETCH_PATH.exists():
    timestamp = LAST_FETCH_PATH.read_text().strip()
    results = get_observations(
        project_id=166376,
        page="all",
        per_page=200,
        updated_since=timestamp,
    )
else:
    results = get_observations(
        project_id=166376,
        page="all",
        per_page=200,
    )
```

### Merging Delta into Existing Parquet
```python
import pandas as pd

existing = pd.read_parquet("samples.parquet")
delta = build_dataframe(new_results)

merged = (
    pd.concat([existing, delta])
    .drop_duplicates(subset=["observation_id"], keep="last")
    .sort_values("observation_id")
    .reset_index(drop=True)
)

merged.to_parquet("samples.parquet", engine="pyarrow", index=False, compression="snappy")
```

### Progress Logging (Success Criterion 5)
```python
total = len(merged)
null_rate = merged["specimen_count"].isna().mean()
new_count = len(delta) if can_incremental else total
page_count = (new_count + 199) // 200

print(f"[inat] Fetched {new_count} observations (~{page_count} pages)")
print(f"[inat] Total in parquet: {total}")
print(f"[inat] specimen_count null rate: {null_rate:.1%}")
```

### npm Script Pattern (Existing Style in package.json)
```json
{
  "scripts": {
    "build:data": "bash scripts/build-data.sh",
    "build": "npm run build:data && npm run build --workspace=frontend",
    "cache-restore": "bash scripts/cache_restore.sh",
    "fetch-inat": "cd data && uv run python inat/download.py",
    "cache-upload": "bash scripts/cache_upload.sh"
  }
}
```

### build-data.sh Integration (new lines to add)
```bash
# Add to scripts/build-data.sh AFTER existing ecdysis lines:
echo "--- Fetching iNaturalist data ---"
uv run python inat/download.py

cp samples.parquet "$REPO_ROOT/frontend/src/assets/samples.parquet"
echo "--- Done: samples.parquet copied to frontend/src/assets/ ---"
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Match ofvs by name string | Match by `field_id=8338` | Phase 8 confirmed dual-name history | Silent data loss if matching by name |
| No S3 cache — full fetch every CI run | Incremental fetch with `updated_since` | Phase 9 new | Faster CI builds; avoids rate limit issues at scale |
| `to_dataframe()` from pyinaturalist-convert | Parse raw result dicts directly | Confirmed in STACK.md research | `to_dataframe()` produces unusable column names for this schema |
| `fields='all'` parameter | Default v1 response (no extra param) | Phase 8 confirmed | Simpler API calls; smaller payload |

**Deprecated/outdated (do not use):**
- `pyinaturalist-convert.to_dataframe()` for this pipeline — produces `ofvs.{field_id}` columns and `location` as list
- iNat API v2 for project batch queries — documented count discrepancies vs v1
- duckdb Makefile target in `data/Makefile` — incomplete, abandoned in favor of Python/pandas pattern

---

## Open Questions

None — all technical questions are resolved:

1. **Field ID for specimen count** — RESOLVED: `field_id=8338` (Phase 8)
2. **`ofvs` in default response** — RESOLVED: yes, confirmed Phase 8
3. **S3 credentials in build job** — RESOLVED: done in Phase 8 (08-02-PLAN.md)
4. **`updated_since` parameter name** — RESOLVED: confirmed in pyinaturalist 0.21.1 `constants.py`
5. **S3 bucket/prefix** — RESOLVED: `S3_BUCKET_NAME` (existing GitHub variable) with `cache/` prefix

---

## Validation Architecture

> `workflow.nyquist_validation` is not set in `.planning/config.json`, so this section is included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected in `data/` — inline assertions via `uv run python -c` |
| Config file | None |
| Quick run command | `cd /Users/rainhead/dev/beeatlas/data && uv run python -c "import inat.download; print('import OK')"` |
| Full suite command | `npm run fetch-inat` (live API smoke test; ~30s for 9,590 obs) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INAT-01 | Script fetches >0 WA Bee Atlas observations | integration (live) | `cd data && uv run python -c "from pyinaturalist import get_observations; r=get_observations(project_id=166376, per_page=1); assert r['total_results'] > 0; print('API OK')"` | ❌ Wave 0 |
| INAT-02 | extract_specimen_count returns int or None correctly | unit | `cd data && uv run python -c "from inat.observations import extract_specimen_count; assert extract_specimen_count([{'field_id':8338,'value':'3'}])==3; print('OK')"` | ✅ (observations.py exists) |
| INAT-02 | output DataFrame has correct columns and dtypes | unit | Inline assertion in download.py or separate test script | ❌ Wave 0 |
| CACHE-01 | Restore falls back gracefully on cache miss | unit | `bash scripts/cache_restore.sh && echo "restore ok"` (with fake bucket — must not fail) | ❌ Wave 0 |
| CACHE-02 | Incremental fetch merges without duplication | unit | Inline assertion: `assert len(merged) == len(merged.drop_duplicates(subset=['observation_id']))` | ❌ Wave 0 (inline in download.py) |
| CACHE-03 | Upload puts both files to S3 | smoke | `aws s3 ls s3://$S3_BUCKET_NAME/cache/` after upload | Manual |
| INFRA-05 | npm scripts are runnable individually | smoke | `npm run cache-restore && npm run fetch-inat && npm run cache-upload` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** Import check + inline dtype assertion
- **Per wave merge:** `npm run fetch-inat` produces non-empty `data/samples.parquet` locally
- **Phase gate:** Full success criteria checklist from phase description; all 5 criteria verified before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `data/inat/download.py` — core pipeline script (not yet created)
- [ ] `scripts/cache_restore.sh` — S3 restore script
- [ ] `scripts/cache_upload.sh` — S3 upload script
- [ ] `frontend/src/assets/samples.parquet` — committed stub (schema-correct empty parquet)
- [ ] npm scripts `cache-restore`, `fetch-inat`, `cache-upload` in `package.json`

---

## Sources

### Primary (HIGH confidence)
- `/Users/rainhead/dev/beeatlas/data/.venv/lib/python3.14/site-packages/pyinaturalist/constants.py` — `updated_since` parameter confirmed
- `/Users/rainhead/dev/beeatlas/data/inat/observations.py` — field constants, extract_specimen_count (committed in Phase 8)
- `/Users/rainhead/dev/beeatlas/scripts/build-data.sh` — existing orchestration pattern (`cd "$REPO_ROOT/data"`, `uv run python`, `cp` to assets)
- `/Users/rainhead/dev/beeatlas/package.json` — existing npm script structure
- `/Users/rainhead/dev/beeatlas/.github/workflows/deploy.yml` — AWS CLI usage, S3_BUCKET_NAME var, OIDC credential pattern
- `/Users/rainhead/dev/beeatlas/.planning/phases/08-discovery-and-prerequisite-gate/08-RESEARCH.md` — Phase 8 findings (all blockers resolved)
- `/Users/rainhead/dev/beeatlas/.planning/research/ARCHITECTURE.md` — pipeline architecture, build flow, anti-patterns
- `/Users/rainhead/dev/beeatlas/.planning/research/STACK.md` — library versions, pyinaturalist patterns

### Secondary (MEDIUM confidence)
- pyinaturalist 0.21.1 docs — `get_observations` parameter surface, `page='all'` IDRangePaginator behavior
- iNat API v1 docs — GeoJSON coordinate order `[lon, lat]`, `ofvs` structure

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all deps already in pyproject.toml; no new installs
- Architecture: HIGH — build-data.sh pattern, pandas patterns from existing ecdysis scripts
- S3 cache pattern: HIGH — aws CLI already in CI; S3_BUCKET_NAME confirmed; Phase 8 smoke-tested
- Incremental fetch: HIGH — `updated_since` confirmed in pyinaturalist source
- Pitfalls: HIGH — GeoJSON coord order from Phase 8 research; model vs dict from pyinaturalist source inspection

**Research date:** 2026-03-10
**Valid until:** 2026-06-10 (pyinaturalist 0.21.1 locked; iNat API v1 stable; AWS CLI patterns stable)
