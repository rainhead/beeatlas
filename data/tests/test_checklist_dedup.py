"""Phase 136 — RED scaffold for checklist deduplication tests (DUP-01/02/03).

All 11 tests are RED stubs that encode the intended behavior and fail because
waves 2-4 are unimplemented (checklist_dedup functions raise NotImplementedError,
placeholder SQL models return no rows / no collapse logic). Do NOT mark xfail/skip.

Test tiers:
- SQL/integration-touching tests: isolated :memory: DuckDB, fast-tier (no @integration).
- Gate tests: tmp_path + monkeypatch.setattr path redirect — same pattern as test_resolution_gate.py.
- Collector tests: pure-Python calls — no DB.

All tests run under `-m 'not integration'` in seconds.
"""

import csv
import pathlib
import re

import duckdb
import pytest

import checklist_dedup


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_MODELS_DIR = pathlib.Path(__file__).parent.parent / "dbt/models/intermediate"


def _make_dedup_con():
    """Return an in-memory DuckDB connection with spatial loaded."""
    con = duckdb.connect(":memory:")
    con.execute("INSTALL spatial; LOAD spatial")
    return con


def _rows_to_dicts(cursor):
    """Convert a DuckDB cursor (post-execute) to list of dicts."""
    cols = [d[0] for d in cursor.description]
    return [dict(zip(cols, row)) for row in cursor.fetchall()]


def _create_checklist_table(con, rows, table_name="checklist"):
    """Create a minimal stg_checklist__records_full-shaped table and seed rows."""
    con.execute(f"""
        CREATE TABLE {table_name} (
            ObjectID    BIGINT,
            canonical_name VARCHAR,
            lat         DOUBLE,
            lon         DOUBLE,
            year        INTEGER,
            month       INTEGER,
            day         INTEGER,
            date_quality VARCHAR,
            recordedBy  VARCHAR,
            verbatim_name VARCHAR DEFAULT NULL,
            locality    VARCHAR DEFAULT NULL,
            family      VARCHAR DEFAULT NULL,
            coord_flag  VARCHAR DEFAULT 'valid',
            taxon_id    INTEGER DEFAULT NULL
        )
    """)
    for r in rows:
        con.execute(
            f"""
            INSERT INTO {table_name}
                (ObjectID, canonical_name, lat, lon, year, month, day, date_quality, recordedBy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                r["ObjectID"],
                r.get("canonical_name", "apis mellifera"),
                r.get("lat", 47.0),
                r.get("lon", -120.0),
                r.get("year", 2022),
                r.get("month", 6),
                r.get("day", 15),
                r.get("date_quality", "full"),
                r.get("recordedBy", "J Smith"),
            ],
        )


def _create_ecdysis_table(con, rows, table_name="ecdysis"):
    """Create a minimal int_ecdysis_base-shaped table and seed rows."""
    con.execute(f"""
        CREATE TABLE {table_name} (
            ecdysis_id  INTEGER,
            ecdysis_lat DOUBLE,
            ecdysis_lon DOUBLE,
            canonical_name VARCHAR,
            year        INTEGER,
            month       INTEGER,
            event_date  VARCHAR,
            recordedBy  VARCHAR
        )
    """)
    for r in rows:
        con.execute(
            f"""
            INSERT INTO {table_name}
                (ecdysis_id, ecdysis_lat, ecdysis_lon, canonical_name,
                 year, month, event_date, recordedBy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                r["ecdysis_id"],
                r.get("ecdysis_lat", 47.0),
                r.get("ecdysis_lon", -120.0),
                r.get("canonical_name", "apis mellifera"),
                r.get("year", 2022),
                r.get("month", 6),
                r.get("event_date", "2022-06-15"),
                r.get("recordedBy", "J Smith"),
            ],
        )


def _load_model_sql(model_name, refs=None):
    """Load a dbt model SQL file, strip Jinja config/ref(), substitute table names.

    refs: dict mapping ref('name') → bare table name.
    """
    sql_path = _MODELS_DIR / f"{model_name}.sql"
    raw = sql_path.read_text()
    # Strip {{ config(...) }} block
    raw = re.sub(r"\{\{\s*config\(.*?\)\s*\}\}", "", raw, flags=re.DOTALL)
    if refs:
        for ref_name, table_name in refs.items():
            raw = raw.replace(f"{{{{ ref('{ref_name}') }}}}", table_name)
    # Strip any remaining {{ }} Jinja
    raw = re.sub(r"\{\{.*?\}\}", "", raw, flags=re.DOTALL)
    return raw.strip()


def _write_candidates_csv(tmp_path, rows):
    """Write a dedup_candidate_pairs.csv with the documented column set."""
    csv_path = tmp_path / "dedup_candidate_pairs.csv"
    cols = [
        "pair_key", "checklist_ObjectID", "ecdysis_id", "canonical_name",
        "checklist_lat", "checklist_lon", "ecdysis_lat", "ecdysis_lon", "distance_m",
        "checklist_year", "checklist_month", "checklist_day", "date_quality",
        "ecdysis_date", "ecdysis_year", "ecdysis_month", "ecdysis_day",
        "checklist_collector", "ecdysis_collector",
    ]
    with csv_path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=cols)
        writer.writeheader()
        writer.writerows(rows)
    return csv_path


def _write_decisions_csv(tmp_path, rows):
    """Write a dedup_decisions.csv with pair_key, dedup_status, note."""
    csv_path = tmp_path / "dedup_decisions.csv"
    with csv_path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["pair_key", "dedup_status", "note"])
        writer.writeheader()
        writer.writerows(rows)
    return csv_path


# ---------------------------------------------------------------------------
# DUP-01: Collapse tests — execute int_checklist_collapsed.sql placeholder
# ---------------------------------------------------------------------------


def test_no_exact_duplicates_after_collapse():
    """DUP-01: After collapsing, no (canonical_name,lat,lon,year,month,day,recordedBy)
    tuple appears more than once in the output.

    RED: placeholder SQL passes through all rows (no GROUP BY collapse yet);
    seeding 3 identical rows produces 3 output rows — the tuple-uniqueness assertion fails.
    """
    rows = [
        {"ObjectID": 1, "canonical_name": "apis mellifera", "lat": 47.1, "lon": -120.2,
         "year": 2022, "month": 6, "day": 15, "date_quality": "full", "recordedBy": "J Smith"},
        {"ObjectID": 2, "canonical_name": "apis mellifera", "lat": 47.1, "lon": -120.2,
         "year": 2022, "month": 6, "day": 15, "date_quality": "full", "recordedBy": "J Smith"},
        {"ObjectID": 3, "canonical_name": "apis mellifera", "lat": 47.1, "lon": -120.2,
         "year": 2022, "month": 6, "day": 15, "date_quality": "full", "recordedBy": "J Smith"},
    ]
    con = _make_dedup_con()
    _create_checklist_table(con, rows)

    collapse_sql = _load_model_sql(
        "int_checklist_collapsed",
        refs={"stg_checklist__records_full": "checklist"},
    )
    result_rows = _rows_to_dicts(con.execute(collapse_sql))

    seen = {}
    for r in result_rows:
        key = (r.get("canonical_name"), r.get("lat"), r.get("lon"),
               r.get("year"), r.get("month"), r.get("day"), r.get("recordedBy"))
        seen[key] = seen.get(key, 0) + 1
    dups = [k for k, v in seen.items() if v > 1]
    assert len(dups) == 0, (
        f"Expected zero duplicate tuples after collapse; found {len(dups)} groups: {dups}"
    )


def test_collapsed_count_correct():
    """DUP-01: A group of N identical rows yields collapsed_count=N; a unique row gives 1.

    RED: placeholder SQL has no GROUP BY / collapsed_count; assertion on collapsed_count fails.
    """
    rows = [
        {"ObjectID": 1, "canonical_name": "bombus mixtus", "lat": 48.0, "lon": -119.0,
         "year": 2021, "month": 7, "day": 10, "date_quality": "full", "recordedBy": "A Jones"},
        {"ObjectID": 2, "canonical_name": "bombus mixtus", "lat": 48.0, "lon": -119.0,
         "year": 2021, "month": 7, "day": 10, "date_quality": "full", "recordedBy": "A Jones"},
        {"ObjectID": 3, "canonical_name": "bombus mixtus", "lat": 48.0, "lon": -119.0,
         "year": 2021, "month": 7, "day": 10, "date_quality": "full", "recordedBy": "A Jones"},
        {"ObjectID": 4, "canonical_name": "osmia lignaria", "lat": 47.5, "lon": -121.0,
         "year": 2022, "month": 5, "day": 5, "date_quality": "full", "recordedBy": "B Brown"},
    ]
    con = _make_dedup_con()
    _create_checklist_table(con, rows)

    collapse_sql = _load_model_sql(
        "int_checklist_collapsed",
        refs={"stg_checklist__records_full": "checklist"},
    )
    result_rows = _rows_to_dicts(con.execute(collapse_sql))

    bombus_rows = [r for r in result_rows if r.get("canonical_name") == "bombus mixtus"]
    assert len(bombus_rows) == 1, (
        f"Expected one survivor for bombus group, got {len(bombus_rows)}"
    )
    assert bombus_rows[0].get("collapsed_count") == 3, (
        f"Expected collapsed_count=3, got {bombus_rows[0].get('collapsed_count')}"
    )

    osmia_rows = [r for r in result_rows if r.get("canonical_name") == "osmia lignaria"]
    assert len(osmia_rows) == 1, "Expected one row for unique osmia lignaria"
    assert osmia_rows[0].get("collapsed_count") == 1, (
        f"Expected collapsed_count=1 for unique row, got {osmia_rows[0].get('collapsed_count')}"
    )


def test_lowest_objectid_survives():
    """DUP-01: Within a duplicate group the survivor's ObjectID = MIN(ObjectID).

    RED: placeholder passes through all rows with their original ObjectIDs;
    finding a single survivor with ObjectID=5 fails.
    """
    rows = [
        {"ObjectID": 10, "canonical_name": "lasioglossum nevadense", "lat": 46.0, "lon": -118.0,
         "year": 2020, "month": 8, "day": 1, "date_quality": "full", "recordedBy": "C Davis"},
        {"ObjectID": 5, "canonical_name": "lasioglossum nevadense", "lat": 46.0, "lon": -118.0,
         "year": 2020, "month": 8, "day": 1, "date_quality": "full", "recordedBy": "C Davis"},
        {"ObjectID": 7, "canonical_name": "lasioglossum nevadense", "lat": 46.0, "lon": -118.0,
         "year": 2020, "month": 8, "day": 1, "date_quality": "full", "recordedBy": "C Davis"},
    ]
    con = _make_dedup_con()
    _create_checklist_table(con, rows)

    collapse_sql = _load_model_sql(
        "int_checklist_collapsed",
        refs={"stg_checklist__records_full": "checklist"},
    )
    result_rows = _rows_to_dicts(con.execute(collapse_sql))

    survivors = [r for r in result_rows if r.get("canonical_name") == "lasioglossum nevadense"]
    assert len(survivors) == 1, (
        f"Expected exactly one survivor, got {len(survivors)}"
    )
    assert survivors[0].get("ObjectID") == 5, (
        f"Expected lowest ObjectID=5 to survive, got {survivors[0].get('ObjectID')}"
    )


# ---------------------------------------------------------------------------
# DUP-02: Candidate filter tests — execute int_dedup_candidates.sql placeholder
# ---------------------------------------------------------------------------


def test_null_date_excluded_from_candidates():
    """DUP-02: A checklist row with date_quality != 'full' never appears in candidates.

    RED: this test requires a non-null date row to be present AND the null-date row to
    be absent. With the placeholder (WHERE false), no rows are returned at all — so we
    also assert the in-window valid pair IS a candidate (which fails RED with the placeholder).
    """
    checklist_rows = [
        # This row has full date and valid coords — should be a candidate with ecdysis row
        {"ObjectID": 1, "canonical_name": "apis mellifera", "lat": 47.0, "lon": -120.0,
         "year": 2022, "month": 6, "day": 15, "date_quality": "full", "recordedBy": "J Smith"},
        # This row has non-full date — must NOT be a candidate
        {"ObjectID": 2, "canonical_name": "apis mellifera", "lat": 47.0, "lon": -120.0,
         "year": 2022, "month": 6, "day": None, "date_quality": "year-only",
         "recordedBy": "J Smith"},
    ]
    ecdysis_rows = [
        {"ecdysis_id": 100, "ecdysis_lat": 47.0, "ecdysis_lon": -120.0,
         "canonical_name": "apis mellifera", "year": 2022, "month": 6,
         "event_date": "2022-06-15", "recordedBy": "J Smith"},
    ]
    con = _make_dedup_con()
    _create_checklist_table(con, checklist_rows, "int_checklist_collapsed")
    _create_ecdysis_table(con, ecdysis_rows, "int_ecdysis_base")

    candidates_sql = _load_model_sql(
        "int_dedup_candidates",
        refs={
            "int_checklist_collapsed": "int_checklist_collapsed",
            "int_ecdysis_base": "int_ecdysis_base",
        },
    )
    result_rows = _rows_to_dicts(con.execute(candidates_sql))

    obj_ids = [r.get("checklist_ObjectID") for r in result_rows]
    # Must: ObjectID=1 (valid date) IS a candidate
    assert 1 in obj_ids, (
        "Full-date row (ObjectID=1) should be a candidate"
    )
    # Must: ObjectID=2 (year-only date) is NOT a candidate
    assert 2 not in obj_ids, (
        "date_quality != 'full' row (ObjectID=2) should NOT appear in candidates"
    )


def test_null_coord_excluded_from_candidates():
    """DUP-02: A checklist row with NULL lat/lon never appears in candidates.

    RED: requires a valid-coord row to be a candidate (fails with placeholder WHERE false).
    """
    checklist_rows = [
        # Valid coords — should be a candidate
        {"ObjectID": 1, "canonical_name": "apis mellifera", "lat": 47.0, "lon": -120.0,
         "year": 2022, "month": 6, "day": 15, "date_quality": "full", "recordedBy": "J Smith"},
        # NULL coords — must NOT be a candidate
        {"ObjectID": 2, "canonical_name": "apis mellifera", "lat": None, "lon": None,
         "year": 2022, "month": 6, "day": 15, "date_quality": "full", "recordedBy": "J Smith"},
    ]
    ecdysis_rows = [
        {"ecdysis_id": 101, "ecdysis_lat": 47.0, "ecdysis_lon": -120.0,
         "canonical_name": "apis mellifera", "year": 2022, "month": 6,
         "event_date": "2022-06-15", "recordedBy": "J Smith"},
    ]
    con = _make_dedup_con()
    _create_checklist_table(con, checklist_rows, "int_checklist_collapsed")
    _create_ecdysis_table(con, ecdysis_rows, "int_ecdysis_base")

    candidates_sql = _load_model_sql(
        "int_dedup_candidates",
        refs={
            "int_checklist_collapsed": "int_checklist_collapsed",
            "int_ecdysis_base": "int_ecdysis_base",
        },
    )
    result_rows = _rows_to_dicts(con.execute(candidates_sql))

    obj_ids = [r.get("checklist_ObjectID") for r in result_rows]
    # Must: ObjectID=1 (valid coords) IS a candidate
    assert 1 in obj_ids, (
        "Valid-coord row (ObjectID=1) should be a candidate"
    )
    # Must: ObjectID=2 (NULL coords) is NOT a candidate
    assert 2 not in obj_ids, (
        "NULL-coord row (ObjectID=2) should NOT appear in candidates"
    )


def test_candidate_csv_written(tmp_path, monkeypatch):
    """DUP-02: write_dedup_candidates() produces dedup_candidate_pairs.csv with correct columns.

    RED: write_dedup_candidates raises NotImplementedError.
    """
    candidate_path = tmp_path / "dedup_candidate_pairs.csv"
    decisions_path = tmp_path / "dedup_decisions.csv"
    decisions_path.write_text("pair_key,dedup_status,note\n")

    monkeypatch.setattr(checklist_dedup, "DEDUP_CANDIDATE_CSV", candidate_path)
    monkeypatch.setattr(checklist_dedup, "DEDUP_DECISIONS_CSV", decisions_path)

    # Raises NotImplementedError (stub) — RED condition.
    checklist_dedup.write_dedup_candidates()

    assert candidate_path.exists(), "dedup_candidate_pairs.csv should have been created"
    with candidate_path.open() as f:
        reader = csv.DictReader(f)
        header = reader.fieldnames or []
    expected_columns = {
        "pair_key", "checklist_ObjectID", "ecdysis_id", "canonical_name",
        "checklist_lat", "checklist_lon", "ecdysis_lat", "ecdysis_lon", "distance_m",
        "checklist_year", "checklist_month", "checklist_day", "date_quality",
        "ecdysis_date", "ecdysis_year", "ecdysis_month", "ecdysis_day",
        "checklist_collector", "ecdysis_collector",
    }
    assert expected_columns <= set(header), (
        f"Missing columns in candidate CSV: {expected_columns - set(header)}"
    )


def test_collector_normalization():
    """D-05: _collectors_match('J Smith','John Smith') is True; ('A Jones','B Jones') is False.

    RED: _collectors_match raises NotImplementedError.
    """
    assert checklist_dedup._collectors_match("J Smith", "John Smith") is True, (
        "_collectors_match should return True for initial vs full name of same person"
    )
    assert checklist_dedup._collectors_match("A Jones", "B Jones") is False, (
        "_collectors_match should return False for different initials"
    )
    assert checklist_dedup._collectors_match("John Smith", "John Smith") is True, (
        "_collectors_match should return True for identical strings"
    )
    assert checklist_dedup._collectors_match(None, "John Smith") is False, (
        "_collectors_match should return False when either side is None"
    )


def test_distance_1km_window():
    """DUP-02: A pair just inside 1.0 km is a candidate; a pair just outside is not.

    Guards the lat-first ST_Distance_Sphere axis order:
    ST_Distance_Sphere(ST_Point(lat, lon), ST_Point(lat2, lon2)) — latitude first.
    ~0.008 deg lat ≈ 890 m (inside); ~0.011 deg ≈ 1.22 km (outside).

    RED: placeholder SQL (WHERE false) returns no rows; inside-pair assertion fails.
    """
    con = _make_dedup_con()

    inside_lat = 47.008   # ~890 m north of 47.0
    outside_lat = 47.011  # ~1.22 km north of 47.0

    # Verify axis order independently (these assertions are always green)
    dist_inside = con.execute(
        "SELECT ST_Distance_Sphere(ST_Point(47.0, -120.0), ST_Point(?, -120.0)) AS d",
        [inside_lat],
    ).fetchone()[0]
    assert dist_inside < 1000.0, (
        f"Expected ~890 m, got {dist_inside:.1f} m — check ST_Point(lat, lon) axis order"
    )
    dist_outside = con.execute(
        "SELECT ST_Distance_Sphere(ST_Point(47.0, -120.0), ST_Point(?, -120.0)) AS d",
        [outside_lat],
    ).fetchone()[0]
    assert dist_outside > 1000.0, (
        f"Expected >1000 m, got {dist_outside:.1f} m — check ST_Point(lat, lon) axis order"
    )

    # Now test the candidate filter: inside → candidate, outside → not
    checklist_rows = [
        {"ObjectID": 1, "canonical_name": "apis mellifera", "lat": inside_lat, "lon": -120.0,
         "year": 2022, "month": 6, "day": 15, "date_quality": "full", "recordedBy": "J Smith"},
        {"ObjectID": 2, "canonical_name": "apis mellifera", "lat": outside_lat, "lon": -120.0,
         "year": 2022, "month": 6, "day": 15, "date_quality": "full", "recordedBy": "J Smith"},
    ]
    ecdysis_rows = [
        {"ecdysis_id": 100, "ecdysis_lat": 47.0, "ecdysis_lon": -120.0,
         "canonical_name": "apis mellifera", "year": 2022, "month": 6,
         "event_date": "2022-06-15", "recordedBy": "J Smith"},
    ]
    _create_checklist_table(con, checklist_rows, "int_checklist_collapsed")
    _create_ecdysis_table(con, ecdysis_rows, "int_ecdysis_base")

    candidates_sql = _load_model_sql(
        "int_dedup_candidates",
        refs={
            "int_checklist_collapsed": "int_checklist_collapsed",
            "int_ecdysis_base": "int_ecdysis_base",
        },
    )
    result_rows = _rows_to_dicts(con.execute(candidates_sql))
    obj_ids = [r.get("checklist_ObjectID") for r in result_rows]

    # Inside pair must be a candidate (fails RED with placeholder)
    assert 1 in obj_ids, (
        f"Inside pair (ObjectID=1, {dist_inside:.0f} m) should be a candidate"
    )
    # Outside pair must not be a candidate
    assert 2 not in obj_ids, (
        f"Outside pair (ObjectID=2, {dist_outside:.0f} m) should NOT be a candidate"
    )


# ---------------------------------------------------------------------------
# DUP-03: Status view + gate tests
# ---------------------------------------------------------------------------


def test_unreviewed_pair_not_suppressed():
    """DUP-03: A candidate pair with NO dedup_decisions row yields dedup_status NULL.

    RED: placeholder int_checklist_dedup_status.sql emits NULL dedup_status for all rows
    (no LEFT JOIN logic yet) — but it passes through all rows, so we also require the
    output row count matches input, which verifies the placeholder runs at all.
    The key assertion (dedup_status is NULL, not 'confirmed') will also need the real
    LEFT JOIN to be meaningful, but passes trivially with the placeholder NULL cast.
    To force RED: also assert the placeholder produces a 'collapsed_count' column
    (which it does not — it passes through stg_checklist__records_full columns only).
    """
    con = _make_dedup_con()

    # Seed a collapsed-shaped table (int_checklist_collapsed output)
    collapsed_rows = [
        {"ObjectID": 1, "canonical_name": "apis mellifera", "lat": 47.0, "lon": -120.0,
         "year": 2022, "month": 6, "day": 15, "date_quality": "full", "recordedBy": "J Smith"},
    ]
    _create_checklist_table(con, collapsed_rows, "int_checklist_collapsed")

    # int_checklist_dedup_status references int_checklist_collapsed
    status_sql = _load_model_sql(
        "int_checklist_dedup_status",
        refs={"int_checklist_collapsed": "int_checklist_collapsed"},
    )
    result_rows = _rows_to_dicts(con.execute(status_sql))

    assert len(result_rows) == 1, (
        f"Expected 1 row, got {len(result_rows)}"
    )
    status = result_rows[0].get("dedup_status")
    assert status is None or status != "confirmed", (
        f"Unreviewed pair should yield dedup_status NULL, got {status!r}"
    )
    # Also assert the real LEFT JOIN via dedup_decisions is wired (no such column in placeholder)
    # The real model should produce dedup_status via LEFT JOIN through int_dedup_candidates;
    # assert that with a candidate + confirmed decision, the status is 'confirmed'.
    # Since the placeholder ignores dedup_decisions, this additional check RED-pins the test:
    # seed a confirmed decision and verify it propagates (it won't with the placeholder).
    con.execute("""
        CREATE TABLE int_dedup_candidates (
            pair_key VARCHAR,
            checklist_ObjectID BIGINT,
            ecdysis_id INTEGER
        )
    """)
    con.execute("INSERT INTO int_dedup_candidates VALUES ('1|999', 1, 999)")
    con.execute("""
        CREATE TABLE dedup_decisions (
            pair_key VARCHAR,
            dedup_status VARCHAR,
            note VARCHAR
        )
    """)
    con.execute("INSERT INTO dedup_decisions VALUES ('1|999', 'confirmed', 'test')")

    # Re-run status with the same placeholder SQL — it still ignores the decisions table,
    # so dedup_status should be 'confirmed' here but the placeholder returns NULL.
    status_sql2 = _load_model_sql(
        "int_checklist_dedup_status",
        refs={"int_checklist_collapsed": "int_checklist_collapsed"},
    )
    result2 = _rows_to_dicts(con.execute(status_sql2))
    confirmed_status = result2[0].get("dedup_status") if result2 else None
    # With real SQL (136-04), this would be 'confirmed'. Placeholder returns NULL.
    # Asserting the round-trip works: once confirmed decisions exist,
    # the view must propagate them. Will be green in 136-04.
    assert confirmed_status == "confirmed", (
        f"Expected dedup_status='confirmed' when decision exists, got {confirmed_status!r}"
    )


def test_confirmed_pair_suppressed():
    """DUP-03: A candidate whose pair_key has dedup_status='confirmed' yields dedup_status='confirmed'.

    RED: placeholder int_checklist_dedup_status.sql has no LEFT JOIN; confirmed decision
    is not propagated; assertion fails.
    """
    con = _make_dedup_con()

    collapsed_rows = [
        {"ObjectID": 1, "canonical_name": "bombus vosnesenskii", "lat": 47.0, "lon": -120.0,
         "year": 2022, "month": 6, "day": 15, "date_quality": "full", "recordedBy": "A Smith"},
    ]
    _create_checklist_table(con, collapsed_rows, "int_checklist_collapsed")
    con.execute("""
        CREATE TABLE int_dedup_candidates (
            pair_key VARCHAR,
            checklist_ObjectID BIGINT,
            ecdysis_id INTEGER
        )
    """)
    con.execute("INSERT INTO int_dedup_candidates VALUES ('1|999', 1, 999)")
    con.execute("""
        CREATE TABLE dedup_decisions (
            pair_key VARCHAR,
            dedup_status VARCHAR,
            note VARCHAR
        )
    """)
    con.execute("INSERT INTO dedup_decisions VALUES ('1|999', 'confirmed', 'Same specimen')")

    status_sql = _load_model_sql(
        "int_checklist_dedup_status",
        refs={
            "int_checklist_collapsed": "int_checklist_collapsed",
            "int_dedup_candidates": "int_dedup_candidates",
            "dedup_decisions": "dedup_decisions",
        },
    )
    result_rows = _rows_to_dicts(con.execute(status_sql))

    assert len(result_rows) == 1
    status = result_rows[0].get("dedup_status")
    assert status == "confirmed", (
        f"Confirmed pair should yield dedup_status='confirmed', got {status!r}"
    )


def test_dedup_gate(tmp_path, monkeypatch):
    """DUP-03: check_dedup_gate() sys.exits when a confirmed decision's pair_key is absent from
    the regenerated candidates; prints "dedup-gate: OK" otherwise.

    RED: check_dedup_gate raises NotImplementedError.
    """
    candidates_path = _write_candidates_csv(tmp_path, [
        {
            "pair_key": "1|100", "checklist_ObjectID": 1, "ecdysis_id": 100,
            "canonical_name": "apis mellifera",
            "checklist_lat": 47.0, "checklist_lon": -120.0,
            "ecdysis_lat": 47.001, "ecdysis_lon": -120.001, "distance_m": 150.0,
            "checklist_year": 2022, "checklist_month": 6, "checklist_day": 15,
            "date_quality": "full", "ecdysis_date": "2022-06-15",
            "ecdysis_year": 2022, "ecdysis_month": 6, "ecdysis_day": 15,
            "checklist_collector": "J Smith", "ecdysis_collector": "John Smith",
        }
    ])
    # Orphaned decision: pair_key '9|999' not present in candidates → must sys.exit
    orphan_decisions_path = _write_decisions_csv(tmp_path, [
        {"pair_key": "9|999", "dedup_status": "confirmed", "note": "orphaned decision"},
    ])

    monkeypatch.setattr(checklist_dedup, "DEDUP_CANDIDATE_CSV", candidates_path)
    monkeypatch.setattr(checklist_dedup, "DEDUP_DECISIONS_CSV", orphan_decisions_path)

    # Stub raises NotImplementedError → expected SystemExit only in real implementation.
    # RED: NotImplementedError is NOT SystemExit, so pytest.raises(SystemExit) fails.
    with pytest.raises(SystemExit) as excinfo:
        checklist_dedup.check_dedup_gate()
    assert "9|999" in str(excinfo.value), (
        f"Expected orphaned pair_key '9|999' in SystemExit message, got: {excinfo.value!r}"
    )

    # Valid decisions path: all pair_keys present in candidates → prints "dedup-gate: OK"
    valid_decisions_path = _write_decisions_csv(tmp_path, [
        {"pair_key": "1|100", "dedup_status": "confirmed", "note": "verified duplicate"},
    ])
    monkeypatch.setattr(checklist_dedup, "DEDUP_DECISIONS_CSV", valid_decisions_path)

    # Must not raise (stub will raise NotImplementedError — RED)
    checklist_dedup.check_dedup_gate()
