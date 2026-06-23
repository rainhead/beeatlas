"""Add the 33 web-listed WDFW wildlife areas to content/places.toml.

Source:
  WDFW ArcGIS REST WildlifeAreas layer — unit-level polygon features grouped by
  WLA_Name and dissolved into one MultiPolygon per wildlife area.

  Layer URL: https://geodataservices.wdfw.wa.gov/arcgis/rest/services/MapServices/
             WildlifeAreas/MapServer/0

The GIS layer contains 34 distinct WLA_Name values; "Jackman Creek" is present
in the authoritative GIS data but absent from the public WDFW wildlife-areas
list at https://wdfw.wa.gov/places-to-go/wildlife-areas and is therefore
excluded (D-01).

Phase 160 made place membership many-to-many (occurrence_places bridge), so
overlapping place polygons load cleanly — no overlap check is performed here.

Run: cd data && uv run python add_wdfw_wildlife_areas.py
"""

import json
import re
import tomllib
from pathlib import Path

import duckdb
import requests

WDFW_URL = (
    "https://geodataservices.wdfw.wa.gov/arcgis/rest/services/"
    "MapServices/WildlifeAreas/MapServer/0/query"
)
TOML_PATH = Path(__file__).parent.parent / "content" / "places.toml"
TOL = 0.0005  # ST_SimplifyPreserveTopology tolerance in degrees (~55 m); chosen to keep total places.geojson ≤ ~1 MB (D-05)
LAND_OWNER = "Washington Department of Fish & Wildlife"
EXCLUDE = frozenset({"Jackman Creek"})


def fetch_wdfw_features() -> list[dict]:
    """Return all unit features from the WDFW MapServer as EPSG:4326 GeoJSON features.

    The server reprojects to WGS84 via outSR=4326; no client-side transform needed.
    All 220 features are returned in a single request (maxRecordCount=2000, total=220).
    """
    r = requests.get(
        WDFW_URL,
        params={
            "where": "1=1",
            "outFields": "WLA_Name,WLAU_Name",
            "returnGeometry": "true",
            "outSR": "4326",
            "f": "geojson",
        },
        timeout=120,
    )
    r.raise_for_status()
    return r.json()["features"]


def dissolve_to_wkt(features: list[dict], tol: float) -> list[tuple[str, str]]:
    """Dissolve unit features by WLA_Name into one MULTIPOLYGON WKT per wildlife area.

    Features whose WLA_Name is in EXCLUDE (i.e. "Jackman Creek") are skipped before
    insertion, so they never appear in the output (D-01).

    Returns a list of (wla_name, wkt) tuples sorted by wla_name, where every wkt
    is a valid MULTIPOLYGON string (single-unit areas are wrapped via ST_Multi).
    """
    con = duckdb.connect(":memory:")
    con.execute("LOAD spatial")
    con.execute("CREATE TABLE u(wla VARCHAR, g GEOMETRY)")

    for f in features:
        wla_name = f["properties"]["WLA_Name"]
        if wla_name in EXCLUDE:
            continue
        con.execute(
            "INSERT INTO u VALUES (?, ST_GeomFromGeoJSON(?))",
            [wla_name, json.dumps(f["geometry"])],
        )

    rows = con.execute(
        """
        SELECT
            wla,
            ST_AsText(
                ST_Multi(
                    ST_SimplifyPreserveTopology(
                        ST_MakeValid(ST_Union_Agg(ST_MakeValid(g))),
                        ?
                    )
                )
            ) AS wkt
        FROM u
        GROUP BY wla
        ORDER BY wla
        """,
        [tol],
    ).fetchall()

    for wla, wkt in rows:
        assert wkt and wkt.startswith("MULTIPOLYGON"), (
            f"Unexpected geometry type for {wla!r}: {wkt[:60] if wkt else None}"
        )

    return rows


def slug_for(name: str) -> str:
    """Derive a [[places]] slug from a WLA_Name value.

    Convention (IMMUTABLE after first publish):
      - lowercase the name
      - replace any run of non-[a-z0-9] characters with a single hyphen
      - strip leading/trailing hyphens
      - append "-wildlife-area" if the result does not already end with it

    Examples:
      "Oak Creek"           → "oak-creek-wildlife-area"
      "L.T. Murray"         → "l-t-murray-wildlife-area"
      "Sunnyside-Snake River" → "sunnyside-snake-river-wildlife-area"
    """
    slug = name.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = slug.strip("-")
    if not slug.endswith("-wildlife-area"):
        slug = slug + "-wildlife-area"
    return slug


def toml_block(slug: str, name: str, land_owner: str, wkt: str, permits: list[dict]) -> str:
    """Emit a [[places]] TOML block.

    Reused verbatim from data/add_new_places.py:78-97.
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
name        = "{name}"
land_owner  = "{land_owner}"
geometry_wkt = \"\"\"
{wkt}
\"\"\"
{permits_line}
"""


def main() -> None:
    """Fetch WDFW layer, dissolve, and append [[places]] blocks to content/places.toml."""
    print("Fetching WDFW boundary features...")
    features = fetch_wdfw_features()
    print(f"  {len(features)} unit features fetched")

    print(f"Dissolving to MultiPolygon WKT (tol={TOL}°)...")
    areas = dissolve_to_wkt(features, TOL)
    print(f"  {len(areas)} wildlife areas dissolved (Jackman Creek excluded)")

    existing_text = TOML_PATH.read_text(encoding="utf-8")
    permits = [
        {
            "issuing_authority": LAND_OWNER,
            "type": "project-level",
        }
    ]

    added = 0
    skipped = 0
    blocks = []
    slugs_added = []

    for wla_name, wkt in areas:
        slug = slug_for(wla_name)
        if f'slug        = "{slug}"' in existing_text:
            print(f"  SKIP {slug} (already present)")
            skipped += 1
            continue
        blocks.append(toml_block(slug, wla_name, LAND_OWNER, wkt, permits))
        print(f"  ADD {slug}")
        slugs_added.append(slug)
        added += 1

    if blocks:
        with open(TOML_PATH, "a", encoding="utf-8") as f:
            for block in blocks:
                f.write(block)

    print(f"\nDone: {added} added, {skipped} skipped")
    if slugs_added:
        print("Slugs added:")
        for s in slugs_added:
            print(f"  {s}")


if __name__ == "__main__":
    main()
