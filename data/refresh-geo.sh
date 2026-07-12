#!/usr/bin/env bash
# Geo-only redeploy: rebuild counties.geojson + ecoregions.geojson and push
# to S3 + invalidate CloudFront. Skips the data pipelines (iNat, Ecdysis,
# anti-entropy, dbt models outside the geo marts) — use when only the
# boundary geometry pipeline has changed and the rest of the DB state is fine.
#
# Assumes /tmp/beeatlas.duckdb already exists from a prior nightly.sh run.
# If it doesn't, this script will fail loudly — pull state first with
# nightly.sh, then this is the fast iteration path.
#
# Total wall time on maderas: ~1 minute (vs ~10 for full nightly).
#
# Usage: bash data/refresh-geo.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUCKET="${BUCKET:-beeatlasstack-sitebucket397a1860-h5dtjzkld3yv}"
DISTRIBUTION_ID="${DISTRIBUTION_ID:-E3SAI2PQ8FN0E7}"
DB_PATH="${DB_PATH:-/tmp/beeatlas.duckdb}"
EXPORT_DIR="${EXPORT_DIR:-/tmp/beeatlas-export}"
AWS_PROFILE="${AWS_PROFILE:-beeatlas}"

if [[ ! -f "$DB_PATH" ]]; then
    echo "ERROR: $DB_PATH not found. Run bash data/nightly.sh first to pull state from S3." >&2
    exit 1
fi

mkdir -p "$EXPORT_DIR"
export DB_PATH EXPORT_DIR

cd "$SCRIPT_DIR"

# 1. Reload geographies (idempotent; re-downloads only on URL change thanks to
#    the .url sidecar marker — see geographies_pipeline._download).
echo "--- reloading geographies into $DB_PATH ---"
uv run python geographies_pipeline.py

# 2. Build just the two geo marts.
echo "--- dbt build: counties_geo + ecoregions_geo ---"
bash dbt/run.sh build --select counties_geo ecoregions_geo

# 3. Copy sandbox outputs to EXPORT_DIR (mirrors what run.py's _run_dbt_build does).
cp "$SCRIPT_DIR/dbt/target/sandbox/counties.geojson" "$EXPORT_DIR/counties.geojson"
cp "$SCRIPT_DIR/dbt/target/sandbox/ecoregions.geojson" "$EXPORT_DIR/ecoregions.geojson"

# 4. Run mapshaper cleanup + _meta provenance injection.
echo "--- topology-postprocess ---"
uv run python topology_postprocess.py

# 5. Upload to S3 with content-type application/json (not application/geo+json)
# so CloudFront's auto-compression covers these files. AWS's compress allowlist
# isn't configurable and doesn't include the geo+json subtype.
#
# topology_postprocess writes the cleaned <name>.clean.geojson (beeatlas-hyq) and
# leaves the raw mart copy untouched; upload the CLEANED file (simplified + _meta
# provenance) to the stable /data/<name>.geojson path, not the raw copy.
echo "--- uploading to s3://$BUCKET/data/ ---"
for f in counties ecoregions; do
    aws --profile "$AWS_PROFILE" s3 cp --no-progress \
        "$EXPORT_DIR/$f.clean.geojson" "s3://$BUCKET/data/$f.geojson" \
        --content-type application/json
done

# 6. Invalidate CloudFront paths.
echo "--- invalidating CloudFront ---"
aws --profile "$AWS_PROFILE" cloudfront create-invalidation \
    --distribution-id "$DISTRIBUTION_ID" \
    --paths "/data/counties.geojson" "/data/ecoregions.geojson" \
    --query "Invalidation.Id" --output text

echo "=== geo refresh complete ==="
echo "Verify deployed provenance: curl https://beeatlas.net/data/counties.geojson | jq ._meta"
