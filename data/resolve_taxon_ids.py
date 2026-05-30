"""Phase 77 — resolve canonical_name → iNat taxon_id, persist as bridge table.

Source SQL: FULL OUTER union of checklist + ecdysis + inat_obs canonical_name LEFT JOIN bridge.
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


def _read_unresolved_csv() -> set[str]:
    """Return the set of canonical_names from lineage_unresolved.csv, or empty set."""
    if not UNRESOLVED_CSV.exists():
        return set()
    with UNRESOLVED_CSV.open("r", newline="") as f:
        reader = csv.reader(f)
        try:
            next(reader)  # skip header
        except StopIteration:
            return set()
        return {row[0] for row in reader if row}


def _names_to_resolve(con: duckdb.DuckDBPyConnection, refresh: bool) -> list[str]:
    """FULL OUTER union of canonical names (checklist + ecdysis + inat_obs) LEFT JOIN bridge, filtered by what's missing.

    Default run: skips names already recorded in lineage_unresolved.csv — they are
    known failures and retrying them nightly wastes ~1s per name with no benefit.

    When refresh=True: include those previously-failed names so they get another
    attempt (useful after iNat taxonomy updates or manual CSV edits).
    """
    sql = """
        WITH u AS (
            SELECT DISTINCT canonical_name FROM checklist_data.species
            WHERE canonical_name IS NOT NULL
            UNION
            SELECT DISTINCT canonical_name FROM ecdysis_data.occurrences
            WHERE canonical_name IS NOT NULL
            UNION
            SELECT DISTINCT canonical_name FROM inat_obs_data.observations
            WHERE canonical_name IS NOT NULL
        )
        SELECT u.canonical_name
        FROM u
        LEFT JOIN inaturalist_data.canonical_to_taxon_id b USING (canonical_name)
        WHERE b.canonical_name IS NULL
        ORDER BY u.canonical_name
    """
    names = [r[0] for r in con.execute(sql).fetchall()]
    previously_unresolved = _read_unresolved_csv()
    if not refresh:
        # Skip known failures on normal runs
        names = [n for n in names if n not in previously_unresolved]
    else:
        # On refresh: also retry previously-failed names still absent from bridge
        bridge_names = {
            r[0]
            for r in con.execute(
                "SELECT canonical_name FROM inaturalist_data.canonical_to_taxon_id"
            ).fetchall()
        }
        retry = previously_unresolved - bridge_names
        names = sorted(set(names) | retry)
    return names


def _pick_match(
    results: list[dict], query: str, requested_rank: str | None
) -> dict | None:
    """D-02 ambiguous-match policy. Returns the unique winner or None (= 'ambiguous').

    Filter ladder (stop at first non-empty subset that yields exactly one survivor):
      1. lower(matched_term) == lower(query) OR lower(name) == lower(query)
      2. is_active == true
      3. iconic_taxon_name == 'Insecta'
      4. rank == requested_rank   (skipped when requested_rank is None — caller did
         not constrain rank server-side and accepts whichever rank the API returns)
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
    if requested_rank is not None:
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

    Rank ladder:
      - 1-token name → [(None, name)]                  (rank unconstrained — accept
        whatever rank iNat returns: family, subfamily, order, genus, etc.)
      - 2-token name → [('species', binomial), (None, tokens[0])]
      - 3+-token name → [('species', first 2 tokens)]  (canonicalize() should fold
        to binomial; guard defensively)

    When the request rank is None, params['rank'] is omitted and `source` is taken
    from the matched result's own `rank` field (e.g. 'inat_family', 'inat_order').
    """
    tokens = canonical_name.split()
    if len(tokens) == 1:
        rank_ladder = [(None, tokens[0])]
    elif len(tokens) == 2:
        rank_ladder = [("species", canonical_name), (None, tokens[0])]
    else:
        rank_ladder = [("species", " ".join(tokens[:2]))]

    last_reason = "404"
    for rank, q in rank_ladder:
        time.sleep(_INAT_PACE_SECONDS)
        params: dict = {"q": q}
        if rank is not None:
            params["rank"] = rank
        try:
            resp = _inat_get_with_retry(INAT_TAXA_URL, params=params, timeout=30)
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
        source = f"inat_{match.get('rank') or rank or 'unknown'}"
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
            [canonical_name, match["id"], source],
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
        taxa_path = str(Path(__file__).parent / "raw/taxa.csv.gz")
        inactive = con.execute(f"""
            SELECT b.canonical_name, b.taxon_id, t.name AS inat_name, t.active
            FROM inaturalist_data.canonical_to_taxon_id b
            LEFT JOIN read_csv('{taxa_path}', header=True) t
                ON CAST(t.taxon_id AS INTEGER) = b.taxon_id
            WHERE t.active = false
            ORDER BY b.canonical_name
        """).fetchall()
        print(  # noqa: T201
            f"resolve-taxon-ids: inactive taxon IDs in bridge: {len(inactive)}"
        )
        for row in inactive:
            print(  # noqa: T201
                f"  inactive: {row[0]} (taxon_id={row[1]}, inat_name={row[2]})"
            )
    finally:
        con.close()


if __name__ == "__main__":
    import sys

    resolve_taxon_ids(refresh="--refresh-lineage" in sys.argv)
