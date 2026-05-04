"""Phase 77 — resolve canonical_name → iNat taxon_id, persist as bridge table.

Source SQL: FULL OUTER union of checklist + ecdysis canonical_name LEFT JOIN bridge.
Pacing + retry: reuses _inat_get_with_retry from inaturalist_pipeline.
Unresolved: data/lineage_unresolved.csv with (canonical_name, reason, attempted_at).
"""

import csv
import datetime as dt
import os
import time
from pathlib import Path

import duckdb
import requests

from inaturalist_pipeline import _inat_get_with_retry, _INAT_PACE_SECONDS

DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))
UNRESOLVED_CSV = Path(__file__).parent / "lineage_unresolved.csv"
INAT_TAXA_URL = "https://api.inaturalist.org/v1/taxa"


def _ensure_bridge_table(con: duckdb.DuckDBPyConnection) -> None:
    """Create bridge table if it doesn't exist (LIN-03 cache invariant)."""
    con.execute("""
        CREATE TABLE IF NOT EXISTS inaturalist_data.canonical_to_taxon_id (
            canonical_name TEXT PRIMARY KEY,
            taxon_id INTEGER,
            resolved_at TIMESTAMP,
            source TEXT
        )
    """)


def _names_to_resolve(con: duckdb.DuckDBPyConnection, refresh: bool) -> list[str]:
    """FULL OUTER union of canonical names LEFT JOIN bridge, filtered by what's missing.

    When refresh=True, ALSO include canonical_names listed in lineage_unresolved.csv
    (re-attempt previously failed names without disturbing already-resolved bridge rows).
    """
    sql = """
        WITH u AS (
            SELECT DISTINCT canonical_name FROM checklist_data.species
            WHERE canonical_name IS NOT NULL
            UNION
            SELECT DISTINCT canonical_name FROM ecdysis_data.occurrences
            WHERE canonical_name IS NOT NULL
        )
        SELECT u.canonical_name
        FROM u
        LEFT JOIN inaturalist_data.canonical_to_taxon_id b USING (canonical_name)
        WHERE b.canonical_name IS NULL
        ORDER BY u.canonical_name
    """
    names = [r[0] for r in con.execute(sql).fetchall()]
    if refresh and UNRESOLVED_CSV.exists():
        with UNRESOLVED_CSV.open("r", newline="") as f:
            reader = csv.reader(f)
            try:
                next(reader)  # skip header
            except StopIteration:
                return names
            previously_unresolved = {row[0] for row in reader if row}
        # Add previously-unresolved names that are still in the union but absent
        # from the bridge. Already-resolved names are NOT re-attempted
        # (recommendation D-A6 in RESEARCH).
        union_names = {
            r[0]
            for r in con.execute(
                """
            SELECT DISTINCT canonical_name FROM checklist_data.species
            WHERE canonical_name IS NOT NULL
            UNION
            SELECT DISTINCT canonical_name FROM ecdysis_data.occurrences
            WHERE canonical_name IS NOT NULL
        """
            ).fetchall()
        }
        bridge_names = {
            r[0]
            for r in con.execute(
                "SELECT canonical_name FROM inaturalist_data.canonical_to_taxon_id"
            ).fetchall()
        }
        retry = (previously_unresolved & union_names) - bridge_names
        names = sorted(set(names) | retry)
    return names


def _pick_match(results: list[dict], query: str, requested_rank: str) -> dict | None:
    """D-02 ambiguous-match policy. Returns the unique winner or None (= 'ambiguous').

    Filter ladder (stop at first non-empty subset that yields exactly one survivor):
      1. lower(matched_term) == lower(query) OR lower(name) == lower(query)
      2. is_active == true
      3. iconic_taxon_name == 'Insecta'
      4. rank == requested_rank
    """
    q = query.lower()
    survivors = [
        r
        for r in results
        if (r.get("matched_term") or "").lower() == q
        or (r.get("name") or "").lower() == q
    ]
    if not survivors:
        return None
    active = [r for r in survivors if r.get("is_active")]
    if active:
        survivors = active
    insecta = [r for r in survivors if r.get("iconic_taxon_name") == "Insecta"]
    if insecta:
        survivors = insecta
    rank_match = [r for r in survivors if r.get("rank") == requested_rank]
    if rank_match:
        survivors = rank_match
    return survivors[0] if len(survivors) == 1 else None


def _resolve_one(
    con: duckdb.DuckDBPyConnection,
    canonical_name: str,
    unresolved: list[tuple],
) -> None:
    """Resolve a single canonical_name through the rank ladder; UPSERT on success.

    D-03 rank ladder:
      - 1-token name → ['genus']
      - 2-token name → ['species', 'genus']  (genus query uses tokens[0] only)
      - 3+-token name → ['species'] using first 2 tokens (canonicalize() should
        prevent this, but guard defensively)
    """
    tokens = canonical_name.split()
    if len(tokens) == 1:
        rank_ladder = [("genus", tokens[0])]
    elif len(tokens) == 2:
        rank_ladder = [("species", canonical_name), ("genus", tokens[0])]
    else:
        # canonicalize() should have folded to binomial; treat as species lookup.
        rank_ladder = [("species", " ".join(tokens[:2]))]

    last_reason = "404"
    for rank, q in rank_ladder:
        time.sleep(_INAT_PACE_SECONDS)
        try:
            resp = _inat_get_with_retry(
                INAT_TAXA_URL, params={"q": q, "rank": rank}, timeout=30
            )
        except requests.HTTPError:
            last_reason = "api_error"
            continue
        data = resp.json()
        if data.get("total_results", 0) == 0:
            last_reason = "404"
            continue
        match = _pick_match(data.get("results", []), q, rank)
        if match is None:
            last_reason = "ambiguous"
            continue
        con.execute(
            """
            INSERT INTO inaturalist_data.canonical_to_taxon_id
                (canonical_name, taxon_id, resolved_at, source)
            VALUES (?, ?, current_timestamp, ?)
            ON CONFLICT (canonical_name) DO UPDATE SET
                taxon_id = EXCLUDED.taxon_id,
                resolved_at = EXCLUDED.resolved_at,
                source = EXCLUDED.source
            """,
            [canonical_name, match["id"], f"inat_{rank}"],
        )
        return
    unresolved.append(
        (
            canonical_name,
            last_reason,
            dt.datetime.now(dt.UTC).replace(tzinfo=None).isoformat(),
        )
    )


def resolve_taxon_ids(refresh: bool = False) -> None:
    """Phase 77 pipeline step. Imported by data/run.py STEPS."""
    con = duckdb.connect(DB_PATH)
    try:
        _ensure_bridge_table(con)
        names = _names_to_resolve(con, refresh)
        unresolved: list[tuple] = []
        for name in names:
            _resolve_one(con, name, unresolved)
        with UNRESOLVED_CSV.open("w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["canonical_name", "reason", "attempted_at"])
            writer.writerows(unresolved)
        n_resolved = con.execute(
            "SELECT count(*) FROM inaturalist_data.canonical_to_taxon_id"
        ).fetchone()[0]
        print(  # noqa: T201
            f"resolve-taxon-ids: {n_resolved} cached, {len(unresolved)} unresolved "
            f"(see {UNRESOLVED_CSV.name})"
        )
    finally:
        con.close()


if __name__ == "__main__":
    import sys

    resolve_taxon_ids(refresh="--refresh-lineage" in sys.argv)
