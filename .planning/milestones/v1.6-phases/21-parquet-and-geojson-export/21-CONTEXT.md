---
phase: 21
name: Parquet and GeoJSON Export
status: context-captured
date: 2026-03-27
---

# Phase 21 Context: Parquet and GeoJSON Export

## Domain

A single export script (`data/export.py`) reads from `data/beeatlas.duckdb` and writes:
- `frontend/src/assets/ecdysis.parquet` — with `inat_observation_id` joined from `ecdysis_data.occurrence_links`
- `frontend/src/assets/samples.parquet` — `specimen_count` from `observations__ofvs` where `field_id=8338`
- `frontend/src/assets/counties.geojson` — from `geographies.us_counties` filtered to `state_fips='53'`
- `frontend/src/assets/ecoregions.geojson` — from `geographies.ecoregions` filtered to polygons intersecting WA

Also updates `scripts/validate-schema.mjs`: add `inat_observation_id` to ecdysis.parquet check; remove `links.parquet` validation.

## Canonical References

- `.planning/REQUIREMENTS.md` — EXP-01, EXP-02, EXP-03, EXP-04, GEO-01, GEO-02
- `data/ecdysis_pipeline.py` — source for `ecdysis_data.occurrences` and `ecdysis_data.occurrence_links` table schemas
- `data/geographies_pipeline.py` — source for `geographies.*` table schemas (geometry stored as `geometry_wkt` WKT)
- `data/inaturalist_pipeline.py` — source for `inaturalist_data.observations` and `inaturalist_data.observations__ofvs` schemas
- `scripts/validate-schema.mjs` — schema validation gate to update (EXP-04)
- `frontend/src/parquet.ts` — canonical list of columns the frontend reads from each parquet file

## Decisions

### Export script structure
**Decision:** Single `data/export.py` script — one entry point that does everything: spatial join → parquet export → geojson export.
Phase 22's orchestration layer calls it once as a final step after all pipelines have run.

### Export implementation approach
**Decision:** Python script using the DuckDB Python API.
SQL does the heavy lifting (spatial joins, COPY TO for Parquet). Python handles the GeoJSON FeatureCollection wrapper assembly using `ST_AsGeoJSON()` rows. No pyarrow dependency needed — DuckDB's `COPY (SELECT ...) TO 'file.parquet' (FORMAT PARQUET)` writes Parquet natively.

### Ecoregions GeoJSON filter
**Decision:** Use `ST_Intersects` against the WA state polygon from `geographies.us_states` where `abbreviation='WA'`.
Principled — uses existing DuckDB data, correct if ecoregion polygon geometries change. Preferred over hardcoding the 11 known WA ecoregion names (which would be brittle).

### Spatial join approach (carrying forward from Phase 20 decision)
**Decision:** DuckDB spatial extension — `LOAD spatial; ST_GeomFromText(geometry_wkt)` to convert stored WKT, then `ST_Within` for primary join, `ST_Distance ORDER BY … LIMIT 1` as nearest-polygon fallback for null rows.
Replaces the deleted `data/spatial.py` / geopandas approach.

### inat_observation_id join
**Decision:** LEFT JOIN `ecdysis_data.occurrences` on `occurrence_id` → `ecdysis_data.occurrence_links` on `occurrence_id`. Result is nullable INT64 — most specimens won't have a link.

### floralHost extraction
**Implementation note (not a user decision):** `floralHost` in ecdysis.parquet maps to `associated_taxa` in DuckDB, which has format `host:"Plant Name"`. The export SQL needs to parse this with regex or string manipulation (e.g., `regexp_extract(associated_taxa, 'host:"([^"]+)"', 1)`). About 65% of rows have a value; the rest are NULL.

### specimen_count source
**Decision (from requirements):** Sourced from `inaturalist_data.observations__ofvs` where `field_id=8338` (not by field name — field was renamed circa 2024). Join via `_dlt_root_id` → observations `_dlt_id`.

### Output paths
Script uses `Path(__file__).parent` for the DB path (`beeatlas.duckdb`) and resolves output to `Path(__file__).parent.parent / "frontend/src/assets/"` — consistent with how the pipeline files hardcode `DB_PATH`.

## DuckDB Schema Notes

Key table columns the export needs:

**ecdysis_data.occurrences:**
- `id` (varchar) → `ecdysis_id` in parquet (the Ecdysis integer DB id, e.g. `5594056`)
- `occurrence_id` (varchar, UUID) → `occurrenceID`
- `decimal_longitude` / `decimal_latitude` (varchar) → `longitude` / `latitude`
- `year`, `month` (varchar) → need to cast to integer for parquet
- `scientific_name`, `recorded_by`, `field_number`, `genus`, `family` → camelCase in parquet
- `associated_taxa` → parse for `floralHost`

**ecdysis_data.occurrence_links:**
- `occurrence_id` (varchar UUID) — join key
- `inat_observation_id` (int64, nullable)

**inaturalist_data.observations:**
- `id` (int64) → `observation_id`
- `user__login` → `observer`
- `observed_on` (date) → `date`
- `longitude`, `latitude` (double) → `lon`, `lat`
- `_dlt_id` — join key for ofvs

**inaturalist_data.observations__ofvs:**
- `field_id` (bigint) — filter on 8338
- `value` (varchar) → cast to integer for `specimen_count`
- `_dlt_root_id` — join key back to observations

**geographies.us_counties:**
- `name`, `state_fips`, `geometry_wkt`

**geographies.ecoregions:**
- `name` → `NA_L3NAME` equivalent, `geometry_wkt`

**geographies.us_states:**
- `abbreviation`, `geometry_wkt` — WA polygon for ecoregion intersection filter

## Deferred Ideas

*(None captured during discussion)*
