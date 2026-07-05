"""Add nullable reason column to note_revisions (D-09).

A curator's takedown/restore accepts an optional free-text reason
(empty allowed) — stored directly on the note_revisions row alongside the
existing action/editor_id/revised_at columns (D-08/D-10). No backfill is
needed: existing rows simply get reason=NULL, which is a valid, permanent
state (not a transitional one, unlike 0003's body_html).

This migration has no downgrade path — the authoritative notes store has no
upstream from which it can be rebuilt (Pitfall 4/T-177-01 guard).
downgrade() raises NotImplementedError.

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-05
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add reason as a nullable Text column — no backfill, no NOT NULL tightening."""
    with op.batch_alter_table("note_revisions") as batch_op:
        batch_op.add_column(sa.Column("reason", sa.Text, nullable=True))


def downgrade() -> None:
    raise NotImplementedError(
        "forward-only migrations only — no downgrade path. "
        "The authoritative notes store has no upstream to rebuild from; "
        "a downgrade that drops a column is unrecoverable (Pitfall 4)."
    )
