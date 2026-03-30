# beeatlas-data

Ingestion pipelines that load observation, specimen, and geographic data into `beeatlas.duckdb` for export as Parquet files.

All commands below assume `data/` is your working directory.

## Data sources

### iNaturalist observations (`inaturalist_pipeline.py`)

Loads observations from the [iNaturalist v2 API](https://api.inaturalist.org/v2/) for a single project. Configured via `.dlt/config.toml`:

```toml
[sources.inaturalist]
project_id = 166376
```

Loads incrementally by `updated_at`. Writes to `inaturalist_data.observations` (with an `is_deleted` flag, maintained by the anti-entropy pipeline) and `inaturalist_data.observations__observation_projects` (join table of observation ↔ project memberships).

### iNaturalist projects (`projects_pipeline.py`)

Looks up project names from the [iNaturalist v1 API](https://api.inaturalist.org/v1/) for every project ID referenced in `observations__observation_projects`. Projects are treated as immutable — already-loaded projects are skipped. Writes to `inaturalist_data.projects`.

### Ecdysis specimens (`ecdysis_pipeline.py`)

Loads occurrence and identification records from the [Ecdysis portal](https://ecdysis.org/). Configured via `.dlt/config.toml`:

```toml
[sources.ecdysis]
dataset_id = 44

[sources.ecdysis_links]
db_path = "beeatlas.duckdb"
html_cache_dir = "raw/ecdysis_cache"
```

Writes to `ecdysis_data`.

### Geographic boundaries (`geographies_pipeline.py`)

Loads polygon boundaries for spatial annotation from the following upstream sources:

| Table | Source |
|---|---|
| `geographies.ecoregions` | [EPA Level III Ecoregions (North America)](https://dmap-prod-oms-edc.s3.us-east-1.amazonaws.com/ORD/Ecoregions/cec_na/NA_CEC_Eco_Level3.zip) |
| `geographies.us_states` | [US Census TIGER 2024](https://www2.census.gov/geo/tiger/TIGER2024/STATE/tl_2024_us_state.zip) |
| `geographies.us_counties` | [US Census TIGER 2024](https://www2.census.gov/geo/tiger/TIGER2024/COUNTY/tl_2024_us_county.zip) |
| `geographies.ca_provinces` | [Statistics Canada 2021 Census](https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/files-fichiers/lpr_000b21a_e.zip) |
| `geographies.ca_census_divisions` | [Statistics Canada 2021 Census](https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/files-fichiers/lcd_000b21a_e.zip) |

Geometries are stored as WKT in `geometry_wkt` columns for use with DuckDB's spatial extension. Downloads are cached in `.geography_cache/` and support resumable downloads. Expect ~8–9 minutes on first run.

### Anti-entropy (`anti_entropy_pipeline.py`)

Detects observations that have been deleted from iNaturalist or removed from the project since they were loaded. Samples observations from the local database (weighted toward recency using harmonic decay) and re-fetches them from the API. Observations not returned by the API are soft-deleted by setting `is_deleted = true` in `inaturalist_data.observations`.

Run periodically alongside the main pipeline to keep soft-delete state current.

## Loading data

Install dependencies:

```bash
uv sync
```

Run pipelines in order:

```bash
uv run python inaturalist_pipeline.py
uv run python projects_pipeline.py
uv run python ecdysis_pipeline.py
uv run python geographies_pipeline.py
```

Optionally run anti-entropy to detect soft-deleted observations (defaults to sampling 200 observations):

```bash
uv run python anti_entropy_pipeline.py
uv run python anti_entropy_pipeline.py 500  # sample more observations
```

### Full reload

To drop all iNaturalist observation data and reload from scratch (e.g. after adding new fields):

```bash
uv run python inaturalist_pipeline.py --full-reload
```

The geographies pipeline always does a full reload. The projects pipeline skips already-loaded projects automatically.
