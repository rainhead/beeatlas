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


def _rebuild_keys_from_env() -> list[str] | None:
    """Stelis targeted-rebuild hint (st-pd1): STELIS_REBUILD_KEYS is a newline-
    separated list of canonical_names to re-harvest (a CRUD touched only those).
    The contract keys on PRESENCE, not truthiness: unset -> None (a full harvest);
    SET (even to "") -> a partial harvest of exactly those keys (possibly none, e.g.
    a pure retraction, where Stelis prunes and this writes nothing). Newline-
    separated because a canonical_name contains spaces."""
    if "STELIS_REBUILD_KEYS" not in os.environ:
        return None
    return [k for k in os.environ["STELIS_REBUILD_KEYS"].split("\n") if k]


def export_notes(
    engine=None,
    assets_dir: Path | None = None,
    rebuild_keys: list[str] | None = None,
) -> None:
    """Harvest approved notes into ASSETS_DIR/notes/<canonical_name>.json — one file
    per species with >=1 approved note (the per-species keyed unit, ADR 0013).

    Args:
        engine: an existing SQLAlchemy engine (tests pass a tmp-sqlite engine);
            defaults to `notes_store.db.make_engine()` (NOTES_DB_PATH from env).
        assets_dir: override for ASSETS_DIR (tests use a tmp_path); defaults to
            the module-level ASSETS_DIR (EXPORT_DIR env, default public/data/).
        rebuild_keys: a PARTIAL harvest (Stelis st-pd1) — re-query and rewrite only
            these canonical_names' files, leaving every other species' file
            untouched. None -> a full harvest of every species.

    D-10: only status='approved' notes are included, newest-first
    (created_at desc). D-13: each Note is {id, html, byline: {display_name, login,
    collector_url|null}, created, updated}. Species with zero approved notes have
    no file. The monolithic notes.json _data/notes.js reads is assembled from this
    dir by assemble_notes.py; retraction of a species that lost its last approved
    note is the caller's (Stelis prunes notes/<name>.json).
    """
    if engine is None:
        engine = make_engine()
    if assets_dir is None:
        assets_dir = ASSETS_DIR

    notes_dir = assets_dir / "notes"
    notes_dir.mkdir(parents=True, exist_ok=True)
    # A FULL harvest (no rebuild_keys) is the complete keyset — clear stale files
    # first so a species that lost its last approved note simply disappears, exactly
    # as the old monolithic notes.json did. A PARTIAL harvest merges in place (Stelis
    # prunes retracted species between harvest and assemble), so it must NOT clear.
    if rebuild_keys is None:
        for stale in notes_dir.glob("*.json"):
            stale.unlink()
    collector_index = _load_collector_index(assets_dir)

    notes_by_species: dict[str, list[dict]] = {}
    with Session(engine) as db_session:
        query = (
            db_session.query(Note, User)
            .join(User, Note.author_id == User.id)
            .filter(Note.status == "approved")
        )
        if rebuild_keys is not None:
            query = query.filter(Note.canonical_name.in_(rebuild_keys))
        for note, user in query.order_by(Note.created_at.desc()).all():
            record = {
                "id": note.id,
                "html": note.body_html,
                "byline": _byline(user.inat_login, collector_index),
                "created": note.created_at.isoformat(),
                "updated": note.updated_at.isoformat(),
            }
            notes_by_species.setdefault(note.canonical_name, []).append(record)

    for canonical_name, notes in notes_by_species.items():
        (notes_dir / f"{canonical_name}.json").write_text(
            json.dumps(notes, sort_keys=True, indent=2), encoding="utf-8"
        )

    scope = f"{len(rebuild_keys)} key(s)" if rebuild_keys is not None else "all species"
    print(  # noqa: T201
        f"  notes/: {len(notes_by_species):,} species file(s) written ({scope})"
    )


def main() -> None:
    """Harvest the per-species notes dir from the authoritative store (read-only, WAL)."""
    print("Connecting to notes store (read-only, WAL)...")  # noqa: T201
    engine = make_engine()
    print("Harvesting notes/:")  # noqa: T201
    export_notes(engine=engine, rebuild_keys=_rebuild_keys_from_env())
    print("Done.")  # noqa: T201


def export_notes_step() -> None:
    """Zero-argument wrapper for inclusion in run.py STEPS list."""
    main()


if __name__ == "__main__":
    main()
