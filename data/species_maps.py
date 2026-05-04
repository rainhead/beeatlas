"""Per-species static SVG occurrence maps.

For each species with occurrence_count > 0 in public/data/species.parquet,
emit public/data/species-maps/<slug>.svg containing the WA county polygon
backdrop plus one <circle class="occ"> per in-bbox occurrence point.

Per D-03 (CONTEXT.md): single <style> block, classed .county / .occ —
NOT per-element fill/stroke. Browsers honor <style> blocks inside
<img src=".svg"> in image mode (only external CSS and scripts are blocked).

Per D-04 (CONTEXT.md): wipe-and-rewrite the species-maps/ directory at
the start of each run for idempotency.

Per D-02 (CONTEXT.md): state_fips comes from config.STATE_FIPS, NOT
hardcoded — multi-state expansion deferred but the seam is already here.

Per MAP-04 + Pitfall #5: off-WA-bbox occurrence points are silently
dropped; clipped count is printed; never raise.

Usage:
    cd data && uv run python species_maps.py
"""

import copy
import json
import os
import shutil
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

import duckdb

from config import STATE_FIPS

DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))
_default_assets = str(Path(__file__).parent.parent / 'public' / 'data')
ASSETS_DIR = Path(os.environ.get('EXPORT_DIR', _default_assets))

SVG_NS = "http://www.w3.org/2000/svg"
ET.register_namespace('', SVG_NS)

VIEWBOX = "0 0 600 320"
SVG_WIDTH = 600
SVG_HEIGHT = 320

# WA bbox verified live 2026-05-03 (CONTEXT §Specifics): minlon, minlat, maxlon, maxlat.
WA_BBOX = (-124.85, 45.54, -116.92, 49.00)

# D-03 styling — single <style> block with classes (NOT per-element fill/stroke).
STYLE_CSS = (
    ".county { fill: #f4f4f0; stroke: #888; stroke-width: 0.5; }\n"
    ".occ { fill: #c44; fill-opacity: 0.6; stroke: none; }"
)


def _project(lon: float, lat: float) -> tuple[float, float]:
    """Linear lon/lat → SVG (x, y) — SVG +y is down."""
    minx, miny, maxx, maxy = WA_BBOX
    x = (lon - minx) / (maxx - minx) * SVG_WIDTH
    y = SVG_HEIGHT - (lat - miny) / (maxy - miny) * SVG_HEIGHT
    return x, y


def _in_bbox(lon: float, lat: float) -> bool:
    minx, miny, maxx, maxy = WA_BBOX
    return minx <= lon <= maxx and miny <= lat <= maxy


def _ring_to_path(coords: list[list[float]]) -> str:
    """One GeoJSON LinearRing → SVG path 'd' attribute (closed)."""
    pts = [_project(lon, lat) for lon, lat in coords]
    head = f"M{pts[0][0]:.2f},{pts[0][1]:.2f}"
    tail = "".join(f"L{x:.2f},{y:.2f}" for x, y in pts[1:])
    return head + tail + "Z"


def _load_county_geojsons(con: duckdb.DuckDBPyConnection) -> list[dict]:
    """Fetch the WA county polygon set as GeoJSON dicts (one per county).

    D-02: state_fips comes from config (not hardcoded). MAP-03: uses
    ST_SimplifyPreserveTopology with tolerance 0.005 (vs. 0.001 in
    export.py — the smaller 600x320 viewport tolerates more simplification).
    """
    rows = con.execute(
        """
        SELECT ST_AsGeoJSON(
                   ST_SimplifyPreserveTopology(ST_GeomFromText(geometry_wkt), 0.005)
               )
        FROM geographies.us_counties
        WHERE state_fips = ?
        """,
        [STATE_FIPS],
    ).fetchall()
    return [json.loads(g) for (g,) in rows]


def _build_county_backdrop(county_geojsons: list[dict]) -> ET.Element:
    """Build the <svg> root with a single <style> block + one <path class="county">
    per county polygon. Deepcopied per species and then occurrence circles append.
    """
    root = ET.Element(
        f"{{{SVG_NS}}}svg",
        attrib={
            "viewBox": VIEWBOX,
            "width": str(SVG_WIDTH),
            "height": str(SVG_HEIGHT),
        },
    )
    style = ET.SubElement(root, f"{{{SVG_NS}}}style")
    style.text = STYLE_CSS
    for geom in county_geojsons:
        gtype = geom.get("type")
        if gtype == "Polygon":
            d = " ".join(_ring_to_path(ring) for ring in geom["coordinates"])
        elif gtype == "MultiPolygon":
            d = " ".join(
                _ring_to_path(ring)
                for poly in geom["coordinates"]
                for ring in poly
            )
        else:  # Point / LineString / etc — skip silently
            continue
        ET.SubElement(
            root,
            f"{{{SVG_NS}}}path",
            attrib={"class": "county", "d": d},
        )
    return root


def _write_species_svg(
    slug: str,
    points: list[tuple[float, float]],
    backdrop: ET.Element,
    out_dir: Path,
) -> int:
    """Emit out_dir/<slug>.svg with one <circle class="occ"> per in-bbox point.

    Returns the number of points dropped because they fell outside WA_BBOX
    (MAP-04 — silent clip, never raise).
    """
    root = copy.deepcopy(backdrop)
    clipped = 0
    for lon, lat in points:
        if not _in_bbox(lon, lat):
            clipped += 1
            continue
        x, y = _project(lon, lat)
        ET.SubElement(
            root,
            f"{{{SVG_NS}}}circle",
            attrib={
                "class": "occ",
                "cx": f"{x:.2f}",
                "cy": f"{y:.2f}",
                "r": "2.5",
            },
        )
    # Idempotency (Phase 78 success criterion 4): sort attribute dicts so
    # ET.tostring emits stable byte output across Python invocations.
    # ET stores attrib as a regular dict and serializes in insertion order;
    # sorting by key gives deterministic output regardless of construction order.
    for elem in root.iter():
        if elem.attrib:
            elem.attrib = dict(sorted(elem.attrib.items()))
    out_path = out_dir / f"{slug}.svg"
    out_path.write_text(
        ET.tostring(root, xml_declaration=True, encoding="unicode"),
        encoding="utf-8",
    )
    return clipped


def generate_species_maps(con: duckdb.DuckDBPyConnection | None = None) -> None:
    """Emit one <slug>.svg per species with occurrence_count > 0.

    D-04 idempotency: wipe and recreate the species-maps directory at the
    start of each run — guarantees no stale files for species whose
    canonical_name changed or whose occurrence_count dropped to zero.
    """
    own_con = con is None
    if own_con:
        con = duckdb.connect(DB_PATH)
        con.execute("INSTALL spatial; LOAD spatial;")

    try:
        # D-04 — wipe-and-rewrite for idempotency.
        maps_dir = ASSETS_DIR / "species-maps"
        if maps_dir.exists():
            shutil.rmtree(maps_dir)
        maps_dir.mkdir(parents=True)

        # Build the county backdrop once and deepcopy per species.
        county_geojsons = _load_county_geojsons(con)
        backdrop = _build_county_backdrop(county_geojsons)

        # Read slug + canonical_name from species.parquet — Pitfall #3:
        # NEVER recompute slug from scientificName here.
        species_parquet = ASSETS_DIR / "species.parquet"
        if not species_parquet.exists():
            raise FileNotFoundError(
                f"{species_parquet} not found — run species-export STEP first"
            )

        species_rows = con.execute(
            f"""
            SELECT canonical_name, slug
            FROM read_parquet('{species_parquet}')
            WHERE occurrence_count > 0
            ORDER BY canonical_name
            """
        ).fetchall()

        # Single sweep through occurrences — group by canonical_name in Python
        # so we never round-trip per species. Casts ignore empty-string lat/lon.
        occ_rows = con.execute(
            """
            SELECT canonical_name,
                   CAST(decimal_longitude AS DOUBLE),
                   CAST(decimal_latitude  AS DOUBLE)
            FROM ecdysis_data.occurrences
            WHERE canonical_name IS NOT NULL
              AND decimal_latitude IS NOT NULL AND decimal_latitude != ''
              AND decimal_longitude IS NOT NULL AND decimal_longitude != ''
            """
        ).fetchall()

        occ_by_canon: dict[str, list[tuple[float, float]]] = defaultdict(list)
        for canon, lon, lat in occ_rows:
            if lon is None or lat is None:
                continue
            occ_by_canon[canon].append((lon, lat))

        total_clipped = 0
        written = 0
        for canon, slug in species_rows:
            points = occ_by_canon.get(canon, [])
            clipped = _write_species_svg(slug, points, backdrop, maps_dir)
            if clipped:
                # MAP-04 + Pitfall #5: log silently, NEVER raise.
                print(f"  species-maps/{slug}.svg: {clipped} points clipped")
                total_clipped += clipped
            written += 1

        total_size = sum(p.stat().st_size for p in maps_dir.glob('*.svg'))
        print(
            f"  species-maps/: {written:,} files, {total_size:,} bytes, "
            f"{total_clipped:,} total points clipped"
        )
    finally:
        if own_con:
            con.close()


def main() -> None:
    """Generate per-species SVGs from beeatlas.duckdb."""
    print("Connecting to DuckDB...")
    generate_species_maps()
    print("Done.")


if __name__ == "__main__":
    main()
