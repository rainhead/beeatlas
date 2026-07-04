"""Add body_html column + author_id integer FK to users.id (D-05/D-08).

Alters the already-populated ``notes`` table (Phase 179):
  - body_html: pre-sanitized HTML rendered by
    ``notes_store.render.render_note_markdown`` (D-04/D-06). Added nullable
    first, backfilled for any pre-existing rows, then tightened to NOT NULL
    (three-step batch pattern — SQLite/Alembic batch mode recreates the whole
    table via INSERT...SELECT, so a NOT NULL column with no default fails on
    that copy if added directly to a non-empty table).
  - author_id: recast from String to Integer and wired to a real
    ``users.id`` foreign key (D-08 — durable, server-derived authorship;
    a client-supplied author is never consulted).

This migration has no downgrade path — the authoritative store has no
upstream from which it can be rebuilt (Pitfall 4). downgrade() raises
NotImplementedError.

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-04
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add body_html (backfilled, NOT NULL) and recast author_id to an int FK."""
    # Step 1: add body_html as NULLABLE first — SQLite's batch ALTER recreates
    # the table via a temp-table copy; a NOT NULL column with no default
    # would fail on existing rows during that copy.
    with op.batch_alter_table("notes") as batch_op:
        batch_op.add_column(sa.Column("body_html", sa.Text, nullable=True))

    # Step 2: backfill existing rows through the ONE shared renderer. Import
    # inside upgrade() (not at module level) to avoid a migrations-dir ->
    # notes_store circular-import ordering issue at Alembic discovery time —
    # this store's existing migrations only import sqlalchemy/alembic.op at
    # module level.
    from notes_store.render import render_note_markdown

    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id, body FROM notes")).fetchall()
    for note_id, body_md in rows:
        html = render_note_markdown(body_md)
        conn.execute(
            sa.text("UPDATE notes SET body_html = :html WHERE id = :id"),
            {"html": html, "id": note_id},
        )

    # Step 3: now tighten body_html to NOT NULL (batch mode again — SQLite
    # can't ALTER COLUMN in place).
    with op.batch_alter_table("notes") as batch_op:
        batch_op.alter_column("body_html", existing_type=sa.Text, nullable=False)

    # author_id -> users.id FK: notes.author_id predates the users table
    # (0001) and is currently a String. Writes only opened 2026-07-04
    # (WRITE-04), so pre-existing rows are expected to be ~0 and this recast
    # is trivially safe, but the migration does not assume a specific row
    # count — SQLite's batch-mode ALTER will itself reject the table
    # recreation (IntegrityError) if any existing author_id value doesn't
    # resolve to a real users.id (Pitfall 3), surfacing loudly rather than
    # silently corrupting data.
    with op.batch_alter_table("notes") as batch_op:
        batch_op.alter_column(
            "author_id", existing_type=sa.String, type_=sa.Integer
        )
        batch_op.create_foreign_key(
            "fk_notes_author_id_users", "users", ["author_id"], ["id"]
        )


def downgrade() -> None:
    raise NotImplementedError(
        "forward-only migrations only — no downgrade path. "
        "The authoritative notes store has no upstream to rebuild from; "
        "a downgrade that drops tables is unrecoverable (Pitfall 4)."
    )
