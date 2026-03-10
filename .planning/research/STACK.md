# Stack Research

**Domain:** Python pipeline — iNaturalist API to Parquet
**Researched:** 2026-03-10
**Confidence:** HIGH

**Scope:** Stack additions and changes needed to query the iNaturalist API from the existing Python pipeline and produce `samples.parquet`. The baseline stack (TypeScript/Vite/OpenLayers, Python 3.14+, uv, pandas, geopandas, pyarrow, duckdb, AWS CDK/OIDC) is already validated and is NOT re-documented here.

---

## Key Finding: No New Dependencies Needed

Both `pyinaturalist>=0.20.2` and `pyinaturalist-convert>=0.7.4` are already declared in `data/pyproject.toml` and locked in `data/uv.lock` at current stable versions (0.21.1 and 0.7.4 respectively). The iNaturalist public observations API requires no authentication for read-only access. The Washington Bee Atlas iNat project ID (`166376`) is already recorded in `data/inat/projects.py`. **No new packages need to be added to `pyproject.toml`.**

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `pyinaturalist` | 0.21.1 (locked) | iNat API client — `get_observations()` with project filtering, built-in rate limiting, `page='all'` cursor pagination | Standard Python client for iNat API; handles pagination complexity, rate limiting, and response parsing automatically |
| `pandas` | >=3.0.0 | DataFrame construction and Parquet writing | Already used in existing pipeline; consistent with ecdysis.parquet production |
| `pyarrow` | >=22.0.0 | Parquet engine | Already used in existing pipeline; required by `df.to_parquet(engine='pyarrow')` |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pyinaturalist-convert` | 0.7.4 (locked) | Converts observation API responses to pandas DataFrames | Optional — `to_dataframe()` does not produce useful columns for this pipeline (see note below); skip it and parse raw dicts directly |

**Note on `pyinaturalist-convert`:** `to_dataframe()` uses `semitabular=True` flattening. This produces a `location` column as a Python list (not split into `latitude`/`longitude`), and `ofvs` columns keyed by field_id integer string (e.g. `ofvs.12345`) rather than field name. For the simple schema needed by `samples.parquet`, parsing raw API result dicts directly is cleaner and more reliable. The library is already installed but is not needed for this pipeline. (HIGH confidence — verified against installed source at `data/.venv/lib/python3.14/site-packages/pyinaturalist_convert/converters.py`.)

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `uv` | Dependency management and script runner | Already in use; run pipeline with `uv run python inat/fetch_observations.py` |

---

## Installation

No new packages. All required libraries are already declared in `data/pyproject.toml` and locked in `data/uv.lock`. `uv sync` will resolve them.

---

## iNaturalist API Facts

### Authentication

No auth token required. (HIGH confidence — confirmed in iNat API reference and pyinaturalist docs.) Read-only access to public project observations is unauthenticated. Authentication is only required for write operations or accessing private/obscured coordinates.

### Which API Version to Use

The existing `data/Makefile` uses the iNat **v2 API** directly via `wget` for individual observation fetches. The v2 API is still in development and has a documented discrepancy with v1 for project observation counts — v2 may return fewer observations than v1 for a given project. (MEDIUM confidence — iNat community forum report.)

For the batch project query in the pipeline, use **pyinaturalist's v1 wrapper** (`get_observations(project_id=...)`). The v1 API is stable, fully supported by pyinaturalist, and does not have the project count discrepancy.

### Rate Limits

| Limit | Value | Confidence |
|-------|-------|------------|
| Hard cap | 100 requests/minute | HIGH (iNat official docs) |
| Recommended max | 60 requests/minute | HIGH (iNat API Recommended Practices) |
| Daily guideline | 10,000 requests/day | HIGH (iNat API Recommended Practices) |
| Real-world behavior | 429 errors reported at 60 req/min on some endpoints | MEDIUM (community forum bug reports) |

pyinaturalist's built-in rate limiter (via `pyrate-limiter` 2.10.0, already locked) enforces compliance automatically — no manual `time.sleep()` needed.

**Practical impact for this project:** At `per_page=200`, fetching 5,000–15,000 WA Bee Atlas observations requires 25–75 API requests — well inside daily and per-minute limits. Rate limiting is not a practical concern.

### Pagination

The iNat v1 API has a hard cap: standard page-based pagination breaks above 10,000 results (page 50 × per_page 200). For larger datasets, use cursor pagination with `id_above`.

pyinaturalist handles this automatically when `page='all'` is passed. It routes to `IDRangePaginator`, which:
1. Fetches pages ordered by ID ascending
2. Records the last ID returned
3. Next request uses `id_above=<last_id>` instead of incrementing page number
4. Stops when a page returns fewer results than `per_page`

Use `page='all'` from the start even if current volume is under 10,000 — it is safe for all sizes and future-proofs the script.

### Washington Bee Atlas Project

| Field | Value | Confidence |
|-------|-------|------------|
| Project ID | `166376` | HIGH (confirmed in `data/inat/projects.py`) |
| Project type | Collection project | MEDIUM |
| 2024 volume | 17,000+ specimens, 67 volunteers | HIGH (WSDA press release) |

---

## Observation Fields: Specimen Count

### Structure of `ofvs` in Raw API Response

iNaturalist observation field values are in an `ofvs` JSON array on each raw API result dict. Each element has `field_id` (int), `name` (str), and `value` (str). They are optional — volunteers can omit them.

Example structure in raw API response:
```json
"ofvs": [
  {
    "field_id": 12345,
    "name": "Specimen Count",
    "value": "3"
  }
]
```

### Why Not to Use `to_dataframe()` for ofvs

`pyinaturalist-convert`'s `to_dataframe()` converts `ofvs` to a dict keyed by `str(field_id)` before flattening, producing columns named `ofvs.12345`. Accessing these requires knowing the numeric field ID in advance and produces fragile column name lookups. Parse `ofvs` from raw result dicts directly using the field name string instead.

### Specimen Count Field: Needs Live Verification

The specific observation field name used by the Washington Bee Atlas for specimen count **could not be confirmed by web search**. (LOW confidence for the exact field name.) The name is likely `"Specimen Count"` (common across collection projects), but must be verified against live data before use.

**Required action before writing the pipeline script:** Call the iNat API for 5–10 live WA Bee Atlas observations and print all `ofvs` entries:

```bash
curl "https://api.inaturalist.org/v1/observations?project_id=166376&per_page=5&order_by=id&order=desc" \
  | python3 -c "import json,sys; [print(o['id'], o.get('ofvs',[])) for o in json.load(sys.stdin)['results']]"
```

### Fallback: Missing = Zero

Per PROJECT.md INAT-02: specimen_count of 0 means "not yet entered". If `ofvs` does not contain the specimen count field for an observation, write `0`. Use nullable `Int64` dtype and `.fillna(0)`.

---

## Recommended Implementation Pattern

Parse the raw results from `get_observations()` directly — do not use `to_dataframe()`, which produces unusable column names for this pipeline's needs.

```python
from pyinaturalist import get_observations
import pandas as pd

WA_BEE_ATLAS_PROJECT_ID = 166376
# Verify this field name against live data (see above) before using:
SPECIMEN_COUNT_FIELD_NAME = "Specimen Count"


def extract_ofv(result: dict, field_name: str) -> int:
    """Extract a named observation field value as int; return 0 if absent or unparseable."""
    for ofv in result.get("ofvs", []):
        if ofv.get("name") == field_name:
            try:
                return int(ofv["value"])
            except (ValueError, KeyError):
                return 0
    return 0


def fetch_wa_bee_atlas_observations() -> pd.DataFrame:
    """Fetch all WA Bee Atlas observations from iNat API and return samples DataFrame."""
    # page='all' triggers IDRangePaginator (id_above cursor pagination, safe for >10k results)
    # per_page=200 is the API maximum for v1
    # No auth needed for public project observations
    results = get_observations(
        project_id=WA_BEE_ATLAS_PROJECT_ID,
        page="all",
        per_page=200,
        order_by="id",
        order="asc",
    )

    rows = []
    for obs in results:
        # obs is a pyinaturalist Observation object
        lat, lon = obs.location if obs.location else (None, None)
        rows.append({
            "observation_id": obs.id,
            "observer": obs.user.login if obs.user else None,
            "date": str(obs.observed_on.date()) if obs.observed_on else None,
            "latitude": lat,
            "longitude": lon,
            "specimen_count": extract_ofv(obs.to_dict(), SPECIMEN_COUNT_FIELD_NAME),
        })

    df = pd.DataFrame(rows)
    df["specimen_count"] = df["specimen_count"].astype("Int64")
    return df
```

Write using existing pipeline conventions:
```python
df.to_parquet(
    "frontend/src/assets/samples.parquet",
    index=False,
    compression="snappy",
    engine="pyarrow",
)
```

**Note on `obs.to_dict()`:** pyinaturalist Observation objects expose `ofvs` as `ObservationFieldValue` model objects, not raw dicts. Calling `.to_dict()` or accessing `obs.ofvs[i].name` and `obs.ofvs[i].value` directly avoids the field_id ambiguity. Verify the attribute names against the pyinaturalist Observation model if needed.

---

## Integration with Existing Pipeline

The new script (`data/inat/fetch_observations.py`) integrates with `scripts/build-data.sh` by appending steps:

```bash
echo "--- Fetching iNaturalist observations ---"
uv run python inat/fetch_observations.py
cp samples.parquet "$REPO_ROOT/frontend/src/assets/samples.parquet"
```

The script writes `data/samples.parquet` (analogous to `data/ecdysis.parquet` for the Ecdysis pipeline). The file naming and copy pattern exactly mirrors the existing `ecdysis.parquet` → `frontend/src/assets/ecdysis.parquet` flow.

**CI consideration:** The existing `build-data.sh` makes a live HTTP POST to ecdysis.org on every push. Adding iNat API calls makes the same tradeoff — CI will call the live iNat API on every build. For v1.2 (pipeline only, no map rendering yet), this is acceptable. A `data/samples.parquet` committed fallback (mirroring `frontend/src/assets/ecdysis.parquet` for the Ecdysis side) would protect against iNat downtime.

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| OAuth / JWT / keyring libraries | Public read-only API; no auth required | Nothing — unauthenticated requests work |
| Direct `requests` usage | pyinaturalist manages the session including rate limiting | `get_observations()` |
| `beautifulsoup4` / `lxml` for iNat | Those are for Ecdysis HTML scraping (deferred scope) | Not needed for v1.2 |
| `aiohttp` or async HTTP | pyinaturalist is synchronous; CI pipeline, not a latency-sensitive server | Standard pyinaturalist sync API |
| Redis or disk caching layer | Pipeline runs once per CI build; `page='all'` fetches incrementally | No caching needed |
| `pyinaturalist-open-data` | For bulk S3 snapshot downloads; no project membership filter available | `get_observations(project_id=...)` |
| iNat v2 API for project batch queries | Documented project count discrepancies vs v1 | `pyinaturalist` v1 wrappers |
| `to_dataframe()` from pyinaturalist-convert | Produces `location` list and `ofvs.{field_id}` columns — not useful for samples schema | Parse raw `results` dicts directly |

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `pyinaturalist` v1 `get_observations()` | Direct iNat v2 API via `requests` | If v2 API is needed for fields unavailable in v1; not the case here |
| Parse raw results dicts | `pyinaturalist-convert to_dataframe()` | If all desired fields are top-level (no ofvs); not the case here |
| Single script in `data/inat/` | DuckDB Makefile target (already partial in `data/Makefile`) | If the full pipeline is Makefile-based; would require completing the half-finished Makefile target |

---

## Version Compatibility

| Package | Version | Notes |
|---------|---------|-------|
| `pyinaturalist` | 0.21.1 | Python >=3.8 per PyPI; confirmed working on Python 3.14 (uv.lock present) |
| `pyinaturalist-convert` | 0.7.4 | Depends on pyinaturalist; no upper bound conflict |
| `pandas` | >=3.0.0 | Required for `to_dataframe()` if used; already in dependencies |
| `pyarrow` | >=22.0.0 | Parquet engine; already in dependencies |

---

## pyproject.toml Impact

**No changes required.** Both libraries are already declared:

```toml
# data/pyproject.toml (current, no changes needed)
[project]
dependencies = [
    "pyinaturalist>=0.20.2",           # locked at 0.21.1
    "pyinaturalist-convert>=0.7.4",    # locked at 0.7.4
    ...
]
```

The new pipeline script (`data/inat/fetch_observations.py`) is a new file, not a dependency change.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Library versions | HIGH | Read directly from `data/uv.lock` |
| Auth: no token needed | HIGH | iNat API docs + pyinaturalist docs |
| Rate limits (documented) | HIGH | iNat API Recommended Practices |
| Rate limits (real-world) | MEDIUM | Community reports of 429s at documented limits |
| WA Bee Atlas project ID | HIGH | In `data/inat/projects.py` |
| `page='all'` cursor behavior | HIGH | pyinaturalist source + docs |
| `to_dataframe()` column structure | HIGH | Verified against installed source at `.venv/lib/python3.14/site-packages/pyinaturalist_convert/converters.py` |
| Specimen count field name | LOW | Not findable via web search; must inspect live observations |
| `obs.ofvs[i].name` attribute on Observation model | MEDIUM | Consistent with pyinaturalist_convert _models.py usage; verify against pyinaturalist Observation class |

---

## Sources

- `data/uv.lock` — all locked versions verified directly (HIGH confidence)
- `data/inat/projects.py` — WA project ID 166376 confirmed in codebase (HIGH confidence)
- `data/.venv/lib/python3.14/site-packages/pyinaturalist_convert/converters.py` — `to_dataframe()` column structure verified (HIGH confidence)
- `data/.venv/lib/python3.14/site-packages/pyinaturalist_convert/_models.py` — ofvs attribute structure confirmed (HIGH confidence)
- [pyinaturalist 0.21.1 documentation](https://pyinaturalist.readthedocs.io/en/stable/) — API surface and pagination (HIGH confidence)
- [iNaturalist API Recommended Practices](https://www.inaturalist.org/pages/api+recommended+practices) — rate limits (HIGH confidence)
- [iNaturalist API v1 docs](https://api.inaturalist.org/v1/docs/) — pagination, per_page=200 max (HIGH confidence)
- [iNat forum: 429 at 60 req/min](https://forum.inaturalist.org/t/429-error-from-observations-histogram-api-when-calling-at-60-calls-minute/64709) — real-world rate limit behavior (MEDIUM confidence)
- [pyinaturalist PyPI](https://pypi.org/project/pyinaturalist/) — version 0.21.1 released 2026-02-13 (HIGH confidence)
- [pyinaturalist-convert PyPI](https://pypi.org/project/pyinaturalist-convert/) — version 0.7.4 released 2026-01-18 (HIGH confidence)

---
*Stack research for: Python iNaturalist API pipeline — Washington Bee Atlas v1.2*
*Researched: 2026-03-10*
