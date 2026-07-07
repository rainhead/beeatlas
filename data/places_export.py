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

# Committed WA-native/endemic target-host seed (build_target_hosts.py). Joined to
# per-place sample hosts by name for the "target hosts collected here" panel.
_TARGET_HOSTS_CSV = Path(__file__).parent / "dbt" / "seeds" / "target_hosts.csv"


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _load_place_metadata(toml_path: Path) -> dict[str, dict]:
    """Load places.toml and return a slug→place-dict mapping."""
    with open(toml_path, "rb") as f:
        data = tomllib.load(f)
    return {p["slug"]: p for p in data.get("places", [])}


def _query_counts(
    con: duckdb.DuckDBPyConnection,
    occ_parquet: Path,
    bridge_parquet: Path,
) -> dict[str, dict[str, int]]:
    """Return per-slug specimen_count and sample_count via the occurrence_places bridge.

    Phase 160 (D-02/D-05): place_slug is no longer a scalar column on the
    occurrences mart. Membership lives in the occurrence_places bridge keyed by
    the synthetic occ_id. We rebuild the Option-B occ_id over occurrences.parquet
    (the same CASE priority as occIdFromRow in src/occurrence.ts:23-30 — positionally
    coupled), JOIN the bridge on occ_id, and GROUP BY place_slug. Because an
    occurrence in A∩B has two bridge rows, it is counted under BOTH place_slugs —
    the intended double-count (D-05); per-place totals may exceed the global count.

    Both parquets are read from ASSETS_DIR (the copies made by _run_dbt_build),
    NOT from DBT_SANDBOX_DIR (Pitfall 5 — reading from sandbox risks stale data).
    """
    if not occ_parquet.exists():
        raise FileNotFoundError(
            f"{occ_parquet} not found — run dbt before places-export"
        )
    if not bridge_parquet.exists():
        raise FileNotFoundError(
            f"{bridge_parquet} not found — run dbt before places-export"
        )
    rows = con.execute(
        """
        WITH occ AS (
            SELECT *,
                -- Option-B synthetic occ_id; mirrors occIdFromRow priority
                -- (src/occurrence.ts:23-30 — positionally coupled with the bridge).
                CASE
                    WHEN ecdysis_id IS NOT NULL THEN 'ecdysis:' || ecdysis_id
                    WHEN observation_id IS NOT NULL THEN 'inat:' || observation_id
                    WHEN specimen_observation_id IS NOT NULL THEN 'inat_obs:' || specimen_observation_id
                    WHEN checklist_id IS NOT NULL THEN 'checklist:' || checklist_id
                END AS occ_id
            FROM read_parquet(?)
        )
        SELECT
            b.place_slug,
            -- Canonical "confirmed specimen" predicate: ecdysis_id IS NOT NULL.
            -- Matches isSpecimenBacked() in src/occurrence.ts (the canonical cross-layer definition).
            -- Do NOT use is_provisional = false — that is true for both Ecdysis-backed rows AND
            -- sample-only iNat rows (ecdysis_id IS NULL, is_provisional = false).
            COUNT(DISTINCT CASE WHEN occ.ecdysis_id IS NOT NULL THEN occ.occ_id END) AS specimen_count,
            COUNT(DISTINCT CASE WHEN occ.sample_id IS NOT NULL THEN occ.sample_id END) AS sample_count
        FROM occ JOIN read_parquet(?) b ON b.occ_id = occ.occ_id
        GROUP BY b.place_slug
        """,
        [str(occ_parquet), str(bridge_parquet)],
    ).fetchall()
    return {row[0]: {"specimen_count": int(row[1]), "sample_count": int(row[2])} for row in rows}


# Shared occ_id synthesis CTE — identical priority to _query_counts / occIdFromRow
# (src/occurrence.ts:23-30). Reused by the per-place species and month queries so
# the bridge JOIN sees the same synthetic occ_id everywhere.
_OCC_ID_CTE = """
    WITH occ AS (
        SELECT *,
            CASE
                WHEN ecdysis_id IS NOT NULL THEN 'ecdysis:' || ecdysis_id
                WHEN observation_id IS NOT NULL THEN 'inat:' || observation_id
                WHEN specimen_observation_id IS NOT NULL THEN 'inat_obs:' || specimen_observation_id
                WHEN checklist_id IS NOT NULL THEN 'checklist:' || checklist_id
            END AS occ_id
        FROM read_parquet(?)
    )
"""

# Below this many dated records a peak month is noise, not signal (cyv / phase 1
# design: "don't fabricate a pattern from noise"). The month bars still render.
_PEAK_MIN_RECORDS = 10


def _query_species_by_place(
    con: duckdb.DuckDBPyConnection,
    occ_parquet: Path,
    bridge_parquet: Path,
    species_parquet: Path,
) -> dict[str, list[dict]]:
    """Per-place species-rank list grouped by genus (mirrors the collector page).

    Returns {slug: [{"genus": g, "species": [{"name", "slug", "count"}, ...]}, ...]}.
    Predicate tier='atlas' (includes uncatalogued specimens); species-rank only
    (sp.specific_epithet IS NOT NULL). Display name is the cased sp.scientificName;
    sp.slug links the /species/ page. Same taxon_id join as collectors_export.
    """
    if not species_parquet.exists():
        raise FileNotFoundError(
            f"{species_parquet} not found — run species-export before places-export"
        )
    rows = con.execute(
        _OCC_ID_CTE
        + """
        SELECT b.place_slug, sp.genus, sp.scientificName, sp.slug, COUNT(*) AS cnt
        FROM occ
        JOIN read_parquet(?) b ON b.occ_id = occ.occ_id
        LEFT JOIN read_parquet(?) sp ON sp.taxon_id = occ.taxon_id
        WHERE occ.tier = 'atlas' AND sp.specific_epithet IS NOT NULL
        GROUP BY b.place_slug, sp.genus, sp.scientificName, sp.slug
        ORDER BY b.place_slug, sp.genus, sp.scientificName
        """,
        [str(occ_parquet), str(bridge_parquet), str(species_parquet)],
    ).fetchall()
    # SQL ORDER BY (slug, genus, scientificName) makes dict insertion order correct;
    # genera come out alphabetical, species alphabetical within genus.
    by_slug: dict[str, dict[str, list]] = {}
    for slug, genus, sci, sp_slug, cnt in rows:
        genus_map = by_slug.setdefault(slug, {})
        genus_map.setdefault(genus, []).append(
            {"name": sci, "slug": sp_slug, "count": int(cnt)}
        )
    return {
        slug: [{"genus": g, "species": sp_list} for g, sp_list in genus_map.items()]
        for slug, genus_map in by_slug.items()
    }


def _query_collection_months(
    con: duckdb.DuckDBPyConnection,
    occ_parquet: Path,
    bridge_parquet: Path,
) -> dict[str, list[int]]:
    """Per-place collection-timing histogram: a 12-int array (index 0=Jan … 11=Dec)
    of atlas occurrences by collection month, aggregated across all years.

    Returns {slug: [12 ints]}. Months are the retrospective 'when were bees
    collected here' signal (peak-framed); rows lacking a month are excluded.
    """
    rows = con.execute(
        _OCC_ID_CTE
        + """
        SELECT b.place_slug, occ.month, COUNT(*) AS cnt
        FROM occ
        JOIN read_parquet(?) b ON b.occ_id = occ.occ_id
        WHERE occ.tier = 'atlas' AND occ.month IS NOT NULL
        GROUP BY b.place_slug, occ.month
        """,
        [str(occ_parquet), str(bridge_parquet)],
    ).fetchall()
    result: dict[str, list[int]] = {}
    for slug, month, cnt in rows:
        m = int(month)
        if 1 <= m <= 12:
            result.setdefault(slug, [0] * 12)[m - 1] = int(cnt)
    return result


def _query_target_hosts_by_place(
    con: duckdb.DuckDBPyConnection,
    occ_parquet: Path,
    bridge_parquet: Path,
) -> dict[str, list[dict]]:
    """Per-place native/endemic target hosts bees have been collected on (retrospective).

    Joins each place's atlas occurrences to the committed target_hosts seed by
    host-plant name — sample_host is an iNat-accepted binomial, the same namespace
    as target_hosts.canonical_name. Only WA-native/endemic plants (the seed) match,
    so bees-on-weeds (introduced hosts like Taraxacum, Leucanthemum) are correctly
    excluded; genus-only host IDs don't match the species-level seed. This is the
    retrospective 'target hosts seen productive here' layer; a prospective
    'target hosts observed here' layer (iNat plant obs in the polygon) is a follow-up.

    Returns {slug: [{"name", "family", "endemic" (bool), "count"}, ...]} sorted by
    record count desc.
    """
    if not _TARGET_HOSTS_CSV.exists():
        raise FileNotFoundError(f"{_TARGET_HOSTS_CSV} not found — the target_hosts seed is required")
    rows = con.execute(
        _OCC_ID_CTE
        + """
        SELECT b.place_slug, th.canonical_name, th.family, th.endemic, COUNT(*) AS cnt
        FROM occ
        JOIN read_parquet(?) b ON b.occ_id = occ.occ_id
        JOIN read_csv(?, header=true, all_varchar=true) th
          ON lower(th.canonical_name) = lower(occ.sample_host)
        WHERE occ.tier = 'atlas' AND occ.sample_host IS NOT NULL
        GROUP BY b.place_slug, th.canonical_name, th.family, th.endemic
        ORDER BY b.place_slug, cnt DESC, th.canonical_name
        """,
        [str(occ_parquet), str(bridge_parquet), str(_TARGET_HOSTS_CSV)],
    ).fetchall()
    by_slug: dict[str, list[dict]] = {}
    for slug, name, family, endemic, cnt in rows:
        by_slug.setdefault(slug, []).append(
            {"name": name, "family": family, "endemic": endemic == "Y", "count": int(cnt)}
        )
    return by_slug


def _write_place_details(
    species_by_place: dict[str, list[dict]],
    months_by_place: dict[str, list[int]],
    target_hosts_by_place: dict[str, list[dict]],
    out_path: Path,
) -> None:
    """Write place_details.json — the heavy per-place feed (species + timing).

    A build_time_fetch artifact (like collectors.json), NOT the committed
    places.json: it changes with every nightly occurrence update, so it flows
    through the S3/manifest fetch and _data/places.js merges it by slug.
    """
    records = []
    for slug in sorted(set(species_by_place) | set(months_by_place) | set(target_hosts_by_place)):
        months = months_by_place.get(slug, [0] * 12)
        dated_total = sum(months)
        peak_month = (
            months.index(max(months)) + 1 if dated_total >= _PEAK_MIN_RECORDS else None
        )
        records.append(
            {
                "slug": slug,
                "species_by_genus": species_by_place.get(slug, []),
                "collection_months": months,
                "dated_total": dated_total,
                "peak_month": peak_month,
                "target_hosts": target_hosts_by_place.get(slug, []),
            }
        )
    out_path.write_text(json.dumps(records, indent=2), encoding="utf-8")
    print(  # noqa: T201
        f"  place_details.json: {len(records):,} places, {out_path.stat().st_size:,} bytes"
    )


def _write_places_geojson(con: duckdb.DuckDBPyConnection, out_path: Path) -> None:
    """Write compact GeoJSON FeatureCollection (slug + geometry) to out_path.

    Uses separators=(',', ':') to match counties.geojson / ecoregions.geojson
    pattern — compact output suitable for a Mapbox source with promoteId: 'slug'.
    """
    rows = con.execute(
        "SELECT slug, name, ST_AsGeoJSON(geom) FROM geographies.places ORDER BY slug"
    ).fetchall()
    features = [
        {
            "type": "Feature",
            "properties": {"slug": slug, "name": name},
            "geometry": json.loads(geom_json),
        }
        for slug, name, geom_json in rows
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
        occ_parquet = ASSETS_DIR / "occurrences.parquet"
        bridge_parquet = ASSETS_DIR / "occurrence_places.parquet"
        places_meta = _load_place_metadata(_PLACES_TOML_PATH)
        counts = _query_counts(con, occ_parquet, bridge_parquet)
        _write_places_geojson(con, ASSETS_DIR / "places.geojson")
        _write_places_json(places_meta, counts, ASSETS_DIR / "places.json")

        # Heavy per-place feed (species + collection timing) — separate
        # build_time_fetch artifact, NOT the committed places.json.
        species_by_place = _query_species_by_place(
            con, occ_parquet, bridge_parquet, ASSETS_DIR / "species.parquet"
        )
        months_by_place = _query_collection_months(con, occ_parquet, bridge_parquet)
        target_hosts_by_place = _query_target_hosts_by_place(con, occ_parquet, bridge_parquet)
        _write_place_details(
            species_by_place, months_by_place, target_hosts_by_place,
            ASSETS_DIR / "place_details.json",
        )
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
