"""Add users table: BeeAtlas-internal identity (D-07/D-08).

Creates the users table:
  - users: BeeAtlas mints its own internal integer id as the durable authorship
    key; iNat login and iNat numeric id are stored as mutable properties of the
    user, not the key (D-07). ``inat_login`` is unique (D-09 — the committed
    allowlist authorizes by iNat login).

This migration has no downgrade path — the authoritative store has no upstream
from which it can be rebuilt (Pitfall 4). downgrade() raises NotImplementedError.

Does NOT touch the notes or note_revisions tables/DDL.

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-04
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create the users table matching notes_store/models.py."""
    # users — BeeAtlas-internal identity (D-07/D-08)
    # internal id is the durable authorship key; iNat login/numeric id are
    # mutable properties. inat_login is unique (D-09 — allowlist keys on login).
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("inat_user_id", sa.Integer, nullable=False),
        sa.Column("inat_login", sa.String, nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )
    op.create_index(
        "ix_users_inat_login", "users", ["inat_login"], unique=True
    )


def downgrade() -> None:
    raise NotImplementedError(
        "forward-only migrations only — no downgrade path. "
        "The authoritative notes store has no upstream to rebuild from; "
        "a downgrade that drops tables is unrecoverable (Pitfall 4)."
    )
