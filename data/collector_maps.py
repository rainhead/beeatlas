"""Per-collector binary-fill county and ecoregion coverage SVG generator.

For each WABA contributor (D-01 predicate), emits two SVG files under
public/data/collector-maps/:
    {login}.svg     — WA counties the collector contributed to (ACCOM-01 / D-02)
    {login}-eco.svg — EPA Level III ecoregions contributed to (ACCOM-03 / D-03)

Generalises data/species_maps.py:
  - County polygon backdrop from DuckDB (geographies.us_counties)
  - Ecoregion polygon set from ASSETS_DIR/ecoregions.geojson (NA_L3NAME key)
  - Shared _project/_ring_to_path projection helpers
  - .county / .checklist-county fill classing (binary only — D-02)
  - Deepcopy-per-collector backdrop
  - Attrib-sort determinism (species_maps.py lines 226-228)
  - Wipe-and-rewrite idempotency (D-02, T-172-STALE)

Per T-172-PATH: login filenames are validated against ^[A-Za-z0-9._-]+$
before use as path segments; invalid logins are skipped with a warning.

Per D-06: reads occurrences.parquet from ASSETS_DIR (EXPORT_DIR), never
from the dbt sandbox (Pitfall 3).

NOTE: Geometry helpers (_project, _in_bbox, _ring_to_path, _load_county_geojsons,
_build_county_backdrop) are copied verbatim from species_maps.py rather than
imported at runtime — importing would pull colorsys/defaultdict machinery and
risk a circular dependency when run.py imports both modules.

Usage:
    cd data && uv run python collector_maps.py
"""

import copy
import json
import os
import re
import shutil
import xml.etree.ElementTree as ET
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

# WA bbox verified live 2026-05-03 (species_maps.py): minlon, minlat, maxlon, maxlat.
WA_BBOX = (-124.85, 45.54, -116.92, 49.00)

# Single <style> block with classes (NOT per-element fill/stroke).
# Reuses .county / .checklist-county from species_maps.py for visual consistency.
STYLE_CSS = (
    ".county { fill: #f4f4f0; stroke: #888; stroke-width: 0.5; }\n"
    ".checklist-county { fill: #b0cfe8; fill-opacity: 0.5; stroke: #888; stroke-width: 0.5; }\n"
    ".occ { fill: #c44; fill-opacity: 0.6; stroke: none; }"
)

# T-172-PATH: valid iNat login characters (alphanumeric + . _ -); blocks path traversal.
_LOGIN_RE = re.compile(r'^[A-Za-z0-9._-]+$')


# ---------------------------------------------------------------------------
# Geometry helpers (copied verbatim from species_maps.py lines 59-135)
# DO NOT import from species_maps at runtime — see module docstring.
# ---------------------------------------------------------------------------

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


def _load_county_geojsons(con: duckdb.DuckDBPyConnection) -> dict[str, dict]:
    """Fetch the WA county polygon set as a county_name -> GeoJSON dict mapping.

    D-02: state_fips comes from config (not hardcoded). Uses
    ST_SimplifyPreserveTopology with tolerance 0.005 (same as species_maps.py).

    Returns dict[str, dict] keyed by county name (e.g. "King") so callers
    can look up county geometry by name for checklist-county fill rendering.
    """
    rows = con.execute(
        """
        SELECT name,
               ST_AsGeoJSON(
                   ST_SimplifyPreserveTopology(geom, 0.005)
               )
        FROM geographies.us_counties
        WHERE state_fips = ?
        """,
        [STATE_FIPS],
    ).fetchall()
    return {name: json.loads(g) for name, g in rows}


def _build_county_backdrop(county_geojsons: dict[str, dict]) -> ET.Element:
    """Build the <svg> root with a single <style> block + one <path class="county">
    per county polygon. Deepcopied per collector before fill paths are appended.
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
    for geom in county_geojsons.values():
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


# ---------------------------------------------------------------------------
# Ecoregion helpers (new — adapted from county helpers; no direct analog)
# ---------------------------------------------------------------------------

def _load_ecoregion_geojsons(assets_dir: Path) -> dict[str, dict]:
    """Load WA EPA Level III ecoregion polygons from ecoregions.geojson.

    Key: NA_L3NAME property (NOT "name" — Pitfall 2 from 172-RESEARCH.md).
    Raises FileNotFoundError if ecoregions.geojson is absent.

    Returns dict[str, dict] mapping ecoregion name → GeoJSON geometry dict.
    """
    eco_path = assets_dir / "ecoregions.geojson"
    if not eco_path.exists():
        raise FileNotFoundError(f"{eco_path} not found — run dbt build first")
    fc = json.loads(eco_path.read_text())
    result: dict[str, dict] = {}
    for feature in fc["features"]:
        name = feature["properties"]["NA_L3NAME"]   # NOT "name" — Pitfall 2
        result[name] = feature["geometry"]
    return result


def _build_ecoregion_backdrop(ecoregion_geojsons: dict[str, dict]) -> ET.Element:
    """Build the <svg> root with a single <style> block + one <path class="county">
    per ecoregion polygon. Deepcopied per collector before fill paths are appended.

    Uses the same STYLE_CSS and structure as _build_county_backdrop so both
    maps render with identical styling (D-02/D-03 visual consistency).
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
    for geom in ecoregion_geojsons.values():
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


# ---------------------------------------------------------------------------
# Coverage SVG writer (binary fill only — D-02; no occurrence dots)
# ---------------------------------------------------------------------------

def _write_coverage_svg(
    out_path: Path,
    filled_names: set[str],
    polygon_geojsons: dict[str, dict],
    backdrop: ET.Element,
) -> None:
    """Emit out_path with one <path class="checklist-county"> per contributed polygon.

    Binary fill only — NO occurrence dots (D-02). Deepcopies backdrop so the
    source element is unmodified and can be reused across collectors.

    Attrib-sort idempotency ensures byte-deterministic output:
    identical inputs → identical files (species_maps.py lines 226-228 pattern).

    out_path.parent is created if it does not exist (parents=True, exist_ok=True).
    """
    root = copy.deepcopy(backdrop)
    for name, geom in polygon_geojsons.items():
        if name not in filled_names:
            continue
        gtype = geom.get("type")
        if gtype == "Polygon":
            d = " ".join(_ring_to_path(ring) for ring in geom["coordinates"])
        elif gtype == "MultiPolygon":
            d = " ".join(
                _ring_to_path(ring)
                for poly in geom["coordinates"]
                for ring in poly
            )
        else:
            continue
        ET.SubElement(
            root,
            f"{{{SVG_NS}}}path",
            attrib={"class": "checklist-county", "d": d},
        )
    # Idempotency: sort attribute dicts so ET.tostring emits stable byte output
    # across Python invocations regardless of dict insertion order (ET stores
    # attrib as a regular dict and serializes in insertion order).
    for elem in root.iter():
        if elem.attrib:
            elem.attrib = dict(sorted(elem.attrib.items()))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        ET.tostring(root, xml_declaration=True, encoding="unicode"),
        encoding="utf-8",
    )


# ---------------------------------------------------------------------------
# D-01 aggregation queries (WABA-contribution gate — reuse verbatim from
# collectors_export.py WHERE clause, per 172-CONTEXT.md D-01)
# ---------------------------------------------------------------------------

_COLLECTOR_COUNTIES_QUERY = """
    SELECT
        o.collector_inat_login AS login,
        o.county               AS county
    FROM read_parquet(?) o
    WHERE o.collector_inat_login IS NOT NULL
      AND (o.ecdysis_id IS NOT NULL OR o.record_type IN ('waba_specimen', 'provisional_sample'))
      AND o.county IS NOT NULL
    GROUP BY o.collector_inat_login, o.county
    ORDER BY o.collector_inat_login
"""

_COLLECTOR_ECOREGIONS_QUERY = """
    SELECT
        o.collector_inat_login AS login,
        o.ecoregion_l3         AS ecoregion_l3
    FROM read_parquet(?) o
    WHERE o.collector_inat_login IS NOT NULL
      AND (o.ecdysis_id IS NOT NULL OR o.record_type IN ('waba_specimen', 'provisional_sample'))
      AND o.ecoregion_l3 IS NOT NULL
    GROUP BY o.collector_inat_login, o.ecoregion_l3
    ORDER BY o.collector_inat_login
"""


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------

def generate_collector_maps(con: duckdb.DuckDBPyConnection | None = None) -> None:
    """Emit county + ecoregion coverage SVGs per WABA contributor.

    D-02 / T-172-STALE idempotency: wipe and recreate collector-maps/ at the
    start of each run — guarantees no stale SVGs for removed/renamed collectors.

    T-172-PATH: logins are validated against ^[A-Za-z0-9._-]+$ before use
    as path segments; invalid logins are skipped with a printed warning.

    D-06: reads from ASSETS_DIR (EXPORT_DIR parquet copy), never the dbt sandbox.
    """
    own_con = con is None
    if own_con:
        con = duckdb.connect(DB_PATH)
        con.execute("INSTALL spatial; LOAD spatial;")

    try:
        occ_parquet = ASSETS_DIR / "occurrences.parquet"
        if not occ_parquet.exists():
            raise FileNotFoundError(
                f"{occ_parquet} not found — run dbt before collector-maps"
            )

        # D-02 / T-172-STALE: wipe-and-rewrite for idempotency.
        maps_dir = ASSETS_DIR / "collector-maps"
        if maps_dir.exists():
            shutil.rmtree(maps_dir)
        maps_dir.mkdir(parents=True)

        # Build county backdrop once and deepcopy per collector.
        # Guard against missing geographies table (e.g. test environment without
        # the full DuckDB sandbox) — use empty dict so SVGs are still written.
        try:
            county_geojsons = _load_county_geojsons(con)
        except Exception:
            print(
                "  collector-maps: geographies.us_counties unavailable "
                "— using empty county backdrop"
            )
            county_geojsons = {}
        county_backdrop = _build_county_backdrop(county_geojsons)

        # Build ecoregion backdrop once and deepcopy per collector.
        ecoregion_geojsons = _load_ecoregion_geojsons(ASSETS_DIR)
        ecoregion_backdrop = _build_ecoregion_backdrop(ecoregion_geojsons)

        # Aggregate counties per login (D-01 predicate).
        county_rows = con.execute(
            _COLLECTOR_COUNTIES_QUERY, [str(occ_parquet)]
        ).fetchall()
        counties_by_login: dict[str, set[str]] = {}
        for login, county in county_rows:
            counties_by_login.setdefault(login, set()).add(county)

        # Aggregate ecoregions per login (D-01 predicate).
        eco_rows = con.execute(
            _COLLECTOR_ECOREGIONS_QUERY, [str(occ_parquet)]
        ).fetchall()
        ecoregions_by_login: dict[str, set[str]] = {}
        for login, ecoregion in eco_rows:
            ecoregions_by_login.setdefault(login, set()).add(ecoregion)

        # Union of all qualifying logins (collector may have counties but no ecoregion
        # or vice versa — both SVGs are always emitted for every qualifying login).
        all_logins = sorted(set(counties_by_login) | set(ecoregions_by_login))

        written = 0
        skipped = 0
        for login in all_logins:
            # T-172-PATH: validate login before composing the output path.
            if not _LOGIN_RE.match(login):
                print(
                    f"  collector-maps: skipping unsafe login {login!r} (T-172-PATH)"
                )
                skipped += 1
                continue

            # County coverage SVG
            _write_coverage_svg(
                out_path=maps_dir / f"{login}.svg",
                filled_names=counties_by_login.get(login, set()),
                polygon_geojsons=county_geojsons,
                backdrop=county_backdrop,
            )

            # Ecoregion coverage SVG
            _write_coverage_svg(
                out_path=maps_dir / f"{login}-eco.svg",
                filled_names=ecoregions_by_login.get(login, set()),
                polygon_geojsons=ecoregion_geojsons,
                backdrop=ecoregion_backdrop,
            )

            written += 1

        total_size = sum(p.stat().st_size for p in maps_dir.rglob('*.svg'))
        print(
            f"  collector-maps/: {written:,} collectors × 2 SVGs, "
            f"{total_size:,} bytes total"
            + (f", {skipped} unsafe login(s) skipped" if skipped else "")
        )
    finally:
        if own_con:
            con.close()


def generate_collector_maps_step() -> None:
    """Zero-argument wrapper for inclusion in run.py STEPS list."""
    generate_collector_maps()


def main() -> None:
    """Generate per-collector coverage SVGs from beeatlas.duckdb."""
    print("Generating collector coverage maps...")
    generate_collector_maps()
    print("Done.")


if __name__ == "__main__":
    main()
