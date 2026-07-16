"""Assemble ASSETS_DIR/notes.json from the per-species notes/ dir.

notes_harvest.py writes one file per species (notes/<canonical_name>.json — the
keyed unit a Stelis targeted rebuild touches). This step rolls the whole dir back
up into the monolithic `Record<canonical_name, Note[]>` that _data/notes.js reads
at Eleventy build time (D-13), so the site's notes consumer is UNCHANGED by the
per-species split. Full + cheap (a read + concat, no DB), it runs AFTER
notes-harvest — and after Stelis prunes any retracted species' file — so notes.json
reflects exactly the dir.

`notes.json` is derived (reproducible from the notes/ dir) and is NEVER committed
to git; it ships via S3 + manifest.json (memory feedback_no_committed_data_artifacts).

Usage:
    cd data && uv run python assemble_notes.py
"""

import json
import os
from pathlib import Path

_default_assets = str(Path(__file__).parent.parent / "public" / "data")
ASSETS_DIR = Path(os.environ.get("EXPORT_DIR", _default_assets))


def assemble_notes(assets_dir: Path | None = None) -> None:
    """Roll notes/<canonical_name>.json files up into assets_dir/notes.json.

    An absent notes/ dir yields an empty Record ({}), mirroring the empty-store
    behaviour of the previous single-file harvest.
    """
    if assets_dir is None:
        assets_dir = ASSETS_DIR
    assets_dir.mkdir(parents=True, exist_ok=True)

    notes_dir = assets_dir / "notes"
    record: dict[str, list[dict]] = {}
    if notes_dir.exists():
        for path in sorted(notes_dir.glob("*.json")):
            record[path.stem] = json.loads(path.read_text(encoding="utf-8"))

    out_path = assets_dir / "notes.json"
    out_path.write_text(
        json.dumps(record, sort_keys=True, indent=2), encoding="utf-8"
    )
    print(  # noqa: T201
        f"  notes.json: {len(record):,} species with notes, "
        f"{out_path.stat().st_size:,} bytes"
    )


def main() -> None:
    """Zero-argument entry point; run.py imports this as its notes-assemble step."""
    print("Assembling notes.json from notes/:")  # noqa: T201
    assemble_notes()
    print("Done.")  # noqa: T201


if __name__ == "__main__":
    main()
