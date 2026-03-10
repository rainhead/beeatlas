# Feature Research

**Domain:** iNaturalist API pipeline — Washington Bee Atlas collection events
**Project:** Washington Bee Atlas — v1.2 iNat Pipeline
**Researched:** 2026-03-10
**Confidence:** HIGH (project codebase read directly; pyinaturalist source code examined; live iNat API response in repo)

---

## Scope Boundary

This milestone (v1.2) is **pipeline only** — no map presentation. Three requirements govern scope:

- **INAT-01**: Query iNat API for Washington Bee Atlas project observations
- **INAT-02**: Extract observer, date, coordinates, specimen count from each observation
- **INAT-03**: Produce `samples.parquet` (observation_id, observer, date, lat, lon, specimen_count)

MAP-03 (sample markers layer), MAP-04 (click-to-detail sidebar), and specimen-to-sample linkage are explicitly deferred to v1.3+.

---

## Context: What Already Exists

Significant iNat infrastructure is already in the repo before v1.2 starts:

- `data/inat/projects.py` — WA project ID confirmed: **166376** (OR project: 18521)
- `data/Makefile` — iNat API v2 call with custom `fields` fieldspec already written; one sample observation JSON fetched at `data/inat/observation/300847934.json`
- `data/scripts/fetch_inat_links.py` — fetches iNat observation IDs from Ecdysis HTML (a different pipeline for v1.3 linkage work)
- `pyinaturalist>=0.20.2` and `pyinaturalist-convert>=0.7.4` already in `data/pyproject.toml`
- `data/inat/observations.py` and `data/inat/projects.py` — stubs, essentially empty

The Makefile fieldspec fetches individual observations by ID via API v2:
```
GET https://api.inaturalist.org/v2/observations?fields=(id:!t,geojson:!t,time_observed_at:!t,user:(id:!t,login:!t,name:!t),...)&id=<obs_id>
```
This milestone extends this pattern to **bulk project fetching**: query all observations in project 166376, not individual ID lookups.

---

## How the iNaturalist API Works (HIGH confidence — source code + live JSON)

**Primary endpoint for project observations (API v1, pyinaturalist):**
```
GET https://api.inaturalist.org/v1/observations?project_id=166376&per_page=200&order_by=id&order=asc
```

**Pagination behavior (confirmed from `pyinaturalist/paginator.py` source):**
- Default and maximum per_page: **200** (from `pyinaturalist/constants.py`: `PER_PAGE_RESULTS = 200`)
- Hard API limit: 10,000 results via page+per_page; exceeding this throws an error
- Cursor pagination: use `id_above=<last_result_id>` with `order_by=id&order=asc` — unlimited results
- `get_observations(page='all')` internally invokes `IDRangePaginator` with `id_above` cursor — handles large sets automatically, no manual loop required

**Rate limits (confirmed from `pyinaturalist/constants.py`):**
- `REQUESTS_PER_SECOND = 1` (sustained)
- `REQUEST_BURST_RATE = 5`
- `REQUESTS_PER_DAY = 10000`
- `REQUEST_RETRIES = 5` with exponential backoff for 500/502/503/504 errors
- pyinaturalist session layer handles rate limiting automatically via `pyrate_limiter`

**WA Bee Atlas project scale:** The project (ID 166376) has low thousands of observations (volunteer collector program across WA, active since ~2021). Well within 10k limit. Cursor pagination is safe default regardless.

**Key observation fields in the API response:**

| Field | Path (API v1 model) | Path (API v2 JSON) | Notes |
|-------|--------------------|--------------------|-------|
| Observation ID | `id` | `id` | Integer, stable identifier |
| Observer username | `user.login` | `user.login` | Always present |
| Observer display name | `user.name` | `user.name` | May be empty string |
| Observed date | `observed_on` | `time_observed_at` | ISO date or ISO 8601 datetime |
| Coordinates (public) | `location` → (lat, lon) tuple | `geojson.coordinates` → [lon, lat] | Note lon/lat order reversal between v1 and v2 |
| Coordinates (private) | `private_location` | Not in v2 fields | Only available with authentication + permissions |
| Observation field values | `ofvs` list | `ofvs` (must request in fields spec) | Not included in sample Makefile fieldspec |
| iNat URL | `uri` | `uri` | e.g. `https://www.inaturalist.org/observations/300847934` |

**Observation field values (`ofvs`) — structure (HIGH confidence, `pyinaturalist/models/observation_field.py`):**
Each `ofvs` entry has:
- `field_id` (int) — identifies which field definition
- `name` (str) — human-readable field name (e.g., "Count", "Number of specimens")
- `value` — typed by `datatype`; parsed to Python int/float/str/date by pyinaturalist
- `datatype` — one of: dna, date, datetime, numeric, taxon, text, time

**Critical: the specimen count field ID is unknown.** The WA Bee Atlas project may use a custom observation field. The field ID must be discovered by:
1. Querying `GET /v1/projects/166376` and inspecting `project_observation_fields`
2. Or fetching one project observation and scanning its `ofvs` for a numeric field with a name matching "specimen", "count", "collected"

The existing Makefile fieldspec does NOT include `ofvs`. The pipeline script must add `ofvs` to its API request.

---

## Table Stakes

Features required for v1.2 to be complete. Missing = milestone not done.

| Feature | Why Required | Complexity | Notes |
|---------|--------------|------------|-------|
| Fetch all project observations via API | Core requirement INAT-01 | LOW | `get_observations(project_id=166376, page='all')` handles pagination |
| Cursor-based pagination | API hard 10k limit; safe default for any project size | LOW | pyinaturalist `IDRangePaginator` handles this when `page='all'` is passed |
| Extract observer, date, lat, lon | Core requirement INAT-02 | LOW | Standard fields on every observation; no discovery needed |
| Include `ofvs` in API request | Without this, specimen count is inaccessible | LOW | Must add `ofvs` to fieldspec or use v1 endpoint (which includes `ofvs` by default) |
| Discover specimen count field_id | INAT-02 requires correct field; wrong ID = silent nulls | LOW | Query project once at pipeline start; hardcode field ID as constant |
| Extract specimen count from ofvs | Core requirement INAT-02 | MEDIUM | ofvs may be absent; field may not be filled; must parse and handle nulls |
| Null specimen_count handling | Many observations will have no count entered; must not silently coerce to 0 | LOW | Use nullable `Int64` in pandas; null remains null in Parquet |
| Handle obscured/null coordinates | Some observations have geoprivacy; null lat/lon is valid | LOW | Nullable float64; rows retained (not dropped) unless pipeline explicitly decides otherwise |
| Write samples.parquet | Core requirement INAT-03 | LOW | Same pandas + pyarrow pattern as existing `ecdysis.parquet`; engine='pyarrow', compression='snappy' |
| Extend build-data.sh or Makefile | CI must produce samples.parquet alongside ecdysis.parquet | LOW | Copy output to `frontend/src/assets/samples.parquet`; same pattern as existing ecdysis copy |
| Rate limiting (1 req/sec) | API terms of service | LOW | Handled automatically by pyinaturalist session; no manual sleep needed |

---

## Differentiators

Features that add value but are not required by the three INAT requirements.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Cache raw API responses to disk | Enables re-runs without re-fetching; mirrors Makefile pattern of persisting individual JSONs | LOW | Write raw JSON pages to `data/inat/raw/` before parsing |
| Observer display name fallback | `user.name` may be empty string; fall back to `user.login` | VERY LOW | One-liner in extraction; prevents empty "Collector:" labels |
| Include `uri` in samples.parquet | Enables future deep-linking from sidebar without reconstruction | VERY LOW | Already in Makefile fieldspec; cheap to carry through |
| OR project support (project_id=18521) | Generalize to Oregon Bee Atlas in same pipeline run | LOW | Already stubbed in `inat/projects.py`; trivially parameterized |
| Progress reporting | Useful for debugging CI pipeline | LOW | Log observation count, page count, null rate in specimen_count |
| Committed fallback parquet | If iNat API is down, CI build survives | LOW | Same mitigation as existing `ecdysis.parquet` committed fallback |

---

## Anti-Features

Features to explicitly NOT build in v1.2.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Sample markers map layer (MAP-03) | Explicitly deferred to v1.3 per PROJECT.md; requires specimen-to-sample linkage design first | Deliver samples.parquet only; map layer is v1.3 |
| Click-to-detail sidebar (MAP-04) | Depends on MAP-03; deferred | Deliver samples.parquet only |
| Specimen-to-sample linkage (Ecdysis HTML scraping) | Separate pipeline script (`fetch_inat_links.py`) exists; linkage modeling is v1.3 | Deferred per PROJECT.md |
| iNat host plant observation layer | Different data type and display scope; explicitly out of scope in PROJECT.md | Not in this milestone |
| Authentication / private coordinates | Read-only public project data; complicates CI; privacy concern | Use public coordinates only |
| Real-time fetch from browser | Static hosting constraint is non-negotiable | Pipeline fetches; static Parquet serves |
| Taxon filtering of sample markers | iNat observations are collection events, not identified specimens | Filter applies only to specimen layer (future) |
| Clustering of sample markers | Sample count is low (hundreds); clustering adds complexity without benefit | Render individual markers (future, v1.3) |

---

## Feature Dependencies

```
INAT-01: Fetch all project observations
  └── requires: project_id=166376 (confirmed in inat/projects.py)
  └── requires: pyinaturalist installed (confirmed in pyproject.toml)
  └── requires: pagination (handled by page='all' → IDRangePaginator)
  └── produces: raw observation records

INAT-02: Extract fields
  └── requires: INAT-01 output
  └── requires: specimen count field_id discovered (query project once at start)
  └── requires: ofvs included in API response (fieldspec or v1 default)
  └── produces: structured rows (observation_id, observer, date, lat, lon, specimen_count)

INAT-03: Write samples.parquet
  └── requires: INAT-02 output
  └── requires: build-data.sh extended to copy parquet to frontend/src/assets/
  └── produces: samples.parquet (feeds MAP-03/MAP-04 in v1.3+)

MAP-03 (deferred v1.3+): Sample markers layer
  └── requires: INAT-03 complete
  └── requires: specimen-to-sample linkage design

MAP-04 (deferred v1.3+): Click-to-detail sidebar
  └── requires: MAP-03
```

### Dependency Notes

- **INAT-02 requires specimen count field_id:** This is the single unknown in the pipeline. Must be resolved at pipeline startup by querying `GET /v1/projects/166376` or inspecting a sample observation's `ofvs`. Discovery result should be hardcoded as a constant (e.g., `SPECIMEN_COUNT_FIELD_ID = <id>`) for reproducibility.
- **API v1 vs v2:** The existing Makefile uses API v2 with explicit `fields` spec. pyinaturalist's `get_observations()` uses API v1 and includes `ofvs` by default. Either works; v1 via pyinaturalist is simpler for the pipeline, consistent with how pyinaturalist is already used.
- **GeoJSON coordinate order:** API v2 returns `geojson.coordinates` as [longitude, latitude]. API v1 (via pyinaturalist) returns `location` as `(latitude, longitude)` tuple. If using v2 directly, swap order when building the DataFrame row.

---

## Data Model: samples.parquet Schema

Designed to match the pattern of `ecdysis.parquet` but for iNat collection event data:

| Column | Parquet Type | Source | Notes |
|--------|-------------|--------|-------|
| `observation_id` | int64 | `id` | iNat integer ID; primary key |
| `observer` | string | `user.name` or `user.login` | Prefer `name`; fallback to `login` if name is empty string |
| `date` | string | `observed_on` | Store as `YYYY-MM-DD`; parse in frontend for display |
| `latitude` | float64 | `location[0]` (v1) or `geojson.coordinates[1]` (v2) | WGS84; nullable |
| `longitude` | float64 | `location[1]` (v1) or `geojson.coordinates[0]` (v2) | WGS84; nullable |
| `specimen_count` | Int64 (nullable) | `ofvs` array, target `field_id` | Null = not entered; 0 = explicitly zero; parse string to int |
| `uri` | string | `uri` | Full iNat URL for deep-linking; always present |

---

## Pipeline Architecture

Based on existing `data/scripts/download.py` and pyinaturalist paginator source:

**Recommended: `data/inat/fetch_samples.py`** following the same pattern as `data/scripts/download.py`:

```
1. Discover specimen count field_id:
   - Query GET /v1/projects/166376
   - Find field with name matching "specimen" or "count"
   - Hardcode result as SPECIMEN_COUNT_FIELD_ID constant

2. Fetch observations:
   - get_observations(project_id=166376, page='all', per_page=200)
   - Returns all results via IDRangePaginator (id_above cursor)

3. Extract rows:
   - For each observation: observation_id, observer, date, lat, lon
   - For each observation: scan ofvs for field_id == SPECIMEN_COUNT_FIELD_ID → specimen_count
   - Build list of dicts

4. Write Parquet:
   - pd.DataFrame(rows).to_parquet('samples.parquet', compression='snappy', engine='pyarrow')

5. CI integration:
   - Extend build-data.sh to call fetch_samples.py and copy output to frontend/src/assets/
```

**CI concern:** Same as Ecdysis — live HTTP call to iNat API on every push. If iNat API is down, CI fails. Mitigate: commit `frontend/src/assets/samples.parquet` as fallback, same pattern as existing `ecdysis.parquet` committed fallback.

---

## Complexity Assessment

| Feature | Complexity | Rationale |
|---------|------------|-----------|
| INAT-01: Fetch observations | LOW | pyinaturalist `get_observations(project_id=..., page='all')` is two lines |
| Specimen count field discovery | LOW | One API call to `/v1/projects/166376`; scan result for field name |
| INAT-02: Field extraction | LOW-MEDIUM | Standard fields are trivial; ofvs parsing with null handling adds one edge case |
| INAT-03: Write samples.parquet | LOW | Identical to existing ecdysis.parquet pipeline pattern |
| build-data.sh extension | LOW | Add one `python` call and one `cp` to existing shell script |

**Total estimate: 1–2 days of focused work.**

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| iNat API structure | HIGH | Live observation JSON in repo confirms field paths |
| pyinaturalist pagination | HIGH | `IDRangePaginator`, `page='all'` confirmed in paginator.py source |
| Rate limits | HIGH | Constants confirmed in pyinaturalist/constants.py source |
| Specimen count field ID | LOW | Field name/ID for WA Bee Atlas project not confirmed; must be discovered at runtime |
| WA project type | LOW | Not confirmed whether collection or traditional project; affects specimen count field reliability |
| ofvs included by default | MEDIUM | pyinaturalist v1 endpoint includes ofvs; Makefile v2 fieldspec does not include it — must add if using v2 |

---

## Sources

- `data/inat/projects.py` — WA project ID 166376 confirmed (HIGH)
- `data/inat/observation/300847934.json` — live iNat API v2 response structure (HIGH)
- `data/Makefile` — existing v2 fieldspec and fetch pattern (HIGH)
- `data/pyproject.toml` — pyinaturalist>=0.20.2 confirmed installed (HIGH)
- `data/.venv/.../pyinaturalist/paginator.py` — IDRangePaginator, page='all', exhaustion logic (HIGH)
- `data/.venv/.../pyinaturalist/constants.py` — PER_PAGE_RESULTS=200, rate limits confirmed (HIGH)
- `data/.venv/.../pyinaturalist/models/observation_field.py` — ofvs schema: field_id, name, value, datatype (HIGH)
- `data/.venv/.../pyinaturalist/v1/observations.py` — get_observations implementation (HIGH)
- [iNaturalist API Recommended Practices](https://www.inaturalist.org/pages/api+recommended+practices) — id_above pagination, 10k limit (MEDIUM)
- [pyinaturalist documentation](https://pyinaturalist.readthedocs.io/) — paginator, IDRangePaginator (MEDIUM)

---
*Feature research for: iNaturalist API pipeline — WA Bee Atlas v1.2*
*Researched: 2026-03-10*
