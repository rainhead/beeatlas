"""Export per-collector event feed for the frontend (STREAM-01/02/03).

Writes:
    ASSETS_DIR/collectors.json          — extended in place: adds first_page_events,
                                          total_event_pages, total_event_count without
                                          touching any existing key (display_name, etc.)
    ASSETS_DIR/collector_event_pages.json — flat array of sub-page descriptors for
                                          pages 2+ (compact JSON, ~24 MB build artifact)

Runs AFTER collectors-export: reads the collectors.json written by that step and
rewrites it with the event fields appended.

D-CARD-02 slug resolution (ORCHESTRATOR CORRECTION — rank-aware):
    1. Synonym-normalized species name matches species.parquet → /species/{Genus}/{epithet}/
    2. Subspecies trinomial: strip 3rd token and retry binomial match
    3. First token (or identifications.genus column) matches a genus in species.parquet
       → /species/{Genus}/ (genus page)
    4. Else (undetermined, non-bee, not-in-atlas) → species_slug=None (plain text)

Usage:
    cd data && EVENT_CHUNK_SIZE=100 uv run python collectors_events_export.py
"""

import csv
import json
import os
from pathlib import Path

import duckdb

DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))
_default_assets = str(Path(__file__).parent.parent / "public" / "data")
ASSETS_DIR = Path(os.environ.get("EXPORT_DIR", _default_assets))

# Chunk size for 2D pagination (STREAM-03 / D-PAGE-01).
# Override via EVENT_CHUNK_SIZE env var for testing deterministic pagination.
CHUNK_SIZE = int(os.environ.get("EVENT_CHUNK_SIZE", "100"))

# Phase 123 taxon synonym seed (texanus → subtilior, etc.)
_SYNONYMS_CSV = Path(__file__).parent / "dbt" / "seeds" / "occurrence_synonyms.csv"


# ---------------------------------------------------------------------------
# Batch event query
# ---------------------------------------------------------------------------

_QUERY = """
WITH collector_specimens AS (
    SELECT
        collector_inat_login,
        ecdysis_id,
        date,
        record_type,
        canonical_name
    FROM read_parquet(?)
    WHERE collector_inat_login IS NOT NULL
      AND (ecdysis_id IS NOT NULL OR record_type = 'waba_specimen')
),
collected_events AS (
    SELECT
        cs.collector_inat_login                                         AS login,
        'Collected'                                                     AS event_type,
        cs.canonical_name                                               AS species_name,
        NULL::VARCHAR                                                   AS determiner,
        NULL::BOOLEAN                                                   AS is_current,
        (cs.record_type = 'waba_specimen' AND cs.ecdysis_id IS NULL)   AS is_pending,
        TRY_CAST(cs.date || 'T00:00:00+00:00' AS TIMESTAMPTZ)          AS sort_ts,
        cs.ecdysis_id                                                   AS ecdysis_id,
        NULL::VARCHAR                                                   AS genus
    FROM collector_specimens cs
),
identified_events AS (
    SELECT
        cs.collector_inat_login                                         AS login,
        'Identified'                                                    AS event_type,
        NULLIF(i.scientific_name, '')                                   AS species_name,
        NULLIF(i.identified_by, '')                                     AS determiner,
        (i.identification_is_current = '1')                             AS is_current,
        false                                                           AS is_pending,
        i.modified                                                      AS sort_ts,
        cs.ecdysis_id                                                   AS ecdysis_id,
        NULLIF(i.genus, '')                                             AS genus
    FROM collector_specimens cs
    JOIN ecdysis_data.identifications i
        ON i.coreid = CAST(cs.ecdysis_id AS VARCHAR)
    WHERE cs.ecdysis_id IS NOT NULL
      AND i.scientific_name IS NOT NULL
      AND i.scientific_name != ''
)
SELECT * FROM collected_events
UNION ALL
SELECT * FROM identified_events
ORDER BY login, sort_ts DESC NULLS LAST, ecdysis_id ASC NULLS LAST
"""


# ---------------------------------------------------------------------------
# Slug + synonym helpers
# ---------------------------------------------------------------------------


def _load_synonyms() -> dict[str, str]:
    """Load occurrence_synonyms.csv → {lower(synonym): lower(accepted_name)}."""
    synonym_map: dict[str, str] = {}
    if not _SYNONYMS_CSV.exists():
        return synonym_map
    with _SYNONYMS_CSV.open(newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            s = row.get("synonym", "").strip()
            a = row.get("accepted_name", "").strip()
            if s and a:
                synonym_map[s.lower()] = a.lower()
    return synonym_map


def _load_species_maps(
    con: duckdb.DuckDBPyConnection, species_parquet: Path
) -> tuple[dict, dict]:
    """Return (species_by_name, genus_map) from ASSETS_DIR/species.parquet.

    species_by_name : {lower(canonical_name): (slug, scientificName)}
    genus_map       : {lower(genus): Genus}  — genus pages in the atlas
    """
    rows = con.execute(
        "SELECT lower(canonical_name), slug, scientificName, lower(genus), genus"
        " FROM read_parquet(?)",
        [str(species_parquet)],
    ).fetchall()

    species_by_name: dict[str, tuple[str, str]] = {}
    genus_map: dict[str, str] = {}
    for lower_cn, slug, sci_name, lower_genus, genus in rows:
        if lower_cn and slug:
            species_by_name[lower_cn] = (slug, sci_name or lower_cn)
        if lower_genus and genus:
            genus_map[lower_genus] = genus
    return species_by_name, genus_map


def _resolve_slug(
    species_name: str | None,
    event_type: str,
    genus_col: str | None,
    synonym_map: dict[str, str],
    species_by_name: dict[str, tuple[str, str]],
    genus_map: dict[str, str],
) -> tuple[str | None, str | None]:
    """Rank-aware slug resolution — returns (species_slug, display_name).

    Resolution order (ORCHESTRATOR CORRECTION):
    1. Synonym-normalised name matches species_by_name → species slug
    2. Subspecies trinomial: strip 3rd token (infra-epithet) → retry binomial
    3. First token of name in genus_map → genus slug
    4. Fallback to identifications.genus column in genus_map
    5. Unresolved → slug=None

    For Collected events, if the name resolves to a species, the display_name
    is normalised to the proper-case scientificName from species.parquet
    (canonical_name in the mart is lowercase).
    For Identified events the original identification string is preserved as-is.
    """
    if not species_name:
        return None, None

    # Step 1: synonym normalisation then species lookup
    key = synonym_map.get(species_name.lower(), species_name.lower())
    parts = key.split()

    if key in species_by_name:
        slug, sci_name = species_by_name[key]
        display = sci_name if event_type == "Collected" else species_name
        return slug, display

    # Step 2: subspecies — strip 3rd token and retry
    if len(parts) >= 3:
        binomial = parts[0] + " " + parts[1]
        if binomial in species_by_name:
            slug, _ = species_by_name[binomial]
            return slug, species_name

    # Step 3: first token in genus_map (e.g. "Lasioglossum" determination)
    first_token = parts[0] if parts else ""
    if first_token and first_token in genus_map:
        return genus_map[first_token], species_name

    # Step 4: fallback to identifications.genus column
    if genus_col:
        genus_lower = genus_col.strip().lower()
        if genus_lower in genus_map:
            return genus_map[genus_lower], species_name

    # Step 5: unresolved (undetermined, non-bee, not-in-atlas)
    return None, species_name


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def export_collector_events(con: duckdb.DuckDBPyConnection) -> None:
    """Extend collectors.json with event-feed fields and write collector_event_pages.json.

    Reads ASSETS_DIR/occurrences.parquet (Pitfall 5: always ASSETS_DIR, not the
    dbt build target) and ASSETS_DIR/species.parquet for slug resolution, plus
    ecdysis_data.identifications from the open DuckDB connection.
    """
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    occ_parquet = ASSETS_DIR / "occurrences.parquet"
    species_parquet = ASSETS_DIR / "species.parquet"
    collectors_json = ASSETS_DIR / "collectors.json"

    if not occ_parquet.exists():
        raise FileNotFoundError(
            f"{occ_parquet} not found — run dbt-build before collectors-events-export"
        )
    if not species_parquet.exists():
        raise FileNotFoundError(
            f"{species_parquet} not found — run species-export before collectors-events-export"
        )
    if not collectors_json.exists():
        raise FileNotFoundError(
            f"{collectors_json} not found — run collectors-export before collectors-events-export"
        )

    # Load slug resolution dictionaries (synonym map + species_by_name + genus_map)
    synonym_map = _load_synonyms()
    species_by_name, genus_map = _load_species_maps(con, species_parquet)

    # Single batch query: all WABA collectors' events in one pass (Pattern 3).
    # The query JOINs ecdysis_data.identifications (live duckdb) with
    # read_parquet(occurrences.parquet), so the connection must be open.
    rows = con.execute(_QUERY, [str(occ_parquet)]).fetchall()

    # Group rows by login preserving ORDER BY order (login ASC, sort_ts DESC).
    events_by_login: dict[str, list[dict]] = {}
    for row in rows:
        (
            login, event_type, species_name, determiner, is_current,
            is_pending, sort_ts, _ecdysis_id, genus_col,
        ) = row

        # Compute YYYY-MM-DD display date from sort_ts (sort order implicit in array position)
        event_date = sort_ts.date().isoformat() if sort_ts is not None else None

        # Rank-aware slug + display name resolution
        slug, display = _resolve_slug(
            species_name, event_type, genus_col,
            synonym_map, species_by_name, genus_map,
        )

        event: dict = {
            "event_type": event_type,
            "event_date": event_date,
            "species_name": display,
            "species_slug": slug,
            "determiner": determiner,
            "is_current": bool(is_current) if is_current is not None else None,
            "is_pending": bool(is_pending),
        }
        events_by_login.setdefault(login, []).append(event)

    # Load existing collectors.json; extend records in place without recomputing
    # any existing key (display_name, specimen_count, etc. must not change).
    collectors: list[dict] = json.loads(collectors_json.read_text(encoding="utf-8"))
    collector_map: dict[str, dict] = {c["login"]: c for c in collectors}

    sub_page_descriptors: list[dict] = []
    for login, events in events_by_login.items():
        chunks = [events[i : i + CHUNK_SIZE] for i in range(0, len(events), CHUNK_SIZE)]
        total_pages = len(chunks)
        rec = collector_map.get(login)
        if rec is not None:
            rec["first_page_events"] = chunks[0] if chunks else []
            rec["total_event_pages"] = total_pages
            rec["total_event_count"] = len(events)
        # Pages 2+ go into the flat sub-page descriptor array (D-PAGE-01)
        for page_num, chunk in enumerate(chunks[1:], start=2):
            sub_page_descriptors.append({
                "login": login,
                "page_num": page_num,
                "total_pages": total_pages,
                "events": chunk,
            })

    # Collectors with zero events (sample-host-only, D-EMPTY) get empty defaults
    for rec in collectors:
        rec.setdefault("first_page_events", [])
        rec.setdefault("total_event_pages", 0)
        rec.setdefault("total_event_count", 0)

    # Write extended collectors.json (human-readable indent to match existing style)
    out_path = ASSETS_DIR / "collectors.json"
    out_path.write_text(json.dumps(collectors, indent=2), encoding="utf-8")
    print(  # noqa: T201
        f"  collectors.json: {len(collectors):,} collectors, "
        f"{out_path.stat().st_size:,} bytes"
    )

    # Write collector_event_pages.json (compact — keeps the ~24 MB file smaller)
    out_path2 = ASSETS_DIR / "collector_event_pages.json"
    out_path2.write_text(json.dumps(sub_page_descriptors), encoding="utf-8")
    print(  # noqa: T201
        f"  collector_event_pages.json: {len(sub_page_descriptors):,} sub-pages, "
        f"{out_path2.stat().st_size:,} bytes"
    )


def export_collectors_events_step() -> None:
    """Zero-argument wrapper for inclusion in run.py STEPS list."""
    con = duckdb.connect(DB_PATH)
    try:
        export_collector_events(con)
    finally:
        con.close()


if __name__ == "__main__":
    export_collectors_events_step()
