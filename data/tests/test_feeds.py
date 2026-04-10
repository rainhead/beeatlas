"""Unit and integration tests for feeds.py Atom feed generation.

Tests use the fixture_db / fixture_con from conftest.py with monkeypatching
to inject test DB path and output directory, following the test_export.py pattern.
"""

import datetime
import json
import xml.etree.ElementTree as ET

import pytest

import feeds as feeds_mod
from feeds import _slugify, write_variant_feed, write_all_variants, write_index_json

ATOM_NS = 'http://www.w3.org/2005/Atom'


def _atom(tag: str) -> str:
    return f'{{{ATOM_NS}}}{tag}'


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _write_and_parse(fixture_con, export_dir):
    """Write the determinations feed and parse the resulting XML."""
    feeds_mod.write_determinations_feed(fixture_con, export_dir)
    out_path = export_dir / 'feeds' / 'determinations.xml'
    return ET.parse(str(out_path)).getroot()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_time_window_and_sort(fixture_con, export_dir, monkeypatch):
    """Only rows within 90-day window appear; blank-field rows excluded; sorted newest-first."""
    monkeypatch.setattr(feeds_mod, 'ASSETS_DIR', export_dir)
    monkeypatch.setattr(feeds_mod, 'DB_PATH', 'unused')

    root = _write_and_parse(fixture_con, export_dir)
    entries = root.findall(_atom('entry'))

    # Exactly 1 entry: recent valid row only (blank and old are excluded)
    assert len(entries) == 1, f"Expected 1 entry, got {len(entries)}"


def test_entry_fields(fixture_con, export_dir, monkeypatch):
    """Entry contains taxon name, determiner, collector, date, ecdysis link, and URN id."""
    monkeypatch.setattr(feeds_mod, 'ASSETS_DIR', export_dir)
    monkeypatch.setattr(feeds_mod, 'DB_PATH', 'unused')

    root = _write_and_parse(fixture_con, export_dir)
    entries = root.findall(_atom('entry'))
    assert len(entries) == 1
    entry = entries[0]

    title = entry.find(_atom('title'))
    assert title is not None
    assert 'Eucera acerba' in title.text
    assert 'Test Determiner' in title.text

    summary = entry.find(_atom('summary'))
    assert summary is not None
    assert 'Test Collector' in summary.text
    assert '2024-06-15' in summary.text

    link = entry.find(_atom('link'))
    assert link is not None
    href = link.get('href')
    assert href is not None
    assert 'occid=5594569' in href

    id_el = entry.find(_atom('id'))
    assert id_el is not None
    assert id_el.text == 'urn:ecdysis:69c258f0-7c62-4da3-b991-130ec3dde645'

    updated = entry.find(_atom('updated'))
    assert updated is not None
    assert updated.text is not None


def test_feed_metadata(fixture_con, export_dir, monkeypatch):
    """Feed title, updated, id, and self link are correct."""
    monkeypatch.setattr(feeds_mod, 'ASSETS_DIR', export_dir)
    monkeypatch.setattr(feeds_mod, 'DB_PATH', 'unused')

    root = _write_and_parse(fixture_con, export_dir)

    title = root.find(_atom('title'))
    assert title is not None
    assert title.text == 'Washington Bee Atlas \u2014 All Recent Determinations'

    updated = root.find(_atom('updated'))
    assert updated is not None
    assert updated.text is not None
    assert '+00:00' in updated.text, f"Expected UTC offset in updated, got: {updated.text}"

    feed_id = root.find(_atom('id'))
    assert feed_id is not None
    assert feed_id.text is not None

    # Find self link
    links = root.findall(_atom('link'))
    self_links = [lnk for lnk in links if lnk.get('rel') == 'self']
    assert len(self_links) == 1


def test_output_file(fixture_con, export_dir, monkeypatch):
    """write_determinations_feed creates feeds/determinations.xml as valid XML."""
    monkeypatch.setattr(feeds_mod, 'ASSETS_DIR', export_dir)
    monkeypatch.setattr(feeds_mod, 'DB_PATH', 'unused')

    feeds_mod.write_determinations_feed(fixture_con, export_dir)

    out_path = export_dir / 'feeds' / 'determinations.xml'
    assert out_path.exists(), "determinations.xml was not created"

    # Must be parseable XML with Atom namespace
    root = ET.parse(str(out_path)).getroot()
    assert root.tag == _atom('feed'), f"Root element is not Atom feed: {root.tag}"


def test_blank_fields_excluded(fixture_con, export_dir, monkeypatch):
    """Rows with empty scientific_name or identified_by are excluded from feed."""
    monkeypatch.setattr(feeds_mod, 'ASSETS_DIR', export_dir)
    monkeypatch.setattr(feeds_mod, 'DB_PATH', 'unused')

    root = _write_and_parse(fixture_con, export_dir)
    entries = root.findall(_atom('entry'))

    # The blank row (det-uuid-2) should not appear
    entry_ids = [e.find(_atom('id')).text for e in entries]
    assert not any('det-uuid-2' in eid for eid in entry_ids), \
        "Blank-field row should not appear in feed"
    # The valid row should appear
    assert len(entries) == 1


def test_run_py_integration():
    """run.py STEPS list includes a 'feeds' entry wired to feeds.main (PIPE-01)."""
    import run as run_mod
    import feeds as feeds_mod

    step_names = [name for name, _ in run_mod.STEPS]
    assert 'feeds' in step_names, f"'feeds' step not found in run.STEPS: {step_names}"

    # The callable must be feeds.main
    feeds_callable = dict(run_mod.STEPS)['feeds']
    assert feeds_callable is feeds_mod.main, (
        f"STEPS['feeds'] is {feeds_callable!r}, expected feeds.main ({feeds_mod.main!r})"
    )

    # 'feeds' must come after 'export' in the pipeline order
    export_idx = step_names.index('export')
    feeds_idx = step_names.index('feeds')
    assert feeds_idx > export_idx, (
        f"'feeds' (index {feeds_idx}) must come after 'export' (index {export_idx})"
    )


def test_empty_window(tmp_path, monkeypatch):
    """When no rows match 90-day window, no file is written."""
    import duckdb

    # Create a minimal DB with identifications table but no recent rows
    db_path = str(tmp_path / 'empty.duckdb')
    con = duckdb.connect(db_path)
    con.execute("CREATE SCHEMA ecdysis_data")
    con.execute("""
        CREATE TABLE ecdysis_data.identifications (
            coreid VARCHAR, scientific_name VARCHAR, identified_by VARCHAR,
            modified TIMESTAMPTZ, record_id VARCHAR,
            identification_is_current VARCHAR, date_identified VARCHAR,
            _dlt_load_id VARCHAR, _dlt_id VARCHAR
        )
    """)
    con.execute("""
        CREATE TABLE ecdysis_data.occurrences (
            id VARCHAR, occurrence_id VARCHAR,
            decimal_latitude VARCHAR, decimal_longitude VARCHAR,
            year VARCHAR, month VARCHAR, scientific_name VARCHAR,
            recorded_by VARCHAR, field_number VARCHAR,
            genus VARCHAR, family VARCHAR, associated_taxa VARCHAR,
            event_date VARCHAR,
            _dlt_load_id VARCHAR, _dlt_id VARCHAR
        )
    """)
    # No rows inserted — empty result set

    out_dir = tmp_path / 'out'
    out_dir.mkdir()

    feeds_mod.write_determinations_feed(con, out_dir)
    con.close()

    out_path = out_dir / 'feeds' / 'determinations.xml'
    assert not out_path.exists(), "No file should be written when result set is empty"


# ---------------------------------------------------------------------------
# Phase 43 — Variant feed tests
# ---------------------------------------------------------------------------

def test_slugify():
    """_slugify converts human names to URL-safe ASCII slugs."""
    assert _slugify("Jane Smith") == "jane-smith"
    assert _slugify("") == "unknown"
    # Accented chars transliterated
    assert _slugify("Müller") == "muller"
    # Parentheses and other non-alphanumeric stripped
    slug = _slugify("Mucera (subgenus)")
    assert all(c in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in slug), \
        f"Slug contains non-[a-z0-9-] chars: {slug!r}"
    # Path traversal characters stripped
    assert '/' not in _slugify("../../etc/passwd")
    assert '.' not in _slugify("../../etc/passwd")


def test_collector_variant(fixture_con, export_dir):
    """write_all_variants produces collector-test-collector.xml with 1 matching entry."""
    run_time = datetime.datetime.now(tz=datetime.timezone.utc)
    write_all_variants(fixture_con, export_dir, run_time)

    feed_path = export_dir / 'feeds' / 'collector-test-collector.xml'
    assert feed_path.exists(), f"Expected {feed_path} to exist"

    root = ET.parse(str(feed_path)).getroot()
    assert root.tag == _atom('feed'), f"Root element is not Atom feed: {root.tag}"

    entries = root.findall(_atom('entry'))
    assert len(entries) == 1, f"Expected 1 entry, got {len(entries)}"

    title = root.find(_atom('title'))
    assert title is not None
    assert 'Collector: Test Collector' in title.text, \
        f"Expected 'Collector: Test Collector' in title, got: {title.text!r}"

    # Self link href contains the variant filename
    links = root.findall(_atom('link'))
    self_links = [lnk for lnk in links if lnk.get('rel') == 'self']
    assert len(self_links) == 1
    assert 'collector-test-collector.xml' in self_links[0].get('href', '')


def test_genus_variant(fixture_con, export_dir):
    """write_all_variants produces genus-eucera.xml with 1 matching entry."""
    run_time = datetime.datetime.now(tz=datetime.timezone.utc)
    write_all_variants(fixture_con, export_dir, run_time)

    feed_path = export_dir / 'feeds' / 'genus-eucera.xml'
    assert feed_path.exists(), f"Expected {feed_path} to exist"

    root = ET.parse(str(feed_path)).getroot()
    assert root.tag == _atom('feed')

    entries = root.findall(_atom('entry'))
    assert len(entries) == 1, f"Expected 1 entry for genus Eucera, got {len(entries)}"

    title = root.find(_atom('title'))
    assert title is not None
    assert 'Genus: Eucera' in title.text, \
        f"Expected 'Genus: Eucera' in title, got: {title.text!r}"

    links = root.findall(_atom('link'))
    self_links = [lnk for lnk in links if lnk.get('rel') == 'self']
    assert len(self_links) == 1
    assert 'genus-eucera.xml' in self_links[0].get('href', '')


def test_county_variant(fixture_con, export_dir):
    """write_all_variants produces county-chelan.xml with 1 entry (spatial join)."""
    run_time = datetime.datetime.now(tz=datetime.timezone.utc)
    write_all_variants(fixture_con, export_dir, run_time)

    feed_path = export_dir / 'feeds' / 'county-chelan.xml'
    assert feed_path.exists(), f"Expected {feed_path} to exist"

    root = ET.parse(str(feed_path)).getroot()
    assert root.tag == _atom('feed')

    entries = root.findall(_atom('entry'))
    assert len(entries) == 1, f"Expected 1 entry for Chelan county, got {len(entries)}"

    title = root.find(_atom('title'))
    assert title is not None
    assert 'County: Chelan' in title.text, \
        f"Expected 'County: Chelan' in title, got: {title.text!r}"

    links = root.findall(_atom('link'))
    self_links = [lnk for lnk in links if lnk.get('rel') == 'self']
    assert len(self_links) == 1
    assert 'county-chelan.xml' in self_links[0].get('href', '')


def test_ecoregion_variant(fixture_con, export_dir):
    """write_all_variants produces ecoregion-north-cascades.xml with 1 entry (spatial join)."""
    run_time = datetime.datetime.now(tz=datetime.timezone.utc)
    write_all_variants(fixture_con, export_dir, run_time)

    feed_path = export_dir / 'feeds' / 'ecoregion-north-cascades.xml'
    assert feed_path.exists(), f"Expected {feed_path} to exist"

    root = ET.parse(str(feed_path)).getroot()
    assert root.tag == _atom('feed')

    entries = root.findall(_atom('entry'))
    assert len(entries) == 1, f"Expected 1 entry for North Cascades, got {len(entries)}"

    title = root.find(_atom('title'))
    assert title is not None
    assert 'Ecoregion: North Cascades' in title.text, \
        f"Expected 'Ecoregion: North Cascades' in title, got: {title.text!r}"

    links = root.findall(_atom('link'))
    self_links = [lnk for lnk in links if lnk.get('rel') == 'self']
    assert len(self_links) == 1
    assert 'ecoregion-north-cascades.xml' in self_links[0].get('href', '')


def test_empty_variant_feed(tmp_path):
    """Empty variant feeds (0 matching entries) are written as valid Atom with 0 entries and run_time updated."""
    import duckdb
    from conftest import WA_STATE_WKT, CHELAN_WKT, NORTH_CASCADES_WKT

    # Create minimal DB: geographies tables with one county + one ecoregion, but NO identifications/occurrences
    db_path = str(tmp_path / 'empty_variant.duckdb')
    con = duckdb.connect(db_path)
    con.execute("INSTALL spatial; LOAD spatial;")
    con.execute("CREATE SCHEMA geographies")
    con.execute("CREATE SCHEMA ecdysis_data")
    con.execute("""
        CREATE TABLE geographies.us_states (
            fips VARCHAR, name VARCHAR, abbreviation VARCHAR,
            geometry_wkt VARCHAR, _dlt_load_id VARCHAR, _dlt_id VARCHAR
        )
    """)
    con.execute("""
        CREATE TABLE geographies.us_counties (
            geoid VARCHAR, name VARCHAR, state_fips VARCHAR,
            geometry_wkt VARCHAR, _dlt_load_id VARCHAR, _dlt_id VARCHAR
        )
    """)
    con.execute("""
        CREATE TABLE geographies.ecoregions (
            name VARCHAR, level2_name VARCHAR, level1_name VARCHAR,
            geometry_wkt VARCHAR, _dlt_load_id VARCHAR, _dlt_id VARCHAR
        )
    """)
    con.execute("""
        CREATE TABLE ecdysis_data.occurrences (
            id VARCHAR, occurrence_id VARCHAR,
            decimal_latitude VARCHAR, decimal_longitude VARCHAR,
            year VARCHAR, month VARCHAR, scientific_name VARCHAR,
            recorded_by VARCHAR, field_number VARCHAR,
            genus VARCHAR, family VARCHAR, associated_taxa VARCHAR,
            event_date VARCHAR,
            _dlt_load_id VARCHAR, _dlt_id VARCHAR
        )
    """)
    con.execute("""
        CREATE TABLE ecdysis_data.identifications (
            coreid VARCHAR, scientific_name VARCHAR, identified_by VARCHAR,
            modified TIMESTAMPTZ, record_id VARCHAR,
            identification_is_current VARCHAR, date_identified VARCHAR,
            _dlt_load_id VARCHAR, _dlt_id VARCHAR
        )
    """)
    # Seed geographies but NO occurrence/identification rows
    con.execute(
        "INSERT INTO geographies.us_states VALUES ('53', 'Washington', 'WA', ?, 'load1', 'state-wa')",
        [WA_STATE_WKT],
    )
    con.execute(
        "INSERT INTO geographies.us_counties VALUES ('53007', 'Chelan', '53', ?, 'load1', 'county-chelan')",
        [CHELAN_WKT],
    )
    con.execute(
        "INSERT INTO geographies.ecoregions VALUES ('North Cascades', 'Western Cordillera', 'North American Cordillera', ?, 'load1', 'eco-nc')",
        [NORTH_CASCADES_WKT],
    )

    out_dir = tmp_path / 'out'
    out_dir.mkdir()
    run_time = datetime.datetime(2026, 1, 15, 12, 0, 0, tzinfo=datetime.timezone.utc)

    write_all_variants(con, out_dir, run_time)
    con.close()

    # County and ecoregion files must exist (D-01: always write)
    county_path = out_dir / 'feeds' / 'county-chelan.xml'
    ecoregion_path = out_dir / 'feeds' / 'ecoregion-north-cascades.xml'
    assert county_path.exists(), "county-chelan.xml must exist even with 0 entries (D-01)"
    assert ecoregion_path.exists(), "ecoregion-north-cascades.xml must exist even with 0 entries (D-01)"

    for feed_path in [county_path, ecoregion_path]:
        root = ET.parse(str(feed_path)).getroot()
        # Valid Atom structure (D-03)
        assert root.tag == _atom('feed'), f"Root element is not Atom feed in {feed_path.name}"
        # Zero entry children (D-03)
        entries = root.findall(_atom('entry'))
        assert len(entries) == 0, f"Expected 0 entries in empty feed {feed_path.name}, got {len(entries)}"
        # Feed-level updated uses run_time (D-02)
        updated = root.find(_atom('updated'))
        assert updated is not None, f"Missing <updated> in {feed_path.name}"
        assert updated.text is not None
        # run_time is 2026-01-15T12:00:00+00:00
        assert '2026-01-15' in updated.text, \
            f"Expected run_time in updated for empty feed {feed_path.name}, got: {updated.text!r}"


def test_index_json(fixture_con, export_dir):
    """write_index_json produces valid JSON with all required fields; empty feeds have entry_count=0."""
    run_time = datetime.datetime.now(tz=datetime.timezone.utc)
    entries = write_all_variants(fixture_con, export_dir, run_time)
    write_index_json(export_dir, entries)

    index_path = export_dir / 'feeds' / 'index.json'
    assert index_path.exists(), "index.json was not created"

    with open(index_path) as f:
        data = json.load(f)

    assert isinstance(data, list), f"Expected list, got {type(data)}"
    assert len(data) > 0, "index.json should have at least one entry"

    for entry in data:
        assert 'title' in entry, f"Entry missing 'title': {entry}"
        assert 'filter_type' in entry, f"Entry missing 'filter_type': {entry}"
        assert 'entry_count' in entry, f"Entry missing 'entry_count': {entry}"
        assert isinstance(entry['entry_count'], int), \
            f"entry_count must be int, got {type(entry['entry_count'])}"

    # Verify collector entry present with correct data
    collector_entries = [e for e in data if e.get('filter_type') == 'collector']
    assert len(collector_entries) >= 1, "Expected at least one collector entry in index"
    test_collector = next((e for e in collector_entries if 'Test Collector' in e.get('filter_value', '')), None)
    assert test_collector is not None, "Expected entry for 'Test Collector' in index"
    assert test_collector['entry_count'] == 1

    # Verify all recommended fields on each entry
    for entry in data:
        assert 'filename' in entry, f"Entry missing 'filename': {entry}"
        assert 'url' in entry, f"Entry missing 'url': {entry}"
        assert 'filter_value' in entry, f"Entry missing 'filter_value': {entry}"
