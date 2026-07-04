"""Tests for api/users.py upsert_user (D-07/D-08/D-09; WRITE-02 identity foundation).

Fast-tier — a fresh tmp-path SQLite engine (via notes_store.db.make_engine)
with the ORM schema created via Base.metadata.create_all, mirroring
data/tests/test_notes_store_schema.py's pattern. No reliance on the operator
DB path or Alembic (the 0002 migration is covered separately by
data/tests/test_notes_users.py).
"""

import datetime

from sqlalchemy.exc import IntegrityError
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


def test_concurrent_first_login_race_resolves_to_winning_row(tmp_path, monkeypatch):
    """WR-03: two concurrent first logins for the same iNat login are not
    atomic (check-then-insert); the loser's INSERT hits the
    ix_users_inat_login unique index. It must catch the IntegrityError,
    re-select the winner's row, and return its id — not 500 the login.

    The race is simulated deterministically: the loser's first commit()
    is intercepted to (a) release its transaction, (b) commit the winner's
    competing row via a separate session, then (c) raise the IntegrityError
    the real INSERT would have hit."""
    engine = _make_engine(tmp_path)
    raced = {"done": False}

    class RacingSession(Session):
        def commit(self):
            if not raced["done"]:
                raced["done"] = True
                super().rollback()  # release the loser's pending INSERT/locks
                now = datetime.datetime.now(datetime.UTC)
                with Session(engine) as winner:
                    winner.add(
                        User(
                            inat_login="beeperson",
                            inat_user_id=42,
                            created_at=now,
                            updated_at=now,
                        )
                    )
                    winner.commit()
                raise IntegrityError(
                    "INSERT INTO users ...",
                    {},
                    Exception("UNIQUE constraint failed: users.inat_login"),
                )
            return super().commit()

    monkeypatch.setattr(users, "Session", RacingSession)

    internal_id = users.upsert_user(engine, inat_login="beeperson", inat_user_id=999)

    with Session(engine) as session:
        rows = session.query(User).all()
        assert len(rows) == 1  # the winner's row — no duplicate, no 500
        assert rows[0].id == internal_id
        assert rows[0].inat_user_id == 999  # loser's refresh still applied


def test_different_logins_create_separate_rows(tmp_path):
    engine = _make_engine(tmp_path)

    id_a = users.upsert_user(engine, inat_login="alice", inat_user_id=1)
    id_b = users.upsert_user(engine, inat_login="bob", inat_user_id=2)

    assert id_a != id_b
    with Session(engine) as session:
        assert session.query(User).count() == 2
