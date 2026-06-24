"""Add 14 hand-curated WTA hikes as buffered-corridor [[places]] entries.

Source: OpenStreetMap via the Overpass API (license-clean).
  - WTA ToS prohibits programmatic reproduction of site content and WTA offers
    NO geometry data — do NOT fetch trail geometry from the WTA website.
  - Trail geometry © OpenStreetMap contributors (ODbL), via Overpass API.

Geometry: each trail's centerline (acquired from OSM or a GPX fallback) is
buffered ~250 m in UTM Zone 10N (EPSG:32610, a metric CRS), simplified for
browser weight, and projected back to WGS84.

Phase 160 made place membership many-to-many (occurrence_places bridge), so
hike corridors that overlap WDFW areas or national forests load cleanly as
multi-place membership — NO overlap handling is needed or performed here.

Run: cd data && uv run python add_hikes_as_places.py
"""

import re
import tomllib
import xml.etree.ElementTree as ET
from pathlib import Path

import duckdb
import requests

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OVERPASS_HEADERS = {"User-Agent": "BeeAtlas/1.0 (https://github.com/rainhead/beeatlas; data curation script)"}
TOML_PATH = Path(__file__).parent.parent / "content" / "places.toml"
BUFFER_M = 250.0
TOL_DEG = 0.0002  # ST_SimplifyPreserveTopology tolerance in degrees (~22 m at WA latitudes)
METRIC_CRS = "EPSG:32610"  # UTM Zone 10N (meters); all 14 WTA hikes lon < -120°.
                            # Hikes east of -120° would need EPSG:32611 — a future-phase concern.
WA_BBOX = (45.5, -124.8, 49.0, -116.9)  # (south, west, north, east)

GPX_NS = "http://www.topografix.com/GPX/1/1"

HIKES: list[dict] = [
    {
        "slug": "boulder-de-roux-trail",
        "name": "Boulder–De Roux",
        "land_owner": "USDA Forest Service — Okanogan-Wenatchee National Forest",
        "osm_relation_id": 5634553,
    },
    {
        "slug": "fortune-creek-pass-trail",
        "name": "Fortune Creek Pass",
        "land_owner": "USDA Forest Service — Okanogan-Wenatchee National Forest",
        "osm_relation_id": 14367348,
    },
    # DEFERRED 2026-06-23 — OSM only has the full PCT Section J (relation 1296807,
    # ~75 km I-90→Stevens Pass), which over-claims ~9× vs the ~8 km day-hike to
    # Olallie Meadow. Needs a hand-traced GPX to the Olallie Meadow turnaround.
    # {
    #     "slug": "snoqualmie-pass-to-olallie-meadow-trail",
    #     "name": "Snoqualmie Pass to Olallie Meadow",
    #     "land_owner": "USDA Forest Service — Mt. Baker-Snoqualmie National Forest",
    #     "osm_relation_id": 1296807,
    #     "gpx_path": "data/fixtures/hike-gpx/snoqualmie-pass-to-olallie-meadow.gpx",
    # },
    {
        "slug": "iron-peak-trail",
        "name": "Iron Peak",
        "land_owner": "USDA Forest Service — Okanogan-Wenatchee National Forest",
        "osm_relation_id": 5625967,
    },
    {
        "slug": "naches-peak-loop-trail",
        "name": "Naches Peak Loop",
        "land_owner": "National Park Service / USDA Forest Service",
        "osm_relation_id": 5194432,
    },
    {
        "slug": "geyser-valley-trail",
        "name": "Geyser Valley",
        "land_owner": "National Park Service — Olympic National Park",
        # Single named way in Olympic NP; narrow bbox to stay within Overpass resource limits.
        "osm_name_query": "Geyser Valley Trail",
        "bbox": (47.9, -123.6, 48.0, -123.5),
        "gpx_path": "data/fixtures/hike-gpx/geyser-valley.gpx",
    },
    {
        "slug": "deception-pass-goose-rock-trail",
        "name": "Deception Pass–Goose Rock",
        "land_owner": "Washington State Parks",
        # WA_BBOX is too large for Overpass geom queries; narrow to Deception Pass area.
        "osm_name_query": "Goose Rock",
        "bbox": (48.3, -122.7, 48.5, -122.5),
    },
    {
        "slug": "perry-creek-trail",
        "name": "Perry Creek",
        "land_owner": "USDA Forest Service — Mt. Baker-Snoqualmie National Forest",
        "osm_relation_id": 5537840,
    },
    {
        "slug": "big-four-ice-caves-trail",
        "name": "Big Four Ice Caves",
        "land_owner": "USDA Forest Service — Mt. Baker-Snoqualmie National Forest",
        "osm_relation_id": 5537839,
    },
    {
        "slug": "umtanum-creek-canyon-trail",
        "name": "Umtanum Creek Canyon",
        "land_owner": "Bureau of Land Management",
        # Yakima Canyon area; narrow bbox avoids Overpass resource limits on WA_BBOX.
        "osm_name_query": "Umtanum Creek Trail",
        "bbox": (46.7, -120.9, 47.0, -120.4),
    },
    {
        "slug": "catherine-creek-loop-trail",
        "name": "Catherine Creek Loop",
        "land_owner": "USDA Forest Service — Columbia River Gorge NSA",
        # OSM relations 9210173 (South Loop) + 10542427 (North Loop) cover the combined loop.
        # Use the South Loop relation as primary (larger/more representative).
        "osm_relation_id": 9210173,
    },
    {
        "slug": "icicle-gorge-loop-trail",
        "name": "Icicle Gorge Loop",
        "land_owner": "USDA Forest Service — Okanogan-Wenatchee National Forest",
        "osm_relation_id": 5597767,
    },
    {
        "slug": "monte-cristo-trail",
        "name": "Monte Cristo",
        "land_owner": "USDA Forest Service — Mt. Baker-Snoqualmie National Forest",
        "osm_relation_id": 5537812,
    },
    {
        "slug": "tomyhoi-lake-trail",
        "name": "Tomyhoi Lake",
        "land_owner": "USDA Forest Service — Mt. Baker-Snoqualmie National Forest",
        "osm_relation_id": 4830238,
    },
]


def linestring_to_corridor_wkt(
    linestring_wkt: str,
    buffer_m: float = BUFFER_M,
    tol_deg: float = TOL_DEG,
    metric_crs: str = METRIC_CRS,
) -> str:
    """Buffer a WGS84 LineString by buffer_m meters, returning a MULTIPOLYGON WKT.

    Steps:
      1. Project to metric CRS (always_xy=true REQUIRED for DuckDB 1.5.3)
      2. ST_Buffer in meters
      3. Project back to WGS84 (always_xy=true REQUIRED)
      4. ST_MakeValid (defensive; buffer on sinuous trails can create topology errors)
      5. ST_SimplifyPreserveTopology at tol_deg
      6. ST_Multi (ensure MULTIPOLYGON type for pipeline consistency)

    CRITICAL: always_xy=true (4th arg to ST_Transform) is REQUIRED on BOTH transforms.
    Without it, DuckDB 1.5.3 returns POINT(inf inf) SILENTLY because PROJ interprets
    EPSG:4326 axis order as lat/lon by default.

    Args:
        linestring_wkt: WGS84 WKT LINESTRING, e.g. "LINESTRING(-120.5 47.0, -120.4 47.1)"
        buffer_m: Buffer distance in meters.
        tol_deg: Simplification tolerance in degrees (~22 m at WA latitudes for 0.0002).
        metric_crs: EPSG code string for the metric projection. Default UTM Zone 10N.

    Returns:
        WKT string starting with "MULTIPOLYGON".

    Raises:
        ValueError: if the result is null, non-MULTIPOLYGON, or geometrically invalid.
    """
    con = duckdb.connect(":memory:")
    con.execute("LOAD spatial")
    row = con.execute(
        """
        SELECT ST_AsText(
            ST_Multi(
                ST_SimplifyPreserveTopology(
                    ST_MakeValid(
                        ST_Transform(
                            ST_Buffer(
                                ST_Transform(
                                    ST_GeomFromText(?),
                                    'EPSG:4326', ?, true     -- always_xy=true: REQUIRED
                                ),
                                ?
                            ),
                            ?, 'EPSG:4326', true             -- always_xy=true: REQUIRED
                        )
                    ),
                    ?
                )
            )
        )
        """,
        [linestring_wkt, metric_crs, buffer_m, metric_crs, tol_deg],
    ).fetchone()
    wkt = row[0] if row else None
    if not wkt or not wkt.startswith("MULTIPOLYGON"):
        raise ValueError(
            f"Buffer produced non-MULTIPOLYGON geometry: {wkt!r}. "
            f"Check always_xy=true and CRS selection (metric_crs={metric_crs!r})."
        )
    # Defensive validity check
    is_valid = con.execute("SELECT ST_IsValid(ST_GeomFromText(?))", [wkt]).fetchone()[0]
    if not is_valid:
        raise ValueError(f"Buffer result is geometrically invalid: {wkt[:80]!r}")
    return wkt


def fetch_osm_relation_geometry(relation_id: int) -> dict:
    """Fetch full member-way geometry for an OSM relation via Overpass.

    Uses `(._;>;); out geom;` to include node geometries for all member ways.

    Args:
        relation_id: OSM relation ID (integer).

    Returns:
        Overpass JSON response dict with an 'elements' list.

    Raises:
        requests.HTTPError: if the HTTP request fails.
        RuntimeError: if Overpass returns an empty elements list.
    """
    query = f"""
[out:json][timeout:30];
relation({relation_id});
(._;>;);
out geom;
"""
    r = requests.post(OVERPASS_URL, headers=OVERPASS_HEADERS, data={"data": query}, timeout=60)
    r.raise_for_status()
    response = r.json()
    elements = response.get("elements", [])
    if not elements:
        raise RuntimeError(
            f"Overpass returned zero elements for relation {relation_id}. "
            "The relation may not exist or the API returned an error/remark body."
        )
    return response


def fetch_osm_ways_by_name(name_pattern: str, bbox: tuple) -> list[dict]:
    """Fetch trail-type ways and hiking relations matching a name pattern within a bbox.

    The highway filter restricts to trail-type ways to avoid roads/buildings
    sharing the same name (Pitfall 3).

    Args:
        name_pattern: Regex pattern for the OSM name tag (case-insensitive).
        bbox: (south, west, north, east) in WGS84 degrees.

    Returns:
        List of Overpass element dicts (ways and relations).

    Raises:
        requests.HTTPError: if the HTTP request fails.
        RuntimeError: if Overpass returns zero elements.
    """
    s, w, n, e = bbox
    query = f"""
[out:json][timeout:30];
(
  way["name"~"{name_pattern}",i]["highway"~"^(path|footway|bridleway|track)$"]({s},{w},{n},{e});
  relation["name"~"{name_pattern}",i]["route"="hiking"]({s},{w},{n},{e});
);
out geom;
"""
    r = requests.post(OVERPASS_URL, headers=OVERPASS_HEADERS, data={"data": query}, timeout=60)
    r.raise_for_status()
    response = r.json()
    elements = response.get("elements", [])
    if not elements:
        raise RuntimeError(
            f"Overpass returned zero elements for name pattern {name_pattern!r} "
            f"in bbox {bbox}. The trail may not be in OSM or the pattern is incorrect."
        )
    return elements


def osm_relation_to_linestring_wkt(overpass_response: dict) -> str:
    """Extract ordered coordinates from an Overpass relation response as LINESTRING WKT.

    Collects member ways in member order, concatenates their geometry (lon, lat)
    node coords, and drops duplicate endpoints between consecutive ways.
    Way ordering and minor gaps are tolerated — the ST_Buffer of a (MULTI)LINESTRING
    is the union corridor regardless of segment order (Pitfall 2).

    Args:
        overpass_response: Overpass JSON response dict (from fetch_osm_relation_geometry).

    Returns:
        "LINESTRING(lon lat, ...)" WKT string.

    Raises:
        ValueError: if no relation or fewer than 2 coords are found.
    """
    elements = {e["id"]: e for e in overpass_response.get("elements", [])}
    relations = [e for e in overpass_response["elements"] if e["type"] == "relation"]
    if not relations:
        raise ValueError("No relation element found in Overpass response")
    relation = relations[0]

    coords: list[tuple[float, float]] = []
    for member in relation.get("members", []):
        if member["type"] != "way":
            continue
        way = elements.get(member["ref"])
        if not way or "geometry" not in way:
            continue
        way_coords = [(pt["lon"], pt["lat"]) for pt in way["geometry"]]
        # Drop duplicate endpoint between consecutive ways
        if coords and coords[-1] == way_coords[0]:
            way_coords = way_coords[1:]
        coords.extend(way_coords)

    if len(coords) < 2:
        raise ValueError(
            f"Relation {relations[0].get('id')} produced fewer than 2 coordinate points"
        )

    return "LINESTRING(" + ", ".join(f"{lon} {lat}" for lon, lat in coords) + ")"


def osm_ways_to_linestring_wkt(elements: list[dict]) -> str:
    """Assemble standalone named ways into a MULTILINESTRING WKT.

    For standalone named ways (no relation), each way becomes a segment of the
    MULTILINESTRING. The ST_Buffer of a MULTILINESTRING is the union corridor —
    correct and gap-tolerant.

    Args:
        elements: List of Overpass element dicts (ways and/or relations).

    Returns:
        "MULTILINESTRING((lon lat, ...), ...)" WKT string.

    Raises:
        ValueError: if zero usable ways are found.
    """
    # Prefer relations with geometry (they may come back from fetch_osm_ways_by_name)
    relations = [e for e in elements if e.get("type") == "relation" and e.get("members")]
    if relations:
        # Use the first relation's members to build a linestring
        # Build a synthetic response dict for osm_relation_to_linestring_wkt
        all_elements_by_id = {e["id"]: e for e in elements}
        # Collect way geometries from the relation members
        best_relation = relations[0]
        segments: list[str] = []
        for member in best_relation.get("members", []):
            if member.get("type") != "way":
                continue
            way = all_elements_by_id.get(member["ref"])
            if not way or "geometry" not in way:
                continue
            seg_coords = [(pt["lon"], pt["lat"]) for pt in way["geometry"]]
            if len(seg_coords) >= 2:
                segments.append(
                    "(" + ", ".join(f"{lon} {lat}" for lon, lat in seg_coords) + ")"
                )
        if segments:
            return "MULTILINESTRING(" + ", ".join(segments) + ")"

    # Fall back to standalone ways
    usable_ways = [
        e for e in elements
        if e.get("type") == "way" and e.get("geometry") and len(e["geometry"]) >= 2
    ]
    if not usable_ways:
        raise ValueError(
            "No usable way geometries found in Overpass elements. "
            "The trail may not be mapped in OSM."
        )
    segments = []
    for way in usable_ways:
        seg_coords = [(pt["lon"], pt["lat"]) for pt in way["geometry"]]
        segments.append(
            "(" + ", ".join(f"{lon} {lat}" for lon, lat in seg_coords) + ")"
        )
    return "MULTILINESTRING(" + ", ".join(segments) + ")"


def gpx_to_linestring_wkt(gpx_path: str) -> str:
    """Parse a GPX file and return a WGS84 LINESTRING WKT from track points.

    Reads all <trkpt> elements regardless of track/segment nesting.
    GPX uses (lat, lon) attributes; WKT LINESTRING uses (lon lat) order.

    Args:
        gpx_path: Path to the GPX file (absolute or relative to cwd).

    Returns:
        "LINESTRING(lon lat, ...)" WKT string.

    Raises:
        ValueError: if no <trkpt> elements are found.
    """
    tree = ET.parse(gpx_path)
    root = tree.getroot()
    trkpts = root.findall(f".//{{{GPX_NS}}}trkpt")
    if not trkpts:
        raise ValueError(f"No <trkpt> elements found in {gpx_path!r}")
    coords = [(float(pt.attrib["lon"]), float(pt.attrib["lat"])) for pt in trkpts]
    return "LINESTRING(" + ", ".join(f"{lon} {lat}" for lon, lat in coords) + ")"


def geometry_for_hike(hike: dict) -> str:
    """Dispatch on the hike's source key to acquire a WGS84 (MULTI)LINESTRING WKT.

    Preference order: osm_relation_id > osm_name_query > osm_ways > gpx_path.
    For the 2 GAP hikes (Snoqualmie-Olallie and Geyser Valley), the OSM source
    is attempted first; if it fails, the gpx_path fallback is used.

    Args:
        hike: A dict from HIKES with slug, name, land_owner, and a source key.

    Returns:
        WGS84 WKT string (LINESTRING or MULTILINESTRING).

    Raises:
        RuntimeError: if no usable geometry can be obtained from any source.
    """
    slug = hike["slug"]
    osm_error: Exception | None = None

    if "osm_relation_id" in hike:
        response = fetch_osm_relation_geometry(hike["osm_relation_id"])
        return osm_relation_to_linestring_wkt(response)

    if "osm_name_query" in hike:
        try:
            # Use per-hike bbox if provided; WA_BBOX is too large for out geom queries on
            # high-density trail networks and causes Overpass to return empty results.
            bbox = hike.get("bbox", WA_BBOX)
            elements = fetch_osm_ways_by_name(hike["osm_name_query"], bbox)
            return osm_ways_to_linestring_wkt(elements)
        except (RuntimeError, ValueError) as exc:
            osm_error = exc

    if "osm_ways" in hike:
        try:
            # osm_ways is a list of name patterns to try
            bbox = hike.get("bbox", WA_BBOX)
            for name_pattern in hike["osm_ways"]:
                try:
                    elements = fetch_osm_ways_by_name(name_pattern, bbox)
                    return osm_ways_to_linestring_wkt(elements)
                except (RuntimeError, ValueError):
                    continue
        except Exception as exc:
            osm_error = exc

    # GPX fallback (only for hikes that have a gpx_path)
    if "gpx_path" in hike:
        gpx_path = hike["gpx_path"]
        if Path(gpx_path).exists():
            return gpx_to_linestring_wkt(gpx_path)
        # GPX file doesn't exist yet — not an error at this stage
        raise RuntimeError(
            f"GAP: no usable geometry for {slug!r}. "
            f"OSM source failed ({osm_error}); "
            f"GPX fallback file not found: {gpx_path!r}. "
            "Hand-trace the route and commit the GPX file to resolve."
        )

    raise RuntimeError(
        f"GAP: no usable geometry for {slug!r}. "
        f"OSM source failed ({osm_error}). "
        "Add a gpx_path key or fix the OSM source."
    )


def _toml_escape(s: str) -> str:
    """Escape special characters for a TOML basic string.

    Hike names may contain em-dashes and en-dashes (valid UTF-8 in TOML basic
    strings). Only backslashes and double-quotes require escaping.
    """
    return s.replace("\\", "\\\\").replace('"', '\\"')


def toml_block(slug: str, name: str, land_owner: str, wkt: str, permits: list[dict]) -> str:
    """Emit a [[places]] TOML block.

    Reused from data/add_wdfw_wildlife_areas.py:152-176 (verbatim structure).
    """
    if permits:
        parts = []
        for p in permits:
            kv = ", ".join(f'{k} = "{v}"' for k, v in p.items())
            parts.append(f"  {{ {kv} }}")
        permits_line = "permits = [\n" + "\n".join(parts) + "\n]"
    else:
        permits_line = "permits = []"

    return f"""
[[places]]
slug        = "{slug}"
name        = "{_toml_escape(name)}"
land_owner  = "{_toml_escape(land_owner)}"
geometry_wkt = \"\"\"
{wkt}
\"\"\"
{permits_line}
"""


def main() -> None:
    """Orchestrate OSM/GPX geometry acquisition, metric buffer, and TOML append.

    For each hike in HIKES:
      - Skip if the slug is already present in places.toml (idempotent).
      - Acquire geometry from OSM (Overpass) or GPX fallback.
      - Buffer ~250 m in UTM Zone 10N -> MULTIPOLYGON WKT.
      - Collect the TOML block.
      - If geometry is unavailable, record the slug in a gaps list (tracked,
        never silently dropped) — the run continues for remaining hikes.

    After the loop, appends all collected blocks and round-trip validates with
    tomllib. Exits 0 even with gaps (Plan 02 resolves them).
    """
    existing_text = TOML_PATH.read_text(encoding="utf-8")

    added = 0
    skipped = 0
    blocks: list[str] = []
    slugs_added: list[str] = []
    gaps: list[tuple[str, str]] = []  # (slug, reason)

    for hike in HIKES:
        slug = hike["slug"]
        if f'slug        = "{slug}"' in existing_text:
            print(f"  SKIP {slug} (already present)")
            skipped += 1
            continue

        print(f"  Processing {slug}...")
        try:
            geom_wkt = geometry_for_hike(hike)
            wkt = linestring_to_corridor_wkt(geom_wkt)
            blocks.append(toml_block(slug, hike["name"], hike["land_owner"], wkt, []))
            print(f"  ADD {slug}")
            slugs_added.append(slug)
            added += 1
        except Exception as exc:
            reason = str(exc)
            gaps.append((slug, reason))
            print(f"  GAP {slug}: {reason}")

    if blocks:
        with open(TOML_PATH, "a", encoding="utf-8") as f:
            for block in blocks:
                f.write(block)
        # Defense in depth: confirm the appended blocks re-parse as valid TOML.
        tomllib.loads(TOML_PATH.read_text(encoding="utf-8"))
        print(f"\nTOML round-trip validation passed.")

    print(f"\nDone: {added} added, {skipped} skipped")
    if slugs_added:
        print("Slugs added:")
        for s in slugs_added:
            print(f"  {s}")
    if gaps:
        print(f"\nGAPS ({len(gaps)} hikes could not be resolved — resolve in Plan 02):")
        for gap_slug, gap_reason in gaps:
            print(f"  {gap_slug}: {gap_reason}")
    else:
        print("\nNo gaps — all hikes resolved.")


if __name__ == "__main__":
    main()
