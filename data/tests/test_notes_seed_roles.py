"""Tests for notes_store roles loader (Task 1) and seed script (Task 2).

Roles tests use the committed example entries from data/roles_allowlist.toml
(``example_author`` / ``example_curator``). These two logins exist solely to
keep tests decoupled from real operator identities — do not remove them from
the allowlist.

Seed tests create the schema on a tmp SQLite file, run seed(), and assert
the expected row count.
"""

import datetime

import pytest

# ---------------------------------------------------------------------------
# Roles loader tests (Task 1)
# ---------------------------------------------------------------------------


def test_roles_module_loads():
    """ROLES is a dict (tomllib load succeeded at import time)."""
    from notes_store import roles

    assert isinstance(roles.ROLES, dict)


def test_curator_is_curator():
    """example_curator has curator role."""
    from notes_store import roles

    assert roles.is_curator("example_curator") is True


def test_curator_is_also_author():
    """Curators imply author privileges."""
    from notes_store import roles

    assert roles.is_author("example_curator") is True


def test_author_is_author():
    """example_author has author role."""
    from notes_store import roles

    assert roles.is_author("example_author") is True


def test_author_is_not_curator():
    """An author is NOT a curator."""
    from notes_store import roles

    assert roles.is_curator("example_author") is False


def test_reader_is_not_author():
    """Unknown login (reader) is not an author."""
    from notes_store import roles

    assert roles.is_author("random_inat_login_xyz") is False


def test_reader_is_not_curator():
    """Unknown login (reader) is not a curator."""
    from notes_store import roles

    assert roles.is_curator("random_inat_login_xyz") is False


def test_role_of_unknown_is_none():
    """role_of() returns None for readers (not in the allowlist)."""
    from notes_store import roles

    assert roles.role_of("random_inat_login_xyz") is None


def test_role_of_curator():
    """role_of() returns 'curator' for example_curator."""
    from notes_store import roles

    assert roles.role_of("example_curator") == "curator"


# ---------------------------------------------------------------------------
# Seed script tests (Task 2)
# ---------------------------------------------------------------------------


def test_seed(tmp_path):
    """seed() inserts >= 2 note rows into a fresh schema."""
    from notes_store.db import make_engine
    from notes_store.models import Base
    from notes_store.seed import seed

    db_path = str(tmp_path / "notes_test.db")
    engine = make_engine(db_path)
    Base.metadata.create_all(engine)

    seed(db_path)

    import sqlite3

    con = sqlite3.connect(db_path)
    (count,) = con.execute("SELECT count(*) FROM notes").fetchone()
    con.close()

    assert count >= 2, f"Expected >= 2 seed rows, got {count}"


def test_seed_rows_have_required_fields(tmp_path):
    """Seeded rows carry canonical_name, author_id, body, status, and timestamps."""
    from notes_store.db import make_engine
    from notes_store.models import Base, Note
    from notes_store.seed import seed
    from sqlalchemy.orm import Session

    db_path = str(tmp_path / "notes_test2.db")
    engine = make_engine(db_path)
    Base.metadata.create_all(engine)
    seed(db_path)

    with Session(engine) as session:
        notes = session.query(Note).all()

    assert len(notes) >= 2
    for note in notes:
        assert note.canonical_name, "canonical_name must be non-empty"
        assert note.author_id, "author_id must be non-empty"
        assert note.body, "body must be non-empty"
        assert note.status in ("approved", "pending"), f"unexpected status: {note.status}"
        assert isinstance(note.created_at, datetime.datetime)
        assert isinstance(note.updated_at, datetime.datetime)
