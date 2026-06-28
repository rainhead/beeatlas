"""Build committed SVG base-map partials for county and ecoregion coverage.

Run-once committed script — NOT in run.py STEPS, NOT in nightly.sh.
Re-run only when WA county or ecoregion boundaries change.

Each polygon becomes <path class="region" data-region="<name>" d="..."/> so
collector pages can highlight contributed regions via a per-collector CSS
<style> block without any JavaScript.

Ecoregion geometry is aggressively simplified (ST_SimplifyPreserveTopology
tolerance ECO_TOLERANCE ≈ 0.05°, ~5 km) so the partial stays well under
150 KB. County polygons use the species_maps.py moderate tolerance (0.005°).

Outputs (committed to _includes/maps/):
    _includes/maps/counties-base.svg
    _includes/maps/ecoregions-base.svg

Usage:
    cd data && uv run python build_coverage_basemaps.py

The script reads:
    - County polygons from geographies.us_counties in beeatlas.duckdb (DB_PATH)
    - Ecoregion polygons from public/data/ecoregions.geojson (ECO_GEOJSON)
      keyed by NA_L3NAME (NOT "name" — Pitfall 2 from collector_maps.py)

Geometry helpers copied from species_maps.py / collector_maps.py rather than
imported to avoid runtime coupling with those modules.
"""

import json
import os
import xml.etree.ElementTree as ET
from pathlib import Path

import duckdb

from config import STATE_FIPS

DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))

_repo_root = Path(__file__).parent.parent
_default_eco = str(_repo_root / "public" / "data" / "ecoregions.geojson")
ECO_GEOJSON = Path(os.environ.get("ECO_GEOJSON", _default_eco))

_default_out = str(_repo_root / "_includes" / "maps")
OUT_DIR = Path(os.environ.get("BASEMAP_OUT_DIR", _default_out))

SVG_NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG_NS)

VIEWBOX = "0 0 600 320"
SVG_WIDTH = 600
SVG_HEIGHT = 320

# WA bbox verified live 2026-05-03 (species_maps.py): minlon, minlat, maxlon, maxlat.
WA_BBOX = (-124.85, 45.54, -116.92, 49.00)

# County simplification tolerance — same as species_maps.py.
COUNTY_TOLERANCE = 0.005

# Ecoregion simplification tolerance — 10x more aggressive than counties.
# public/data/ecoregions.geojson is ~4 MB; without simplification the SVG
# would be >1 MB. At 0.05° (~5 km) most tiny island features collapse and
# the Puget Sound coastline is still recognizable. Target: well under 150 KB.
ECO_TOLERANCE = 0.05

# Default fill for all base-map polygons. Per-collector highlights are applied
# via page-level CSS using [data-region="<name>"] attribute selectors.
BASE_STYLE = ".region { fill:#f4f4f0; stroke:#888; stroke-width:0.5 }"


# ---------------------------------------------------------------------------
# Projection helpers (copied from species_maps.py / collector_maps.py)
# ---------------------------------------------------------------------------

def _project(lon: float, lat: float) -> tuple[float, float]:
    """Linear lon/lat → SVG (x, y) — SVG +y is down."""
    minx, miny, maxx, maxy = WA_BBOX
    x = (lon - minx) / (maxx - minx) * SVG_WIDTH
    y = SVG_HEIGHT - (lat - miny) / (maxy - miny) * SVG_HEIGHT
    return x, y


def _ring_to_path(coords: list[list[float]]) -> str:
    """One GeoJSON LinearRing → SVG path 'd' attribute (closed)."""
    pts = [_project(lon, lat) for lon, lat in coords]
    head = f"M{pts[0][0]:.2f},{pts[0][1]:.2f}"
    tail = "".join(f"L{x:.2f},{y:.2f}" for x, y in pts[1:])
    return head + tail + "Z"


def _geom_to_d(geom: dict) -> str | None:
    """Convert a GeoJSON geometry dict to an SVG path 'd' string.

    Returns None for degenerate geometries (fewer than 4 points in every ring
    after simplification) or unsupported geometry types (Point, LineString, etc).
    """
    gtype = geom.get("type")
    if gtype == "Polygon":
        rings = geom["coordinates"]
        if not rings or len(rings[0]) < 4:
            return None
        return " ".join(_ring_to_path(ring) for ring in rings)
    elif gtype == "MultiPolygon":
        parts = []
        for poly in geom["coordinates"]:
            if poly and len(poly[0]) >= 4:
                parts.append(" ".join(_ring_to_path(ring) for ring in poly))
        return " ".join(parts) if parts else None
    return None


def _make_svg_root() -> ET.Element:
    """Create the shared SVG root element with aria-hidden and base style block."""
    root = ET.Element(
        f"{{{SVG_NS}}}svg",
        attrib={
            # aria-hidden: the inline SVG is decorative; the wrapping element in
            # collector-detail.njk carries role="img" aria-label="..." for a11y.
            "aria-hidden": "true",
            "viewBox": VIEWBOX,
        },
    )
    style = ET.SubElement(root, f"{{{SVG_NS}}}style")
    style.text = BASE_STYLE
    return root


def _sort_attribs(root: ET.Element) -> None:
    """Sort attribute dicts for deterministic byte output.

    ET stores attrib as a dict and serializes in insertion order;
    sorting ensures identical inputs always produce identical file bytes
    (species_maps.py lines 226-228 pattern).
    """
    for elem in root.iter():
        if elem.attrib:
            elem.attrib = dict(sorted(elem.attrib.items()))


# ---------------------------------------------------------------------------
# County base map
# ---------------------------------------------------------------------------

def build_counties_base(
    con: duckdb.DuckDBPyConnection,
    out_path: Path,
) -> int:
    """Emit counties-base.svg with one <path> per WA county.

    Each path carries class="region" and data-region="<county_name>".
    Gracefully degrades to an empty-backdrop SVG when the
    geographies.us_counties table is unavailable (e.g. test environments).

    Returns the byte size of the written file.
    """
    root = _make_svg_root()

    try:
        rows = con.execute(
            """
            SELECT name,
                   ST_AsGeoJSON(
                       ST_SimplifyPreserveTopology(geom, ?)
                   )
            FROM geographies.us_counties
            WHERE state_fips = ?
            ORDER BY name
            """,
            [COUNTY_TOLERANCE, STATE_FIPS],
        ).fetchall()
    except Exception as exc:  # noqa: BLE001
        print(
            f"  counties-base: geographies.us_counties unavailable ({exc!r}) "
            "— writing empty backdrop"
        )
        rows = []

    written = 0
    for name, geom_json in rows:
        if not geom_json:
            continue
        geom = json.loads(geom_json)
        d = _geom_to_d(geom)
        if not d:
            continue
        ET.SubElement(
            root,
            f"{{{SVG_NS}}}path",
            attrib={"class": "region", "data-region": name, "d": d},
        )
        written += 1

    _sort_attribs(root)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        ET.tostring(root, encoding="unicode"),
        encoding="utf-8",
    )
    size = out_path.stat().st_size
    print(f"  counties-base.svg: {written} county paths, {size:,} bytes")
    return size


# ---------------------------------------------------------------------------
# Ecoregion base map
# ---------------------------------------------------------------------------

def build_ecoregions_base(
    con: duckdb.DuckDBPyConnection,
    eco_geojson_path: Path,
    out_path: Path,
    tolerance: float = ECO_TOLERANCE,
) -> int:
    """Emit ecoregions-base.svg with one <path> per ecoregion feature.

    Features are keyed by NA_L3NAME (NOT "name" — Pitfall 2). Multiple
    features may carry the same NA_L3NAME (e.g. Puget Lowland islands) —
    each is rendered as a separate <path data-region="<name>"> so the
    CSS attribute selector can highlight all polygons for a given region.

    Features whose geometry simplifies to fewer than 4 points (degenerate)
    are silently dropped — common for very small islands at high tolerance.

    Returns the byte size of the written file.

    Raises FileNotFoundError if eco_geojson_path does not exist.
    """
    if not eco_geojson_path.exists():
        raise FileNotFoundError(
            f"{eco_geojson_path} not found — run dbt build to populate public/data/"
        )

    fc = json.loads(eco_geojson_path.read_text())
    root = _make_svg_root()

    written = 0
    skipped = 0
    for feature in fc["features"]:
        name = feature["properties"]["NA_L3NAME"]   # NOT "name" — Pitfall 2
        geom_json = json.dumps(feature["geometry"])

        try:
            row = con.execute(
                "SELECT ST_AsGeoJSON("
                "  ST_SimplifyPreserveTopology(ST_GeomFromGeoJSON(?), ?)"
                ")",
                [geom_json, tolerance],
            ).fetchone()
        except Exception:  # noqa: BLE001
            skipped += 1
            continue

        if not row or not row[0]:
            skipped += 1
            continue

        geom = json.loads(row[0])
        d = _geom_to_d(geom)
        if not d:
            skipped += 1
            continue

        ET.SubElement(
            root,
            f"{{{SVG_NS}}}path",
            attrib={"class": "region", "data-region": name, "d": d},
        )
        written += 1

    _sort_attribs(root)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        ET.tostring(root, encoding="unicode"),
        encoding="utf-8",
    )
    size = out_path.stat().st_size
    print(
        f"  ecoregions-base.svg: {written} paths written, {skipped} features "
        f"simplified away, {size:,} bytes"
    )
    return size


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

def build_basemaps(
    db_path: str | None = None,
    eco_geojson_path: Path | None = None,
    out_dir: Path | None = None,
) -> dict[str, int]:
    """Build both county and ecoregion base-map SVG partials.

    Returns a dict with keys 'counties' and 'ecoregions' mapping to byte sizes.
    """
    if db_path is None:
        db_path = DB_PATH
    if eco_geojson_path is None:
        eco_geojson_path = ECO_GEOJSON
    if out_dir is None:
        out_dir = OUT_DIR

    con = duckdb.connect(db_path)
    try:
        con.execute("INSTALL spatial; LOAD spatial;")
        county_size = build_counties_base(con, out_dir / "counties-base.svg")
        eco_size = build_ecoregions_base(con, eco_geojson_path, out_dir / "ecoregions-base.svg")
    finally:
        con.close()

    return {"counties": county_size, "ecoregions": eco_size}


def main() -> None:
    """Build coverage base-map SVG partials and print sizes."""
    print("Building coverage base-map SVG partials...")
    sizes = build_basemaps()
    print(
        f"Done — counties: {sizes['counties']:,} bytes, "
        f"ecoregions: {sizes['ecoregions']:,} bytes"
    )


if __name__ == "__main__":
    main()
