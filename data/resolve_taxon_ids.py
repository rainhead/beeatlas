"""Phase 77 — resolve canonical_name → iNat taxon_id, persist as bridge table.

Source SQL: FULL OUTER union of checklist + ecdysis + inat_obs canonical_name LEFT JOIN bridge.
Pacing + retry: reuses _inat_get_with_retry from inaturalist_pipeline.
Unresolved: data/lineage_unresolved.csv with (canonical_name, reason, attempted_at).

Offline resolution paths (debug nightly-resolution-gate, 2026-06-07):
  - Curated overrides (curated_taxon_ids.csv): direct canonical_name -> taxon_id, applied
    BEFORE the API path. Handles names the iNat /v1/taxa search cannot resolve (Latin gender
    variants, subspecies-only names, junior synonyms absent from iNat at species rank).
  - Genus fallback (taxa.csv.gz): for 1-token genus-only names the API reports as
    ambiguous/404 (many bee genera have a same-named active subgenus, so the search returns
    >=2 survivors -> ambiguous). Resolves offline via the same rank='genus' + active + Animalia
    filter as the stg_inat__genus_taxon_ids dbt model. Zero API calls, deterministic.
"""

import csv
import datetime as dt
import os
import time
from pathlib import Path

import duckdb
import requests

from inaturalist_pipeline import _inat_get_with_retry, _INAT_PACE_SECONDS

# The nightly pipeline (data/nightly.sh) runs with DB_PATH=/tmp/beeatlas.duckdb. A manual
# `uv run python resolve_taxon_ids.py --refresh-lineage` from the data/ directory WITHOUT
# DB_PATH set defaults to data/beeatlas.duckdb (local dev DB), which silently targets the
# WRONG database — its bridge UPSERTs then never reach the nightly DB (debug
# nightly-resolution-gate, Cause 3). resolve_taxon_ids() prints the resolved DB_PATH at
# startup so an operator can see at a glance which database a manual run is mutating.
DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))
UNRESOLVED_CSV = Path(__file__).parent / "lineage_unresolved.csv"
INAT_TAXA_URL = "https://api.inaturalist.org/v1/taxa"
AUTO_SYNONYMS_CSV = Path(__file__).parent / "dbt/seeds/auto_synonyms.csv"
INACTIVE_UNRESOLVED_CSV = Path(__file__).parent / "inactive_unresolved.csv"
INAT_TAXA_ID_URL = "https://api.inaturalist.org/v1/taxa/{}"

# Local iNat Open Data taxa dump (downloaded by the taxa-download STEP). Same file the
# stg_inat__genus_taxon_ids dbt model reads. Used by the offline genus fallback below.
TAXA_CSV_PATH = Path(__file__).parent / "raw/taxa.csv.gz"

# Curator-confirmed direct canonical_name -> taxon_id overrides (committed, diffable seed).
# Applied before the API path; see _load_curated_overrides.
CURATED_TAXON_IDS_CSV = Path(__file__).parent / "dbt/seeds/curated_taxon_ids.csv"

# WR-05: defensive bounds on the paced per-taxon detail loop in
# generate_inactive_remaps(). There are 0 inactive taxa today, so these caps only
# trip on an anomaly (e.g. a detection-query regression flooding the loop, or a
# sustained iNat outage). At 1s/taxon the cap also bounds nightly API time.
_INACTIVE_REMAP_MAX_TAXA = 500            # hard ceiling on per-run detail fetches
_INACTIVE_REMAP_MAX_CONSECUTIVE_FAILS = 10  # circuit-breaker on a hard iNat outage

# Non-bee bycatch rows in the WABA provisional dataset (confirmed via taxa.csv.gz ancestry
# check: Cicindela pugetana, Cleridae, Encopognathus have no Anthophila ancestry).
# These names cannot resolve through the iNat bridge (which covers only Anthophila taxa).
# D-09: they are REPORTED by the gate (not silently dropped) so new bycatch surfaces.
KNOWN_NON_BEES = {"cicindela pugetana", "cleridae", "encopognathus"}

# WR-03: characters that trigger spreadsheet formula evaluation if a CSV cell
# begins with one of them. inat_name / successor name are third-party iNat data
# that flows into curator-facing triage CSVs (the intended human workflow opens
# these in a spreadsheet), so harden against CSV formula injection on write.
_CSV_FORMULA_TRIGGERS = ("=", "+", "-", "@")


def _csv_safe(value: object) -> object:
    """Neutralize CSV formula-injection for a single cell (WR-03).

    If a string value begins with a spreadsheet formula trigger (=+-@), prefix it
    with a single quote so a spreadsheet treats it as literal text. Non-strings
    (e.g. integer taxon IDs) pass through unchanged. Bee scientific names never
    start with these characters, so this is a no-op in practice and only defends
    against a crafted / garbage iNat API response.
    """
    if isinstance(value, str) and value.startswith(_CSV_FORMULA_TRIGGERS):
        return "'" + value
    return value


def check_resolution_gate() -> None:
    """Fail fast if any bee canonical_name is unresolved before dbt build (D-02).

    Reads lineage_unresolved.csv (written by the resolve-taxon-ids step).
    Any row whose canonical_name is NOT in KNOWN_NON_BEES is a blocking bee name:
    exits non-zero with an actionable message naming the offenders and the fix command.
    If only KNOWN_NON_BEES rows remain, prints an OK line reporting the excluded count
    (D-09: excluded rows are reported, not silently dropped).
    """
    import sys  # noqa: PLC0415 (lazy import keeps module importable without side-effects)

    rows_as_dicts = list(csv.DictReader(UNRESOLVED_CSV.open(newline="")))
    blocking = [r for r in rows_as_dicts if r["canonical_name"] not in KNOWN_NON_BEES]
    if blocking:
        names = ", ".join(r["canonical_name"] for r in blocking)
        # debug nightly-resolution-gate (Part B): the suggested command MUST name the
        # nightly database explicitly. A bare `uv run python resolve_taxon_ids.py
        # --refresh-lineage` defaults to data/beeatlas.duckdb and silently mutates the
        # wrong DB. DB_PATH={DB_PATH} echoes whatever DB this gate is checking, so
        # following the gate's own advice always targets the same database.
        sys.exit(
            f"resolution-gate: {len(blocking)} bee name(s) unresolved before dbt build. "
            f"Fix with: DB_PATH={DB_PATH} uv run python resolve_taxon_ids.py --refresh-lineage\n"
            f"Offenders: {names}"
        )
    print(  # noqa: T201
        f"resolution-gate: OK ({len(rows_as_dicts)} known non-bee rows excluded)"
    )


def generate_inactive_remaps() -> None:
    """Detect inactive bridge taxon IDs, auto-remap 1-successor cases (ITR-01/ITR-02).

    - Reads bridge LEFT JOIN taxa.csv.gz filtering to inactive rows (header=True only,
      no columns= so DuckDB auto-infers active as BOOLEAN — Pitfall 2).
    - For each inactive taxon: GET /v1/taxa/{id} for current_synonymous_taxon_ids.
    - Exactly 1 successor: lookup name in taxa.csv.gz; write row to auto_synonyms.csv
      + UPSERT bridge (D-10); absent successor -> triage reason=successor_not_in_taxa_csv.
    - 0 successors -> triage reason=no_successor.
    - >=2 successors -> triage reason=split.
    - Always writes auto_synonyms.csv with at least a header row (D-04).
    - Always overwrites inactive_unresolved.csv (stale empty file cannot mask new rows).
    """
    import datetime as _dt

    con = duckdb.connect(DB_PATH)
    # Computed from __file__ at call time (not the module-level TAXA_CSV_PATH constant)
    # so the inactive-remap unit tests' __file__ monkeypatch keeps redirecting this read.
    taxa_path = str(Path(__file__).parent / "raw/taxa.csv.gz")
    try:
        inactive = con.execute(f"""
            SELECT b.canonical_name, b.taxon_id, t.name AS inat_name
            FROM inaturalist_data.canonical_to_taxon_id b
            LEFT JOIN read_csv('{taxa_path}', header=True) t
                ON CAST(t.taxon_id AS INTEGER) = b.taxon_id
            WHERE t.active = false
            ORDER BY b.canonical_name
        """).fetchall()

        auto_rows: list[tuple[str, str, str]] = []  # (synonym, accepted_name, source)
        triage_rows: list[dict] = []
        transient_failures = 0  # CR-01: surfaced as a warning, never blocks the gate
        seen_synonyms: set[str] = set()  # WR-02: guard the auto_synonyms.synonym unique test
        consecutive_fails = 0  # WR-05: circuit-breaker on a sustained iNat outage

        # WR-05: cap the number of per-taxon detail fetches. 0 inactive taxa today,
        # so this only trips on an anomaly; the remainder is left untouched (bridge
        # rows persist) and re-attempted next run.
        if len(inactive) > _INACTIVE_REMAP_MAX_TAXA:
            print(  # noqa: T201
                f"inactive-remap: WARNING {len(inactive)} inactive taxa exceeds cap "
                f"{_INACTIVE_REMAP_MAX_TAXA}; processing first {_INACTIVE_REMAP_MAX_TAXA} "
                f"this run, remainder retried next run"
            )
            inactive = inactive[:_INACTIVE_REMAP_MAX_TAXA]

        for canonical_name, inactive_taxon_id, inat_name in inactive:
            # WR-05: stop issuing further paced requests once iNat is clearly down,
            # so a hard outage fails fast rather than burning ~1s/taxon to no effect.
            if consecutive_fails >= _INACTIVE_REMAP_MAX_CONSECUTIVE_FAILS:
                print(  # noqa: T201
                    f"inactive-remap: WARNING {consecutive_fails} consecutive API "
                    f"failures; circuit-breaker tripped, abandoning remaining taxa "
                    f"this run (will retry next run)"
                )
                break

            time.sleep(_INAT_PACE_SECONDS)
            try:
                resp = _inat_get_with_retry(
                    INAT_TAXA_ID_URL.format(inactive_taxon_id),
                    params={},
                    timeout=30,
                )
            except requests.HTTPError:
                # CR-01: a transient/infrastructure API failure (5xx, rate-limit
                # storm — after _inat_get_with_retry's own retry budget) is NOT one
                # of the three sanctioned BLOCKING reasons (no_successor / split /
                # successor_not_in_taxa_csv per D-06). Do NOT write a blocking
                # triage row that would hard-fail the whole nightly build with an
                # unactionable "add to occurrence_synonyms.csv" instruction. Leave
                # the inactive bridge row untouched so it is naturally re-attempted
                # next run; warn loudly and skip it for this run.
                transient_failures += 1
                consecutive_fails += 1
                print(  # noqa: T201
                    f"inactive-remap: WARNING transient API failure for "
                    f"{canonical_name} (taxon_id={inactive_taxon_id}); "
                    f"skipping this run, will retry next run"
                )
                continue

            results = resp.json().get("results", [])
            if not results:
                # CR-01: an empty results array means iNat did not return the taxon
                # detail this run — treat as a transient infrastructure hiccup, not a
                # sanctioned blocking reason. Skip and re-attempt next run.
                transient_failures += 1
                consecutive_fails += 1
                print(  # noqa: T201
                    f"inactive-remap: WARNING empty API response for "
                    f"{canonical_name} (taxon_id={inactive_taxon_id}); "
                    f"skipping this run, will retry next run"
                )
                continue

            # A usable response resets the circuit-breaker (WR-05).
            consecutive_fails = 0

            # Normalize: None (active taxon) or [] (no successor) both map to []
            successor_ids = results[0].get("current_synonymous_taxon_ids") or []

            if len(successor_ids) == 1:
                # D-09: look up successor name in local taxa.csv.gz
                row = con.execute(f"""
                    SELECT name FROM read_csv('{taxa_path}', header=True)
                    WHERE CAST(taxon_id AS INTEGER) = ?
                      AND active = true
                """, [successor_ids[0]]).fetchone()

                if row is None:
                    triage_rows.append({
                        "canonical_name": canonical_name,
                        "inactive_taxon_id": inactive_taxon_id,
                        "inat_name": inat_name,
                        "reason": "successor_not_in_taxa_csv",
                        "attempted_at": _dt.datetime.now(_dt.UTC).replace(tzinfo=None).isoformat(),
                    })
                    continue

                successor_name = row[0].lower().strip()

                # WR-02: the dbt seed enforces a `unique` test on
                # auto_synonyms.synonym. The synonym key is canonical_name (the
                # bridge PK, so distinct per row) but guard defensively against a
                # duplicate synonym key reaching the seed — a duplicate would abort
                # the entire dbt build. Triage the collision instead of emitting a
                # second row, so the build survives and a human can resolve it.
                if canonical_name in seen_synonyms:
                    triage_rows.append({
                        "canonical_name": canonical_name,
                        "inactive_taxon_id": inactive_taxon_id,
                        "inat_name": inat_name,
                        "reason": "duplicate_synonym_key",
                        "attempted_at": _dt.datetime.now(_dt.UTC).replace(tzinfo=None).isoformat(),
                    })
                    continue
                seen_synonyms.add(canonical_name)

                source = f"inat-inactive-remap:{inactive_taxon_id}"
                auto_rows.append((canonical_name, successor_name, source))

                # D-10: upsert lower(successor_name) -> successor_taxon_id into bridge
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
                    [successor_name, successor_ids[0], source],
                )

            else:
                reason = "no_successor" if len(successor_ids) == 0 else "split"
                triage_rows.append({
                    "canonical_name": canonical_name,
                    "inactive_taxon_id": inactive_taxon_id,
                    "inat_name": inat_name,
                    "reason": reason,
                    "attempted_at": _dt.datetime.now(_dt.UTC).replace(tzinfo=None).isoformat(),
                })

        # D-04: always write header, even when auto_rows is empty.
        # WR-03: sanitize each cell against CSV formula injection on write.
        AUTO_SYNONYMS_CSV.parent.mkdir(parents=True, exist_ok=True)
        with AUTO_SYNONYMS_CSV.open("w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["synonym", "accepted_name", "source"])
            writer.writerows(tuple(_csv_safe(v) for v in r) for r in auto_rows)

        with INACTIVE_UNRESOLVED_CSV.open("w", newline="") as f:
            fieldnames = ["canonical_name", "inactive_taxon_id", "inat_name", "reason", "attempted_at"]
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(
                {k: _csv_safe(v) for k, v in r.items()} for r in triage_rows
            )

        print(  # noqa: T201
            f"inactive-remap: {len(auto_rows)} auto-remapped, {len(triage_rows)} unresolved"
            + (f", {transient_failures} transient API failures (will retry next run)"
               if transient_failures else "")
        )
    finally:
        con.close()


def check_inactive_gate() -> None:
    """Fail fast if any inactive bridge taxon has no auto-resolution (D-05/ITR-02).

    Reads inactive_unresolved.csv (written by the inactive-remap step).
    The gate blocks ONLY on the three sanctioned blocking reasons (D-06):
    no_successor, split, successor_not_in_taxa_csv. There is no KNOWN_NON_BEES-style
    exclusion set (D-07): every such row is a genuine taxonomic dead-end that a human
    must resolve by adding an entry to occurrence_synonyms.csv (the only sanctioned
    exit). Transient API failures (CR-01) are never written to this file — they are
    surfaced as warnings by inactive-remap and re-attempted next run — so they cannot
    couple pipeline liveness to iNat API uptime. Any unexpected reason value is treated
    as blocking (fail-closed) so a future producer bug cannot silently bypass the gate.
    If no blocking rows, prints an OK line.
    """
    import sys  # noqa: PLC0415 (lazy import keeps module importable without side-effects)

    # D-06: every reason inactive-remap writes to this file is a genuine taxonomic
    # dead-end (no_successor / split / successor_not_in_taxa_csv) — transient API
    # failures are NOT written here (CR-01), so every present row is blocking.
    rows = list(csv.DictReader(INACTIVE_UNRESOLVED_CSV.open(newline="")))
    if rows:
        names = ", ".join(r["canonical_name"] for r in rows)
        sys.exit(
            f"inactive-gate: {len(rows)} inactive taxon ID(s) with no auto-resolution. "
            f"Fix by adding entries to occurrence_synonyms.csv\n"
            f"Offenders: {names}"
        )
    print(  # noqa: T201
        "inactive-gate: OK (0 unresolved inactive taxa)"
    )


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


def _load_curated_overrides(con: duckdb.DuckDBPyConnection) -> int:
    """UPSERT curator-confirmed canonical_name -> taxon_id rows into the bridge.

    debug nightly-resolution-gate (Part C). These names cannot be resolved by the iNat
    /v1/taxa search (Latin gender variants like 'lasioglossum aspilurus', subspecies-only
    names like 'anthidiellum robertsoni', junior synonyms absent at species rank like
    'osmia phaceliae'). Reading them into the bridge BEFORE the API path means the
    `LEFT JOIN ... WHERE b.canonical_name IS NULL` filter in _names_to_resolve excludes
    them, so they never reach the API or the unresolved CSV / resolution-gate.

    Source CSV is curated_taxon_ids.csv (also a committed dbt seed). Returns the count
    applied. Idempotent: ON CONFLICT updates in place, so re-running is a no-op on data.
    A missing file is tolerated (returns 0) so the resolver still runs in minimal test
    environments that don't ship the seed.
    """
    if not CURATED_TAXON_IDS_CSV.exists():
        return 0
    applied = 0
    with CURATED_TAXON_IDS_CSV.open("r", newline="") as f:
        for row in csv.DictReader(f):
            canonical_name = (row.get("canonical_name") or "").strip().lower()
            taxon_id_raw = (row.get("taxon_id") or "").strip()
            if not canonical_name or not taxon_id_raw:
                continue
            con.execute(
                """
                INSERT INTO inaturalist_data.canonical_to_taxon_id
                    (canonical_name, taxon_id, resolved_at, source)
                VALUES (?, ?, current_timestamp, 'curated')
                ON CONFLICT (canonical_name) DO UPDATE SET
                    taxon_id = EXCLUDED.taxon_id,
                    resolved_at = EXCLUDED.resolved_at,
                    source = EXCLUDED.source
                """,
                [canonical_name, int(taxon_id_raw)],
            )
            applied += 1
    return applied


def _resolve_genus_from_taxa_csv(
    con: duckdb.DuckDBPyConnection, genus_name: str
) -> int | None:
    """Resolve a genus-only canonical_name to its iNat genus taxon_id, offline.

    debug nightly-resolution-gate (Part A). Many bee genera (Bombus, Halictus,
    Lasioglossum, Megachile, Osmia, Ceratina, ...) have BOTH an active genus-rank taxon
    AND an identically-named active subgenus-rank taxon in iNat. The /v1/taxa search
    then returns >=2 survivors for the bare genus query and _pick_match returns None
    ('ambiguous'). This fallback resolves the genus deterministically from the local
    taxa.csv.gz dump using the SAME filter as the stg_inat__genus_taxon_ids dbt model:
    rank='genus' AND active='true' AND Animalia ancestry (kingdom taxon 1), then require
    exactly one match (HAVING COUNT(*)=1) to exclude cross-phylum homonyms. Returns the
    taxon_id, or None if the genus isn't uniquely resolvable (file absent, 0 matches, or
    a homonym collision) — in which case the caller falls through to the unresolved CSV.
    """
    if not TAXA_CSV_PATH.exists():
        return None
    row = con.execute(
        """
        WITH animal_genera AS (
            SELECT lower(name) AS genus_name, taxon_id::INTEGER AS taxon_id
            FROM read_csv(
                ?,
                delim = chr(9),
                header = true,
                compression = 'gzip',
                columns = {
                    'taxon_id': 'BIGINT',
                    'ancestry': 'VARCHAR',
                    'rank_level': 'BIGINT',
                    'rank': 'VARCHAR',
                    'name': 'VARCHAR',
                    'active': 'VARCHAR'
                }
            )
            WHERE rank = 'genus'
              AND active = 'true'
              AND list_contains(string_split(ancestry, '/'), '1')  -- kingdom = Animalia
              AND lower(name) = ?
        )
        SELECT ANY_VALUE(taxon_id) AS taxon_id
        FROM animal_genera
        GROUP BY genus_name
        HAVING COUNT(*) = 1  -- exclude cross-phylum homonyms (keeps genus resolution unique)
        """,
        [str(TAXA_CSV_PATH), genus_name],
    ).fetchone()
    return row[0] if row else None


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
            UNION
            SELECT DISTINCT accepted_name AS canonical_name FROM dbt_sandbox.occurrence_synonyms
            WHERE accepted_name IS NOT NULL
            UNION
            SELECT DISTINCT lower(trim(
                CASE WHEN position(' ' IN trim(taxon__name)) > 0
                     THEN split_part(trim(taxon__name), ' ', 1)
                          || ' ' || split_part(trim(taxon__name), ' ', 2)
                     ELSE trim(taxon__name)
                END
            )) AS canonical_name
            FROM inaturalist_waba_data.observations
            WHERE taxon__name IS NOT NULL
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

    Offline genus fallback (debug nightly-resolution-gate, Part A): if a 1-token
    (genus-only) name fails the API path (ambiguous/404 — common for bee genera that
    share a name with an active subgenus), resolve it from taxa.csv.gz before giving up.
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

    # debug nightly-resolution-gate (Part A): offline genus fallback. For a genus-only
    # (1-token) name the API could not resolve, try taxa.csv.gz before recording it as
    # unresolved. Resolves all 39 same-named-subgenus bee genera with zero API calls.
    if len(tokens) == 1:
        genus_taxon_id = _resolve_genus_from_taxa_csv(con, tokens[0])
        if genus_taxon_id is not None:
            con.execute(
                """
                INSERT INTO inaturalist_data.canonical_to_taxon_id
                    (canonical_name, taxon_id, resolved_at, source)
                VALUES (?, ?, current_timestamp, 'taxa_csv_genus')
                ON CONFLICT (canonical_name) DO UPDATE SET
                    taxon_id = EXCLUDED.taxon_id,
                    resolved_at = EXCLUDED.resolved_at,
                    source = EXCLUDED.source
                """,
                [canonical_name, genus_taxon_id],
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
    # debug nightly-resolution-gate (Part B): echo the target DB so a manual run can't
    # silently mutate the wrong database without the operator noticing.
    print(f"resolve-taxon-ids: DB_PATH={DB_PATH}")  # noqa: T201
    con = duckdb.connect(DB_PATH)
    try:
        _ensure_bridge_table(con)
        # Part C: apply curator overrides first so curated names are already bridged and
        # excluded from the API path (and thus from the unresolved CSV / gate).
        n_curated = _load_curated_overrides(con)
        if n_curated:
            print(f"resolve-taxon-ids: applied {n_curated} curated taxon_id override(s)")  # noqa: T201
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
