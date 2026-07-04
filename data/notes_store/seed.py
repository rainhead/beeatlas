"""Seed the notes store with sample notes for testing and local dev.

This is the D-04 seedable-store script. It inserts sample Note rows via a
SQLAlchemy Session so the store can be populated without any write UI.
No write endpoint is opened in Phase 177 — that is Phase 178.

Usage:
    uv run python -m notes_store.seed
    uv run python -m notes_store.seed              # uses NOTES_DB_PATH env var
    uv run python -m notes_store.seed /path/to.db  # explicit path (not yet wired to CLI args)

The script assumes the schema already exists (created by Alembic migrations or
``Base.metadata.create_all``). It does NOT run migrations.

Phase 179 (D-08): ``notes.author_id`` is now an integer FK -> ``users.id``, not
a free-text login. This script get-or-creates a ``User`` row per sample
author's iNat login (matching the ``roles_allowlist.toml`` example entries)
and uses its assigned id. It also renders ``body_html`` once via the shared
``notes_store.render.render_note_markdown`` (D-04/D-06) — the same helper the
write API and harvest use.
"""

import datetime
import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

from notes_store.db import NOTES_DB_PATH, make_engine
from notes_store.models import Note, User
from notes_store.render import render_note_markdown


_SAMPLE_NOTES = [
    dict(
        canonical_name="apis mellifera",
        author_login="example_author",
        body=(
            "*Apis mellifera* (Western honey bee) — introduced species "
            "widespread across Washington. Managed colonies vastly outnumber "
            "wild colonies; feral populations exist but are sparse. "
            "Important pollinator, though interaction with native bees complex."
        ),
        status="approved",
    ),
    dict(
        canonical_name="bombus vosnesenskii",
        author_login="example_author",
        body=(
            "*Bombus vosnesenskii* (Yellow-faced bumble bee) — one of the most "
            "common bumble bees in western WA. Bright yellow face; queens emerge "
            "early spring. Declining in some Oregon populations; WA numbers "
            "appear stable as of recent surveys."
        ),
        status="approved",
    ),
    dict(
        canonical_name="osmia lignaria",
        author_login="example_curator",
        body=(
            "*Osmia lignaria* (Blue orchard bee) — solitary cavity-nesting mason "
            "bee; excellent early-season pollinator for stone fruits and apples. "
            "Female provisions each cell with a pollen-nectar ball before sealing "
            "with mud. Widely used in managed orchard programs."
        ),
        status="approved",
    ),
]


def _get_or_create_user(session: Session, login: str, now: datetime.datetime) -> User:
    """Return the User row for *login*, creating it (with a placeholder
    inat_user_id) if it doesn't exist yet. Seed-script-only convenience —
    the real write API derives users from actual OAuth logins."""
    user = session.scalar(select(User).where(User.inat_login == login))
    if user is not None:
        return user
    user = User(
        inat_user_id=abs(hash(login)) % 1_000_000,
        inat_login=login,
        created_at=now,
        updated_at=now,
    )
    session.add(user)
    session.flush()  # assign user.id without committing
    return user


def seed(db_path: "str | None" = None) -> None:
    """Insert sample Note rows into the notes store.

    Args:
        db_path: Path to the SQLite file. Defaults to ``NOTES_DB_PATH`` env var.

    The schema must already exist. Existing rows are not checked — repeated
    calls will add duplicate rows (acceptable for a development seed tool).
    """
    now = datetime.datetime.now(datetime.timezone.utc)
    engine = make_engine(db_path)

    with Session(engine) as session:
        for data in _SAMPLE_NOTES:
            author = _get_or_create_user(session, data["author_login"], now)
            session.add(Note(
                canonical_name=data["canonical_name"],
                author_id=author.id,
                body=data["body"],
                body_html=render_note_markdown(data["body"]),
                status=data["status"],
                created_at=now,
                updated_at=now,
            ))
        session.commit()

    resolved_path = db_path or str(NOTES_DB_PATH)
    print(f"=== seeded notes store at {resolved_path} ({len(_SAMPLE_NOTES)} notes) ===")


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else None
    seed(path)
