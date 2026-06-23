"""Generate per-place SVG occurrence maps following the species_maps.py pattern (PPAGE-03).

Writes ASSETS_DIR/place-maps/{slug}.svg for every distinct place_slug in the
occurrence_places bridge. Runs AFTER dbt-build (needs occurrences.parquet +
occurrence_places.parquet) and AFTER places-export for STEPS ordering
readability — keeps all places-* steps contiguous.

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
    """Emit one {slug}.svg per distinct place_slug in the occurrence_places bridge.

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

        bridge_parquet = ASSETS_DIR / "occurrence_places.parquet"
        if not bridge_parquet.exists():
            raise FileNotFoundError(
                f"{bridge_parquet} not found — run dbt before places-maps"
            )

        county_geojsons = _load_county_geojsons(con)
        backdrop = _build_county_backdrop(county_geojsons)

        # Phase 160 (D-02/D-05): place membership lives in the occurrence_places
        # bridge (no scalar place_slug column). Rebuild the Option-B occ_id over
        # occurrences.parquet (same CASE priority as occIdFromRow,
        # src/occurrence.ts:23-30 — positionally coupled), JOIN the bridge, and
        # group points per place_slug. A point whose occurrence is in two places
        # has two bridge rows, so it lands in both by_slug lists → both SVGs (D-05).
        rows = con.execute(
            f"""
            WITH occ AS (
                SELECT *,
                    CASE
                        WHEN ecdysis_id IS NOT NULL THEN 'ecdysis:' || ecdysis_id
                        WHEN observation_id IS NOT NULL THEN 'inat:' || observation_id
                        WHEN specimen_observation_id IS NOT NULL THEN 'inat_obs:' || specimen_observation_id
                        WHEN checklist_id IS NOT NULL THEN 'checklist:' || checklist_id
                    END AS occ_id
                FROM read_parquet('{occurrences_parquet}')
            )
            SELECT b.place_slug, occ.lon, occ.lat
            FROM occ JOIN read_parquet('{bridge_parquet}') b ON b.occ_id = occ.occ_id
            WHERE occ.lon IS NOT NULL AND occ.lat IS NOT NULL
            """
        ).fetchall()

        by_slug: dict[str, list[tuple[float, float]]] = defaultdict(list)
        for slug, lon, lat in rows:
            by_slug[slug].append((lon, lat))

        total_clipped = 0
        for slug, points in sorted(by_slug.items()):
            clipped = _write_species_svg(slug, points, set(), county_geojsons, backdrop, maps_dir)
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
    try:
        generate_place_maps(con)
    finally:
        con.close()


if __name__ == "__main__":
    main()
