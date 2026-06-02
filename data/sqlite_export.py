"""Export the dbt-built occurrences table from DuckDB sandbox to a standalone SQLite file.

Usage (standalone):
    cd data && uv run python sqlite_export.py

The module can also be imported and called programmatically:
    from sqlite_export import generate_sqlite
    generate_sqlite(Path("dbt/target/sandbox/occurrences.parquet"), Path("/tmp/occurrences.db"))
"""

import json
import os
import sqlite3 as _sqlite3
from pathlib import Path

import duckdb

_DBT_SANDBOX = Path(__file__).parent / "dbt" / "target" / "sandbox"
_EXPORT_DIR = Path(os.environ.get(
    "EXPORT_DIR",
    str(Path(__file__).parent.parent / "public" / "data"),
))
_TAXA_PATH = Path(__file__).parent / "raw" / "taxa.csv.gz"
DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))

ANTHOPHILA_ID = 630955

_TAXA_READ_CSV_OPTS = """
    delim = chr(9), header = true, compression = 'gzip',
    columns = {
        taxon_id: BIGINT, ancestry: VARCHAR, rank_level: BIGINT,
        rank: VARCHAR, name: VARCHAR, active: VARCHAR
    }
"""


def _build_taxon_hierarchy(
    con: duckdb.DuckDBPyConnection,
    dst_db: Path,
    taxa_path: Path,
    db_path: str,
) -> None:
    """Build the taxa table in the already-ATTACHed occurrences.db.

    Receives an open DuckDB connection with 'out' already ATTACHed (TYPE sqlite)
    and out.occurrences already written.

    Strategy: create the empty taxa table via stdlib sqlite3 first (so the schema
    has NOT NULL constraints), then INSERT into out.taxa from DuckDB using NOT IN
    guards for deduplication. DuckDB's SQLite extension does not support the
    INSERT OR IGNORE / ON CONFLICT syntax; WHERE NOT IN (SELECT taxon_id FROM
    out.taxa) is the functionally equivalent substitute.

    PASS 1: Anthophila seed + ancestry-expansion load (D-04 constrained — NOT full clade).
    PASS 2: Bycatch taxa load (non-bee occurrence taxon_ids, is_anthophila=0).
    Then creates indexes on the taxa table.
    """
    # Create the taxa table in SQLite first (stdlib sqlite3, for full DDL support).
    with _sqlite3.connect(dst_db) as pre_con:
        pre_con.execute("""
            CREATE TABLE IF NOT EXISTS taxa (
                taxon_id     INTEGER PRIMARY KEY,
                rank         TEXT NOT NULL,
                name         TEXT NOT NULL,
                lineage_path TEXT,
                is_anthophila INTEGER NOT NULL
            )
        """)

    # ---- PASS 1: Anthophila, constrained (seed + ancestry-expansion) ----------
    #
    # Step (a) SEED — distinct Anthophila occurrence taxon_ids + checklist taxon_ids:
    #   Filter to taxa with ancestry LIKE '%/630955/%' OR ancestry LIKE '%/630955'
    #   OR taxon_id = 630955 in taxa.csv.gz.  We only take rows whose taxon_id
    #   appears in out.occurrences (D-04: not the full clade).
    #
    # Step (b) EXPAND — collect all ancestor taxon_ids from the seed rows via
    #   unnest(string_split(ancestry, '/')).
    #
    # Step (c) LOAD — insert seed ∪ ancestors (+ 630955 itself) from taxa.csv.gz.
    #
    # The checklist seed arm (ii) opens a second read-only DuckDB connection to
    # beeatlas.duckdb and degrades gracefully if unavailable in test contexts.

    # Collect checklist taxon_ids via the second connection (graceful degradation).
    checklist_ids: list[int] = []
    try:
        db_con = duckdb.connect(db_path, read_only=True)
        try:
            checklist_parquet = str(_DBT_SANDBOX / "checklist.parquet")
            rows = db_con.execute(
                """
                SELECT DISTINCT c.taxon_id
                FROM read_parquet(?) cl
                JOIN inaturalist_data.canonical_to_taxon_id c
                  ON c.canonical_name = cl.canonical_name
                """,
                [checklist_parquet],
            ).fetchall()
            checklist_ids = [r[0] for r in rows if r[0] is not None]
        finally:
            db_con.close()
    except (duckdb.CatalogException, duckdb.IOException):
        # Expected in test contexts: the checklist parquet, the
        # inaturalist_data.canonical_to_taxon_id table, or beeatlas.duckdb itself is
        # absent. Degrade gracefully — checklist-only seeds simply do not contribute.
        checklist_ids = []
    except Exception as e:  # noqa: BLE001
        # WR-02: any OTHER failure (schema drift, renamed column, corrupt parquet,
        # lock contention) used to be swallowed silently, shipping a nightly build
        # with degraded Anthophila coverage and no signal. Surface it loudly instead.
        print(f"WARNING: checklist seed failed, proceeding without it: {e}")  # noqa: T201
        checklist_ids = []

    # Check whether out.occurrences has a taxon_id column.
    # (Original test fixtures may not have one; taxa table stays empty in that case.)
    occ_cols = {
        row[0]
        for row in con.execute(
            "SELECT column_name FROM (DESCRIBE SELECT * FROM out.occurrences) WHERE column_name = 'taxon_id'"
        ).fetchall()
    }
    if "taxon_id" not in occ_cols:
        # No taxon_id column — create indexes and return without any inserts.
        with _sqlite3.connect(dst_db) as idx_con:
            idx_con.execute(
                "CREATE INDEX IF NOT EXISTS idx_taxa_lineage ON taxa(lineage_path)"
            )
            idx_con.execute(
                "CREATE INDEX IF NOT EXISTS idx_taxa_is_anthophila ON taxa(is_anthophila)"
            )
        return

    # Build the occurrence-seeded bee taxon_ids in DuckDB memory.
    # These are occurrence taxon_ids whose taxa.csv.gz row is active Anthophila.
    con.execute("""
        CREATE TEMP TABLE _bee_seed AS
        SELECT DISTINCT o.taxon_id
        FROM out.occurrences o
        JOIN read_csv(?, """ + _TAXA_READ_CSV_OPTS + """) t
          ON t.taxon_id = o.taxon_id
        WHERE o.taxon_id IS NOT NULL
          AND t.active = 'true'
          AND (
              t.ancestry LIKE '%/630955/%'
              OR t.ancestry LIKE '%/630955'
              OR t.taxon_id = 630955
          )
    """, [str(taxa_path)])

    # Add checklist taxon_ids to the seed (if any resolved).
    # CR-02: apply the same Anthophila ancestry guard the occurrence seed uses, so a
    # checklist canonical_name that resolves to an off-tree (non-Anthophila) taxon is
    # dropped before it can reach the Anthophila PASS 1 arm and produce an
    # is_anthophila=1 row with a malformed '//' lineage_path.
    if checklist_ids:
        placeholders = ", ".join("?" for _ in checklist_ids)
        con.execute(f"""
            INSERT INTO _bee_seed
            SELECT DISTINCT t.taxon_id
            FROM read_csv(?, {_TAXA_READ_CSV_OPTS}) t
            WHERE t.taxon_id IN ({placeholders})
              AND (
                  t.ancestry LIKE '%/630955/%'
                  OR t.ancestry LIKE '%/630955'
                  OR t.taxon_id = 630955
              )
              AND t.taxon_id NOT IN (SELECT taxon_id FROM _bee_seed)
        """, [str(taxa_path)] + checklist_ids)

    # Expand: seed ∪ ancestor taxon_ids AT/BELOW the Anthophila root ∪ root itself.
    # WR-01: unnest only the suffix of `ancestry` from 630955 onward, NOT the whole
    # string. Unnesting the full ancestry would pull in nodes ABOVE Anthophila
    # (Hexapoda, Insecta, order, etc.). Any such super-root node that happened to
    # satisfy the PASS 1 rank filter would be loaded with a regexp-anchored lineage
    # that cannot contain 630955, yielding a malformed '//' path. Anchoring the
    # expansion at 630955 removes that silent dependency on a rank-list coincidence.
    con.execute("""
        CREATE TEMP TABLE _bee_taxon_ids AS
        SELECT DISTINCT taxon_id FROM _bee_seed
        UNION
        SELECT DISTINCT CAST(
            unnest(string_split(
                regexp_extract(t.ancestry, '(630955(?:/[0-9]+)*)$', 1), '/'
            )) AS BIGINT
        ) AS ancestor_id
        FROM read_csv(?, """ + _TAXA_READ_CSV_OPTS + """) t
        WHERE t.taxon_id IN (SELECT taxon_id FROM _bee_seed)
          AND t.ancestry IS NOT NULL AND t.ancestry != ''
          AND regexp_extract(t.ancestry, '(630955(?:/[0-9]+)*)$', 1) != ''
        UNION
        SELECT CAST(""" + str(ANTHOPHILA_ID) + """ AS BIGINT)
    """, [str(taxa_path)])

    # PASS 1 LOAD: INSERT INTO out.taxa (Anthophila arm).
    # WHERE NOT IN (SELECT taxon_id FROM out.taxa) is the INSERT OR IGNORE equivalent
    # for DuckDB's SQLite extension (which does not support ON CONFLICT syntax).
    # active = 'true' (string literal — boolean TRUE matches zero rows, Pitfall 4).
    # rank IN (...) includes 'complex' per Pitfall 6 and 'subtribe' because the
    # ancestry-expansion step (_bee_taxon_ids) includes all ancestor taxon_ids —
    # some lineage paths pass through subtribe nodes; omitting subtribe from the
    # rank filter causes those nodes to be missing from the taxa table, which fires
    # the _assert_no_orphan_taxon_ids missing-parent check (Rule 1 auto-fix).
    # CR-01: the list also includes the iNat infraspecific ranks ('subspecies',
    # 'variety', 'form', 'infrahybrid', 'hybrid') so an occurrence identified to a
    # sub-species Anthophila taxon is owned by PASS 1 (is_anthophila=1 + real
    # lineage) instead of falling through to the PASS 2 bycatch arm.
    # lineage_path via regexp_extract anchored at 630955.
    # WR-01: the outer `lineage_path LIKE '/630955/%'` guard rejects any row whose
    # constructed lineage does not begin at the Anthophila root, so a malformed '//'
    # path can never be inserted here even if a non-descendant slips into
    # _bee_taxon_ids. Combined with the 630955-anchored ancestor expansion above this
    # makes the well-formedness invariant structural rather than coincidental.
    con.execute("""
        INSERT INTO out.taxa
        SELECT lp.taxon_id, lp.rank, lp.name, lp.lineage_path, lp.is_anthophila
        FROM (
            SELECT
                t.taxon_id,
                t.rank,
                t.name,
                '/' || regexp_extract(
                    t.ancestry || '/' || CAST(t.taxon_id AS VARCHAR),
                    '(630955(?:/[0-9]+)*)$',
                    1
                ) || '/' AS lineage_path,
                1 AS is_anthophila
            FROM read_csv(?, """ + _TAXA_READ_CSV_OPTS + """) t
            WHERE t.taxon_id IN (SELECT taxon_id FROM _bee_taxon_ids)
              AND t.rank IN (
                  'family', 'subfamily', 'tribe', 'subtribe', 'genus', 'subgenus',
                  'complex', 'species', 'subspecies', 'variety', 'form',
                  'infrahybrid', 'hybrid'
              )
              AND t.taxon_id NOT IN (SELECT taxon_id FROM out.taxa)
            QUALIFY ROW_NUMBER() OVER (PARTITION BY t.taxon_id ORDER BY t.taxon_id) = 1
        ) lp
        WHERE lp.lineage_path LIKE '/630955/%'
    """, [str(taxa_path)])

    # PASS 2: INSERT INTO out.taxa (bycatch arm).
    # Every occurrence taxon_id NOT already in out.taxa (i.e. not Anthophila) gets
    # its own finest-rank row with is_anthophila=0 and lineage_path NULL.
    # NO active filter (Pitfall 5 — bycatch taxa may be inactive but were valid at ingest).
    #
    # CR-01: explicitly exclude any taxon whose taxa.csv.gz ancestry places it within
    # Anthophila (any rank). A genuine bee identified to subspecies/variety/form is
    # now owned by PASS 1, but this NOT(...) guard ensures such a taxon can never
    # reach the bycatch arm even if PASS 1's rank list is later narrowed — a real bee
    # must never be stamped is_anthophila=0 with a NULL lineage. If such a taxon is
    # excluded here yet not built by PASS 1, it becomes an orphan and the post-build
    # gate fails loudly (the intended outcome) rather than silently mislabeling.
    con.execute("""
        INSERT INTO out.taxa
        SELECT
            t.taxon_id,
            t.rank,
            t.name,
            NULL AS lineage_path,
            0 AS is_anthophila
        FROM read_csv(?, """ + _TAXA_READ_CSV_OPTS + """) t
        WHERE t.taxon_id IN (
            SELECT DISTINCT taxon_id
            FROM out.occurrences
            WHERE taxon_id IS NOT NULL
              AND taxon_id NOT IN (SELECT taxon_id FROM out.taxa)
        )
          AND NOT (
              t.ancestry LIKE '%/630955/%'
              OR t.ancestry LIKE '%/630955'
              OR t.taxon_id = 630955
          )
        QUALIFY ROW_NUMBER() OVER (PARTITION BY t.taxon_id ORDER BY t.taxon_id) = 1
    """, [str(taxa_path)])

    # ---- Drop temp tables -----------------------------------------------------
    con.execute("DROP TABLE IF EXISTS _bee_seed")
    con.execute("DROP TABLE IF EXISTS _bee_taxon_ids")

    # ---- Indexes (via stdlib sqlite3 after DuckDB write) ----------------------
    with _sqlite3.connect(dst_db) as idx_con:
        idx_con.execute(
            "CREATE INDEX IF NOT EXISTS idx_taxa_lineage ON taxa(lineage_path)"
        )
        idx_con.execute(
            "CREATE INDEX IF NOT EXISTS idx_taxa_is_anthophila ON taxa(is_anthophila)"
        )


def _assert_no_orphan_taxon_ids(db_path: Path) -> None:
    """Fail the pipeline if any non-null occurrence taxon_id has no taxa entry,
    or if any Anthophila lineage_path segment references a missing-parent taxon_id.

    Both checks raise ValueError (message contains "orphan") if violations are found.
    This is a hard nightly-gate fail (HIER-04).
    """
    with _sqlite3.connect(db_path) as con:
        # If occurrences has no taxon_id column, there is nothing to check.
        occ_cols = {row[1] for row in con.execute("PRAGMA table_info(occurrences)").fetchall()}
        if "taxon_id" not in occ_cols:
            return

        # Check 1: orphan occurrence taxon_ids
        (orphan_count,) = con.execute(
            """
            SELECT COUNT(*) FROM occurrences
            WHERE taxon_id IS NOT NULL
              AND taxon_id NOT IN (SELECT taxon_id FROM taxa)
            """
        ).fetchone()
        if orphan_count > 0:
            raise ValueError(
                f"Hierarchy build incomplete: {orphan_count} occurrence taxon_id orphan "
                f"values have no entry in the taxa table."
            )

        # Check 2: missing-parent taxon_ids inside Anthophila lineage_paths
        # Collect all taxon_ids that appear as lineage_path segments (excluding 630955 root)
        # and verify each resolves to a taxa row.
        lineage_rows = con.execute(
            "SELECT taxon_id, lineage_path FROM taxa WHERE lineage_path IS NOT NULL"
        ).fetchall()
        all_taxa_ids = {
            row[0]
            for row in con.execute("SELECT taxon_id FROM taxa").fetchall()
        }

    # Parse each lineage_path string into its segment taxon_ids.
    # Format: '/630955/.../self_id/' — split on '/', filter empty strings and the
    # Anthophila root (630955 is always present; it has no parent to check).
    missing_parents: set[int] = set()
    for _taxon_id, lineage_path in lineage_rows:
        segments = lineage_path.strip("/").split("/")
        for seg in segments:
            if not seg:
                continue
            try:
                seg_id = int(seg)
            except ValueError:
                continue
            if seg_id == ANTHOPHILA_ID:
                continue  # root has no parent to check
            if seg_id not in all_taxa_ids:
                missing_parents.add(seg_id)

    if missing_parents:
        count = len(missing_parents)
        raise ValueError(
            f"Hierarchy build incomplete: {count} lineage_path segment orphan / "
            f"missing-parent taxon_ids have no entry in the taxa table: "
            f"{sorted(missing_parents)[:10]}{'...' if count > 10 else ''}"
        )


def generate_sqlite(
    src_parquet: Path,
    dst_db: Path,
    taxa_path: Path | None = None,
    db_path: str | None = None,
) -> None:
    """Export *src_parquet* into a SQLite database at *dst_db*.

    The destination schema is derived entirely from the parquet file —
    no hardcoded CREATE TABLE statement. Overwrites *dst_db* if it exists.

    Args:
        src_parquet: Path to the source Parquet file (typically occurrences.parquet
                     produced by dbt).
        dst_db: Destination path for the SQLite database file.
        taxa_path: Path to taxa.csv.gz (defaults to _TAXA_PATH). Injectable for tests.
        db_path: Path to beeatlas.duckdb for checklist join (defaults to DB_PATH).
                 Injectable for tests.
    """
    taxa_path = taxa_path or _TAXA_PATH
    db_path = db_path or DB_PATH

    # Remove any pre-existing file so ATTACH creates a fresh database.
    if dst_db.exists():
        dst_db.unlink()

    con = duckdb.connect(":memory:")
    try:
        con.execute("INSTALL sqlite; LOAD sqlite;")
        con.execute(f"ATTACH '{dst_db}' AS out (TYPE sqlite)")
        con.execute(
            f"CREATE TABLE out.occurrences AS SELECT * FROM read_parquet('{src_parquet}')"
        )
        # Build taxa hierarchy while 'out' is still ATTACHed.
        _build_taxon_hierarchy(con, dst_db, taxa_path, db_path)
        con.execute("DETACH out")
    finally:
        con.close()

    # Post-build hard gate: assert no orphan occurrence taxon_ids or missing-parent
    # lineage_path segments before writing geo_blob.
    _assert_no_orphan_taxon_ids(dst_db)

    # Pre-serialize geo rows as a single TEXT blob so the browser worker fetches them
    # with one SQL query and one WASM→JS callback (vs 92K callbacks = ~600 ms in Firefox).
    # Column order: [lat, lon, ecdysis_id, observation_id, specimen_observation_id,
    #                year, scientificName, genus, family, source]
    _GEO_COLS = [
        "lat", "lon", "ecdysis_id", "observation_id", "specimen_observation_id",
        "year", "scientificName", "genus", "family", "source",
    ]
    with _sqlite3.connect(dst_db) as idx_con:
        actual = {row[1] for row in idx_con.execute("PRAGMA table_info(occurrences)").fetchall()}
        select_expr = ", ".join(c if c in actual else f"NULL AS {c}" for c in _GEO_COLS)
        cur = idx_con.execute(
            f"SELECT {select_expr} "
            "FROM occurrences WHERE lat IS NOT NULL AND lon IS NOT NULL"
        )
        geo_json = json.dumps(cur.fetchall())
        idx_con.execute("CREATE TABLE geo_blob(data TEXT NOT NULL)")
        idx_con.execute("INSERT INTO geo_blob(data) VALUES (?)", (geo_json,))


def main() -> None:
    """Read occurrences.parquet from _DBT_SANDBOX and write occurrences.db to _EXPORT_DIR."""
    _EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    src = _DBT_SANDBOX / "occurrences.parquet"
    dst = _EXPORT_DIR / "occurrences.db"
    generate_sqlite(src, dst)
    size_mb = dst.stat().st_size / (1024 * 1024)
    print(f"occurrences.db written to {dst} ({size_mb:.1f} MB)")  # noqa: T201


if __name__ == "__main__":
    main()
