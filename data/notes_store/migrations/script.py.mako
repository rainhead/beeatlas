"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}

NOTE: This is a forward-only migration — downgrade() raises NotImplementedError.
The authoritative notes store has no upstream from which it can be rebuilt; a
downgrade that drops tables is unrecoverable (Pitfall 4). Do NOT implement a
real downgrade body.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

# revision identifiers, used by Alembic.
revision: str = ${repr(up_revision)}
down_revision: Union[str, None] = ${repr(down_revision)}
branch_labels: Union[str, Sequence[str], None] = ${repr(branch_labels)}
depends_on: Union[str, Sequence[str], None] = ${repr(depends_on)}


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    raise NotImplementedError(
        "forward-only migrations only — no downgrade path. "
        "The authoritative notes store has no upstream to rebuild from; "
        "a downgrade that drops tables is unrecoverable (Pitfall 4)."
    )
