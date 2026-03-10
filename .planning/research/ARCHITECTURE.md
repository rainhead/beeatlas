# Architecture Research: iNaturalist Pipeline Integration

**Domain:** Python data pipeline — adding iNaturalist API fetch to existing Ecdysis pipeline
**Researched:** 2026-03-10
**Confidence:** HIGH — grounded in direct codebase inspection; iNat API patterns confirmed via official documentation

---

## Context: Current State (v1.1 shipped)

The existing pipeline is:

```
scripts/build-data.sh
  uv run python ecdysis/download.py --datasetid 44
    → POST to ecdysis.org → ecdysis_<date>_.zip
  uv run python ecdysis/occurrences.py <zipfile>
    → reads occurrences.tab → writes data/ecdysis.parquet
  cp data/ecdysis.parquet frontend/src/assets/ecdysis.parquet
```

`npm run build` calls `build-data.sh` then `npm run build --workspace=frontend`. GitHub Actions runs `npm run build` on every branch push. The frontend Vite build includes `ecdysis.parquet` as a `?url` asset (content-hashed), read client-side by hyparquet.

**Existing infrastructure already in place for v1.2:**
- `data/pyproject.toml` already lists `pyinaturalist>=0.20.2` and `pyinaturalist-convert>=0.7.4` as dependencies
- `data/inat/__init__.py` exists (empty)
- `data/inat/projects.py` exists with `atlas_projects = {"wa": 166376}` — Washington Bee Atlas project ID is known
- `data/inat/observations.py` exists but is currently empty (1 line, blank)
- `data/Makefile` has an in-progress iNat target using `duckdb` (incomplete) — this approach is abandoned in favor of consistent Python/pyarrow tooling

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  scripts/build-data.sh  (orchestrator — MODIFIED)               │
│                                                                  │
│  Step 1: ecdysis/download.py --datasetid 44                      │
│    POST ecdysis.org  →  ecdysis_<date>_.zip                      │
│                                                                  │
│  Step 2: ecdysis/occurrences.py <zipfile>                        │
│    reads .zip  →  data/ecdysis.parquet                           │
│                                                                  │
│  Step 3: inat/download.py  (NEW)                                 │
│    GET api.inaturalist.org  →  data/samples.parquet              │
│                                                                  │
│  Step 4: cp data/ecdysis.parquet  →  frontend/src/assets/        │
│  Step 5: cp data/samples.parquet  →  frontend/src/assets/ (NEW) │
└─────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────┐
│  npm run build --workspace=frontend  (UNCHANGED)                │
│  Vite bundles both .parquet files as content-hashed ?url assets  │
│  → frontend/dist/assets/ecdysis-[hash].parquet                  │
│  → frontend/dist/assets/samples-[hash].parquet  (new artifact)  │
└─────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────┐
│  aws s3 sync frontend/dist/  →  S3  →  CloudFront              │
│  (GitHub Actions deploy job — UNCHANGED)                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Boundaries

| Component | Status | Responsibility | Notes |
|-----------|--------|---------------|-------|
| `data/inat/download.py` | **NEW** (core deliverable) | Query iNat API v1 `GET /v1/observations?project_id=166376`, paginate via `id_above`, extract required fields, write `data/samples.parquet` | `data/inat/projects.py` has the project ID already |
| `data/inat/observations.py` | **NEW (fill in)** | Currently empty — can hold shared extraction helpers (parse ofvs for specimen count, build row dict from observation) | May stay inline in `download.py` if simple enough |
| `scripts/build-data.sh` | **MODIFIED** | Add steps: run `inat/download.py`, copy `data/samples.parquet` to `frontend/src/assets/` | Two lines added after existing ecdysis steps |
| `frontend/src/assets/samples.parquet` | **NEW** | Committed fallback — empty parquet with correct schema (observation_id, observer, date, lat, lon, specimen_count); prevents CI breakage if iNat API is unavailable | Matches the `ecdysis.parquet` committed-fallback pattern |
| `data/ecdysis/download.py` | **UNCHANGED** | Existing Ecdysis fetch — no modifications needed |  |
| `data/ecdysis/occurrences.py` | **UNCHANGED** | Existing Ecdysis processing — no modifications needed |  |
| `frontend/` (all files) | **UNCHANGED for v1.2** | v1.2 scope is pipeline only — no map layer, no sidebar changes | MAP-03/MAP-04 deferred to v1.3+ |
| `infra/` (CDK) | **UNCHANGED** | No new AWS resources needed | `samples.parquet` deploys via existing `aws s3 sync` |
| `.github/workflows/deploy.yml` | **UNCHANGED** | CI already calls `npm run build` which calls `build-data.sh` | iNat download will run on every push — mitigated by committed fallback |

---

## Data Flow

### Pipeline Build Flow

```
inat/download.py
    GET https://api.inaturalist.org/v1/observations
        params: project_id=166376, per_page=200, order_by=id, order=asc,
                id_above=0, fields=id,user.login,observed_on,geojson,ofvs
    while len(page) == 200:
        id_above = page[-1]['id']
        fetch next page
    → extract per observation:
        observation_id  int64       observation['id']
        observer        str         observation['user']['login']
        date            str         observation['observed_on']  (ISO date YYYY-MM-DD)
        lat             float64     observation['geojson']['coordinates'][1]
        lon             float64     observation['geojson']['coordinates'][0]
        specimen_count  Int64       observation_field_value named "Number of Specimens"
                                    (nullable — field may be absent on some observations)
    → pd.DataFrame → df.to_parquet('data/samples.parquet', engine='pyarrow', index=False)
```

### samples.parquet Schema

| Column | Type | Source |
|--------|------|--------|
| `observation_id` | int64 | `observation['id']` |
| `observer` | string (pd.StringDtype) | `observation['user']['login']` |
| `date` | string (pd.StringDtype) | `observation['observed_on']` |
| `lat` | float64 | `observation['geojson']['coordinates'][1]` |
| `lon` | float64 | `observation['geojson']['coordinates'][0]` |
| `specimen_count` | Int64 (nullable) | observation field value "Number of Specimens" |

Using `pd.StringDtype()` for strings (not bare `'string'`) matches the pattern established in `ecdysis/occurrences.py`. Using nullable `Int64` for `specimen_count` matches `ecdysis/occurrences.py` nullable integer columns.

### Observation Field Extraction (specimen_count)

iNat API returns observation field values in `ofvs` (array of objects with `name` and `value` keys). Extract the specimen count like:

```python
def extract_specimen_count(ofvs: list[dict]) -> int | None:
    for ofv in ofvs:
        if ofv.get('name') == 'Number of Specimens':
            try:
                return int(ofv['value'])
            except (ValueError, KeyError):
                return None
    return None
```

The exact field name used by the Washington Bee Atlas project must be confirmed against actual API responses. The field name may differ (e.g., "Specimen count", "# specimens"). The pipeline script should log field names found on the first fetched page to support debugging.

**Confidence: MEDIUM** — field name confirmed as a common iNat bee atlas observation field pattern but must be verified against actual project data (project ID 166376).

### Build Script Modification

```bash
# scripts/build-data.sh (additions after existing ecdysis steps)

echo "--- Fetching iNaturalist data ---"
uv run python inat/download.py

cp samples.parquet "$REPO_ROOT/frontend/src/assets/samples.parquet"
echo "--- Done: samples.parquet copied to frontend/src/assets/ ---"
```

The existing `cd "$REPO_ROOT/data"` at the top of `build-data.sh` means all paths inside the script are relative to `data/`. `samples.parquet` is written there by `inat/download.py`, then copied to `frontend/src/assets/`.

---

## Build Order (Dependency-Aware)

```
Step 1  data/inat/observations.py  (helper extraction functions)
        Independent — can stub out and test against real API data
        Produces: extract_row(), extract_specimen_count() functions

Step 2  data/inat/download.py  (main pipeline script)
        Depends on: observations.py helpers, data/inat/projects.py (already has project ID)
        Produces: data/samples.parquet

Step 3  frontend/src/assets/samples.parquet  (committed stub)
        Depends on: knowing the schema (from Step 2 design)
        Can be created before Step 2 is working using a minimal hand-crafted file
        Prevents: CI breakage if iNat API unavailable during build

Step 4  scripts/build-data.sh modification
        Depends on: Step 2 (download.py exists and produces output)
        Adds: iNat download step and cp command

        End-to-end test: npm run build:data runs both pipelines,
        both .parquet files land in frontend/src/assets/

Step 5  Verify end-to-end
        Run build-data.sh locally, confirm samples.parquet row count,
        confirm schema columns match INAT-02/INAT-03 requirements
```

Steps 1 and 3 are parallelizable. Step 2 blocks Step 4. The committed stub (Step 3) should be created early to prevent CI issues on the feature branch.

---

## Architectural Patterns

### Pattern 1: id_above Pagination (not page= offset)

**What:** iNat API v1 caps offset-based pagination at 10,000 results. For any project that may exceed this, use cursor-based pagination via `id_above` with `order_by=id&order=asc`.

**When to use:** Always for project observation fetches, even if current count is low. The Washington Bee Atlas project will grow over time.

**Trade-offs:** Slightly more complex loop than `page='all'`; eliminates the 10,000 row hard cap.

```python
def fetch_project_observations(project_id: int) -> list[dict]:
    results = []
    id_above = 0
    while True:
        resp = requests.get(
            'https://api.inaturalist.org/v1/observations',
            params={
                'project_id': project_id,
                'per_page': 200,
                'order_by': 'id',
                'order': 'asc',
                'id_above': id_above,
            },
            timeout=30,
        )
        resp.raise_for_status()
        page = resp.json()['results']
        results.extend(page)
        if len(page) < 200:
            break
        id_above = page[-1]['id']
    return results
```

Note: `pyinaturalist.get_observations(project_id=..., page='all')` is available and handles this automatically. The direct `requests` approach is also acceptable given the project already uses `requests` in `ecdysis/download.py`. Either is viable; direct requests requires no extra abstraction.

### Pattern 2: Consistent pyarrow/pandas Output (matching ecdysis/occurrences.py)

**What:** Write Parquet using `df.to_parquet(path, engine='pyarrow', index=False)` with `pd.StringDtype()` for string columns and nullable `Int64` for integer columns that may be null.

**When to use:** All pipeline Parquet outputs.

**Trade-offs:** Consistent column typing makes hyparquet frontend reading predictable. GeoDataFrame is not needed for iNat data (no spatial operations in this pipeline step — coordinates are just columns).

### Pattern 3: Committed Fallback Parquet

**What:** Commit a minimal valid `samples.parquet` (empty or with stub rows, correct schema) to `frontend/src/assets/`.

**When to use:** Any data file that is regenerated by a network-dependent pipeline step.

**Trade-offs:** Adds a binary file to git history. The file is small (~1–5 KB empty schema) and the tradeoff is justified: CI never breaks due to iNat API unavailability. Matches the existing `ecdysis.parquet` committed-fallback pattern already in the repo.

### Pattern 4: Graceful Handling of Missing Fields

**What:** iNat observations in a project may not all have the "Number of Specimens" observation field filled in. Download script must handle missing `ofvs`, empty `ofvs`, field name not found, and non-integer values — all mapped to `None` (nullable).

**When to use:** All observation field extraction.

**Trade-offs:** Nullable `specimen_count` requires the frontend to handle null values when displaying samples. This is correct behavior for v1.2 since MAP-03/MAP-04 (visual layer) is deferred.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Using pyinaturalist.get_observations(page='all') Unconditionally

**What people do:** Pass `page='all'` and rely on the library to handle pagination automatically.

**Why it's wrong:** The `page='all'` shortcut still uses offset-based pagination internally for some endpoints. For large projects, this hits the 10,000 observation ceiling. The iNat API recommended practices explicitly call out `id_above` as the correct approach for large result sets.

**Do this instead:** Use explicit `id_above` cursor pagination. The Washington Bee Atlas project (project ID 166376) currently has a manageable number of observations, but writing it correctly now avoids a rewrite when the project grows.

### Anti-Pattern 2: Running the iNat Download on Every CI Push

**What people do:** Add `uv run python inat/download.py` to `build-data.sh` without a fallback.

**Why it's wrong:** GitHub Actions runs `npm run build` (which calls `build-data.sh`) on every push to every branch. If the iNat API is unavailable (rate limited, maintenance, network issue), every CI build fails. The existing Ecdysis download has this exact vulnerability, documented as known tech debt in `PROJECT.md`.

**Do this instead:** Commit a valid stub `samples.parquet` before merging the iNat download step. The CI build overwrites the stub if the API succeeds; falls back to the committed stub if it fails. Optionally gate the live download behind an environment variable to allow CI to skip it.

### Anti-Pattern 3: Using duckdb for the iNat Pipeline

**What people do:** Continue the Makefile approach (`data/Makefile` has an in-progress iNat/duckdb target).

**Why it's wrong:** The Makefile target is incomplete (truncated SQL). The rest of the pipeline (`ecdysis/download.py`, `ecdysis/occurrences.py`) uses Python/pandas/pyarrow consistently. Mixing duckdb CLI invocations into the pipeline requires duckdb to be installed separately (it is in `pyproject.toml` as a Python package, but the Makefile invokes it as a CLI tool). Build orchestration via `build-data.sh` calling Python scripts is the established pattern.

**Do this instead:** Write `inat/download.py` as a Python script invoked by `build-data.sh`, consistent with the existing ecdysis scripts. The `pyinaturalist` and `pyinaturalist-convert` packages are already declared as dependencies.

### Anti-Pattern 4: Fetching `ofvs` Without Requesting the Field Explicitly

**What people do:** Call the iNat API without specifying `fields` and assume `ofvs` will be present.

**Why it's wrong:** The iNat API v1 returns a default field set that may not include observation field values. Requesting `fields=id,user.login,observed_on,geojson,ofvs` (or equivalent) ensures the response includes what the pipeline needs and reduces payload size.

**Do this instead:** Specify fields explicitly in the API request. Verify against actual response before finalizing the column extraction logic.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| iNaturalist API v1 | `GET /v1/observations?project_id=166376` via `requests` (or pyinaturalist wrapper) | Rate limit: ~1 req/sec recommended. 200 obs/page max. `id_above` pagination for > 10k obs. |
| ecdysis.org | Existing POST pattern in `ecdysis/download.py` — unchanged | No changes; runs as Step 1-2 in `build-data.sh` |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `inat/download.py` → filesystem | Writes `data/samples.parquet` | Same directory as `data/ecdysis.parquet` |
| `scripts/build-data.sh` → `inat/download.py` | `uv run python inat/download.py` | Consistent with existing `uv run python ecdysis/download.py` invocation |
| `build-data.sh` → `frontend/src/assets/` | `cp data/samples.parquet frontend/src/assets/samples.parquet` | Same `cp` pattern as `ecdysis.parquet` |
| `frontend/src/assets/samples.parquet` → Vite | `import samplesDump from './assets/samples.parquet?url'` | v1.2 defers this — samples.parquet just needs to be a valid file so Vite doesn't error on build |

---

## Scalability Considerations

| Concern | Now (hundreds of obs) | At 5K+ obs | Notes |
|---------|----------------------|------------|-------|
| API pagination | Likely single page | Multiple pages via id_above | Loop handles both cases |
| samples.parquet size | ~5–15 KB | ~100–200 KB | Negligible at both scales |
| CI API call frequency | Low risk (small count, fast fetch) | Low risk | Committed fallback prevents build failures |
| iNat rate limit | Not a concern | Not a concern | Project observations fit in a handful of pages at 200/page |

---

## Sources

- **iNaturalist API v1 docs** (official): https://api.inaturalist.org/v1/docs/
- **iNat API recommended practices** (id_above pagination): https://www.inaturalist.org/pages/api+recommended+practices
- **pyinaturalist docs** (get_observations, page='all', id_above): https://pyinaturalist.readthedocs.io/en/stable/
- **pyinaturalist-convert** (to_dataframe, to_parquet): https://github.com/pyinat/pyinaturalist-convert
- **Existing codebase** (direct inspection, HIGH confidence):
  - `scripts/build-data.sh` — pipeline orchestration pattern
  - `data/ecdysis/download.py` — fetch + zip write pattern
  - `data/ecdysis/occurrences.py` — pandas dtype pattern, to_parquet call
  - `data/inat/projects.py` — Washington Bee Atlas project ID 166376
  - `data/inat/observations.py` — currently empty; placeholder for extraction helpers
  - `data/pyproject.toml` — pyinaturalist, pyinaturalist-convert already declared
  - `.github/workflows/deploy.yml` — CI runs on all branches (every push)
  - `.planning/PROJECT.md` — v1.2 scope (pipeline only, no frontend changes)

---

*Architecture research for: iNaturalist API pipeline integration (v1.2)*
*Researched: 2026-03-10*
