"""Topology-aware cleanup of region GeoJSON via mapshaper.

Counties (Census CB 500k) are already topology-clean and cartographically
generalized to ~1:500k from the topology database. Don't further simplify —
mapshaper's -simplify at any aggressive retention chops small islands like
Vashon by the perimeter (NW edge of Vashon ends up uncountied at percentage=20%).
Just -clean to format consistently; that's a no-op on already-clean data.

Ecoregions (EPA Level III) have ~160 km² of inter-feature overlaps in WA that
mapshaper -clean resolves; -simplify then removes redundant vertices on shared
arcs to keep the file in the ~200 KB range.

Reads the raw region marts from EXPORT_DIR (the same path run.py copies dbt
outputs to) and writes a distinctly-named cleaned sibling — ``<name>.clean.geojson``
— leaving the raw mart copy untouched. This keeps one-producer-per-artifact
intact (dbt-build owns ``counties.geojson``; this step owns ``counties.clean.geojson``),
which a content-addressed build graph needs to model each step as a node
(beeatlas-hyq). Downstream consumers (manifest source_file, frontend map layers)
point at the ``.clean.geojson`` name. Idempotent.

Sliver policy: gap-fill-area=0.01km2 drops features below 1 hectare (#14
discussion — 2 sub-hectare Puget Sound rocks in "Strait of Georgia/Puget
Lowland" get folded into surrounding water). 64 of 66 ecoregion features
retained; all 9 distinct L3 names preserved.
"""

from __future__ import annotations

import datetime
import json
import os
import shutil
import subprocess
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
_EXPORT_DIR = Path(os.environ.get(
    "EXPORT_DIR",
    str(_REPO_ROOT / "public" / "data"),
))


# Per-layer mapshaper recipe. None means "skip -simplify entirely; just -clean".
# Counties (CB 500k) are already cartographically scaled — any further simplify
# eats small-feature perimeter detail (Vashon, San Juans) before it touches
# redundant inland vertices. Ecoregions are dominated by dense Puget Sound
# coastlines and tolerate 3% retention, landing the file ~193 KB.
_SIMPLIFY_PCT: dict[str, str | None] = {
    "counties.geojson": None,
    "ecoregions.geojson": "3%",
    # Wilderness (PAD-US Designation) polygons carry dense, high-vertex
    # boundaries traced to terrain; 5% retention keeps recognizable shapes while
    # holding the file to the tens-of-KB range like ecoregions.
    "wilderness.geojson": "5%",
}


def _resolve_git_sha() -> str:
    """Best-effort current commit SHA. Returns 'unknown' if not in a git checkout."""
    sha = os.environ.get("GIT_SHA")
    if sha:
        return sha
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=str(_REPO_ROOT), text=True,
        ).strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return "unknown"


def _inject_meta(path: Path) -> None:
    """Add a `_meta` field to the FeatureCollection root with provenance.

    Lets us identify which commit produced any deployed asset:
        curl https://beeatlas.net/data/counties.geojson | jq ._meta
    """
    obj = json.loads(path.read_text())
    obj["_meta"] = {
        "git_sha": _resolve_git_sha(),
        "built_at": datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    path.write_text(json.dumps(obj, separators=(",", ":")))


def _clean_name(name: str) -> str:
    """Map a raw region mart filename to its cleaned sibling.

    ``counties.geojson`` -> ``counties.clean.geojson``. The ``.clean`` infix keeps
    the raw mart copy (dbt-build's output) and the cleaned file (this step's
    output) as two distinct artifacts — one producer each.
    """
    return f"{Path(name).stem}.clean.geojson"


def _run_mapshaper(src: Path, dst: Path) -> None:
    """Run mapshaper -clean (and optionally -simplify) on ``src``, writing ``dst``.

    ``src`` (the raw mart copy) is read-only here; the cleaned result lands in the
    distinctly-named ``dst`` so the raw input is never mutated in place.
    """
    if shutil.which("npx") is None:
        raise RuntimeError(
            "npx not on PATH — topology_postprocess requires Node.js + mapshaper. "
            "Install Node and run `npm install` at the repo root."
        )
    if src.name not in _SIMPLIFY_PCT:
        raise ValueError(f"no mapshaper recipe configured for {src.name}")
    pct = _SIMPLIFY_PCT[src.name]
    cmd = ["npx", "mapshaper", str(src), "-clean", "gap-fill-area=0.01km2"]
    if pct is not None:
        cmd += ["-simplify", f"percentage={pct}", "planar", "keep-shapes"]
    cmd += ["-o", str(dst), "format=geojson"]
    subprocess.run(cmd, check=True, cwd=str(_REPO_ROOT))


def main() -> None:
    """Run topology-aware cleanup + simplification on both region layers.

    Counties (CB 5m) are already topology-clean from the source; -clean is a
    no-op on them but -simplify shrinks the file ~5x without re-introducing
    gaps (mapshaper simplifies shared arcs once, unlike DuckDB's per-feature
    ST_SimplifyPreserveTopology).

    Ecoregions need both -clean (resolves the EPA L3 source's ~160 km² of
    inter-feature overlaps in WA) and -simplify (brings 6 MB raw down to
    a tens-of-KB lazy-loadable file).
    """
    for name in ("counties.geojson", "ecoregions.geojson", "wilderness.geojson"):
        src = _EXPORT_DIR / name
        dst = _EXPORT_DIR / _clean_name(name)
        if not src.exists():
            raise FileNotFoundError(f"{src} not found — run dbt build first")
        # An empty FeatureCollection can occur for wilderness.geojson before the
        # PAD-US source table is loaded (see dbt_project.yml on-run-start guard).
        # mapshaper rejects zero-feature input, so copy the raw file to the cleaned
        # name and just stamp _meta — keeps the nightly green (and the downstream
        # .clean.geojson present) while the overlay is still empty.
        if not json.loads(src.read_text()).get("features"):
            shutil.copy2(src, dst)
            _inject_meta(dst)
            print(f"  {name}: 0 features — mapshaper skipped")  # noqa: T201
            continue
        before = src.stat().st_size
        _run_mapshaper(src, dst)
        _inject_meta(dst)
        after = dst.stat().st_size
        print(f"  {name} -> {dst.name}: {before:,} -> {after:,} bytes")  # noqa: T201


if __name__ == "__main__":
    main()
