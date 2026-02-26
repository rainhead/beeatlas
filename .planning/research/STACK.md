# Technology Stack

**Project:** Washington Bee Atlas — v1.1 iNaturalist API Integration
**Researched:** 2026-02-25
**Scope:** Stack additions and changes needed to query the iNaturalist API from the existing Python pipeline and produce samples.parquet. The baseline stack (TypeScript/Vite/OpenLayers, Python 3.14+, uv, pandas, geopandas, pyarrow, duckdb, AWS CDK/OIDC) is already validated and is NOT re-documented here.

---

## Key Finding: No New Dependencies Needed

Both `pyinaturalist>=0.20.2` and `pyinaturalist-convert>=0.7.4` are already declared in `data/pyproject.toml` and locked in `data/uv.lock` at current stable versions (0.21.1 and 0.7.4 respectively). The iNaturalist public observations API requires no authentication for read-only access. The Washington Bee Atlas iNat project ID (`166376`) is already recorded in `data/inat/projects.py`. **No new packages need to be added to pyproject.toml.**

---

## Libraries Already in Place

### Core iNat API Client

| Library | Locked Version | Release Date | Purpose |
|---------|----------------|-------------|---------|
| `pyinaturalist` | 0.21.1 | 2026-02-13 | iNat API client — `get_observations()` with project filtering, built-in rate limiting via pyrate-limiter, `page='all'` cursor pagination |
| `pyinaturalist-convert` | 0.7.4 | 2026-01-18 | Converts observation response objects to pandas DataFrames via `to_dataframe()`; handles nested JSON flattening |

Both versions are confirmed in `data/uv.lock`. (HIGH confidence — read directly from lockfile.)

### Rate Limiting Infrastructure (Transitive, Already Locked)

| Library | Locked Version | Role |
|---------|----------------|------|
| `pyrate-limiter` | 2.10.0 | Backend used by pyinaturalist; enforces per-second/per-minute/per-day limits via leaky-bucket algorithm |
| `requests-ratelimiter` | 0.8.0 | Wraps `requests.Session` to apply throttling transparently |
| `requests` | 2.32.5 | HTTP transport layer for pyinaturalist |

---

## iNaturalist API Facts

### Authentication

**No auth token required.** (HIGH confidence — confirmed in iNat API reference and pyinaturalist docs.) Read-only access to public project observations is unauthenticated. Authentication is only required for write operations or accessing private/obscured coordinates.

Do NOT add: OAuth libraries, JWT handlers, keyring integration. None are needed for this pipeline.

### Which API Version to Use

The existing `data/Makefile` already uses the iNat **v2 API** directly via `wget` for individual observation fetches (the `inat/observation/%.json` target). The v2 API is still in development and has a documented discrepancy with v1 for project observation counts — v2 may return fewer observations than v1 for a given project. (MEDIUM confidence — iNat community forum report.)

For the batch project query in the pipeline, use **pyinaturalist's v1 wrapper** (`get_observations(project_id=...)`). The v1 API is stable, fully supported by pyinaturalist, and does not have the project count discrepancy.

### Rate Limits

| Limit | Value | Confidence |
|-------|-------|------------|
| Hard cap | 100 requests/minute | HIGH (iNat official docs) |
| Recommended max | 60 requests/minute | HIGH (iNat API Recommended Practices) |
| Daily guideline | 10,000 requests/day | HIGH (iNat API Recommended Practices) |
| Real-world behavior | 429 errors reported at 60 req/min on some endpoints | MEDIUM (community forum bug reports) |

pyinaturalist's built-in rate limiter enforces compliance automatically; no manual `time.sleep()` needed. If 429 errors occur, reduce via `ClientSession(per_minute=50)`.

**Practical impact for this project:** The WA Bee Atlas project had ~17,000 specimens in 2024. At multiple specimens per observation, total observations are probably 5,000–15,000. At `per_page=200`, this is 25–75 API requests — well inside daily and per-minute limits. Rate limiting is not a practical concern for this pipeline.

### Pagination

The iNat v1 API has a hard cap: standard page-based pagination breaks above 10,000 results (page 50 × per_page 200). For larger datasets, use cursor pagination with `id_above`.

pyinaturalist handles this automatically: passing `page='all'` routes to `IDRangePaginator`, which:
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

### Structure of `ofvs`

iNaturalist observation field values are in an `ofvs` JSON array on each observation. Each element has `field_id` (int), `name` (str), and `value` (str). They are optional — volunteers can omit them, especially shortly after collecting.

Example structure:
```json
"ofvs": [
  {
    "field_id": 12345,
    "name": "Specimen Count",
    "value": "3"
  }
]
```

### Specimen Count Field: Needs Live Verification

The specific observation field name used by the Washington Bee Atlas for specimen count **could not be confirmed by web search**. (LOW confidence for the exact field name.) The name is likely one of:
- `"Specimen Count"` — common across collection projects
- `"Number of Specimens"` — alternate naming
- A project-specific field only visible by inspecting live observations

**Required action before writing the pipeline script:** Call the iNat API for 5–10 live WA Bee Atlas observations and print all `ofvs` entries to identify the exact field name. One command:

```bash
curl "https://api.inaturalist.org/v1/observations?project_id=166376&per_page=5&order_by=id&order=desc" \
  | python3 -c "import json,sys; [print(o['id'], o.get('ofvs',[])) for o in json.load(sys.stdin)['results']]"
```

### Fallback: Missing = Zero

Per PROJECT.md INAT-02: "specimen_count (0 = not yet entered)". If `ofvs` does not contain the specimen count field, write `0`. Use a nullable `Int64` column and `.fillna(0)`.

---

## pyinaturalist-convert: to_dataframe() Coverage

`to_dataframe()` from pyinaturalist-convert flattens core observation fields (id, uuid, observed_on, location, user, taxon, quality_grade) into DataFrame columns. It does NOT expand `ofvs` into dedicated columns. The pipeline needs a custom helper to extract specimen count:

```python
def extract_ofv(obs: dict, field_name: str) -> int:
    for ofv in obs.get("ofvs", []):
        if ofv.get("name") == field_name:
            try:
                return int(ofv["value"])
            except (ValueError, KeyError):
                return 0
    return 0
```

---

## Recommended Implementation Pattern

```python
from pyinaturalist import get_observations
from pyinaturalist_convert import to_dataframe
import pandas as pd

WA_BEE_ATLAS_PROJECT_ID = 166376
# Verify this field name against live data before using:
SPECIMEN_COUNT_FIELD_NAME = "Specimen Count"

def fetch_wa_bee_atlas_observations() -> pd.DataFrame:
    """Fetch all WA Bee Atlas observations from iNat API."""
    # page='all' triggers IDRangePaginator (id_above cursor pagination)
    # per_page=200 is the API maximum for v1
    # No auth needed for public project observations
    response = get_observations(
        project_id=WA_BEE_ATLAS_PROJECT_ID,
        page="all",
        per_page=200,
        order_by="id",
        order="asc",
    )
    raw = response["results"]

    # Core fields via to_dataframe()
    df = to_dataframe(raw)

    # Specimen count from ofvs (not covered by to_dataframe)
    df["specimen_count"] = [
        extract_ofv(obs, SPECIMEN_COUNT_FIELD_NAME) for obs in raw
    ]

    # Select and rename to match samples.parquet schema
    return df[["id", "user_login", "observed_on", "latitude", "longitude", "specimen_count"]].rename(
        columns={"id": "observation_id", "user_login": "observer", "observed_on": "date"}
    )


def extract_ofv(obs: dict, field_name: str) -> int:
    for ofv in obs.get("ofvs", []):
        if ofv.get("name") == field_name:
            try:
                return int(ofv["value"])
            except (ValueError, KeyError):
                return 0
    return 0
```

Write the Parquet using existing pipeline conventions:
```python
df.to_parquet(
    "frontend/src/assets/samples.parquet",
    index=False,
    compression="snappy",
    engine="pyarrow",
)
```

---

## What NOT to Add

| Item | Reason |
|------|--------|
| OAuth / JWT / keyring libraries | Public read-only API; no auth required |
| Direct `requests` usage | pyinaturalist manages the session, including rate limiting |
| `beautifulsoup4` / `lxml` for iNat | Those are for Ecdysis HTML scraping (v1.2 deferred scope) |
| `aiohttp` or async HTTP | pyinaturalist is sync; CI pipeline, not a latency-sensitive server |
| Disk caching layer (redis, etc.) | Pipeline runs once per CI build; `page='all'` already fetches incrementally |
| `pyinaturalist-open-data` | For bulk S3 snapshot downloads; no project membership filter available |
| iNat v2 API for project batch queries | Documented project count discrepancies vs v1; use pyinaturalist v1 wrappers |

---

## pyproject.toml Impact

**No changes required.** Both libraries are already declared:

```toml
# data/pyproject.toml (current, unchanged)
[project]
dependencies = [
    "pyinaturalist>=0.20.2",           # locked at 0.21.1
    "pyinaturalist-convert>=0.7.4",    # locked at 0.7.4
    ...
]
```

The new pipeline script (e.g., `data/inat/fetch_observations.py`) is a new file, not a dependency change.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Library versions | HIGH | Read directly from `data/uv.lock` |
| Auth: no token needed | HIGH | iNat API docs + pyinaturalist docs |
| Rate limits (documented) | HIGH | iNat API Recommended Practices page |
| Rate limits (real-world) | MEDIUM | Community reports of 429s at documented limits |
| WA Bee Atlas project ID | HIGH | In `data/inat/projects.py` |
| `page='all'` cursor behavior | HIGH | pyinaturalist source + docs |
| Specimen count field name | LOW | Not findable via web search; must inspect live observations |
| `to_dataframe()` ofvs coverage | MEDIUM | Based on library description; confirm against live data |

---

## Sources

- [pyinaturalist 0.21.1 documentation](https://pyinaturalist.readthedocs.io/en/stable/) — HIGH confidence
- [pyinaturalist PyPI](https://pypi.org/project/pyinaturalist/) — version dates confirmed
- [pyinaturalist-convert 0.7.4 documentation](https://pyinaturalist-convert.readthedocs.io/en/stable/) — HIGH confidence
- [iNaturalist API Recommended Practices](https://www.inaturalist.org/pages/api+recommended+practices) — HIGH confidence (rate limits)
- [iNaturalist API v1 docs](https://api.inaturalist.org/v1/docs/) — HIGH confidence (pagination, per_page=200 max)
- [iNat forum: 429 at 60 req/min](https://forum.inaturalist.org/t/429-error-from-observations-histogram-api-when-calling-at-60-calls-minute/64709) — MEDIUM confidence
- [iNat forum: API v1 vs v2 project count discrepancy](https://forum.inaturalist.org/t/api-v1-vs-api-v2-observation-count-by-project-not-the-same/24394) — MEDIUM confidence
- `data/inat/projects.py` — WA project ID 166376 confirmed in codebase
- `data/uv.lock` — all locked versions verified directly
- WSDA press release — 17,000 specimens / 67 volunteers in 2024 (volume estimate)
