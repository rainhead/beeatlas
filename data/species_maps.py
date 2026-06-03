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

import colorsys
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
    ".checklist-county { fill: #b0cfe8; fill-opacity: 0.5; stroke: #888; stroke-width: 0.5; }\n"
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


def _load_county_geojsons(con: duckdb.DuckDBPyConnection) -> dict[str, dict]:
    """Fetch the WA county polygon set as a county_name -> GeoJSON dict mapping.

    D-02: state_fips comes from config (not hardcoded). MAP-03: uses
    ST_SimplifyPreserveTopology with tolerance 0.005 (vs. 0.001 in
    export.py — the smaller 600x320 viewport tolerates more simplification).

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


def _group_colors(canonical_names: list[str]) -> dict[str, str]:
    """Return a deterministic canonical_name -> '#rrggbb' mapping.

    D-01: Sort input alphabetically by canonical_name, assign evenly-spaced
    HSL hues (hue = i * 360 / n, lightness=0.5, saturation=0.7) via
    colorsys.hls_to_rgb, format as lowercase '#rrggbb'.

    Pure and deterministic: identical input always yields identical output,
    regardless of the order names are supplied. The sort order determines hue
    assignment — the alphabetically-first name always receives hue 0.
    """
    if not canonical_names:
        return {}
    sorted_names = sorted(canonical_names)
    n = len(sorted_names)
    result: dict[str, str] = {}
    for i, canon in enumerate(sorted_names):
        hue = i * 360.0 / n
        # Note: colorsys uses HLS order (hue, lightness, saturation), not HSL.
        r, g, b = colorsys.hls_to_rgb(hue / 360.0, 0.5, 0.7)
        hex_color = "#{:02x}{:02x}{:02x}".format(
            int(round(r * 255)),
            int(round(g * 255)),
            int(round(b * 255)),
        )
        result[canon] = hex_color
    return result


def _write_species_svg(
    slug: str,
    points: list[tuple[float, float]],
    checklist_counties: set[str],
    county_geojsons_by_name: dict[str, dict],
    backdrop: ET.Element,
    out_dir: Path,
) -> int:
    """Emit out_dir/<slug>.svg with county fills for checklist counties and
    one <circle class="occ"> per in-bbox occurrence point.

    County fills (class="checklist-county") are written BEFORE occurrence dots
    so dots render on top (SVG document order = z-order).

    Returns the number of points dropped because they fell outside WA_BBOX
    (MAP-04 — silent clip, never raise).
    """
    root = copy.deepcopy(backdrop)
    # 1. Draw checklist county fills BEFORE occurrence dots (SVG render order / Pitfall #4).
    for county_name, geom in county_geojsons_by_name.items():
        if county_name not in checklist_counties:
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
    # 2. Draw occurrence dots on top.
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
    out_path.parent.mkdir(parents=True, exist_ok=True)  # NEW: create Genus/ subdir
    out_path.write_text(
        ET.tostring(root, xml_declaration=True, encoding="unicode"),
        encoding="utf-8",
    )
    return clipped


def _write_group_svg(
    slug_path: str,
    species_points: dict[str, list[tuple[float, float]]],
    colors: dict[str, str],
    backdrop: ET.Element,
    out_dir: Path,
) -> int:
    """Emit out_dir/<slug_path>.svg with per-species colored circle groups.

    Each species gets a <g fill="{color}"> wrapper containing one <circle>
    per in-bbox occurrence point.  Species with no points are skipped (no
    empty <g> emitted).

    D-01: species are rendered in alphabetical canonical_name order so the
    hue assigned by _group_colors matches the visual rendering order in
    Phase 94 HTML swatches.

    Returns the total number of points dropped outside WA_BBOX (MAP-04).
    """
    root = copy.deepcopy(backdrop)
    clipped = 0
    for canon in sorted(species_points.keys()):
        pts = species_points[canon]
        in_bbox_pts = []
        for lon, lat in pts:
            if not _in_bbox(lon, lat):
                clipped += 1
            else:
                in_bbox_pts.append((lon, lat))
        if not in_bbox_pts:
            continue  # skip empty groups — no <g> emitted
        g = ET.SubElement(root, f"{{{SVG_NS}}}g", attrib={"fill": colors.get(canon, '#aaaaaa')})
        for lon, lat in in_bbox_pts:
            x, y = _project(lon, lat)
            ET.SubElement(
                g,
                f"{{{SVG_NS}}}circle",
                attrib={
                    "cx": f"{x:.2f}",
                    "cy": f"{y:.2f}",
                    "r": "2.5",
                },
            )
    # Idempotency: sort attribute dicts so ET.tostring emits stable byte output.
    for elem in root.iter():
        if elem.attrib:
            elem.attrib = dict(sorted(elem.attrib.items()))
    out_path = out_dir / f"{slug_path}.svg"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        ET.tostring(root, xml_declaration=True, encoding="unicode"),
        encoding="utf-8",
    )
    return clipped


def _generate_group_maps(
    con: duckdb.DuckDBPyConnection,
    occ_by_canon: dict[str, list[tuple[float, float]]],
    backdrop: ET.Element,
    maps_dir: Path,
) -> None:
    """Emit multi-color SVGs under maps_dir/{genus,subgenus,tribe,subfamily}/.

    Reads species.parquet for group membership; uses occ_by_canon
    for points (no second DB sweep). MUST NOT wipe maps_dir.

    D-02 coordination: species are rendered in alphabetical canonical_name
    order within each group — Phase 94's Eleventy template must use the same
    sort key for HTML swatch ordering so colors match the SVG dots.

    Subfamily maps (D-06): colored by GENUS (one color per genus), not by
    species — uses _group_colors over the sorted unique-genus list so colors
    match the genus-level swatches on the subfamily HTML page (Pitfall 2).
    """
    species_parquet = ASSETS_DIR / "species.parquet"
    if not species_parquet.exists():
        raise FileNotFoundError(
            f"{species_parquet} not found — run species-export STEP first"
        )

    rows = con.execute(
        f"""
        SELECT canonical_name, genus, subgenus, tribe, specific_epithet, subfamily
        FROM read_parquet('{species_parquet}')
        WHERE occurrence_count > 0 OR on_checklist = true
        ORDER BY canonical_name
        """
    ).fetchall()

    # Build group membership dicts.
    # unresolved: canonical_names with no species epithet (genus/subgenus/tribe-only IDs).
    genus_members: dict[str, list[str]] = defaultdict(list)
    subgenus_members: dict[tuple[str, str], list[str]] = defaultdict(list)
    tribe_members: dict[str, list[str]] = defaultdict(list)
    subfamily_members: dict[str, list[str]] = defaultdict(list)
    genus_of: dict[str, str] = {}  # canonical_name -> genus (for subfamily coloring, D-06)
    unresolved: set[str] = set()

    for canonical_name, genus, subgenus, tribe, specific_epithet, subfamily in rows:
        if specific_epithet is None:
            unresolved.add(canonical_name)
        if genus:
            genus_members[genus].append(canonical_name)
            genus_of[canonical_name] = genus
            # Subgenus null guard (PATTERNS observation #3): filter in Python,
            # not SQL, to catch both NULL and empty-string values.
            if subgenus is not None and subgenus.strip() != '':
                subgenus_members[(genus, subgenus)].append(canonical_name)
        if tribe:
            tribe_members[tribe].append(canonical_name)
        if subfamily:
            subfamily_members[subfamily].append(canonical_name)

    total_clipped = 0
    n_genus = 0
    n_subgenus = 0
    n_tribe = 0
    n_subfamily = 0

    _UNRESOLVED_COLOR = '#aaaaaa'

    # Unresolved records (specific_epithet IS NULL) are intentionally included in
    # group maps as grey dots — they show collection effort even when specimens
    # aren't identified to species. Per-species SVGs exclude them via SQL filter.

    # Genus maps: genus/<Genus>.svg
    genus_dir = maps_dir / "genus"
    for genus_name in sorted(genus_members.keys()):
        members = genus_members[genus_name]
        species_points = {c: occ_by_canon.get(c, []) for c in members}
        colors = _group_colors(members)
        for c in members:
            if c in unresolved:
                colors[c] = _UNRESOLVED_COLOR
        total_clipped += _write_group_svg(genus_name, species_points, colors, backdrop, genus_dir)
        n_genus += 1

    # Subgenus maps: subgenus/<Genus>/<Subgenus>.svg
    subgenus_dir = maps_dir / "subgenus"
    for (genus_name, subgenus_name) in sorted(subgenus_members.keys()):
        members = subgenus_members[(genus_name, subgenus_name)]
        species_points = {c: occ_by_canon.get(c, []) for c in members}
        colors = _group_colors(members)
        for c in members:
            if c in unresolved:
                colors[c] = _UNRESOLVED_COLOR
        slug_path = f"{genus_name}/{subgenus_name}"
        total_clipped += _write_group_svg(slug_path, species_points, colors, backdrop, subgenus_dir)
        n_subgenus += 1

    # Tribe maps: tribe/<Tribe>.svg
    tribe_dir = maps_dir / "tribe"
    for tribe_name in sorted(tribe_members.keys()):
        members = tribe_members[tribe_name]
        species_points = {c: occ_by_canon.get(c, []) for c in members}
        colors = _group_colors(members)
        for c in members:
            if c in unresolved:
                colors[c] = _UNRESOLVED_COLOR
        total_clipped += _write_group_svg(tribe_name, species_points, colors, backdrop, tribe_dir)
        n_tribe += 1

    # Subfamily maps: subfamily/<Subfamily>.svg  (colored by GENUS — D-06)
    # Eumeninae is naturally absent because species.parquet carries no Eumeninae
    # bee species (the data gate in int_species_universe excludes wasp bycatch).
    # Do NOT add county-fill logic here — group SVGs have none (Pitfall 6).
    subfamily_dir = maps_dir / "subfamily"
    for subfamily_name in sorted(subfamily_members.keys()):
        members = subfamily_members[subfamily_name]
        # Collect unique genera for this subfamily, sorted alphabetically.
        # The sort order MUST match what species.js uses for hslToHex so that
        # swatch colors on the page match dot colors on the map (Pitfall 2).
        genera_in_sf = sorted(set(genus_of[c] for c in members if c in genus_of))
        genus_colors = _group_colors(genera_in_sf)  # one color per genus
        # Map each species to its genus color; unresolved species -> _UNRESOLVED_COLOR
        colors = {}
        for c in members:
            if c in unresolved:
                colors[c] = _UNRESOLVED_COLOR
            else:
                colors[c] = genus_colors.get(genus_of.get(c, ''), _UNRESOLVED_COLOR)
        species_points = {c: occ_by_canon.get(c, []) for c in members}
        total_clipped += _write_group_svg(
            subfamily_name, species_points, colors, backdrop, subfamily_dir
        )
        n_subfamily += 1

    print(
        f"  species-maps/groups: {n_genus + n_subgenus + n_tribe + n_subfamily:,} files "
        f"({n_genus} genus, {n_subgenus} subgenus, {n_tribe} tribe, {n_subfamily} subfamily), "
        f"{total_clipped:,} total points clipped"
    )


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
            WHERE (occurrence_count > 0 OR on_checklist = true)
              AND specific_epithet IS NOT NULL
            ORDER BY canonical_name
            """
        ).fetchall()

        # Single sweep through occurrences — group by canonical_name in Python
        # so we never round-trip per species. Use the dbt mart (occurrences.parquet)
        # so both Ecdysis and iNat-only records are included, matching the main map.
        occurrences_parquet = ASSETS_DIR / "occurrences.parquet"
        if not occurrences_parquet.exists():
            raise FileNotFoundError(
                f"{occurrences_parquet} not found — run dbt before species-maps"
            )
        occ_rows = con.execute(
            f"""
            SELECT canonical_name, lon, lat
            FROM read_parquet('{occurrences_parquet}')
            WHERE canonical_name IS NOT NULL
              AND lat IS NOT NULL
              AND lon IS NOT NULL
            """
        ).fetchall()

        occ_by_canon: dict[str, list[tuple[float, float]]] = defaultdict(list)
        for canon, lon, lat in occ_rows:
            if lon is None or lat is None:
                continue
            occ_by_canon[canon].append((lon, lat))

        # Read checklist.parquet once into per-species county sets.
        checklist_counties_by_canon: dict[str, set[str]] = defaultdict(set)
        checklist_parquet = ASSETS_DIR / "checklist.parquet"
        if checklist_parquet.exists():
            cl_rows = con.execute(
                f"""
                SELECT canonical_name, county
                FROM read_parquet('{checklist_parquet}')
                WHERE canonical_name IS NOT NULL AND county IS NOT NULL
                """
            ).fetchall()
            for canon, county in cl_rows:
                checklist_counties_by_canon[canon].add(county)

        total_clipped = 0
        written = 0
        for canon, slug in species_rows:
            points = occ_by_canon.get(canon, [])
            checklist_counties = checklist_counties_by_canon.get(canon, set())
            clipped = _write_species_svg(
                slug, points, checklist_counties, county_geojsons, backdrop, maps_dir
            )
            if clipped:
                # MAP-04 + Pitfall #5: log silently, NEVER raise.
                print(f"  species-maps/{slug}.svg: {clipped} points clipped")
                total_clipped += clipped
            written += 1

        total_size = sum(p.stat().st_size for p in maps_dir.rglob('*.svg'))
        print(
            f"  species-maps/: {written:,} files, {total_size:,} bytes, "
            f"{total_clipped:,} total points clipped"
        )

        _generate_group_maps(con, occ_by_canon, backdrop, maps_dir)
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
