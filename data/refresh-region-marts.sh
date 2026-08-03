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
    printf '  %-22s %-32s -> %s bytes\n' "$name" "$state" "$(wc -c < "$dst" | tr -d ' ')"
done

echo
echo "Done. Re-run the pipeline; topology_postprocess now logs vertices in and out."
echo "Expect ecoregions 102,699 -> 4,674 and counties 20,657 -> 20,657."
