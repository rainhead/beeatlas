"""SQLAlchemy 2.0 ORM models for BeeAtlas's authoritative notes store.

This is BeeAtlas's first authoritative (non-reproducible) store — data here has
no upstream from which it can be rebuilt. Schema evolves forward-only via Alembic;
no downgrade path exists (D-03). Schema shaped for moderation and attribution from
day one so Phase 180 is not a retrofit (D-05, D-08).

Tables:
  notes          — expert species natural-history notes; multiple per canonical_name (D-06)
  note_revisions — append-only audit ledger for edits and soft-deletes (D-05)

D-07: No ``roles`` table — roles live in a committed allowlist TOML (plan 177-05).
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
    author_id: Mapped[str] = mapped_column(String, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="approved")
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)

    revisions: Mapped[list["NoteRevision"]] = relationship(back_populates="note")


class NoteRevision(Base):
    """Append-only audit ledger entry for a note edit or soft-delete.

    ``action`` values: 'create', 'edit', 'remove'.
    Rows are never deleted — this is the moderation audit trail.
    """

    __tablename__ = "note_revisions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    note_id: Mapped[int] = mapped_column(ForeignKey("notes.id"), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    editor_id: Mapped[str] = mapped_column(String, nullable=False)
    revised_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    action: Mapped[str] = mapped_column(String, nullable=False)  # 'create'/'edit'/'remove'

    note: Mapped["Note"] = relationship(back_populates="revisions")
