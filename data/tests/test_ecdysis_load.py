"""The ecdysis loader's load step: when it reloads, and canonical_name (ADR 0023
amendment, beeatlas-4uez).

The loader skips the dlt load when ecdysis_data already holds the archive it was
given, loaded by the same code, and sets canonical_name on both tables on every run,
loaded or not. These tests run the real dlt load into a DuckDB file of their own,
from small archives shaped like Ecdysis's, with the download replaced.
"""

import io
import zipfile

import duckdb
import pytest

import ecdysis_pipeline
from canonical_name import normalize_scientific_name

OCCURRENCES = (
    "id\tscientificName\trecordedBy\n"
    "1\tBombus melanopygus mixtus\tA. Collector\n"
    "2\tAndrena fulva (Müller, 1766)\tB. Collector\n"
)
# Comma-delimited despite meta.xml, as Ecdysis writes it.
IDENTIFICATIONS = (
    "coreid,recordID,scientificName\n"
    "1,r1,Bombus melanopygus\n"
    "2,r2,Lasioglossum (Dialictus)\n"
)


def _archive(occurrences: str = OCCURRENCES, identifications: str = IDENTIFICATIONS) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("occurrences.tab", occurrences)
        zf.writestr("identifications.tab", identifications)
    return buf.getvalue()


@pytest.fixture
def db(tmp_path, monkeypatch):
    """A DuckDB file and a dlt data dir of the test's own, so the load neither reads
    nor writes the developer's pipeline state."""
    path = str(tmp_path / "ecdysis.duckdb")
    monkeypatch.setattr(ecdysis_pipeline, "DB_PATH", path)
    monkeypatch.setenv("DLT_DATA_DIR", str(tmp_path / "dlt"))
    return path


def _load(monkeypatch, archive: bytes) -> list[str]:
    """Run load_ecdysis on `archive`; return the dlt load ids now in the tables."""
    monkeypatch.setattr(ecdysis_pipeline, "_download_zip", lambda _dataset_id: archive)
    ecdysis_pipeline.load_ecdysis(dataset_id=44)
    with duckdb.connect(ecdysis_pipeline.DB_PATH) as con:
        return sorted(r[0] for r in con.execute(
            "SELECT DISTINCT _dlt_load_id FROM ecdysis_data.occurrences"
        ).fetchall())


def _canonical(table: str) -> dict[str, str | None]:
    with duckdb.connect(ecdysis_pipeline.DB_PATH) as con:
        return dict(con.execute(
            f"SELECT scientific_name, canonical_name FROM {table}"
        ).fetchall())


def test_the_same_archive_is_not_loaded_twice(db, monkeypatch):
    first = _load(monkeypatch, _archive())
    assert _load(monkeypatch, _archive()) == first


def test_a_different_archive_is_loaded(db, monkeypatch):
    first = _load(monkeypatch, _archive())
    second = _load(monkeypatch, _archive(occurrences=OCCURRENCES + "3\tApis mellifera\tC\n"))
    assert second != first
    assert "Apis mellifera" in _canonical("ecdysis_data.occurrences")


def test_a_change_to_the_loader_reloads(db, monkeypatch):
    """The parsing rules live in the loader's code, so the same archive read by
    changed code must be read again (beeatlas-3je9 changed them once)."""
    first = _load(monkeypatch, _archive())
    monkeypatch.setattr(ecdysis_pipeline, "_loader_fingerprint", lambda: "changed")
    assert _load(monkeypatch, _archive()) != first


def test_a_missing_record_reloads(db, monkeypatch):
    """No record of what was loaded (a DuckDB from before the record existed) is
    not evidence that the tables hold this archive."""
    first = _load(monkeypatch, _archive())
    with duckdb.connect(db) as con:
        con.execute(f"DROP TABLE {ecdysis_pipeline.LOADED_ARCHIVE_TABLE}")
    assert _load(monkeypatch, _archive()) != first


def test_a_failed_load_is_not_recorded_as_loaded(db, monkeypatch):
    """The record is dropped before a load, so a load that fails part way is
    retried on the next run even though the archive has not changed."""
    _load(monkeypatch, _archive())
    monkeypatch.setattr(ecdysis_pipeline, "_loader_fingerprint", lambda: "changed")

    def fail(*_args, **_kwargs):
        raise RuntimeError("load failed")

    monkeypatch.setattr(ecdysis_pipeline.dlt, "pipeline", fail)
    with pytest.raises(RuntimeError):
        _load(monkeypatch, _archive())
    with duckdb.connect(db) as con:
        assert not ecdysis_pipeline._archive_already_loaded(con, "anything", "changed")


def test_canonical_name_is_set_whether_or_not_the_load_ran(db, monkeypatch):
    expected = {
        "Bombus melanopygus mixtus": "bombus melanopygus",
        "Andrena fulva (Müller, 1766)": "andrena fulva",
    }
    _load(monkeypatch, _archive())
    assert _canonical("ecdysis_data.occurrences") == expected
    assert _canonical("ecdysis_data.identifications")["Lasioglossum (Dialictus)"] == "lasioglossum"

    # A skipped load still recomputes it, so a change to canonical_name.py reaches
    # tables the loader did not reload.
    with duckdb.connect(db) as con:
        con.execute("UPDATE ecdysis_data.occurrences SET canonical_name = 'stale'")
    _load(monkeypatch, _archive())
    assert _canonical("ecdysis_data.occurrences") == expected


def test_a_skipped_load_leaves_the_tables_as_they_were(db, monkeypatch):
    """What Stelis digests: every column but dlt's own (relation-digest.rkt). A run
    that skips the load must leave that content exactly as the last run left it,
    or every night after a real change would read as a change."""
    def content():
        with duckdb.connect(db) as con:
            return {
                t: sorted(con.execute(
                    f"SELECT COLUMNS(c -> NOT starts_with(c, '_dlt_'))::VARCHAR FROM {t}"
                ).fetchall(), key=str)
                for t in ecdysis_pipeline.ECDYSIS_TABLES
            }

    _load(monkeypatch, _archive())
    after_load = content()
    _load(monkeypatch, _archive())
    assert content() == after_load



def test_update_occurrences_canonical_name_maps_distinct_names():
    """Set-based UPDATE maps distinct scientific_names to canonical form.

    Guards _materialize_canonical_name() using a fresh in-memory
    connection with real rows (not the zero-row occurrence table in
    checklist_sample_db). Verifies:
    - Two rows sharing a trinomial scientific_name both receive the binomial
      canonical_name (duplicate rows handled by the JOIN, not per-row loop)
    - An authority-bearing name has its authority stripped
    - A row with NULL scientific_name keeps canonical_name NULL (no join match)
    """
    con = duckdb.connect(":memory:")
    try:
        con.execute("CREATE SCHEMA ecdysis_data")
        con.execute(
            "CREATE TABLE ecdysis_data.occurrences "
            "(scientific_name VARCHAR, canonical_name VARCHAR)"
        )
        con.execute("""
            INSERT INTO ecdysis_data.occurrences VALUES
            ('Bombus melanopygus mixtus', NULL),
            ('Bombus melanopygus mixtus', NULL),
            ('Andrena fulva (Müller, 1766)', NULL),
            (NULL, NULL)
        """)

        ecdysis_pipeline._materialize_canonical_name(con, "ecdysis_data.occurrences")

        rows = con.execute(
            "SELECT scientific_name, canonical_name "
            "FROM ecdysis_data.occurrences "
            "ORDER BY scientific_name NULLS LAST"
        ).fetchall()

        # Both Bombus trinomial rows -> 'bombus melanopygus'
        bombus = [r for r in rows if r[0] == "Bombus melanopygus mixtus"]
        assert len(bombus) == 2, f"expected 2 Bombus rows, got {len(bombus)}"
        for sci, canon in bombus:
            expected = normalize_scientific_name(sci)
            assert canon == expected, f"{sci!r}: got {canon!r}, expected {expected!r}"

        # Authority-bearing Andrena -> 'andrena fulva'
        andrena = [r for r in rows if r[0] == "Andrena fulva (Müller, 1766)"]
        assert len(andrena) == 1
        assert andrena[0][1] == "andrena fulva", (
            f"authority not stripped: {andrena[0][1]!r}"
        )

        # NULL scientific_name -> canonical_name stays NULL
        null_rows = [r for r in rows if r[0] is None]
        assert len(null_rows) == 1
        assert null_rows[0][1] is None, (
            f"NULL scientific_name row got canonical_name={null_rows[0][1]!r}, expected NULL"
        )
    finally:
        con.close()


def test_update_identifications_canonical_name_handles_subgenus_forms():
    """beeatlas-fc4: identifications get the same canonical_name materialization.

    The load-bearing case is the parenthetical-subgenus determination
    'Lasioglossum (Dialictus)' — it must canonicalize to the genus
    ('lasioglossum'), never be misread as a binomial.
    """
    con = duckdb.connect(":memory:")
    try:
        con.execute("CREATE SCHEMA ecdysis_data")
        con.execute(
            "CREATE TABLE ecdysis_data.identifications "
            "(coreid VARCHAR, scientific_name VARCHAR)"
        )
        con.execute("""
            INSERT INTO ecdysis_data.identifications VALUES
            ('1', 'Lasioglossum (Dialictus)'),
            ('2', 'Colletes consors pascoensis'),
            ('3', 'undetermined'),
            ('4', NULL)
        """)

        ecdysis_pipeline._materialize_canonical_name(con, "ecdysis_data.identifications")

        rows = dict(con.execute(
            "SELECT coreid, canonical_name FROM ecdysis_data.identifications"
        ).fetchall())

        assert rows["1"] == "lasioglossum", (
            f"subgenus form must fold to genus, got {rows['1']!r}"
        )
        assert rows["2"] == "colletes consors", (
            f"trinomial must fold to binomial, got {rows['2']!r}"
        )
        # The sentinel canonicalizes like any string; filtering it is the
        # intermediate model's job, not the materialization's.
        assert rows["3"] == "undetermined"
        assert rows["4"] is None
    finally:
        con.close()


def _bootstrap_occurrences(con: duckdb.DuckDBPyConnection) -> None:
    con.execute("CREATE SCHEMA IF NOT EXISTS ecdysis_data")
    con.execute(
        "CREATE TABLE ecdysis_data.occurrences (scientific_name VARCHAR)"
    )


def test_update_occurrences_adds_canonical_name_column():
    con = duckdb.connect(":memory:")
    _bootstrap_occurrences(con)
    con.execute(
        "INSERT INTO ecdysis_data.occurrences VALUES "
        "('Lasioglossum (Dialictus) zonulum'), "
        "('Andrena fulva (Müller, 1766)'), (NULL), ('')"
    )
    ecdysis_pipeline._materialize_canonical_name(con, "ecdysis_data.occurrences")
    rows = con.execute(
        "SELECT scientific_name, canonical_name FROM ecdysis_data.occurrences"
    ).fetchall()
    by_sci = {r[0]: r[1] for r in rows}
    assert by_sci["Lasioglossum (Dialictus) zonulum"] == "lasioglossum zonulum"
    assert by_sci["Andrena fulva (Müller, 1766)"] == "andrena fulva"
    assert by_sci[None] is None
    assert by_sci[""] is None


def test_update_occurrences_is_idempotent():
    con = duckdb.connect(":memory:")
    _bootstrap_occurrences(con)
    con.execute(
        "INSERT INTO ecdysis_data.occurrences VALUES ('Bombus vosnesenskii')"
    )
    ecdysis_pipeline._materialize_canonical_name(con, "ecdysis_data.occurrences")
    # Second call — column already exists; ALTER TABLE ... IF NOT EXISTS guard.
    ecdysis_pipeline._materialize_canonical_name(con, "ecdysis_data.occurrences")
    val = con.execute(
        "SELECT canonical_name FROM ecdysis_data.occurrences"
    ).fetchone()[0]
    assert val == normalize_scientific_name("Bombus vosnesenskii")
