#!/usr/bin/env python3
"""
Audit content/species-photos.toml for orphaned keys vs public/data/species.json.

For each orphan (TOML key not in species.json knownNames), proposes:
  - 'rekey' if exactly one scientificName in species.json matches case-insensitively
  - 'remove' otherwise

Writes .planning/phases/92-slug-migration-pipeline-prep/92-03-toml-audit.json.

Usage:
    uv run python data/scripts/audit_photo_toml.py
    (from repo root)
"""

import json
import tomllib
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent.parent
TOML_PATH = REPO_ROOT / "content" / "species-photos.toml"
SPECIES_JSON_PATH = REPO_ROOT / "public" / "data" / "species.json"
AUDIT_PATH = REPO_ROOT / ".planning" / "phases" / "92-slug-migration-pipeline-prep" / "92-03-toml-audit.json"


def main():
    # Load TOML
    with open(TOML_PATH, "rb") as f:
        manifest = tomllib.load(f)

    # Load species.json and build known set
    with open(SPECIES_JSON_PATH) as f:
        species = json.load(f)
    known = {s["scientificName"] for s in species}

    # Build lookup: lowercase -> list of matching scientificName values
    lower_to_known = {}
    for name in known:
        key = name.lower()
        lower_to_known.setdefault(key, []).append(name)

    # Enumerate all TOML keys and find orphans
    toml_species = manifest.get("species", {})
    total_toml_keys = len(toml_species)

    dispositions = []
    for toml_key, entry in toml_species.items():
        if toml_key in known:
            # Not an orphan — skip
            continue

        # This is an orphan — propose disposition
        photos = entry.get("photos", [])
        photo_count = len(photos)

        # Try case-insensitive match
        candidates = lower_to_known.get(toml_key.lower(), [])

        if len(candidates) == 1:
            # Exactly one match: propose rekey
            target = candidates[0]
            dispositions.append({
                "original_key": toml_key,
                "proposed_action": "rekey",
                "target_key": target,
                "rationale": f"Case-insensitive match: '{toml_key}' -> '{target}'",
                "photo_count": photo_count,
            })
        elif len(candidates) > 1:
            # Ambiguous: propose remove with note
            dispositions.append({
                "original_key": toml_key,
                "proposed_action": "remove",
                "target_key": None,
                "rationale": f"Ambiguous match: {candidates}; no matching scientificName under any capitalization can be determined uniquely",
                "photo_count": photo_count,
            })
        else:
            # No match at all
            dispositions.append({
                "original_key": toml_key,
                "proposed_action": "remove",
                "target_key": None,
                "rationale": "no matching scientificName under any capitalization or spacing",
                "photo_count": photo_count,
            })

    total_orphans = len(dispositions)

    audit = {
        "total_toml_keys": total_toml_keys,
        "total_orphans": total_orphans,
        "dispositions": sorted(dispositions, key=lambda d: d["original_key"]),
    }

    AUDIT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(AUDIT_PATH, "w") as f:
        json.dump(audit, f, sort_keys=True, indent=2)
        f.write("\n")

    print(f"Wrote {AUDIT_PATH}")
    print(f"Total TOML keys: {total_toml_keys}")
    print(f"Total orphans:   {total_orphans}")
    rekey_count = sum(1 for d in dispositions if d["proposed_action"] == "rekey")
    remove_count = sum(1 for d in dispositions if d["proposed_action"] == "remove")
    print(f"  Proposed rekey:  {rekey_count}")
    print(f"  Proposed remove: {remove_count}")

    # Spot-check: list remove proposals with photo_count > 0
    removes_with_photos = [d for d in dispositions if d["proposed_action"] == "remove" and d["photo_count"] > 0]
    if removes_with_photos:
        print(f"\nWARNING: {len(removes_with_photos)} remove proposals have photos > 0:")
        for d in removes_with_photos:
            print(f"  {d['original_key']!r}: {d['photo_count']} photo(s) — {d['rationale']}")


if __name__ == "__main__":
    main()
