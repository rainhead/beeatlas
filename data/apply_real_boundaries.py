"""Rebuild content/places.toml using real GIS boundaries from real_boundaries.py.

- Replaces all approximate bounding-box geometries with real park boundaries.
- Removes rocky-reach-trail and wanapum-heritage-center (not found in GIS data).
- Adds SJCCLB preserves as new places.

Run: cd data && uv run python apply_real_boundaries.py
"""
import sys
import tomllib
from pathlib import Path

import duckdb

# Import the boundaries dict (same directory)
sys.path.insert(0, str(Path(__file__).parent))
from real_boundaries import BOUNDARIES, NOT_FOUND, SJCCLB_SLUGS  # noqa: E402

# Clip overlapping pairs: (slug_to_clip, slug_to_clip_against)
# Columbia NWR and Hanford Reach NM share a simplified boundary edge.
# slug -> list of slugs to subtract from it (unioned before subtracting)
# For trail corridors and large refuges, subtract the smaller/more-specific places so
# specimen assignment goes to the most specific named place.
CLIP_FROM: dict[str, list[str]] = {
    # Clip trail corridors and large areas against the more specific places within them
    "columbia-plateau-trail-state-park":    ["palouse-to-cascades-state-park-trail"],
    "lake-easton-state-park":               ["palouse-to-cascades-state-park-trail"],
    "rainbow-falls-state-park":             ["willapa-hills-trail-state-park"],
    "leadbetter-point-state-park":          ["willapa-nwr"],
    # SJCCLB adjacent preserves — clip the one listed second against the first
    "sjcclb-deadman-bay":                   ["sjcclb-limekiln"],
    "sjcclb-king-sisters":                  ["sjcclb-zylstra-lake"],
}

# columbia-nwr real boundary overlaps palouse-to-cascades-state-park-trail (trail corridor
# passes through the refuge). Dropped for now; revisit with a tighter hand-drawn polygon.
# columbia-plateau-trail and palouse-to-cascades share the Milwaukee Road corridor;
# their real GIS polygons genuinely overlap. Drop columbia-plateau until hand-drawn.
_EXTRA_SKIP = {
    "columbia-nwr",                       # overlaps palouse-to-cascades; revisit with tighter boundary
    "columbia-plateau-trail-state-park",  # shares Milwaukee Road corridor with palouse-to-cascades
    "palouse-to-cascades-state-park-trail",  # 300-mile corridor; GIS boundary engulfs adjacent parks
    "sjcclb-deadman-bay",                 # GIS boundary overlaps sjcclb-limekiln; ST_Difference fails
    "sjcclb-king-sisters",               # GIS boundary overlaps sjcclb-zylstra-lake; ST_Difference fails
    "rainbow-falls-state-park",          # GIS boundary overlaps willapa-hills-trail; ST_Difference fails
    "leadbetter-point-state-park",       # GIS boundary overlaps willapa-nwr; ST_Difference fails
}

def _resolve_boundaries() -> dict[str, str]:
    """Return BOUNDARIES with overlapping neighbours subtracted out."""
    resolved = dict(BOUNDARIES)
    con = duckdb.connect(":memory:")
    con.execute("LOAD spatial")
    for slug, subtract_slugs in CLIP_FROM.items():
        if slug not in resolved:
            continue
        present = [s for s in subtract_slugs if s in resolved]
        if not present:
            continue
        # Iteratively subtract each conflicting geometry
        geom_wkt = resolved[slug]
        for other in present:
            geom_wkt = con.execute(
                "SELECT ST_AsText(ST_Difference(ST_GeomFromText(?), ST_GeomFromText(?)))",
                [geom_wkt, resolved[other]],
            ).fetchone()[0]
        resolved[slug] = geom_wkt
        print(f"  Clipped {slug} against {', '.join(present)}")
    con.close()
    return resolved

TOML_PATH = Path(__file__).parent.parent / "content" / "places.toml"

# Preserve metadata not stored in BOUNDARIES (name, land_owner, permits)
SJCCLB_META: dict[str, dict] = {
    slug: {
        "name": slug.removeprefix("sjcclb-").replace("-", " ").title(),
        "land_owner": "San Juan County Land Bank",
        "permits": [],
    }
    for slug in SJCCLB_SLUGS
}

# Manual name fixes for SJCCLB preserves where title-case isn't right
SJCCLB_NAME_OVERRIDES = {
    "sjcclb-cady-mountain":           "Cady Mountain Preserve",
    "sjcclb-beaverton-marsh":         "Beaverton Marsh Preserve",
    "sjcclb-channel":                 "Channel Preserve",
    "sjcclb-coffelt-farm":            "Coffelt Farm Preserve",
    "sjcclb-coho":                    "Coho Preserve",
    "sjcclb-crescent-beach":          "Crescent Beach Preserve",
    "sjcclb-deadman-bay":             "Deadman Bay Preserve",
    "sjcclb-deer-harbor":             "Deer Harbor Preserve",
    "sjcclb-diamond-hill":            "Diamond Hill Preserve",
    "sjcclb-driggs-park":             "Driggs Park Preserve",
    "sjcclb-eastsound-waterfront-park": "Eastsound Waterfront Park",
    "sjcclb-entrance-mountain":       "Entrance Mountain Preserve",
    "sjcclb-false-bay-creek":         "False Bay Creek Preserve",
    "sjcclb-fisherman-bay":           "Fisherman Bay Preserve",
    "sjcclb-frazer-homestead":        "Frazer Homestead Preserve",
    "sjcclb-hummel-lake":             "Hummel Lake Preserve",
    "sjcclb-judd-cove":               "Judd Cove Preserve",
    "sjcclb-kellett-bluff":           "Kellett Bluff Preserve",
    "sjcclb-king-sisters":            "King Sisters Preserve",
    "sjcclb-limekiln":                "Limekiln Preserve",
    "sjcclb-lopez-hill":              "Lopez Hill Preserve",
    "sjcclb-middlewood":              "Middlewood Preserve",
    "sjcclb-mount-grant":             "Mount Grant Preserve",
    "sjcclb-richardson-marsh":        "Richardson Marsh Preserve",
    "sjcclb-spencer-spit":            "Spencer Spit Preserve",
    "sjcclb-stonebridge-terrill":     "Stonebridge Terrill Preserve",
    "sjcclb-third-lagoon":            "Third Lagoon Preserve",
    "sjcclb-turtleback-mountain":     "Turtleback Mountain Preserve",
    "sjcclb-upright-head":            "Upright Head Preserve",
    "sjcclb-watmough-bay":            "Watmough Bay Preserve",
    "sjcclb-westside":                "Westside Preserve",
    "sjcclb-zylstra-lake":            "Zylstra Lake Preserve",
}
for slug, name in SJCCLB_NAME_OVERRIDES.items():
    SJCCLB_META[slug]["name"] = name


def _toml_block(slug: str, name: str, land_owner: str, wkt: str, permits: list) -> str:
    permits_str = ""
    if permits:
        parts = []
        for p in permits:
            kv = ", ".join(f'{k} = "{v}"' for k, v in p.items())
            parts.append(f"  {{ {kv} }}")
        permits_str = "\n" + "\n".join(parts) + "\n"
        permits_line = f"permits = [{permits_str}]"
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
    with open(TOML_PATH, "rb") as f:
        data = tomllib.load(f)

    existing = {p["slug"]: p for p in data.get("places", [])}
    skip = set(NOT_FOUND) | _EXTRA_SKIP
    resolved = _resolve_boundaries()

    out_lines = [
        "# places.toml — WA Bee Atlas named collecting locations\n",
        "#\n",
        "# Schema rules:\n",
        "#   slug       Immutable after first publish. Use [a-z0-9-] only.\n",
        "#   geometry_wkt\n",
        "#              WGS84 (EPSG:4326) WKT polygon/multipolygon from authoritative GIS sources.\n",
        "#   permits[].type\n",
        '#              "project-level" or "site-level"\n',
    ]

    found = 0
    skipped = 0

    sjcclb_set = set(SJCCLB_SLUGS)

    # Existing places (updated with real boundaries; SJCCLB written separately below)
    for slug, place in existing.items():
        if slug in sjcclb_set:
            continue
        if slug in skip:
            print(f"  REMOVING {slug} (no GIS boundary found)")
            skipped += 1
            continue
        if slug not in resolved:
            print(f"  WARNING: {slug} has no boundary in real_boundaries.py — keeping old WKT")
            wkt = place.get("geometry_wkt", "").strip()
        else:
            wkt = resolved[slug]
            found += 1
        block = _toml_block(slug, place["name"], place["land_owner"], wkt, place.get("permits", []))
        out_lines.append(block)

    # SJCCLB preserves (new)
    for slug in SJCCLB_SLUGS:
        if slug in skip:
            print(f"  REMOVING SJCCLB {slug} (boundary conflict)")
            skipped += 1
            continue
        if slug not in resolved:
            print(f"  SKIPPING SJCCLB {slug} (no boundary)")
            continue
        meta = SJCCLB_META[slug]
        block = _toml_block(slug, meta["name"], meta["land_owner"], resolved[slug], [])
        out_lines.append(block)
        found += 1

    TOML_PATH.write_text("".join(out_lines), encoding="utf-8")
    print(f"\nWrote {TOML_PATH}")
    print(f"  {found} places with real boundaries")
    print(f"  {skipped} removed (not found in GIS)")
    print(f"  {len(SJCCLB_SLUGS)} SJCCLB preserves added")


if __name__ == "__main__":
    main()
