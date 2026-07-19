"""Artifact contract loader, validator, and CLI for BeeAtlas data pipeline.

Stdlib-only — must run under bare system python3 (no uv/venv).

Usage (CLI verbs):
  python3 data/artifacts.py validate
  python3 data/artifacts.py pull-plan <manifest.json>
  python3 data/artifacts.py baseline-files

(The publish-plan / manifest / build-time-fetch verbs and render_manifest
died with st-vjd: the S3 publish leg is gone and the site build's
postbuild-data.mjs owns the slim manifest.)

Public module API:
  load(path=None) -> dict          ORDER-PRESERVING {name: fields}
  validate(spec)                   raises ValueError on any violation
  hashed_artifacts(spec) -> dict
  metadata_artifacts(spec) -> dict
  baseline_diff_artifacts(spec) -> dict
  authoritative_names(spec) -> list
  derived_names(spec) -> list

CLAUDE.md invariant: this module MUST NOT perform any network/subprocess
I/O. All aws calls stay in nightly.sh.
"""

import tomllib
import json
import sys
import argparse
from pathlib import Path

_DEFAULT_PATH = Path(__file__).parent / "artifacts.toml"

# Field defaults applied by load() to every artifact entry.
# source_file, hash_basename, metadata_type are intentionally absent:
# they are kind-specific required fields, not optional defaults.
_FIELD_DEFAULTS = {
    "gzip": False,
    "baseline_diff": False,
    "build_time_fetch": False,
    "build_time_fetch_optional": False,
    "content_type": None,
}

_VALID_KINDS = {"hashed", "metadata"}
_VALID_PROVENANCES = {"derived", "authoritative"}
_VALID_METADATA_TYPES = {"json", "string"}


# ---------------------------------------------------------------------------
# Core: load and validate
# ---------------------------------------------------------------------------

def load(path=None) -> dict:
    """Parse artifacts.toml, apply field defaults, return ORDER-PRESERVING dict.

    Does NOT validate — callers that need a guaranteed-valid spec should call
    validate(spec) separately (this allows tests to load intentionally invalid
    tomls without a hard failure in load()).
    """
    if path is None:
        path = _DEFAULT_PATH
    with open(path, "rb") as fh:
        raw = tomllib.load(fh)
    spec = {}
    for name, fields in raw.get("artifacts", {}).items():
        entry = dict(_FIELD_DEFAULTS)
        entry.update(fields)
        spec[name] = entry
    return spec


def validate(spec: dict) -> None:
    """Validate the artifact contract. Raises ValueError naming the offending artifact.

    Invariants checked:
    - kind in {hashed, metadata}
    - provenance in {derived, authoritative}
    - hashed: source_file and hash_basename must be present
    - metadata: source_file and hash_basename must be absent;
                metadata_type must be in {json, string}
    - authoritative must not have baseline_diff=true
    - content_type must not appear on non-hashed artifacts
    - build_time_fetch_optional requires build_time_fetch=true
    """
    for name, fields in spec.items():
        kind = fields.get("kind")
        provenance = fields.get("provenance")

        if kind not in _VALID_KINDS:
            raise ValueError(
                f"artifact '{name}': unknown kind {kind!r} (must be 'hashed' or 'metadata')"
            )
        if provenance not in _VALID_PROVENANCES:
            raise ValueError(
                f"artifact '{name}': unknown provenance {provenance!r} "
                f"(must be 'derived' or 'authoritative')"
            )

        if kind == "hashed":
            if not fields.get("source_file"):
                raise ValueError(
                    f"artifact '{name}': hashed artifact missing required field 'source_file'"
                )
            if not fields.get("hash_basename"):
                raise ValueError(
                    f"artifact '{name}': hashed artifact missing required field 'hash_basename'"
                )

        if kind == "metadata":
            if fields.get("source_file"):
                raise ValueError(
                    f"artifact '{name}': metadata artifact must not have 'source_file'"
                )
            if fields.get("hash_basename"):
                raise ValueError(
                    f"artifact '{name}': metadata artifact must not have 'hash_basename'"
                )
            if fields.get("metadata_type") not in _VALID_METADATA_TYPES:
                raise ValueError(
                    f"artifact '{name}': metadata artifact missing or invalid 'metadata_type' "
                    f"(must be 'json' or 'string')"
                )

        if provenance == "authoritative" and fields.get("baseline_diff"):
            raise ValueError(
                f"artifact '{name}': authoritative artifact must not have baseline_diff=true "
                f"(authoritative data cannot be reproduced from upstream — diffing is meaningless)"
            )

        if kind != "hashed" and fields.get("content_type") is not None:
            raise ValueError(
                f"artifact '{name}': 'content_type' is only valid for hashed artifacts"
            )

        if fields.get("build_time_fetch_optional") and not fields.get("build_time_fetch"):
            raise ValueError(
                f"artifact '{name}': build_time_fetch_optional=true requires build_time_fetch=true"
            )


# ---------------------------------------------------------------------------
# Classification predicates (all return declared-order results)
# ---------------------------------------------------------------------------

def hashed_artifacts(spec: dict) -> dict:
    """Return only hashed artifacts in declared order."""
    return {name: fields for name, fields in spec.items() if fields.get("kind") == "hashed"}


def metadata_artifacts(spec: dict) -> dict:
    """Return only metadata artifacts in declared order."""
    return {name: fields for name, fields in spec.items() if fields.get("kind") == "metadata"}


def baseline_diff_artifacts(spec: dict) -> dict:
    """Return hashed artifacts with baseline_diff=true, in declared order."""
    return {
        name: fields
        for name, fields in spec.items()
        if fields.get("kind") == "hashed" and fields.get("baseline_diff")
    }



def authoritative_names(spec: dict) -> list:
    """Return names of authoritative artifacts in declared order."""
    return [name for name, fields in spec.items() if fields.get("provenance") == "authoritative"]


def derived_names(spec: dict) -> list:
    """Return names of derived artifacts in declared order."""
    return [name for name, fields in spec.items() if fields.get("provenance") == "derived"]


# ---------------------------------------------------------------------------
# CLI verb implementations
# ---------------------------------------------------------------------------

def _cmd_validate(spec: dict) -> None:
    """Print contract summary. Called after validate() already passed."""
    n_total = len(spec)
    n_derived = len(derived_names(spec))
    n_authoritative = len(authoritative_names(spec))
    print(f"OK: {n_total} artifacts ({n_derived} derived, {n_authoritative} authoritative)")




def _cmd_pull_plan(spec: dict, args) -> None:
    """Emit TSV: name, hashed, source_file for every hashed artifact the live
    manifest names. (st-vjd repurposed this from baseline-pull-plan: the live
    slim manifest names exactly the runtime artifacts maderas serves, and ALL
    of them are pullable — baseline_diff selects integration-gate diffables,
    a different, narrower set.)

    For each key in the live manifest:
    - unknown (not in toml) → WARN to stderr (drift alarm), no row
    - metadata (generated_at, …) → skip silently
    - hashed with empty value → WARN skip
    - hashed with non-empty value → emit name<TAB>hashed<TAB>source_file
    """
    with open(args.manifest) as fh:
        manifest = json.load(fh)

    hashed_names = set(hashed_artifacts(spec))

    for key, value in manifest.items():
        if key not in spec:
            print(
                f"WARN: manifest key {key!r} is not in artifacts.toml — "
                f"drift alarm: add it to [artifacts.{key}] or verify it is excluded",
                file=sys.stderr,
            )
            continue
        if key not in hashed_names:
            continue  # metadata — skip silently (occurrences_db_tables, generated_at)
        if not value:
            print(
                f"WARN: manifest key {key!r} has empty/null value — skipping",
                file=sys.stderr,
            )
            continue
        source_file = spec[key].get("source_file", "")
        print(f"{key}\t{value}\t{source_file}")


def _cmd_baseline_files(spec: dict) -> None:
    """Emit TSV: name, source_file for baseline_diff artifacts.

    The local snapshot/restore plan (Model Y): nightly.sh snapshots these
    files from EXPORT_DIR after a successful publish and restores them into
    public/data/ before the next run's integration gate. Unlike
    baseline-pull-plan it needs no manifest — the baseline lives on the build
    host, not behind hashed S3 names.
    """
    for name, fields in baseline_diff_artifacts(spec).items():
        print(f"{name}\t{fields['source_file']}")



# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="BeeAtlas artifact contract CLI (stdlib-only; no uv required)"
    )
    sub = parser.add_subparsers(dest="verb", required=True)

    sub.add_parser("validate", help="Check contract integrity; print summary")
    pull_p = sub.add_parser(
        "pull-plan",
        help="TSV: name/hashed/source_file for hashed artifacts in a live manifest",
    )
    pull_p.add_argument(
        "manifest",
        help="Path to manifest.json to classify",
    )

    sub.add_parser(
        "baseline-files",
        help="TSV: name/source_file for baseline_diff artifacts (local snapshot plan)",
    )

    args = parser.parse_args()
    spec = load()

    # All verbs validate first — fail loud on a malformed contract.
    try:
        validate(spec)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)

    if args.verb == "validate":
        _cmd_validate(spec)
    elif args.verb == "pull-plan":
        _cmd_pull_plan(spec, args)
    elif args.verb == "baseline-files":
        _cmd_baseline_files(spec)
