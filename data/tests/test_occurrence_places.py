"""Executable spec for the occurrence_places bridge mart (built in 160-02).

This test seeds a DuckDB with a tiny occurrences-shaped input and two partially
overlapping places, then runs the *bridge SQL body inline* — the `ST_Within`
JOIN with NO `DISTINCT ON`, projecting the Option-B synthetic `occ_id` (which
mirrors `occIdFromRow` in `src/occurrence.ts:23-30`) plus `place_slug`, sorted
by `(occ_id, place_slug)`.

Because the recipe is run inline against seeded tables (it does NOT depend on
the not-yet-built `occurrence_places.sql` mart file), this test is GREEN on
authoring. It is the canonical recipe 160-02 must reproduce verbatim in
`data/dbt/models/marts/occurrence_places.sql`; if that mart's SQL diverges from
this body, 160-02's contract build is the failing gate, not this test.

Behaviors pinned (D-05 / SC-5):
    - A point inside the A∩B overlap yields EXACTLY two rows
      (occ_id, 'place-a') and (occ_id, 'place-b'), in sorted order.
    - A point inside place A only yields exactly one row.
    - A point inside place B only yields exactly one row.
    - Output is byte-stable across two runs (determinism — Pitfall 4).
    - The `occ_id` CASE order matches src/occurrence.ts exactly
      (ecdysis → inat → inat_obs → checklist).
"""

import duckdb


# ---------------------------------------------------------------------------
# Overlapping-place fixture (same coordinate style as test_places_validation's
# overlapping fixture): place-a lon -121.0..-120.9, place-b lon -120.95..-120.85,
# both lat 47.0..47.1 → overlap band lon -120.95..-120.9.
# ---------------------------------------------------------------------------

_PLACE_A_WKT = "POLYGON((-121.0 47.0, -120.9 47.0, -120.9 47.1, -121.0 47.1, -121.0 47.0))"
_PLACE_B_WKT = "POLYGON((-120.95 47.0, -120.85 47.0, -120.85 47.1, -120.95 47.1, -120.95 47.0))"

# A point inside A only (lon -120.97, outside B's -120.95 west edge).
_PT_A_ONLY = (-120.97, 47.05)
# A point inside B only (lon -120.88, outside A's -120.9 east edge).
_PT_B_ONLY = (-120.88, 47.05)
# A point inside the A∩B overlap band (lon -120.92, in both).
_PT_OVERLAP = (-120.92, 47.05)


# The bridge SQL body. Mirrors the recipe in 160-RESEARCH.md "Code Examples →
# Bridge mart": the ST_Within JOIN with NO DISTINCT ON, projecting the Option-B
# occ_id CASE (identical priority to src/occurrence.ts:23-30) and place_slug,
# ORDER BY occ_id, place_slug for determinism (Pitfall 4).
_BRIDGE_SQL = """
WITH joined AS (
    SELECT ROW_NUMBER() OVER () AS _row_id, *
    FROM occ_input
),
occ_pt AS (
    SELECT *, ST_Point(lon, lat) AS pt FROM joined
),
with_place AS (
    SELECT occ_pt._row_id, p.slug AS place_slug
    FROM occ_pt
    JOIN places p ON ST_Within(occ_pt.pt, p.geom)
)
SELECT
    CASE
        WHEN j.ecdysis_id IS NOT NULL THEN 'ecdysis:' || j.ecdysis_id
        WHEN j.observation_id IS NOT NULL THEN 'inat:' || j.observation_id
        WHEN j.specimen_observation_id IS NOT NULL THEN 'inat_obs:' || j.specimen_observation_id
        WHEN j.checklist_id IS NOT NULL THEN 'checklist:' || j.checklist_id
    END AS occ_id,
    wp.place_slug
FROM joined j
JOIN with_place wp ON wp._row_id = j._row_id
ORDER BY occ_id, place_slug
"""


def _seed_and_run() -> list[tuple[str, str]]:
    """Seed an in-memory DuckDB with the four identity columns + lon/lat for
    three points and two overlapping places, then run the inline bridge SQL.

    Returns the bridge rows as a list of (occ_id, place_slug) tuples in the
    order DuckDB returned them (the SQL's ORDER BY makes this deterministic).
    """
    con = duckdb.connect(":memory:")
    con.execute("INSTALL spatial")
    con.execute("LOAD spatial")

    # occurrences-shaped input: the four identity columns + lon/lat.
    con.execute(
        """
        CREATE TABLE occ_input (
            ecdysis_id BIGINT,
            observation_id BIGINT,
            specimen_observation_id BIGINT,
            checklist_id BIGINT,
            lon DOUBLE,
            lat DOUBLE
        )
        """
    )
    # Row 1: A-only, identified by ecdysis_id (→ 'ecdysis:42').
    # Row 2: B-only, identified by observation_id (→ 'inat:99').
    # Row 3: in the overlap, identified by ecdysis_id (→ 'ecdysis:7').
    con.executemany(
        "INSERT INTO occ_input VALUES (?, ?, ?, ?, ?, ?)",
        [
            (42, None, None, None, _PT_A_ONLY[0], _PT_A_ONLY[1]),
            (None, 99, None, None, _PT_B_ONLY[0], _PT_B_ONLY[1]),
            (7, None, None, None, _PT_OVERLAP[0], _PT_OVERLAP[1]),
        ],
    )

    con.execute(
        """
        CREATE TABLE places (slug VARCHAR, geom GEOMETRY)
        """
    )
    for slug, wkt in [("place-a", _PLACE_A_WKT), ("place-b", _PLACE_B_WKT)]:
        con.execute(
            "INSERT INTO places VALUES (?, ST_GeomFromText(?))", [slug, wkt]
        )

    rows = con.execute(_BRIDGE_SQL).fetchall()
    con.close()
    return [(r[0], r[1]) for r in rows]


def test_overlap_point_yields_two_sorted_bridge_rows():
    """The overlap point (ecdysis:7) produces EXACTLY two rows — one per place —
    sorted by (occ_id, place_slug). This is the D-05/SC-5 acceptance proof."""
    rows = _seed_and_run()
    overlap_rows = [r for r in rows if r[0] == "ecdysis:7"]
    assert overlap_rows == [
        ("ecdysis:7", "place-a"),
        ("ecdysis:7", "place-b"),
    ], f"overlap point must yield both places sorted, got {overlap_rows}"


def test_a_only_point_yields_one_row():
    """The A-only point (ecdysis:42) produces exactly one bridge row, place-a."""
    rows = _seed_and_run()
    a_rows = [r for r in rows if r[0] == "ecdysis:42"]
    assert a_rows == [("ecdysis:42", "place-a")], f"A-only point, got {a_rows}"


def test_b_only_point_yields_one_row():
    """The B-only point (inat:99) produces exactly one bridge row, place-b."""
    rows = _seed_and_run()
    b_rows = [r for r in rows if r[0] == "inat:99"]
    assert b_rows == [("inat:99", "place-b")], f"B-only point, got {b_rows}"


def test_no_distinct_on_total_row_count():
    """No DISTINCT ON: total bridge rows == 1 (A-only) + 1 (B-only) + 2 (overlap)."""
    rows = _seed_and_run()
    assert len(rows) == 4, f"expected 4 membership rows, got {len(rows)}: {rows}"


def test_output_is_byte_stable_across_runs():
    """Two independent runs produce identical ordered output (determinism)."""
    assert _seed_and_run() == _seed_and_run()


def test_occ_id_case_priority_matches_occurrence_ts():
    """The occ_id CASE must follow src/occurrence.ts:23-30 priority exactly:
    ecdysis → inat (observation_id) → inat_obs (specimen_observation_id) →
    checklist. Seed one point of each arm at the SAME overlap coordinate and
    assert the emitted prefix matches the highest-priority non-null id."""
    con = duckdb.connect(":memory:")
    con.execute("INSTALL spatial")
    con.execute("LOAD spatial")
    con.execute(
        """
        CREATE TABLE occ_input (
            ecdysis_id BIGINT,
            observation_id BIGINT,
            specimen_observation_id BIGINT,
            checklist_id BIGINT,
            lon DOUBLE,
            lat DOUBLE
        )
        """
    )
    lon, lat = _PT_A_ONLY  # any point inside place-a only is fine
    con.executemany(
        "INSERT INTO occ_input VALUES (?, ?, ?, ?, ?, ?)",
        [
            # ecdysis wins even when observation_id is also set.
            (42, 1000, None, None, lon, lat),
            # observation_id wins when ecdysis_id is null.
            (None, 99, 2000, None, lon, lat),
            # specimen_observation_id wins when both above are null.
            (None, None, 555, 3000, lon, lat),
            # checklist_id is the last resort.
            (None, None, None, 77, lon, lat),
        ],
    )
    con.execute("CREATE TABLE places (slug VARCHAR, geom GEOMETRY)")
    con.execute(
        "INSERT INTO places VALUES (?, ST_GeomFromText(?))",
        ["place-a", _PLACE_A_WKT],
    )
    occ_ids = {r[0] for r in con.execute(_BRIDGE_SQL).fetchall()}
    con.close()
    assert occ_ids == {"ecdysis:42", "inat:99", "inat_obs:555", "checklist:77"}, (
        f"occ_id prefixes must mirror occIdFromRow priority, got {occ_ids}"
    )
