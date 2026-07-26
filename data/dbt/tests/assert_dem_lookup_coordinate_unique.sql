{{ config(severity='error') }}
-- Singular dbt test (beeatlas-sn8): (lat, lon) is the PRIMARY KEY of the DEM lookup.
--
-- marts/occurrences.sql LEFT JOINs stg_dem__elevations on the rounded coordinate. A
-- duplicate key there would FAN OUT the occurrences mart — every occurrence at that
-- coordinate silently becoming two rows, with the same occ_id, inflating every count
-- downstream. That is a much worse failure than a missing elevation, and nothing
-- else in the build would name it: test_no_duplicate_occ_ids is severity:warn and
-- already tolerates known duplicates, and the row-count tolerance in
-- test_dbt_diff.py is a ±2-5% band that a handful of doubled coordinates slips under.
--
-- dem_elevation.load_dem_elevations maintains the key by only inserting coordinates
-- absent from the table, but that is an invariant held in Python with no constraint
-- behind it — DuckDB is not enforcing a PK here. This test is the enforcement.
SELECT lat, lon, COUNT(*) AS n
FROM {{ ref('stg_dem__elevations') }}
GROUP BY lat, lon
HAVING COUNT(*) > 1
