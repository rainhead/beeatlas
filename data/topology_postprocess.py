"""Topology-aware cleanup of region GeoJSON via mapshaper.

Layers: counties, ecoregions (EPA Level III), ecoregions_l4 (EPA Level IV) and
wilderness. All four arrive as dbt marts, placed into EXPORT_DIR by place-marts.

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

_DATA_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _DATA_DIR.parent
_EXPORT_DIR = Path(os.environ.get(
    "EXPORT_DIR",
    str(_REPO_ROOT / "public" / "data"),
))

# mapshaper is the pipeline's Node tooling, declared in data/package.json rather
# than the root one — it is 227 packages that the site build has no use for
# (beeatlas-dqh). Resolve the binary by absolute path instead of going through
# `npx`: npx silently DOWNLOADS a missing package from the registry at run time,
# which would turn a broken install into an unpinned fetch mid-pipeline.
_MAPSHAPER_BIN = _DATA_DIR / "node_modules" / ".bin" / "mapshaper"


# Per-layer mapshaper recipe. None means "skip -simplify entirely; just -clean".
# Counties (CB 500k) are already cartographically scaled — any further simplify
# eats small-feature perimeter detail (Vashon, San Juans) before it touches
# redundant inland vertices. Ecoregions are dominated by dense Puget Sound
# coastlines and tolerate 3% retention, landing the file ~193 KB.
_SIMPLIFY_PCT: dict[str, str | None] = {
    "counties.geojson": None,
    "ecoregions.geojson": "3%",
    # Level IV ecoregions (beeatlas-8gcw) are the same EPA lineage at finer grain:
    # 57 dissolved polygons, ~7.7 MB raw, dominated by the same Puget Sound
    # coastlines. Same 3% for the same reason, landing in the same few-hundred-KB
    # range (191,239 -> 9,077 vertices, ~374 KB).
    "ecoregions_l4.geojson": "3%",
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


def _resolve_built_at() -> str:
    """Best-effort build timestamp as ``YYYY-MM-DDTHH:MM:SSZ``.

    Honors ``SOURCE_DATE_EPOCH`` (the reproducible-builds convention) when set, so
    a caller that pins a snapshot-derived epoch — e.g. stelis's content-addressed
    build (st-4cm/st-3mi) — gets byte-deterministic output: build the same
    snapshot twice, get the same ``_meta.built_at`` (beeatlas-8td SITE 1). Falls
    back to wall-clock otherwise (the nightly / ad-hoc runs); that leaves only this
    one field non-deterministic, which is acceptable outside the stelis parity check.
    """
    epoch = os.environ.get("SOURCE_DATE_EPOCH")
    if epoch:
        try:
            ts = datetime.datetime.fromtimestamp(int(epoch), datetime.UTC)
        except (ValueError, OverflowError, OSError):
            pass  # malformed epoch → treat as unset (per the SOURCE_DATE_EPOCH spec)
        else:
            return ts.strftime("%Y-%m-%dT%H:%M:%SZ")
    return datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _count_vertices(obj: dict) -> int:
    """Total ring positions across every feature. The unit simplification destroys.

    Bytes are the wrong unit to watch here: coordinate precision, key order and
    `_meta` all move them, so a file can halve in vertices while its size barely
    shifts. This is what the log reports.
    """
    total = 0
    for feature in obj.get("features") or []:
        geom = (feature or {}).get("geometry") or {}
        coords = geom.get("coordinates") or []
        if geom.get("type") == "Polygon":
            total += sum(len(ring) for ring in coords)
        elif geom.get("type") == "MultiPolygon":
            total += sum(len(ring) for poly in coords for ring in poly)
    return total


def _assert_not_our_own_output(name: str, obj: dict) -> None:
    """Refuse to simplify a file this step already simplified.

    THIS IS THE BUG THIS GUARD EXISTS FOR. Before beeatlas-hyq (136bce2f) the step
    wrote its simplified result back over the raw mart in place. Those files are
    still sitting in EXPORT_DIR's RAW slot on any long-lived data directory, and
    because the raw copy is only refreshed when stelis decides `place-marts` needs
    to re-run, a subsequent run re-simplifies an already-simplified file. Compound
    that a few times and 3% retention becomes 0.09%: the published ecoregions went
    to 761 vertices over 64 features — 46 of them under six vertices, i.e.
    triangles standing in for ecoregion outlines — where one honest pass over the
    real mart yields 4,674.

    `_meta` is an exact sentinel for it, and free: `_inject_meta` is the only thing
    that writes that key, and it only ever writes it to this step's OUTPUT. A dbt
    mart straight out of `emit_feature_collection` has no `_meta`. So a `_meta` on
    the INPUT means the raw slot is holding our own output.

    Loud failure rather than a warning, because the failure mode it replaces is
    silent and cumulative — nothing downstream notices, the file just quietly gets
    coarser every time. Fix by refreshing the raw copy from the dbt sandbox
    (re-run `place-marts`, or delete the raw file and let stelis rebuild it).
    """
    if "_meta" not in obj:
        return
    meta = obj.get("_meta") or {}
    raise RuntimeError(
        f"{name} carries _meta (git_sha={meta.get('git_sha', '?')}, "
        f"built_at={meta.get('built_at', '?')}) — only this step stamps that, so the "
        f"raw mart slot is holding a PREVIOUSLY SIMPLIFIED file. Simplifying it "
        f"again compounds: 3% twice is 0.09%. Refresh it from the dbt sandbox "
        f"(re-run place-marts, or delete {name} and rebuild) and re-run."
    )


def _inject_meta(path: Path) -> None:
    """Add a `_meta` field to the FeatureCollection root with provenance.

    Lets us identify which commit produced any deployed asset:
        curl https://beeatlas.net/data/counties.geojson | jq ._meta

    It doubles as the sentinel `_assert_not_our_own_output` keys on, so this
    remains the ONLY writer of `_meta` — do not stamp it anywhere else.
    """
    obj = json.loads(path.read_text())
    obj["_meta"] = {
        "git_sha": _resolve_git_sha(),
        "built_at": _resolve_built_at(),
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
    if not _MAPSHAPER_BIN.exists():
        raise RuntimeError(
            f"mapshaper not installed at {_MAPSHAPER_BIN} — topology_postprocess "
            "requires the pipeline's Node tooling. Run `npm ci` in data/."
        )
    if src.name not in _SIMPLIFY_PCT:
        raise ValueError(f"no mapshaper recipe configured for {src.name}")
    pct = _SIMPLIFY_PCT[src.name]
    cmd = [str(_MAPSHAPER_BIN), str(src), "-clean", "gap-fill-area=0.01km2"]
    if pct is not None:
        cmd += ["-simplify", f"percentage={pct}", "planar", "keep-shapes"]
    cmd += ["-o", str(dst), "format=geojson"]
    subprocess.run(cmd, check=True, cwd=str(_DATA_DIR))


def main() -> None:
    """Run topology-aware cleanup + simplification on both region layers.

    Counties (CB 5m) are already topology-clean and cartographically generalized
    from the source, so they get -clean only — no -simplify at all, per
    _SIMPLIFY_PCT. A correct pass is therefore near-identity: 20,657 vertices in,
    20,657 out, ~510 KB. (The docstring here used to claim -simplify shrank it 5x;
    that was written before counties were set to None and is exactly the kind of
    stale number the vertex logging below now makes impossible to keep.)

    Ecoregions need both -clean (resolves the EPA L3 source's ~160 km² of
    inter-feature overlaps in WA) and -simplify. The mart is ~4 MB of GeoJSON —
    102,699 vertices over 66 features after the model clips EPA L3 to the WA
    outline — and 3% retention lands it at ~4,674 vertices in ~190 KB, which is
    ~73 vertices per feature against counties' 45. That is the level this step is
    tuned for, and the only way to land far below it is to feed it its own output
    (see _assert_not_our_own_output).
    """
    for name in ("counties.geojson", "ecoregions.geojson", "ecoregions_l4.geojson",
                 "wilderness.geojson"):
        src = _EXPORT_DIR / name
        dst = _EXPORT_DIR / _clean_name(name)
        if not src.exists():
            raise FileNotFoundError(f"{src} not found — run dbt build first")
        obj = json.loads(src.read_text())
        _assert_not_our_own_output(str(src), obj)
        # An empty FeatureCollection can occur for wilderness.geojson before the
        # PAD-US source table is loaded (see dbt_project.yml on-run-start guard).
        # mapshaper rejects zero-feature input, so copy the raw file to the cleaned
        # name and just stamp _meta — keeps the nightly green (and the downstream
        # .clean.geojson present) while the overlay is still empty.
        if not obj.get("features"):
            shutil.copy2(src, dst)
            _inject_meta(dst)
            print(f"  {name}: 0 features — mapshaper skipped")  # noqa: T201
            continue
        before, before_v = src.stat().st_size, _count_vertices(obj)
        _run_mapshaper(src, dst)
        _inject_meta(dst)
        after = dst.stat().st_size
        after_v = _count_vertices(json.loads(dst.read_text()))
        # Vertices first: they are what simplification actually removes, and the
        # number a reviewer can compare against the last run. Bytes move for
        # reasons that have nothing to do with detail.
        print(  # noqa: T201
            f"  {name} -> {dst.name}: {before_v:,} -> {after_v:,} vertices "
            f"({before:,} -> {after:,} bytes)"
        )


if __name__ == "__main__":
    main()
