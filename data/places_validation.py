"""Validation module for content/places.toml.

Exposes:
    validate_places(toml_path)   — raises ValueError on any violation
    validate_places_step()       — zero-arg wrapper for run.py STEPS list

Checks performed in order:
    1. Slug regex [a-z0-9-]
    2. Duplicate slugs
    3. Permit field presence (issuing_authority, type) for each permit entry
    4. WKT geometry validity via DuckDB ST_GeomFromText
    5. WGS84 coordinate-range bounds (lon -180..180, lat -90..90)

Phase 160 (D-03): the former pairwise ST_Overlaps overlap-rejection check was
removed. Overlapping place polygons are now legal — membership is many-to-many
(see data/dbt/models/marts/occurrence_places.sql).
"""

import re
import tomllib
from pathlib import Path

import duckdb

SLUG_RE = re.compile(r'^[a-z0-9-]+$')


def validate_places(toml_path: "Path | str") -> None:
    """Read toml_path and validate all place entries.

    Raises ValueError("places.toml: place '{slug}': {reason}") for the first
    violation found in each category (slug, geometry/WGS84, permit).  Returns None
    when the file is valid.
    """
    toml_path = Path(toml_path)
    with open(toml_path, "rb") as f:
        data = tomllib.load(f)

    places = data.get("places", [])

    # ------------------------------------------------------------------ #
    # 1 + 2 — Slug validation                                             #
    # ------------------------------------------------------------------ #
    seen_slugs: set[str] = set()
    for place in places:
        slug = place.get("slug", "")
        if not SLUG_RE.match(slug):
            raise ValueError(
                f"places.toml: place '{slug}': slug contains invalid characters"
            )
        if slug in seen_slugs:
            raise ValueError(
                f"places.toml: place '{slug}': duplicate slug"
            )
        seen_slugs.add(slug)

    # ------------------------------------------------------------------ #
    # 3 — Permit field validation                                         #
    # ------------------------------------------------------------------ #
    _REQUIRED_PERMIT_FIELDS = ("issuing_authority", "type")
    for place in places:
        slug = place.get("slug", "")
        for permit in place.get("permits", []):
            for field in _REQUIRED_PERMIT_FIELDS:
                if field not in permit:
                    raise ValueError(
                        f"places.toml: place '{slug}': "
                        f"permit missing required field '{field}'"
                    )

    # ------------------------------------------------------------------ #
    # 4 + 5 — Geometry validity and WGS84 bounds (per-place)             #
    # ------------------------------------------------------------------ #
    con = duckdb.connect(":memory:")
    con.execute("LOAD spatial")

    for place in places:
        slug = place["slug"]
        wkt = place.get("geometry_wkt", "").strip()

        # 4. WKT validity
        try:
            row = con.execute("SELECT ST_GeomFromText(?)", [wkt]).fetchone()
            if row is None or row[0] is None:
                raise ValueError(
                    f"places.toml: place '{slug}': invalid geometry WKT: NULL result"
                )
        except duckdb.Error as exc:
            raise ValueError(
                f"places.toml: place '{slug}': invalid geometry WKT: {exc}"
            ) from exc

        # 5. WGS84 bounds
        xmin, xmax, ymin, ymax = con.execute(
            """
            SELECT ST_XMin(g), ST_XMax(g), ST_YMin(g), ST_YMax(g)
            FROM (SELECT ST_GeomFromText(?) AS g)
            """,
            [wkt],
        ).fetchone()

        if not (-180 <= xmin and xmax <= 180 and -90 <= ymin and ymax <= 90):
            raise ValueError(
                f"places.toml: place '{slug}': "
                "geometry is not in WGS84 (coordinates out of range)"
            )


def validate_places_step() -> None:
    """Zero-argument wrapper for inclusion in run.py STEPS list.

    Derives the path to content/places.toml relative to this module's
    location (data/ → repo root → content/places.toml).
    """
    toml_path = Path(__file__).parent.parent / "content" / "places.toml"
    validate_places(toml_path)
