"""Build committed SVG base-map partials for county and ecoregion coverage.

Run-once committed script — NOT in run.py STEPS, NOT in nightly.sh.
Re-run only when WA county or ecoregion boundaries change.

Each polygon becomes <path class="region" data-region="<name>" d="..."/> so
collector pages can highlight contributed regions via a per-collector CSS
<style> block without any JavaScript.

County polygons use the species_maps.py moderate tolerance (0.005°).

Outputs (committed to _includes/maps/):
    _includes/maps/counties-base.svg
    _includes/maps/ecoregions-l4-base.svg

Usage:
    cd data && uv run python build_coverage_basemaps.py

The script reads:
    - County polygons from geographies.us_counties in beeatlas.duckdb (DB_PATH)
    - Level IV ecoregion polygons from public/data/ecoregions_l4.clean.geojson
      (ECO_L4_GEOJSON), keyed by the "name" property — already the coded display
      form ("1d. Volcanics"), which is also what `geographies.places.name` holds
      for kind='ecoregion_l4', so the CSS attribute selector matches what
      collectors_export.py emits. These are topology-postprocess's cleaned outputs
      (beeatlas-hyq) — the files the pipeline and scripts/fetch-data.sh actually
      produce locally; the raw *.geojson mart copies are intermediates and are
      neither published nor fetched.

WHY LEVEL IV, AND WHY 0.02° (beeatlas-dflu). The coverage map used the 9 Level
III ecoregions and saturated: one L3 region is up to a third of the state, so a
collector with a single region got a map that said "somewhere in eastern
Washington". The 57 Level IV places locate the same records. Two numbers govern
the swap, both measured rather than guessed:

  * ECO_L4_TOLERANCE = 0.02°, NOT the 0.05° the Level III map used.
    ST_SimplifyPreserveTopology preserves each FEATURE's topology, not the
    borders it SHARES with its neighbours, so adjacent polygons drift apart and
    leave white slivers between them. Level IV has far more shared border per
    unit area than Level III, which is why an artifact invisible at 9 regions
    dominates at 57. At 0.02° (~2 km, well under a pixel at the ~530 px the map
    renders) the slivers are gone. Cost: 73 KB, against 44 KB for the counties
    map already inlined on the same page.
  * The stroke drops to a hairline in src/styles/places.css. 57 outlines at the
    Level III weight (#888 / 0.5) read as a mosaic; that CSS is load-bearing for
    legibility, not decoration.

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
_default_eco = str(_repo_root / "public" / "data" / "ecoregions.clean.geojson")
ECO_GEOJSON = Path(os.environ.get("ECO_GEOJSON", _default_eco))

_default_eco_l4 = str(_repo_root / "public" / "data" / "ecoregions_l4.clean.geojson")
ECO_L4_GEOJSON = Path(os.environ.get("ECO_L4_GEOJSON", _default_eco_l4))

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
# The input (ecoregions.clean.geojson) is already mapshaper-simplified (~40 KB),
# but its vertex density still yields a >150 KB SVG unrendered; at 0.05° (~5 km)
# most tiny island features collapse and the Puget Sound coastline is still
# recognizable. Target: well under 150 KB for the committed partial.
ECO_TOLERANCE = 0.05

# Level IV tolerance. Deliberately gentler than ECO_TOLERANCE — see the module
# docstring: at 0.05° the per-feature simplification tears shared borders apart
# and the map fills with white slivers. Moving this number without re-checking
# the rendered map is how that comes back.
ECO_L4_TOLERANCE = 0.02

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
    name_key: str = "NA_L3NAME",
) -> int:
    """Emit an ecoregion base map with one <path> per ecoregion feature.

    `name_key` is the feature property to read the region name from, and it is
    the whole difference between the two levels: Level III files key on
    NA_L3NAME (NOT "name" — Pitfall 2), Level IV's cleaned file keys on "name".
    Whatever comes out lands in data-region="…", so it must byte-match the names
    collectors_export.py puts in ecoregion_l4_names or nothing highlights.

    Multiple features may carry the same name (e.g. Puget Lowland islands) —
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
        name = feature["properties"][name_key]
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
        f"  {out_path.name}: {written} paths written, {skipped} features "
        f"simplified away, {size:,} bytes"
    )
    return size


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

def build_basemaps(
    db_path: str | None = None,
    eco_l4_geojson_path: Path | None = None,
    out_dir: Path | None = None,
) -> dict[str, int]:
    """Build the county and Level IV ecoregion base-map SVG partials.

    Returns a dict with keys 'counties' and 'ecoregions_l4' mapping to byte sizes.

    A Level III partial is NOT emitted: no template includes one since the
    coverage map moved to Level IV (beeatlas-dflu). build_ecoregions_base still
    takes name_key, so pass ECO_GEOJSON / "NA_L3NAME" to get one back.
    """
    if db_path is None:
        db_path = DB_PATH
    if eco_l4_geojson_path is None:
        eco_l4_geojson_path = ECO_L4_GEOJSON
    if out_dir is None:
        out_dir = OUT_DIR

    con = duckdb.connect(db_path)
    try:
        con.execute("INSTALL spatial; LOAD spatial;")
        county_size = build_counties_base(con, out_dir / "counties-base.svg")
        eco_l4_size = build_ecoregions_base(
            con,
            eco_l4_geojson_path,
            out_dir / "ecoregions-l4-base.svg",
            tolerance=ECO_L4_TOLERANCE,
            name_key="name",
        )
    finally:
        con.close()

    return {"counties": county_size, "ecoregions_l4": eco_l4_size}


def main() -> None:
    """Build coverage base-map SVG partials and print sizes."""
    print("Building coverage base-map SVG partials...")
    sizes = build_basemaps()
    print(
        f"Done — counties: {sizes['counties']:,} bytes, "
        f"ecoregions_l4: {sizes['ecoregions_l4']:,} bytes"
    )


if __name__ == "__main__":
    main()
