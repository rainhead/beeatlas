"""Export per-place artifacts for the frontend (PPIPE-04).

Writes ASSETS_DIR/places.geojson (slim — Mapbox source) and
ASSETS_DIR/places.json (rich — Eleventy _data).

Runs AFTER dbt-build because specimen/sample counts come from
ASSETS_DIR/occurrences.parquet (Pitfall 5 — NOT from DBT_SANDBOX_DIR).

Usage:
    cd data && uv run python places_export.py
"""

import json
import os
import tomllib
from pathlib import Path

import duckdb


DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))
_default_assets = str(Path(__file__).parent.parent / "public" / "data")
ASSETS_DIR = Path(os.environ.get("EXPORT_DIR", _default_assets))

# Overridable for testing (tests monkeypatch this constant).
_PLACES_TOML_PATH = Path(__file__).parent.parent / "content" / "places.toml"


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _load_place_metadata(toml_path: Path) -> dict[str, dict]:
    """Load places.toml and return a slug→place-dict mapping."""
    with open(toml_path, "rb") as f:
        data = tomllib.load(f)
    return {p["slug"]: p for p in data.get("places", [])}


def _query_counts(con: duckdb.DuckDBPyConnection, parquet_path: Path) -> dict[str, dict[str, int]]:
    """Return per-slug specimen_count and sample_count from occurrences.parquet.

    Reads from ASSETS_DIR/occurrences.parquet (the copy made by _run_dbt_build),
    NOT from DBT_SANDBOX_DIR (Pitfall 5 — reading from sandbox risks stale data).
    """
    if not parquet_path.exists():
        raise FileNotFoundError(
            f"{parquet_path} not found — run dbt before places-export"
        )
    rows = con.execute(
        """
        SELECT
            place_slug,
            COUNT(CASE WHEN is_provisional = false OR is_provisional IS NULL THEN 1 END) AS specimen_count,
            COUNT(DISTINCT CASE WHEN sample_id IS NOT NULL THEN sample_id END) AS sample_count
        FROM read_parquet(?)
        WHERE place_slug IS NOT NULL
        GROUP BY place_slug
        """,
        [str(parquet_path)],
    ).fetchall()
    return {row[0]: {"specimen_count": int(row[1]), "sample_count": int(row[2])} for row in rows}


def _write_places_geojson(con: duckdb.DuckDBPyConnection, out_path: Path) -> None:
    """Write compact GeoJSON FeatureCollection (slug + geometry) to out_path.

    Uses separators=(',', ':') to match counties.geojson / ecoregions.geojson
    pattern — compact output suitable for a Mapbox source with promoteId: 'slug'.
    """
    rows = con.execute(
        "SELECT slug, ST_AsGeoJSON(geom) FROM geographies.places ORDER BY slug"
    ).fetchall()
    features = [
        {
            "type": "Feature",
            "properties": {"slug": slug},
            "geometry": json.loads(geom_json),
        }
        for slug, geom_json in rows
    ]
    fc = {"type": "FeatureCollection", "features": features}
    out_path.write_text(json.dumps(fc, separators=(",", ":")), encoding="utf-8")
    print(f"  places.geojson: {len(features):,} features, {out_path.stat().st_size:,} bytes")  # noqa: T201


def _write_places_json(
    places_meta: dict[str, dict],
    counts: dict[str, dict[str, int]],
    out_path: Path,
) -> None:
    """Write pretty-printed JSON array of place records (no geometry) to out_path.

    Uses indent=2 to match species.json (Eleventy _data consumer convention).
    """
    records = []
    for slug, meta in sorted(places_meta.items()):
        c = counts.get(slug, {"specimen_count": 0, "sample_count": 0})
        records.append(
            {
                "slug": slug,
                "name": meta["name"],
                "land_owner": meta["land_owner"],
                "specimen_count": c["specimen_count"],
                "sample_count": c["sample_count"],
            }
        )
    out_path.write_text(json.dumps(records, indent=2), encoding="utf-8")
    print(f"  places.json: {len(records):,} places, {out_path.stat().st_size:,} bytes")  # noqa: T201


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def export_places(con: duckdb.DuckDBPyConnection | None = None) -> None:
    """Export places.geojson and places.json to ASSETS_DIR.

    If con is None, opens a DuckDB connection to DB_PATH (with LOAD spatial)
    and closes it on completion. Callers may pass an existing connection if
    they wish to reuse one (e.g. in tests).
    """
    _owned = False
    if con is None:
        con = duckdb.connect(DB_PATH)
        con.execute("LOAD spatial")
        _owned = True

    try:
        ASSETS_DIR.mkdir(parents=True, exist_ok=True)
        places_meta = _load_place_metadata(_PLACES_TOML_PATH)
        counts = _query_counts(con, ASSETS_DIR / "occurrences.parquet")
        _write_places_geojson(con, ASSETS_DIR / "places.geojson")
        _write_places_json(places_meta, counts, ASSETS_DIR / "places.json")
    finally:
        if _owned:
            con.close()


def export_places_step() -> None:
    """Zero-argument wrapper for inclusion in run.py STEPS list."""
    con = duckdb.connect(DB_PATH)
    con.execute("LOAD spatial")
    try:
        export_places(con)
    finally:
        con.close()


if __name__ == "__main__":
    export_places_step()
