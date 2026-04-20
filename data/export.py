"""Export frontend assets from data/beeatlas.duckdb.

Produces three files in frontend/public/data/:
  - occurrences.parquet (full outer join of ecdysis specimens and iNat samples, with spatial columns)
  - counties.geojson    (WA county boundaries, simplified)
  - ecoregions.geojson  (WA ecoregion boundaries, simplified)

Usage:
    uv run --project data python data/export.py
"""

import json
import os
from pathlib import Path

import duckdb

DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))
_default_assets = str(Path(__file__).parent.parent / 'frontend' / 'public' / 'data')
ASSETS_DIR = Path(os.environ.get('EXPORT_DIR', _default_assets))


def export_occurrences_parquet(con: duckdb.DuckDBPyConnection) -> None:
    """Export occurrences.parquet from full outer join of ecdysis specimens and iNat samples."""
    out = str(ASSETS_DIR / "occurrences.parquet")
    con.execute(f"""
    COPY (
    WITH wa_counties AS (
        SELECT name AS county, ST_GeomFromText(geometry_wkt) AS geom
        FROM geographies.us_counties
        WHERE state_fips = '53'
    ),
    wa_eco AS (
        SELECT name AS ecoregion_l3, ST_GeomFromText(geometry_wkt) AS geom
        FROM geographies.ecoregions
        WHERE ST_Intersects(
            ST_GeomFromText(geometry_wkt),
            (SELECT ST_GeomFromText(geometry_wkt) FROM geographies.us_states WHERE abbreviation = 'WA')
        )
    ),
    id_modified AS (
        SELECT coreid, MAX(modified) AS max_id_modified
        FROM ecdysis_data.identifications
        GROUP BY coreid
    ),
    waba_link AS (
        SELECT
            CAST(ofv.value AS BIGINT) AS catalog_suffix,
            MIN(waba.id) AS specimen_observation_id
        FROM inaturalist_waba_data.observations waba
        JOIN inaturalist_waba_data.observations__ofvs ofv
            ON ofv._dlt_root_id = waba._dlt_id
            AND ofv.field_id = 18116
            AND ofv.value != ''
        GROUP BY catalog_suffix
    ),
    ecdysis_base AS (
        SELECT
            CAST(o.id AS INTEGER) AS ecdysis_id,
            o.catalog_number,
            CAST(o.decimal_longitude AS DOUBLE) AS ecdysis_lon,
            CAST(o.decimal_latitude AS DOUBLE) AS ecdysis_lat,
            o.event_date AS ecdysis_date,
            CAST(o.year AS INTEGER) AS year,
            CAST(o.month AS INTEGER) AS month,
            o.scientific_name AS scientificName,
            o.recorded_by AS recordedBy,
            o.field_number AS fieldNumber,
            o.genus,
            o.family,
            NULLIF(regexp_extract(o.associated_taxa, 'host:"([^"]+)"', 1), '') AS floralHost,
            links.host_observation_id,
            CASE WHEN inat.taxon__iconic_taxon_name = 'Plantae' THEN inat.taxon__name ELSE NULL END AS inat_host,
            inat.quality_grade AS inat_quality_grade,
            strftime(GREATEST(o.modified, COALESCE(im.max_id_modified, o.modified)), '%Y-%m-%d') AS modified,
            wl.specimen_observation_id,
            TRY_CAST(NULLIF(o.minimum_elevation_in_meters, '') AS INTEGER) AS elevation_m
        FROM ecdysis_data.occurrences o
        LEFT JOIN ecdysis_data.occurrence_links links ON links.occurrence_id = o.occurrence_id
        LEFT JOIN inaturalist_data.observations inat ON inat.id = links.host_observation_id
        LEFT JOIN id_modified im ON im.coreid = o.id
        LEFT JOIN waba_link wl ON wl.catalog_suffix = CAST(regexp_extract(o.catalog_number, '[0-9]+$', 0) AS BIGINT)
        WHERE o.decimal_latitude IS NOT NULL AND o.decimal_latitude != ''
    ),
    samples_base AS (
        SELECT
            op.id AS observation_id,
            op.user__login AS host_inat_login,
            CAST(op.observed_on AS VARCHAR) AS sample_date,
            op.observed_on AS sample_date_raw,
            op.longitude AS sample_lon,
            op.latitude AS sample_lat,
            CAST(sc.value AS INTEGER) AS specimen_count,
            TRY_CAST(sid.value AS INTEGER) AS sample_id
        FROM inaturalist_data.observations op
        JOIN inaturalist_data.observations__ofvs sc
            ON sc._dlt_root_id = op._dlt_id AND sc.field_id = 8338 AND sc.value != ''
        LEFT JOIN inaturalist_data.observations__ofvs sid
            ON sid._dlt_root_id = op._dlt_id AND sid.field_id = 9963
        WHERE op.longitude IS NOT NULL AND op.latitude IS NOT NULL
    ),
    joined AS (
        SELECT
            ROW_NUMBER() OVER () AS _row_id,
            e.ecdysis_id,
            e.catalog_number,
            COALESCE(e.ecdysis_lon, s.sample_lon) AS lon,
            COALESCE(e.ecdysis_lat, s.sample_lat) AS lat,
            COALESCE(e.ecdysis_date, s.sample_date) AS date,
            COALESCE(e.year, YEAR(s.sample_date_raw)) AS year,
            COALESCE(e.month, MONTH(s.sample_date_raw)) AS month,
            e.scientificName, e.recordedBy, e.fieldNumber, e.genus, e.family,
            e.floralHost, e.host_observation_id, e.inat_host, e.inat_quality_grade,
            e.modified, e.specimen_observation_id, e.elevation_m,
            s.observation_id, s.observer, s.specimen_count, s.sample_id
        FROM ecdysis_base e
        FULL OUTER JOIN samples_base s ON e.host_observation_id = s.observation_id
    ),
    occ_pt AS (
        SELECT *, ST_Point(lon, lat) AS pt FROM joined
    ),
    with_county AS (
        SELECT occ_pt._row_id, c.county
        FROM occ_pt
        LEFT JOIN wa_counties c ON ST_Within(occ_pt.pt, c.geom)
    ),
    county_fallback AS (
        SELECT _row_id,
            (SELECT county FROM wa_counties
             ORDER BY ST_Distance(geom,
                 (SELECT pt FROM occ_pt o2 WHERE o2._row_id = with_county._row_id))
             LIMIT 1) AS county
        FROM with_county
        WHERE county IS NULL
    ),
    final_county AS (
        SELECT * FROM with_county WHERE county IS NOT NULL
        UNION ALL SELECT * FROM county_fallback
    ),
    with_eco AS (
        SELECT occ_pt._row_id, e.ecoregion_l3
        FROM occ_pt
        LEFT JOIN wa_eco e ON ST_Within(occ_pt.pt, e.geom)
    ),
    eco_dedup AS (
        SELECT DISTINCT ON (_row_id) _row_id, ecoregion_l3
        FROM with_eco
    ),
    eco_fallback AS (
        SELECT _row_id,
            (SELECT ecoregion_l3 FROM wa_eco
             ORDER BY ST_Distance(geom,
                 (SELECT pt FROM occ_pt o2 WHERE o2._row_id = eco_dedup._row_id))
             LIMIT 1) AS ecoregion_l3
        FROM eco_dedup
        WHERE ecoregion_l3 IS NULL
    ),
    final_eco AS (
        SELECT * FROM eco_dedup WHERE ecoregion_l3 IS NOT NULL
        UNION ALL SELECT * FROM eco_fallback
    )
    SELECT
        j.ecdysis_id, j.catalog_number,
        j.lon, j.lat, j.date, j.year, j.month,
        j.scientificName, j.recordedBy, j.fieldNumber, j.genus, j.family,
        j.floralHost, j.host_observation_id, j.inat_host, j.inat_quality_grade,
        j.modified, j.specimen_observation_id, j.elevation_m,
        j.observation_id, j.observer, j.specimen_count, j.sample_id,
        fc.county, fe.ecoregion_l3
    FROM joined j
    JOIN final_county fc ON fc._row_id = j._row_id
    JOIN final_eco fe ON fe._row_id = j._row_id
    ) TO '{out}' (FORMAT PARQUET)
    """)

    # Verify: assert zero null county/ecoregion rows
    row = con.execute(f"""
    SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN county IS NULL THEN 1 ELSE 0 END) AS null_county,
        SUM(CASE WHEN ecoregion_l3 IS NULL THEN 1 ELSE 0 END) AS null_eco
    FROM read_parquet('{out}')
    """).fetchone()
    total, null_county, null_eco = row
    print(f"  occurrences.parquet: {total:,} rows, {null_county} null county, {null_eco} null ecoregion, "
          f"{(ASSETS_DIR / 'occurrences.parquet').stat().st_size:,} bytes")
    assert null_county == 0, f"occurrences.parquet has {null_county} rows with null county"
    assert null_eco == 0, f"occurrences.parquet has {null_eco} rows with null ecoregion_l3"


def export_counties_geojson(con: duckdb.DuckDBPyConnection) -> None:
    """Export counties.geojson with 39 WA county features (NAME property, simplified geometry)."""
    rows = con.execute("""
    SELECT name AS NAME,
           ST_AsGeoJSON(ST_SimplifyPreserveTopology(ST_GeomFromText(geometry_wkt), 0.001))
    FROM geographies.us_counties
    WHERE state_fips = '53'
    """).fetchall()
    features = [
        {"type": "Feature", "properties": {"NAME": name}, "geometry": json.loads(geom)}
        for name, geom in rows
    ]
    out = ASSETS_DIR / "counties.geojson"
    out.write_text(json.dumps({"type": "FeatureCollection", "features": features}))
    print(f"  counties.geojson: {len(features)} features, {out.stat().st_size:,} bytes")


def export_ecoregions_geojson(con: duckdb.DuckDBPyConnection) -> None:
    """Export ecoregions.geojson with WA ecoregion features (NA_L3NAME property, simplified geometry)."""
    rows = con.execute("""
    SELECT name AS NA_L3NAME,
           ST_AsGeoJSON(ST_SimplifyPreserveTopology(ST_GeomFromText(geometry_wkt), 0.001))
    FROM geographies.ecoregions
    WHERE ST_Intersects(
        ST_GeomFromText(geometry_wkt),
        (SELECT ST_GeomFromText(geometry_wkt) FROM geographies.us_states WHERE abbreviation = 'WA')
    )
    """).fetchall()
    features = [
        {"type": "Feature", "properties": {"NA_L3NAME": name}, "geometry": json.loads(geom)}
        for name, geom in rows
    ]
    out = ASSETS_DIR / "ecoregions.geojson"
    out.write_text(json.dumps({"type": "FeatureCollection", "features": features}))
    print(f"  ecoregions.geojson: {len(features)} features, {out.stat().st_size:,} bytes")


def main() -> None:
    """Export all three frontend asset files from beeatlas.duckdb."""
    print("Connecting to DuckDB...")
    con = duckdb.connect(DB_PATH)
    con.execute("INSTALL spatial; LOAD spatial;")
    print("Exporting frontend assets:")
    export_occurrences_parquet(con)
    export_counties_geojson(con)
    export_ecoregions_geojson(con)
    con.close()
    print("Done.")


if __name__ == "__main__":
    main()
