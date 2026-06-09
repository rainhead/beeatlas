"""Phase 136 — Cross-source deduplication of checklist records vs Ecdysis specimens.

Reads dbt_sandbox.int_dedup_candidates (populated by the dbt build), applies Python-side
collector normalization (_collectors_match), writes dedup_candidate_pairs.csv for curator
review, and enforces a build gate (check_dedup_gate) that fails if any confirmed decision
in dedup_decisions.csv references a pair_key absent from the regenerated candidates.

Steps wired into run.py STEPS in Wave 4 (136-04):
  ("dedup-candidates", write_dedup_candidates)  # DUP-02
  ("dedup-gate", check_dedup_gate)              # DUP-03
"""

import csv
import os
import re
from pathlib import Path

DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))

# Output CSV: all candidate pairs for curator review (DUP-02).
DEDUP_CANDIDATE_CSV = Path(__file__).parent / "dedup_candidate_pairs.csv"

# Committed curator decisions seed (DUP-03). Human-edited; read by check_dedup_gate.
DEDUP_DECISIONS_CSV = Path(__file__).parent / "dbt" / "seeds" / "dedup_decisions.csv"

# D-07: 1.0 km proximity threshold — tunable named constant.
# Any spatial SQL using this threshold must use ST_Distance_Sphere(ST_Point(lat, lon), ...)
# (latitude first) — opposite of ST_Point(lon, lat) used for ST_Within elsewhere.
DEDUP_DISTANCE_THRESHOLD_M = 1000.0

# WR-03: characters that trigger spreadsheet formula evaluation if a CSV cell begins
# with one of them. Collector names / localities flow into dedup_candidate_pairs.csv,
# opened by curators in a spreadsheet — harden against CSV formula injection on write.
_CSV_FORMULA_TRIGGERS = ("=", "+", "-", "@")


def _csv_safe(value: object) -> object:
    """Neutralize CSV formula-injection for a single cell (WR-03).

    If a string value begins with a spreadsheet formula trigger (=+-@), prefix it
    with a single quote so a spreadsheet treats it as literal text. Non-strings
    (e.g. integer IDs) pass through unchanged. Scientific names and collector names
    rarely start with these characters; this guards against crafted or garbage source data.
    """
    if isinstance(value, str) and value.startswith(_CSV_FORMULA_TRIGGERS):
        return "'" + value
    return value


def _normalize_collector(name: str | None) -> frozenset[str]:
    """Normalize a collector string to a frozenset of lowercased tokens (D-05).

    Rules:
    - None / empty string → empty frozenset (NULL collector rows are not collapsed
      together per D-03; they are also ineligible as dedup candidates per D-08).
    - Lowercase the full string.
    - Replace punctuation (non-word, non-space characters) with spaces via re.sub.
    - Collapse whitespace and strip.
    - Split on whitespace; discard empty tokens.
    - Returns frozenset for O(1) set-equality comparison.
    """
    if name is None:
        return frozenset()
    normalized = re.sub(r"[^\w\s]", " ", name.lower())
    normalized = re.sub(r"\s+", " ", normalized).strip()
    if not normalized:
        return frozenset()
    return frozenset(normalized.split())


def _collectors_match(a: str | None, b: str | None) -> bool:
    """Return True if collector strings a and b are a plausible match (D-05).

    Algorithm (exact token-set + initials awareness, NO fuzzy scoring per D-05):
    1. If either argument is None → False (D-08: NULL ineligible).
    2. Normalize both to frozensets of lowercase tokens.
    3. If sets are equal → True.
    4. Initials rule: for the smaller set, every token must either:
       a. appear in the larger set exactly, OR
       b. be a single alphabetic character that is the initial (startswith) of
          some token in the larger set.
       If all tokens in the smaller set satisfy (a) or (b) → True, else → False.

    Examples:
      _collectors_match('J Smith', 'John Smith') → True  (j is initial of john)
      _collectors_match('Smith, J.', 'J. Smith') → True  (token-set equality after
                                                           punctuation strip)
      _collectors_match('A Jones', 'B Jones')   → False (a ≠ initial of b…)
      _collectors_match(None, 'John Smith')     → False (D-08)
    """
    if a is None or b is None:
        return False
    ts_a = _normalize_collector(a)
    ts_b = _normalize_collector(b)
    if ts_a == ts_b:
        return True
    # Initials rule: smaller set must be explainable by the larger set.
    smaller, larger = (ts_a, ts_b) if len(ts_a) <= len(ts_b) else (ts_b, ts_a)
    for tok in smaller:
        if tok in larger:
            continue
        # Single alpha character can match as an initial.
        if len(tok) == 1 and tok.isalpha() and any(t.startswith(tok) for t in larger):
            continue
        return False
    return True


def write_dedup_candidates(con=None) -> int:
    """Query int_dedup_candidates from the dbt sandbox, filter by collector match, write CSV.

    DUP-02: Produces dedup_candidate_pairs.csv with columns:
      pair_key, checklist_ObjectID, ecdysis_id, canonical_name,
      checklist_lat, checklist_lon, ecdysis_lat, ecdysis_lon, distance_m,
      checklist_year, checklist_month, checklist_day, date_quality,
      ecdysis_date, ecdysis_year, ecdysis_month, ecdysis_day,
      checklist_collector, ecdysis_collector

    Applies _csv_safe() to all string cells (WR-03 formula-injection guard).
    D-05: Only pairs where _collectors_match(checklist_collector, ecdysis_collector) is True
    are written — collector filter applied here in Python, not in SQL.
    Returns the number of candidate pairs written.

    con: optional DuckDB connection injection seam. When None (the nightly/run.py
    path) a connection to DB_PATH is opened and the spatial extension loaded. Tests
    pass an in-memory connection pre-seeded with dbt_sandbox.int_dedup_candidates so
    they run on a clean checkout without a dbt build (the SELECT reads the precomputed
    distance_m column and needs no spatial functions itself).

    run.py STEP signature: callable taking no args, returns int.
    """
    import duckdb

    _FIELDNAMES = [
        "pair_key", "checklist_ObjectID", "ecdysis_id", "canonical_name",
        "checklist_lat", "checklist_lon", "ecdysis_lat", "ecdysis_lon", "distance_m",
        "checklist_year", "checklist_month", "checklist_day", "date_quality",
        "ecdysis_date", "ecdysis_year", "ecdysis_month", "ecdysis_day",
        "checklist_collector", "ecdysis_collector",
    ]

    owns_con = con is None
    if owns_con:
        con = duckdb.connect(DB_PATH)
        # int_dedup_candidates was built with ST_Distance_Sphere — ensure spatial is loaded.
        con.execute("INSTALL spatial; LOAD spatial")

    try:
        cur = con.execute("""
            SELECT
                pair_key,
                checklist_ObjectID,
                ecdysis_id,
                canonical_name,
                checklist_lat,
                checklist_lon,
                ecdysis_lat,
                ecdysis_lon,
                distance_m,
                checklist_year,
                checklist_month,
                checklist_day,
                date_quality,
                ecdysis_date,
                ecdysis_year,
                ecdysis_month,
                ecdysis_day,
                checklist_collector,
                ecdysis_collector
            FROM dbt_sandbox.int_dedup_candidates
            ORDER BY canonical_name, checklist_ObjectID, ecdysis_id
        """)
        all_rows = cur.fetchall()
        col_names = [d[0] for d in cur.description]

        count = 0
        with DEDUP_CANDIDATE_CSV.open("w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=_FIELDNAMES)
            writer.writeheader()
            for raw_row in all_rows:
                row = dict(zip(col_names, raw_row))
                # D-05: apply token-set collector filter in Python (not SQL — initials logic)
                if not _collectors_match(row.get("checklist_collector"), row.get("ecdysis_collector")):
                    continue
                # WR-03: formula-injection guard on all string cells
                safe_row = {k: _csv_safe(v) for k, v in row.items()}
                writer.writerow(safe_row)
                count += 1
    finally:
        if owns_con:
            con.close()

    print(f"dedup-candidates: wrote {count} pairs")
    return count


def check_dedup_gate() -> None:
    """Fail fast if any confirmed dedup_decisions row references an absent pair_key (DUP-03).

    Reads DEDUP_DECISIONS_CSV (committed seed) and DEDUP_CANDIDATE_CSV (just written by
    write_dedup_candidates). Any confirmed decision whose pair_key does not appear in the
    regenerated candidates is an orphan — sys.exit() with an actionable message naming
    the orphaned pair_keys and the fix command.

    If all confirmed decisions have live candidates (or there are no confirmed decisions):
    prints "dedup-gate: OK".

    Edge cases:
    - DEDUP_DECISIONS_CSV missing or header-only → OK (no suppressions active).
    - DEDUP_CANDIDATE_CSV missing but decisions exist → sys.exit (candidates must be generated first).

    run.py STEP gate signature: callable taking no args, returns None or sys.exits.
    """
    import sys  # noqa: PLC0415 (lazy import keeps module importable without side-effects)

    if not DEDUP_DECISIONS_CSV.exists():
        print("dedup-gate: OK (no decisions seed — no suppressions active)")  # noqa: T201
        return

    decisions = list(csv.DictReader(DEDUP_DECISIONS_CSV.open(newline="")))
    confirmed = [r for r in decisions if r.get("dedup_status") == "confirmed"]

    if not confirmed:
        rejected = len([r for r in decisions if r.get("dedup_status") == "rejected"])
        print(f"dedup-gate: OK (0 confirmed, {rejected} rejected)")  # noqa: T201
        return

    if not DEDUP_CANDIDATE_CSV.exists():
        sys.exit(
            "dedup-gate: ERROR — dedup_decisions.csv has confirmed entries but "
            "dedup_candidate_pairs.csv is missing. Run the dedup-candidates step first."
        )

    candidate_keys = {row["pair_key"] for row in csv.DictReader(DEDUP_CANDIDATE_CSV.open(newline=""))}
    orphans = [r for r in confirmed if r["pair_key"] not in candidate_keys]

    if orphans:
        keys = ", ".join(r["pair_key"] for r in orphans)
        sys.exit(
            f"dedup-gate: {len(orphans)} confirmed suppression(s) reference pair_keys not in "
            f"current candidates (stale seed?): {keys}\n"
            f"Fix: re-run the dedup-candidates step, then re-confirm the correct pair_keys."
        )

    rejected_count = len(decisions) - len(confirmed)
    print(f"dedup-gate: OK ({len(confirmed)} confirmed, {rejected_count} rejected)")  # noqa: T201
