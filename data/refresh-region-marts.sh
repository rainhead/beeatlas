#!/usr/bin/env bash
# Refresh the raw region-mart copies in EXPORT_DIR from the dbt sandbox.
#
# WHY THIS EXISTS (beeatlas-0yv). topology_postprocess.py reads the raw mart from
# EXPORT_DIR and writes a `.clean.geojson` sibling. Before beeatlas-hyq it wrote
# its simplified result back over the raw file IN PLACE, and those files are still
# in the raw slot of every long-lived data directory. Feeding one back through
# -simplify compounds — 3% twice is 0.09% — which is how the published ecoregions
# reached 761 vertices where one honest pass gives 4,674, and how San Juan County,
# an archipelago, came to be published as a single 24-vertex polygon.
#
# topology_postprocess now REFUSES to run on such a file rather than quietly
# making it worse. This is the fix it points at. Run it once per affected data
# directory; after that the raw slot holds real marts and the guard never fires.
#
# It is deliberately NOT called from topology_postprocess: that step's input is
# EXPORT_DIR and the sandbox is stelis's business (one producer per artifact,
# beeatlas-hyq). Crossing that boundary automatically would also mean a genuinely
# corrupt mart gets silently overwritten instead of noticed.
#
# Usage, from the repo root:
#     bash data/refresh-region-marts.sh
#
# Honours EXPORT_DIR (default public/data) and SANDBOX_DIR (default the dbt
# sandbox), so it points at whatever the pipeline on this host points at.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# EXPORT_DIR defaults to the repo's public/data — right for a dev checkout, and
# WRONG on a deployed host, where nightly.sh uses $BASE_DIR/var/export instead. The
# first run of this script on maderas went to the checkout and reported success
# while the directory the nightly actually reads was untouched. So: when a
# deployed-looking export dir exists and EXPORT_DIR was not set explicitly, refuse
# to guess.
DEPLOYED_EXPORT="${BASE_DIR:-/var/www/beeatlas.net}/var/export"
if [[ -z "${EXPORT_DIR:-}" && -d "$DEPLOYED_EXPORT" ]]; then
    echo "ERROR: this host has a deployed export dir at" >&2
    echo "         $DEPLOYED_EXPORT" >&2
    echo "       and EXPORT_DIR is unset, so the default would be the checkout's" >&2
    echo "         $REPO_ROOT/public/data" >&2
    echo "       which the nightly does not read. Set EXPORT_DIR explicitly:" >&2
    echo >&2
    echo "         EXPORT_DIR=$DEPLOYED_EXPORT bash data/refresh-region-marts.sh" >&2
    exit 1
fi

EXPORT_DIR="${EXPORT_DIR:-$REPO_ROOT/public/data}"
SANDBOX_DIR="${SANDBOX_DIR:-$SCRIPT_DIR/dbt/target/sandbox}"

MARTS=(counties.geojson ecoregions.geojson wilderness.geojson)

echo "sandbox: $SANDBOX_DIR"
echo "export:  $EXPORT_DIR"
echo

missing=0
for name in "${MARTS[@]}"; do
    [[ -f "$SANDBOX_DIR/$name" ]] || { echo "ERROR: $SANDBOX_DIR/$name not found" >&2; missing=1; }
done
if [[ $missing -eq 1 ]]; then
    echo >&2
    echo "The dbt sandbox has no region marts. Run 'bash data/dbt/run.sh build' first —" >&2
    echo "copying a stale sandbox over the export dir would just move the problem." >&2
    exit 1
fi

# Check the SOURCE before trusting it. The first cut of this script validated only
# the destination, which meant it could report "was a previously-simplified file ->
# copied" in reassuring green while moving an equally bad file sideways. A sandbox
# copy can be stale or itself a former output; `_meta` catches the latter exactly,
# and the vertex count catches the former by being obviously too small.
for name in "${MARTS[@]}"; do
    if grep -q '"_meta"' "$SANDBOX_DIR/$name"; then
        echo "ERROR: $SANDBOX_DIR/$name carries _meta — the SANDBOX copy is itself a" >&2
        echo "       previously-simplified file, not a dbt mart. Copying it would move the" >&2
        echo "       problem rather than fix it. Re-run 'bash data/dbt/run.sh build' first." >&2
        exit 1
    fi
done

# Ring positions across every feature — the unit simplification destroys, and the
# only number that makes "is this mart plausible?" answerable at a glance.
count_vertices() {
    python3 - "$1" <<'PY'
import json, sys
o = json.load(open(sys.argv[1]))
n = 0
for f in o.get("features") or []:
    g = (f or {}).get("geometry") or {}
    c = g.get("coordinates") or []
    if g.get("type") == "Polygon":
        n += sum(len(r) for r in c)
    elif g.get("type") == "MultiPolygon":
        n += sum(len(r) for p in c for r in p)
print(n)
PY
}

for name in "${MARTS[@]}"; do
    src="$SANDBOX_DIR/$name"
    dst="$EXPORT_DIR/$name"
    # _meta is written only by topology_postprocess._inject_meta, and only onto its
    # OUTPUT — so its presence here is the exact tell that this slot holds a
    # previously simplified file rather than a mart.
    if [[ -f "$dst" ]] && grep -q '"_meta"' "$dst"; then
        state="was a previously-simplified file"
    elif [[ -f "$dst" ]]; then
        state="already a raw mart"
    else
        state="absent"
    fi
    cp "$src" "$dst"
    printf '  %-22s %-32s -> %9s vertices, %10s bytes\n' \
        "$name" "$state" "$(count_vertices "$dst")" "$(wc -c < "$dst" | tr -d ' ')"
done

cat <<'NOTE'

Done. Read the vertex counts above before re-running the pipeline — they are the
mart's real detail, and a mart that is too coarse cannot be rescued downstream.

For reference, a host whose geographies sources are current produces roughly:

    counties.geojson     ~20,700 vertices   (~510 KB)  Census cb_2024_us_county_500k
    ecoregions.geojson  ~102,700 vertices   (~4.0 MB)  CEC NA_CEC_Eco_Level3

An order of magnitude below those means the SOURCE is the problem, not this step:
the geographies loader caches its downloads (data/geographies_pipeline.py), and a
DuckDB table loaded before a source URL changed keeps the old geometry until that
loader runs again. Re-run the geographies step, then dbt build, then this script.
NOTE
