"""Export per-collector event feed for the frontend (STREAM-01/02/03).

Writes:
    ASSETS_DIR/collectors.json          — extended in place: adds first_page_events,
                                          total_event_pages, total_event_count without
                                          touching any existing key (display_name, etc.)
    ASSETS_DIR/collector_event_pages.json — flat array of sub-page descriptors for
                                          pages 2+ (compact JSON, ~24 MB build artifact)

Runs AFTER collectors-export: reads the collectors.json written by that step and
rewrites it with the event fields appended.

D-CARD-02 slug resolution (rank-aware, bee classification via JSON taxon files):
    1. Synonym-normalized species name matches species.json → /species/{Genus}/{epithet}/
    2. Subspecies trinomial: strip 3rd token and retry binomial match
    2b. Subgenus parenthetical: "Genus (Subgenus)" → first token in genus_map → genus page
    3. First-token genus fallback: first token of scientific_name in genus_map
       → /species/{Genus}/ (genus page). Recovers "Hylaeus polifolii", "Lasioglossum foxii", etc.
       when identifications.genus column is empty.
    4. identifications.genus column fallback in genus_map → genus page
    5. Unresolved non-bee bycatch → species_slug=None

    iNat fallback (D-CARD-02 Part 2): when species_slug is None and the name is named
    (not blank / not "undetermined"), emit inat_url for the iNaturalist taxon search page.
    Mutually exclusive with species_slug: bee → BeeAtlas; non-bee named → iNat; undetermined → text.

    genus_map is built from ASSETS_DIR/species.json (genus-level pages) +
    ASSETS_DIR/higher_taxa.json (bee genera, rank="genus"). These are the same files
    the frontend uses, ensuring consistent coverage of all 47 known bee genera.

Usage:
    cd data && EVENT_CHUNK_SIZE=100 uv run python collectors_events_export.py
"""

import csv
import json
import os
from pathlib import Path
from urllib.parse import quote

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
        canonical_name,
        catalog_number
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
        NULL::VARCHAR                                                   AS genus,
        cs.catalog_number                                               AS catalog_number
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
        NULLIF(i.genus, '')                                             AS genus,
        cs.catalog_number                                               AS catalog_number
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


def _load_species_maps(assets_dir: Path) -> tuple[dict, dict]:
    """Return (species_by_name, genus_map) from species.json + higher_taxa.json.

    species_by_name : {lower(canonical_name): (slug, scientificName)}
                      All taxon pages (species + genus) from species.json.
    genus_map       : {lower(name): slug}
                      Genus-level pages from species.json (no specific_epithet) plus
                      all bee genera from higher_taxa.json (rank="genus"). Covers all
                      47 known bee genera, including those with only species pages.
                      Used by _resolve_slug steps 2b, 3, and 4.
    """
    species_json_path = assets_dir / "species.json"
    higher_taxa_path = assets_dir / "higher_taxa.json"

    species_by_name: dict[str, tuple[str, str]] = {}
    genus_map: dict[str, str] = {}

    # species.json: canonical source of taxon slugs (species + genus-level pages).
    for entry in json.loads(species_json_path.read_text(encoding="utf-8")):
        cn = (entry.get("canonical_name") or "").strip()
        slug = (entry.get("slug") or "").strip()
        sci = (entry.get("scientificName") or "").strip()
        if cn and slug:
            species_by_name[cn.lower()] = (slug, sci or cn)
        # Genus-level pages have no specific_epithet; add to genus_map.
        specific_epithet = (entry.get("specific_epithet") or "").strip()
        if cn and slug and not specific_epithet:
            genus_map[cn.lower()] = slug

    # higher_taxa.json: bee genera (rank="genus") complete the genus_map for genera
    # that have species pages but no separate genus-level entry in species.json.
    for entry in json.loads(higher_taxa_path.read_text(encoding="utf-8")):
        name = (entry.get("name") or "").strip()
        rank = entry.get("rank") or ""
        if name and rank == "genus":
            # setdefault: don't overwrite if species.json already provided the slug.
            genus_map.setdefault(name.lower(), name)

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

    # Step 2: subspecies trinomial — strip 3rd token and retry
    if len(parts) >= 3:
        binomial = parts[0] + " " + parts[1]
        if binomial in species_by_name:
            slug, _ = species_by_name[binomial]
            return slug, species_name

    # Step 2b: subgenus parenthetical — "Genus (Subgenus)" → genus page.
    # Detects the pattern where the second token is fully parenthesized, e.g.
    # "Lasioglossum (Dialictus)" → first token "lasioglossum" in genus_map → genus page.
    # The genus-page link (/species/{Genus}/) is the safe default; a subgenus-specific
    # page would require a separate lookup not warranted for this pattern.
    if len(parts) == 2 and parts[1].startswith("(") and parts[1].endswith(")"):
        genus_token = parts[0]
        if genus_token in genus_map:
            return genus_map[genus_token], species_name

    # Step 3: first-token genus fallback.
    # When the full name and binomial don't match, take the first whitespace token of
    # scientific_name as the genus. Recovers names like "Hylaeus polifolii" or
    # "Lasioglossum foxii" when identifications.genus is empty (step 4 wouldn't fire).
    first_token = parts[0] if parts else ""
    if first_token and first_token in genus_map:
        return genus_map[first_token], species_name

    # Step 4: fallback to identifications.genus column
    if genus_col:
        genus_lower = genus_col.strip().lower()
        if genus_lower in genus_map:
            return genus_map[genus_lower], species_name

    # Step 5: unresolved — non-bee bycatch (Diptera, Chrysididae, etc.) or truly undetermined
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
    species_json = ASSETS_DIR / "species.json"
    higher_taxa_json = ASSETS_DIR / "higher_taxa.json"
    collectors_json = ASSETS_DIR / "collectors.json"

    if not occ_parquet.exists():
        raise FileNotFoundError(
            f"{occ_parquet} not found — run dbt-build before collectors-events-export"
        )
    if not species_json.exists():
        raise FileNotFoundError(
            f"{species_json} not found — run species-export before collectors-events-export"
        )
    if not higher_taxa_json.exists():
        raise FileNotFoundError(
            f"{higher_taxa_json} not found — run higher-taxa-export before collectors-events-export"
        )
    if not collectors_json.exists():
        raise FileNotFoundError(
            f"{collectors_json} not found — run collectors-export before collectors-events-export"
        )

    # Load slug resolution dictionaries (synonym map + species_by_name + genus_map).
    # species.json + higher_taxa.json are the same files the frontend uses, ensuring
    # consistent coverage of all 47 known bee genera.
    synonym_map = _load_synonyms()
    species_by_name, genus_map = _load_species_maps(ASSETS_DIR)

    # Single batch query: all WABA collectors' events in one pass (Pattern 3).
    # The query JOINs ecdysis_data.identifications (live duckdb) with
    # read_parquet(occurrences.parquet), so the connection must be open.
    rows = con.execute(_QUERY, [str(occ_parquet)]).fetchall()

    # Pass 1: find the earliest sort_ts for each (login, ecdysis_id) pair among
    # Identified events. This determines which determination was first chronologically
    # (is_reidentification=False) vs. later (is_reidentification=True).
    # The query returns sort_ts DESC so we track the minimum by comparing.
    earliest_id_ts: dict[tuple, object] = {}
    for row in rows:
        (
            login, event_type, _species_name, _determiner, _is_current,
            _is_pending, sort_ts, ecdysis_id, _genus_col, _catalog_number,
        ) = row
        if event_type == "Identified" and ecdysis_id is not None and sort_ts is not None:
            key = (login, ecdysis_id)
            if key not in earliest_id_ts or sort_ts < earliest_id_ts[key]:
                earliest_id_ts[key] = sort_ts

    # Names that resolve to None slug AND should remain plain text (not iNat URL).
    _UNDETERMINED: frozenset[str] = frozenset({"undetermined"})

    # Pass 2: Group rows by login preserving ORDER BY order (login ASC, sort_ts DESC).
    events_by_login: dict[str, list[dict]] = {}
    for row in rows:
        (
            login, event_type, species_name, determiner, is_current,
            is_pending, sort_ts, ecdysis_id, genus_col, catalog_number,
        ) = row

        # Compute YYYY-MM-DD display date from sort_ts (sort order implicit in array position)
        event_date = sort_ts.date().isoformat() if sort_ts is not None else None

        # Rank-aware slug + display name resolution
        slug, display = _resolve_slug(
            species_name, event_type, genus_col,
            synonym_map, species_by_name, genus_map,
        )

        # is_reidentification: True when this Identified event is NOT the earliest
        # determination for this specimen (chronological order, not is_current).
        # Collected events and Identified events with no ecdysis_id carry None.
        if event_type == "Identified" and ecdysis_id is not None:
            key = (login, ecdysis_id)
            is_reidentification: bool | None = (sort_ts != earliest_id_ts.get(key))
        else:
            is_reidentification = None

        # iNat fallback: named non-bee determinations (slug=None, not undetermined) get
        # an iNaturalist taxon URL. `/taxa/{name}` resolves the name and redirects to the
        # canonical taxon page (the `/taxa/search?q=` results UI is poor). Mutually
        # exclusive with species_slug. URL-encode the raw name so spaces/special chars are
        # safe (e.g. binomial 'Oxybelus uniglumis' -> 'Oxybelus%20uniglumis').
        inat_url: str | None = None
        if slug is None and display and display.lower().strip() not in _UNDETERMINED:
            inat_url = (
                "https://www.inaturalist.org/taxa/"
                + quote(species_name or display)
            )

        event: dict = {
            "event_type": event_type,
            "event_date": event_date,
            "species_name": display,
            "species_slug": slug,
            "inat_url": inat_url,
            "determiner": determiner,
            "is_current": bool(is_current) if is_current is not None else None,
            "is_pending": bool(is_pending),
            "catalog_number": catalog_number,
            "ecdysis_id": ecdysis_id,
            "is_reidentification": is_reidentification,
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
