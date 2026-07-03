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
"""

import datetime
import sys

from sqlalchemy.orm import Session

from notes_store.db import NOTES_DB_PATH, make_engine
from notes_store.models import Note


_SAMPLE_NOTES = [
    dict(
        canonical_name="apis mellifera",
        author_id="example_author",
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
        author_id="example_author",
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
        author_id="example_curator",
        body=(
            "*Osmia lignaria* (Blue orchard bee) — solitary cavity-nesting mason "
            "bee; excellent early-season pollinator for stone fruits and apples. "
            "Female provisions each cell with a pollen-nectar ball before sealing "
            "with mud. Widely used in managed orchard programs."
        ),
        status="approved",
    ),
]


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
            session.add(Note(
                canonical_name=data["canonical_name"],
                author_id=data["author_id"],
                body=data["body"],
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
