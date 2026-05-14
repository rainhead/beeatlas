"""Topology-aware cleanup of region GeoJSON via mapshaper.

Counties from cb_2024_us_county_5m are already topology-clean (Census builds CB
files from the topology database). Ecoregions from EPA Level III have ~160 km²
of inter-feature overlaps in WA that mapshaper -clean resolves; -simplify then
removes redundant vertices on shared arcs without re-introducing gaps.

Reads from EXPORT_DIR (the same path run.py copies dbt outputs to), writes back
in place. Idempotent.

Sliver policy: gap-fill-area=0.01km2 drops features below 1 hectare (#14
discussion — 2 sub-hectare Puget Sound rocks in "Strait of Georgia/Puget
Lowland" get folded into surrounding water). 64 of 66 ecoregion features
retained; all 8 distinct L3 names preserved.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
_EXPORT_DIR = Path(os.environ.get(
    "EXPORT_DIR",
    str(_REPO_ROOT / "public" / "data"),
))


# Per-layer simplification retention. Counties (CB 500k) have ~1200 verts per
# county and tolerate 20% — preserves small islands like Vashon at near-actual
# area (97 km² vs the ~95 km² real). Tried 10% on the earlier CB 5m source and
# Vashon got chopped to 70 km², visible as "half of Vashon missing from King".
# Ecoregions are dominated by dense Puget Sound coastlines (22 KB of verts on
# one feature) and need 3% to land near the pre-fix ~194 KB target file size.
# Values picked empirically against visual fidelity at zoom 7-10.
_SIMPLIFY_PCT = {
    "counties.geojson": "20%",
    "ecoregions.geojson": "3%",
}


def _run_mapshaper(path: Path) -> None:
    """Run mapshaper -clean -simplify on a GeoJSON file, in place.

    Mapshaper refuses to overwrite its input directly; write to a sibling
    temp file then atomically rename over the original.
    """
    if shutil.which("npx") is None:
        raise RuntimeError(
            "npx not on PATH — topology_postprocess requires Node.js + mapshaper. "
            "Install Node and run `npm install` at the repo root."
        )
    pct = _SIMPLIFY_PCT.get(path.name)
    if pct is None:
        raise ValueError(f"no simplify percentage configured for {path.name}")
    tmp = path.with_suffix(path.suffix + ".tmp")
    cmd = [
        "npx", "mapshaper", str(path),
        "-clean", "gap-fill-area=0.01km2",
        "-simplify", f"percentage={pct}", "planar", "keep-shapes",
        "-o", str(tmp), "format=geojson",
    ]
    subprocess.run(cmd, check=True, cwd=str(_REPO_ROOT))
    tmp.replace(path)


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
    for name in ("counties.geojson", "ecoregions.geojson"):
        path = _EXPORT_DIR / name
        if not path.exists():
            raise FileNotFoundError(f"{path} not found — run dbt build first")
        before = path.stat().st_size
        _run_mapshaper(path)
        after = path.stat().st_size
        print(f"  {name}: {before:,} -> {after:,} bytes")  # noqa: T201


if __name__ == "__main__":
    main()
