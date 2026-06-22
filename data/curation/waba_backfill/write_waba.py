"""Apply a WABA-backfill manifest: POST one observation_field_value (field 18116) per
'write' row to the iNaturalist v1 API.

Idempotent / crash-safe: results are appended to <manifest>.results.csv as each row
completes; a re-run skips obs_ids already 'written'. Rate-limited to 1 req/sec (<=60/min)
with exponential backoff on 429/5xx honoring Retry-After (per iNat API guidance).

Writes are performed as the account owning INAT_JWT. Adding observation fields to another
user's observations is permitted by iNat unless that user restricts it.

Usage:
    INAT_JWT=<token from https://www.inaturalist.org/users/api_token> \
        python3 curation/waba_backfill/write_waba.py --manifest curation/waba_backfill/swisschick-manifest.csv
    # add --dry-run to preview without calling the API
"""
import argparse, csv, json, os, sys, time, urllib.request, urllib.error

WABA_FIELD_ID = 18116
UA = "beeatlas-waba-curation/1.0 (rainhead@gmail.com)"
PACE = 1.0
MAX_RETRIES = 5
BACKOFF_BASE = 1.0
JWT = os.environ.get("INAT_JWT", "").strip()


def _call(method, url, body=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"User-Agent": UA, "Content-Type": "application/json"}
    if JWT:
        headers["Authorization"] = JWT
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    for attempt in range(MAX_RETRIES + 1):
        try:
            with urllib.request.urlopen(req) as r:
                txt = r.read().decode()
                return r.status, (json.loads(txt) if txt else None)
        except urllib.error.HTTPError as e:
            if e.code != 429 and e.code < 500:
                return e.code, {"error": e.read().decode()[:300]}
            if attempt == MAX_RETRIES:
                return e.code, {"error": "retries exhausted"}
            wait = BACKOFF_BASE * (2 ** attempt)
            ra = e.headers.get("Retry-After")
            if ra:
                try: wait = max(wait, float(ra))
                except ValueError: pass
            print(f"  HTTP {e.code}; sleeping {wait:.1f}s (retry {attempt+1}/{MAX_RETRIES})")
            time.sleep(wait)
    return 0, {"error": "unreachable"}


def add_waba(obs_id, value):
    body = {"observation_field_value": {
        "observation_id": int(obs_id),
        "observation_field_id": WABA_FIELD_ID,
        "value": str(value),
    }}
    return _call("POST", "https://api.inaturalist.org/v1/observation_field_values", body)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    results_path = args.manifest.rsplit(".csv", 1)[0] + ".results.csv"

    rows = [r for r in csv.DictReader(open(args.manifest)) if r["action"] == "write"]
    done = set()
    if os.path.exists(results_path):
        for r in csv.DictReader(open(results_path)):
            if r.get("result") in ("written", "skip_exists"):
                done.add(str(r["obs_id"]))
    todo = [r for r in rows if str(r["obs_id"]) not in done]
    print(f"{len(rows)} write rows; {len(done)} already done; {len(todo)} to do. "
          f"dry_run={args.dry_run} auth={'yes' if JWT else 'NO'}")
    if not args.dry_run and not JWT:
        print("ERROR: set INAT_JWT to run real writes."); sys.exit(1)

    new_file = not os.path.exists(results_path)
    out = open(results_path, "a", newline="")
    w = csv.DictWriter(out, fieldnames=["obs_id", "label", "result", "http"])
    if new_file:
        w.writeheader(); out.flush()

    counts = {"written": 0, "error": 0, "dry-run": 0}
    for i, r in enumerate(todo, 1):
        oid, label = str(r["obs_id"]), r["label"]
        if args.dry_run:
            print(f"[{i}/{len(todo)}] DRY obs {oid} <- WABA {label}")
            counts["dry-run"] += 1
            continue
        status, data = add_waba(oid, label)
        ok = status in (200, 201)
        res = "written" if ok else "error"
        counts[res] += 1
        print(f"[{i}/{len(todo)}] {'OK ' if ok else 'FAIL'} obs {oid} <- WABA {label} "
              f"(HTTP {status})" + ("" if ok else f"  {data}"))
        w.writerow({"obs_id": oid, "label": label, "result": res, "http": status})
        out.flush()
        time.sleep(PACE)
    out.close()

    print("\n=== RESULT SUMMARY (this run) ===")
    for k, c in counts.items():
        if c: print(f"   {k}: {c}")
    print(f"results: {results_path}")


if __name__ == "__main__":
    main()
