"""Tests for api/users.py upsert_user (D-07/D-08/D-09; WRITE-02 identity foundation).

Fast-tier — a fresh tmp-path SQLite engine (via notes_store.db.make_engine)
with the ORM schema created via Base.metadata.create_all, mirroring
data/tests/test_notes_store_schema.py's pattern. No reliance on the operator
DB path or Alembic (the 0002 migration is covered separately by
data/tests/test_notes_users.py).
"""

from sqlalchemy.orm import Session

from notes_store.db import make_engine
from notes_store.models import Base, User

import api.users as users


def _make_engine(tmp_path):
    engine = make_engine(tmp_path / "notes.db")
    Base.metadata.create_all(engine)
    return engine


def test_first_upsert_mints_row_and_returns_int_id(tmp_path):
    engine = _make_engine(tmp_path)

    internal_id = users.upsert_user(engine, inat_login="beeperson", inat_user_id=42)

    assert isinstance(internal_id, int)
    with Session(engine) as session:
        rows = session.query(User).all()
        assert len(rows) == 1
        assert rows[0].id == internal_id
        assert rows[0].inat_login == "beeperson"
        assert rows[0].inat_user_id == 42
        assert rows[0].created_at is not None
        assert rows[0].updated_at is not None


def test_repeat_upsert_same_login_returns_same_id_no_duplicate(tmp_path):
    engine = _make_engine(tmp_path)

    first_id = users.upsert_user(engine, inat_login="beeperson", inat_user_id=42)
    second_id = users.upsert_user(engine, inat_login="beeperson", inat_user_id=42)

    assert first_id == second_id
    with Session(engine) as session:
        rows = session.query(User).all()
        assert len(rows) == 1


def test_repeat_upsert_refreshes_inat_user_id_when_changed(tmp_path):
    engine = _make_engine(tmp_path)

    first_id = users.upsert_user(engine, inat_login="beeperson", inat_user_id=42)
    second_id = users.upsert_user(engine, inat_login="beeperson", inat_user_id=999)

    assert first_id == second_id
    with Session(engine) as session:
        rows = session.query(User).all()
        assert len(rows) == 1
        assert rows[0].inat_user_id == 999


def test_different_logins_create_separate_rows(tmp_path):
    engine = _make_engine(tmp_path)

    id_a = users.upsert_user(engine, inat_login="alice", inat_user_id=1)
    id_b = users.upsert_user(engine, inat_login="bob", inat_user_id=2)

    assert id_a != id_b
    with Session(engine) as session:
        assert session.query(User).count() == 2
