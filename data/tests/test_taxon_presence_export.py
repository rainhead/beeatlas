"""Tests for taxon_presence_export (beeatlas-0of.2).

Covers:
  - evidence bitmask per record_type, and the union across rows of a pair
  - checklist rows ARE included (D-03 — county is their legitimate granularity)
  - both geography dimensions, keyed by taxon_id as strings
  - NULL county / NULL taxon_id rows are dropped, not crashed on
  - taxa are not split across synonym spellings (grouping is by id, not name)
  - the payload carries no elevation dimension
"""

import json

import duckdb
import pytest

from taxon_presence_export import EV_CHECKLIST, EV_COMMUNITY, EV_SPECIMEN, main

# (taxon_id, county, ecoregion_l3, record_type)
ROWS = [
    # Bombus fervidus in King: a specimen AND a community observation -> 1|2 = 3
    (52774, "King", "Puget Lowland", "specimen"),
    (52774, "King", "Puget Lowland", "inat_expert"),
    # …and checklist-only in Yakima -> 4
    (52774, "Yakima", "Cascades", "checklist"),
    # Megachile pugnata: checklist-only in King -> 4
    (6666, "King", "Puget Lowland", "checklist"),
    # waba_specimen counts as specimen evidence; provisional_sample as community
    (7777, "Pierce", "Cascades", "waba_specimen"),
    (7777, "Pierce", "Cascades", "provisional_sample"),
    # Rows that must be dropped rather than exported or crashed on
    (8888, None, None, "specimen"),
    (None, "King", "Puget Lowland", "specimen"),
]


@pytest.fixture
def export_dir(tmp_path):
    """An EXPORT_DIR containing a minimal occurrences.parquet."""
    con = duckdb.connect()
    con.execute(
        "CREATE TABLE occ (taxon_id BIGINT, county VARCHAR, ecoregion_l3 VARCHAR, record_type VARCHAR)"
    )
    con.executemany("INSERT INTO occ VALUES (?, ?, ?, ?)", ROWS)
    con.execute(f"COPY occ TO '{tmp_path / 'occurrences.parquet'}' (FORMAT PARQUET)")
    con.close()
    return tmp_path


def _payload(export_dir):
    return json.loads((main(export_dir)).read_text())


def test_evidence_union_across_rows_of_a_pair(export_dir):
    """A pair backed by a specimen AND an observation carries both bits."""
    king = _payload(export_dir)["counties"]["King"]
    assert king["52774"] == EV_SPECIMEN | EV_COMMUNITY


def test_checklist_only_pair_is_included_and_flagged(export_dir):
    """D-03: county IS the granularity a checklist assertion is valid at."""
    p = _payload(export_dir)
    assert p["counties"]["Yakima"]["52774"] == EV_CHECKLIST
    assert p["counties"]["King"]["6666"] == EV_CHECKLIST


def test_waba_specimen_is_specimen_and_provisional_is_community(export_dir):
    """The five record_types collapse into three evidence buckets."""
    pierce = _payload(export_dir)["counties"]["Pierce"]
    assert pierce["7777"] == EV_SPECIMEN | EV_COMMUNITY


def test_both_dimensions_are_exported(export_dir):
    p = _payload(export_dir)
    assert set(p) == {"counties", "ecoregions"}
    assert p["ecoregions"]["Puget Lowland"]["52774"] == EV_SPECIMEN | EV_COMMUNITY
    assert p["ecoregions"]["Cascades"]["52774"] == EV_CHECKLIST


def test_null_geography_and_null_taxon_are_dropped(export_dir):
    """A row with no county cannot assert presence anywhere; it must not appear."""
    p = _payload(export_dir)
    all_taxa = {t for place in p["counties"].values() for t in place}
    assert "8888" not in all_taxa, "a NULL-county row leaked into the payload"
    # And the NULL-taxon_id row must not have created a null-ish key.
    assert "None" not in p["counties"]["King"]
    assert "null" not in p["counties"]["King"]


def test_taxon_ids_are_string_keys(export_dir):
    """The frontend looks these up with String(taxonId) from the tree."""
    king = _payload(export_dir)["counties"]["King"]
    assert all(isinstance(k, str) for k in king)


def test_no_elevation_dimension(export_dir):
    """D-02: elevation is not expressible at this granularity and is not faked."""
    raw = (main(export_dir)).read_text()
    assert "elev" not in raw.lower()


def test_payload_is_compact_and_sorted(export_dir):
    """Compact separators + sorted keys keep it small and byte-stable across builds."""
    raw = (main(export_dir)).read_text()
    assert ", " not in raw and '": ' not in raw, "whitespace padding costs a third of the payload"
    counties = list(json.loads(raw)["counties"])
    assert counties == sorted(counties)


def test_rerun_is_byte_identical(export_dir):
    """Determinism: an unchanged input must not produce a new artifact hash."""
    first = (main(export_dir)).read_bytes()
    second = (main(export_dir)).read_bytes()
    assert first == second
