"""Generate per-place SVG occurrence maps following the species_maps.py pattern (PPAGE-03).

Writes ASSETS_DIR/place-maps/{slug}.svg for every distinct place_slug in
occurrences.parquet. Runs AFTER dbt-build (needs the place_slug column from Plan 01)
and AFTER places-export for STEPS ordering readability — keeps all places-* steps
contiguous.

Note: If a place from content/places.toml has ZERO occurrences, no SVG is written for
it. Phase 99's per-place page must handle "no map yet" gracefully (out of scope here).

Usage:
    cd data && uv run python places_maps.py
"""

import os
from collections import defaultdict
from pathlib import Path

import duckdb

from species_maps import _load_county_geojsons, _build_county_backdrop, _write_species_svg

DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))
_default_assets = str(Path(__file__).parent.parent / 'public' / 'data')
ASSETS_DIR = Path(os.environ.get('EXPORT_DIR', _default_assets))


def generate_place_maps(con: duckdb.DuckDBPyConnection | None = None) -> None:
    """Emit one {slug}.svg per distinct place_slug in occurrences.parquet.

    Reuses _load_county_geojsons, _build_county_backdrop, and _write_species_svg
    from species_maps.py (RESEARCH §A3 — import acceptable for tightly-coupled helpers).

    Output directory: ASSETS_DIR/place-maps/ — created idempotently with mkdir(),
    never wiped. Wipe-and-rewrite would risk clearing place-maps/ if any future refactor
    consolidates the maps_dir variable with species-maps/ (Pitfall 6).

    Places with zero occurrences will have no SVG written for them.
    """
    _owned = False
    if con is None:
        con = duckdb.connect(DB_PATH)
        con.execute("LOAD spatial")
        _owned = True

    try:
        maps_dir = ASSETS_DIR / "place-maps"
        maps_dir.mkdir(parents=True, exist_ok=True)  # idempotent — no wipe (Pitfall 6)

        occurrences_parquet = ASSETS_DIR / "occurrences.parquet"
        if not occurrences_parquet.exists():
            raise FileNotFoundError(
                f"{occurrences_parquet} not found — run dbt before places-maps"
            )

        county_geojsons = _load_county_geojsons(con)
        backdrop = _build_county_backdrop(county_geojsons)

        rows = con.execute(
            f"""
            SELECT place_slug, lon, lat
            FROM read_parquet('{occurrences_parquet}')
            WHERE place_slug IS NOT NULL AND lon IS NOT NULL AND lat IS NOT NULL
            """
        ).fetchall()

        by_slug: dict[str, list[tuple[float, float]]] = defaultdict(list)
        for slug, lon, lat in rows:
            by_slug[slug].append((lon, lat))

        total_clipped = 0
        for slug, points in sorted(by_slug.items()):
            clipped = _write_species_svg(slug, points, backdrop, maps_dir)
            total_clipped += clipped

        print(  # noqa: T201
            f"  place-maps/: {len(by_slug):,} files, {total_clipped:,} total points clipped"
        )
    finally:
        if _owned:
            con.close()


def main() -> None:
    """Zero-arg wrapper for run.py STEPS — opens DB, loads spatial, generates maps."""
    con = duckdb.connect(DB_PATH)
    con.execute("LOAD spatial")
    generate_place_maps(con)
    con.close()


if __name__ == "__main__":
    main()
