"""SQLAlchemy 2.0 ORM models for BeeAtlas's authoritative notes store.

This is BeeAtlas's first authoritative (non-reproducible) store — data here has
no upstream from which it can be rebuilt. Schema evolves forward-only via Alembic;
no downgrade path exists (D-03). Schema shaped for moderation and attribution from
day one so Phase 180 is not a retrofit (D-05, D-08).

Tables:
  notes          — expert species natural-history notes; multiple per canonical_name (D-06)
  note_revisions — append-only audit ledger for edits and soft-deletes (D-05)
  users          — BeeAtlas-internal identity; internal id is the durable authorship
                   key, iNat login/numeric id are mutable properties (D-07/D-08)

D-07: No ``roles`` table — roles live in a committed allowlist TOML (plan 177-05).

Phase 179 (migration 0003) wires ``notes.author_id`` to the ``users.id`` FK
described above and adds ``notes.body_html`` (pre-sanitized HTML rendered by
``notes_store.render.render_note_markdown`` — D-04/D-05/D-08); ``body`` is
retained as the markdown source.
"""

import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Note(Base):
    """A single author-owned expert note for a bee species.

    Multiple Note rows may share the same ``canonical_name`` (D-06 — stacked list).
    There is NO unique constraint on ``canonical_name``; only an index for fast lookup.

    ``status`` values (D-08): 'approved' (default), 'pending', 'removed'.
    """

    __tablename__ = "notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    canonical_name: Mapped[str] = mapped_column(String, nullable=False, index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    body_html: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="approved")
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)

    revisions: Mapped[list["NoteRevision"]] = relationship(back_populates="note")


class NoteRevision(Base):
    """Append-only audit ledger entry for a note edit or soft-delete.

    ``action`` values: 'create', 'edit', 'remove', 'takedown', 'restore'.
    Rows are never deleted — this is the moderation audit trail.
    """

    __tablename__ = "note_revisions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    note_id: Mapped[int] = mapped_column(ForeignKey("notes.id"), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    editor_id: Mapped[str] = mapped_column(String, nullable=False)
    revised_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    action: Mapped[str] = mapped_column(String, nullable=False)  # 'create'/'edit'/'remove'/'takedown'/'restore'
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    note: Mapped["Note"] = relationship(back_populates="revisions")


class User(Base):
    """BeeAtlas-internal identity record.

    ``id`` is BeeAtlas's own durable authorship key (D-07) — ``notes.author_id``
    references it via an integer FK, wired in migration 0003 (Phase 179).
    The iNat login and iNat numeric id are stored as *mutable properties* of the
    user, not as the key: a renamed iNat login does not orphan prior authorship.

    ``inat_login`` is unique (D-09) — the committed allowlist authorizes by iNat
    login (human-readable, matches the existing ``collector_inat_login`` /
    ``host_inat_login`` convention) before the internal id exists at first login.
    ``inat_user_id`` (the iNat numeric id) is also captured for robustness.
    """

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    inat_user_id: Mapped[int] = mapped_column(Integer, nullable=False)
    inat_login: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
