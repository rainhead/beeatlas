"""Build a WABA-backfill manifest for one iNaturalist collector.

Some collectors write their WSDA catalog/label number in the observation *description*
(often prefixed "OBA"/"WABA") but never fill the "WABA" observation field (field 18116,
"Ecdysis catalog number suffix"). Those observations fall out of the BeeAtlas provisional
path. This tool enumerates a collector's observations, extracts 7/8-digit label numbers
from descriptions, cross-checks them against the local Ecdysis snapshot, and emits a
reviewable manifest of WABA fields to write.

Usage:
    cd data && uv run python curation/waba_backfill/build_manifest.py --user swisschick
    # -> writes curation/waba_backfill/<user>-manifest.csv

Then review the CSV and run write_waba.py to apply the writes.

Rules (locked in phase 158, see ../../.planning/phases/158-*/158-CONTEXT.md):
  - taxon-agnostic: bees + non-bee bycatch (any labeled observation is a collected specimen)
  - label formats: 8-digit YY+6 (year prefix 24/25/26) OR standalone 7-digit (2024 gen, '2xxxxxx')
  - write all format-matching labels; flag ones not yet confirmed in Ecdysis
  - exclude implausible numbers (bad year prefix) — catches museum nums like WSUC00012840
  - never overwrite an existing WABA field
"""
import argparse, csv, json, os, re, time, urllib.request
import duckdb

ANTHOPHILA = 630955
WABA_FIELD_ID = 18116
DIGIT_RUN = re.compile(r"\d+")
HERE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("DB_PATH", os.path.join(HERE, "..", "..", "beeatlas.duckdb"))


def fetch_all(user):
    out, page, total = [], 1, None
    while True:
        params = (f"user_id={user}&per_page=200&page={page}"
                  "&order_by=id&order=asc&quality_grade=any&verifiable=any")
        url = f"https://api.inaturalist.org/v1/observations?{params}"
        req = urllib.request.Request(url, headers={"User-Agent": "beeatlas-waba-curation/1.0"})
        with urllib.request.urlopen(req) as r:
            data = json.load(r)
        if total is None:
            total = data["total_results"]
            print(f"total observations for {user}: {total}")
        res = data["results"]
        if not res:
            break
        out.extend(res)
        if len(out) >= total or len(res) < 200:
            break
        page += 1
        time.sleep(1.0)
    print(f"fetched {len(out)}")
    return out


def labels(o):
    desc = o.get("description") or ""
    seen, uniq = set(), []
    for m in DIGIT_RUN.finditer(desc):
        v = m.group(0)
        if len(v) in (7, 8) and v not in seen:
            seen.add(v); uniq.append(v)
    return uniq


def waba_value(o):
    for ofv in o.get("ofvs", []):
        if ofv.get("field_id") == WABA_FIELD_ID:
            return ofv.get("value")
    return None


def is_bee(o):
    tx = o.get("taxon") or {}
    return ANTHOPHILA in (tx.get("ancestor_ids") or []) or tx.get("id") == ANTHOPHILA


def plausible(l):
    return (len(l) == 8 and l[:2] in ("24", "25", "26")) or (len(l) == 7 and l.startswith("2"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--user", required=True, help="iNat login (used directly as user_id)")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    out_path = args.out or os.path.join(HERE, f"{args.user}-manifest.csv")

    allo = fetch_all(args.user)
    candidates = [o for o in allo if labels(o)]
    cand_labels = sorted({l for o in candidates for l in labels(o)})
    print(f"candidates with a 7/8-digit label: {len(candidates)} (distinct: {len(cand_labels)})")

    # Ecdysis cross-check (batch)
    ecd = {}
    if cand_labels:
        con = duckdb.connect(DB_PATH, read_only=True)
        con.execute("CREATE TEMP TABLE labs(v VARCHAR)")
        con.executemany("INSERT INTO labs VALUES (?)", [[l] for l in cand_labels])
        for cn, suffix, sn, rb in con.execute("""
            SELECT o.catalog_number,
                   regexp_extract(o.catalog_number, '[0-9]+$', 0) AS suffix,
                   o.scientific_name, o.recorded_by
            FROM ecdysis_data.occurrences o
            JOIN labs ON labs.v = regexp_extract(o.catalog_number, '[0-9]+$', 0)
        """).fetchall():
            ecd[suffix] = (cn, sn, rb)
        con.close()
    print(f"labels confirmed in Ecdysis: {len(ecd)} / {len(cand_labels)}")

    rows = []
    for o in candidates:
        labs = labels(o)
        existing = waba_value(o)
        tx = o.get("taxon") or {}
        if len(labs) > 1:
            label, action = "|".join(labs), "REVIEW_multi_label"
        elif not plausible(labs[0]):
            label, action = labs[0], "exclude_non_waba_number"
        elif existing:
            label = labs[0]
            action = "skip_has_waba" if str(existing) == labs[0] else "REVIEW_waba_mismatch"
        else:
            label, action = labs[0], "write"
        hit = ecd.get(labs[0] if len(labs) == 1 else "")
        rows.append({
            "obs_id": o["id"], "taxon": tx.get("name") or "",
            "iconic": tx.get("iconic_taxon_name") or "", "is_bee": is_bee(o),
            "label": label, "existing_waba": existing or "",
            "ecdysis_catalog": hit[0] if hit else "",
            "ecdysis_recordedby": hit[2] if hit else "",
            "ecdysis_confirmed": bool(hit), "action": action,
            "url": f"https://www.inaturalist.org/observations/{o['id']}",
        })

    rows.sort(key=lambda r: (r["action"], r["obs_id"]))
    with open(out_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()) if rows else ["obs_id"])
        w.writeheader(); w.writerows(rows)

    from collections import Counter
    print("\n=== ACTION SUMMARY ===")
    for a, c in Counter(r["action"] for r in rows).most_common():
        print(f"   {a}: {c}")
    writes = [r for r in rows if r["action"] == "write"]
    if writes:
        print(f"\nwrites planned: {len(writes)}")
        print(f"  ecdysis-confirmed: {sum(1 for r in writes if r['ecdysis_confirmed'])}")
        print(f"  unconfirmed (flag): {sum(1 for r in writes if not r['ecdysis_confirmed'])}")
        print(f"  bees: {sum(1 for r in writes if r['is_bee'])} | "
              f"non-bee: {sum(1 for r in writes if not r['is_bee'])}")
        print(f"  7-digit: {sum(1 for r in writes if len(r['label'])==7)} | "
              f"8-digit: {sum(1 for r in writes if len(r['label'])==8)}")
    for tag in ("exclude_non_waba_number", "REVIEW_multi_label", "REVIEW_waba_mismatch"):
        flagged = [r for r in rows if r["action"] == tag]
        if flagged:
            print(f"\n=== {tag} ({len(flagged)}) ===")
            for r in flagged:
                print(f"   obs {r['obs_id']} label={r['label']} {r['iconic']}/{r['taxon']} {r['url']}")
    print(f"\nmanifest written: {out_path}")


if __name__ == "__main__":
    main()
