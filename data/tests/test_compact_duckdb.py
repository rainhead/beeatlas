"""compact_duckdb: a rewrite that shrinks the file and changes nothing logical."""

import duckdb
import pytest

from compact_duckdb import compact


def _make_db(path):
    """A database with a view naming its own catalog, a constraint, and a large
    table dropped so its blocks sit on the free list."""
    with duckdb.connect(str(path)) as con:
        con.execute("CREATE SCHEMA s")
        con.execute("CREATE TABLE s.kept (id INTEGER PRIMARY KEY, name VARCHAR NOT NULL)")
        con.execute("INSERT INTO s.kept SELECT i, 'row ' || i FROM range(1000) t(i)")
        con.execute("CREATE VIEW s.kept_view AS SELECT name FROM beeatlas.s.kept WHERE id < 10")
        con.execute("CREATE TABLE s.bulk AS SELECT i, md5(i::VARCHAR) || md5((i + 1)::VARCHAR) AS pad FROM range(500000) t(i)")
        con.execute("CHECKPOINT")
        con.execute("DROP TABLE s.bulk")
        con.execute("CHECKPOINT")


def test_compacts_and_preserves_contents(tmp_path):
    db = tmp_path / "beeatlas.duckdb"
    _make_db(db)

    r = compact(db)

    assert r.compacted
    assert r.bytes_after < r.bytes_before / 2
    assert db.stat().st_size == r.bytes_after
    assert not (tmp_path / "beeatlas.duckdb.compact").exists()
    with duckdb.connect(str(db)) as con:
        assert con.execute("SELECT count(*) FROM s.kept").fetchone()[0] == 1000
        assert con.execute("SELECT count(*) FROM s.kept_view").fetchone()[0] == 10
        assert con.execute(
            "SELECT count(*) FROM duckdb_constraints() WHERE constraint_type = 'PRIMARY KEY'"
        ).fetchone()[0] == 1
        with pytest.raises(duckdb.ConstraintException):
            con.execute("INSERT INTO s.kept VALUES (1, 'dup')")


def test_leaves_file_alone_below_threshold(tmp_path):
    db = tmp_path / "beeatlas.duckdb"
    _make_db(db)
    compact(db)
    size = db.stat().st_size

    r = compact(db)

    assert not r.compacted
    assert db.stat().st_size == size


def test_failed_copy_leaves_original(tmp_path, monkeypatch):
    db = tmp_path / "beeatlas.duckdb"
    _make_db(db)
    before = db.read_bytes()

    import compact_duckdb
    # The copy reports a different count from the original for every table.
    monkeypatch.setattr(compact_duckdb, "_row_counts",
                        lambda con, catalog, tables: {t: int(catalog == "compacted") for t in tables})

    with pytest.raises(RuntimeError, match="row counts differ"):
        compact(db, min_free=0)

    assert db.read_bytes() == before
    assert not (tmp_path / "beeatlas.duckdb.compact").exists()
