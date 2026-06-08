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

    Rules (implementation in Wave 2, 136-02):
    - Strip and lowercase the full string.
    - Split on whitespace and punctuation (re.split).
    - Expand single-letter initials: 'J' matches any 'john', 'james', etc. token that
      starts with 'j' (initials are length-1 alpha tokens).
    - Remove empty tokens.
    - Returns frozenset for O(1) set-equality comparison.

    None / empty string → empty frozenset (NULL collector rows are not collapsed together
    per D-03; they are also ineligible as dedup candidates per D-05).
    """
    raise NotImplementedError("_normalize_collector: implemented in Wave 2 (136-02)")


def _collectors_match(a: str | None, b: str | None) -> bool:
    """Return True if collector strings a and b are a plausible match (D-05).

    Uses _normalize_collector on each side, then checks if either normalized token-set
    is a subset of the other (allowing partial name vs. full name, or initial vs. given name).

    None on either side → False (no collector info → no match assertion possible).

    Implementation in Wave 2 (136-02).
    """
    raise NotImplementedError("_collectors_match: implemented in Wave 2 (136-02)")


def write_dedup_candidates() -> int:
    """Query int_dedup_candidates from the dbt sandbox, filter by collector match, write CSV.

    DUP-02: Produces dedup_candidate_pairs.csv with columns:
      pair_key, checklist_ObjectID, ecdysis_id, canonical_name,
      checklist_lat, checklist_lon, ecdysis_lat, ecdysis_lon, distance_m,
      checklist_year, checklist_month, checklist_day, date_quality,
      ecdysis_date, ecdysis_year, ecdysis_month, ecdysis_day,
      checklist_collector, ecdysis_collector

    Applies _csv_safe() to all string cells (WR-03).
    Returns the number of candidate pairs written.

    run.py STEP signature: callable taking no args, returns int.
    Implementation in Wave 3 (136-03).
    """
    raise NotImplementedError("write_dedup_candidates: implemented in Wave 3 (136-03)")


def check_dedup_gate() -> None:
    """Fail fast if any confirmed dedup_decisions row references an absent pair_key (DUP-03).

    Reads DEDUP_DECISIONS_CSV (committed seed) and DEDUP_CANDIDATE_CSV (just written by
    write_dedup_candidates). Any confirmed decision whose pair_key does not appear in the
    regenerated candidates is an orphan — sys.exit() with an actionable message naming
    the orphaned pair_keys and the fix command.

    If all confirmed decisions have live candidates (or there are no confirmed decisions):
    prints "dedup-gate: OK".

    run.py STEP gate signature: callable taking no args, returns None or sys.exits.
    Implementation in Wave 4 (136-04).
    """
    raise NotImplementedError("check_dedup_gate: implemented in Wave 4 (136-04)")
