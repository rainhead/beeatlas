-- Every occurrence carrying a county must actually be in it, or near enough that
-- snapping to it was a decision rather than an accident (beeatlas-8pz).
--
-- The bug this replaces was invisible for exactly one reason: the fallback that
-- assigns a county when point-in-polygon finds none had no distance ceiling, so
-- "not in Washington" came out the far end as a specific, plausible county name.
-- A specimen Ecdysis stores as Baker County, Oregon was published as Asotin —
-- nearest WA county, 168 km away, ahead of Garfield by 2 km. Nothing downstream
-- can tell that apart from a real assignment: it is a valid county string, it
-- filters, it counts, it colours a coverage map.
--
-- So assert the invariant directly rather than trusting the fallback to keep its
-- ceiling. This also catches the ceiling being removed, a county geometry being
-- swapped for a coarser one, or a new arm reaching the mart through some other
-- path.
--
-- Returns offending rows; dbt fails the build if there are any.

WITH assigned AS (
    SELECT lon, lat, county, ST_Point(lon, lat) AS pt
    FROM {{ ref('occurrences') }}
    WHERE county IS NOT NULL
),
-- Distance from each point to the county it was ASSIGNED (0 when genuinely inside).
gap AS (
    SELECT a.lon, a.lat, a.county,
           MIN(ST_Distance(c.geom, a.pt)) AS deg
    FROM assigned a
    JOIN {{ ref('stg_geo__us_counties') }} c ON c.county = a.county
    GROUP BY a.lon, a.lat, a.county
)
SELECT lon, lat, county, deg
FROM gap
WHERE deg > {{ region_snap_tolerance_deg() }}
