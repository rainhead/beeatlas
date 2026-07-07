"""Invariants for the Burke WA-native target-host seed (beeatlas-kuo).

Validates the committed dbt seed data/dbt/seeds/target_hosts.csv — the same
contract the dbt seed schema tests enforce at build, but checkable in the pytest
suite (no warehouse) so a bad regeneration is caught before the nightly. Built by
build_target_hosts.py from the Burke Washington Flora Checklist.
"""
from __future__ import annotations

import csv
from pathlib import Path

_SEED = Path(__file__).parent.parent / "dbt" / "seeds" / "target_hosts.csv"
_OVERRIDES = Path(__file__).parent.parent / "curation" / "target_hosts_overrides.csv"

EXPECTED_COLUMNS = ["canonical_name", "family", "inat_taxon_id", "endemic", "source"]


def _rows() -> list[dict]:
    with _SEED.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def test_columns_exact_and_ordered():
    with _SEED.open(encoding="utf-8") as f:
        header = next(csv.reader(f))
    assert header == EXPECTED_COLUMNS


def test_nonempty_and_reasonable_size():
    rows = _rows()
    # ~2,232 native angiosperm species resolved as of the Burke checklist snapshot;
    # a large drop would signal a broken reconciliation, not real flora change.
    assert len(rows) > 2000, f"only {len(rows)} target-host rows — reconciliation likely broke"


def test_inat_taxon_id_unique_and_positive_int():
    rows = _rows()
    ids = [r["inat_taxon_id"] for r in rows]
    assert all(v.isdigit() and int(v) > 0 for v in ids), "inat_taxon_id must be positive integers"
    assert len(ids) == len(set(ids)), "inat_taxon_id must be unique (join key)"


def test_endemic_flag_domain():
    assert all(r["endemic"] in ("Y", "N") for r in _rows())


def test_source_tag_and_names_present():
    for r in _rows():
        assert r["source"] == "burke-wa-flora"
        assert r["canonical_name"].strip(), "canonical_name must be non-empty"
        assert r["family"].strip(), "family must be non-empty"


def test_sorted_by_canonical_name():
    names = [r["canonical_name"] for r in _rows()]
    assert names == sorted(names), "seed must be sorted by canonical_name for byte-stable diffs"


def test_overrides_seed_header():
    with _OVERRIDES.open(encoding="utf-8") as f:
        header = next(csv.reader(f))
    assert header == ["canonical_name", "inat_taxon_id", "note"]
