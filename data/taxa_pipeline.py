"""Phase 110 taxa pipeline.

Downloads taxa.csv.gz from iNaturalist Open Data (S3) with ETag/Last-Modified
caching and populates inaturalist_data.taxon_lineage_extended via a DuckDB
ancestry walk on the gzipped archive.

Replaces the live /v2/taxa API enricher (removed in Phase 110) with an offline
walk over all active Anthophila taxa,
eliminating API rate-limit risk and supporting Phase 111 (Checklist) lineage
lookup for species not yet observed in WABA.
"""

import json
import os
from pathlib import Path

import duckdb
import requests

DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))
RAW_DIR = Path(__file__).parent / "raw"
TAXA_URL = "https://inaturalist-open-data.s3.amazonaws.com/taxa.csv.gz"
TAXA_PATH = RAW_DIR / "taxa.csv.gz"
TAXA_CACHE_PATH = RAW_DIR / "taxa_cache.json"
ANTHOPHILA_ID = 630955


def download_taxa_csv() -> None:
    """Download taxa.csv.gz from iNat AWS Open Data with ETag/Last-Modified caching.

    On first run: downloads the full archive (37MB gzipped) and writes a sidecar
    JSON at TAXA_CACHE_PATH with the server's ETag and Last-Modified values.

    On subsequent runs: sends If-None-Match + If-Modified-Since headers; if the
    server returns 304 Not Modified, returns immediately without touching the file.

    Uses atomic write (download to .gz.tmp, then rename) to avoid partial files.
    """
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    headers: dict[str, str] = {}

    if TAXA_PATH.exists() and TAXA_CACHE_PATH.exists():
        cache = json.loads(TAXA_CACHE_PATH.read_text())
        if etag := cache.get("etag"):
            headers["If-None-Match"] = etag
        if last_modified := cache.get("last_modified"):
            headers["If-Modified-Since"] = last_modified

    resp = requests.get(TAXA_URL, headers=headers, stream=True, timeout=60)

    if resp.status_code == 304:
        print("taxa.csv.gz: unchanged (304), using cached copy")  # noqa: T201
        return

    resp.raise_for_status()

    # Atomic write: stream raw bytes to .tmp, then rename so partial downloads are
    # never visible. decode_content=False prevents requests from auto-decompressing
    # Content-Encoding: gzip responses — we need the actual gzip bytes on disk.
    tmp_path = TAXA_PATH.with_suffix(".gz.tmp")
    with open(tmp_path, "wb") as f:
        for chunk in resp.raw.stream(1024 * 1024, decode_content=False):
            f.write(chunk)
    tmp_path.rename(TAXA_PATH)

    if TAXA_PATH.read_bytes()[:2] != b"\x1f\x8b":
        content_type = resp.headers.get("Content-Type", "?")
        content_encoding = resp.headers.get("Content-Encoding", "none")
        TAXA_PATH.unlink()
        raise ValueError(
            f"taxa.csv.gz is not a GZIP stream after download "
            f"(Content-Type: {content_type}, Content-Encoding: {content_encoding}). "
            f"File deleted. Check {TAXA_URL}"
        )

    sidecar = {
        "etag": resp.headers.get("ETag"),
        "last_modified": resp.headers.get("Last-Modified"),
    }
    TAXA_CACHE_PATH.write_text(json.dumps(sidecar))

    size_mb = TAXA_PATH.stat().st_size / 1024**2
    print(f"taxa.csv.gz: downloaded {size_mb:.1f} MB")  # noqa: T201


def load_taxon_lineage_extended(db_path: str | None = None) -> None:
    """Populate inaturalist_data.taxon_lineage_extended from local taxa.csv.gz.

    Reads TAXA_PATH (gzip-compressed TSV), filters to active Anthophila taxa,
    walks the ancestry column via unnest(string_split(ancestry, '/')), and
    pivots the result into one column per rank:
      (taxon_id, family, subfamily, tribe, genus, subgenus)

    Produces the same table contract as the retired live enricher (Phase 110).
    Taxon scope is all active Anthophila (not just
    observed taxa) so Phase 111 (Checklist) can look up lineage for species with
    no WABA records yet.

    Anti-patterns avoided:
    - active = 'true' (string), not active = true (bool)
    - LIKE '%/630955/%' OR '%/630955' (not '%630955%' which false-matches 1630955)
    - UNION ALL self_rows arm included (ancestry column omits self)
    - target_taxon_id aliased to taxon_id in final SELECT
    """
    if db_path is None:
        db_path = DB_PATH

    con = duckdb.connect(db_path)
    try:
        con.execute("CREATE SCHEMA IF NOT EXISTS inaturalist_data")
        con.execute(
            """
            CREATE OR REPLACE TABLE inaturalist_data.taxon_lineage_extended AS
            WITH all_active_bees AS (
                -- All active taxa descended from Anthophila (taxon_id=630955).
                -- ancestry column is /-separated ancestor IDs, NOT including self.
                -- active column is string 'true'/'false', not a SQL boolean.
                SELECT taxon_id, ancestry, rank, name
                FROM read_csv(?, delim='\t', header=true, compression='gzip',
                              columns={'taxon_id':'BIGINT','ancestry':'VARCHAR',
                                       'rank_level':'INTEGER','rank':'VARCHAR',
                                       'name':'VARCHAR','active':'VARCHAR'})
                WHERE active = 'true'
                  AND (ancestry LIKE '%/630955/%' OR ancestry LIKE '%/630955'
                       OR taxon_id = 630955)
            ),
            -- Unnest ancestor IDs from the ancestry string
            ancestor_ids AS (
                SELECT
                    b.taxon_id AS target_taxon_id,
                    CAST(unnest(string_split(b.ancestry, '/')) AS BIGINT) AS ancestor_id
                FROM all_active_bees b
            ),
            -- Join ancestor IDs back to the taxa table to get rank/name
            ancestor_rows AS (
                SELECT ai.target_taxon_id, anc.rank, anc.name
                FROM ancestor_ids ai
                JOIN all_active_bees anc ON anc.taxon_id = ai.ancestor_id
                WHERE anc.rank IN ('family', 'subfamily', 'tribe', 'genus', 'subgenus')
            ),
            -- Include the taxon itself (genus/family taxa are NOT in their own ancestry)
            self_rows AS (
                SELECT taxon_id AS target_taxon_id, rank, name
                FROM all_active_bees
                WHERE rank IN ('family', 'subfamily', 'tribe', 'genus', 'subgenus')
            ),
            all_rows AS (
                SELECT * FROM ancestor_rows
                UNION ALL
                SELECT * FROM self_rows
            ),
            pivoted AS (
                PIVOT all_rows
                    ON rank IN ('family', 'subfamily', 'tribe', 'genus', 'subgenus')
                    USING first(name)
                    GROUP BY target_taxon_id
            )
            SELECT target_taxon_id AS taxon_id, family, subfamily, tribe, genus, subgenus
            FROM pivoted
            """,
            [str(TAXA_PATH)],
        )
        count = con.execute(
            "SELECT count(*) FROM inaturalist_data.taxon_lineage_extended"
        ).fetchone()[0]
        print(f"taxon_lineage_extended: {count} rows")  # noqa: T201
    finally:
        con.close()
