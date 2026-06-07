"""Tests for Phase 76 / Plan 05 — occurrences canonical_name + reconcile().

Phase 135 Plan 03 — RETIRED: reconcile() removed per D-07 / RCN-06.
All tests in this file test the defunct reconcile() path and are skipped.
Checklist synonym resolution now flows through occurrence_synonyms / int_synonyms.
"""

import csv
import importlib

import duckdb
import pytest

from canonical_name import normalize_scientific_name

_RETIRED = pytest.mark.skip(
    reason=(
        "reconcile() retired per D-07 / RCN-06 (Phase 135 Plan 03). "
        "SYNONYMS_PATH and UNMATCHED_PATH no longer exist in checklist_pipeline. "
        "Synonym resolution now flows through occurrence_synonyms / int_synonyms."
    )
)


@pytest.fixture
def reload_pipeline(tmp_path, monkeypatch, request):
    """Reload checklist_pipeline so SYNONYMS_PATH/UNMATCHED_PATH point at tmp.

    Phase 142 Rule 1 fix: save/restore module-level path constants around
    importlib.reload() to prevent order-dependence when pytest-randomly interleaves
    this fixture with test_checklist_pipeline.py's module-scoped checklist_sample_db
    (which patches those same constants). Without save/restore, reload() resets the
    real-filesystem paths and clobbers checklist_sample_db's patches mid-module.
    """
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.duckdb"))
    import checklist_pipeline

    # Save any currently-patched module-level path constants before reload.
    saved = {
        attr: getattr(checklist_pipeline, attr)
        for attr in (
            "CHECKLIST_RECORDS_FULL_PATH",
            "CHECKLIST_RECORDS_PATH",
            "CHECKLIST_PATH",
            "TAXA_PATH",
            "_TAXA_ANCESTRY",
            "DB_PATH",
        )
        if hasattr(checklist_pipeline, attr)
    }

    importlib.reload(checklist_pipeline)

    # Restore so the module returns to the state it was in before this fixture ran.
    def _restore():
        for attr, val in saved.items():
            setattr(checklist_pipeline, attr, val)

    request.addfinalizer(_restore)
    return checklist_pipeline


def _bootstrap_occurrences(con: duckdb.DuckDBPyConnection) -> None:
    con.execute("CREATE SCHEMA IF NOT EXISTS ecdysis_data")
    con.execute(
        "CREATE TABLE ecdysis_data.occurrences (scientific_name VARCHAR)"
    )


def test_update_occurrences_adds_canonical_name_column(reload_pipeline):  # NOT skipped — _update_occurrences_canonical_name is still live
    mod = reload_pipeline
    con = duckdb.connect(":memory:")
    _bootstrap_occurrences(con)
    con.execute(
        "INSERT INTO ecdysis_data.occurrences VALUES "
        "('Lasioglossum (Dialictus) zonulum'), "
        "('Andrena fulva (Müller, 1766)'), (NULL), ('')"
    )
    mod._update_occurrences_canonical_name(con)
    rows = con.execute(
        "SELECT scientific_name, canonical_name FROM ecdysis_data.occurrences"
    ).fetchall()
    by_sci = {r[0]: r[1] for r in rows}
    assert by_sci["Lasioglossum (Dialictus) zonulum"] == "lasioglossum zonulum"
    assert by_sci["Andrena fulva (Müller, 1766)"] == "andrena fulva"
    assert by_sci[None] is None
    assert by_sci[""] is None


def test_update_occurrences_is_idempotent(reload_pipeline):  # NOT skipped — _update_occurrences_canonical_name is still live
    mod = reload_pipeline
    con = duckdb.connect(":memory:")
    _bootstrap_occurrences(con)
    con.execute(
        "INSERT INTO ecdysis_data.occurrences VALUES ('Bombus vosnesenskii')"
    )
    mod._update_occurrences_canonical_name(con)
    # Second call — column already exists; ALTER TABLE ... IF NOT EXISTS guard.
    mod._update_occurrences_canonical_name(con)
    val = con.execute(
        "SELECT canonical_name FROM ecdysis_data.occurrences"
    ).fetchone()[0]
    assert val == normalize_scientific_name("Bombus vosnesenskii")


def _bootstrap_for_reconcile(con: duckdb.DuckDBPyConnection) -> None:
    con.execute("CREATE SCHEMA IF NOT EXISTS ecdysis_data")
    con.execute("CREATE SCHEMA IF NOT EXISTS checklist_data")
    con.execute(
        "CREATE TABLE ecdysis_data.occurrences "
        "(scientific_name VARCHAR, canonical_name VARCHAR)"
    )
    con.execute("""
        CREATE TABLE checklist_data.species (
            scientificName VARCHAR PRIMARY KEY,
            canonical_name VARCHAR NOT NULL
        )
    """)


@_RETIRED
def test_reconcile_writes_header_only_when_all_match(reload_pipeline, tmp_path, monkeypatch):
    mod = reload_pipeline
    monkeypatch.setattr(mod, "SYNONYMS_PATH", tmp_path / "synonyms.csv")
    monkeypatch.setattr(mod, "UNMATCHED_PATH", tmp_path / "unmatched.csv")
    (tmp_path / "synonyms.csv").write_text("checklist_name,canonical_name,source\n")

    con = duckdb.connect(":memory:")
    _bootstrap_for_reconcile(con)
    con.execute(
        "INSERT INTO ecdysis_data.occurrences VALUES ('Bombus vosnesenskii', 'bombus vosnesenskii')"
    )
    con.execute(
        "INSERT INTO checklist_data.species VALUES ('Bombus vosnesenskii', 'bombus vosnesenskii')"
    )
    mod.reconcile(con)
    text = (tmp_path / "unmatched.csv").read_text().splitlines()
    assert text[0] == "checklist_name,canonical_name,reason"
    assert len(text) == 1


@_RETIRED
def test_reconcile_records_unmatched_with_reason(reload_pipeline, tmp_path, monkeypatch):
    mod = reload_pipeline
    monkeypatch.setattr(mod, "SYNONYMS_PATH", tmp_path / "synonyms.csv")
    monkeypatch.setattr(mod, "UNMATCHED_PATH", tmp_path / "unmatched.csv")
    (tmp_path / "synonyms.csv").write_text("checklist_name,canonical_name,source\n")

    con = duckdb.connect(":memory:")
    _bootstrap_for_reconcile(con)
    con.execute(
        "INSERT INTO checklist_data.species VALUES ('Andrena prima', 'andrena prima')"
    )
    mod.reconcile(con)
    rows = list(csv.DictReader((tmp_path / "unmatched.csv").open()))
    assert len(rows) == 1
    assert rows[0]["checklist_name"] == "Andrena prima"
    assert rows[0]["canonical_name"] == "andrena prima"
    assert rows[0]["reason"] == "no occurrence row matches canonical_name"


@_RETIRED
def test_reconcile_synonym_override_updates_checklist(reload_pipeline, tmp_path, monkeypatch):
    mod = reload_pipeline
    monkeypatch.setattr(mod, "SYNONYMS_PATH", tmp_path / "synonyms.csv")
    monkeypatch.setattr(mod, "UNMATCHED_PATH", tmp_path / "unmatched.csv")
    (tmp_path / "synonyms.csv").write_text(
        "checklist_name,canonical_name,source\n"
        "Andrena prima,andrena secunda,test\n"
    )

    con = duckdb.connect(":memory:")
    _bootstrap_for_reconcile(con)
    con.execute(
        "INSERT INTO ecdysis_data.occurrences VALUES ('Andrena secunda', 'andrena secunda')"
    )
    con.execute(
        "INSERT INTO checklist_data.species VALUES ('Andrena prima', 'andrena prima')"
    )
    mod.reconcile(con)
    updated = con.execute(
        "SELECT canonical_name FROM checklist_data.species WHERE scientificName = 'Andrena prima'"
    ).fetchone()[0]
    assert updated == "andrena secunda"
    text = (tmp_path / "unmatched.csv").read_text().splitlines()
    assert len(text) == 1  # header only, no unmatched rows


@_RETIRED
def test_reconcile_synonym_override_no_match_records_unmatched(reload_pipeline, tmp_path, monkeypatch):
    mod = reload_pipeline
    monkeypatch.setattr(mod, "SYNONYMS_PATH", tmp_path / "synonyms.csv")
    monkeypatch.setattr(mod, "UNMATCHED_PATH", tmp_path / "unmatched.csv")
    (tmp_path / "synonyms.csv").write_text(
        "checklist_name,canonical_name,source\n"
        "Andrena prima,andrena ghost,test\n"
    )

    con = duckdb.connect(":memory:")
    _bootstrap_for_reconcile(con)
    con.execute(
        "INSERT INTO checklist_data.species VALUES ('Andrena prima', 'andrena prima')"
    )
    mod.reconcile(con)
    rows = list(csv.DictReader((tmp_path / "unmatched.csv").open()))
    assert len(rows) == 1
    assert rows[0]["checklist_name"] == "Andrena prima"
    assert rows[0]["canonical_name"] == "andrena ghost"
    assert rows[0]["reason"] == "synonym override did not join occurrences"


@_RETIRED
def test_reconcile_does_not_raise_on_unmatched(reload_pipeline, tmp_path, monkeypatch):
    """D-05 warn-only invariant."""
    mod = reload_pipeline
    monkeypatch.setattr(mod, "SYNONYMS_PATH", tmp_path / "synonyms.csv")
    monkeypatch.setattr(mod, "UNMATCHED_PATH", tmp_path / "unmatched.csv")
    (tmp_path / "synonyms.csv").write_text("checklist_name,canonical_name,source\n")

    con = duckdb.connect(":memory:")
    _bootstrap_for_reconcile(con)
    con.execute(
        "INSERT INTO checklist_data.species VALUES "
        "('Andrena prima', 'andrena prima'), ('Bombus alpha', 'bombus alpha')"
    )
    # Must not raise, even with everything unmatched.
    mod.reconcile(con)
    rows = list(csv.DictReader((tmp_path / "unmatched.csv").open()))
    assert len(rows) == 2


@_RETIRED
def test_reconcile_overwrites_existing_unmatched_csv(reload_pipeline, tmp_path, monkeypatch):
    mod = reload_pipeline
    monkeypatch.setattr(mod, "SYNONYMS_PATH", tmp_path / "synonyms.csv")
    monkeypatch.setattr(mod, "UNMATCHED_PATH", tmp_path / "unmatched.csv")
    (tmp_path / "synonyms.csv").write_text("checklist_name,canonical_name,source\n")
    (tmp_path / "unmatched.csv").write_text(
        "checklist_name,canonical_name,reason\nstale,stale,stale\n"
    )

    con = duckdb.connect(":memory:")
    _bootstrap_for_reconcile(con)
    con.execute(
        "INSERT INTO ecdysis_data.occurrences VALUES ('Bombus vosnesenskii', 'bombus vosnesenskii')"
    )
    con.execute(
        "INSERT INTO checklist_data.species VALUES ('Bombus vosnesenskii', 'bombus vosnesenskii')"
    )
    mod.reconcile(con)
    text = (tmp_path / "unmatched.csv").read_text()
    assert "stale" not in text
