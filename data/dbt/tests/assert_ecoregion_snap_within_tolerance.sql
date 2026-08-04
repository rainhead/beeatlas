-- Every occurrence carrying an ecoregion must actually be in it, or near enough that
-- snapping to it was a decision rather than an accident (beeatlas-9mm).
--
-- The exact sibling of assert_county_snap_within_tolerance, and it exists because
-- beeatlas-8pz capped BOTH fallbacks but asserted only one. The model's own comment
-- on eco_fallback makes the case for this test better than this one can:
--
--     "Ecoregions are the more forgiving of the two — they are physiographic and
--      genuinely continue across the state line, so the nearest one is often still
--      correct for a point just outside. That makes a fabricated value HARDER to
--      spot here, not easier."
--
-- Harder to spot is the reason to assert it, not the reason to skip it. And the
-- ecoregion is what surfaced the problem in the end: a single iNat record sitting in
-- Arizona carried "Eastern Cascades Slopes and Foothills", which stretched that
-- ecoregion's extent from the Cascades to the Sonoran Desert and flew the app's map
-- to Nevada. County was wrong on the same row and nobody noticed for a week.
--
-- Assert the invariant directly rather than trusting the fallback to keep its
-- ceiling. This also catches the ceiling being removed, an ecoregion geometry being
-- swapped for a coarser one, or a new arm reaching the mart by some other path.
--
-- Returns offending rows; dbt fails the build if there are any.

WITH assigned AS (
    SELECT lon, lat, ecoregion_l3, ST_Point(lon, lat) AS pt
    FROM {{ ref('occurrences') }}
    WHERE ecoregion_l3 IS NOT NULL
),
-- Distance from each point to the ecoregion it was ASSIGNED (0 when genuinely
-- inside). MIN over the join because one ecoregion_l3 name can cover several
-- disjoint polygons — the Cascades appear twice — and being inside any of them
-- is being inside the ecoregion.
gap AS (
    SELECT a.lon, a.lat, a.ecoregion_l3,
           MIN(ST_Distance(e.geom, a.pt)) AS deg
    FROM assigned a
    JOIN {{ ref('stg_geo__ecoregions') }} e ON e.ecoregion_l3 = a.ecoregion_l3
    GROUP BY a.lon, a.lat, a.ecoregion_l3
)
SELECT lon, lat, ecoregion_l3, deg
FROM gap
WHERE deg > {{ region_snap_tolerance_deg() }}
