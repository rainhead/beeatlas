"""Build-time notes.json harvest — the notes-store analog of species_export.py.

Reads the authoritative notes store (SQLite, WAL — Phase 177) READ-ONLY via
`notes_store.db.make_engine` (D-16, RESEARCH.md Pitfall 5 — never a raw,
hand-rolled sqlite connection) and emits ASSETS_DIR/notes.json: a
`Record<canonical_name, Note[]>` of `status='approved'` notes only (D-10),
ordered newest-first (`created_at` desc).

Byline resolution (D-11/D-12) reuses the ALREADY-WRITTEN `collectors.json`
(produced earlier in the same run.py invocation, since collectors-export and
collectors-events-export both run before this "notes-harvest" step) rather
than re-deriving `display_name` a second time from raw parquet — this
eliminates an entire class of future drift (feedback
`feedback_reuse_display_name_resolution`). A login absent from collectors.json
(e.g. an allowlisted author who has never submitted a WABA sample/specimen)
falls back to plain-text "@login" with `collector_url: None`.

In run.py STEPS this is called as ("notes-harvest", export_notes_step),
inserted immediately AFTER ("collectors-events-export", ...) per D-12.

`notes.json` is declared `authoritative` in data/artifacts.toml (never a dbt
model, no baseline_diff, forward-only) and is NEVER committed to git — it
ships via S3 + manifest.json + deploy.yml's build-time fetch (memory
feedback_no_committed_data_artifacts).

Usage:
    cd data && uv run python notes_harvest.py
"""

import json
import os
from pathlib import Path

from sqlalchemy.orm import Session

from notes_store.db import make_engine
from notes_store.models import Note, User

_default_assets = str(Path(__file__).parent.parent / "public" / "data")
ASSETS_DIR = Path(os.environ.get("EXPORT_DIR", _default_assets))


def _load_collector_index(assets_dir: Path) -> dict[str, dict]:
    """Return {login: {"display_name": ..., "collector_url": "/collectors/<login>/"}}.

    Reads assets_dir/collectors.json, produced earlier in the same run.py
    invocation by collectors_export.py. Absent file (e.g. a from-scratch local
    run that hasn't executed collectors-export yet) returns {} so the harvest
    degrades to the @login fallback for every author rather than raising.
    """
    collectors_path = assets_dir / "collectors.json"
    if not collectors_path.exists():
        return {}
    records = json.loads(collectors_path.read_text(encoding="utf-8"))
    return {
        r["login"]: {
            "display_name": r["display_name"],
            "collector_url": f"/collectors/{r['login']}/",
        }
        for r in records
    }


def _byline(login: str, collector_index: dict[str, dict]) -> dict:
    """D-11/D-12: resolve a login to its byline, falling back to plain-text @login."""
    entry = collector_index.get(login)
    if entry is None:
        return {"display_name": f"@{login}", "login": login, "collector_url": None}
    return {
        "display_name": entry["display_name"],
        "login": login,
        "collector_url": entry["collector_url"],
    }


def export_notes(engine=None, assets_dir: Path | None = None) -> None:
    """Harvest approved notes from the store into ASSETS_DIR/notes.json.

    Args:
        engine: an existing SQLAlchemy engine (tests pass a tmp-sqlite engine);
            defaults to `notes_store.db.make_engine()` (NOTES_DB_PATH from env).
        assets_dir: override for ASSETS_DIR (tests use a tmp_path); defaults to
            the module-level ASSETS_DIR (EXPORT_DIR env, default public/data/).

    D-10: only status='approved' notes are included, newest-first
    (created_at desc). D-13: emits Record<canonical_name, Note[]> where each
    Note is {id, html, byline: {display_name, login, collector_url|null},
    created, updated}. Species with zero approved notes do not appear as keys.
    """
    if engine is None:
        engine = make_engine()
    if assets_dir is None:
        assets_dir = ASSETS_DIR

    assets_dir.mkdir(parents=True, exist_ok=True)
    collector_index = _load_collector_index(assets_dir)

    notes_by_species: dict[str, list[dict]] = {}
    with Session(engine) as db_session:
        rows = (
            db_session.query(Note, User)
            .join(User, Note.author_id == User.id)
            .filter(Note.status == "approved")
            .order_by(Note.created_at.desc())
            .all()
        )
        for note, user in rows:
            record = {
                "id": note.id,
                "html": note.body_html,
                "byline": _byline(user.inat_login, collector_index),
                "created": note.created_at.isoformat(),
                "updated": note.updated_at.isoformat(),
            }
            notes_by_species.setdefault(note.canonical_name, []).append(record)

    out_path = assets_dir / "notes.json"
    out_path.write_text(
        json.dumps(notes_by_species, sort_keys=True, indent=2),
        encoding="utf-8",
    )
    print(  # noqa: T201
        f"  notes.json: {len(notes_by_species):,} species with notes, "
        f"{out_path.stat().st_size:,} bytes"
    )


def main() -> None:
    """Build notes.json from the authoritative notes store (read-only, WAL)."""
    print("Connecting to notes store (read-only, WAL)...")  # noqa: T201
    engine = make_engine()
    print("Exporting notes.json:")  # noqa: T201
    export_notes(engine=engine)
    print("Done.")  # noqa: T201


def export_notes_step() -> None:
    """Zero-argument wrapper for inclusion in run.py STEPS list."""
    main()


if __name__ == "__main__":
    main()
