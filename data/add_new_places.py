"""Add 5 new survey sites to content/places.toml.

Sources:
  - PAD-US (USGS): Cowiche Canyon Conservancy, Padilla Bay NERR, Columbia Land Trust
  - OSM Nominatim: Lewis Creek Park, Lummi Island (proxy for LIHT — no parcel data in public GIS)

Permits (all site-level):
  - Cowiche Canyon Conservancy: letter Jul 2025, no expiration
  - Lummi Island Heritage Trust: email Apr 2025, no expiration
  - Padilla Bay NERR: WA Dept. of Ecology, expires 2036
  - Columbia Land Trust: letter Jun 2024, expires 2029
  - Lewis Creek Park (City of Bellevue): memo Mar 2026, CY 2026 only

Run: cd data && uv run --with shapely python add_new_places.py
"""
import time
from pathlib import Path
import requests
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import unary_union
from shapely import wkt as swkt

TOML_PATH = Path(__file__).parent.parent / "content" / "places.toml"
PADUS_URL = "https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/Manager_Name_PADUS/FeatureServer/0"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_HEADERS = {"User-Agent": "BeeAtlas/1.0 (rainhead@gmail.com)"}


def fetch_padus(where: str, label: str) -> str | None:
    print(f"  Fetching PAD-US: {label}")
    r = requests.get(PADUS_URL + "/query", params={
        "where": where,
        "outFields": "Unit_Nm,GIS_Acres",
        "returnGeometry": "true",
        "outSR": "4326",
        "f": "json",
        "resultRecordCount": 50,
    }, timeout=30)
    feats = r.json().get("features", [])
    if not feats:
        print(f"    NOT FOUND")
        return None
    geoms = []
    for f in feats:
        g = f.get("geometry", {})
        rings = g.get("rings", [])
        polys = [Polygon(ring) for ring in rings if len(ring) >= 4]
        if polys:
            geoms.append(MultiPolygon(polys) if len(polys) > 1 else polys[0])
            print(f"    acres={f['attributes'].get('GIS_Acres')}")
    if not geoms:
        return None
    merged = unary_union(geoms)
    simplified = merged.simplify(0.001, preserve_topology=True)
    wkt_str = swkt.dumps(simplified, rounding_precision=6)
    print(f"    OK: {simplified.geom_type}, WKT len={len(wkt_str)}")
    return wkt_str


def fetch_nominatim(query: str, label: str) -> str | None:
    print(f"  Fetching Nominatim: {label}")
    r = requests.get(NOMINATIM_URL, params={
        "q": query, "format": "json", "limit": 3, "polygon_geojson": 1,
    }, headers=NOMINATIM_HEADERS, timeout=15)
    from shapely.geometry import shape
    for result in r.json():
        geojson = result.get("geojson", {})
        if geojson.get("type") in ("Polygon", "MultiPolygon"):
            geom = shape(geojson)
            simplified = geom.simplify(0.001, preserve_topology=True)
            wkt_str = swkt.dumps(simplified, rounding_precision=6)
            print(f"    OK: {result.get('display_name')!r}, WKT len={len(wkt_str)}")
            return wkt_str
    print(f"    NOT FOUND")
    return None


def toml_block(slug: str, name: str, land_owner: str, wkt: str, permits: list[dict]) -> str:
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
name        = "{name}"
land_owner  = "{land_owner}"
geometry_wkt = \"\"\"
{wkt}
\"\"\"
{permits_line}
"""


def main() -> None:
    print("Fetching boundaries...")

    cowiche = fetch_padus(
        "Unit_Nm='Cowiche Canyon Conservancy' AND State_Nm='WA'",
        "Cowiche Canyon Conservancy",
    )
    time.sleep(0.5)

    padilla = fetch_padus(
        "Unit_Nm='Padilla Bay National Estuarine Research Reserve'",
        "Padilla Bay NERR",
    )
    time.sleep(0.5)

    clt = fetch_padus(
        "Unit_Nm='Columbia Land Trust' AND State_Nm='WA'",
        "Columbia Land Trust",
    )
    time.sleep(0.5)

    lewis = fetch_nominatim(
        "Lewis Creek Park Bellevue Washington",
        "Lewis Creek Park",
    )
    time.sleep(1.1)  # Nominatim rate limit: 1 req/sec

    lummi = fetch_nominatim(
        "Lummi Island Whatcom County Washington",
        "Lummi Island (LIHT proxy)",
    )

    places = [
        (
            "cowiche-canyon-conservancy",
            "Cowiche Canyon Conservancy",
            "Cowiche Canyon Conservancy",
            cowiche,
            [{"issuing_authority": "Cowiche Canyon Conservancy", "type": "site-level"}],
        ),
        (
            "padilla-bay-nerr",
            "Padilla Bay National Estuarine Research Reserve",
            "Washington Department of Ecology",
            padilla,
            [{"issuing_authority": "Washington Department of Ecology", "type": "site-level"}],
        ),
        (
            "columbia-land-trust",
            "Columbia Land Trust",
            "Columbia Land Trust",
            clt,
            [{"issuing_authority": "Columbia Land Trust", "type": "site-level"}],
        ),
        (
            "lewis-creek-park",
            "Lewis Creek Park",
            "City of Bellevue",
            lewis,
            [{"issuing_authority": "City of Bellevue", "type": "site-level"}],
        ),
        (
            "lummi-island-heritage-trust",
            "Lummi Island Heritage Trust",
            "Lummi Island Heritage Trust",
            # Nominatim returns the whole island outline; LIHT parcel data is not in public GIS.
            # This is a placeholder covering the island until precise parcel boundaries are available.
            lummi,
            [{"issuing_authority": "Lummi Island Heritage Trust", "type": "site-level"}],
        ),
    ]

    existing = TOML_PATH.read_text(encoding="utf-8")
    added = 0
    skipped = 0
    blocks = []

    for slug, name, land_owner, wkt, permits in places:
        if f'slug        = "{slug}"' in existing:
            print(f"  SKIP {slug} (already present)")
            skipped += 1
            continue
        if wkt is None:
            print(f"  SKIP {slug} (no geometry)")
            skipped += 1
            continue
        blocks.append(toml_block(slug, name, land_owner, wkt, permits))
        print(f"  ADD {slug}")
        added += 1

    if blocks:
        with open(TOML_PATH, "a", encoding="utf-8") as f:
            for block in blocks:
                f.write(block)

    print(f"\nDone: {added} added, {skipped} skipped")


if __name__ == "__main__":
    main()
