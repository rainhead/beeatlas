"""Export frontend assets from data/beeatlas.duckdb.

Produces four files in frontend/src/assets/:
  - ecdysis.parquet    (specimen data with spatial columns and host_observation_id)
  - samples.parquet    (sample data with spatial columns and specimen_count)
  - counties.geojson   (WA county boundaries, simplified)
  - ecoregions.geojson (WA ecoregion boundaries, simplified)

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


def export_ecdysis_parquet(con: duckdb.DuckDBPyConnection) -> None:
    """Export ecdysis.parquet with columns including catalog_number, county, ecoregion_l3, host_observation_id, inat_host, inat_quality_grade, specimen_observation_id."""
    out = str(ASSETS_DIR / "ecdysis.parquet")
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
    occ AS (
        SELECT *,
               ST_Point(CAST(decimal_longitude AS DOUBLE), CAST(decimal_latitude AS DOUBLE)) AS pt
        FROM ecdysis_data.occurrences
        WHERE decimal_latitude IS NOT NULL AND decimal_latitude != ''
    ),
    with_county AS (
        SELECT occ.occurrence_id, c.county
        FROM occ
        LEFT JOIN wa_counties c ON ST_Within(occ.pt, c.geom)
    ),
    county_fallback AS (
        SELECT occurrence_id,
            (SELECT county FROM wa_counties
             ORDER BY ST_Distance(geom,
                 (SELECT pt FROM occ o2 WHERE o2.occurrence_id = with_county.occurrence_id))
             LIMIT 1) AS county
        FROM with_county
        WHERE county IS NULL
    ),
    final_county AS (
        SELECT * FROM with_county WHERE county IS NOT NULL
        UNION ALL SELECT * FROM county_fallback
    ),
    with_eco AS (
        SELECT occ.occurrence_id, e.ecoregion_l3
        FROM occ
        LEFT JOIN wa_eco e ON ST_Within(occ.pt, e.geom)
    ),
    eco_dedup AS (
        SELECT DISTINCT ON (occurrence_id) occurrence_id, ecoregion_l3
        FROM with_eco
    ),
    eco_fallback AS (
        SELECT occurrence_id,
            (SELECT ecoregion_l3 FROM wa_eco
             ORDER BY ST_Distance(geom,
                 (SELECT pt FROM occ o2 WHERE o2.occurrence_id = eco_dedup.occurrence_id))
             LIMIT 1) AS ecoregion_l3
        FROM eco_dedup
        WHERE ecoregion_l3 IS NULL
    ),
    final_eco AS (
        SELECT * FROM eco_dedup WHERE ecoregion_l3 IS NOT NULL
        UNION ALL SELECT * FROM eco_fallback
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
    )
    SELECT
        CAST(o.id AS INTEGER) AS ecdysis_id,
        o.catalog_number,
        CAST(o.decimal_longitude AS DOUBLE) AS longitude,
        CAST(o.decimal_latitude AS DOUBLE) AS latitude,
        o.event_date AS date,
        CAST(o.year AS INTEGER) AS year,
        CAST(o.month AS INTEGER) AS month,
        o.scientific_name AS scientificName,
        o.recorded_by AS recordedBy,
        o.field_number AS fieldNumber,
        o.genus,
        o.family,
        NULLIF(regexp_extract(o.associated_taxa, 'host:"([^"]+)"', 1), '') AS floralHost,
        fc.county,
        fe.ecoregion_l3,
        links.host_observation_id,
        CASE WHEN inat.taxon__iconic_taxon_name = 'Plantae' THEN inat.taxon__name ELSE NULL END AS inat_host,
        inat.quality_grade AS inat_quality_grade,
        strftime(GREATEST(o.modified, COALESCE(im.max_id_modified, o.modified)), '%Y-%m-%d') AS modified,
        wl.specimen_observation_id
    FROM ecdysis_data.occurrences o
    JOIN final_county fc ON fc.occurrence_id = o.occurrence_id
    JOIN final_eco fe ON fe.occurrence_id = o.occurrence_id
    LEFT JOIN ecdysis_data.occurrence_links links ON links.occurrence_id = o.occurrence_id
    LEFT JOIN inaturalist_data.observations inat ON inat.id = links.host_observation_id
    LEFT JOIN id_modified im ON im.coreid = o.id
    LEFT JOIN waba_link wl ON wl.catalog_suffix = CAST(regexp_extract(o.catalog_number, '[0-9]+$', 0) AS BIGINT)
    WHERE o.decimal_latitude IS NOT NULL AND o.decimal_latitude != ''
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
    waba_row = con.execute(f"""
    SELECT COUNT(*) FROM read_parquet('{out}') WHERE specimen_observation_id IS NOT NULL
    """).fetchone()
    print(f"  ecdysis.parquet: {total:,} rows, {null_county} null county, {null_eco} null ecoregion, "
          f"{waba_row[0]:,} specimen_observation_id, "
          f"{(ASSETS_DIR / 'ecdysis.parquet').stat().st_size:,} bytes")
    assert null_county == 0, f"ecdysis.parquet has {null_county} rows with null county"
    assert null_eco == 0, f"ecdysis.parquet has {null_eco} rows with null ecoregion_l3"


def export_samples_parquet(con: duckdb.DuckDBPyConnection) -> None:
    """Export samples.parquet with 9 columns including county, ecoregion_l3, specimen_count."""
    out = str(ASSETS_DIR / "samples.parquet")
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
    obs_pt AS (
        SELECT _dlt_id, id, user__login, observed_on, longitude, latitude,
               ST_Point(longitude, latitude) AS pt
        FROM inaturalist_data.observations
        WHERE longitude IS NOT NULL AND latitude IS NOT NULL
    ),
    with_specimen AS (
        SELECT
            op._dlt_id, op.id, op.user__login, op.observed_on, op.longitude, op.latitude, op.pt,
            CAST(sc.value AS INTEGER) AS specimen_count,
            TRY_CAST(sid.value AS INTEGER) AS sample_id
        FROM obs_pt op
        JOIN inaturalist_data.observations__ofvs sc
            ON sc._dlt_root_id = op._dlt_id AND sc.field_id = 8338 AND sc.value != ''
        LEFT JOIN inaturalist_data.observations__ofvs sid
            ON sid._dlt_root_id = op._dlt_id AND sid.field_id = 9963
    ),
    with_county AS (
        SELECT ws._dlt_id, c.county
        FROM with_specimen ws
        LEFT JOIN wa_counties c ON ST_Within(ws.pt, c.geom)
    ),
    county_fallback AS (
        SELECT _dlt_id,
            (SELECT county FROM wa_counties
             ORDER BY ST_Distance(geom,
                 (SELECT pt FROM with_specimen ws2 WHERE ws2._dlt_id = with_county._dlt_id))
             LIMIT 1) AS county
        FROM with_county
        WHERE county IS NULL
    ),
    final_county AS (
        SELECT * FROM with_county WHERE county IS NOT NULL
        UNION ALL SELECT * FROM county_fallback
    ),
    with_eco AS (
        SELECT ws._dlt_id, e.ecoregion_l3
        FROM with_specimen ws
        LEFT JOIN wa_eco e ON ST_Within(ws.pt, e.geom)
    ),
    eco_dedup AS (
        SELECT DISTINCT ON (_dlt_id) _dlt_id, ecoregion_l3
        FROM with_eco
    ),
    eco_fallback AS (
        SELECT _dlt_id,
            (SELECT ecoregion_l3 FROM wa_eco
             ORDER BY ST_Distance(geom,
                 (SELECT pt FROM with_specimen ws2 WHERE ws2._dlt_id = eco_dedup._dlt_id))
             LIMIT 1) AS ecoregion_l3
        FROM eco_dedup
        WHERE ecoregion_l3 IS NULL
    ),
    final_eco AS (
        SELECT * FROM eco_dedup WHERE ecoregion_l3 IS NOT NULL
        UNION ALL SELECT * FROM eco_fallback
    )
    SELECT
        ws.id AS observation_id,
        ws.user__login AS observer,
        ws.observed_on AS date,
        ws.latitude AS lat,
        ws.longitude AS lon,
        ws.specimen_count,
        ws.sample_id,
        fc.county,
        fe.ecoregion_l3
    FROM with_specimen ws
    JOIN final_county fc ON fc._dlt_id = ws._dlt_id
    JOIN final_eco fe ON fe._dlt_id = ws._dlt_id
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
    print(f"  samples.parquet: {total:,} rows, {null_county} null county, {null_eco} null ecoregion, "
          f"{(ASSETS_DIR / 'samples.parquet').stat().st_size:,} bytes")
    assert null_county == 0, f"samples.parquet has {null_county} rows with null county"
    assert null_eco == 0, f"samples.parquet has {null_eco} rows with null ecoregion_l3"


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
    """Export all four frontend asset files from beeatlas.duckdb."""
    print("Connecting to DuckDB...")
    con = duckdb.connect(DB_PATH, read_only=True)
    con.execute("INSTALL spatial; LOAD spatial;")
    print("Exporting frontend assets:")
    export_ecdysis_parquet(con)
    export_samples_parquet(con)
    export_counties_geojson(con)
    export_ecoregions_geojson(con)
    con.close()
    print("Done.")


if __name__ == "__main__":
    main()
