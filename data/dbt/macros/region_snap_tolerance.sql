{#
  How far outside every Washington county (or ecoregion) a point may lie and still
  be SNAPPED to the nearest one, in DEGREES.

  WHY A CEILING EXISTS AT ALL (beeatlas-8pz). marts/occurrences derives county and
  ecoregion by point-in-polygon, then falls back to the nearest polygon when the
  point is inside none. The fallback is right for a point a few km offshore, on the
  Columbia, or straddling the Idaho line — Washington's boundary is largely water
  and rivers, and a bee collected from a boat is still a Washington record.

  Uncapped, that same rule turns "this record is not in Washington" into a
  confident, specific, wrong answer. A specimen Ecdysis stores as
  `county=Baker, state_province=Oregon, locality=near Snake River` was published as
  Asotin County — the nearest WA county, 168 km away, winning by 2 km over
  Garfield. County is not decoration: it feeds county totals, the checklist arm and
  the coverage maps, so a fabricated one misfiles the record everywhere at once.

  WHY 0.2. Measured over the corpus, the points falling outside every county split
  cleanly in two with nothing in between:

      <= 0.140   20 points   Puget Sound, the Strait of Juan de Fuca, the San
                             Juans, the Columbia at Cowlitz/Wahkiakum, and one on
                             the Idaho line at Whitman — all Washington-adjacent,
                             and every one snaps to the county you would name
      >= 0.278   16 points   Portland, Mount Hood, the Idaho panhandle, British
                             Columbia, the Oregon bank of the Snake, and one in
                             ARIZONA

  0.2 sits in that empty band. The gap is what makes this a threshold rather than a
  tuning knob — anywhere from 0.15 to 0.27 classifies every observed point
  identically.

  ON THE UNIT. ST_Distance over lon/lat returns degrees, which are ~111 km
  north-south and ~76 km east-west at Washington's latitude, so this is not a
  circle on the ground. That is deliberate rather than overlooked: every distance
  above is in these same units, so the anisotropy shifts what the number MEANS in
  km without changing which side of it any point falls. Reprojecting to a metric
  CRS to make it a true radius would be more honest arithmetic for no change in
  outcome, and would put a PROJ dependency in the middle of the hot spatial join.

  WHAT IT DOES NOT DO. Points beyond it get a NULL county, not a dropped record —
  an out-of-state specimen is real data and a NULL is the true answer about which
  Washington county it is in. `state_province` from Ecdysis would be a stronger
  signal where it exists, but 12 of the 16 out-of-state points have no Ecdysis row
  at all (they are iNat records), so it cannot be the mechanism — only a
  cross-check.
#}
{% macro region_snap_tolerance_deg() %}0.2{% endmacro %}
