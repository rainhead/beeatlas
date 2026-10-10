"""Tests for host_plant_lineage.load_plant_genus_families (stelis st-d64).

A plant genus NAME resolves to the one family iNat files it under, so Fowler's
host lists, which name genera by text, can be grouped by family. Covers:
  - an active genus resolves to its family
  - a retired (inactive) name with no active record still resolves
  - an active record decides over a disagreeing inactive one
  - a name whose active records disagree is left out (family unknown)
  - an animal genus never resolves, even with a plant-like name
"""

import gzip
import importlib

import duckdb
import pytest

# 48460 = Life, 47126 = Plantae, 1 = Animalia (iNat's ids)
TSV = (
    "taxon_id\tancestry\trank_level\trank\tname\tactive\n"
    "10\t48460/47126\t30\tfamily\tAsteraceae\ttrue\n"
    "11\t48460/47126\t30\tfamily\tPolygonaceae\ttrue\n"
    "12\t48460/47126\t30\tfamily\tBrassicaceae\ttrue\n"
    "13\t48460/47126\t30\tfamily\tCapparaceae\tfalse\n"
    "14\t48460/47126\t30\tfamily\tCleomaceae\ttrue\n"
    "20\t48460/47126/10\t20\tgenus\tSolidago\ttrue\n"
    "21\t48460/47126/11\t20\tgenus\tEriogonum\ttrue\n"
    # retired name, only an inactive record
    "22\t48460/47126/12\t20\tgenus\tLesquerella\tfalse\n"
    # moved family: the inactive record says Capparaceae, the active one Cleomaceae
    "23\t48460/47126/13\t20\tgenus\tCleome\tfalse\n"
    "24\t48460/47126/14\t20\tgenus\tCleome\ttrue\n"
    # a hemihomonym inside plants: two ACTIVE genera, two families
    "25\t48460/47126/10\t20\tgenus\tDuplicata\ttrue\n"
    "26\t48460/47126/11\t20\tgenus\tDuplicata\ttrue\n"
    # an animal genus and family
    "30\t48460/1\t30\tfamily\tApidae\ttrue\n"
    "31\t48460/1/30\t20\tgenus\tBombus\ttrue\n"
)


@pytest.fixture
def families(tmp_path, monkeypatch):
    path = tmp_path / "taxa.csv.gz"
    with gzip.open(path, "wb") as f:
        f.write(TSV.encode())
    db_path = str(tmp_path / "pgf.duckdb")
    monkeypatch.setenv("DB_PATH", db_path)
    import host_plant_lineage as hpl  # noqa: PLC0415
    importlib.reload(hpl)
    monkeypatch.setattr(hpl, "TAXA_PATH", path)
    hpl.load_plant_genus_families(db_path)
    con = duckdb.connect(db_path, read_only=True)
    rows = dict(con.execute(
        "SELECT genus, family FROM inaturalist_data.plant_genus_families"
    ).fetchall())
    con.close()
    return rows


def test_active_genus_resolves(families):
    assert families["Solidago"] == "Asteraceae"
    assert families["Eriogonum"] == "Polygonaceae"


def test_retired_name_resolves(families):
    assert families["Lesquerella"] == "Brassicaceae"


def test_active_record_decides_over_inactive(families):
    assert families["Cleome"] == "Cleomaceae"


def test_disagreeing_active_records_left_out(families):
    assert "Duplicata" not in families


def test_animal_genus_never_resolves(families):
    assert "Bombus" not in families
