#!/usr/bin/env bash
# Does the image build what the reference host built? (beeatlas-3je9's parity check,
# kept for beeatlas-f21l's trial and the cutover.)
#
#   fly/parity.sh <image> <state dir> <epoch> <commit>
#
# <state dir> holds one published build's state, copied from the reference host after
# its nightly: beeatlas.duckdb, export/ (that run's), raw/taxa.csv.gz and
# raw/taxa_cache.json, and notes.db (a consistent snapshot, as backup_notes.py takes).
# <epoch> is that build's SOURCE_DATE_EPOCH (the build-epoch of its line in
# stelis/publish.log) and <commit> the beeatlas commit it ran, so the stamps the
# artifacts carry are the reference's own.
#
# The image rebuilds everything from dbt onward (Stelis's --downstream dbt-build) on a
# copy of that database, with no network, seeded with the reference's export, and
# every file is compared. The loaders are left out on purpose: they read live sources,
# which have moved since the reference ran, so they would compare the sources, not the
# image. What a difference may honestly be is narrow, and each is checked rather than
# assumed:
#   - a geojson identical but for its _meta stamp;
#   - occurrences.db whose rows are identical: SQLite writes its library's version
#     into the header, and the image's Python bundles its own SQLite;
#   - the .br/.gz siblings of a file above, each decompressing to exactly its own
#     side's copy of that file.
# Anything else is unexplained. Exit status: the number of unexplained files (capped
# at 100); 0 means the image reproduces the reference.

set -euo pipefail

image=${1:?usage: parity.sh <image> <state dir> <epoch> <commit>}
state=${2:?usage: parity.sh <image> <state dir> <epoch> <commit>}
epoch=${3:?usage: parity.sh <image> <state dir> <epoch> <commit>}
commit=${4:?usage: parity.sh <image> <state dir> <epoch> <commit>}
state=$(cd "$state" && pwd)
for f in beeatlas.duckdb export raw/taxa.csv.gz raw/taxa_cache.json notes.db; do
    [[ -e "$state/$f" ]] || { echo "parity.sh: $state has no $f" >&2; exit 100; }
done

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
v=$work/vol
mkdir -p "$v"/{var/stelis,var/baseline,htdocs,raw,ecdysis-zip,geography-cache,burke-cache,cache,site,dbt-target,dlt,notes,caddy,log,home,uv-cache}
ln -s /home/app/.duckdb "$v/home/.duckdb"
cp "$state/beeatlas.duckdb" "$v/var/"
cp -r "$state/export" "$v/var/export"
cp "$state/raw/taxa.csv.gz" "$state/raw/taxa_cache.json" "$v/raw/"
cp "$state/notes.db" "$v/notes/notes.db"
chmod -R u+rwX,go-rwx "$v"

echo "rebuilding from dbt onward in $image (no network, epoch $epoch, commit ${commit:0:12})..."
docker run --rm --network none --user "$(id -u):$(id -g)" -v "$v:/data" \
    -e HOME=/data/home -e UV_CACHE_DIR=/data/uv-cache \
    -e SOURCE_DATE_EPOCH="$epoch" -e GITHUB_SHA="$commit" \
    "$image" bash -c 'cd /app && bash scripts/fetch-data.sh --downstream dbt-build --all' \
    > "$work/build.log" 2>&1 || { tail -20 "$work/build.log" >&2; echo "parity.sh: the build failed" >&2; exit 100; }
grep -E '^— ' "$work/build.log" || true

chmod -R a+rX "$state/export" "$v/var/export"
# -i: the comparison is the heredoc on stdin. Without it Python reads an empty script
# and exits 0, a pass that compared nothing.
docker run -i --rm --network none -v "$state/export:/ref:ro" -v "$v/var/export:/img:ro" \
    --entrypoint /app/data/.venv/bin/python "$image" - <<'PY'
import gzip, hashlib, json, os, sqlite3, subprocess, sys
ref, img = "/ref", "/img"

def files(root):
    return {os.path.relpath(os.path.join(d, f), root)
            for d, _, fs in os.walk(root) for f in fs}

def digest(p):
    h = hashlib.sha256()
    with open(p, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()

def explain(rel):
    a, b = os.path.join(ref, rel), os.path.join(img, rel)
    if rel.endswith(".geojson"):
        ja, jb = json.load(open(a)), json.load(open(b))
        ja.pop("_meta", None)
        jb.pop("_meta", None)
        if ja == jb:
            return "identical but for the _meta stamp"
    if rel == "occurrences.db":
        dump = lambda p: list(sqlite3.connect(f"file:{p}?mode=ro", uri=True).iterdump())
        if dump(a) == dump(b):
            return "rows identical; the SQLite library version in the header differs"
    return None

rf, imf = files(ref), files(img)
only = sorted(rf ^ imf)
differ = sorted(r for r in rf & imf if digest(os.path.join(ref, r)) != digest(os.path.join(img, r)))
explained = {r: explain(r) for r in differ if not r.startswith("compressed/")}
bases = {r for r, why in explained.items() if why}
unexplained = [r for r, why in explained.items() if not why]
# compressed/<name>-<hash12>.<br|gz> is the sibling of <name>, named for its content's
# hash: when <name> differs explicably, its siblings differ too, or exist under a
# different name on each side. Each one counts as explained only if it decompresses to
# exactly its own side's <name>, so a truncated or stale sibling is still caught.
sibling_of = lambda r: r.split("/", 1)[1].rsplit("-", 1)[0]

def decompresses_to_base(rel):
    roots = [root for root, present in ((ref, rf), (img, imf)) if rel in present]
    return all(decompresses_to_base_on(root, rel) for root in roots)

def decompresses_to_base_on(root, rel):
    path, base = os.path.join(root, rel), os.path.join(root, sibling_of(rel))
    try:
        if rel.endswith(".gz"):
            data = gzip.open(path).read()
        elif rel.endswith(".br"):  # no brotli module here; node's zlib has it
            data = subprocess.run(
                ["node", "-e", "process.stdout.write(require('zlib').brotliDecompressSync(require('fs').readFileSync(process.argv[1])))", path],
                capture_output=True, check=True).stdout
        else:
            return False
        return data == open(base, "rb").read()
    except Exception:
        return False

siblings = [r for r in differ + only
            if r.startswith("compressed/") and sibling_of(r) in bases and decompresses_to_base(r)]
unexplained += [r for r in differ + only if r.startswith("compressed/") and r not in siblings and r in differ]
unexplained += [r for r in only if r not in siblings]

print(f"{len(rf & imf) - len(differ)} of {len(rf | imf)} files byte-identical")
for r, why in sorted(explained.items()):
    if why:
        print(f"  explained   {r}: {why}")
if siblings:
    print(f"  explained   {len(siblings)} compressed siblings of the files above")
for r in sorted(unexplained):
    print(f"  UNEXPLAINED {r}{' (in only one of the two)' if r in only else ''}")
sys.exit(min(len(unexplained), 100))
PY
