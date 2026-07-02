"""Artifact contract loader, validator, and CLI for BeeAtlas data pipeline.

Stdlib-only — must run under bare system python3 (no uv/venv) for CI
compatibility (deploy.yml uses bare python3 to emit manifest.json).

Usage (CLI verbs):
  python3 data/artifacts.py validate
  python3 data/artifacts.py publish-plan
  python3 data/artifacts.py manifest <mapfile> --meta k=v [--meta k=v ...]
  python3 data/artifacts.py baseline-pull-plan <manifest.json>
  python3 data/artifacts.py build-time-fetch

Public module API:
  load(path=None) -> dict          ORDER-PRESERVING {name: fields}
  validate(spec)                   raises ValueError on any violation
  hashed_artifacts(spec) -> dict
  metadata_artifacts(spec) -> dict
  baseline_diff_artifacts(spec) -> dict
  build_time_fetch_artifacts(spec) -> dict
  authoritative_names(spec) -> list
  derived_names(spec) -> list
  render_manifest(spec, name_map, meta_map) -> str

CLAUDE.md invariant: this module MUST NOT perform any S3/subprocess I/O.
All aws calls stay in nightly.sh and .github/workflows/deploy.yml.
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


def build_time_fetch_artifacts(spec: dict) -> dict:
    """Return hashed artifacts with build_time_fetch=true, in declared order."""
    return {
        name: fields
        for name, fields in spec.items()
        if fields.get("kind") == "hashed" and fields.get("build_time_fetch")
    }


def authoritative_names(spec: dict) -> list:
    """Return names of authoritative artifacts in declared order."""
    return [name for name, fields in spec.items() if fields.get("provenance") == "authoritative"]


def derived_names(spec: dict) -> list:
    """Return names of derived artifacts in declared order."""
    return [name for name, fields in spec.items() if fields.get("provenance") == "derived"]


# ---------------------------------------------------------------------------
# Manifest renderer (byte-exact match to nightly.sh heredoc — SC-3 floor)
# ---------------------------------------------------------------------------

def render_manifest(spec: dict, name_map: dict, meta_map: dict) -> str:
    """Render manifest.json byte-exactly matching nightly.sh heredoc layout.

    name_map: {logical_name: hashed_filename} for all hashed artifacts
    meta_map: {logical_name: value_string} for all metadata artifacts
              (metadata_type=json: value is a compact JSON string, emitted
               without quotes; metadata_type=string: value is quoted)

    Raises ValueError if name_map or meta_map keys don't match the contract
    exactly (extra, missing, or unknown keys all fail loud).

    Returns the manifest as a string ending with '\\n' (the heredoc trailing
    newline). Use sys.stdout.write(result) or print(result, end='') to emit.

    Do NOT use json.dumps() for this output — it would expand
    occurrences_db_tables across multiple lines, breaking byte-identity.
    """
    hashed = hashed_artifacts(spec)
    meta = metadata_artifacts(spec)

    expected_hashed = set(hashed)
    expected_meta = set(meta)
    got_hashed = set(name_map)
    got_meta = set(meta_map)

    errors = []
    missing_h = expected_hashed - got_hashed
    extra_h = got_hashed - expected_hashed
    missing_m = expected_meta - got_meta
    extra_m = got_meta - expected_meta
    if missing_h:
        errors.append(f"missing hashed keys: {sorted(missing_h)}")
    if extra_h:
        errors.append(f"extra/unknown hashed keys: {sorted(extra_h)}")
    if missing_m:
        errors.append(f"missing meta keys: {sorted(missing_m)}")
    if extra_m:
        errors.append(f"extra/unknown meta keys: {sorted(extra_m)}")
    if errors:
        raise ValueError(f"manifest key mismatch: {'; '.join(errors)}")

    lines = ["{"]
    artifacts_list = list(spec.items())
    for i, (name, fields) in enumerate(artifacts_list):
        is_last = i == len(artifacts_list) - 1
        sep = "" if is_last else ","
        kind = fields.get("kind")
        if kind == "hashed":
            value = f'"{name_map[name]}"'
        else:
            mtype = fields.get("metadata_type")
            raw = meta_map[name]
            # json metadata: emit value verbatim (already compact JSON, no outer quotes)
            # string metadata: wrap in double quotes
            value = raw if mtype == "json" else f'"{raw}"'
        lines.append(f'  "{name}": {value}{sep}')
    lines.append("}")
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# CLI verb implementations
# ---------------------------------------------------------------------------

def _cmd_validate(spec: dict) -> None:
    """Print contract summary. Called after validate() already passed."""
    n_total = len(spec)
    n_derived = len(derived_names(spec))
    n_authoritative = len(authoritative_names(spec))
    print(f"OK: {n_total} artifacts ({n_derived} derived, {n_authoritative} authoritative)")


def _cmd_publish_plan(spec: dict) -> None:
    """Emit TSV: name, source_file, hash_basename, gzip, content_type."""
    for name, fields in hashed_artifacts(spec).items():
        gzip_flag = "true" if fields.get("gzip") else "false"
        ct = fields.get("content_type") or "-"
        print(f"{name}\t{fields['source_file']}\t{fields['hash_basename']}\t{gzip_flag}\t{ct}")


def _cmd_manifest(spec: dict, args) -> None:
    """Read mapfile + --meta pairs; emit byte-exact manifest.json to stdout."""
    # Parse mapfile: logical<TAB>hashed lines
    name_map = {}
    with open(args.mapfile) as fh:
        for line in fh:
            line = line.rstrip("\n")
            if not line:
                continue
            parts = line.split("\t", 1)
            if len(parts) == 2:
                name_map[parts[0]] = parts[1]

    # Parse --meta k=v pairs
    meta_map = {}
    for pair in (args.meta or []):
        k, _, v = pair.partition("=")
        meta_map[k] = v

    try:
        result = render_manifest(spec, name_map, meta_map)
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
    sys.stdout.write(result)


def _cmd_baseline_pull_plan(spec: dict, args) -> None:
    """Emit TSV: name, hashed, source_file for baseline_diff artifacts.

    For each key in the live manifest:
    - unknown (not in toml) → WARN to stderr (drift alarm), no row
    - metadata or baseline_diff=false → skip silently
    - baseline_diff=true with empty value → WARN skip
    - baseline_diff=true with non-empty value → emit name<TAB>hashed<TAB>source_file
    """
    with open(args.manifest) as fh:
        manifest = json.load(fh)

    meta_names = set(metadata_artifacts(spec))
    baseline_names = set(baseline_diff_artifacts(spec))

    for key, value in manifest.items():
        if key not in spec:
            print(
                f"WARN: manifest key {key!r} is not in artifacts.toml — "
                f"drift alarm: add it to [artifacts.{key}] or verify it is excluded",
                file=sys.stderr,
            )
            continue
        if key in meta_names:
            continue  # metadata — skip silently (occurrences_db_tables, generated_at)
        if key not in baseline_names:
            continue  # hashed but not a baseline artifact — skip silently
        if not value:
            print(
                f"WARN: manifest key {key!r} has empty/null value — skipping",
                file=sys.stderr,
            )
            continue
        source_file = spec[key].get("source_file", "")
        print(f"{key}\t{value}\t{source_file}")


def _cmd_build_time_fetch(spec: dict) -> None:
    """Emit TSV: name, source_file, optional for build_time_fetch artifacts."""
    for name, fields in build_time_fetch_artifacts(spec).items():
        optional = "true" if fields.get("build_time_fetch_optional") else "false"
        print(f"{name}\t{fields['source_file']}\t{optional}")


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="BeeAtlas artifact contract CLI (stdlib-only; no uv required)"
    )
    sub = parser.add_subparsers(dest="verb", required=True)

    sub.add_parser("validate", help="Check contract integrity; print summary")
    sub.add_parser("publish-plan", help="TSV: name/source_file/hash_basename/gzip/content_type")

    manifest_p = sub.add_parser("manifest", help="Emit byte-exact manifest.json to stdout")
    manifest_p.add_argument(
        "mapfile",
        help="File with logical<TAB>hashed lines (one per hashed artifact)",
    )
    manifest_p.add_argument(
        "--meta",
        action="append",
        default=[],
        metavar="k=v",
        help="Metadata key=value pair (one --meta per metadata artifact)",
    )

    baseline_p = sub.add_parser(
        "baseline-pull-plan",
        help="TSV: name/hashed/source_file for baseline_diff artifacts",
    )
    baseline_p.add_argument(
        "manifest",
        help="Path to manifest.json to classify",
    )

    sub.add_parser("build-time-fetch", help="TSV: name/source_file/optional for build-time fetches")

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
    elif args.verb == "publish-plan":
        _cmd_publish_plan(spec)
    elif args.verb == "manifest":
        _cmd_manifest(spec, args)
    elif args.verb == "baseline-pull-plan":
        _cmd_baseline_pull_plan(spec, args)
    elif args.verb == "build-time-fetch":
        _cmd_build_time_fetch(spec)
