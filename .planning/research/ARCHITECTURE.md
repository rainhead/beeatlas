# Architecture Research

**Domain:** BeeAtlas v2.3 — WABA specimen observation pipeline integration
**Researched:** 2026-04-12
**Confidence:** HIGH — code read directly; no external research needed

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         data/ pipeline layer                         │
├────────────────┬────────────────┬───────────────┬────────────────────┤
│ ecdysis_       │ inaturalist_   │ waba_          │ projects_/anti_   │
│ pipeline.py    │ pipeline.py    │ pipeline.py    │ entropy_pipeline  │
│                │ (dataset:      │ (dataset:      │                   │
│ ecdysis_data   │ inaturalist_   │ inaturalist_   │                   │
│ .occurrences   │ data)          │ waba_data)     │                   │
│ .occurrence_   │ .observations  │ .observations  │                   │
│  links         │ .observations  │ .observations  │                   │
│ (host_obs_id)  │  __ofvs        │  __ofvs        │                   │
├────────────────┴────────────────┴───────────────┴────────────────────┤
│                         beeatlas.duckdb                               │
├─────────────────────────────────────────────────────────────────────┤
│                            export.py                                  │
│   export_ecdysis_parquet():                                           │
│     joins occurrence_links (host_observation_id)                     │
│         + inaturalist_data.observations (host plant join)            │
│         + inaturalist_waba_data observations__ofvs (specimen join)   │
├─────────────────────────────────────────────────────────────────────┤
│              frontend/public/data/ (static parquet/geojson)          │
│   ecdysis.parquet: host_observation_id, specimen_observation_id      │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Status | Responsibility |
|-----------|--------|----------------|
| `inaturalist_pipeline.py` | UNCHANGED | Fetches project 166376 observations (host plants, collection events); writes to `inaturalist_data` |
| `waba_pipeline.py` | NEW | Fetches observations with field_id=18116 (WABA catalog number); writes to `inaturalist_waba_data` |
| `ecdysis_pipeline.py` | MODIFIED | Rename yield key `inat_observation_id` to `host_observation_id` |
| `export.py` | MODIFIED | Add `waba_link` CTE; add `specimen_observation_id` SELECT column; rename `inat_observation_id` to `host_observation_id` throughout |
| `run.py` | MODIFIED | Add `("waba", load_waba_observations)` step between `inaturalist` and `projects` |
| Frontend | MODIFIED | Rename `inat_observation_id` field access to `host_observation_id`; add `specimen_observation_id` link |

## Dataset Placement Decision: Separate Dataset

**Use `dataset_name="inaturalist_waba_data"`, not `"inaturalist_data"`.**

This is the only safe choice. Two concrete collision problems exist with sharing `inaturalist_data`:

**1. Table name collision.** dlt writes the resource named `observations` into `{dataset_name}.observations`. Both the existing `inaturalist_pipeline` and the new `waba_pipeline` produce a resource named `observations`. If both use `dataset_name="inaturalist_data"`, the second pipeline writes into the same table as the first. Even though WABA and project observations have different UUIDs (so dlt's `merge` won't corrupt individual rows), the tables become semantically mixed. The `observations__ofvs` child table is also shared, making it impossible for `export.py` to distinguish which `ofvs` rows belong to which source without adding a discriminator column that doesn't exist in the raw API response.

**2. Incremental cursor collision.** dlt stores pipeline state (including the `updated_since` cursor) keyed by `pipeline_name`. If two pipelines share `pipeline_name`, their cursors collide. Using separate `pipeline_name="waba"` and `pipeline_name="inaturalist"` avoids this — but even with distinct pipeline names, sharing the dataset name creates schema-level ambiguity that will cause confusion in `export.py` and tests.

**Conclusion:** `dataset_name="inaturalist_waba_data"` and `pipeline_name="waba"` gives complete isolation. `export.py` references both datasets by name explicitly, making the join intent self-documenting.

## Recommended Project Structure

```
data/
├── inaturalist_pipeline.py      # unchanged
├── waba_pipeline.py             # NEW — field_id=18116, inaturalist_waba_data dataset
├── ecdysis_pipeline.py          # modified — rename yield key
├── export.py                    # modified — WABA join + column renames
├── run.py                       # modified — add waba step
├── .dlt/
│   └── config.toml              # add [sources.waba] section if needed
└── tests/
    └── test_export.py           # add specimen_observation_id schema test + host rename test
```

## Architectural Patterns

### Pattern 1: Mirror inaturalist_pipeline.py for waba_pipeline.py

**What:** Duplicate the dlt RESTAPIConfig structure from `inaturalist_pipeline.py`, changing only the API filter parameter, `dataset_name`, and `pipeline_name`. Share `DEFAULT_FIELDS` and `_transform` either by import or inline copy.

**When to use:** Always — WABA field observations use the same iNat v2 REST API, same incremental cursor (`updated_at`), same `per_page=200`, same stop-after-empty-page paginator.

**API filter parameter:** Use `"field_id": 18116` in the endpoint `params` dict. The iNat v2 API accepts `field_id` as a query parameter to return only observations that have a value for that field. MEDIUM confidence on exact param name — verify with a quick `curl 'https://api.inaturalist.org/v2/observations?field_id=18116&per_page=1&fields=id'` before implementing.

**Trade-offs:** Small code duplication between the two pipeline files. A shared base is premature given only two pipelines and potentially divergent future needs (WABA may need field value extraction logic not relevant to project observations).

```python
# waba_pipeline.py skeleton
@dlt.source(name="waba")
def waba_source(write_disposition: str = "merge", fields: str = DEFAULT_FIELDS):
    config: RESTAPIConfig = {
        "client": {"base_url": "https://api.inaturalist.org/v2/"},
        "resource_defaults": {
            "primary_key": "uuid",
            "write_disposition": write_disposition,
        },
        "resources": [{
            "name": "observations",
            "endpoint": {
                "path": "observations",
                "params": {
                    "field_id": 18116,
                    "fields": fields,
                    "per_page": 200,
                    "updated_since": "{incremental.start_value}",
                },
                "incremental": {
                    "cursor_path": "updated_at",
                    "initial_value": "2000-01-01T00:00:00+00:00",
                },
                "data_selector": "results",
                "paginator": {
                    "type": "page_number",
                    "base_page": 1,
                    "page_param": "page",
                    "total_path": None,
                    "stop_after_empty_page": True,
                },
            },
            "processing_steps": [{"map": _transform}],
        }],
    }
    yield from rest_api_resources(config)

def load_waba_observations(full_reload: bool = False) -> None:
    pipeline = dlt.pipeline(
        pipeline_name="waba",
        destination=dlt.destinations.duckdb(DB_PATH),
        dataset_name="inaturalist_waba_data",
    )
    # same full_reload pattern as inaturalist_pipeline.load_observations()
```

### Pattern 2: catalog_number JOIN via split_part in export.py

**What:** Ecdysis `catalog_number` values are formatted as `WSDA_25034236`. WABA field values are the bare numeric suffix `25034236`. The join must strip the `WSDA_` prefix before matching.

**Implementation:** Use `split_part(o.catalog_number, '_', 2)` to extract the suffix. This is simpler and faster than regex. The WABA field value comes through dlt as a VARCHAR string; the Ecdysis catalog suffix is also VARCHAR — string equality comparison works directly.

**Add a new CTE in `export_ecdysis_parquet()`:**

```sql
waba_link AS (
    SELECT
        ofv.value AS catalog_suffix,
        obs.id AS specimen_observation_id
    FROM inaturalist_waba_data.observations obs
    JOIN inaturalist_waba_data.observations__ofvs ofv
        ON ofv._dlt_root_id = obs._dlt_id
        AND ofv.field_id = 18116
        AND ofv.value != ''
)
```

**Then add a LEFT JOIN in the final SELECT:**

```sql
LEFT JOIN waba_link wl
    ON o.catalog_number LIKE 'WSDA_%'
    AND wl.catalog_suffix = split_part(o.catalog_number, '_', 2)
```

**And add to the SELECT list:**

```sql
wl.specimen_observation_id,
```

**Why `LIKE 'WSDA_%'` guard:** DuckDB `split_part` returns the original string (not empty string) when the delimiter is absent. A catalog_number without `_` would return the full value as the "suffix", potentially matching a WABA field value incorrectly. The `LIKE` guard prevents false matches on specimens with different catalog number formats.

**Why split_part over regex:** `regexp_extract(o.catalog_number, 'WSDA_(\d+)', 1)` would also work but adds regex overhead and is less readable. `split_part` is sufficient for the single known prefix format.

**Deduplication consideration:** If a single catalog number has multiple WABA observations (e.g., multiple photographers), the JOIN produces multiple rows per specimen. Add `DISTINCT ON (obs.id)` or `GROUP BY ... LIMIT 1` in the `waba_link` CTE to ensure one specimen_observation_id per catalog suffix. The simplest approach: take the numerically smallest `obs.id` (earliest iNat observation ID) as the canonical link.

```sql
waba_link AS (
    SELECT DISTINCT ON (ofv.value)
        ofv.value AS catalog_suffix,
        obs.id AS specimen_observation_id
    FROM inaturalist_waba_data.observations obs
    JOIN inaturalist_waba_data.observations__ofvs ofv
        ON ofv._dlt_root_id = obs._dlt_id
        AND ofv.field_id = 18116
        AND ofv.value != ''
    ORDER BY ofv.value, obs.id ASC
)
```

### Pattern 3: Column rename inat_observation_id to host_observation_id

**What:** Every reference to the occurrence-scraping link column must be renamed. This column lives in `ecdysis_data.occurrence_links` (written by `ecdysis_pipeline.py`) and is consumed by `export.py`.

**DuckDB migration required:** The `ecdysis_data.occurrence_links` table already exists in `beeatlas.duckdb` with a physical column named `inat_observation_id`. Changing the dlt yield key alone does not rename the existing column — dlt `merge` disposition will add a new `host_observation_id` column while leaving `inat_observation_id` in place. The export JOIN on `links.host_observation_id` returns NULL for all pre-existing rows.

**Two acceptable approaches:**

Option A — One-time ALTER TABLE migration (preferred):
```python
# At the top of export.py main(), or as a migration step in run.py before export:
# (using read-write connection before the read-only export connection)
with duckdb.connect(DB_PATH) as mig:
    mig.execute("""
        ALTER TABLE ecdysis_data.occurrence_links
        RENAME COLUMN inat_observation_id TO host_observation_id
    """)
```
Run once; safe to re-run (DuckDB ALTER RENAME on a non-existent column raises an error, so wrap in a try/except or check `information_schema.columns` first).

Option B — Full reload of ecdysis-links:
Run `uv run python ecdysis_pipeline.py --full-reload` once after deploying the rename. This rebuilds `occurrence_links` from the HTML disk cache (already present) with the new column name. Slower but doesn't require a migration script.

**Scope of all rename changes:**

| File | Change |
|------|--------|
| `data/ecdysis_pipeline.py` | `yield {"occurrence_id": ..., "inat_observation_id": ...}` → `"host_observation_id"` |
| `data/export.py` | `links.inat_observation_id` → `links.host_observation_id` in LEFT JOIN and SELECT |
| `scripts/validate-schema.mjs` | `inat_observation_id` → `host_observation_id` in ecdysis.parquet column list |
| Frontend DuckDB queries | `inat_observation_id` column reference → `host_observation_id` |
| Frontend feature property access | `.inat_observation_id` → `.host_observation_id` in specimen detail display |

## Data Flow

### WABA Pipeline Flow

```
iNat v2 API (/observations?field_id=18116&updated_since=...)
    ↓ dlt incremental fetch (updated_since cursor, pipeline_name="waba")
inaturalist_waba_data.observations       (one row per iNat observation)
inaturalist_waba_data.observations__ofvs (child rows; field_id=18116 row has catalog suffix as value)
    ↓
export.py: waba_link CTE
    ↓ LEFT JOIN on split_part(catalog_number, '_', 2) = ofv.value
ecdysis_data.occurrences.catalog_number
    ↓
ecdysis.parquet: specimen_observation_id column (nullable BIGINT)
    ↓
frontend: iNat observation link shown in specimen detail sidebar
```

### run.py Step Ordering

Current: `ecdysis → ecdysis-links → inaturalist → projects → anti-entropy → export → feeds`

New: `ecdysis → ecdysis-links → inaturalist → waba → projects → anti-entropy → export → feeds`

**Rationale:** `waba` runs after `inaturalist` because both are iNat API consumers — grouping them reduces context switching and makes rate-limit reasoning clearer. `waba` runs before `export` because `export.py` reads from `inaturalist_waba_data` which must be populated first. `waba` before `projects` is also correct — no dependency either way — but after `inaturalist` is the natural grouping.

**run.py change:**

```python
from waba_pipeline import load_waba_observations

STEPS: list[tuple[str, Callable]] = [
    ("ecdysis", load_ecdysis),
    ("ecdysis-links", load_links),
    ("inaturalist", load_observations),
    ("waba", load_waba_observations),   # NEW — after inaturalist, before projects
    ("projects", load_projects),
    ("anti-entropy", run_anti_entropy),
    ("export", export_all),
    ("feeds", generate_feeds),
]
```

## Files Changed vs. Files New

| File | Status | Change Summary |
|------|--------|----------------|
| `data/waba_pipeline.py` | NEW | dlt pipeline; `field_id=18116` param; `pipeline_name="waba"`; `dataset_name="inaturalist_waba_data"` |
| `data/run.py` | MODIFIED | Import `load_waba_observations`; add `("waba", ...)` STEPS entry after `inaturalist` |
| `data/export.py` | MODIFIED | Add `waba_link` CTE; LEFT JOIN on catalog_number; add `specimen_observation_id` to SELECT; rename `links.inat_observation_id` → `links.host_observation_id`; optional one-time migration call |
| `data/ecdysis_pipeline.py` | MODIFIED | Rename yield key `inat_observation_id` → `host_observation_id` in `occurrence_links` resource |
| `data/.dlt/config.toml` | POSSIBLY MODIFIED | Add `[sources.waba]` section only if waba_pipeline exposes dlt.config.value params |
| `scripts/validate-schema.mjs` | MODIFIED | `inat_observation_id` → `host_observation_id`; add `specimen_observation_id` to ecdysis.parquet column assertions |
| `data/tests/test_export.py` | MODIFIED | Update column name assertions; add `specimen_observation_id` in output schema test |
| Frontend (multiple files) | MODIFIED | `inat_observation_id` field access → `host_observation_id`; add `specimen_observation_id` link rendering in specimen detail |

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| iNat v2 API (`/observations?field_id=18116`) | dlt RESTAPIConfig, same as existing inaturalist_pipeline | Verify `field_id` param name against live API before implementing; MEDIUM confidence |
| beeatlas.duckdb | dlt destination + direct duckdb connection in export.py | `inaturalist_waba_data` schema created by dlt on first pipeline run |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `waba_pipeline.py` → `beeatlas.duckdb` | dlt write, `dataset_name="inaturalist_waba_data"` | Schema auto-created; no migration needed for the new tables |
| `export.py` → `inaturalist_waba_data` | Direct SQL JOIN in CTE | `read_only=True` connection; waba step must complete before export |
| `ecdysis_data.occurrence_links` column rename | One-time ALTER TABLE or --full-reload | Must happen before first post-deploy pipeline run to avoid NULL host_observation_id |

## Anti-Patterns

### Anti-Pattern 1: Sharing inaturalist_data dataset with the new pipeline

**What people do:** Use `dataset_name="inaturalist_data"` for the WABA pipeline to keep all iNat data together.

**Why it's wrong:** dlt writes the resource named `observations` into `{dataset_name}.observations`. With two pipelines sharing `inaturalist_data`, the WABA observations merge into the same table as project observations. The `observations__ofvs` child table is also shared. `export.py` can no longer distinguish host-plant `ofvs` rows (field_id=8338, 9963) from WABA catalog-number rows (field_id=18116) without a source-discriminator column that doesn't exist. The existing `export_samples_parquet()` query joins `observations__ofvs` and would pick up WABA rows unexpectedly.

**Do this instead:** `dataset_name="inaturalist_waba_data"` — complete table-level isolation at zero additional complexity cost.

### Anti-Pattern 2: Regex for catalog_number suffix extraction

**What people do:** `regexp_extract(o.catalog_number, 'WSDA_(\d+)', 1)` for the JOIN predicate.

**Why it's wrong:** Not wrong, just unnecessary. `split_part(o.catalog_number, '_', 2)` is faster and more readable. Regex is appropriate if multiple prefix formats exist; currently there is only `WSDA_`.

**Do this instead:** `split_part(o.catalog_number, '_', 2)` with a `LIKE 'WSDA_%'` guard to prevent false matches on catalog numbers without the expected prefix.

### Anti-Pattern 3: Renaming the DuckDB column via dlt code change alone

**What people do:** Change the yield dict key from `inat_observation_id` to `host_observation_id` in `ecdysis_pipeline.py` and expect the live table to reflect the rename after the next pipeline run.

**Why it's wrong:** dlt `merge` disposition adds new rows with the new column name while the existing column (`inat_observation_id`) persists. `export.py` JOIN on `links.host_observation_id` returns NULL for all pre-existing rows, silently dropping all host observation links from ecdysis.parquet.

**Do this instead:** Run a one-time `ALTER TABLE ecdysis_data.occurrence_links RENAME COLUMN inat_observation_id TO host_observation_id` before the first post-deploy export run, or use `--full-reload` on the ecdysis-links step to rebuild from the HTML disk cache.

### Anti-Pattern 4: No deduplication in waba_link CTE

**What people do:** Join `observations__ofvs` directly without `DISTINCT ON`, allowing multiple WABA observations for the same catalog number to produce multiple rows per specimen in the final SELECT.

**Why it's wrong:** If two iNat users photograph the same specimen, the catalog number appears twice in `waba_link`, causing ecdysis.parquet to have duplicate rows for those specimens.

**Do this instead:** `DISTINCT ON (ofv.value) ... ORDER BY ofv.value, obs.id ASC` in the `waba_link` CTE picks the earliest observation ID per catalog number, giving a deterministic single row per specimen.

## Sources

- Direct code inspection: `data/inaturalist_pipeline.py`, `data/export.py`, `data/run.py`, `data/ecdysis_pipeline.py`, `data/.dlt/config.toml`, `.planning/PROJECT.md` (HIGH confidence)
- DuckDB `split_part` and `DISTINCT ON` semantics: standard DuckDB SQL; HIGH confidence from direct DuckDB documentation knowledge (cutoff August 2025)
- iNat v2 API `field_id` query parameter: MEDIUM confidence — consistent with `ofvs.field_id` usage in existing export.py; verify against live API before implementing

---

*Architecture research for: BeeAtlas v2.3 WABA specimen observation pipeline*
*Researched: 2026-04-12*
