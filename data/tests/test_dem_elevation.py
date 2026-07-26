"""Tests for dem_elevation — the USGS 3DEP coordinate -> elevation lookup (beeatlas-sn8).

Covers:
  - tile_name: 3DEP tiles are named for their NORTHWEST corner
  - test_seed_excludes_checklist: checklist coordinates are never sampled
  - test_seed_covers_every_non_checklist_arm: all four coordinate-bearing sources
  - test_seed_skips_absent_relations: a partial local DB narrows the seed, not fails
  - test_seed_rounds_and_dedupes: coordinates are keyed at COORD_PRECISION
  - test_sampled_rows_land_in_table / nodata / no_tile: the three outcomes persist
  - test_incremental_skips_known_coordinates: a cached coordinate is not re-sampled
  - test_transient_failure_is_not_recorded: a 5xx leaves the coordinate for next run

Network access is never exercised: _tile_exists and _sample_tile are the seams, and
every test monkeypatches them.
"""

import importlib

import duckdb
import pytest

dem_elevation = importlib.import_module("dem_elevation")


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def db(tmp_path):
    """A DuckDB file with the four seed relations, each holding one coordinate.

    Column names differ per source on purpose — matching the real schemas, which
    is the drift this module's _SEED_SOURCES table has to keep straight.
    """
    path = str(tmp_path / "t.duckdb")
    con = duckdb.connect(path)
    con.execute("CREATE SCHEMA ecdysis_data")
    con.execute(
        "CREATE TABLE ecdysis_data.occurrences AS "
        "SELECT 47.1 AS decimal_latitude, -121.1 AS decimal_longitude"
    )
    con.execute("CREATE SCHEMA inaturalist_data")
    con.execute(
        "CREATE TABLE inaturalist_data.observations AS "
        "SELECT 47.2 AS latitude, -121.2 AS longitude"
    )
    con.execute("CREATE SCHEMA inaturalist_waba_data")
    con.execute(
        "CREATE TABLE inaturalist_waba_data.observations AS "
        "SELECT 47.3 AS latitude, -121.3 AS longitude"
    )
    con.execute("CREATE SCHEMA inat_obs_data")
    con.execute("CREATE TABLE inat_obs_data.observations AS SELECT 47.4 AS lat, -121.4 AS lon")
    # The trap: a checklist relation full of coordinates that must never be sampled.
    con.execute("CREATE SCHEMA checklist_data")
    con.execute(
        "CREATE TABLE checklist_data.checklist_records_full AS "
        "SELECT 47.6062 AS lat, -122.3321 AS lon"
    )
    con.close()
    return path


@pytest.fixture
def stub_dem(monkeypatch):
    """Replace the two network seams; record which tiles were asked for.

    Returns the call log. Elevation is derived from latitude so assertions can tell
    which coordinate produced which row.
    """
    calls = {"exists": [], "sampled": []}

    def fake_exists(tile):
        calls["exists"].append(tile)
        return True

    def fake_sample(tile, points):
        calls["sampled"].extend(points)
        return [
            (lat, lon, round(lat * 100), dem_elevation.STATUS_OK, dem_elevation.DEM_SOURCE)
            for lat, lon in points
        ]

    monkeypatch.setattr(dem_elevation, "_tile_exists", fake_exists)
    monkeypatch.setattr(dem_elevation, "_sample_tile", fake_sample)
    return calls


def _rows(db_path):
    con = duckdb.connect(db_path, read_only=True)
    try:
        return con.execute(
            "SELECT lat, lon, elevation_dem_m, status FROM dem_data.elevations ORDER BY lat"
        ).fetchall()
    finally:
        con.close()


# ---------------------------------------------------------------------------
# tile_name
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "lat,lon,expected",
    [
        # 3DEP names a tile for its NW corner, so a point at 47.5N/121.5W lives in
        # the tile called n48w122 — both components round AWAY from the point.
        (47.5, -121.5, "n48w122"),
        (47.0, -121.0, "n48w121"),
        (48.999, -122.001, "n49w123"),
        (33.277, -111.139, "n34w112"),
    ],
)
def test_tile_name_uses_northwest_corner(lat, lon, expected):
    assert dem_elevation.tile_name(lat, lon) == expected


# ---------------------------------------------------------------------------
# seed set
# ---------------------------------------------------------------------------


def test_seed_excludes_checklist(db):
    """The Seattle placeholder point in checklist_data must not reach the seed set."""
    con = duckdb.connect(db, read_only=True)
    try:
        seeds = dem_elevation.seed_coordinates(con)
    finally:
        con.close()
    assert (47.6062, -122.3321) not in seeds
    assert not any(s in str(dem_elevation._SEED_SOURCES) for s in ["checklist"])


def test_seed_covers_every_non_checklist_arm(db):
    """All four coordinate-bearing sources contribute — including the two iNat schemas.

    inaturalist_data and inaturalist_waba_data are distinct relations feeding
    different arms; covering only the WABA one was the original bug.
    """
    con = duckdb.connect(db, read_only=True)
    try:
        seeds = dem_elevation.seed_coordinates(con)
    finally:
        con.close()
    assert seeds == [
        (47.1, -121.1),  # ecdysis_data.occurrences
        (47.2, -121.2),  # inaturalist_data.observations  (ARM 1 fallback + ARM 2)
        (47.3, -121.3),  # inaturalist_waba_data.observations (ARM 3)
        (47.4, -121.4),  # inat_obs_data.observations (ARM 4)
    ]


def test_seed_skips_absent_relations(tmp_path):
    """A partial local database narrows the backfill rather than raising."""
    path = str(tmp_path / "partial.duckdb")
    con = duckdb.connect(path)
    con.execute("CREATE SCHEMA inat_obs_data")
    con.execute("CREATE TABLE inat_obs_data.observations AS SELECT 47.4 AS lat, -121.4 AS lon")
    seeds = dem_elevation.seed_coordinates(con)
    con.close()
    assert seeds == [(47.4, -121.4)]


def test_seed_rounds_and_dedupes(tmp_path):
    """Coordinates are keyed at COORD_PRECISION, so sub-key jitter is one entry."""
    path = str(tmp_path / "round.duckdb")
    con = duckdb.connect(path)
    con.execute("CREATE SCHEMA inat_obs_data")
    con.execute(
        "CREATE TABLE inat_obs_data.observations AS "
        "SELECT * FROM (VALUES (47.1234567, -121.1), (47.1234569, -121.1), "
        "(NULL, -121.1), (47.9, NULL)) AS t(lat, lon)"
    )
    seeds = dem_elevation.seed_coordinates(con)
    con.close()
    # The two 7-dp coordinates collapse to one 6-dp key; NULL coordinates drop out.
    assert seeds == [(47.123457, -121.1)]


# ---------------------------------------------------------------------------
# load_dem_elevations
# ---------------------------------------------------------------------------


def test_sampled_rows_land_in_table(db, stub_dem):
    dem_elevation.load_dem_elevations(db)
    rows = _rows(db)
    assert [(r[0], r[2], r[3]) for r in rows] == [
        (47.1, 4710, "ok"),
        (47.2, 4720, "ok"),
        (47.3, 4730, "ok"),
        (47.4, 4740, "ok"),
    ]


def test_no_tile_is_recorded_so_it_is_not_retried(db, monkeypatch):
    """A 404 is permanent: record it, so the coordinate is asked once and never again."""
    monkeypatch.setattr(dem_elevation, "_tile_exists", lambda tile: False)
    monkeypatch.setattr(
        dem_elevation,
        "_sample_tile",
        lambda tile, points: pytest.fail("must not sample a tile that does not exist"),
    )
    dem_elevation.load_dem_elevations(db)
    rows = _rows(db)
    assert len(rows) == 4
    assert {r[3] for r in rows} == {"no_tile"}
    assert {r[2] for r in rows} == {None}


def test_nodata_is_recorded_with_null_elevation(db, monkeypatch):
    monkeypatch.setattr(dem_elevation, "_tile_exists", lambda tile: True)
    monkeypatch.setattr(
        dem_elevation,
        "_sample_tile",
        lambda tile, points: [
            (lat, lon, None, dem_elevation.STATUS_NODATA, dem_elevation.DEM_SOURCE)
            for lat, lon in points
        ],
    )
    dem_elevation.load_dem_elevations(db)
    assert {r[3] for r in _rows(db)} == {"nodata"}
    assert {r[2] for r in _rows(db)} == {None}


def test_incremental_skips_known_coordinates(db, stub_dem):
    """The lookup is a cache: a second run over unchanged sources samples nothing."""
    dem_elevation.load_dem_elevations(db)
    first = len(stub_dem["sampled"])
    assert first == 4

    dem_elevation.load_dem_elevations(db)
    assert len(stub_dem["sampled"]) == first, "already-known coordinates were re-sampled"
    assert len(_rows(db)) == 4, "a second run duplicated rows"


def test_incremental_samples_only_the_new_coordinate(db, stub_dem):
    dem_elevation.load_dem_elevations(db)
    con = duckdb.connect(db)
    con.execute("INSERT INTO inat_obs_data.observations VALUES (48.5, -120.5)")
    con.close()

    stub_dem["sampled"].clear()
    dem_elevation.load_dem_elevations(db)
    assert stub_dem["sampled"] == [(48.5, -120.5)]
    assert len(_rows(db)) == 5


def test_transient_failure_is_not_recorded(db, monkeypatch):
    """A 5xx/timeout must leave the coordinate unsampled so the next run retries it.

    The distinction from a 404 is the whole point of probing with HEAD: recording a
    transient failure would poison the cache permanently.
    """

    def boom(tile):
        raise ConnectionError("USGS is having a day")

    monkeypatch.setattr(dem_elevation, "_tile_exists", boom)
    dem_elevation.load_dem_elevations(db)

    con = duckdb.connect(db, read_only=True)
    try:
        assert con.execute("SELECT COUNT(*) FROM dem_data.elevations").fetchone()[0] == 0
    finally:
        con.close()

    # …and a later healthy run picks them all up.
    monkeypatch.setattr(dem_elevation, "_tile_exists", lambda tile: True)
    monkeypatch.setattr(
        dem_elevation,
        "_sample_tile",
        lambda tile, points: [
            (lat, lon, 100, dem_elevation.STATUS_OK, dem_elevation.DEM_SOURCE)
            for lat, lon in points
        ],
    )
    dem_elevation.load_dem_elevations(db)
    assert len(_rows(db)) == 4


def test_rows_are_inserted_in_coordinate_order(db, stub_dem):
    """Stelis content-addresses this table, so its row order must follow the data."""
    dem_elevation.load_dem_elevations(db)
    con = duckdb.connect(db, read_only=True)
    try:
        # No ORDER BY: read the table's physical order.
        lats = [r[0] for r in con.execute("SELECT lat FROM dem_data.elevations").fetchall()]
    finally:
        con.close()
    assert lats == sorted(lats)
