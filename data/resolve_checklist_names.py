"""Phase 135 Plan 02 — tiered checklist name resolver.

Resolves verbatim names from checklist_data.checklist_records_full through a
multi-tier cascade:

  1. Slash-compound detection → LCA from taxa.csv.gz (source='slash_lca')
  2. Exact canonical match via inaturalist_data.canonical_to_taxon_id
     (source='exact', confidence=1.0)
  3. Committed synonym seed via occurrence_synonyms / gbif_checklist_synonyms
     (source='synonym_seed', confidence=1.0)
  4. GBIF backbone lookup — refresh-only, baked into gbif_checklist_synonyms.csv
     (source='gbif', confidence=diagnostics.confidence/100)
  5. rapidfuzz fuzzy candidates — review CSV only, never auto-applied
     (source='fuzzy', confidence=score/100)
  6. Unresolved — no tier matched (source='unresolved', confidence=0.0)

Nightly path (refresh=False): zero network calls; reads only committed CSVs.
Refresh path (--refresh-checklist): runs GBIF lookups, writes audit/fuzzy/seed.

Decisions honored: D-01, D-02, D-04, D-05, D-06, D-08
"""

import csv
import gzip
import os
import time
from pathlib import Path

import duckdb

from canonical_name import normalize_scientific_name

# ---------------------------------------------------------------------------
# Module-level path constants
# ---------------------------------------------------------------------------

DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))
AUDIT_CSV = Path(__file__).parent / "checklist_name_resolution_audit.csv"
FUZZY_REVIEW_CSV = Path(__file__).parent / "checklist_fuzzy_review.csv"
GBIF_SEED_CSV = Path(__file__).parent / "dbt" / "seeds" / "gbif_checklist_synonyms.csv"
TAXA_PATH = str(Path(__file__).parent / "raw" / "taxa.csv.gz")

_GBIF_PACE_SECONDS = 0.3

# WR-03: characters that trigger spreadsheet formula evaluation if a CSV cell
# begins with one of them. Curator-facing CSVs are hardened against CSV formula
# injection on write.
_CSV_FORMULA_TRIGGERS = ("=", "+", "-", "@")


def _csv_safe(value: object) -> object:
    """Neutralize CSV formula-injection for a single cell.

    If a string value begins with a spreadsheet formula trigger (=+-@), prefix
    it with a single quote so a spreadsheet treats it as literal text.
    Non-strings (e.g. integer taxon IDs) pass through unchanged.
    """
    if isinstance(value, str) and value.startswith(_CSV_FORMULA_TRIGGERS):
        return "'" + value
    return value


# ---------------------------------------------------------------------------
# LCA helpers
# ---------------------------------------------------------------------------

def _load_anthophila_ancestry(taxa_path: str) -> dict[str, dict]:
    """Load active species/subspecies under Anthophila (ancestor /630955/).

    Returns a mapping of lowercased canonical name →
        {'taxon_id': int, 'ancestry': str}
    Reads taxa.csv.gz (tab-delimited, columns: taxon_id, ancestry, rank_level,
    rank, name, active).
    """
    result: dict[str, dict] = {}
    try:
        with gzip.open(taxa_path, "rt", encoding="utf-8") as fh:
            reader = csv.DictReader(fh, delimiter="\t")
            for row in reader:
                ancestry = row.get("ancestry", "") or ""
                active = str(row.get("active", "")).lower()
                rank = str(row.get("rank", "")).lower()
                if "/630955/" not in ancestry:
                    continue
                if active != "true":
                    continue
                if rank not in ("species", "subspecies"):
                    continue
                name = (row.get("name") or "").strip().lower()
                if not name:
                    continue
                try:
                    taxon_id = int(row["taxon_id"])
                except (KeyError, ValueError):
                    continue
                result[name] = {"taxon_id": taxon_id, "ancestry": ancestry}
    except FileNotFoundError:
        pass
    return result


def compute_lca(name1: str, name2: str, taxa: dict) -> int | None:
    """Compute lowest-common-ancestor taxon_id for two canonical names.

    Uses the full ancestry path (ancestry + '/' + taxon_id). Returns the
    last taxon_id where both paths agree, or None if either name is absent.

    Example:
        angelicus full path: .../50086/606634/270393
        texanus   full path: .../50086/606634/1581466/1581468
        LCA: 606634 (subgenus Agapostemon)
    """
    row1 = taxa.get(name1)
    row2 = taxa.get(name2)
    if row1 is None or row2 is None:
        return None

    path1 = (row1["ancestry"] + "/" + str(row1["taxon_id"])).split("/")
    path2 = (row2["ancestry"] + "/" + str(row2["taxon_id"])).split("/")

    lca_id: str | None = None
    for a, b in zip(path1, path2):
        if a == b:
            lca_id = a
        else:
            break

    return int(lca_id) if lca_id else None


def _split_slash_compound(verbatim_name: str) -> tuple[str, str] | None:
    """Return (binomial1, binomial2) for a slash-compound, or None if not slash.

    Detection is on the RAW verbatim_name BEFORE normalize_scientific_name.
    The slash format is "Genus epithet1/epithet2 [Authority]".
    Returns lowercase binomials: ('genus epithet1', 'genus epithet2').
    """
    if "/" not in verbatim_name:
        return None

    # Strip any authority tail first (everything after the slash epithets).
    # Typical form: "Agapostemon texanus/angelicus Cresson, 1872"
    # We need to extract "genus epithet1/epithet2".
    # Strategy: take tokens up to and including the slash token.
    tokens = verbatim_name.split()
    slash_token_idx = None
    for i, tok in enumerate(tokens):
        if "/" in tok:
            slash_token_idx = i
            break

    if slash_token_idx is None or slash_token_idx < 1:
        return None

    genus = tokens[0].lower()
    slash_token = tokens[slash_token_idx]
    # Could be "epithet1/epithet2" or "epithet1/epithet2Author" — strip authority
    # by only taking the slash part as-is.
    parts = slash_token.split("/")
    if len(parts) != 2:
        return None

    epithet1 = parts[0].strip().lower()
    # epithet2 may have authority stuck on — take only initial lowercase run
    epithet2_raw = parts[1].strip().lower()
    # Strip authority characters (uppercase letters start authority)
    import re
    match = re.match(r"([a-z]+)", epithet2_raw)
    epithet2 = match.group(1) if match else epithet2_raw

    if not epithet1 or not epithet2:
        return None

    return (f"{genus} {epithet1}", f"{genus} {epithet2}")


# ---------------------------------------------------------------------------
# GBIF + rapidfuzz helpers (used in Task 2 refresh path)
# ---------------------------------------------------------------------------

def _gbif_lookup_one(name: str) -> dict:
    """Call GBIF name_backbone for a single canonical name.

    Returns a dict with keys: accepted_canonical, match_type, confidence, usage_key.
    Defensive .get() on all keys (NONE matchType has no 'usage' key).
    """
    import pygbif  # noqa: PLC0415 — lazy import so module importable without pygbif

    time.sleep(_GBIF_PACE_SECONDS)
    try:
        result = pygbif.species.name_backbone(
            scientificName=name,
            kingdom="Animalia",
            verbose=True,
        )
    except Exception:  # noqa: BLE001
        return {
            "accepted_canonical": None,
            "match_type": "ERROR",
            "confidence": 0.0,
            "usage_key": None,
        }

    diag = result.get("diagnostics", {})
    match_type = diag.get("matchType", "NONE")
    confidence = float(diag.get("confidence", 0)) / 100.0
    usage = result.get("usage", {})  # ABSENT when matchType='NONE'
    accepted_canonical = (usage.get("canonicalName") or "").lower() or None
    usage_key = usage.get("key")

    # HIGHERRANK is not a valid species-level resolution
    if match_type in ("NONE", "HIGHERRANK", "ERROR"):
        accepted_canonical = None

    return {
        "accepted_canonical": accepted_canonical,
        "match_type": match_type,
        "confidence": confidence,
        "usage_key": usage_key,
    }


def _generate_fuzzy_candidates(
    query: str,
    candidates: list[str],
    candidate_taxon_ids: dict[str, int],
    score_cutoff: float = 85,
    limit: int = 5,
) -> list[tuple[str, float, int | None]]:
    """Return rapidfuzz candidates for a query name.

    Returns list of (candidate_name, score_0_1, taxon_id_or_None).
    score_cutoff is on 0–100 scale.
    """
    from rapidfuzz import fuzz, process  # noqa: PLC0415

    matches = process.extract(
        query,
        candidates,
        scorer=fuzz.WRatio,
        score_cutoff=score_cutoff,
        limit=limit,
    )
    return [
        (name, score / 100.0, candidate_taxon_ids.get(name))
        for name, score, _idx in matches
    ]


# ---------------------------------------------------------------------------
# Main resolver
# ---------------------------------------------------------------------------

def resolve_checklist_names(refresh: bool = False) -> None:
    """Tiered checklist name resolver. No-op unless refresh=True.

    refresh=False (nightly path): returns immediately, zero network calls.
    refresh=True: runs GBIF backbone lookups for unresolved names, writes
        committed audit/fuzzy/seed CSVs.

    Decisions: D-01, D-02, D-04, D-05, D-06, D-08
    """
    if not refresh:
        return

    # -----------------------------------------------------------------------
    # Load taxa.csv.gz for LCA computation
    # -----------------------------------------------------------------------
    taxa = _load_anthophila_ancestry(TAXA_PATH)

    con = duckdb.connect(DB_PATH)
    try:
        # -------------------------------------------------------------------
        # Query distinct verbatim names
        # -------------------------------------------------------------------
        rows = con.execute("""
            SELECT DISTINCT verbatim_name
            FROM checklist_data.checklist_records_full
            WHERE verbatim_name IS NOT NULL
        """).fetchall()
        verbatim_names = [r[0] for r in rows]

        # -------------------------------------------------------------------
        # Build bridge lookup: canonical_name → taxon_id (exact tier)
        # -------------------------------------------------------------------
        try:
            bridge_rows = con.execute("""
                SELECT canonical_name, taxon_id
                FROM inaturalist_data.canonical_to_taxon_id
                WHERE taxon_id IS NOT NULL
            """).fetchall()
            bridge = {name: tid for name, tid in bridge_rows}
        except Exception:  # noqa: BLE001
            bridge = {}

        # -------------------------------------------------------------------
        # Build synonym seed lookup: synonym → accepted_name
        # -------------------------------------------------------------------
        synonym_map: dict[str, str] = {}

        # Read occurrence_synonyms.csv (curated)
        occ_syn_path = Path(__file__).parent / "dbt" / "seeds" / "occurrence_synonyms.csv"
        if occ_syn_path.exists():
            with occ_syn_path.open(newline="") as f:
                for row in csv.DictReader(f):
                    s = (row.get("synonym") or "").strip()
                    a = (row.get("accepted_name") or "").strip()
                    if s and a:
                        synonym_map[s] = a

        # Read gbif_checklist_synonyms.csv if it exists already
        if GBIF_SEED_CSV.exists():
            with GBIF_SEED_CSV.open(newline="") as f:
                for row in csv.DictReader(f):
                    s = (row.get("synonym") or "").strip()
                    a = (row.get("accepted_name") or "").strip()
                    if s and a and s not in synonym_map:
                        synonym_map[s] = a

        # -------------------------------------------------------------------
        # Build rapidfuzz candidate pool from bridge
        # -------------------------------------------------------------------
        candidate_names = list(bridge.keys())
        candidate_taxon_ids = dict(bridge)

        # -------------------------------------------------------------------
        # Tier cascade — one audit row per distinct verbatim_name
        # -------------------------------------------------------------------
        audit_rows: list[dict] = []
        fuzzy_rows: list[dict] = []
        gbif_seed_rows: list[tuple] = []
        seen_gbif_synonyms: set[str] = set()

        for verbatim in verbatim_names:
            # ----------------------------------------------------------------
            # Tier 1: Slash-compound detection (on raw verbatim, before normalize)
            # ----------------------------------------------------------------
            if "/" in verbatim:
                pair = _split_slash_compound(verbatim)
                lca_taxon_id: int | None = None
                if pair:
                    lca_taxon_id = compute_lca(pair[0], pair[1], taxa)

                if pair:
                    # pair = ("genus ep1", "genus ep2") — _split_slash_compound always
                    # derives a single shared genus (tokens[0]), so the LCA is that genus.
                    # canonical_name: normalized lowercase, slash compound retained (the raw
                    # capitalized form stays in verbatim_name). accepted_canonical_name: the
                    # genus, so it matches resolved_taxon_id (the genus-rank LCA).
                    genus, ep1 = pair[0].split()
                    ep2 = pair[1].split()[1]
                    slash_canonical = f"{genus} {ep1}/{ep2}"
                    slash_accepted = genus
                else:
                    slash_canonical = normalize_scientific_name(verbatim) or verbatim.lower()
                    slash_accepted = ""

                audit_rows.append({
                    "verbatim_name": verbatim,
                    "canonical_name": slash_canonical,
                    "resolved_taxon_id": lca_taxon_id if lca_taxon_id else "",
                    "accepted_canonical_name": slash_accepted,
                    "source": "slash_lca",
                    "confidence": 1.0,
                    "gbif_match_type": "",
                    "notes": f"LCA of {pair[0]} + {pair[1]}" if pair else "slash_lca no match",
                })
                continue

            # Normalize for non-slash names
            canonical = normalize_scientific_name(verbatim)
            if not canonical:
                audit_rows.append({
                    "verbatim_name": verbatim,
                    "canonical_name": "",
                    "resolved_taxon_id": "",
                    "accepted_canonical_name": "",
                    "source": "unresolved",
                    "confidence": 0.0,
                    "gbif_match_type": "",
                    "notes": "normalize_scientific_name returned None",
                })
                continue

            # ----------------------------------------------------------------
            # Tier 2: Exact canonical match
            # ----------------------------------------------------------------
            if canonical in bridge:
                taxon_id = bridge[canonical]
                audit_rows.append({
                    "verbatim_name": verbatim,
                    "canonical_name": canonical,
                    "resolved_taxon_id": taxon_id,
                    "accepted_canonical_name": canonical,
                    "source": "exact",
                    "confidence": 1.0,
                    "gbif_match_type": "",
                    "notes": "",
                })
                continue

            # ----------------------------------------------------------------
            # Tier 3: Synonym seed match
            # ----------------------------------------------------------------
            if canonical in synonym_map:
                accepted = synonym_map[canonical]
                taxon_id = bridge.get(accepted, "")
                audit_rows.append({
                    "verbatim_name": verbatim,
                    "canonical_name": canonical,
                    "resolved_taxon_id": taxon_id,
                    "accepted_canonical_name": accepted,
                    "source": "synonym_seed",
                    "confidence": 1.0,
                    "gbif_match_type": "",
                    "notes": "",
                })
                continue

            # ----------------------------------------------------------------
            # Tier 4: GBIF backbone (refresh path)
            # ----------------------------------------------------------------
            gbif = _gbif_lookup_one(canonical)
            if gbif["accepted_canonical"]:
                accepted = gbif["accepted_canonical"]
                resolved_id = bridge.get(accepted, "")
                source = f"gbif"
                audit_rows.append({
                    "verbatim_name": verbatim,
                    "canonical_name": canonical,
                    "resolved_taxon_id": resolved_id,
                    "accepted_canonical_name": accepted,
                    "source": source,
                    "confidence": gbif["confidence"],
                    "gbif_match_type": gbif["match_type"],
                    "notes": "",
                })
                # Write to GBIF seed (dedup on synonym)
                if canonical not in seen_gbif_synonyms and canonical != accepted:
                    seen_gbif_synonyms.add(canonical)
                    gbif_seed_rows.append((
                        canonical,
                        accepted,
                        f"gbif-backbone:{gbif['usage_key']}",
                        gbif["usage_key"] or "",
                        gbif["match_type"],
                        int(gbif["confidence"] * 100),
                    ))
                continue

            # ----------------------------------------------------------------
            # Tier 5: rapidfuzz fuzzy candidates (review-only, never auto-applied)
            # ----------------------------------------------------------------
            fuzzy_candidates = _generate_fuzzy_candidates(
                canonical, candidate_names, candidate_taxon_ids,
                score_cutoff=85, limit=5,
            )
            if fuzzy_candidates:
                best_name, best_score, best_taxon_id = fuzzy_candidates[0]
                audit_rows.append({
                    "verbatim_name": verbatim,
                    "canonical_name": canonical,
                    "resolved_taxon_id": best_taxon_id or "",
                    "accepted_canonical_name": best_name,
                    "source": "fuzzy",
                    "confidence": best_score,
                    "gbif_match_type": "",
                    "notes": f"rapidfuzz best match: {best_name}",
                })
                for cand_name, cand_score, cand_taxon_id in fuzzy_candidates:
                    fuzzy_rows.append({
                        "verbatim_name": verbatim,
                        "canonical_name": canonical,
                        "fuzzy_candidate": cand_name,
                        "fuzzy_score": cand_score,
                        "fuzzy_candidate_taxon_id": cand_taxon_id or "",
                    })
                continue

            # ----------------------------------------------------------------
            # Tier 6: Unresolved — no tier matched
            # ----------------------------------------------------------------
            audit_rows.append({
                "verbatim_name": verbatim,
                "canonical_name": canonical,
                "resolved_taxon_id": "",
                "accepted_canonical_name": "",
                "source": "unresolved",
                "confidence": 0.0,
                "gbif_match_type": "",
                "notes": "",
            })

    finally:
        con.close()

    # -----------------------------------------------------------------------
    # Write audit CSV (always, even if empty)
    # -----------------------------------------------------------------------
    AUDIT_CSV.parent.mkdir(parents=True, exist_ok=True)
    audit_fieldnames = [
        "verbatim_name", "canonical_name", "resolved_taxon_id",
        "accepted_canonical_name", "source", "confidence",
        "gbif_match_type", "notes",
    ]
    with AUDIT_CSV.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=audit_fieldnames)
        writer.writeheader()
        writer.writerows(
            {k: _csv_safe(v) for k, v in row.items()} for row in audit_rows
        )

    # -----------------------------------------------------------------------
    # Write fuzzy review CSV (always write header)
    # -----------------------------------------------------------------------
    FUZZY_REVIEW_CSV.parent.mkdir(parents=True, exist_ok=True)
    fuzzy_fieldnames = [
        "verbatim_name", "canonical_name", "fuzzy_candidate",
        "fuzzy_score", "fuzzy_candidate_taxon_id",
    ]
    with FUZZY_REVIEW_CSV.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fuzzy_fieldnames)
        writer.writeheader()
        writer.writerows(
            {k: _csv_safe(v) for k, v in row.items()} for row in fuzzy_rows
        )

    # -----------------------------------------------------------------------
    # Write GBIF seed CSV (always write header — D-04 always-write pattern)
    # -----------------------------------------------------------------------
    GBIF_SEED_CSV.parent.mkdir(parents=True, exist_ok=True)
    with GBIF_SEED_CSV.open("w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
            "synonym", "accepted_name", "source",
            "gbif_usage_key", "gbif_match_type", "gbif_confidence",
        ])
        writer.writerows(
            tuple(_csv_safe(v) for v in row) for row in gbif_seed_rows
        )

    resolved_count = sum(1 for r in audit_rows if r["source"] != "unresolved")
    unresolved_count = sum(1 for r in audit_rows if r["source"] == "unresolved")
    print(  # noqa: T201
        f"resolve-checklist-names: {resolved_count} resolved, "
        f"{unresolved_count} unresolved, {len(fuzzy_rows)} fuzzy candidates"
    )


# ---------------------------------------------------------------------------
# Resolution gate
# ---------------------------------------------------------------------------

def check_checklist_resolution_gate() -> None:
    """Fail fast if any checklist name is unresolved (D-04).

    Reads checklist_name_resolution_audit.csv. Hard-fails only on
    source='unresolved' rows (no-match-anywhere). GBIF and fuzzy hits
    satisfy the gate as resolved-pending-promotion.
    """
    import sys  # noqa: PLC0415 — lazy import keeps module importable without side-effects

    rows = list(csv.DictReader(AUDIT_CSV.open(newline="")))
    blocking = [r for r in rows if r.get("source") == "unresolved"]
    if blocking:
        names = ", ".join(r["canonical_name"] for r in blocking[:10])
        sys.exit(
            f"checklist-resolution-gate: {len(blocking)} name(s) have no match "
            f"in any tier.\nOffenders: {names}"
        )
    print(  # noqa: T201
        f"checklist-resolution-gate: OK ({len(rows)} names resolved)"
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys
    resolve_checklist_names(refresh="--refresh-checklist" in sys.argv)
