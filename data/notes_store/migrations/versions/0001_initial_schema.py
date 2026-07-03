"""Initial schema: notes + note_revisions tables.

Creates the authoritative notes store schema:
  - notes: expert species natural-history notes, multiple per canonical_name (D-06)
  - note_revisions: append-only audit ledger for edits and soft-deletes (D-05)

This migration has no downgrade path — the authoritative store has no upstream
from which it can be rebuilt (Pitfall 4). downgrade() raises NotImplementedError.

Revision ID: 0001
Revises: None (initial migration)
Create Date: 2026-07-03
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create notes and note_revisions tables matching notes_store/models.py."""
    # notes — expert species natural-history notes
    # Multiple rows per canonical_name (D-06); NOT unique — only indexed for lookup.
    # status values (D-08): 'approved' (default), 'pending', 'removed'
    op.create_table(
        "notes",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("canonical_name", sa.String, nullable=False),
        sa.Column("author_id", sa.String, nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("status", sa.String, nullable=False, server_default="approved"),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )
    # Index on canonical_name for fast species-keyed lookups (NOT unique — D-06)
    op.create_index("ix_notes_canonical_name", "notes", ["canonical_name"])

    # note_revisions — append-only audit ledger; rows are NEVER deleted
    # action values: 'create', 'edit', 'remove'
    op.create_table(
        "note_revisions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "note_id",
            sa.Integer,
            sa.ForeignKey("notes.id"),
            nullable=False,
        ),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("editor_id", sa.String, nullable=False),
        sa.Column("revised_at", sa.DateTime, nullable=False),
        sa.Column("action", sa.String, nullable=False),  # 'create'/'edit'/'remove'
    )


def downgrade() -> None:
    raise NotImplementedError(
        "forward-only migrations only — no downgrade path. "
        "The authoritative notes store has no upstream to rebuild from; "
        "a downgrade that drops tables is unrecoverable (Pitfall 4)."
    )
