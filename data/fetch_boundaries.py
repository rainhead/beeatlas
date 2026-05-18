"""
Fetch real park/refuge boundary polygons from authoritative GIS sources.
Run with: uv run --with requests,shapely python fetch_boundaries.py
Writes results to real_boundaries.py.
"""

import json
import sys
import time
from typing import Any

import requests
from shapely.geometry import shape
from shapely.ops import unary_union
from shapely import wkt

TODAY = "2026-05-18"

# ---------------------------------------------------------------------------
# ArcGIS REST helpers
# ---------------------------------------------------------------------------

def arcgis_query(url: str, where: str, out_fields: str = "*",
                 out_sr: int = 4326, timeout: int = 60) -> list[dict]:
    """Fetch all features from an ArcGIS FeatureServer/MapServer layer via GeoJSON."""
    features = []
    offset = 0
    max_records = 1000
    while True:
        params = {
            "where": where,
            "outFields": out_fields,
            "outSR": str(out_sr),
            "returnGeometry": "true",
            "resultOffset": str(offset),
            "resultRecordCount": str(max_records),
            "f": "geojson",
        }
        resp = requests.get(url + "/query", params=params, timeout=timeout)
        resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            raise RuntimeError(f"ArcGIS error at {url}: {data['error']}")
        batch = data.get("features", [])
        features.extend(batch)
        exceeded = data.get("properties", {}).get("exceededTransferLimit", False)
        if not exceeded or len(batch) < max_records:
            break
        offset += len(batch)
    return features


def features_to_shape(features: list[dict]):
    """Union all GeoJSON features into a single Shapely geometry."""
    geoms = []
    for f in features:
        geom = f.get("geometry")
        if geom:
            try:
                geoms.append(shape(geom))
            except Exception as e:
                print(f"  Warning: could not parse geometry: {e}", file=sys.stderr)
    if not geoms:
        return None
    return unary_union(geoms)


def simplify(geom, tolerance: float = 0.001):
    return geom.simplify(tolerance, preserve_topology=True)


def to_wkt(geom) -> str:
    return wkt.dumps(geom, rounding_precision=6)


# ---------------------------------------------------------------------------
# Per-source fetch functions
# ---------------------------------------------------------------------------

WA_STATE_PARKS_URL = "https://services5.arcgis.com/4LKAHwqnBooVDUlX/arcgis/rest/services/ParkBoundaries/FeatureServer/2"
NPS_URL = "https://services1.arcgis.com/fBc8EJBxQRMcHlei/arcgis/rest/services/NPS_Land_Resources_Division_Boundary_and_Tract_Data_Service/FeatureServer/2"
USFWS_URL = "https://services.arcgis.com/QVENGdaPbd4LUkLV/arcgis/rest/services/National_Wildlife_Refuge_System_Boundaries/FeatureServer/0"
SEATTLE_PARKS_URL = "https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/Park_Boundaries/FeatureServer/2"
KING_COUNTY_PARKS_URL = "https://gisdata.kingcounty.gov/arcgis/rest/services/OpenDataPortal/recreatn__park_property_area/MapServer/233"
DNR_MANAGED_LANDS_URL = "https://gis.dnr.wa.gov/site3/rest/services/Public_Boundaries/WADNR_PUBLIC_Managed_Lands/MapServer/1"


def fetch_by_field(url: str, field: str, value: str, name_for_log: str) -> Any:
    """Fetch features where field matches value, return simplified geometry or None."""
    print(f"  {name_for_log}")
    try:
        # Try exact match
        features = arcgis_query(url, f"{field}='{value}'")
        if not features:
            # Try LIKE
            features = arcgis_query(url, f"{field} LIKE '%{value}%'")
        if features:
            geom = features_to_shape(features)
            if geom:
                result = simplify(geom)
                print(f"    OK: {len(features)} features, {geom.geom_type}")
                return result
            print("    No geometry in features")
        else:
            print("    NOT FOUND")
    except Exception as e:
        print(f"    ERROR: {e}", file=sys.stderr)
    return None


def fetch_seattle_park_by_pma(pma: int, slug: str) -> Any:
    print(f"  {slug} (PMA={pma})")
    try:
        features = arcgis_query(SEATTLE_PARKS_URL, f"PMA={pma}")
        if features:
            geom = features_to_shape(features)
            if geom:
                result = simplify(geom)
                print(f"    OK: {len(features)} features, {geom.geom_type}")
                return result
        print("    NOT FOUND")
    except Exception as e:
        print(f"    ERROR: {e}", file=sys.stderr)
    return None


# ---------------------------------------------------------------------------
# Place → data source mappings
# ---------------------------------------------------------------------------

# NPS: slug → UNIT_NAME in the NPS feature service
NPS_PARKS: dict[str, str] = {
    "olympic-national-park": "Olympic National Park",
    "mount-rainier-national-park": "Mount Rainier National Park",
}

# Seattle Parks: slug → PMA ID (verified by querying the service)
# Discovery Park main area = PMA 310
# Warren G. Magnuson Park = PMA 398
# Seward Park = PMA 428
SEATTLE_PARKS: dict[str, int] = {
    "discovery-park": 310,
    "magnuson-park": 398,
    "seward-park": 428,
}

# King County Parks: slug → SITENAME
KING_COUNTY_PARKS: dict[str, str] = {
    "cougar-mountain-regional-wildland-park": "Cougar Mountain Regional Wildland Park",
    # Rattlesnake Ledge is the trailhead/overlook within "Rattlesnake Mountain Scenic Area"
    # which is a King County park
    "rattlesnake-ledge": "Rattlesnake Mountain Scenic Area",
}

# WA DNR Managed Lands: slug → PARCEL_LABEL_NM search term
WA_DNR_PARKS: dict[str, str] = {
    "tiger-mountain": "Tiger Mt",
}

# WA State Parks: slug → ParkName field value
# (verified by sampling the FeatureServer)
WA_STATE_PARKS: dict[str, str] = {
    "alta-lake-state-park": "Alta Lake",
    "anderson-lake-state-park": "Anderson Lake",
    "beacon-rock-state-park": "Beacon Rock",
    "birch-bay-state-park": "Birch Bay",
    "blake-island-marine-state-park": "Blake Island",
    "bogachiel-state-park": "Bogachiel",
    "bottle-beach-state-park": "Bottle Beach",
    "bridgeport-state-park": "Bridgeport",
    "brooks-memorial-state-park": "Brooks Memorial",
    "cape-disappointment-state-park": "Cape Disappointment",
    "columbia-hills-state-park": "Columbia Hills",
    "columbia-plateau-trail-state-park": "Columbia Plateau",
    "conconully-state-park": "Conconully",
    "crawford-state-park": "Crawford",
    "curlew-lake-state-park": "Curlew Lake",
    "daroga-state-park": "Daroga",
    "deception-pass-state-park": "Deception Pass",
    "dosewallips-state-park": "Dosewallips",
    "fields-spring-state-park": "Fields Spring",
    "fort-flagler-state-park": "Fort Flagler",
    "fort-simcoe-state-park": "Fort Simcoe",
    "fort-townsend-state-park": "Fort Townsend",
    "fort-worden-state-park": "Fort Worden",
    "ginkgo-petrified-forest-state-park": "Ginkgo Petrified Forest",
    "grayland-beach-state-park": "Grayland Beach",
    "griffiths-priday-state-park": "Griffiths-Priday",
    "helen-mccabe-state-park": "Helen McCabe",
    "illahee-state-park": "Illahee",
    "jones-island-marine-state-park": "Jones Island",
    "kinney-point-state-park": "Kinney Point",
    "klickitat-trail-state-park": "Klickitat",
    "lake-easton-state-park": "Lake Easton",
    "lake-sammamish-state-park": "Lake Sammamish",
    "lake-sylvia-state-park": "Lake Sylvia",
    "lake-wenatchee-state-park": "Lake Wenatchee",
    "larrabee-state-park": "Larrabee",
    "leadbetter-point-state-park": "Leadbetter Point",
    "lincoln-rock-state-park": "Lincoln Rock",
    "miller-peninsula-state-park": "Miller Peninsula",
    "moran-state-park": "Moran",
    "mount-pilchuck-state-park": "Mount Pilchuck",
    "mount-spokane-state-park": "Mount Spokane",
    "ocean-city-state-park": "Ocean City",
    "olmstead-place-state-park": "Olmstead Place",
    "pacific-beach-state-park": "Pacific Beach",
    "palouse-falls-state-park": "Palouse Falls",
    "palouse-to-cascades-state-park-trail": "Palouse to Cascades",
    "pearrygin-lake-state-park": "Pearrygin Lake",
    "peshastin-pinnacles-state-park": "Peshastin Pinnacles",
    "potholes-state-park": "Potholes",
    "potlatch-state-park": "Potlatch",
    "rainbow-falls-state-park": "Rainbow Falls",
    "riverside-state-park": "Riverside",
    "rocky-reach-trail": "Rocky Reach",
    "schafer-state-park": "Schafer",
    "sequim-bay-state-park": "Sequim Bay",
    "shine-tidelands-state-park": "Shine Tidelands",
    "squilchuck-state-park": "Squilchuck",
    "steamboat-rock-state-park": "Steamboat Rock",
    "steptoe-butte-state-park": "Steptoe Butte",
    "sun-lakes-dry-falls-state-park": "Sun Lakes",
    "triton-cove-state-park": "Triton Cove",
    "twin-harbors-state-park": "Twin Harbors",
    "wanapum-heritage-center": "Wanapum",
    "wenatchee-confluence-state-park": "Wenatchee Confluence",
    "westport-light-state-park": "Westport Light",
    "willapa-hills-trail-state-park": "Willapa Hills",
}

# USFWS: slug → ORGNAME (uppercase, as stored in the feature service)
USFWS_REFUGES: dict[str, str] = {
    "columbia-nwr": "COLUMBIA NATIONAL WILDLIFE REFUGE",
    "conboy-lake-nwr": "CONBOY LAKE NATIONAL WILDLIFE REFUGE",
    "hanford-reach-national-monument": "HANFORD REACH NATIONAL MONUMENT/SADDLE MOUNTAIN NATIONAL WILDLIFE REFUGE",
    "nisqually-national-wildlife-refuge": "BILLY FRANK JR. NISQUALLY NATIONAL WILDLIFE REFUGE",
    "little-pend-oreille-nwr": "LITTLE PEND OREILLE NATIONAL WILDLIFE REFUGE",
    "ridgefield-nwr": "RIDGEFIELD NATIONAL WILDLIFE REFUGE",
    "toppenish-nwr": "TOPPENISH NATIONAL WILDLIFE REFUGE",
    "willapa-nwr": "WILLAPA NATIONAL WILDLIFE REFUGE",
}


def main():
    boundaries: dict[str, str] = {}
    not_found: list[str] = []

    # ---- NPS Parks ----
    print("\n=== NPS Parks ===")
    for slug, unit_name in NPS_PARKS.items():
        geom = fetch_by_field(NPS_URL, "UNIT_NAME", unit_name, f"{slug} ({unit_name})")
        if geom:
            boundaries[slug] = to_wkt(geom)
        else:
            not_found.append(slug)
        time.sleep(0.5)

    # ---- Seattle Parks ----
    print("\n=== Seattle Parks ===")
    for slug, pma in SEATTLE_PARKS.items():
        geom = fetch_seattle_park_by_pma(pma, slug)
        if geom:
            boundaries[slug] = to_wkt(geom)
        else:
            not_found.append(slug)
        time.sleep(0.5)

    # ---- King County Parks ----
    print("\n=== King County Parks ===")
    for slug, sitename in KING_COUNTY_PARKS.items():
        geom = fetch_by_field(KING_COUNTY_PARKS_URL, "SITENAME", sitename, f"{slug} ({sitename})")
        if geom:
            boundaries[slug] = to_wkt(geom)
        else:
            not_found.append(slug)
        time.sleep(0.5)

    # ---- WA DNR ----
    print("\n=== WA DNR ===")
    for slug, label in WA_DNR_PARKS.items():
        geom = fetch_by_field(DNR_MANAGED_LANDS_URL, "PARCEL_LABEL_NM", label, f"{slug} ({label})")
        if geom:
            boundaries[slug] = to_wkt(geom)
        else:
            not_found.append(slug)
        time.sleep(0.5)

    # ---- WA State Parks ----
    print("\n=== WA State Parks ===")
    for slug, park_name in WA_STATE_PARKS.items():
        geom = fetch_by_field(WA_STATE_PARKS_URL, "ParkName", park_name, f"{slug} ({park_name})")
        if geom:
            boundaries[slug] = to_wkt(geom)
        else:
            not_found.append(slug)
        time.sleep(0.3)

    # ---- USFWS Refuges ----
    print("\n=== USFWS Refuges ===")
    for slug, orgname in USFWS_REFUGES.items():
        geom = fetch_by_field(USFWS_URL, "ORGNAME", orgname, f"{slug} ({orgname})")
        if geom:
            boundaries[slug] = to_wkt(geom)
        else:
            not_found.append(slug)
        time.sleep(0.5)

    # ---- Write output ----
    print(f"\n=== Summary ===")
    print(f"Found: {len(boundaries)}")
    print(f"Not found ({len(not_found)}): {not_found}")

    output_path = "/Users/rainhead/dev/beeatlas/data/real_boundaries.py"
    sources = [
        "WA State Parks: https://services5.arcgis.com/4LKAHwqnBooVDUlX/arcgis/rest/services/ParkBoundaries/FeatureServer/2",
        "NPS boundaries: https://services1.arcgis.com/fBc8EJBxQRMcHlei/arcgis/rest/services/NPS_Land_Resources_Division_Boundary_and_Tract_Data_Service/FeatureServer/2",
        "USFWS NWR: https://services.arcgis.com/QVENGdaPbd4LUkLV/arcgis/rest/services/National_Wildlife_Refuge_System_Boundaries/FeatureServer/0",
        "Seattle Parks: https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/Park_Boundaries/FeatureServer/2",
        "King County Parks: https://gisdata.kingcounty.gov/arcgis/rest/services/OpenDataPortal/recreatn__park_property_area/MapServer/233",
        "WA DNR Managed Lands: https://gis.dnr.wa.gov/site3/rest/services/Public_Boundaries/WADNR_PUBLIC_Managed_Lands/MapServer/1",
    ]

    lines = [
        "# Real park boundaries from authoritative GIS sources.",
        f"# Generated by agent on {TODAY}.",
        "# Sources:",
    ]
    for s in sources:
        lines.append(f"#   {s}")
    lines.append("")
    lines.append("# slug -> WKT string (EPSG:4326, simplified to ~0.001 deg tolerance)")
    lines.append("BOUNDARIES: dict[str, str] = {")
    for slug in sorted(boundaries.keys()):
        wkt_str = boundaries[slug]
        lines.append(f'    "{slug}": "{wkt_str}",')
    lines.append("}")
    lines.append("")
    lines.append("# Slugs for which no authoritative boundary was found -- remove from places.toml")
    lines.append("NOT_FOUND: list[str] = [")
    for slug in not_found:
        lines.append(f'    "{slug}",')
    lines.append("]")
    lines.append("")

    with open(output_path, "w") as f:
        f.write("\n".join(lines))

    print(f"\nWrote {output_path}")


if __name__ == "__main__":
    main()
